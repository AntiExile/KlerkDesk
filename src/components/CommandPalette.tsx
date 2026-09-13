import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  FileText,
  Mail,
  BarChart3,
  Scale,
  Shield,
  Sparkles,
} from 'lucide-react';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

interface QuickAction {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  shortcut?: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    id: 'summarize',
    title: 'Summarize open document',
    description: 'Generate a concise summary of the active file',
    icon: <FileText className="size-4" />,
  },
  {
    id: 'draft-email',
    title: 'Draft email response',
    description: 'Compose a professional reply based on context',
    icon: <Mail className="size-4" />,
  },
  {
    id: 'search-kb',
    title: 'Search local knowledge base',
    description: 'Find relevant documents across your synced folders',
    icon: <Search className="size-4" />,
    shortcut: '⌘F',
  },
  {
    id: 'analyze',
    title: 'Analyze financial data',
    description: 'Extract insights from invoices and financial statements',
    icon: <BarChart3 className="size-4" />,
  },
  {
    id: 'extract',
    title: 'Extract contract clauses',
    description: 'Identify and categorize key contractual terms',
    icon: <Scale className="size-4" />,
  },
  {
    id: 'compliance',
    title: 'Generate compliance report',
    description: 'Create a regulatory compliance check summary',
    icon: <Shield className="size-4" />,
  },
  {
    id: 'ask',
    title: 'Ask MundusAI',
    description: 'Open a free-form query with the local AI engine',
    icon: <Sparkles className="size-4" />,
  },
];

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = QUICK_ACTIONS.filter(
    (action) =>
      action.title.toLowerCase().includes(query.toLowerCase()) ||
      action.description.toLowerCase().includes(query.toLowerCase())
  );

  // Reset state on open
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      // Small delay for focus after animation starts
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Keep selected index in bounds
  useEffect(() => {
    if (selectedIndex >= filtered.length) {
      setSelectedIndex(Math.max(0, filtered.length - 1));
    }
  }, [filtered.length, selectedIndex]);

  const handleSelect = useCallback(
    (action: QuickAction) => {
      console.log(`[MundusAI] Action selected: ${action.title}`);
      onClose();
    },
    [onClose]
  );

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (filtered[selectedIndex]) {
          handleSelect(filtered[selectedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
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
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="fixed z-50 top-[20%] left-1/2 -translate-x-1/2 w-full max-w-[580px] mx-4"
          >
            <div className="bg-surface-secondary border border-border-default rounded-xl shadow-2xl shadow-black/40 overflow-hidden">
              {/* Search Input */}
              <div className="flex items-center gap-3 px-4 border-b border-border-subtle">
                <Search className="size-4 text-text-tertiary shrink-0" />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setSelectedIndex(0);
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="Search actions..."
                  className="flex-1 bg-transparent border-none outline-none text-sm text-text-primary placeholder:text-text-tertiary py-3.5 h-12"
                />
                <kbd className="hidden sm:inline-flex text-[10px] font-mono text-text-tertiary bg-surface-tertiary/60 px-1.5 py-0.5 rounded border border-border-subtle">
                  ESC
                </kbd>
              </div>

              {/* Actions List */}
              <div className="max-h-[320px] overflow-y-auto p-1.5">
                {filtered.length === 0 ? (
                  <div className="px-3 py-8 text-center text-sm text-text-tertiary">
                    No matching actions found
                  </div>
                ) : (
                  filtered.map((action, index) => (
                    <button
                      key={action.id}
                      onClick={() => handleSelect(action)}
                      onMouseEnter={() => setSelectedIndex(index)}
                      className={`
                        w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
                        text-left transition-colors duration-100
                        cursor-pointer border-none
                        ${index === selectedIndex
                          ? 'bg-accent-600/15 text-text-primary'
                          : 'bg-transparent text-text-secondary hover:bg-surface-tertiary/50'
                        }
                      `}
                    >
                      <div
                        className={`
                          size-8 rounded-lg flex items-center justify-center shrink-0
                          ${index === selectedIndex
                            ? 'bg-accent-600/20 text-accent-400'
                            : 'bg-surface-tertiary/50 text-text-tertiary'
                          }
                        `}
                      >
                        {action.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">
                          {action.title}
                        </div>
                        <div className="text-xs text-text-tertiary truncate">
                          {action.description}
                        </div>
                      </div>
                      {action.shortcut && (
                        <kbd className="text-[10px] font-mono text-text-tertiary bg-surface-tertiary/60 px-1.5 py-0.5 rounded border border-border-subtle shrink-0">
                          {action.shortcut}
                        </kbd>
                      )}
                    </button>
                  ))
                )}
              </div>

              {/* Footer hint */}
              <div className="px-4 py-2 border-t border-border-subtle flex items-center gap-4 text-[10px] text-text-tertiary">
                <span className="flex items-center gap-1">
                  <kbd className="font-mono bg-surface-tertiary/60 px-1 rounded border border-border-subtle">↑↓</kbd>
                  navigate
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="font-mono bg-surface-tertiary/60 px-1 rounded border border-border-subtle">↵</kbd>
                  select
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="font-mono bg-surface-tertiary/60 px-1 rounded border border-border-subtle">esc</kbd>
                  close
                </span>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
