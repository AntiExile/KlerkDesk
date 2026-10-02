import { motion } from 'framer-motion';
import type { Message } from '@/types';
import { ThinkingTrace } from '@/components/chat/ThinkingTrace';
import { ContextCard } from '@/components/chat/ContextCard';
import { ActionApproval } from '@/components/chat/ActionApproval';

interface MessageBubbleProps {
  message: Message;
  onApproveAction?: (messageId: string, actionId?: string) => void;
  onRejectAction?: (messageId: string, actionId?: string) => void;
}

export function MessageBubble({
  message,
  onApproveAction,
  onRejectAction,
}: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-5 w-full`}
    >
      <div
        className={`
          flex gap-3 max-w-[88%] lg:max-w-[82%]
          ${isUser ? 'flex-row-reverse' : 'flex-row'}
        `}
      >
        {/* Avatar */}
        {!isUser && (
          <div className="shrink-0 size-7 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center mt-1 shadow-sm">
            <span className="text-accent-400 text-xs font-bold">T</span>
          </div>
        )}

        {/* Bubble container */}
        <div className="flex flex-col min-w-0 flex-1 space-y-2.5">
          {/* 1. Thinking Primitive (Accordion with elapsed time & sequential inference steps) */}
          {!isUser && (message.isThinking || message.thinkingSteps || message.thinkingDuration) && (
            <ThinkingTrace
              isThinking={message.isThinking}
              steps={message.thinkingSteps}
              totalDurationMs={message.thinkingDuration}
            />
          )}

          {/* 2. Context Cards Primitive (Document citations just above AI's text response) */}
          {!isUser && message.sources && message.sources.length > 0 && (
            <ContextCard citations={message.sources} />
          )}

          {/* 3. Message Body */}
          {(message.content || (!message.isThinking && !message.actionApproval)) && (
            <div
              className={`
                rounded-xl px-4 py-3 text-sm leading-relaxed
                ${isUser
                  ? 'bg-accent-600/20 text-zinc-100 border border-accent-500/30'
                  : 'bg-zinc-950/80 text-zinc-200 border border-zinc-800/80 shadow-sm'
                }
              `}
            >
              {message.contentType === 'code' ? (
                <pre className="font-mono text-xs bg-zinc-900/90 rounded-lg p-3 overflow-x-auto my-1 border border-zinc-800 text-zinc-200">
                  <code>{message.content}</code>
                </pre>
              ) : message.contentType === 'table' ? (
                <div className="overflow-x-auto my-1">
                  <div
                    className="text-xs [&_table]:w-full [&_table]:border-collapse [&_th]:text-left [&_th]:px-3 [&_th]:py-2 [&_th]:border-b [&_th]:border-zinc-800 [&_th]:text-zinc-400 [&_th]:font-medium [&_td]:px-3 [&_td]:py-2 [&_td]:border-b [&_td]:border-zinc-900 [&_td]:text-zinc-200"
                    dangerouslySetInnerHTML={{ __html: message.content }}
                  />
                </div>
              ) : (
                <div className="whitespace-pre-wrap select-text">
                  {renderMarkdownLite(message.content)}
                </div>
              )}

              {/* Timestamp */}
              <div
                className={`
                  text-[10px] font-mono mt-2
                  ${isUser ? 'text-accent-400/60 text-right' : 'text-zinc-500'}
                `}
              >
                {formatTime(message.timestamp)}
              </div>
            </div>
          )}

          {/* 4. Action Approval Primitive (Human-in-the-loop workflow card) */}
          {!isUser && message.actionApproval && (
            <ActionApproval
              {...message.actionApproval}
              onApprove={(actionId) => onApproveAction?.(message.id, actionId)}
              onReject={(actionId) => onRejectAction?.(message.id, actionId)}
            />
          )}
        </div>
      </div>
    </motion.div>
  );
}

function formatTime(d: Date | string): string {
  try {
    const date = typeof d === 'string' ? new Date(d) : d;
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

/** Lightweight markdown renderer for bold, italic, and inline code */
function renderMarkdownLite(text: string) {
  const parts = text.split(/(```[\s\S]*?```|`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g);

  return parts.map((part, i) => {
    if (part.startsWith('```') && part.endsWith('```')) {
      const code = part.slice(3, -3).replace(/^[a-z]+\n/, '');
      return (
        <pre
          key={i}
          className="font-mono text-xs bg-zinc-900 border border-zinc-800 rounded-lg p-3 overflow-x-auto my-2 text-zinc-200"
        >
          <code>{code}</code>
        </pre>
      );
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code
          key={i}
          className="font-mono text-xs bg-zinc-900/90 text-accent-300 px-1.5 py-0.5 rounded border border-zinc-800/80"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="font-semibold text-zinc-100">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return (
        <em key={i} className="italic text-zinc-300">
          {part.slice(1, -1)}
        </em>
      );
    }
    return part;
  });
}
