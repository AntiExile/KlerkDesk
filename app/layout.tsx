import { Suspense, type ReactNode } from 'react';
import type { Metadata } from 'next';
import { Geist, Geist_Mono, Inter } from 'next/font/google';
import { ConvexAuthNextjsServerProvider } from '@/lib/convexAuth';
import { ConvexClientProvider } from '@/lib/convex-react';
import './globals.css';

const geistSans = Geist({
  subsets: ['latin'],
  variable: '--font-geist-sans',
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
});

export const metadata: Metadata = {
  title: 'KlerkDesk — Autonomous Back Office & Tender Ops | MUNDUSMK',
  description:
    'Autonomous AI agents with a dedicated cloud desktop, POPIA compliance vault, and human Approval Shield for South African tender procurement and operations teams.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  const hasConvexUrl = Boolean(
    convexUrl &&
      convexUrl.startsWith('https://') &&
      !convexUrl.includes('your-deployment')
  );

  return (
    <html
      lang="en"
      className={`dark ${geistSans.variable} ${inter.variable} ${geistMono.variable}`}
    >
      <body className="bg-[#0A0A0B] text-zinc-100 antialiased">
        {hasConvexUrl ? (
          <Suspense>
            <ConvexAuthNextjsServerProvider>
              <ConvexClientProvider>{children}</ConvexClientProvider>
            </ConvexAuthNextjsServerProvider>
          </Suspense>
        ) : (
          <ConvexClientProvider>{children}</ConvexClientProvider>
        )}
      </body>
    </html>
  );
}
