import { useState, useRef, useEffect, type KeyboardEvent } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Paperclip, ArrowUp } from 'lucide-react';
import { IconButton } from '@/components/ui/IconButton';
import { MessageBubble } from './MessageBubble';
import type { Message, SourceCitation } from '@/types';

const INITIAL_MESSAGES: Message[] = [
  {
    id: '1',
    role: 'assistant',
    content:
      "Welcome to **MundusAI**. I'm your local AI assistant — everything runs privately on your machine. How can I help you today?",
    timestamp: new Date(Date.now() - 300000),
    contentType: 'text',
  },
  {
    id: '2',
    role: 'user',
    content: 'Summarize the key terms from the Acme Corp contract.',
    timestamp: new Date(Date.now() - 240000),
    contentType: 'text',
  },
  {
    id: '3',
    role: 'assistant',
    content:
      'Here are the key terms from the **Acme Corp** service agreement:\n\n• **Term**: 24 months, auto-renewing\n• **Liability cap**: $500,000\n• **Termination notice**: 90 days written notice\n• **Non-compete**: 12-month post-termination\n• **Governing law**: State of Delaware\n\nWould you like me to flag any clauses that deviate from your standard template?',
    timestamp: new Date(Date.now() - 180000),
    contentType: 'text',
  },
  {
    id: '4',
    role: 'user',
    content: 'Show me last quarter invoices by client.',
    timestamp: new Date(Date.now() - 120000),
    contentType: 'text',
  },
  {
    id: '5',
    role: 'assistant',
    content: `<table>
<thead><tr><th>Client</th><th>Invoices</th><th>Total</th><th>Status</th></tr></thead>
<tbody>
<tr><td>Acme Corp</td><td>3</td><td>$45,200</td><td>Paid</td></tr>
<tr><td>Beta Industries</td><td>2</td><td>$28,750</td><td>Paid</td></tr>
<tr><td>Gamma LLC</td><td>4</td><td>$62,100</td><td>Partial</td></tr>
<tr><td>Delta Partners</td><td>1</td><td>$15,000</td><td>Overdue</td></tr>
</tbody>
</table>`,
    timestamp: new Date(Date.now() - 60000),
    contentType: 'table',
  },
];

export function ChatArea() {
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    let isMounted = true;
    let unlistenToken: (() => void) | undefined;
    let unlistenSources: (() => void) | undefined;
    let unlistenDone: (() => void) | undefined;

    const setupListeners = async () => {
      const uToken = await listen<{ message_id: string; token: string }>('chat-token', (event) => {
        setMessages((prev) =>
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
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === event.payload.message_id
              ? { ...msg, sources: event.payload.sources }
              : msg
          )
        );
      });
      if (!isMounted) { uSources(); return; }
      unlistenSources = uSources;

      // Listen for stream completion
      const uDone = await listen<{ message_id: string }>('chat-done', (event) => {
        setMessages((prev) =>
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
  }, []);

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

    setMessages((prev) => [...prev, userMessage, aiMessage]);
    setInput('');

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    invoke('ask_question', { messageId: aiMessageId, prompt: trimmed })
      .catch((error) => {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === aiMessageId
              ? { ...msg, content: `**Error querying MundusAI**: ${error}`, isThinking: false }
              : msg
          )
        );
        setIsStreaming(false);
      });
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
            New Conversation
          </h1>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-accent-600/15 text-accent-400 font-medium border border-accent-700/20">
            Local Model
          </span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-5">
        <div className="max-w-3xl mx-auto">
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
          </div>

          <p className="text-[10px] text-text-tertiary/50 text-center mt-2">
            MundusAI runs locally — your data never leaves your machine
          </p>
        </div>
      </div>
    </div>
  );
}
