import { useState, useRef, useEffect, type KeyboardEvent } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Paperclip, ArrowUp, Filter, Square } from 'lucide-react';
import { IconButton } from '@/components/ui/IconButton';
import { MessageBubble } from './MessageBubble';
import type { Message, SourceCitation } from '@/types';

interface ChatAreaProps {
  activeFolderPaths: string[];
  messages: Message[];
  onMessagesChange: (updater: (prev: Message[]) => Message[]) => void;
  conversationTitle: string;
}

export function ChatArea({
  activeFolderPaths,
  messages,
  onMessagesChange,
  conversationTitle,
}: ChatAreaProps) {
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = (behavior: 'smooth' | 'auto' = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  useEffect(() => {
    if (autoScrollEnabled) {
      // Use auto to prevent janky scrolling during fast streaming
      scrollToBottom('auto');
    }
  }, [messages, autoScrollEnabled]);

  const handleScroll = () => {
    const container = scrollContainerRef.current;
    if (!container) return;
    
    // If the user scrolls up, disable auto-scrolling.
    // We consider "at bottom" to be within 50px of the very bottom.
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 50;
    setAutoScrollEnabled(isNearBottom);
  };

  useEffect(() => {
    let isMounted = true;
    let unlistenToken: (() => void) | undefined;
    let unlistenSources: (() => void) | undefined;
    let unlistenDone: (() => void) | undefined;

    const setupListeners = async () => {
      const uToken = await listen<{ message_id: string; token: string }>('chat-token', (event) => {
        onMessagesChange((prev) =>
          prev.map((msg) =>
            msg.id === event.payload.message_id
              ? { ...msg, content: msg.content + event.payload.token, isThinking: false }
              : msg
          )
        );
      });
      if (!isMounted) { uToken(); return; }
      unlistenToken = uToken;

      const uSources = await listen<{ message_id: string; sources: SourceCitation[] }>('chat-sources', (event) => {
        onMessagesChange((prev) =>
          prev.map((msg) =>
            msg.id === event.payload.message_id
              ? { ...msg, sources: event.payload.sources }
              : msg
          )
        );
      });
      if (!isMounted) { uSources(); return; }
      unlistenSources = uSources;

      const uDone = await listen<{ message_id: string }>('chat-done', (event) => {
        onMessagesChange((prev) =>
          prev.map((msg) =>
            msg.id === event.payload.message_id
              ? { ...msg, isThinking: false }
              : msg
          )
        );
        setIsStreaming(false);
      });
      if (!isMounted) { uDone(); return; }
      unlistenDone = uDone;
    };

    setupListeners();

    return () => {
      isMounted = false;
      if (unlistenToken) unlistenToken();
      if (unlistenSources) unlistenSources();
      if (unlistenDone) unlistenDone();
    };
  }, [onMessagesChange]);

  const handleSubmit = () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;

    setIsStreaming(true);

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed,
      timestamp: new Date(),
      contentType: 'text',
    };

    const aiMessageId = crypto.randomUUID();
    const aiMessage: Message = {
      id: aiMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      contentType: 'text',
      isThinking: true,
    };

    onMessagesChange((prev) => [...prev, userMessage, aiMessage]);
    setInput('');
    setAutoScrollEnabled(true);
    
    // Force immediate scroll down when submitting
    setTimeout(() => scrollToBottom('smooth'), 50);

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    invoke('ask_question', { messageId: aiMessageId, prompt: trimmed, folderFilters: activeFolderPaths })
      .catch((error) => {
        onMessagesChange((prev) =>
          prev.map((msg) =>
            msg.id === aiMessageId
              ? { ...msg, content: `**Error querying MundusAI**: ${error}`, isThinking: false }
              : msg
          )
        );
        setIsStreaming(false);
      });
  };

  const handleStop = async () => {
    // Find the currently generating message
    const thinkingMsg = messages.find((m) => m.isThinking);
    if (thinkingMsg) {
      try {
        await invoke('cancel_question', { messageId: thinkingMsg.id });
      } catch (err) {
        console.error('[MundusAI] Failed to cancel question:', err);
      }
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
    }
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full">
      {/* Header */}
      <div className="h-12 flex items-center justify-between px-5 border-b border-border-subtle shrink-0 drag-region">
        <div className="flex items-center gap-3 no-drag">
          <h1 className="text-sm font-medium text-text-primary">
            {conversationTitle}
          </h1>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-accent-600/15 text-accent-400 font-medium border border-accent-700/20">
            Local Model
          </span>
          {activeFolderPaths.length > 0 && (
            <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-accent-600/10 text-accent-400/80 border border-accent-700/15">
              <Filter className="size-2.5" />
              {activeFolderPaths.length === 1
                ? activeFolderPaths[0].split('/').pop()
                : `${activeFolderPaths.length} folders`}
            </span>
          )}
        </div>
      </div>

      {/* Messages */}
      <div 
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-5 py-5"
      >
        <div className="max-w-3xl mx-auto">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full py-20 text-center">
              <div className="size-12 rounded-2xl bg-gradient-to-br from-accent-400/20 to-accent-600/20 flex items-center justify-center mb-4">
                <span className="text-accent-400 text-xl font-bold">M</span>
              </div>
              <h2 className="text-base font-medium text-text-primary mb-1">
                How can I help you today?
              </h2>
              <p className="text-sm text-text-tertiary max-w-xs">
                Ask me anything about your synced documents. Everything runs locally on your machine.
              </p>
            </div>
          )}
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Bar */}
      <div className="shrink-0 px-5 pb-4 pt-2">
        <div className="max-w-3xl mx-auto">
          <div
            className={`
              flex items-end gap-2 rounded-xl
              bg-surface-secondary border border-border-default
              px-3 py-2
              focus-within:border-accent-600/50
              transition-colors duration-200
            `}
          >
            <IconButton
              tooltip="Attach file"
              size="sm"
              variant="ghost"
              className="mb-0.5"
            >
              <Paperclip className="size-4" />
            </IconButton>

            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onInput={handleInput}
              placeholder="Ask MundusAI anything..."
              rows={1}
              className={`
                flex-1 resize-none bg-transparent border-none outline-none
                focus:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:outline-none
                text-sm text-text-primary placeholder:text-text-tertiary
                py-1 leading-relaxed max-h-40
              `}
            />

            {isStreaming ? (
              <button
                type="button"
                onClick={handleStop}
                className="size-7 rounded-lg flex items-center justify-center transition-all duration-150 cursor-pointer border-none mb-0.5 bg-surface-tertiary text-text-primary hover:bg-surface-tertiary/80 hover:text-status-error"
                title="Stop generating"
              >
                <Square className="size-3.5 fill-current" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!input.trim()}
                className={`
                  size-7 rounded-lg flex items-center justify-center
                  transition-all duration-150 cursor-pointer border-none mb-0.5
                  ${input.trim()
                    ? 'bg-accent-500 text-white hover:bg-accent-400 shadow-sm shadow-accent-500/25'
                    : 'bg-surface-tertiary text-text-tertiary cursor-not-allowed'
                  }
                `}
              >
                <ArrowUp className="size-4" />
              </button>
            )}
          </div>

          <p className="text-[10px] text-text-tertiary/50 text-center mt-2">
            MundusAI runs locally — your data never leaves your machine
          </p>
        </div>
      </div>
    </div>
  );
}
