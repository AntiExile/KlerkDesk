import type { Metadata } from 'next';
import { LegalPageLayout } from '@/components/landing/LegalPageLayout';

export const metadata: Metadata = {
  title: 'Privacy Policy | KlerkDesk by MUNDUSMK (PTY) LTD',
  description:
    'POPIA privacy notice, Compliance Vault document encryption, and Meta WhatsApp Cloud API data handling for KlerkDesk.',
};

export default function PrivacyPolicyPage() {
  return (
    <LegalPageLayout
      title="Privacy Policy (POPIA)"
      badge="Protection of Personal Information Act, 2013"
      effectiveDate="17 November 2026"
    >
      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-white m-0">
          1. Responsible Party &amp; Information Officer
        </h2>
        <p className="m-0">
          <strong>MUNDUSMK (PTY) LTD</strong> (&ldquo;MUNDUSMK&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;), operating <strong>KlerkDesk</strong> at{' '}
          <code className="font-mono text-zinc-200">klerkdesk.mundusmk.co.za</code> from Oudtshoorn, Western Cape, South Africa, is the Responsible Party under the Protection of Personal Information Act 4 of 2013 (POPIA). For privacy requests, data exports, or deletion inquiries, contact our Information Officer at{' '}
          <a href="mailto:support@mundusmk.co.za" className="text-emerald-400 no-underline hover:underline">
            support@mundusmk.co.za
          </a>.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-white m-0">
          2. Information We Collect &amp; Process
        </h2>
        <ul className="list-disc pl-5 space-y-1.5 m-0">
          <li>
            <strong>Account &amp; Contractor Profile Data:</strong> Work email or username, Argon2id-hashed authentication credentials, company legal name, registration number, CSD supplier number (<code className="font-mono text-zinc-200">MAAA</code>), CIDB grading, and WhatsApp notification number.
          </li>
          <li>
            <strong>Compliance Vault Documents:</strong> User-uploaded PDFs and metadata for CSD Summary Reports, SARS Tax Compliance Status PINs, COIDA Letters of Good Standing, B-BBEE certificates, CIPC CoR 14.3 records, and certified director ID copies.
          </li>
          <li>
            <strong>Tender &amp; Operational Workspace Data:</strong> Bill of Quantities (BoQ) pricing schedules, stamped SBD 1 / 4 / 6.1 PDFs, conversational Q&amp;A messages, and Approval Shield audit records.
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-white m-0">
          3. Compliance Vault Security &amp; Retention Rules
        </h2>
        <p className="m-0">
          All Compliance Vault files are stored in encrypted, user-scoped Convex File Storage (<code className="font-mono text-zinc-200">storageId</code>) and indexed strictly by authenticated <code className="font-mono text-zinc-200">userId</code>. Browser automation sandboxes run with <code className="font-mono text-zinc-200">noEnv: true</code> and automatic 10-minute session termination so platform credentials and unrelated tenant records are never exposed. KlerkDesk enforces South African public procurement freshness checks (flagging CSD reports older than 7 days and certified CIPC/ID copies older than 90 days) and allows account holders to replace or remove expired documents at any time.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-white m-0">
          4. Meta WhatsApp Cloud API Consent &amp; Messaging
        </h2>
        <p className="m-0">
          When you configure a WhatsApp number in KlerkDesk, you explicitly opt in to receive tender alerts, compliance expiry warnings, and interactive Approval Shield confirmations via the Meta WhatsApp Cloud API. Inbound webhook payloads are verified using HMAC-SHA256 (<code className="font-mono text-zinc-200">X-Hub-Signature-256</code>) and <code className="font-mono text-zinc-200">crypto.timingSafeEqual</code>. You may disable WhatsApp alerts at any time by clearing your number in Settings or replying to pause notifications.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-white m-0">
          5. AI Processing &amp; Third-Party Sub-Processors
        </h2>
        <p className="m-0">
          Tender queries and document summaries are routed through Convex, OpenRouter AI language models, and isolated browser execution environments strictly to perform requested procurement analysis and returnable form preparation. We never sell contractor pricing, BoQ rates, or compliance records to third parties or competing bidders.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-white m-0">
          6. Your Rights Under POPIA
        </h2>
        <p className="m-0">
          You have the right to request access to personal and company records held by MUNDUSMK (PTY) LTD, request correction or deletion of outdated Compliance Vault documents, object to processing, or lodge a complaint with the Information Regulator of South Africa.
        </p>
      </section>
    </LegalPageLayout>
  );
}
