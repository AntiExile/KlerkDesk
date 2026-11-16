'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Play,
  RotateCw,
  FileCheck2,
  Download,
  Lock,
  ShieldAlert,
  ShieldCheck,
  Save,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import { formatSpacedRand, getShortTenderLabel } from '@/lib/format';
import {
  useResolveApprovalShieldMutation,
  useSaveBoqMutation,
  useStampSbdMutation,
  useTriggerApprovalShieldMutation,
} from '@/lib/convex-react';
import { ActionApproval } from '@/components/chat/ActionApproval';
import { startBoatSessionAction } from '@/app/actions/bid';
import type { StampedSbdResult } from '@/lib/pdf-stamp';
import type {
  ApprovalShieldState,
  BoatSessionInfo,
  BoQItem,
  ComplianceSummary,
  TenderMatch,
} from '@/types';

interface LiveSandboxDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  tender: TenderMatch;
  boqItems: BoQItem[];
  onBoqChange: (items: BoQItem[]) => void;
  compliance: ComplianceSummary;
  approvals: ApprovalShieldState[];
  stagedPdf: StampedSbdResult | null;
  onOpenVaultModal: () => void;
}

function formatCountdown(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function LiveSandboxDrawer({
  isOpen,
  onClose,
  tender,
  boqItems,
  onBoqChange,
  compliance,
  approvals,
  stagedPdf,
  onOpenVaultModal,
}: LiveSandboxDrawerProps) {
  const saveBoq = useSaveBoqMutation();
  const stampSbd = useStampSbdMutation();
  const triggerApproval = useTriggerApprovalShieldMutation();
  const resolveApproval = useResolveApprovalShieldMutation();

  const [boatSession, setBoatSession] = useState<BoatSessionInfo | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(600);
  const [isStartingVm, setIsStartingVm] = useState(false);
  const [isStamping, setIsStamping] = useState(false);
  const [isSavingBoq, setIsSavingBoq] = useState(false);
  const [boqSaved, setBoqSaved] = useState(false);
  const [isStagingApproval, setIsStagingApproval] = useState(false);

  const subtotalZar = useMemo(
    () =>
      boqItems.reduce(
        (sum, row) => sum + Number(row.quantity) * Number(row.rateZar),
        0
      ),
    [boqItems]
  );
  const vatZar = useMemo(
    () => Math.round(subtotalZar * 0.15 * 100) / 100,
    [subtotalZar]
  );
  const grandTotalZar = useMemo(
    () => Math.round((subtotalZar + vatZar) * 100) / 100,
    [subtotalZar, vatZar]
  );

  useEffect(() => {
    if (!boatSession || boatSession.status !== 'running') return;
    const timer = setInterval(() => {
      setRemainingSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [boatSession]);

  const handleLaunchVm = async () => {
    setIsStartingVm(true);
    try {
      const session = await startBoatSessionAction(tender.id, tender.portalUrl);
      setBoatSession(session);
      setRemainingSeconds(session.ttlSeconds);
    } finally {
      setIsStartingVm(false);
    }
  };

  const handleEditBoqCell = (
    id: string,
    field: 'quantity' | 'rateZar',
    raw: string
  ) => {
    const val = Math.max(0, Number(raw) || 0);
    setBoqSaved(false);
    onBoqChange(
      boqItems.map((item) => {
        if (item.id !== id) return item;
        const qty = field === 'quantity' ? val : item.quantity;
        const rate = field === 'rateZar' ? val : item.rateZar;
        return {
          ...item,
          quantity: qty,
          rateZar: rate,
          amountZar: Math.round(qty * rate * 100) / 100,
        };
      })
    );
  };

  const handleSaveBoq = async () => {
    setIsSavingBoq(true);
    try {
      const saved = await saveBoq(tender.id, boqItems);
      onBoqChange(saved);
      setBoqSaved(true);
    } finally {
      setIsSavingBoq(false);
    }
  };

  const handleStampSbd = async () => {
    setIsStamping(true);
    try {
      await stampSbd({
        bidId: tender.id,
        grandTotalZar,
      });
    } finally {
      setIsStamping(false);
    }
  };

  const handleDownloadPdf = () => {
    if (!stagedPdf) return;
    const bytes = Uint8Array.from(atob(stagedPdf.base64Pdf), (c) =>
      c.charCodeAt(0)
    );
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = stagedPdf.fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRequestSubmitApproval = async () => {
    setIsStagingApproval(true);
    try {
      await triggerApproval({
        bidId: tender.id,
        tenderNumber: tender.tenderNumber,
        actionType: 'submit_etenders',
        totalBidZar: subtotalZar,
        vatZar,
        grandTotalZar,
        targetResource: tender.portalUrl,
        commandPreview: `stagehand.submitBid({ tender: "${tender.tenderNumber}", total: "${formatSpacedRand(grandTotalZar, 2)}" })`,
        boatSessionId: boatSession?.sessionId ?? null,
      });
    } finally {
      setIsStagingApproval(false);
    }
  };

  const latestApproval = approvals[0] ?? null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.aside
          initial={{ opacity: 0, x: 36 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 36 }}
          transition={{ type: 'spring', stiffness: 400, damping: 34 }}
          className="fixed inset-y-0 right-0 z-30 lg:static w-full sm:w-[480px] xl:w-[540px] h-dvh bg-[#111113] border-l border-white/[0.06] flex flex-col shrink-0 shadow-2xl shadow-black/80"
        >
          {/* Drawer Header */}
          <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between gap-2 shrink-0">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-zinc-100 truncate">
                  {getShortTenderLabel(tender)}
                </span>
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-[10px] text-zinc-300 shrink-0">
                  <span className="size-1.5 rounded-full bg-emerald-400" />
                  Live Sandbox • 60fps
                </span>
              </div>
              <div className="text-[11px] font-mono text-zinc-500 tabular-nums mt-0.5">
                {tender.tenderNumber} • CIDB {tender.cidbGrade} • TTL{' '}
                {formatCountdown(remainingSeconds)}
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close live sandbox drawer"
              className="size-8 rounded-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] flex items-center justify-center text-zinc-400 hover:text-zinc-100 cursor-pointer transition-colors shrink-0"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* Scrollable Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            {/* 1. boat.dev 10m Live Browser Frame */}
            <section className="rounded-2xl bg-[#18181B] border border-white/[0.06] overflow-hidden">
              <div className="px-3.5 py-2.5 border-b border-white/[0.06] flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-400 min-w-0">
                  <Lock className="size-3 text-emerald-400 shrink-0" />
                  <span className="truncate">{tender.portalUrl}</span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={handleStampSbd}
                    disabled={isStamping}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.08] text-[11px] font-medium text-zinc-200 cursor-pointer"
                  >
                    {isStamping ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <FileCheck2 className="size-3" />
                    )}
                    <span>Stamp SBD</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleLaunchVm}
                    disabled={isStartingVm}
                    className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-zinc-100 hover:bg-white text-zinc-950 text-[11px] font-semibold border-none cursor-pointer"
                  >
                    {isStartingVm ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : boatSession ? (
                      <RotateCw className="size-3" />
                    ) : (
                      <Play className="size-3" />
                    )}
                    <span>{boatSession ? 'Reset VM' : 'Launch 10m VM'}</span>
                  </button>
                </div>
              </div>

              {boatSession?.desktopUrl ? (
                <iframe
                  src={boatSession.desktopUrl}
                  title={`boat.dev desktop session for ${tender.tenderNumber}`}
                  className="w-full h-[260px] border-none bg-[#0C0C0D]"
                  allow="clipboard-read; clipboard-write"
                />
              ) : (
                <div className="p-4 bg-[#0C0C0D]/70 space-y-3">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-zinc-300 font-medium">
                      {boatSession
                        ? `Session ${boatSession.sessionId} (noEnv: true)`
                        : 'eTenders.gov.za Staging Sandbox Ready'}
                    </span>
                    <span className="text-[10.5px] font-mono text-zinc-500">
                      HEADLESS=false
                    </span>
                  </div>

                  {stagedPdf && (
                    <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[#1C1C1F] border border-white/[0.06] text-xs">
                      <span className="flex items-center gap-1.5 text-emerald-300">
                        <CheckCircle2 className="size-3.5" />
                        <span>
                          Staged {stagedPdf.pageCount} pages ({stagedPdf.stampingMethod})
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={handleDownloadPdf}
                        className="inline-flex items-center gap-1 text-[11px] text-zinc-200 hover:text-white bg-transparent border-none cursor-pointer"
                      >
                        <Download className="size-3" />
                        <span>{stagedPdf.fileName}</span>
                      </button>
                    </div>
                  )}

                  {boatSession && (
                    <div className="space-y-1">
                      {boatSession.stagehandSteps.map((step, i) => (
                        <div
                          key={i}
                          className="text-[11px] font-mono text-zinc-400 flex items-center gap-2"
                        >
                          <CheckCircle2 className="size-3 text-emerald-400 shrink-0" />
                          <span className="truncate">{step}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* 2. Interactive BoQ Rand Pricing Table */}
            <section className="rounded-2xl bg-[#18181B] border border-white/[0.06] p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-semibold text-zinc-100 m-0">
                    BoQ Pricing Schedule
                  </h3>
                  <p className="text-[11px] text-zinc-500 m-0">
                    Adjust rates before generating SBD 1 offer total
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleSaveBoq}
                  disabled={isSavingBoq}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.08] text-[11px] font-medium text-zinc-200 cursor-pointer"
                >
                  {isSavingBoq ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Save className="size-3" />
                  )}
                  <span>{boqSaved ? 'Saved' : 'Save BoQ'}</span>
                </button>
              </div>

              <div
                tabIndex={0}
                role="region"
                aria-labelledby="boq-table-caption"
                className="table-wrapper rounded-xl border border-white/[0.06] bg-[#111113]"
              >
                <table className="boq-table text-xs">
                  <caption id="boq-table-caption" className="sr-only">
                    Bill of Quantities pricing items for {tender.tenderNumber}
                  </caption>
                  <thead>
                    <tr className="border-b border-white/[0.06] text-[10.5px] uppercase tracking-wider text-zinc-500">
                      <th scope="col" className="text-left px-3 py-2 font-medium">
                        Code
                      </th>
                      <th scope="col" className="text-left px-3 py-2 font-medium">
                        Item Description
                      </th>
                      <th scope="col" className="text-left px-3 py-2 font-medium">
                        Unit
                      </th>
                      <th scope="col" className="text-right px-3 py-2 font-medium">
                        Qty
                      </th>
                      <th scope="col" className="text-right px-3 py-2 font-medium">
                        Rate (R)
                      </th>
                      <th scope="col" className="text-right px-3 py-2 font-medium">
                        Total (R)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {boqItems.map((item) => {
                      const lineTotal =
                        Number(item.quantity) * Number(item.rateZar);
                      return (
                        <tr
                          key={item.id}
                          className="border-b border-white/[0.04] last:border-b-0"
                        >
                          <th
                            scope="row"
                            className="text-left px-3 py-2 font-mono text-zinc-300 font-medium whitespace-nowrap"
                          >
                            {item.itemCode}
                          </th>
                          <td className="px-3 py-2 text-zinc-200 min-w-[160px]">
                            <div className="truncate max-w-[200px]" title={item.description}>
                              {item.description}
                            </div>
                          </td>
                          <td className="px-3 py-2 font-mono text-zinc-400 whitespace-nowrap">
                            {item.unit}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <input
                              type="number"
                              min={0}
                              step="any"
                              aria-label={`Quantity for ${item.itemCode}`}
                              value={item.quantity}
                              onChange={(e) =>
                                handleEditBoqCell(
                                  item.id,
                                  'quantity',
                                  e.target.value
                                )
                              }
                              className="w-16 text-right font-mono tabular-nums rounded-md bg-[#0C0C0D] border border-white/10 px-1.5 py-1 text-[11px] text-zinc-100 outline-none focus:border-white/25"
                            />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <input
                              type="number"
                              min={0}
                              step="any"
                              aria-label={`Rate for ${item.itemCode}`}
                              value={item.rateZar}
                              onChange={(e) =>
                                handleEditBoqCell(
                                  item.id,
                                  'rateZar',
                                  e.target.value
                                )
                              }
                              className="w-24 text-right font-mono tabular-nums rounded-md bg-[#0C0C0D] border border-white/10 px-1.5 py-1 text-[11px] text-zinc-100 outline-none focus:border-white/25"
                            />
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-medium text-zinc-100 tabular-nums whitespace-nowrap">
                            {formatSpacedRand(lineTotal)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-1 text-[11px]">
                <div className="px-3 py-2 rounded-xl bg-[#111113] border border-white/[0.05]">
                  <div className="text-zinc-500">Subtotal</div>
                  <div className="font-mono font-medium text-zinc-200 tabular-nums mt-0.5">
                    {formatSpacedRand(subtotalZar)}
                  </div>
                </div>
                <div className="px-3 py-2 rounded-xl bg-[#111113] border border-white/[0.05]">
                  <div className="text-zinc-500">VAT (15%)</div>
                  <div className="font-mono font-medium text-zinc-300 tabular-nums mt-0.5">
                    {formatSpacedRand(vatZar)}
                  </div>
                </div>
                <div className="px-3 py-2 rounded-xl bg-[#1C1C1F] border border-white/10">
                  <div className="text-zinc-400">Bid Offer</div>
                  <div className="font-mono font-semibold text-zinc-100 tabular-nums mt-0.5">
                    {formatSpacedRand(grandTotalZar)}
                  </div>
                </div>
              </div>
            </section>

            {/* 3. Approval Shield Sign-off */}
            <section className="rounded-2xl bg-[#18181B] border border-white/[0.06] p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-xs font-semibold text-zinc-100 flex items-center gap-1.5 m-0">
                    {compliance.isBidReady ? (
                      <ShieldCheck className="size-3.5 text-emerald-400" />
                    ) : (
                      <ShieldAlert className="size-3.5 text-amber-400" />
                    )}
                    <span>Approval Shield</span>
                  </h3>
                  <p className="text-[11px] text-zinc-400 mt-1 m-0">
                    Submission pauses in Convex <code className="font-mono">pendingApprovals</code> until you explicitly sign off.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleRequestSubmitApproval}
                  disabled={isStagingApproval}
                  className="px-3.5 py-1.5 rounded-full bg-zinc-100 hover:bg-white text-zinc-950 text-[11px] font-semibold border-none cursor-pointer shrink-0 disabled:opacity-50"
                >
                  {isStagingApproval ? 'Staging...' : 'Approve & Submit Bid'}
                </button>
              </div>

              {!compliance.isBidReady && (
                <div className="rounded-xl bg-[#111113] border border-amber-500/20 px-3 py-2.5 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-amber-200/90">
                    {compliance.blockingAlerts.length} compliance docs need refresh before final sign-off.
                  </span>
                  <button
                    type="button"
                    onClick={onOpenVaultModal}
                    className="px-2.5 py-1 rounded-full bg-white/[0.06] hover:bg-white/[0.1] border border-white/10 text-[11px] text-zinc-200 cursor-pointer shrink-0"
                  >
                    Open Vault
                  </button>
                </div>
              )}

              {latestApproval && (
                <ActionApproval
                  id={latestApproval.id}
                  title={`Sign off ${latestApproval.tenderNumber}`}
                  description={`Total offer ${formatSpacedRand(latestApproval.grandTotalZar, 2)} (incl. VAT)`}
                  targetResource={latestApproval.targetResource}
                  command={latestApproval.commandPreview}
                  riskLevel={compliance.isBidReady ? 'low' : 'high'}
                  confidenceScore={compliance.isBidReady ? 0.98 : 0.72}
                  status={
                    latestApproval.status === 'executed'
                      ? 'approved'
                      : latestApproval.status === 'rejected'
                        ? 'rejected'
                        : 'pending'
                  }
                  disabled={!compliance.isBidReady}
                  onApprove={async (id) => {
                    if (!id) return;
                    await resolveApproval({
                      bidId: tender.id,
                      approvalId: id,
                      decision: 'approved',
                    });
                  }}
                  onReject={async (id) => {
                    if (!id) return;
                    await resolveApproval({
                      bidId: tender.id,
                      approvalId: id,
                      decision: 'rejected',
                    });
                  }}
                />
              )}
            </section>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
