import Link from 'next/link';
import { redirect } from 'next/navigation';
import { isAuthenticatedNextjs } from '@/lib/convexAuth';
import { KlerkBrandLink } from '@/components/landing/KlerkLogo';
import { HeroKineticSection } from '@/components/landing/HeroKineticSection';
import { WorkflowBentoSection } from '@/components/landing/WorkflowBentoSection';
import { PricingSection } from '@/components/landing/PricingSection';
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
      {/* 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 backdrop-blur-md bg-[#0A0A0B]/85 border-b border-white/[0.06]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          <KlerkBrandLink href="/?landing=true" />

          <nav
            aria-label="Primary navigation"
            className="hidden md:flex items-center gap-7 text-xs font-medium text-zinc-400"
          >
            <a
              href="#how-it-works"
              className="hover:text-white no-underline transition-colors whitespace-nowrap shrink-0"
            >
              How it works
            </a>
            <a
              href="#workflows"
              className="hover:text-white no-underline transition-colors whitespace-nowrap shrink-0"
            >
              Workflows
            </a>
            <a
              href="#security"
              className="hover:text-white no-underline transition-colors whitespace-nowrap shrink-0"
            >
              Security
            </a>
            <a
              href="#pricing"
              className="hover:text-white no-underline transition-colors whitespace-nowrap shrink-0"
            >
              Pricing
            </a>
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            {authed ? (
              <Link
                href="/desk"
                className="bg-white text-black hover:bg-zinc-200 rounded-full px-4 py-1.5 text-xs font-semibold no-underline transition-colors whitespace-nowrap shrink-0"
              >
                Open Desk
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="text-xs font-medium text-zinc-300 hover:text-white no-underline px-2 py-1 transition-colors whitespace-nowrap shrink-0"
                >
                  Log in
                </Link>
                <Link
                  href="/signup"
                  className="bg-white text-black hover:bg-zinc-200 rounded-full px-4 py-1.5 text-xs font-semibold no-underline transition-colors whitespace-nowrap shrink-0"
                >
                  Start free
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        <HeroKineticSection />

        <WorkflowBentoSection />

        <PricingSection />
      </main>

      <ObsidianFooter />
    </div>
  );
}
