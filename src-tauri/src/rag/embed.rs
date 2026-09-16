use std::path::PathBuf;
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
    pub async fn new(app_data_dir: PathBuf) -> Result<Self, String> {
        let cache_dir = app_data_dir.join("hf_cache");
        println!("[Terra] HF Cache Dir (for air-gapped preload): {:?}", cache_dir);
        std::fs::create_dir_all(&cache_dir).map_err(|e| format!("Failed to create cache dir: {}", e))?;

        let repo_url = "https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/resolve/main";

        println!("[Terra] Loading tokenizer...");
        let tokenizer_filename = cache_dir.join("tokenizer.json");
        Self::download_file(&format!("{}/tokenizer.json", repo_url), &tokenizer_filename).await?;
        
        println!("[Terra] Loading config...");
        let config_filename = cache_dir.join("config.json");
        Self::download_file(&format!("{}/config.json", repo_url), &config_filename).await?;
            
        println!("[Terra] Loading model weights...");
        let weights_filename = cache_dir.join("model.safetensors");
        Self::download_file(&format!("{}/model.safetensors", repo_url), &weights_filename).await?;

        let config: Config = serde_json::from_str(
            &std::fs::read_to_string(&config_filename).map_err(|e| e.to_string())?,
        ).map_err(|e| e.to_string())?;

        let mut tokenizer = Tokenizer::from_file(&tokenizer_filename)
            .map_err(|e| format!("Failed to parse tokenizer: {}", e))?;
            
        // Setup padding so we can batch inputs
        let padding = tokenizers::PaddingParams {
            strategy: tokenizers::PaddingStrategy::BatchLongest,
            ..Default::default()
        };
        tokenizer.with_padding(Some(padding));

        let device = Device::Cpu;
        let vb = unsafe {
            VarBuilder::from_mmaped_safetensors(&[weights_filename], DTYPE, &device)
                .map_err(|e| format!("Failed to load weights: {}", e))?
        };

        let model = BertModel::load(vb, &config)
            .map_err(|e| format!("Failed to build model: {}", e))?;

        Ok(Self {
            model,
            tokenizer,
            device,
        })
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
