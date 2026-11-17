'use client';

import { useState, useEffect } from 'react';
import { Cpu, Zap, RotateCw, UploadCloud, ShieldCheck } from 'lucide-react';
import { StatusDot } from '@/components/ui/StatusDot';
import {
  getContractorSettingsAction,
  testSandboxConnectionAction,
} from '@/app/actions/settings';
import { useUsageSummaryQuery } from '@/lib/convex-react';
import type { ContractorSettings } from '@/types';

interface AIEngineTabProps {
  onOpenModelSetup?: () => void;
}

export function AIEngineTab({ onOpenModelSetup }: AIEngineTabProps) {
  const liveUsage = useUsageSummaryQuery();
  const [settings, setSettings] = useState<ContractorSettings | null>(null);
  const [health, setHealth] = useState<{
    boatSdkReady: boolean;
    stagehandReady: boolean;
    playwrightReady: boolean;
    headlessEnv: string;
    region: string;
    latencyMs: number;
  } | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  const runTest = async () => {
    setIsTesting(true);
    try {
      const res = await testSandboxConnectionAction();
      setHealth(res);
    } finally {
      setIsTesting(false);
    }
  };

  useEffect(() => {
    getContractorSettingsAction().then(setSettings);
    runTest();
  }, []);

  const usedUsd = liveUsage?.costUsd ?? settings?.openRouterUsedUsd ?? 0;
  const capUsd = liveUsage?.capUsd ?? settings?.openRouterSubKeyCapUsd ?? 15;
  const promptTokens = liveUsage?.promptTokens ?? 0;
  const completionTokens = liveUsage?.completionTokens ?? 0;
  const planTier = liveUsage?.planTier ?? settings?.planTier ?? 'starter';
  const pct =
    capUsd > 0 ? Math.min(100, Math.round((usedUsd / capUsd) * 100)) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-text-primary">
          OpenRouter Usage Ledger (${capUsd.toFixed(0)}/mo {planTier} cap)
        </h3>
        <p className="text-xs text-text-tertiary mt-1">
          DOM &amp; Q&amp;A tasks route to <code className="font-mono text-accent-300">deepseek/deepseek-v4-flash</code>; full tender PDF audits route to <code className="font-mono text-accent-300">anthropic/claude-sonnet-5.5</code>.
        </p>
      </div>

      <div className="p-4 rounded-xl bg-[#09090B]/70 border border-white/10 space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-text-primary">
            Monthly Usage ({liveUsage?.month ?? new Date().toISOString().slice(0, 7)})
          </span>
          <span className="font-mono text-accent-300 tabular-nums font-semibold">
            ${usedUsd.toFixed(4)} / ${capUsd.toFixed(2)} ({pct}%)
          </span>
        </div>
        <div className="h-2 w-full bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-accent-500 to-accent-300 rounded-full transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-[11px] font-mono text-zinc-500 tabular-nums">
          <span>Prompt tokens: {promptTokens.toLocaleString('en-ZA')}</span>
          <span>Completion tokens: {completionTokens.toLocaleString('en-ZA')}</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
          <div className="p-3 rounded-lg bg-[#121215] border border-white/10">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-text-primary">
              <Zap className="size-3.5 text-accent-400" />
              DOM / Chat / WhatsApp
            </div>
            <div className="font-mono text-[11px] text-accent-300 mt-1">
              deepseek/deepseek-v4-flash
            </div>
          </div>
          <div className="p-3 rounded-lg bg-[#121215] border border-white/10">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-text-primary">
              <Cpu className="size-3.5 text-accent-400" />
              Full Tender PDF &amp; SBD Audit
            </div>
            <div className="font-mono text-[11px] text-accent-300 mt-1">
              anthropic/claude-sonnet-5.5
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <h4 className="text-sm font-medium text-text-primary">
          boat.dev Ubuntu VM &amp; Stagehand Browser Sandbox
        </h4>
        <div className="flex items-center justify-between p-3.5 rounded-xl bg-[#09090B]/70 border border-white/10 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <StatusDot
              status={
                health?.stagehandReady && health?.boatSdkReady
                  ? 'success'
                  : 'warning'
              }
              pulse={Boolean(health?.stagehandReady)}
              size="md"
            />
            <div className="min-w-0">
              <div className="text-xs font-semibold text-text-primary">
                {health
                  ? `Stagehand + boat.dev (${health.region}) · ${health.latencyMs}ms`
                  : 'Checking sandbox...'}
              </div>
              <div className="text-[11px] text-text-tertiary font-mono truncate">
                HEADLESS={health?.headlessEnv ?? 'false'} · Playwright:{' '}
                {health?.playwrightReady ? 'ready' : 'pending'} · 10m live VM TTL
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={runTest}
            disabled={isTesting}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-text-primary transition-colors cursor-pointer border border-white/10 shrink-0"
          >
            <RotateCw className={`size-3 ${isTesting ? 'animate-spin' : ''}`} />
            Test Sandbox
          </button>
        </div>
      </div>

      {onOpenModelSetup && (
        <div className="p-3.5 rounded-xl bg-[#09090B]/70 border border-white/10 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-xs text-text-secondary">
            <ShieldCheck className="size-4 text-accent-400 shrink-0" />
            <span>Need to refresh expired CSD (7d) or CIPC/ID (90d) docs?</span>
          </div>
          <button
            type="button"
            onClick={onOpenModelSetup}
            className="px-3 py-1.5 rounded-lg bg-accent-600 hover:bg-accent-500 text-white text-xs font-medium flex items-center gap-1.5 cursor-pointer border-none shrink-0"
          >
            <UploadCloud className="size-3.5" />
            Open Compliance Uploader
          </button>
        </div>
      )}
    </div>
  );
}
