import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  ArrowRight,
  Bot,
  Check,
  Clock,
  FileCheck2,
  Lock,
  MessageSquareCheck,
  ShieldCheck,
} from 'lucide-react';
import { isAuthenticatedNextjs } from '@/lib/convexAuth';
import { KlerkBrandLink } from '@/components/landing/KlerkLogo';
import { LandingShowcase } from '@/components/landing/LandingShowcase';
import { ObsidianFooter } from '@/components/landing/ObsidianFooter';

export const dynamic = 'force-dynamic';

interface LandingPageProps {
  searchParams: Promise<{ landing?: string }>;
}

export default async function HomePage({ searchParams }: LandingPageProps) {
  const [authed, resolvedSearchParams] = await Promise.all([
    isAuthenticatedNextjs().catch(() => false),
    searchParams,
  ]);

  if (authed && resolvedSearchParams?.landing !== 'true') {
    redirect('/desk');
  }

  return (
    <div className="min-h-dvh bg-[#0A0A0B] text-zinc-100 scroll-smooth">
      {/* Minimalist Top Navbar */}
      <header className="sticky top-0 z-30 backdrop-blur-md bg-[#0A0A0B]/85 border-b border-white/[0.06]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <KlerkBrandLink href="/?landing=true" />

          <nav
            aria-label="Primary navigation"
            className="hidden md:flex items-center gap-7 text-xs font-medium text-zinc-400"
          >
            <a href="#how-it-works" className="hover:text-white no-underline transition-colors">
              How it works
            </a>
            <a href="#workflows" className="hover:text-white no-underline transition-colors">
              Workflows
            </a>
            <a href="#pricing" className="hover:text-white no-underline transition-colors">
              Pricing
            </a>
            <a href="#security" className="hover:text-white no-underline transition-colors">
              Security
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <span className="hidden lg:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#141416] border border-white/[0.08] text-[11px] text-zinc-400">
              <span className="size-1.5 rounded-full bg-emerald-400" />
              Powered by MundusMK
            </span>

            {authed ? (
              <Link
                href="/desk"
                className="bg-white text-black hover:bg-zinc-200 rounded-full px-4 py-1.5 text-xs font-medium no-underline transition-colors"
              >
                Open Desk
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="text-xs font-medium text-zinc-300 hover:text-white no-underline px-2 py-1 transition-colors"
                >
                  Log in
                </Link>
                <Link
                  href="/signup"
                  className="bg-white text-black hover:bg-zinc-200 rounded-full px-4 py-1.5 text-xs font-medium no-underline transition-colors"
                >
                  Start free
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        {/* Hero Section */}
        <section className="relative overflow-hidden pt-16 sm:pt-24 pb-14 px-4 sm:px-6">
          {/* Subtle radial obsidian glow */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(ellipse_at_top,rgba(52,211,153,0.12),transparent_65%)]"
          />

          <div className="relative max-w-4xl mx-auto text-center">
            {/* Oversized Display Wordmark with Stacked Outline Echoes & Floating Geometric Bot Badges */}
            <div className="relative inline-flex items-center justify-center select-none mb-6">
              <span
                aria-hidden="true"
                className="hidden sm:inline-flex absolute -left-16 -top-4 size-9 rounded-xl bg-[#141416] border border-white/10 items-center justify-center text-emerald-400/80 shadow-lg -rotate-6"
              >
                <Bot className="size-4" />
              </span>
              <span
                aria-hidden="true"
                className="hidden sm:inline-flex absolute -right-14 -bottom-2 size-8 rounded-lg bg-[#141416] border border-white/10 items-center justify-center text-emerald-300/75 shadow-lg rotate-6"
              >
                <ShieldCheck className="size-3.5" />
              </span>

              <div className="relative flex flex-col items-center">
                <span
                  aria-hidden="true"
                  className="text-5xl sm:text-7xl font-extrabold tracking-tighter text-transparent [-webkit-text-stroke:1px_rgba(52,211,153,0.14)] -mb-8 sm:-mb-11"
                >
                  KlerkDesk
                </span>
                <span
                  aria-hidden="true"
                  className="text-5xl sm:text-7xl font-extrabold tracking-tighter text-transparent [-webkit-text-stroke:1px_rgba(52,211,153,0.28)] -mb-8 sm:-mb-11"
                >
                  KlerkDesk
                </span>
                <span className="text-5xl sm:text-7xl font-extrabold tracking-tighter text-[#34D399]">
                  KlerkDesk
                </span>
              </div>
            </div>

            <h1 className="text-4xl sm:text-6xl font-bold tracking-tight text-white m-0">
              Your <span className="text-emerald-400">back office</span> on autopilot
            </h1>

            <p className="mt-5 text-base sm:text-lg text-zinc-400 max-w-xl mx-auto leading-relaxed">
              Autonomous AI agents with their own cloud desktop, compliance vault, and human Approval Shield. Built for South African tender procurement and modern operations teams.
            </p>

            {/* Dual Pill CTAs */}
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 rounded-full bg-white text-black hover:bg-zinc-200 px-6 py-3 text-sm font-semibold no-underline transition-colors"
              >
                <span>Launch KlerkDesk</span>
                <ArrowRight className="size-4" />
              </Link>
              <Link
                href="/login?demo=true"
                className="inline-flex items-center gap-2 rounded-full bg-[#18181B] hover:bg-[#202024] border border-white/10 text-white px-6 py-3 text-sm font-medium no-underline transition-colors"
              >
                <span>Live Interactive Demo</span>
              </Link>
            </div>

            <p className="mt-4 text-xs text-zinc-500">
              14-day pilot for SA contractors • Human sign-off before every submission • POPIA compliant
            </p>
          </div>
        </section>

        {/* Hero Showcase Frame */}
        <section id="how-it-works" className="px-4 sm:px-6 pb-20">
          <div className="max-w-5xl mx-auto">
            <LandingShowcase />
          </div>
        </section>

        {/* 3-Column Bento Feature Strip */}
        <section id="workflows" className="px-4 sm:px-6 py-16 border-t border-white/[0.06]">
          <div className="max-w-5xl mx-auto">
            <div className="mb-10 text-center max-w-2xl mx-auto">
              <p className="text-xs font-mono uppercase tracking-wider text-emerald-400 mb-2">
                Autonomous Tender Ops &amp; Back-Office Workflows
              </p>
              <h2 className="text-2xl sm:text-4xl font-bold tracking-tight text-white m-0">
                Built for zero missed tenders and zero expired certificates
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="rounded-2xl bg-[#111113] border border-white/10 p-6 space-y-3">
                <div className="size-10 rounded-xl bg-emerald-500/10 border border-emerald-400/20 flex items-center justify-center text-emerald-400">
                  <Clock className="size-5" />
                </div>
                <h3 className="text-base font-semibold text-white m-0">
                  06:30 AM Autonomous Scans
                </h3>
                <p className="text-sm text-zinc-400 leading-relaxed m-0">
                  Monitors eTenders OCDS &amp; municipal portals daily and matches against your CIDB &amp; compliance profile.
                </p>
              </div>

              <div className="rounded-2xl bg-[#111113] border border-white/10 p-6 space-y-3">
                <div className="size-10 rounded-xl bg-emerald-500/10 border border-emerald-400/20 flex items-center justify-center text-emerald-400">
                  <FileCheck2 className="size-5" />
                </div>
                <h3 className="text-base font-semibold text-white m-0">
                  Compliance Vault &amp; Auto-Stamping
                </h3>
                <p className="text-sm text-zinc-400 leading-relaxed m-0">
                  Tracks 7-day CSD &amp; 90-day CIPC expiry rules and stamps SBD 1, 4, and 6.1 returnables automatically.
                </p>
              </div>

              <div className="rounded-2xl bg-[#111113] border border-white/10 p-6 space-y-3">
                <div className="size-10 rounded-xl bg-emerald-500/10 border border-emerald-400/20 flex items-center justify-center text-emerald-400">
                  <MessageSquareCheck className="size-5" />
                </div>
                <h3 className="text-base font-semibold text-white m-0">
                  WhatsApp Approval Shield
                </h3>
                <p className="text-sm text-zinc-400 leading-relaxed m-0">
                  Every submission pauses in <code className="font-mono text-zinc-200">pending_approval</code> until you review the BoQ and tap Approve on WhatsApp or web.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Security Section */}
        <section id="security" className="px-4 sm:px-6 py-16 border-t border-white/[0.06]">
          <div className="max-w-5xl mx-auto rounded-2xl bg-[#111113] border border-white/10 p-6 sm:p-10">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-emerald-400">
                  <Lock className="size-3.5" />
                  <span>POPIA Compliant</span>
                </div>
                <h3 className="text-base font-semibold text-white m-0">
                  Encrypted Compliance Vault
                </h3>
                <p className="text-sm text-zinc-400 leading-relaxed m-0">
                  CSD reports, SARS Tax PINs, CIPC CoR 14.3, and certified director IDs remain isolated inside user-scoped Convex storage.
                </p>
              </div>

              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-emerald-400">
                  <ShieldCheck className="size-3.5" />
                  <span>Zero Unapproved Actions</span>
                </div>
                <h3 className="text-base font-semibold text-white m-0">
                  Mandatory Approval Shield
                </h3>
                <p className="text-sm text-zinc-400 leading-relaxed m-0">
                  Agents can read, extract, and stamp returnables, but never submit on eTenders.gov.za or send external broadcasts without explicit director sign-off.
                </p>
              </div>

              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-emerald-400">
                  <Bot className="size-3.5" />
                  <span>Isolated Desktops</span>
                </div>
                <h3 className="text-base font-semibold text-white m-0">
                  Zero-Secret Cloud Browser
                </h3>
                <p className="text-sm text-zinc-400 leading-relaxed m-0">
                  Every portal browser sandbox launches with <code className="font-mono text-zinc-200">noEnv: true</code> and a 10-minute TTL so platform keys never enter client sessions.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Transparent Pricing Section */}
        <section id="pricing" className="px-4 sm:px-6 py-16 border-t border-white/[0.06]">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-10">
              <p className="text-xs font-mono uppercase tracking-wider text-emerald-400 mb-2">
                Transparent Pricing
              </p>
              <h2 className="text-2xl sm:text-4xl font-bold tracking-tight text-white m-0">
                Start free, scale when your bids ship
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Pilot Plan */}
              <div className="rounded-2xl bg-[#111113] border border-white/10 p-7 flex flex-col justify-between gap-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-white">
                      Contractor Pilot
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-white/[0.06] text-[11px] text-zinc-300">
                      14 Days
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl sm:text-4xl font-bold text-white tabular-nums">
                      R0
                    </span>
                    <span className="text-sm text-zinc-500">/ 14 Days</span>
                  </div>
                  <p className="text-sm text-zinc-400 m-0">
                    Validate live eTenders matching, Compliance Vault expiry checks, and SBD returnable stamping with zero commitment.
                  </p>
                  <ul className="space-y-2.5 text-sm text-zinc-300 list-none p-0 m-0">
                    <li className="flex items-center gap-2">
                      <Check className="size-4 text-emerald-400 shrink-0" />
                      <span>Daily OCDS &amp; Western Cape municipal matching</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="size-4 text-emerald-400 shrink-0" />
                      <span>7-day CSD &amp; 90-day CIPC/ID Compliance Vault alerts</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="size-4 text-emerald-400 shrink-0" />
                      <span>Interactive BoQ &amp; clean SBD 1 / 4 / 6.1 PDF stamping</span>
                    </li>
                  </ul>
                </div>

                <Link
                  href="/signup"
                  className="w-full inline-flex items-center justify-center rounded-full bg-[#18181B] hover:bg-[#222227] border border-white/10 text-white py-2.5 text-sm font-medium no-underline transition-colors"
                >
                  Start 14-day pilot
                </Link>
              </div>

              {/* Pro Plan */}
              <div className="rounded-2xl bg-[#111113] border border-emerald-400/35 p-7 flex flex-col justify-between gap-6 shadow-xl shadow-emerald-950/20">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-white">
                      KlerkDesk Pro
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-400/25 text-[11px] font-medium text-emerald-300">
                      Production
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl sm:text-4xl font-bold text-white tabular-nums">
                      R4,950
                    </span>
                    <span className="text-sm text-zinc-500">/ month</span>
                  </div>
                  <p className="text-sm text-zinc-400 m-0">
                    Unlimited scans, SBD stamping, live cloud browser &amp; WhatsApp alerts for active construction and supply teams.
                  </p>
                  <ul className="space-y-2.5 text-sm text-zinc-300 list-none p-0 m-0">
                    <li className="flex items-center gap-2">
                      <Check className="size-4 text-emerald-400 shrink-0" />
                      <span>Unlimited 06:30 SAST OCDS + municipal portal scans</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="size-4 text-emerald-400 shrink-0" />
                      <span>Live cloud desktop browser staging &amp; SBD 1/4/6.1 stamping</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="size-4 text-emerald-400 shrink-0" />
                      <span>WhatsApp Approval Shield alerts &amp; director Q&amp;A</span>
                    </li>
                  </ul>
                </div>

                <Link
                  href="/signup"
                  className="w-full inline-flex items-center justify-center rounded-full bg-white text-black hover:bg-zinc-200 py-2.5 text-sm font-semibold no-underline transition-colors"
                >
                  Launch KlerkDesk Pro
                </Link>
              </div>
            </div>

            <div className="mt-8 text-center">
              <a
                href="mailto:support@mundusmk.co.za?subject=Enterprise%20%2F%20Custom%20Agent%20Workflows"
                className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-emerald-400 no-underline transition-colors"
              >
                <span>Enterprise / Custom Agent Workflows</span>
                <ArrowRight className="size-3.5" />
              </a>
            </div>
          </div>
        </section>
      </main>

      <ObsidianFooter />
    </div>
  );
}
