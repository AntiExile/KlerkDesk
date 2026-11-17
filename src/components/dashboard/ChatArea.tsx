'use client';

import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from 'react';
import { ArrowUp, Sparkles, Square, ShieldAlert } from 'lucide-react';
import { askTenderQuestionAction } from '@/app/actions/chat';
import { triggerApprovalShieldAction, resolveApprovalShieldAction } from '@/app/actions/bid';
import { MessageBubble } from './MessageBubble';
import type { Message } from '@/types';

interface ChatAreaProps {
  bidId?: string;
  tenderNumber?: string;
  estimatedValueZar?: number;
  messages: Message[];
  onMessagesChange: (updater: (prev: Message[]) => Message[]) => void;
  conversationTitle?: string;
  compact?: boolean;
  quickPrompts?: string[];
  onApprovalTriggered?: () => void;
}

export function ChatArea({
  bidId,
  tenderNumber = '',
  estimatedValueZar = 0,
  messages,
  onMessagesChange,
  conversationTitle = 'Tender Q&A & Audit Copilot',
  compact = false,
  quickPrompts = [
    'Audit SBD 1/4/6.1 returnables',
    'Check CSD 7-day & CIPC 90-day blockers',
    'Verify BoQ VAT & P&G cap',
  ],
  onApprovalTriggered,
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
      scrollToBottom('auto');
    }
  }, [messages, autoScrollEnabled]);

  const handleScroll = () => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const isNearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < 50;
    setAutoScrollEnabled(isNearBottom);
  };

  const handleApproveAction = async (messageId: string, actionId?: string) => {
    if (actionId) {
      await resolveApprovalShieldAction({
        approvalId: actionId,
        decision: 'approved',
      });
      onApprovalTriggered?.();
    }
    onMessagesChange((prev) =>
      prev.map((msg) =>
        msg.id === messageId && msg.actionApproval
          ? {
              ...msg,
              actionApproval: { ...msg.actionApproval, status: 'approved' },
            }
          : msg
      )
    );
  };

  const handleRejectAction = async (messageId: string, actionId?: string) => {
    if (actionId) {
      await resolveApprovalShieldAction({
        approvalId: actionId,
        decision: 'rejected',
      });
      onApprovalTriggered?.();
    }
    onMessagesChange((prev) =>
      prev.map((msg) =>
        msg.id === messageId && msg.actionApproval
          ? {
              ...msg,
              actionApproval: { ...msg.actionApproval, status: 'rejected' },
            }
          : msg
      )
    );
  };

  const submitPrompt = useCallback(
    async (promptText: string) => {
      const trimmed = promptText.trim();
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
      const pendingAiMessage: Message = {
        id: aiMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        contentType: 'markdown',
        isThinking: true,
        thinkingSteps: [
          {
            id: 'step-1',
            label: 'Routing via OpenRouter (deepseek/deepseek-v4-flash)',
            status: 'running',
          },
          {
            id: 'step-2',
            label: 'Querying Convex tenderChunks @vectorIndex',
            status: 'pending',
          },
          {
            id: 'step-3',
            label: 'Validating Compliance Vault (7d / 90d rules)',
            status: 'pending',
          },
        ],
      };

      onMessagesChange((prev) => [...prev, userMessage, pendingAiMessage]);
      setInput('');
      setAutoScrollEnabled(true);

      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }

      try {
        const res = await askTenderQuestionAction({
          prompt: trimmed,
          bidId,
        });

        let shieldApprovalId: string | undefined;
        if (res.requiresApprovalShield && bidId) {
          const subtotal = Math.max(0, estimatedValueZar);
          const vat = Math.round(subtotal * 0.15 * 100) / 100;
          const grand = Math.round((subtotal + vat) * 100) / 100;
          const apr = await triggerApprovalShieldAction({
            bidId,
            tenderNumber: tenderNumber || bidId,
            actionType: 'submit_etenders',
            totalBidZar: subtotal,
            vatZar: vat,
            grandTotalZar: grand,
            targetResource: 'https://www.etenders.gov.za',
            commandPreview: `stagehand.submit('${tenderNumber || bidId}') // paused in pending_approval`,
          });
          shieldApprovalId = apr.id;
          onApprovalTriggered?.();
        }

        onMessagesChange((prev) =>
          prev.map((msg) =>
            msg.id === aiMessageId
              ? {
                  ...msg,
                  content: res.answer,
                  isThinking: false,
                  thinkingSteps: res.thinkingSteps,
                  thinkingDuration: res.durationMs,
                  sources: res.sources,
                  modelUsed: res.model,
                  actionApproval: shieldApprovalId
                    ? {
                        id: shieldApprovalId,
                        title: `Approval Shield — ${tenderNumber}`,
                        description:
                          'External submission paused in Convex pendingApprovals. Sign off here or in the Approval Shield card.',
                        targetResource: `eTenders.gov.za (${tenderNumber})`,
                        riskLevel: 'high',
                        confidenceScore: 0.96,
                        status: 'pending',
                      }
                    : undefined,
                }
              : msg
          )
        );
      } catch (err) {
        const errorText =
          err instanceof Error ? err.message : 'Unable to reach OpenRouter';
        onMessagesChange((prev) =>
          prev.map((msg) =>
            msg.id === aiMessageId
              ? {
                  ...msg,
                  content: `**Error querying OpenRouter**: ${errorText}`,
                  isThinking: false,
                }
              : msg
          )
        );
      } finally {
        setIsStreaming(false);
      }
    },
    [bidId, estimatedValueZar, isStreaming, onApprovalTriggered, onMessagesChange, tenderNumber]
  );

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitPrompt(input);
    }
  };

  const handleInput = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 140)}px`;
    }
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full bg-[#09090B]">
      <div className="h-12 flex items-center justify-between px-4 border-b border-white/10 shrink-0 bg-[#121215]">
        <div className="flex items-center gap-2.5 min-w-0">
          <Sparkles className="size-4 text-accent-400 shrink-0" />
          <h2 className="text-xs sm:text-sm font-semibold text-text-primary truncate">
            {conversationTitle}
          </h2>
        </div>
      </div>

      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className={`flex-1 overflow-y-auto ${compact ? 'px-3 py-3' : 'px-5 py-5'}`}
      >
        <div className={compact ? 'w-full' : 'max-w-3xl mx-auto'}>
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 text-center space-y-4">
              <div className="size-11 rounded-2xl bg-accent-500/10 border border-accent-500/25 flex items-center justify-center">
                <ShieldAlert className="size-5 text-accent-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-text-primary">
                  Tender &amp; Compliance Q&amp;A
                </h3>
                <p className="text-xs text-text-tertiary max-w-xs mt-1">
                  Ask about SBD 1/4/6.1 requirements, BoQ pricing, or CSD/CIPC expiry blocks.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-1.5 max-w-sm">
                {quickPrompts.map((qp) => (
                  <button
                    key={qp}
                    type="button"
                    onClick={() => submitPrompt(qp)}
                    className="text-[11px] px-2.5 py-1.5 rounded-lg bg-[#121215] border border-white/10 hover:border-accent-500/40 text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
                  >
                    {qp}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              onApproveAction={handleApproveAction}
              onRejectAction={handleRejectAction}
            />
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className={`shrink-0 border-t border-white/10 bg-[#121215]/70 ${compact ? 'p-3' : 'px-5 py-3.5'}`}>
        <div className={compact ? 'w-full' : 'max-w-3xl mx-auto'}>
          <div className="flex items-end gap-2 rounded-xl bg-[#09090B] border border-white/10 px-3 py-2 focus-within:border-accent-500/60 transition-colors">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onInput={handleInput}
              placeholder="Ask about SBD forms, BoQ rates, or compliance rules..."
              rows={1}
              className="flex-1 bg-transparent border-none outline-none focus:outline-none text-xs sm:text-sm text-text-primary placeholder:text-text-tertiary py-1 leading-relaxed max-h-36"
            />

            {isStreaming ? (
              <button
                type="button"
                onClick={() => setIsStreaming(false)}
                className="size-7 rounded-lg flex items-center justify-center bg-zinc-800 text-text-primary hover:text-rose-400 cursor-pointer border-none mb-0.5"
                title="Stop"
              >
                <Square className="size-3.5 fill-current" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => submitPrompt(input)}
                disabled={!input.trim()}
                className={`size-7 rounded-lg flex items-center justify-center transition-all cursor-pointer border-none mb-0.5 ${
                  input.trim()
                    ? 'bg-accent-500 text-white hover:bg-accent-400'
                    : 'bg-zinc-800 text-text-tertiary cursor-not-allowed'
                }`}
                title="Send message"
              >
                <ArrowUp className="size-4" />
              </button>
            )}
          </div>
          <p className="text-[10px] text-text-tertiary text-center mt-1.5">
            Approval Shield active — external eTenders submissions require sign-off
          </p>
        </div>
      </div>
    </div>
  );
}
