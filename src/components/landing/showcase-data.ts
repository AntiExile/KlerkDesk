export interface ChecklistRow {
  label: string;
  detail: string;
  status: 'ok' | 'warn';
}

export interface ApprovalPrompt {
  title: string;
  detail: string;
  primaryCta: string;
  secondaryCta: string;
  approvedTitle: string;
  approvedMessage: string;
}

export interface ShowcaseScenario {
  id: string;
  autopilotWord: string;
  botName: string;
  botRole: string;
  modelName: string;
  threadTitle: string;
  sidebarStatus: string;
  tenderNumber: string;
  municipality: string;
  boqTotal: string;
  timestampLabel: string;
  agentOpening: string;
  userFollowUp: string;
  agentChecklistIntro: string;
  checklist: ChecklistRow[];
  approval: ApprovalPrompt;
  quickPrompts: string[];
}

export const SHOWCASE_SCENARIOS: ShowcaseScenario[] = [
  {
    id: 'chief-of-staff',
    autopilotWord: 'back office',
    botName: 'Chief of Staff',
    botRole: 'Daily Scan & Bid Staging',
    modelName: 'Claude Sonnet 5.5',
    threadTitle: 'George — York St Upgrade',
    sidebarStatus: 'Waiting on your yes · R 17.1M',
    tenderNumber: 'T/GEO/042/2026',
    municipality: 'George Municipality',
    boqTotal: 'R 17 077 500.00',
    timestampLabel: 'Today 06:30 AM SAST',
    agentOpening:
      '06:30 SAST scan matched T/GEO/042/2026 (York St & Stormwater Phase 2, 96% CIDB 6CE fit). Stamped SBD 1, 4 & 6.1 and reconciled BoQ + 15% VAT at R 17 077 500.00.',
    userFollowUp: 'Nice catch — did it pass the Compliance Vault?',
    agentChecklistIntro:
      'Two certificates cleared automatically, one document needs a fresh download before eTenders staging:',
    checklist: [
      {
        label: 'SARS Tax PIN TCS-8841209341',
        detail: 'Verified · 185 days remaining',
        status: 'ok',
      },
      {
        label: 'SBD 6.1 B-BBEE Level 1',
        detail: '20/20 preference points stamped',
        status: 'ok',
      },
      {
        label: 'CSD Report MAAA0948215',
        detail: '9 days old · exceeds 7-day limit',
        status: 'warn',
      },
    ],
    approval: {
      title: 'Stage George Returnable Pack',
      detail: 'Refresh CSD & stage T/GEO/042/2026 · R 17 077 500.00',
      primaryCta: 'Approve & Stage',
      secondaryCta: 'Review BoQ',
      approvedTitle: 'Approved · Staged in /bid/ET-2026-WC-0842',
      approvedMessage:
        'CSD refresh queued and T/GEO/042/2026 returnable pack staged. Final eTenders submission remains locked until your portal confirmation.',
    },
    quickPrompts: [
      'Check CSD 7-day rule',
      'Verify 80/20 points',
      'Inspect VAT total',
    ],
  },
  {
    id: 'tender-scout',
    autopilotWord: 'tender ops',
    botName: 'Tender Scout',
    botRole: 'OCDS & Municipal Feed',
    modelName: 'DeepSeek V4 Flash',
    threadTitle: 'Oudtshoorn — Bulk Water',
    sidebarStatus: 'Briefing in 6d · R 9.7M',
    tenderNumber: 'OUD/INF/019/2026',
    municipality: 'Oudtshoorn Municipality',
    boqTotal: 'R 9 683 000.00',
    timestampLabel: 'Today 06:34 AM SAST',
    agentOpening:
      'Oudtshoorn Municipality published OUD/INF/019/2026 (350mm uPVC Class 16 Bulk Water Mains). Compulsory site clarification is in 6 days at Technical Services.',
    userFollowUp: 'Extract the pipe quantities and pre-fill our BoQ.',
    agentChecklistIntro:
      'Parsed the tender PDF pricing schedule and matched historical Garden Route rates:',
    checklist: [
      {
        label: '1,850 m uPVC Class 16 (350mm)',
        detail: 'Extracted to Section 4 · R 3,420/m',
        status: 'ok',
      },
      {
        label: '14 Concrete Valve Chambers',
        detail: 'Hydrostatic testing & plinths included',
        status: 'ok',
      },
    ],
    approval: {
      title: 'Compulsory Briefing RSVP',
      detail: 'Send site agent RSVP for OUD/INF/019/2026 · R 9 683 000.00',
      primaryCta: 'Send RSVP',
      secondaryCta: 'Inspect BoQ',
      approvedTitle: 'Approved · Briefing RSVP Queued',
      approvedMessage:
        'Municipal RSVP drafted and calendar reminder armed for 48 hours before the Oudtshoorn site briefing.',
    },
    quickPrompts: [
      'Confirm CIDB 5CE grade',
      'Summarize briefing venue',
      'Compare pipe rates',
    ],
  },
  {
    id: 'compliance-guard',
    autopilotWord: 'compliance',
    botName: 'Vault Guard',
    botRole: 'POPIA Expiry Monitor',
    modelName: 'Claude Sonnet 5.5',
    threadTitle: 'Vault — 7d & 90d Audit',
    sidebarStatus: '2 alerts · now',
    tenderNumber: 'VAULT-POPIA-2026',
    municipality: 'Compliance Vault',
    boqTotal: '4 Active Bids',
    timestampLabel: 'Monday 07:00 AM SAST',
    agentOpening:
      'Nightly POPIA Compliance Vault audit finished. Your COIDA Letter of Good Standing expires in 19 days and CIPC CoR 14.3 certified copy is 96 days old (90-day SAPS cap).',
    userFollowUp: 'Which active bids are gated until we upload fresh PDFs?',
    agentChecklistIntro:
      'Approval Shield has automatically paused external submissions without blocking offline BoQ pricing:',
    checklist: [
      {
        label: 'eTenders Portal Submission',
        detail: 'Gated until fresh CSD & CIPC PDF uploaded',
        status: 'warn',
      },
      {
        label: 'SBD 1 / 4 / 6.1 & BoQ Drafts',
        detail: 'Unlocked for rate editing and stamping',
        status: 'ok',
      },
    ],
    approval: {
      title: 'Request Director Upload Link',
      detail: 'Send WhatsApp upload reminder for CIPC CoR 14.3 & CSD',
      primaryCta: 'Send Reminder',
      secondaryCta: 'Open Vault',
      approvedTitle: 'Approved · WhatsApp Reminder Dispatched',
      approvedMessage:
        'Encrypted upload link sent to director WhatsApp. Vault unlocks eTenders staging the moment new PDFs are verified.',
    },
    quickPrompts: [
      'List all 6 vault docs',
      'Check COIDA expiry',
      'Export audit trail',
    ],
  },
  {
    id: 'approval-shield',
    autopilotWord: 'SBD pack',
    botName: 'Approval Shield',
    botRole: 'WhatsApp & Portal Sign-Off',
    modelName: 'DeepSeek V4 Flash',
    threadTitle: 'Mossel Bay — Stormwater',
    sidebarStatus: 'Closes in 24d · R 5.7M',
    tenderNumber: 'MSB/TD/088/2026',
    municipality: 'Mossel Bay Municipality',
    boqTotal: 'R 5 704 000.00',
    timestampLabel: 'Monday 08:15 AM SAST',
    agentOpening:
      'Mossel Bay Stormwater (MSB/TD/088/2026) returnable pack is merged and stamped. Paused in pending_approval before any WhatsApp broadcast or portal upload executes.',
    userFollowUp: 'Send it to the directors — can we beat Friday closing?',
    agentChecklistIntro:
      'Yes — returnables are signed and verified, and directors can approve directly from WhatsApp or the Bid Room:',
    checklist: [
      {
        label: 'SBD 1, 4 & 6.1 Returnables',
        detail: 'Deterministic pdf-lib stamp · 12 pages',
        status: 'ok',
      },
      {
        label: 'Grand Total incl. 15% VAT',
        detail: 'R 5 704 000.00 reconciled',
        status: 'ok',
      },
    ],
    approval: {
      title: 'WhatsApp Director Broadcast',
      detail: 'Send MSB/TD/088/2026 pack summary to 2 directors',
      primaryCta: 'Send It',
      secondaryCta: 'Review First',
      approvedTitle: 'Approved · Director Broadcast Sent',
      approvedMessage:
        'WhatsApp Approval Shield summary sent. Directors can reply approve_ET-2026-WC-1044 to authorise final submission.',
    },
    quickPrompts: [
      'Verify SBD 4 declaration',
      'Check closing countdown',
      'Preview WhatsApp alert',
    ],
  },
];

export function filterScenarios(
  scenarios: ShowcaseScenario[],
  query: string
): ShowcaseScenario[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return scenarios;
  return scenarios.filter((item) =>
    [
      item.botName,
      item.threadTitle,
      item.tenderNumber,
      item.municipality,
      item.autopilotWord,
    ]
      .join(' ')
      .toLowerCase()
      .includes(normalized)
  );
}

export function getNextScenarioIndex(
  currentIndex: number,
  total: number
): number {
  if (total <= 0) return 0;
  return (currentIndex + 1) % total;
}

export function buildQuickReplyResponse(
  scenario: ShowcaseScenario,
  userText: string
): string {
  const normalized = userText.trim().toLowerCase();
  if (!normalized) {
    return `${scenario.botName} is ready on ${scenario.tenderNumber}. Tap "${scenario.approval.primaryCta}" when you want to advance the Approval Shield.`;
  }
  if (normalized.includes('csd') || normalized.includes('7-day') || normalized.includes('vault')) {
    return `Compliance check for ${scenario.tenderNumber}: CSD reports older than 7 days and certified CIPC/ID copies older than 90 days automatically hold eTenders submission in pending_approval until refreshed.`;
  }
  if (normalized.includes('vat') || normalized.includes('boq') || normalized.includes('total') || normalized.includes('rate')) {
    return `BoQ summary for ${scenario.tenderNumber} (${scenario.municipality}): reconciled grand total including 15% VAT is ${scenario.boqTotal}. All line items use tabular Rand precision.`;
  }
  if (normalized.includes('sbd') || normalized.includes('80/20') || normalized.includes('pdf')) {
    return `SBD 1, SBD 4 & SBD 6.1 returnables for ${scenario.tenderNumber} are stamped deterministically with pdf-lib using your Compliance Vault profile and B-BBEE Level 1 preference points.`;
  }
  return `${scenario.botName} logged "${userText.trim()}" on ${scenario.tenderNumber} (${scenario.boqTotal}). External actions remain gated behind the Approval Shield until you confirm.`;
}
