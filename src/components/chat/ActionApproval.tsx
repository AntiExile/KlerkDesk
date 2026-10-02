import { useState } from 'react';
import { ShieldAlert, ShieldCheck, Check, X, Terminal, Loader2, Sparkles } from 'lucide-react';
import type { ActionApprovalData } from '@/types';

export interface ActionApprovalProps extends Partial<ActionApprovalData> {
  onApprove?: (actionId?: string) => void | Promise<void>;
  onReject?: (actionId?: string) => void | Promise<void>;
  className?: string;
}

export function ActionApproval({
  id = 'act-1',
  title = 'Execute Data Ingestion Script',
  description = 'The assistant proposed executing an automated local synchronization procedure on the target system.',
  command,
  targetResource,
  riskLevel = 'medium',
  confidenceScore = 0.94,
  status: initialStatus = 'pending',
  onApprove,
  onReject,
  className = '',
}: ActionApprovalProps) {
  const [currentStatus, setCurrentStatus] = useState<'pending' | 'approved' | 'rejected' | 'executing'>(
    initialStatus
  );
  const [isProcessing, setIsProcessing] = useState(false);

  const handleApprove = async () => {
    setIsProcessing(true);
    setCurrentStatus('executing');
    try {
      if (onApprove) {
        await onApprove(id);
      }
      setCurrentStatus('approved');
    } catch {
      setCurrentStatus('pending');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async () => {
    setIsProcessing(true);
    try {
      if (onReject) {
        await onReject(id);
      }
      setCurrentStatus('rejected');
    } finally {
      setIsProcessing(false);
    }
  };

  // Risk meta styles
  const riskMeta = {
    critical: {
      badge: 'bg-rose-500/15 border-rose-500/30 text-rose-400',
      border: 'border-rose-900/60',
      icon: ShieldAlert,
      label: 'Critical Risk',
    },
    high: {
      badge: 'bg-orange-500/15 border-orange-500/30 text-orange-400',
      border: 'border-orange-900/60',
      icon: ShieldAlert,
      label: 'High Risk',
    },
    medium: {
      badge: 'bg-amber-500/15 border-amber-500/30 text-amber-400',
      border: 'border-amber-900/50',
      icon: ShieldAlert,
      label: 'Medium Risk',
    },
    low: {
      badge: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400',
      border: 'border-emerald-900/50',
      icon: ShieldCheck,
      label: 'Low Risk',
    },
  }[riskLevel];

  const RiskIcon = riskMeta.icon;

  return (
    <div
      className={`w-full max-w-xl overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950/95 shadow-xl transition-all duration-200 my-3 ${riskMeta.border} ${className}`}
    >
      {/* Header with Risk and Confidence Indicators */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-900/60 border-b border-zinc-800/80">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10.5px] font-semibold tracking-wider uppercase ${riskMeta.badge}`}
          >
            <RiskIcon className="size-3" />
            {riskMeta.label}
          </span>
          <span className="text-[11px] text-zinc-500 font-medium">
            Human-in-the-Loop Review
          </span>
        </div>
        <div className="flex items-center gap-1 text-[11px] font-mono text-zinc-400">
          <Sparkles className="size-3 text-accent-400" />
          <span>{Math.round(confidenceScore * 100)}% Confidence</span>
        </div>
      </div>

      {/* Main Body */}
      <div className="p-4 space-y-3">
        <div>
          <h4 className="text-[13.5px] font-semibold text-zinc-100 tracking-tight">
            {title}
          </h4>
          {description && (
            <p className="text-xs text-zinc-400 leading-relaxed mt-1">
              {description}
            </p>
          )}
        </div>

        {/* Command / Resource Snippet Box */}
        {(command || targetResource) && (
          <div className="space-y-1.5">
            {targetResource && (
              <div className="text-[11px] text-zinc-500 font-mono">
                Target: <span className="text-zinc-300">{targetResource}</span>
              </div>
            )}
            {command && (
              <div className="rounded-lg bg-zinc-900/90 border border-zinc-800/90 p-2.5 font-mono text-[11.5px] text-zinc-300 flex items-start gap-2 overflow-x-auto">
                <Terminal className="size-3.5 text-accent-400 mt-0.5 shrink-0" />
                <code className="text-zinc-200 select-all whitespace-pre">
                  {command}
                </code>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer Actions / State Status */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 bg-zinc-900/40 border-t border-zinc-800/70">
        {currentStatus === 'pending' && (
          <>
            <span className="text-[11px] text-zinc-500 font-medium">
              Requires operator clearance to proceed.
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleReject}
                disabled={isProcessing}
                className="inline-flex items-center justify-center gap-1.5 h-8 px-3.5 rounded-lg border border-zinc-700/80 bg-zinc-800/80 hover:bg-zinc-700 hover:text-white text-xs font-medium text-zinc-300 transition-colors disabled:opacity-50 cursor-pointer"
              >
                <X className="size-3.5" />
                Reject
              </button>
              <button
                type="button"
                onClick={handleApprove}
                disabled={isProcessing}
                className="inline-flex items-center justify-center gap-1.5 h-8 px-4 rounded-lg bg-accent-600 hover:bg-accent-500 active:scale-[0.98] border border-accent-400/40 text-xs font-semibold text-white shadow-sm transition-all disabled:opacity-50 cursor-pointer"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    Executing...
                  </>
                ) : (
                  <>
                    <Check className="size-3.5" />
                    Approve Execution
                  </>
                )}
              </button>
            </div>
          </>
        )}

        {currentStatus === 'executing' && (
          <div className="flex items-center gap-2 text-xs text-accent-400 font-medium w-full justify-center py-0.5">
            <Loader2 className="size-3.5 animate-spin" />
            Executing approved action on host system...
          </div>
        )}

        {currentStatus === 'approved' && (
          <div className="flex items-center justify-between w-full text-xs">
            <span className="inline-flex items-center gap-1.5 text-emerald-400 font-medium">
              <Check className="size-3.5" />
              Action Approved & Executed
            </span>
            <span className="font-mono text-[11px] text-zinc-500">
              Clearance logged
            </span>
          </div>
        )}

        {currentStatus === 'rejected' && (
          <div className="flex items-center justify-between w-full text-xs">
            <span className="inline-flex items-center gap-1.5 text-rose-400 font-medium">
              <X className="size-3.5" />
              Action Rejected by Operator
            </span>
            <span className="font-mono text-[11px] text-zinc-500">
              Execution blocked
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
