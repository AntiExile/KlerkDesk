'use client';

import { useState, useEffect, useRef } from 'react';
import { ChevronDown, CheckCircle2, Loader2, Circle, AlertCircle, Sparkles } from 'lucide-react';
import type { ThinkingStep } from '@/types';

export interface ThinkingTraceProps {
  isThinking?: boolean;
  steps?: ThinkingStep[];
  totalDurationMs?: number;
  initialOpen?: boolean;
  className?: string;
}

const DEFAULT_STEPS: ThinkingStep[] = [
  { id: 'step-1', label: 'Routing via OpenRouter (deepseek/deepseek-v4-flash)', status: 'completed', durationMs: 65 },
  { id: 'step-2', label: 'Querying Convex tenderChunks @vectorIndex', status: 'completed', durationMs: 140 },
  { id: 'step-3', label: 'Validating CSD (7d) & CIPC/ID (90d) Compliance Vault', status: 'completed', durationMs: 90 },
  { id: 'step-4', label: 'Synthesizing bid guidance with Approval Shield', status: 'running' },
];

export function ThinkingTrace({
  isThinking = false,
  steps,
  totalDurationMs,
  initialOpen,
  className = '',
}: ThinkingTraceProps) {
  const [isOpen, setIsOpen] = useState<boolean>(initialOpen ?? isThinking);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(() => {
    return totalDurationMs ? totalDurationMs / 1000 : 0;
  });

  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (isThinking) {
      setIsOpen(true);
      startTimeRef.current = performance.now();
    } else if (totalDurationMs) {
      setElapsedSeconds(totalDurationMs / 1000);
    }
  }, [isThinking, totalDurationMs]);

  useEffect(() => {
    if (!isThinking) return;

    if (!startTimeRef.current) {
      startTimeRef.current = performance.now();
    }

    const timer = setInterval(() => {
      if (startTimeRef.current) {
        const diff = (performance.now() - startTimeRef.current) / 1000;
        setElapsedSeconds(diff);
      }
    }, 100);

    return () => clearInterval(timer);
  }, [isThinking]);

  const activeSteps: ThinkingStep[] =
    steps && steps.length > 0
      ? steps
      : isThinking
        ? DEFAULT_STEPS
        : DEFAULT_STEPS.map((s) => ({ ...s, status: 'completed' as const }));

  return (
    <div className={`w-full max-w-xl ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        className="group inline-flex items-center gap-2 rounded-full px-3 py-1 transition-colors duration-150 hover:bg-[#1C1C1F] border border-white/[0.06] bg-[#141416] cursor-pointer text-left"
      >
        <Sparkles className={`size-3 text-zinc-400 ${isThinking ? 'animate-pulse' : ''}`} />
        <span className="text-[11.5px] font-medium text-zinc-400">
          {isThinking ? 'Checking tenders & vault...' : 'Reasoning trace'}
        </span>
        <span className="font-mono text-[10.5px] text-zinc-500 tabular-nums">
          {elapsedSeconds.toFixed(1)}s
        </span>
        <ChevronDown
          className={`size-3 text-zinc-500 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      <div
        className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${
          isOpen ? 'grid-rows-[1fr] opacity-100 mt-2' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden">
          <div className="relative ml-3 pl-3.5 border-l border-white/[0.08] space-y-1.5 py-1">
            {activeSteps.map((step) => {
              const isCompleted = step.status === 'completed';
              const isRunning = step.status === 'running';
              const isFailed = step.status === 'failed';

              return (
                <div key={step.id} className="flex items-center justify-between gap-3 text-[11.5px]">
                  <div className="flex items-center gap-2 min-w-0">
                    {isCompleted && <CheckCircle2 className="size-3 text-emerald-400 shrink-0" />}
                    {isRunning && <Loader2 className="size-3 text-zinc-300 animate-spin shrink-0" />}
                    {isFailed && <AlertCircle className="size-3 text-rose-400 shrink-0" />}
                    {!isCompleted && !isRunning && !isFailed && (
                      <Circle className="size-3 text-zinc-600 shrink-0" />
                    )}
                    <span className="truncate text-zinc-400">{step.label}</span>
                  </div>
                  {step.durationMs !== undefined && (
                    <span className="font-mono text-[10px] text-zinc-600 tabular-nums shrink-0">
                      {step.durationMs}ms
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
