import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { openPath } from '@tauri-apps/plugin-opener';
import { X } from 'lucide-react';
import type { Message } from '@/types';

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const [showAllSources, setShowAllSources] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}
    >
      <div
        className={`
          flex gap-3 max-w-[80%]
          ${isUser ? 'flex-row-reverse' : 'flex-row'}
        `}
      >
        {/* Avatar */}
        {!isUser && (
          <div className="shrink-0 size-7 rounded-lg bg-accent-600/20 flex items-center justify-center mt-0.5">
            <span className="text-accent-400 text-xs font-bold">M</span>
          </div>
        )}

        {/* Content */}
        <div
          className={`
            rounded-xl px-4 py-2.5 text-sm leading-relaxed
            ${isUser
              ? 'bg-accent-600/15 text-text-primary border border-accent-700/20'
              : 'bg-surface-tertiary/50 text-text-primary border border-border-subtle'
            }
          `}
        >
          {message.contentType === 'code' ? (
            <pre className="font-mono text-xs bg-surface-primary/50 rounded-lg p-3 overflow-x-auto my-1 border border-border-subtle">
              <code>{message.content}</code>
            </pre>
          ) : message.contentType === 'table' ? (
            <div className="overflow-x-auto my-1">
              <div
                className="text-xs [&_table]:w-full [&_table]:border-collapse [&_th]:text-left [&_th]:px-3 [&_th]:py-2 [&_th]:border-b [&_th]:border-border-default [&_th]:text-text-secondary [&_th]:font-medium [&_td]:px-3 [&_td]:py-2 [&_td]:border-b [&_td]:border-border-subtle [&_td]:text-text-primary"
                dangerouslySetInnerHTML={{ __html: message.content }}
              />
            </div>
          ) : (
            <div className="whitespace-pre-wrap">
              {renderMarkdownLite(message.content)}
              {message.isThinking && (
                <span className="inline-flex items-center gap-1 text-text-tertiary ml-2 italic">
                  <span className="size-1.5 rounded-full bg-accent-400 animate-pulse" />
                  <span className="size-1.5 rounded-full bg-accent-400 animate-pulse delay-75" />
                  <span className="size-1.5 rounded-full bg-accent-400 animate-pulse delay-150" />
                </span>
              )}
            </div>
          )}

          {/* Timestamp */}
          <div
            className={`
              text-[10px] mt-1.5
              ${isUser ? 'text-accent-400/50 text-right' : 'text-text-tertiary/60'}
            `}
          >
            {formatTime(message.timestamp)}
          </div>

          {/* RAG Citations */}
          {message.sources && message.sources.length > 0 && (
            <div className="mt-4 pt-3 border-t border-border-subtle/50 space-y-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary flex items-center gap-1.5">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3 text-accent-500">
                  <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
                </svg>
                Sources
              </div>
              <div className="flex flex-wrap gap-2">
                {message.sources.slice(0, 3).map((source, idx) => (
                  <div
                    key={idx}
                    onClick={() => openPath(source.filePath)}
                    className="flex flex-col bg-surface-primary/30 border border-border-subtle rounded-md px-2.5 py-2 hover:border-accent-500/30 transition-colors max-w-sm group cursor-pointer"
                    title={source.textSnippet}
                  >
                    <span className="text-xs font-medium text-accent-300 truncate max-w-full">
                      {source.filePath.split('/').pop() || source.filePath.split('\\').pop() || source.filePath}
                    </span>
                    <span className="text-[10px] text-text-tertiary line-clamp-2 mt-0.5 leading-relaxed group-hover:text-text-secondary transition-colors">
                      {source.textSnippet}
                    </span>
                  </div>
                ))}
                {message.sources.length > 3 && (
                  <button
                    onClick={() => setShowAllSources(true)}
                    className="flex items-center justify-center text-xs text-accent-400 hover:text-accent-300 px-3 rounded-md border border-dashed border-accent-500/30 hover:border-accent-500/50 hover:bg-accent-500/10 transition-colors cursor-pointer"
                  >
                    +{message.sources.length - 3} more
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Sources Modal */}
      <AnimatePresence>
        {showAllSources && message.sources && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => setShowAllSources(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-surface-secondary border border-border-default rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
                <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4 text-accent-500">
                    <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
                  </svg>
                  All Sources ({message.sources.length})
                </h3>
                <button
                  onClick={() => setShowAllSources(false)}
                  className="p-1 rounded-md text-text-tertiary hover:text-text-primary hover:bg-surface-tertiary transition-colors cursor-pointer border-none"
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="p-5 overflow-y-auto space-y-3">
                {message.sources.map((source, idx) => (
                  <div
                    key={idx}
                    onClick={() => openPath(source.filePath)}
                    className="flex flex-col bg-surface-primary/30 border border-border-subtle rounded-md px-4 py-3 hover:border-accent-500/30 transition-colors group cursor-pointer"
                  >
                    <span className="text-sm font-medium text-accent-300 truncate mb-1">
                      {source.filePath.split('/').pop() || source.filePath.split('\\').pop() || source.filePath}
                    </span>
                    <span className="text-xs text-text-tertiary leading-relaxed group-hover:text-text-secondary transition-colors">
                      {source.textSnippet}
                    </span>
                    <span className="text-[10px] text-text-tertiary/50 truncate mt-2">
                      {source.filePath}
                    </span>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/** Lightweight inline markdown: **bold**, `code`, line breaks */
function renderMarkdownLite(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code
          key={i}
          className="font-mono text-xs bg-surface-primary/60 px-1.5 py-0.5 rounded text-accent-300"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
