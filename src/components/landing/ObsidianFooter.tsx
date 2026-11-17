import Link from 'next/link';
import { KlerkBrandLink } from './KlerkLogo';

export function ObsidianFooter() {
  return (
    <footer className="border-t border-white/[0.06] bg-[#0A0A0B] py-12 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-2">
          <KlerkBrandLink />
          <p className="text-xs text-zinc-400 m-0">
            KlerkDesk — A product by <span className="text-zinc-200 font-medium">MUNDUSMK (PTY) LTD</span>, Oudtshoorn, Western Cape, South Africa
          </p>
        </div>

        <nav
          aria-label="Legal and security links"
          className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-zinc-400"
        >
          <Link
            href="/privacy"
            className="hover:text-white transition-colors no-underline"
          >
            Privacy Policy
          </Link>
          <Link
            href="/terms"
            className="hover:text-white transition-colors no-underline"
          >
            Terms of Service
          </Link>
          <Link
            href="/#security"
            className="hover:text-white transition-colors no-underline"
          >
            POPIA &amp; Approval Shield Security
          </Link>
          <a
            href="mailto:support@mundusmk.co.za"
            className="hover:text-white transition-colors no-underline text-emerald-400"
          >
            support@mundusmk.co.za
          </a>
        </nav>
      </div>
    </footer>
  );
}
