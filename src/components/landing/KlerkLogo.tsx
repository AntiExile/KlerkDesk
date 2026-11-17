import Link from 'next/link';

export function KlerkEmblem({ className = 'size-7' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-lg bg-[#141416] border border-white/10 shadow-inner ${className}`}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className="size-4 text-emerald-400"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M5 4V20M19 4L10 12L19 20"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="18.5" cy="12" r="2" fill="currentColor" />
      </svg>
    </span>
  );
}

export function KlerkBrandLink({ href = '/?landing=true' }: { href?: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2.5 text-sm font-semibold tracking-tight text-white no-underline hover:opacity-90 transition-opacity"
    >
      <KlerkEmblem />
      <span>KlerkDesk</span>
    </Link>
  );
}
