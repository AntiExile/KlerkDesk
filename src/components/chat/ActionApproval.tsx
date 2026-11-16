'use client';

import { useEffect, useState } from 'react';
import { ShieldAlert, ShieldCheck, Check, X, Loader2 } from 'lucide-react';
import type { ActionApprovalData } from '@/types';

export interface ActionApprovalProps extends Partial<ActionApprovalData> {
  onApprove?: (actionId?: string) => void | Promise<void>;
  onReject?: (actionId?: string) => void | Promise<void>;
  disabled?: boolean;
  className?: string;
}

export function ActionApproval({
  id = 'act-1',
  title = 'Approval Shield',
  description = 'Submission pauses in pending_approval until you sign off.',
  command,
  targetResource,
  riskLevel = 'medium',
  status: initialStatus = 'pending',
  onApprove,
  onReject,
  disabled = false,
  className = '',
}: ActionApprovalProps) {
  const [currentStatus, setCurrentStatus] = useState<
    'pending' | 'approved' | 'rejected' | 'executing'
  >(initialStatus);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    setCurrentStatus(initialStatus);
  }, [initialStatus]);

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

  const isBlocked = riskLevel === 'high' || riskLevel === 'critical';

  return (
    <div
      className={`w-full overflow-hidden rounded-2xl border border-white/[0.08] bg-[#141416] ${className}`}
    >
      <div className="p-3.5 space-y-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            {isBlocked ? (
              <ShieldAlert className="size-4 text-amber-400 shrink-0 mt-0.5" />
            ) : (
              <ShieldCheck className="size-4 text-emerald-400 shrink-0 mt-0.5" />
            )}
            <div className="min-w-0">
              <div className="text-xs font-semibold text-zinc-100">{title}</div>
              {description && (
                <p className="text-[11.5px] text-zinc-400 mt-0.5 m-0">
                  {description}
                </p>
              )}
            </div>
          </div>
        </div>

        {(command || targetResource) && (
          <div className="rounded-xl bg-[#0C0C0D] border border-white/[0.06] px-3 py-2 font-mono text-[11px] text-zinc-400 truncate">
            {targetResource || command}
          </div>
        )}
      </div>

      <div className="px-3.5 py-2.5 border-t border-white/[0.06] bg-[#111113] flex items-center justify-between gap-2">
        {currentStatus === 'pending' && (
          <>
            <span className="text-[11px] text-zinc-500">
              Waiting on your yes
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleReject}
                disabled={isProcessing}
                className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-[11px] font-medium text-zinc-300 cursor-pointer"
              >
                <X className="size-3" />
                Hold
              </button>
              <button
                type="button"
                onClick={handleApprove}
                disabled={isProcessing || disabled}
                className="inline-flex items-center gap-1 px-3.5 py-1 rounded-full bg-zinc-100 hover:bg-white text-zinc-950 text-[11px] font-semibold border-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isProcessing ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Check className="size-3" />
                )}
                Approve &amp; Submit
              </button>
            </div>
          </>
        )}

        {currentStatus === 'executing' && (
          <div className="flex items-center gap-2 text-[11px] text-zinc-300 w-full justify-center">
            <Loader2 className="size-3 animate-spin" />
            <span>Executing approved submission...</span>
          </div>
        )}

        {currentStatus === 'approved' && (
          <div className="flex items-center justify-between w-full text-[11px] text-emerald-400">
            <span className="inline-flex items-center gap-1.5 font-medium">
              <Check className="size-3.5" />
              Signed off &amp; executed
            </span>
            <span className="font-mono text-zinc-500">Committed</span>
          </div>
        )}

        {currentStatus === 'rejected' && (
          <div className="flex items-center justify-between w-full text-[11px] text-zinc-400">
            <span className="inline-flex items-center gap-1.5">
              <X className="size-3.5 text-rose-400" />
              Held by operator
            </span>
            <span className="font-mono text-zinc-600">Shield closed</span>
          </div>
        )}
      </div>
    </div>
  );
}
