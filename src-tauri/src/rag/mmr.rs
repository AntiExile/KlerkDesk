use std::collections::HashMap;

/// A candidate chunk retrieved from LanceDB, carrying its embedding vector
/// alongside the text and metadata needed for context assembly.
pub struct CandidateChunk {
    pub text: String,
    pub file_path: String,
    pub vector: Vec<f32>,
    /// Raw distance score from LanceDB (lower = more similar for L2).
    pub _distance: f32,
}

/// Cosine similarity between two vectors.
///
/// Because our embeddings are already L2-normalised in [`super::embed::Embedder`],
/// cosine similarity is equivalent to the dot product.
#[inline]
fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    debug_assert_eq!(a.len(), b.len(), "vectors must have equal length");
    a.iter().zip(b.iter()).map(|(x, y)| x * y).sum()
}

/// Maximal Marginal Relevance (MMR) selection.
///
/// Given a `query_vec` and a pool of `candidates`, greedily selects `k` chunks
/// that balance **relevance** (similarity to the query) and **diversity**
/// (dissimilarity to already-selected chunks).
///
/// The trade-off is controlled by `lambda`:
/// - `lambda = 1.0` → pure relevance (equivalent to top-k)
/// - `lambda = 0.0` → pure diversity
/// - `lambda = 0.7` → recommended default (70 % relevance, 30 % diversity)
///
/// A per-file hard cap of `max_per_file` prevents any single document from
/// monopolising the context window, which is important for B2B corpora with
/// repetitive boilerplate.
pub fn select_mmr(
    query_vec: &[f32],
    mut candidates: Vec<CandidateChunk>,
    k: usize,
    lambda: f32,
    max_per_file: usize,
) -> Vec<CandidateChunk> {
    if candidates.is_empty() {
        return Vec::new();
    }

    let k = k.min(candidates.len());

    // Pre-compute query similarity for every candidate
    let query_sims: Vec<f32> = candidates
        .iter()
        .map(|c| cosine_similarity(query_vec, &c.vector))
        .collect();

    let mut selected_indices: Vec<usize> = Vec::with_capacity(k);
    let mut remaining: Vec<usize> = (0..candidates.len()).collect();

    // Track how many chunks we've selected per file_path
    let mut file_counts: HashMap<&str, usize> = HashMap::new();

    while selected_indices.len() < k && !remaining.is_empty() {
        let mut best_idx_in_remaining: Option<usize> = None;
        let mut best_mmr_score = f32::NEG_INFINITY;

        for (pos, &cand_idx) in remaining.iter().enumerate() {
            // Enforce per-file hard cap
            let fp = candidates[cand_idx].file_path.as_str();
            if let Some(&count) = file_counts.get(fp) {
                if count >= max_per_file {
                    continue;
                }
            }

            let relevance = query_sims[cand_idx];

            // Max similarity to any already-selected chunk
            let max_sim_to_selected = if selected_indices.is_empty() {
                0.0
            } else {
                selected_indices
                    .iter()
                    .map(|&sel_idx| {
                        cosine_similarity(&candidates[cand_idx].vector, &candidates[sel_idx].vector)
                    })
                    .fold(f32::NEG_INFINITY, f32::max)
            };

            let mmr_score = lambda * relevance - (1.0 - lambda) * max_sim_to_selected;

            if mmr_score > best_mmr_score {
                best_mmr_score = mmr_score;
                best_idx_in_remaining = Some(pos);
            }
        }

        match best_idx_in_remaining {
            Some(pos) => {
                let cand_idx = remaining.swap_remove(pos);
                let fp = candidates[cand_idx].file_path.as_str();
                *file_counts.entry(fp).or_insert(0) += 1;
                selected_indices.push(cand_idx);
            }
            // All remaining candidates are capped out — stop early
            None => break,
        }
    }

    // Sort selected indices so we can drain from `candidates` without index
    // invalidation. We drain in reverse order.
    selected_indices.sort_unstable();

    // Extract the selected candidates, preserving their MMR-chosen order.
    // We first collect them into a map keyed by original index, then rebuild
    // the output in selection order.
    let selection_order: Vec<usize> = selected_indices.clone();

    // Pull out selected candidates by draining from the back
    let mut extracted: HashMap<usize, CandidateChunk> = HashMap::with_capacity(k);
    for &idx in selected_indices.iter().rev() {
        extracted.insert(idx, candidates.swap_remove(idx));
    }

    // Return in the order they were selected by MMR (most relevant first)
    selection_order
        .into_iter()
        .filter_map(|idx| extracted.remove(&idx))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_candidate(text: &str, file_path: &str, vector: Vec<f32>) -> CandidateChunk {
        CandidateChunk {
            text: text.to_string(),
            file_path: file_path.to_string(),
            vector,
            _distance: 0.0,
        }
    }

    #[test]
    fn test_cosine_similarity_identical() {
        let a = vec![1.0, 0.0, 0.0];
        let b = vec![1.0, 0.0, 0.0];
        assert!((cosine_similarity(&a, &b) - 1.0).abs() < 1e-6);
    }

    #[test]
    fn test_cosine_similarity_orthogonal() {
        let a = vec![1.0, 0.0, 0.0];
        let b = vec![0.0, 1.0, 0.0];
        assert!((cosine_similarity(&a, &b)).abs() < 1e-6);
    }

    #[test]
    fn test_mmr_diversity() {
        // Query is close to [1,0,0]
        let query = vec![1.0, 0.0, 0.0];

        // Three candidates from the same file, all very similar to query
        let c1 = make_candidate("chunk1", "/file_a.pdf", vec![0.99, 0.1, 0.0]);
        let c2 = make_candidate("chunk2", "/file_a.pdf", vec![0.98, 0.15, 0.0]);
        let c3 = make_candidate("chunk3", "/file_a.pdf", vec![0.97, 0.2, 0.0]);

        // One candidate from a different file, somewhat relevant
        let c4 = make_candidate("chunk4", "/file_b.pdf", vec![0.7, 0.5, 0.5]);

        let candidates = vec![c1, c2, c3, c4];
        let selected = select_mmr(&query, candidates, 3, 0.7, 5);

        // All 3 should be selected, and the diverse one from file_b should appear
        assert_eq!(selected.len(), 3);
        let paths: Vec<&str> = selected.iter().map(|c| c.file_path.as_str()).collect();
        assert!(paths.contains(&"/file_b.pdf"), "MMR should include the diverse candidate");
    }

    #[test]
    fn test_mmr_per_file_cap() {
        let query = vec![1.0, 0.0, 0.0];

        // 6 candidates from the same file
        let candidates: Vec<CandidateChunk> = (0..6)
            .map(|i| {
                make_candidate(
                    &format!("chunk{}", i),
                    "/same_file.pdf",
                    vec![0.99 - (i as f32 * 0.01), 0.1, 0.0],
                )
            })
            .collect();

        // With max_per_file=3, we should only get 3 even though k=5
        let selected = select_mmr(&query, candidates, 5, 0.7, 3);
        assert_eq!(selected.len(), 3);
    }

    #[test]
    fn test_mmr_empty_candidates() {
        let query = vec![1.0, 0.0];
        let selected = select_mmr(&query, vec![], 5, 0.7, 5);
        assert!(selected.is_empty());
    }
}
