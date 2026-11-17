import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPageLayout } from '@/components/landing/LegalPageLayout';

export const metadata: Metadata = {
  title: 'Terms of Service | KlerkDesk by MUNDUSMK (PTY) LTD',
  description:
    'Terms of Service, Approval Shield human sign-off boundary, and subscription terms for KlerkDesk.',
};

export default function TermsOfServicePage() {
  return (
    <LegalPageLayout
      title="Terms of Service"
      badge="MUNDUSMK (PTY) LTD • Service Terms"
      effectiveDate="17 November 2026"
    >
      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-white m-0">
          1. Acceptance &amp; Platform Scope
        </h2>
        <p className="m-0">
          These Terms govern your access to <strong>KlerkDesk</strong> (<code className="font-mono text-zinc-200">klerkdesk.mundusmk.co.za</code>), operated by <strong>MUNDUSMK (PTY) LTD</strong>, Oudtshoorn, Western Cape, South Africa. By creating an account, launching a demo workspace, or connecting WhatsApp alerts, you agree to be bound by these Terms and our{' '}
          <Link href="/privacy" className="text-emerald-400 no-underline hover:underline">
            Privacy Policy
          </Link>.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-white m-0">
          2. Approval Shield &amp; Human-in-the-Loop Liability Boundary
        </h2>
        <p className="m-0">
          KlerkDesk assists contractors and operations teams by scanning public portals (including National Treasury eTenders OCDS feeds and municipal tender listings), checking Compliance Vault freshness rules (7-day CSD reports, 90-day certified CIPC/IDs, Tax PIN, COIDA, and B-BBEE expiry), calculating BoQ totals, and stamping SBD 1, 4, and 6.1 returnables.
        </p>
        <p className="m-0">
          <strong>Mandatory Human Sign-Off:</strong> External tender submissions on <code className="font-mono text-zinc-200">eTenders.gov.za</code>, outbound emails, and WhatsApp broadcasts pause in <code className="font-mono text-zinc-200">pending_approval</code> until explicitly approved by an authenticated operator in the Approval Shield (<code className="font-mono text-zinc-200">/bid/[id]</code>). You remain solely responsible for reviewing and verifying all tender pricing, BoQ unit rates, compulsory briefing attendance, compliance certificates, and final legal declarations prior to authorising submission. MUNDUSMK (PTY) LTD accepts no liability for tender disqualifications, missed closing deadlines, portal downtime, or pricing errors resulting from unverified user data or operator approvals.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-white m-0">
          3. Subscriptions, Pilot &amp; Billing
        </h2>
        <ul className="list-disc pl-5 space-y-1.5 m-0">
          <li>
            <strong>Contractor Pilot (R0 / 14 Days):</strong> Evaluation access for South African contractors to test tender matching, Compliance Vault monitoring, and SBD stamping.
          </li>
          <li>
            <strong>KlerkDesk Pro (R4,950 / month):</strong> Includes automated 06:30 SAST portal scans, SBD 1/4/6.1 stamping, live cloud browser staging, and Meta WhatsApp Approval Shield notifications. Subscriptions renew monthly unless cancelled prior to the next billing cycle.
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-white m-0">
          4. Acceptable Use &amp; Portal Compliance
        </h2>
        <p className="m-0">
          You may only use KlerkDesk for legitimate procurement workflows and authorised company accounts. You must not attempt to bypass portal access controls, upload forged compliance certificates, or exceed platform rate limits.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-white m-0">
          5. Governing Law &amp; Contact
        </h2>
        <p className="m-0">
          These Terms are governed by the laws of the Republic of South Africa. For support, billing, or enterprise workflow inquiries, email{' '}
          <a href="mailto:support@mundusmk.co.za" className="text-emerald-400 no-underline hover:underline">
            support@mundusmk.co.za
          </a>.
        </p>
      </section>
    </LegalPageLayout>
  );
}
