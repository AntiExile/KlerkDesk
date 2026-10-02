use std::fs;
use std::io::Read;
use std::path::Path;
use std::sync::Arc;
use uuid::Uuid;

use lancedb::arrow::arrow_array::{FixedSizeListArray, Float32Array, RecordBatch, StringArray};
use lancedb::arrow::arrow_schema::{DataType, Field, Schema};
use lancedb::connection::Connection;
use text_splitter::TextSplitter;

use super::embed::Embedder;

/// Supported file extensions for document indexing and RAG ingestion.
pub const SUPPORTED_EXTENSIONS: &[&str] = &["txt", "md", "csv", "json", "pdf", "docx", "xlsx"];

/// Returns true if the file extension is supported for ingestion.
pub fn is_supported_extension(ext: &str) -> bool {
    SUPPORTED_EXTENSIONS.contains(&ext.to_lowercase().as_str())
}

/// Robust PDF text extraction with graceful error handling and empty text warnings.
pub fn extract_pdf_text(file_path: &Path) -> Result<String, String> {
    match pdf_extract::extract_text(file_path) {
        Ok(text) => {
            if text.trim().is_empty() {
                log::warn!(
                    "[Terra] PDF {:?} has 0 extractable text characters (it may be a scanned image or empty document)",
                    file_path
                );
            }
            Ok(text)
        }
        Err(e) => {
            let msg = format!("Failed to extract PDF text from {:?}: {}", file_path, e);
            log::warn!("[Terra] {}. File may be corrupted, encrypted, or password protected.", msg);
            Err(msg)
        }
    }
}

/// Parses structured CSV into header-aware text blocks so each chunk preserves column context.
pub fn parse_csv_structured(content: &str) -> String {
    let mut lines = content.lines().filter(|l| !l.trim().is_empty());
    let header = match lines.next() {
        Some(h) => h.trim(),
        None => return String::new(),
    };

    let mut result = String::new();
    let header_prefix = format!("[Columns: {}]\n", header);
    result.push_str(&header_prefix);

    let mut current_block_len = header_prefix.len();
    for line in lines {
        let trimmed_line = line.trim();
        if trimmed_line.is_empty() {
            continue;
        }

        // When a block reaches ~600 chars, start a new block repeating the header
        if current_block_len + trimmed_line.len() > 600 {
            result.push_str("\n\n");
            result.push_str(&header_prefix);
            current_block_len = header_prefix.len();
        }

        result.push_str(trimmed_line);
        result.push('\n');
        current_block_len += trimmed_line.len() + 1;
    }

    result
}

/// Extracts text from Microsoft Word (.docx) documents by reading word/document.xml.
pub fn extract_docx_text(file_path: &Path) -> Result<String, String> {
    let file = fs::File::open(file_path)
        .map_err(|e| format!("Failed to open .docx file: {}", e))?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| format!("Invalid .docx ZIP archive: {}", e))?;

    let mut xml_file = archive
        .by_name("word/document.xml")
        .map_err(|e| format!("Missing word/document.xml in docx: {}", e))?;

    let mut xml = String::new();
    xml_file
        .read_to_string(&mut xml)
        .map_err(|e| format!("Failed to read word/document.xml: {}", e))?;

    let mut text = String::new();
    let mut remaining = xml.as_str();

    while let Some(start_idx) = remaining.find("<w:t") {
        let after_start = &remaining[start_idx..];
        if let Some(tag_close) = after_start.find('>') {
            let content_start = &after_start[tag_close + 1..];
            if let Some(end_idx) = content_start.find("</w:t>") {
                let snippet = &content_start[..end_idx];
                text.push_str(snippet);
                remaining = &content_start[end_idx + 6..];
            } else {
                break;
            }
        } else {
            break;
        }
    }

    Ok(text)
}

/// Extracts text from Microsoft Excel (.xlsx) spreadsheets by reading worksheets and shared strings.
pub fn extract_xlsx_text(file_path: &Path) -> Result<String, String> {
    let file = fs::File::open(file_path)
        .map_err(|e| format!("Failed to open .xlsx file: {}", e))?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| format!("Invalid .xlsx ZIP archive: {}", e))?;

    let mut shared_strings = Vec::new();
    if let Ok(mut ss_file) = archive.by_name("xl/sharedStrings.xml") {
        let mut ss_xml = String::new();
        if ss_file.read_to_string(&mut ss_xml).is_ok() {
            let mut remaining = ss_xml.as_str();
            while let Some(start_idx) = remaining.find("<t") {
                let after_start = &remaining[start_idx..];
                if let Some(tag_close) = after_start.find('>') {
                    let content_start = &after_start[tag_close + 1..];
                    if let Some(end_idx) = content_start.find("</t>") {
                        let snippet = &content_start[..end_idx];
                        if !snippet.is_empty() {
                            shared_strings.push(snippet.to_string());
                        }
                        remaining = &content_start[end_idx + 4..];
                    } else {
                        break;
                    }
                } else {
                    break;
                }
            }
        }
    }

    if !shared_strings.is_empty() {
        return Ok(shared_strings.join("\n"));
    }

    Ok(String::new())
}

/// Process a single file, chunk it, embed it, and insert into LanceDB.
pub async fn process_file(
    file_path: &Path,
    embedder: &Embedder,
    db_conn: &Connection,
) -> Result<(), String> {
    let path_str = file_path.to_string_lossy().to_string();

    // 1. If file was deleted from disk, purge all its chunks from LanceDB
    if !file_path.exists() {
        println!("[Terra] File no longer exists, purging chunks from LanceDB: {:?}", file_path);
        super::db::delete_file_chunks(db_conn, &path_str).await?;
        return Ok(());
    }

    let ext = file_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    let text = match ext.as_str() {
        "txt" | "md" | "json" => {
            fs::read_to_string(file_path).map_err(|e| format!("Failed to read text file: {}", e))?
        }
        "csv" => {
            let raw = fs::read_to_string(file_path)
                .map_err(|e| format!("Failed to read CSV file: {}", e))?;
            parse_csv_structured(&raw)
        }
        "pdf" => extract_pdf_text(file_path)?,
        "docx" => extract_docx_text(file_path)?,
        "xlsx" => extract_xlsx_text(file_path)?,
        _ => {
            return Err(format!("Unsupported file extension: {}", ext));
        }
    };

    if text.trim().is_empty() {
        if ext == "pdf" {
            log::warn!(
                "[Terra] Scanned or empty PDF detected with no extractable text: {:?}",
                file_path
            );
        }
        super::db::delete_file_chunks(db_conn, &path_str).await?;
        return Ok(());
    }

    // Split text into chunks. all-MiniLM-L6-v2 handles up to 512 tokens.
    // For simplicity, we'll split by characters/words to roughly 1000 characters
    // with a 100 character overlap. 
    let splitter = TextSplitter::new(1000);
    let chunks: Vec<String> = splitter.chunks(&text).map(|s| s.to_string()).collect();

    if chunks.is_empty() {
        super::db::delete_file_chunks(db_conn, &path_str).await?;
        return Ok(());
    }

    // 2. Always purge previous stale chunks for this file before inserting updated chunks to prevent duplicates
    super::db::delete_file_chunks(db_conn, &path_str).await?;

    println!("[Terra] Embedding {} chunks for {:?}", chunks.len(), file_path);

    // Embed the chunks in batches of 32 to avoid massive memory spikes
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
    println!("[Terra] Inserting into LanceDB...");
    let table = super::db::get_or_create_table(db_conn).await?;
    
    let batches = vec![Ok(batch)];
    let batches_iter = lancedb::arrow::arrow_array::RecordBatchIterator::new(batches.into_iter(), schema.clone());
    let reader: Box<dyn lancedb::arrow::arrow_array::RecordBatchReader + Send> = Box::new(batches_iter);
    
    table.add(reader)
        .execute()
        .await
        .map_err(|e| format!("Failed to insert into LanceDB: {}", e))?;

    println!("[Terra] Successfully indexed {:?}", file_path);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn test_is_supported_extension() {
        assert!(is_supported_extension("pdf"));
        assert!(is_supported_extension("PDF"));
        assert!(is_supported_extension("docx"));
        assert!(is_supported_extension("xlsx"));
        assert!(is_supported_extension("csv"));
        assert!(is_supported_extension("md"));
        assert!(is_supported_extension("txt"));
        assert!(is_supported_extension("json"));
        assert!(!is_supported_extension("exe"));
        assert!(!is_supported_extension("zip"));
    }

    #[test]
    fn test_parse_csv_structured_injects_headers() {
        let csv = "Employee,Role,Department\nAlice,Engineer,Core\nBob,Designer,Product";
        let parsed = parse_csv_structured(csv);
        assert!(parsed.contains("[Columns: Employee,Role,Department]"));
        assert!(parsed.contains("Alice,Engineer,Core"));
        assert!(parsed.contains("Bob,Designer,Product"));
    }

    #[test]
    fn test_docx_text_extraction() {
        let temp_dir = std::env::temp_dir().join(format!("terra_test_docx_{}", Uuid::new_v4()));
        fs::create_dir_all(&temp_dir).unwrap();
        let docx_path = temp_dir.join("test.docx");

        {
            let file = fs::File::create(&docx_path).unwrap();
            let mut zip = zip::ZipWriter::new(file);
            let options = zip::write::SimpleFileOptions::default();
            zip.start_file("word/document.xml", options).unwrap();
            let xml_content = r#"<?xml version="1.0" encoding="UTF-8"?>
                <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
                    <w:body>
                        <w:p><w:r><w:t>Hello from Word docx!</w:t></w:r></w:p>
                        <w:p><w:r><w:t>Second paragraph.</w:t></w:r></w:p>
                    </w:body>
                </w:document>"#;
            zip.write_all(xml_content.as_bytes()).unwrap();
            zip.finish().unwrap();
        }

        let extracted = extract_docx_text(&docx_path).expect("Failed to extract docx");
        assert!(extracted.contains("Hello from Word docx!"));
        assert!(extracted.contains("Second paragraph."));

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_xlsx_text_extraction() {
        let temp_dir = std::env::temp_dir().join(format!("terra_test_xlsx_{}", Uuid::new_v4()));
        fs::create_dir_all(&temp_dir).unwrap();
        let xlsx_path = temp_dir.join("test.xlsx");

        {
            let file = fs::File::create(&xlsx_path).unwrap();
            let mut zip = zip::ZipWriter::new(file);
            let options = zip::write::SimpleFileOptions::default();

            zip.start_file("xl/sharedStrings.xml", options).unwrap();
            let ss_xml = r#"<?xml version="1.0" encoding="UTF-8"?>
                <sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="2" uniqueCount="2">
                    <si><t>Quarterly Revenue</t></si>
                    <si><t>Q1 Report</t></si>
                </sst>"#;
            zip.write_all(ss_xml.as_bytes()).unwrap();
            zip.finish().unwrap();
        }

        let extracted = extract_xlsx_text(&xlsx_path).expect("Failed to extract xlsx");
        assert!(extracted.contains("Quarterly Revenue"));
        assert!(extracted.contains("Q1 Report"));

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
