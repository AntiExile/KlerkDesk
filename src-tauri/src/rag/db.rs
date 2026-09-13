use std::path::PathBuf;
use std::sync::Arc;

use lancedb::arrow::arrow_array::RecordBatch;
use lancedb::arrow::arrow_schema::{DataType, Field, Schema};
use lancedb::{connect, connection::Connection, Table};

/// Initializes the LanceDB connection in the given directory.
pub async fn init_db(app_data_dir: PathBuf) -> Result<Connection, String> {
    let db_path = app_data_dir.join("vectordb");
    println!("[MundusAI] Initializing LanceDB at: {:?}", db_path);

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
