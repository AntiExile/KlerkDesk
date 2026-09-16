# Terra - Remaining Project Tasks

This is a comprehensive list of what is left to build and polish before the application is ready for production deployment to B2B clients.

## 1. Engine & AI Integration
- [ ] **Real Colibrì Wrapper Scripts**: Replace the dummy `colibri-server` sidecar script in `src-tauri/bin/` with the actual bash script that triggers `./coli serve` for macOS development.
- [ ] **PyInstaller Production Build**: Compile the Python `openai_server.py` script into a standalone executable for Windows so clients don't need Python installed, and configure it as the Windows sidecar.
- [ ] **Streaming Responses**: Refactor the `ask_question` backend command to stream tokens back to the React frontend using Tauri Events, rather than waiting for the entire response to finish generating before showing text.

## 2. RAG (Retrieval-Augmented Generation) Pipeline
- [ ] **File Watcher Hookup**: Ensure that when `watcher.rs` detects a new file, it automatically triggers `ingest.rs` to chunk the document, generate embeddings, and store them in LanceDB.
- [ ] **Frontend Ingestion Progress**: Add a UI component to the dashboard to show indexing progress when large folders of PDFs/documents are added.
- [ ] **Source Citations**: Modify the chat UI to display the filenames/snippets of the RAG context that was retrieved from LanceDB so users can verify the AI's answers.
- [ ] **Supported Formats Expansion**: Ensure `ingest.rs` handles complex PDFs, DOCX files, and raw text robustly.

## 3. Frontend Polish
- [ ] **Chat History Persistence**: Save chat sessions to a local lightweight database (like SQLite or a JSON store) so conversations survive app restarts.
- [ ] **Theme Polish**: Ensure all dark/light mode tokens are perfectly mapped in the custom components.
- [ ] **Error Handling UI**: Add toast notifications or error banners in the chat window if the local Colibrì engine crashes or goes out of memory.

## 4. Production & Deployment
- [ ] **App Icons**: Replace the default Tauri icons in `src-tauri/icons/` with the official Terra branding.
- [ ] **Code Signing**: Configure Apple Developer certificates and Windows Authenticode signing so clients don't get "Untrusted Developer" warnings.
- [ ] **Final Build Test**: Run `npm run tauri build` and verify the final `.app` (Mac) and `.msi`/`.exe` (Windows) bundle sizes and ensure the NVMe streaming works cleanly in the packaged environment.

## 5. Polish
- [ ] **OCR Engine**: Implement an OCR engine to extract text from scanned documents and images, enabling the RAG pipeline to ingest non-machine-readable content.
