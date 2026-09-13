use std::fs;
use std::path::Path;
use std::sync::Arc;
use uuid::Uuid;

use lancedb::arrow::arrow_array::{FixedSizeListArray, Float32Array, RecordBatch, StringArray};
use lancedb::arrow::arrow_schema::{DataType, Field, Schema};
use lancedb::connection::Connection;
use text_splitter::TextSplitter;

use super::embed::Embedder;

/// Process a single file, chunk it, embed it, and insert into LanceDB.
pub async fn process_file(
    file_path: &Path,
    embedder: &Embedder,
    db_conn: &Connection,
) -> Result<(), String> {
    let ext = file_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    let text = match ext.as_str() {
        "txt" | "md" | "csv" | "json" => {
            fs::read_to_string(file_path).map_err(|e| format!("Failed to read text file: {}", e))?
        }
        "pdf" => pdf_extract::extract_text(file_path)
            .map_err(|e| format!("Failed to parse PDF: {}", e))?,
        _ => {
            return Err(format!("Unsupported file extension: {}", ext));
        }
    };

    if text.trim().is_empty() {
        return Ok(());
    }

    // Split text into chunks. all-MiniLM-L6-v2 handles up to 512 tokens.
    // For simplicity, we'll split by characters/words to roughly 1000 characters
    // with a 100 character overlap. 
    let splitter = TextSplitter::new(1000);
    let chunks: Vec<String> = splitter.chunks(&text).map(|s| s.to_string()).collect();

    if chunks.is_empty() {
        return Ok(());
    }

    println!("[MundusAI] Embedding {} chunks for {:?}", chunks.len(), file_path);

    // Embed the chunks
    // We can batch this, but for now we'll do it in chunks of 32 to avoid massive memory spikes
    let mut all_embeddings = Vec::new();
    for chunk_batch in chunks.chunks(32) {
        let embeddings = embedder.embed_batch(chunk_batch)?;
        all_embeddings.extend(embeddings);
    }

    // Prepare Arrow Arrays for LanceDB
    let mut ids = Vec::new();
    let mut paths = Vec::new();
    
    for _ in 0..chunks.len() {
        ids.push(Uuid::new_v4().to_string());
        paths.push(file_path.to_string_lossy().to_string());
    }

    let id_array = Arc::new(StringArray::from(ids));
    let path_array = Arc::new(StringArray::from(paths));
    let text_array = Arc::new(StringArray::from(chunks));

    // Flatten embeddings for Float32Array
    let flat_embeddings: Vec<f32> = all_embeddings.into_iter().flatten().collect();
    let float_array = Float32Array::from(flat_embeddings);
    
    // Create FixedSizeListArray
    let field = Arc::new(Field::new("item", DataType::Float32, true));
    let list_array = Arc::new(FixedSizeListArray::try_new(
        field,
        384,
        Arc::new(float_array) as Arc<dyn lancedb::arrow::arrow_array::Array>,
        None,
    ).map_err(|e| e.to_string())?);

    let schema = Arc::new(Schema::new(vec![
        Field::new("id", DataType::Utf8, false),
        Field::new("file_path", DataType::Utf8, false),
        Field::new("text", DataType::Utf8, false),
        Field::new(
            "vector",
            DataType::FixedSizeList(Arc::new(Field::new("item", DataType::Float32, true)), 384),
            false,
        ),
    ]));

    let batch = RecordBatch::try_new(
        schema.clone(),
        vec![
            id_array as Arc<dyn lancedb::arrow::arrow_array::Array>,
            path_array as Arc<dyn lancedb::arrow::arrow_array::Array>,
            text_array as Arc<dyn lancedb::arrow::arrow_array::Array>,
            list_array as Arc<dyn lancedb::arrow::arrow_array::Array>,
        ],
    ).map_err(|e| e.to_string())?;

    // Insert into table
    println!("[MundusAI] Inserting into LanceDB...");
    let table = super::db::get_or_create_table(db_conn).await?;
    
    // In lancedb 0.38, add takes a Boxed RecordBatchReader or an iterator
    let batches = vec![Ok(batch)];
    let batches_iter = lancedb::arrow::arrow_array::RecordBatchIterator::new(batches.into_iter(), schema.clone());
    let reader: Box<dyn lancedb::arrow::arrow_array::RecordBatchReader + Send> = Box::new(batches_iter);
    
    table.add(reader)
        .execute()
        .await
        .map_err(|e| format!("Failed to insert into LanceDB: {}", e))?;

    println!("[MundusAI] Successfully indexed {:?}", file_path);
    Ok(())
}
