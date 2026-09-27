import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  Cpu,
  FolderOpen,
  DownloadCloud,
  CheckCircle2,
  AlertCircle,
  X,
  Loader2,
  ArrowRight,
  HardDrive,
  Globe,
} from 'lucide-react';
import type { ModelStatusInfo, ModelDownloadProgress } from '@/types';

interface ModelSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onModelConfigured?: () => void;
  isMandatory?: boolean;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export function ModelSetupModal({
  isOpen,
  onClose,
  onModelConfigured,
  isMandatory = false,
}: ModelSetupModalProps) {
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [copyToStorage, setCopyToStorage] = useState(false);
  const [isSettingModel, setIsSettingModel] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Download state
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<ModelDownloadProgress | null>(null);
  const [customUrl, setCustomUrl] = useState('');
  const [showCustomUrl, setShowCustomUrl] = useState(false);

  // Listen for download progress
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setupListener = async () => {
      unlisten = await listen<ModelDownloadProgress>('model-download-progress', (event) => {
        setDownloadProgress(event.payload);

        if (event.payload.status === 'completed') {
          setIsDownloading(false);
          onModelConfigured?.();
          onClose();
        } else if (event.payload.status === 'error' || event.payload.status === 'cancelled') {
          setIsDownloading(false);
          if (event.payload.errorMessage) {
            setErrorMessage(event.payload.errorMessage);
          }
        }
      });
    };

    if (isOpen) {
      setupListener();
    }

    return () => {
      if (unlisten) unlisten();
    };
  }, [isOpen, onClose, onModelConfigured]);

  const handlePickFolder = async () => {
    setErrorMessage(null);
    try {
      const picked = await invoke<string | null>('pick_model_folder');
      if (picked) {
        setSelectedFolder(picked);
      }
    } catch (err) {
      setErrorMessage(typeof err === 'string' ? err : 'Failed to select folder');
    }
  };

  const handleApplySelectedFolder = async () => {
    if (!selectedFolder) return;
    setIsSettingModel(true);
    setErrorMessage(null);

    try {
      await invoke<ModelStatusInfo>('set_model_folder', {
        path: selectedFolder,
        copyToDefault: copyToStorage,
      });
      onModelConfigured?.();
      onClose();
    } catch (err) {
      setErrorMessage(typeof err === 'string' ? err : 'Invalid model folder');
    } finally {
      setIsSettingModel(false);
    }
  };

  const handleStartDownload = async () => {
    setIsDownloading(true);
    setErrorMessage(null);
    setDownloadProgress(null);

    try {
      await invoke('download_default_model', {
        sourceUrl: customUrl.trim() ? customUrl.trim() : null,
      });
    } catch (err) {
      setIsDownloading(false);
      setErrorMessage(typeof err === 'string' ? err : 'Failed to start download');
    }
  };

  const handleCancelDownload = async () => {
    try {
      await invoke('cancel_model_download');
    } catch (err) {
      console.error('[Terra] Failed to cancel download:', err);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-black/65 backdrop-blur-md"
            onClick={isMandatory ? undefined : onClose}
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[720px] px-4"
          >
            <div className="bg-surface-secondary border border-border-default rounded-2xl shadow-2xl shadow-black/60 overflow-hidden flex flex-col">
              
              {/* Header */}
              <div className="px-6 py-5 border-b border-border-subtle flex items-start justify-between bg-surface-primary/40">
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-xl bg-accent-600/20 border border-accent-500/30 flex items-center justify-center text-accent-400">
                    <Cpu className="size-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-semibold text-text-primary">
                        Configure Local AI Engine
                      </h2>
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-accent-500/10 text-accent-300 border border-accent-500/20">
                        100% On-Device
                      </span>
                    </div>
                    <p className="text-xs text-text-tertiary mt-0.5">
                      Terra keeps all documents confidential on your machine. Select how to set up the reasoning model.
                    </p>
                  </div>
                </div>

                {!isMandatory && (
                  <button
                    type="button"
                    onClick={onClose}
                    className="size-7 rounded-lg flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-surface-tertiary transition-colors cursor-pointer border-none bg-transparent"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>

              {/* Error Banner */}
              {errorMessage && (
                <div className="mx-6 mt-4 p-3 rounded-lg bg-status-error/10 border border-status-error/20 flex items-center gap-2.5 text-xs text-status-error">
                  <AlertCircle className="size-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Body: Two Options */}
              <div className="p-6 space-y-4">
                
                {/* ── Option A: Locate Existing Folder (Managed / Enterprise) ── */}
                <div
                  className={`
                    p-4 rounded-xl border transition-all duration-200
                    ${selectedFolder
                      ? 'border-accent-500/40 bg-accent-900/10'
                      : 'border-border-default hover:border-border-default/80 bg-surface-primary/30'
                    }
                  `}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="size-8 rounded-lg bg-surface-tertiary/70 flex items-center justify-center text-text-secondary mt-0.5 shrink-0">
                        <HardDrive className="size-4 text-accent-400" />
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-text-primary">
                          Option 1: Locate Existing Model Folder
                        </h3>
                        <p className="text-xs text-text-tertiary mt-0.5 leading-relaxed">
                          For pre-installed enterprise environments, network drives, or local Colibrì/Qwen directories.
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handlePickFolder}
                      disabled={isSettingModel || isDownloading}
                      className="px-3 py-1.5 rounded-lg bg-surface-tertiary hover:bg-surface-tertiary/80 text-text-primary text-xs font-medium border border-border-default transition-colors flex items-center gap-1.5 cursor-pointer shrink-0 disabled:opacity-50"
                    >
                      <FolderOpen className="size-3.5" />
                      <span>{selectedFolder ? 'Change Folder' : 'Browse Filesystem'}</span>
                    </button>
                  </div>

                  {/* Selected folder preview & actions */}
                  {selectedFolder && (
                    <div className="mt-3 pt-3 border-t border-border-subtle/60 space-y-3">
                      <div className="flex items-center gap-2 text-xs font-mono text-accent-300 bg-surface-primary/60 px-2.5 py-1.5 rounded-md border border-border-subtle truncate">
                        <CheckCircle2 className="size-3.5 text-accent-400 shrink-0" />
                        <span className="truncate">{selectedFolder}</span>
                      </div>

                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={copyToStorage}
                            onChange={(e) => setCopyToStorage(e.target.checked)}
                            className="rounded border-border-default text-accent-500 focus:ring-accent-500/20 bg-surface-tertiary"
                          />
                          <span>Copy into Terra's local app storage (recommended for flash drives)</span>
                        </label>

                        <button
                          type="button"
                          onClick={handleApplySelectedFolder}
                          disabled={isSettingModel}
                          className="px-4 py-1.5 rounded-lg bg-accent-600 hover:bg-accent-500 text-white text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          {isSettingModel ? (
                            <>
                              <Loader2 className="size-3.5 animate-spin" />
                              <span>Activating...</span>
                            </>
                          ) : (
                            <>
                              <span>Activate Model</span>
                              <ArrowRight className="size-3.5" />
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* ── Option B: Download Recommended Model (Cloud / Self-serve) ── */}
                <div
                  className={`
                    p-4 rounded-xl border transition-all duration-200
                    ${isDownloading
                      ? 'border-accent-500/50 bg-accent-950/20'
                      : 'border-border-default hover:border-border-default/80 bg-surface-primary/30'
                    }
                  `}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="size-8 rounded-lg bg-surface-tertiary/70 flex items-center justify-center text-text-secondary mt-0.5 shrink-0">
                        <DownloadCloud className="size-4 text-accent-400" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-medium text-text-primary">
                            Option 2: Download Recommended Model
                          </h3>
                          <span className="text-[10px] font-semibold text-accent-400">
                            ~8.5 GB
                          </span>
                        </div>
                        <p className="text-xs text-text-tertiary mt-0.5 leading-relaxed">
                          Download the optimized Colibrì GLM document intelligence model directly to this computer.
                        </p>
                      </div>
                    </div>

                    {!isDownloading && (
                      <button
                        type="button"
                        onClick={handleStartDownload}
                        disabled={isSettingModel}
                        className="px-3.5 py-1.5 rounded-lg bg-accent-600 hover:bg-accent-500 text-white text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer shrink-0 disabled:opacity-50 shadow-sm"
                      >
                        <DownloadCloud className="size-3.5" />
                        <span>Download</span>
                      </button>
                    )}
                  </div>

                  {/* Downloading Progress Bar */}
                  {isDownloading && downloadProgress && (
                    <div className="mt-4 pt-3 border-t border-border-subtle/60 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-text-secondary font-medium flex items-center gap-1.5">
                          <Loader2 className="size-3.5 animate-spin text-accent-400" />
                          <span>Downloading {downloadProgress.currentFile}...</span>
                        </span>
                        <span className="font-mono text-accent-300 font-semibold">
                          {downloadProgress.percentage.toFixed(1)}%
                        </span>
                      </div>

                      {/* Progress Track */}
                      <div className="h-2 w-full bg-surface-tertiary rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-accent-500 to-accent-300 rounded-full transition-all duration-150"
                          style={{ width: `${Math.min(100, Math.max(0, downloadProgress.percentage))}%` }}
                        />
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-text-tertiary pt-1">
                        <span>
                          {formatBytes(downloadProgress.downloadedBytes)} of {formatBytes(downloadProgress.totalBytes)}
                        </span>
                        <button
                          type="button"
                          onClick={handleCancelDownload}
                          className="text-status-error hover:text-status-error/80 cursor-pointer border-none bg-transparent text-xs"
                        >
                          Cancel Download
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Advanced Custom URL Toggle */}
                  {!isDownloading && (
                    <div className="mt-3 pt-2 text-[11px]">
                      <button
                        type="button"
                        onClick={() => setShowCustomUrl(!showCustomUrl)}
                        className="text-text-tertiary hover:text-accent-400 transition-colors flex items-center gap-1 cursor-pointer bg-transparent border-none p-0"
                      >
                        <Globe className="size-3" />
                        <span>{showCustomUrl ? 'Hide custom URL' : 'Use custom model URL / mirror'}</span>
                      </button>

                      {showCustomUrl && (
                        <div className="mt-2 flex gap-2">
                          <input
                            type="text"
                            value={customUrl}
                            onChange={(e) => setCustomUrl(e.target.value)}
                            placeholder="https://.../model.safetensors or HuggingFace URL"
                            className="flex-1 bg-surface-primary border border-border-default rounded-md px-2.5 py-1 text-xs text-text-primary font-mono placeholder:text-text-tertiary/50 outline-none focus:border-accent-500"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>

              </div>

              {/* Footer */}
              <div className="px-6 py-3.5 border-t border-border-subtle bg-surface-primary/40 flex items-center justify-between">
                <span className="text-xs text-text-tertiary">
                  You can change or re-download models anytime in Settings.
                </span>

                {isMandatory && (
                  <button
                    type="button"
                    onClick={onClose}
                    className="text-xs text-text-tertiary hover:text-text-secondary cursor-pointer bg-transparent border-none"
                  >
                    Skip for now (Browse Documents Only)
                  </button>
                )}
              </div>

            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
