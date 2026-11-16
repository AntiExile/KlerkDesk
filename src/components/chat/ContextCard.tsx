'use client';

import { useState } from 'react';
import { FileText, ExternalLink, ChevronRight, Layers, FileSpreadsheet, FileCode } from 'lucide-react';

export interface ContextCitation {
  id?: string;
  sourceTitle?: string;
  filePath: string;
  textSnippet: string;
  fileType?: 'pdf' | 'csv' | 'txt' | 'md' | 'json' | 'docx' | 'xlsx' | string;
  characterCount?: number;
  score?: number;
}

export interface ContextCardProps {
  citations: ContextCitation[];
  onOpenCitation?: (citation: ContextCitation) => void;
  className?: string;
}

/** Determine file extension and indicator styles */
function getFileTypeMeta(filePath: string, explicitType?: string) {
  const ext = explicitType || filePath.split('.').pop()?.toLowerCase() || 'txt';

  switch (ext) {
    case 'pdf':
      return {
        label: 'PDF',
        bg: 'bg-rose-500/15 border-rose-500/30 text-rose-400',
        icon: FileText,
      };
    case 'csv':
      return {
        label: 'CSV',
        bg: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400',
        icon: FileSpreadsheet,
      };
    case 'xlsx':
      return {
        label: 'XLSX',
        bg: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400',
        icon: FileSpreadsheet,
      };
    case 'docx':
      return {
        label: 'DOCX',
        bg: 'bg-blue-500/15 border-blue-500/30 text-blue-400',
        icon: FileText,
      };
    case 'json':
      return {
        label: 'JSON',
        bg: 'bg-amber-500/15 border-amber-500/30 text-amber-400',
        icon: FileCode,
      };
    case 'md':
      return {
        label: 'MD',
        bg: 'bg-purple-500/15 border-purple-500/30 text-purple-400',
        icon: FileText,
      };
    default:
      return {
        label: 'TXT',
        bg: 'bg-sky-500/15 border-sky-500/30 text-sky-400',
        icon: FileText,
      };
  }
}

export function ContextCard({
  citations,
  onOpenCitation,
  className = '',
}: ContextCardProps) {
  const [selectedCitation, setSelectedCitation] = useState<ContextCitation | null>(null);

  if (!citations || citations.length === 0) return null;

  const handleCitationClick = (citation: ContextCitation) => {
    if (onOpenCitation) {
      onOpenCitation(citation);
      return;
    }
    setSelectedCitation(citation);
  };

  const openExternal = (filePath: string) => {
    if (typeof window !== 'undefined' && /^https?:\/\//i.test(filePath)) {
      window.open(filePath, '_blank', 'noopener,noreferrer');
    }
    setSelectedCitation(null);
  };

  return (
    <div className={`w-full space-y-2 mb-3 ${className}`}>
      <div className="flex items-center gap-2 px-1">
        <span className="flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-wider text-zinc-400">
          <Layers className="size-3 text-accent-400" />
          Referenced Context
        </span>
        <span className="inline-flex h-4 items-center rounded-md bg-zinc-800/80 px-1.5 text-[10px] font-mono text-zinc-400 tabular-nums border border-white/10">
          {citations.length} {citations.length === 1 ? 'source' : 'sources'}
        </span>
      </div>

      <div className="flex items-stretch gap-2.5 overflow-x-auto pb-1.5 pt-0.5 snap-x">
        {citations.map((citation, idx) => {
          const fileName =
            citation.filePath.split('/').pop() ||
            citation.filePath.split('\\').pop() ||
            citation.filePath;
          const title = citation.sourceTitle || fileName;
          const meta = getFileTypeMeta(citation.filePath, citation.fileType);
          const Icon = meta.icon;
          const charCount = citation.characterCount ?? citation.textSnippet.length;

          return (
            <button
              type="button"
              key={citation.id || idx}
              onClick={() => handleCitationClick(citation)}
              className="group relative flex flex-col justify-between w-72 shrink-0 snap-start overflow-hidden rounded-xl border border-white/10 bg-[#121215] hover:bg-zinc-900/90 hover:border-white/20 transition-all duration-200 cursor-pointer shadow-sm text-left p-0"
            >
              <div className="flex items-center gap-2 border-b border-white/10 px-3 py-1.5 bg-zinc-900/50 w-full">
                <Icon className="size-3 text-zinc-400 shrink-0" />
                <span className="truncate text-[12px] font-medium text-zinc-200 group-hover:text-accent-300 transition-colors">
                  {title}
                </span>
                <span className="ml-auto shrink-0 font-mono text-[10px] text-zinc-500 tabular-nums">
                  {charCount} chars
                </span>
              </div>

              <p className="px-3 pt-2 pb-1.5 text-[11.5px] leading-relaxed text-zinc-400 line-clamp-2 group-hover:text-zinc-300 transition-colors">
                {citation.textSnippet}
              </p>

              <div className="px-3 pb-2 pt-1 flex items-center justify-between border-t border-white/5 w-full">
                <span
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[4px] border text-[8.5px] font-bold uppercase tracking-wider ${meta.bg}`}
                >
                  {meta.label}
                </span>
                <span className="flex items-center gap-0.5 text-[10.5px] text-zinc-500 group-hover:text-accent-400 transition-colors font-medium">
                  Inspect
                  <ExternalLink className="size-2.5" />
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {selectedCitation && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setSelectedCitation(null)}
        >
          <div
            className="w-full max-w-lg overflow-hidden rounded-xl border border-white/10 bg-[#121215] p-5 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <span className="truncate font-semibold text-sm text-zinc-100">
                {selectedCitation.sourceTitle ||
                  selectedCitation.filePath.split('/').pop()}
              </span>
              <button
                type="button"
                onClick={() => setSelectedCitation(null)}
                className="text-zinc-400 hover:text-zinc-200 text-xs px-2 py-1 rounded bg-zinc-800/60 border border-white/10 cursor-pointer"
              >
                Close
              </button>
            </div>
            <div className="max-h-60 overflow-y-auto rounded-lg bg-[#09090B] border border-white/10 p-3 text-xs text-zinc-300 leading-relaxed font-mono">
              {selectedCitation.textSnippet}
            </div>
            <div className="flex justify-between items-center text-xs text-zinc-500 font-mono gap-3">
              <span className="truncate">{selectedCitation.filePath}</span>
              <button
                type="button"
                onClick={() => openExternal(selectedCitation.filePath)}
                className="inline-flex items-center gap-1 text-accent-400 hover:text-accent-300 font-medium bg-transparent border-none cursor-pointer shrink-0"
              >
                {/^https?:\/\//i.test(selectedCitation.filePath)
                  ? 'Open Source URL'
                  : 'Done'}
                <ChevronRight className="size-3" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
