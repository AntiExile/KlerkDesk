use std::path::PathBuf;
use std::sync::Arc;

use lancedb::arrow::arrow_array::RecordBatch;
use lancedb::arrow::arrow_schema::{DataType, Field, Schema};
use lancedb::{connect, connection::Connection, Table};

/// Initializes the LanceDB connection in the given directory.
pub async fn init_db(app_data_dir: PathBuf) -> Result<Connection, String> {
    let db_path = app_data_dir.join("vectordb");
    println!("[Terra] Initializing LanceDB at: {:?}", db_path);

    let db_uri = db_path.to_string_lossy().to_string();
    let conn = connect(&db_uri)
        .execute()
        .await
        .map_err(|e| format!("Failed to connect to LanceDB: {}", e))?;

    Ok(conn)
}

/// Gets the existing `documents` table or creates a new one with the RAG schema.
pub async fn get_or_create_table(conn: &Connection) -> Result<Table, String> {
    let table_name = "documents";

    let tables = conn
        .table_names()
        .execute()
        .await
        .map_err(|e| format!("Failed to list tables: {}", e))?;

    if tables.contains(&table_name.to_string()) {
        return conn
            .open_table(table_name)
            .execute()
            .await
            .map_err(|e| format!("Failed to open table: {}", e));
    }

    // Define the schema: id, file_path, text, vector (384-dim for all-MiniLM-L6-v2)
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

    // In lancedb 0.38, we can create an empty table using create_empty_table if available,
    // or by passing an empty RecordBatch reader. We'll use the RecordBatch iterator method.
    let empty_batch = RecordBatch::new_empty(schema.clone());
    
    // We create a vector with one empty batch and use it to initialize the table.
    let batches = vec![Ok(empty_batch)];
    // Convert to a Boxed RecordBatchReader to satisfy arrow's requirements if needed,
    let batches_iter = lancedb::arrow::arrow_array::RecordBatchIterator::new(batches.into_iter(), schema.clone());
    let reader: Box<dyn lancedb::arrow::arrow_array::RecordBatchReader + Send> = Box::new(batches_iter);
    
    conn.create_table(table_name, reader)
        .execute()
        .await
        .map_err(|e| format!("Failed to create table: {}", e))
}

/// Deletes all chunks associated with a specific file path from LanceDB.
pub async fn delete_file_chunks(conn: &Connection, file_path: &str) -> Result<(), String> {
    let table = get_or_create_table(conn).await?;
    let escaped = file_path.replace('\'', "''");
    let predicate = format!("file_path = '{}'", escaped);
    table
        .delete(predicate.as_str())
        .await
        .map_err(|e| format!("Failed to delete chunks for {}: {}", file_path, e))?;
    println!("[Terra] Purged stale chunks from LanceDB for: {}", file_path);
    Ok(())
}

/// Deletes all chunks belonging to a folder (exact path or children) from LanceDB.
pub async fn delete_folder_chunks(conn: &Connection, folder_path: &str) -> Result<(), String> {
    let table = get_or_create_table(conn).await?;
    let folder = folder_path.trim_end_matches(['/', '\\']);
    let escaped = folder.replace('\'', "''");
    let predicate = format!(
        "file_path = '{}' OR file_path LIKE '{}/%' OR file_path LIKE '{}\\%'",
        escaped, escaped, escaped
    );
    table
        .delete(predicate.as_str())
        .await
        .map_err(|e| format!("Failed to delete chunks for folder {}: {}", folder_path, e))?;
    println!("[Terra] Purged chunks for folder: {}", folder_path);
    Ok(())
}

/// Clears all chunks from the `documents` table in LanceDB.
pub async fn clear_all_chunks(conn: &Connection) -> Result<(), String> {
    let table = get_or_create_table(conn).await?;
    table
        .delete("true")
        .await
        .map_err(|e| format!("Failed to clear documents table: {}", e))?;
    println!("[Terra] Cleared all chunks from LanceDB documents table");
    Ok(())
}

/// Returns the total number of document chunks indexed in LanceDB.
pub async fn count_chunks(conn: &Connection) -> Result<usize, String> {
    let table = get_or_create_table(conn).await?;
    table
        .count_rows(None)
        .await
        .map_err(|e| format!("Failed to count rows in table: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;
    use lancedb::arrow::arrow_array::{FixedSizeListArray, Float32Array, StringArray};

    #[tokio::test]
    async fn test_db_chunk_purging_and_lifecycle() {
        let temp_dir = std::env::temp_dir().join(format!("terra_test_db_{}", uuid::Uuid::new_v4()));
        let conn = init_db(temp_dir.clone()).await.unwrap();
        let table = get_or_create_table(&conn).await.unwrap();

        // Prepare 3 sample chunks across 2 files in 2 folders:
        // File 1: /workspace/docs/a.txt (2 chunks)
        // File 2: /workspace/notes/b.txt (1 chunk)
        let ids = Arc::new(StringArray::from(vec!["id-1", "id-2", "id-3"]));
        let paths = Arc::new(StringArray::from(vec![
            "/workspace/docs/a.txt",
            "/workspace/docs/a.txt",
            "/workspace/notes/b.txt",
        ]));
        let texts = Arc::new(StringArray::from(vec!["Chunk 1", "Chunk 2", "Chunk 3"]));

        let float_values = vec![0.1f32; 384 * 3];
        let float_array = Float32Array::from(float_values);
        let field = Arc::new(Field::new("item", DataType::Float32, true));
        let list_array = Arc::new(
            FixedSizeListArray::try_new(
                field,
                384,
                Arc::new(float_array) as Arc<dyn lancedb::arrow::arrow_array::Array>,
                None,
            )
            .unwrap(),
        );

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
                ids as Arc<dyn lancedb::arrow::arrow_array::Array>,
                paths as Arc<dyn lancedb::arrow::arrow_array::Array>,
                texts as Arc<dyn lancedb::arrow::arrow_array::Array>,
                list_array as Arc<dyn lancedb::arrow::arrow_array::Array>,
            ],
        )
        .unwrap();

        let batches_iter = lancedb::arrow::arrow_array::RecordBatchIterator::new(
            vec![Ok(batch)].into_iter(),
            schema.clone(),
        );
        let reader: Box<dyn lancedb::arrow::arrow_array::RecordBatchReader + Send> =
            Box::new(batches_iter);

        table.add(reader).execute().await.unwrap();

        // 1. Initial count should be 3
        let initial_count = count_chunks(&conn).await.unwrap();
        assert_eq!(initial_count, 3);

        // 2. Delete file 1 (/workspace/docs/a.txt)
        delete_file_chunks(&conn, "/workspace/docs/a.txt").await.unwrap();
        let count_after_file_del = count_chunks(&conn).await.unwrap();
        assert_eq!(count_after_file_del, 1);

        // 3. Delete folder (/workspace/notes)
        delete_folder_chunks(&conn, "/workspace/notes").await.unwrap();
        let count_after_folder_del = count_chunks(&conn).await.unwrap();
        assert_eq!(count_after_folder_del, 0);

        // Cleanup temp folder
        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}
