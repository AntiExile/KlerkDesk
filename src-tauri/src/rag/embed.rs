use std::path::{Path, PathBuf};
use std::io::Write;

use candle_core::{Device, Tensor, IndexOp};
use candle_nn::VarBuilder;
use candle_transformers::models::bert::{BertModel, Config, DTYPE};
use tokenizers::Tokenizer;

pub struct Embedder {
    model: BertModel,
    tokenizer: Tokenizer,
    device: Device,
}

impl Embedder {
    pub async fn new(app_data_dir: PathBuf, resource_dir: Option<&Path>) -> Result<Self, String> {
        let (tokenizer_path, config_path, weights_path) = match Self::find_local_model_dir(&app_data_dir, resource_dir) {
            Some(dir) => {
                println!("[Terra] Using offline local embedding model from: {:?}", dir);
                (dir.join("tokenizer.json"), dir.join("config.json"), dir.join("model.safetensors"))
            }
            None => {
                println!("[Terra] Offline embedding model not found locally; attempting download...");
                let cache_dir = app_data_dir.join("hf_cache");
                std::fs::create_dir_all(&cache_dir)
                    .map_err(|e| format!("Failed to create cache dir: {}", e))?;

                let repo_url = "https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/resolve/main";

                let tokenizer_filename = cache_dir.join("tokenizer.json");
                Self::download_file(&format!("{}/tokenizer.json", repo_url), &tokenizer_filename).await
                    .map_err(|e| format!("Failed to download tokenizer.json (offline/air-gapped mode requires local files in {:?}): {}", cache_dir, e))?;

                let config_filename = cache_dir.join("config.json");
                Self::download_file(&format!("{}/config.json", repo_url), &config_filename).await
                    .map_err(|e| format!("Failed to download config.json (offline/air-gapped mode requires local files in {:?}): {}", cache_dir, e))?;

                let weights_filename = cache_dir.join("model.safetensors");
                Self::download_file(&format!("{}/model.safetensors", repo_url), &weights_filename).await
                    .map_err(|e| format!("Failed to download model.safetensors (offline/air-gapped mode requires local files in {:?}): {}", cache_dir, e))?;

                (tokenizer_filename, config_filename, weights_filename)
            }
        };

        println!("[Terra] Loading tokenizer from: {:?}", tokenizer_path);
        let mut tokenizer = Tokenizer::from_file(&tokenizer_path)
            .map_err(|e| format!("Failed to parse tokenizer from {:?}: {}", tokenizer_path, e))?;

        // Setup padding so we can batch inputs
        let padding = tokenizers::PaddingParams {
            strategy: tokenizers::PaddingStrategy::BatchLongest,
            ..Default::default()
        };
        tokenizer.with_padding(Some(padding));

        println!("[Terra] Loading config from: {:?}", config_path);
        let config_str = std::fs::read_to_string(&config_path)
            .map_err(|e| format!("Failed to read config file {:?}: {}", config_path, e))?;
        let config: Config = serde_json::from_str(&config_str)
            .map_err(|e| format!("Failed to parse config JSON from {:?}: {}", config_path, e))?;

        println!("[Terra] Loading model weights from: {:?}", weights_path);
        let device = Device::Cpu;
        let vb = unsafe {
            VarBuilder::from_mmaped_safetensors(&[weights_path.clone()], DTYPE, &device)
                .map_err(|e| format!("Failed to mmap safetensors weights from {:?}: {}", weights_path, e))?
        };

        let model = BertModel::load(vb, &config)
            .map_err(|e| format!("Failed to build model: {}", e))?;

        println!("[Terra] Embedding model initialized successfully.");

        Ok(Self {
            model,
            tokenizer,
            device,
        })
    }

    fn find_local_model_dir(app_data_dir: &Path, resource_dir: Option<&Path>) -> Option<PathBuf> {
        let mut candidates = Vec::new();

        // 1. Explicit environment variable
        if let Ok(env_path) = std::env::var("TERRA_EMBEDDING_MODEL_DIR") {
            if !env_path.trim().is_empty() {
                candidates.push(PathBuf::from(env_path));
            }
        }

        // 2. Tauri application bundle resource directory (Production packaged)
        if let Some(res) = resource_dir {
            candidates.push(res.join("resources").join("embedding_model"));
            candidates.push(res.join("embedding_model"));
            candidates.push(res.to_path_buf());
        }

        // 3. User app data directory
        candidates.push(app_data_dir.join("resources").join("embedding_model"));
        candidates.push(app_data_dir.join("embedding_model"));
        candidates.push(app_data_dir.join("hf_cache"));

        // 4. Working directory / Development relative paths
        candidates.push(PathBuf::from("src-tauri/resources/embedding_model"));
        candidates.push(PathBuf::from("resources/embedding_model"));
        if let Ok(cwd) = std::env::current_dir() {
            candidates.push(cwd.join("resources").join("embedding_model"));
            candidates.push(cwd.join("src-tauri").join("resources").join("embedding_model"));
        }

        for candidate in candidates {
            if candidate.exists()
                && candidate.join("tokenizer.json").is_file()
                && candidate.join("config.json").is_file()
                && candidate.join("model.safetensors").is_file()
            {
                return Some(candidate);
            }
        }

        None
    }

    async fn download_file(url: &str, dest: &PathBuf) -> Result<(), String> {
        if dest.exists() {
            return Ok(());
        }
        let res = reqwest::get(url).await.map_err(|e| format!("Failed to download {}: {}", url, e))?;
        if !res.status().is_success() {
            return Err(format!("Failed to download {}: HTTP {}", url, res.status()));
        }
        let bytes = res.bytes().await.map_err(|e| format!("Failed to read bytes from {}: {}", url, e))?;
        let mut file = std::fs::File::create(dest).map_err(|e| format!("Failed to create file {:?}: {}", dest, e))?;
        file.write_all(&bytes).map_err(|e| format!("Failed to write to file {:?}: {}", dest, e))?;
        Ok(())
    }

    /// Generates embeddings for a batch of text chunks.
    pub fn embed_batch(&self, chunks: &[String]) -> Result<Vec<Vec<f32>>, String> {
        if chunks.is_empty() {
            return Ok(Vec::new());
        }

        let tokens = self
            .tokenizer
            .encode_batch(chunks.to_vec(), true)
            .map_err(|e| format!("Failed to tokenize: {}", e))?;

        let token_ids: Vec<Vec<u32>> = tokens.iter().map(|t| t.get_ids().to_vec()).collect();

        // Convert to Tensor
        let max_len = token_ids.iter().map(|v| v.len()).max().unwrap_or(0);
        let batch_size = token_ids.len();

        let mut flat_ids = Vec::with_capacity(batch_size * max_len);
        for mut ids in token_ids {
            let pad_len = max_len - ids.len();
            flat_ids.append(&mut ids);
            flat_ids.extend(vec![0; pad_len]); // pad with 0s
        }

        let token_ids = Tensor::from_vec(flat_ids, (batch_size, max_len), &self.device)
            .map_err(|e| e.to_string())?;
        
        // BertModel requires token_type_ids, usually all 0 for single sequences
        let token_type_ids = token_ids.zeros_like().map_err(|e| e.to_string())?;

        let embeddings = self
            .model
            .forward(&token_ids, &token_type_ids, None)
            .map_err(|e| format!("Forward pass failed: {}", e))?;

        // We use mean pooling over the sequence length.
        // For all-MiniLM-L6-v2, sentence embeddings are typically mean pooled.
        // embeddings shape: (batch_size, seq_len, hidden_size)
        // We can just sum over seq_len and divide by seq_len, or use the CLS token.
        // Let's use the CLS token (first token of each sequence) for simplicity and performance,
        // though mean pooling with attention mask is more accurate.
        
        let cls_embeddings = embeddings
            .i((.., 0, ..)) // take the 0-th token for all batches
            .map_err(|e| e.to_string())?;

        // Normalize the embeddings
        let sums = cls_embeddings
            .sqr()
            .map_err(|e| e.to_string())?
            .sum_keepdim(1)
            .map_err(|e| e.to_string())?
            .sqrt()
            .map_err(|e| e.to_string())?;
            
        let normalized = cls_embeddings
            .broadcast_div(&sums)
            .map_err(|e| e.to_string())?;

        let embeddings_vec = normalized
            .to_vec2::<f32>()
            .map_err(|e| format!("Failed to extract embedding data: {}", e))?;

        Ok(embeddings_vec)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_offline_embedder_local_load() {
        let app_data_dir = PathBuf::from("resources");
        let resource_dir = PathBuf::from("resources");
        let embedder = Embedder::new(app_data_dir, Some(&resource_dir)).await;
        assert!(embedder.is_ok(), "Embedder should load from local resources: {:?}", embedder.err());
        let embedder = embedder.unwrap();
        let chunks = vec!["Terra local assistant test sentence.".to_string()];
        let embeddings = embedder.embed_batch(&chunks);
        assert!(embeddings.is_ok());
        let emb = embeddings.unwrap();
        assert_eq!(emb.len(), 1);
        assert_eq!(emb[0].len(), 384);
    }
}
