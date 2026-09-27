# Terra - Production Readiness Roadmap & Remaining Tasks

This document tracks all remaining tasks, bug fixes, and architectural requirements needed before **Terra** is ready for enterprise and B2B client production deployment.

---

## 🚨 Critical Fixes & Blockers

- [x] **Fix MMR Candidate Extraction & Failing Test**:
  - In `src-tauri/src/rag/mmr.rs`, `candidates.swap_remove(idx)` invalidates vector indices while draining in a loop, corrupting selected candidates.
  - Fix by transforming candidates into `Vec<Option<CandidateChunk>>` and using `candidates[idx].take()` by selection order.
  - Resolve the failing unit test `rag::mmr::tests::test_mmr_diversity` (balance $\lambda$ vs. per-file caps so diverse candidates are correctly verified).
- [x] **Remove Hardcoded Local Machine Paths in Sidecar Launcher**:
  - `src-tauri/bin/colibri-server-aarch64-apple-darwin` hardcodes paths to `/Users/wianmarais/Downloads/...` and `/Users/wianmarais/work/...`.
  - Package the Colibrì engine binary into Tauri app resources (`bundle.resources`) or resolve paths dynamically via the standard OS app data directory (`app.path().app_data_dir()`).
- [x] **Air-Gapped & Offline Embedding Model Bundling**:
  - Pre-packaged the `all-MiniLM-L6-v2` embedding model weights (`tokenizer.json`, `config.json`, `model.safetensors` ~88 MB) into `src-tauri/resources/embedding_model/` and configured `"resources": ["resources/**/*"]` in `tauri.conf.json`.
  - Refactored `Embedder::new` in `src-tauri/src/rag/embed.rs` with a resilient multi-tier local search hierarchy (`TERRA_EMBEDDING_MODEL_DIR`, app bundle resources, app data directory, local dev paths, and `hf_cache`) before ever touching the network.
  - Added unit test `test_offline_embedder_local_load` verifying local loading without network access.
  - Network download is now only used as a fallback if all local resources are absent, with clear, actionable error reporting for air-gapped deployments.
- [ ] **Cross-Platform Process Cleanup**:
  - In `src-tauri/src/lib.rs` and `package.json`, process termination uses `sh -c "lsof -ti :14205 | xargs kill -9 2>/dev/null"`, which fails on Windows.
  - Replace with cross-platform port checking and process management in Rust (e.g. tracking child PID or cross-platform socket verification).

---

## 1. Engine & AI Sidecar Integration

- [x] **Hybrid Model Onboarding & Management**:
  - Implemented backend detection (`check_model_status`) checking default app data, settings, env variables, and local fallbacks.
  - Implemented in-app model downloader (`download_default_model`) with chunked stream writing, cancellation support, and live progress events.
  - Implemented managed/enterprise folder importer (`set_model_folder`) supporting in-place linking or copying into application storage.
  - Built `ModelSetupModal` onboarding wizard automatically triggered on first launch if no model is detected, plus active status card in `AIEngineTab`.
- [ ] **Windows Executable Sidecar**:
  - Build and package the standalone Windows binary (`colibri-server-x86_64-pc-windows-msvc.exe`) or PyInstaller standalone build so Windows clients do not require a Python runtime.
- [ ] **Intel Mac Support**:
  - Provide `colibri-server-x86_64-apple-darwin` or configure Universal macOS binary bundling for x86_64 Mac users.
- [ ] **Engine Health Monitoring & Auto-Recovery**:
  - Detect when the Colibrì process crashes or runs out of VRAM/RAM, and automatically attempt recovery or surface an actionable prompt to the user.

---

## 2. RAG Pipeline & Vector DB Integrity

- [ ] **LanceDB Stale Chunk Purging & Deduplication**:
  - Currently, updating a file inserts duplicate chunks with fresh UUIDs without deleting previous chunks for that `file_path`.
  - Deleting a file from a watched folder never purges its chunks from LanceDB.
  - Implement a `delete_file_chunks(file_path)` helper in `src-tauri/src/rag/db.rs` and invoke it prior to re-indexing and upon file deletion.
- [ ] **Real Ingestion Progress Events**:
  - Replace the simulated 1.5s frontend timer (`Sidebar.tsx`) with genuine Tauri events (`indexing-progress` with `{ completed, total, currentFile }` and `indexing-done`).
  - Display an indexing progress bar in the dashboard when syncing large folder trees.
- [ ] **Functional "Re-Index All" Command**:
  - In `DataSyncTab.tsx`, the "Re-index all" button only queries metadata counts. Implement a true `reindex_all` Tauri backend command that clears and re-embeds all watched folders.
- [ ] **Expanded Document Formats**:
  - Add native parsing for `.docx`, `.xlsx`, `.pptx`, and structured tables.
  - Enhance PDF parsing resilience in `ingest.rs` against corrupted, encrypted, or password-protected files.
- [ ] **OCR Engine**:
  - Integrate an OCR engine (e.g., Tesseract or lightweight vision model) for scanned PDFs and document images.

---

## 3. Frontend Polish & UX

- [ ] **Functional Command Palette (`Cmd+K`)**:
  - Connect the 7 quick actions in `CommandPalette.tsx` (e.g., *Summarize document*, *Draft email*, *Search knowledge base*, *Extract contract clauses*) to active chat prompts and search workflows instead of `console.log`.
- [ ] **Engine Crash & Status Toast/Banner**:
  - Add a persistent toast or error banner in `ChatArea.tsx` when the engine is disconnected, loading, or out of memory, complete with a one-click "Restart Engine" button.
- [ ] **Conversation Export**:
  - Allow users to export conversations to Markdown or PDF.
- [ ] **Theme Polish**:
  - Verify light/dark theme contrast consistency across all modals and inputs.

---

## 4. Production Release, Security & Deployment

- [ ] **App Icons & Branding**:
  - Replace default Tauri placeholder icons in `src-tauri/icons/` (`32x32.png`, `128x128.png`, `icon.icns`, `icon.ico`, etc.) with official Terra branding.
- [ ] **Code Signing & Notarization**:
  - **macOS**: Configure Apple Developer ID Application certificates, Hardened Runtime entitlements, and Apple Notarization in the release pipeline.
  - **Windows**: Configure Authenticode code signing (EV or standard) to eliminate Microsoft Defender SmartScreen warnings.
- [ ] **Content Security Policy (CSP)**:
  - Enforce a strict CSP in `src-tauri/tauri.conf.json` (`security.csp` is currently `null`).
- [ ] **Metadata & Repository Cleanup**:
  - Update `Cargo.toml` metadata (`authors`, `description`) and `package.json`.
  - Remove scratch test files (`src-tauri/test_hf.rs`, `src-tauri/test_store.rs`).
- [ ] **Final Packaging & Bundle Verification**:
  - Run `npm run tauri build` and validate `.dmg`/`.app` (macOS) and `.msi`/`.exe` (Windows) bundle sizes, sidecar lifecycle, and LanceDB cold starts.

---

## ✅ Completed Milestones

- [x] **Frontend Architecture & Shell**: Collapsible sidebar with synced folders, conversation list, relative timestamps, inline rename, and delete actions.
- [x] **Chat History Persistence**: Saved to local storage (`conversations.json` via `@tauri-apps/plugin-store`) with auto-titling across restarts.
- [x] **Streaming Token Responses**: Refactored `ask_question` to stream tokens via SSE and Tauri events (`chat-token`, `chat-done`) with query cancellation support (`cancel_question`).
- [x] **Source Citations Display**: Chat UI displays RAG source chips with snippet expansion and direct file opening via `@tauri-apps/plugin-opener`.
- [x] **LanceDB Vector Storage**: Schema initialized with 384-dimensional vector embeddings and Arrow record batches.
- [x] **MMR Reranking Module**: Diversity calculation with per-file candidate caps implemented in `src-tauri/src/rag/mmr.rs`.
- [x] **Filesystem Watcher Hookup**: `notify-debouncer-mini` watcher configured to auto-trigger document ingestion on detected filesystem changes.
- [x] **AI Engine Settings Tab**: Connection testing, custom model path picker, and live sidecar log terminal stream.
- [x] **Hybrid Model Onboarding & Management**: First-run setup modal, managed USB/directory import, in-app model downloader, and live status badge.
