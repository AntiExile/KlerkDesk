'use client';

import { motion } from 'framer-motion';
import type { Message } from '@/types';
import { ThinkingTrace } from '@/components/chat/ThinkingTrace';
import { ContextCard } from '@/components/chat/ContextCard';
import { ActionApproval } from '@/components/chat/ActionApproval';

interface MessageBubbleProps {
  message: Message;
  onApproveAction?: (messageId: string, actionId?: string) => void | Promise<void>;
  onRejectAction?: (messageId: string, actionId?: string) => void | Promise<void>;
}

export function MessageBubble({
  message,
  onApproveAction,
  onRejectAction,
}: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 34 }}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} w-full`}
    >
      <div className="flex flex-col min-w-0 max-w-xl space-y-2">
        {!isUser && (message.isThinking || message.thinkingSteps || message.thinkingDuration) && (
          <ThinkingTrace
            isThinking={message.isThinking}
            steps={message.thinkingSteps}
            totalDurationMs={message.thinkingDuration}
          />
        )}

        {!isUser && message.sources && message.sources.length > 0 && (
          <ContextCard citations={message.sources} />
        )}

        {(message.content || (!message.isThinking && !message.actionApproval)) && (
          <div
            className={`
              rounded-2xl px-4 py-3 text-[13.5px] leading-relaxed
              ${
                isUser
                  ? 'bg-[#27272A] text-zinc-100 border border-white/10'
                  : 'bg-[#1C1C1F] text-zinc-200 border border-white/[0.06]'
              }
            `}
          >
            {message.contentType === 'code' ? (
              <pre className="font-mono text-xs bg-[#0C0C0D] rounded-xl p-3 overflow-x-auto my-1 border border-white/[0.06] text-zinc-200">
                <code>{message.content}</code>
              </pre>
            ) : (
              <div className="whitespace-pre-wrap select-text">
                {renderMarkdownLite(message.content)}
              </div>
            )}

            {!isUser && message.modelUsed && (
              <div className="mt-2 pt-1.5 border-t border-white/[0.05] flex items-center justify-between text-[10.5px] font-mono text-zinc-500">
                <span>{message.modelUsed}</span>
                <span className="tabular-nums">{formatTime(message.timestamp)}</span>
              </div>
            )}
          </div>
        )}

        {!isUser && message.actionApproval && (
          <ActionApproval
            {...message.actionApproval}
            onApprove={(actionId) => onApproveAction?.(message.id, actionId)}
            onReject={(actionId) => onRejectAction?.(message.id, actionId)}
          />
        )}
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

function renderMarkdownLite(text: string) {
  const parts = text.split(/(```[\s\S]*?```|`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g);

  return parts.map((part, i) => {
    if (part.startsWith('```') && part.endsWith('```')) {
      const code = part.slice(3, -3).replace(/^[a-z]+\n/, '');
      return (
        <pre
          key={i}
          className="font-mono text-xs bg-[#0C0C0D] border border-white/[0.06] rounded-xl p-3 overflow-x-auto my-2 text-zinc-200"
        >
          <code>{code}</code>
        </pre>
      );
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code
          key={i}
          className="font-mono text-[12px] bg-[#0C0C0D] text-zinc-200 px-1.5 py-0.5 rounded border border-white/[0.08]"
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
