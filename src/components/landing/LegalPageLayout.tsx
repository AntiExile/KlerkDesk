import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { KlerkBrandLink } from './KlerkLogo';
import { ObsidianFooter } from './ObsidianFooter';

export function LegalPageLayout({
  title,
  badge,
  effectiveDate,
  children,
}: {
  title: string;
  badge: string;
  effectiveDate: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-[#0A0A0B] text-zinc-100 flex flex-col">
      <header className="border-b border-white/[0.06] bg-[#0A0A0B]/90 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <KlerkBrandLink href="/?landing=true" />

          <div className="flex items-center gap-3">
            <Link
              href="/?landing=true"
              className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white no-underline transition-colors"
            >
              <ArrowLeft className="size-3.5" />
              <span>Back to KlerkDesk</span>
            </Link>
            <Link
              href="/login"
              className="bg-white text-black hover:bg-zinc-200 rounded-full px-4 py-1.5 text-xs font-medium no-underline transition-colors"
            >
              Log in
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 px-4 sm:px-6 py-12 sm:py-16">
        <article className="max-w-3xl mx-auto space-y-8">
          <div className="space-y-3 border-b border-white/[0.06] pb-6">
            <span className="block text-[11px] font-medium uppercase tracking-wider text-emerald-400">
              {badge}
            </span>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white m-0">
              {title}
            </h1>
            <p className="text-xs text-zinc-500 m-0">
              MUNDUSMK (PTY) LTD • Effective Date: {effectiveDate} • Oudtshoorn, Western Cape, South Africa
            </p>
          </div>

          <div className="space-y-7 text-sm text-zinc-300 leading-relaxed">
            {children}
          </div>
        </article>
      </main>

      <ObsidianFooter />
    </div>
  );
}
