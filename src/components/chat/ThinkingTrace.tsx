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
  { id: 'step-1', label: 'Routing prompt & intent classification', status: 'completed', durationMs: 140 },
  { id: 'step-2', label: 'Querying LanceDB vector embeddings', status: 'completed', durationMs: 380 },
  { id: 'step-3', label: 'Streaming NVMe weights to local engine', status: 'completed', durationMs: 520 },
  { id: 'step-4', label: 'Synthesizing context-grounded response', status: 'running' },
];

export function ThinkingTrace({
  isThinking = false,
  steps,
  totalDurationMs,
  initialOpen,
  className = '',
}: ThinkingTraceProps) {
  // Open by default if thinking, or respect initialOpen
  const [isOpen, setIsOpen] = useState<boolean>(initialOpen ?? isThinking);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(() => {
    return totalDurationMs ? totalDurationMs / 1000 : 0;
  });

  const startTimeRef = useRef<number | null>(null);

  // Sync open state when thinking starts
  useEffect(() => {
    if (isThinking) {
      setIsOpen(true);
      startTimeRef.current = performance.now();
    } else if (totalDurationMs) {
      setElapsedSeconds(totalDurationMs / 1000);
    }
  }, [isThinking, totalDurationMs]);

  // Live elapsed counter
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

  // Build active steps list
  const activeSteps: ThinkingStep[] = steps && steps.length > 0
    ? steps
    : isThinking
      ? DEFAULT_STEPS
      : DEFAULT_STEPS.map((s) => ({ ...s, status: 'completed' as const }));

  return (
    <div className={`w-full max-w-2xl select-none ${className}`}>
      {/* Accordion Header Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        className="group inline-flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 transition-colors duration-150 hover:bg-zinc-800/60 border border-zinc-800/40 hover:border-zinc-700/60 bg-zinc-950/40 cursor-pointer text-left"
      >
        {/* Pixel-Grid Loader Aesthetics (from BeautifulUI) or Sparkle */}
        {isThinking ? (
          <span
            aria-hidden="true"
            className="grid shrink-0 grid-cols-[repeat(3,4px)] gap-[1.5px] p-0.5 rounded-[3px] bg-zinc-900 border border-zinc-800"
          >
            <span className="size-[4px] bg-accent-400 rounded-[1px] animate-pulse" style={{ animationDelay: '0ms' }} />
            <span className="size-[4px] bg-accent-400 rounded-[1px] animate-pulse" style={{ animationDelay: '150ms' }} />
            <span className="size-[4px] bg-accent-400 rounded-[1px] animate-pulse" style={{ animationDelay: '300ms' }} />
            <span className="size-[4px] bg-accent-400 rounded-[1px] animate-pulse" style={{ animationDelay: '150ms' }} />
            <span className="size-[4px] bg-accent-400 rounded-[1px] animate-pulse" style={{ animationDelay: '300ms' }} />
            <span className="size-[4px] bg-accent-400 rounded-[1px] animate-pulse" style={{ animationDelay: '450ms' }} />
            <span className="size-[4px] bg-accent-400 rounded-[1px] animate-pulse" style={{ animationDelay: '300ms' }} />
            <span className="size-[4px] bg-accent-400 rounded-[1px] animate-pulse" style={{ animationDelay: '450ms' }} />
            <span className="size-[4px] bg-accent-400 rounded-[1px] animate-pulse" style={{ animationDelay: '600ms' }} />
          </span>
        ) : (
          <div className="flex size-5 shrink-0 items-center justify-center rounded-md bg-accent-500/10 border border-accent-500/20 text-accent-400">
            <Sparkles className="size-3" />
          </div>
        )}

        {/* Shimmer Label when Thinking, Crisp when Done */}
        <span className="text-[12.5px] font-medium leading-none">
          {isThinking ? (
            <span
              className="bg-clip-text text-transparent bg-gradient-to-r from-zinc-400 via-zinc-100 to-zinc-400 bg-[length:200%_100%] animate-pulse"
            >
              Thinking...
            </span>
          ) : (
            <span className="text-zinc-300">
              Thought process
            </span>
          )}
        </span>

        {/* Monospace Elapsed Time */}
        <span className="font-mono text-[11px] text-zinc-500 tabular-nums">
          {elapsedSeconds.toFixed(1)}s
        </span>

        {/* Chevron with smooth rotation */}
        <ChevronDown
          className={`size-3.5 text-zinc-500 transition-transform duration-200 group-hover:text-zinc-300 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Collapsible Content */}
      <div
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
          isOpen ? 'grid-rows-[1fr] opacity-100 mt-2' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden">
          <div className="relative ml-3 pl-4 border-l border-zinc-800/80 space-y-2 py-1">
            {activeSteps.map((step) => {
              const isCompleted = step.status === 'completed';
              const isRunning = step.status === 'running';
              const isFailed = step.status === 'failed';

              return (
                <div key={step.id} className="flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    {/* Node status icon */}
                    {isCompleted && (
                      <CheckCircle2 className="size-3.5 text-emerald-400 shrink-0" />
                    )}
                    {isRunning && (
                      <Loader2 className="size-3.5 text-accent-400 animate-spin shrink-0" />
                    )}
                    {isFailed && (
                      <AlertCircle className="size-3.5 text-rose-400 shrink-0" />
                    )}
                    {!isCompleted && !isRunning && !isFailed && (
                      <Circle className="size-3.5 text-zinc-600 shrink-0" />
                    )}

                    {/* Step description */}
                    <span
                      className={`truncate text-[12px] ${
                        isCompleted
                          ? 'text-zinc-400'
                          : isRunning
                            ? 'text-zinc-100 font-medium'
                            : isFailed
                              ? 'text-rose-300 font-medium'
                              : 'text-zinc-600'
                      }`}
                    >
                      {step.label}
                    </span>
                  </div>

                  {/* Step duration / detail */}
                  {step.durationMs !== undefined && (
                    <span className="font-mono text-[10.5px] text-zinc-500 tabular-nums shrink-0">
                      {step.durationMs}ms
                    </span>
                  )}
                  {step.detail && (
                    <span className="text-[11px] text-zinc-500 truncate max-w-xs">
                      {step.detail}
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
