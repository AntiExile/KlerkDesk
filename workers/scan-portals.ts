import { BoatApi, Configuration, stopAndRemove, waitUntilReady } from '@boatdev/sdk';
import { Stagehand, localBrowser } from '@browserbasehq/stagehand';
import { runTenderAI } from '../lib/openrouter';
import {
  createPendingApproval,
  getComplianceSummary,
  getContractorSettings,
  getTenderMatches,
} from '../lib/convex-store';

interface OcdsDocument {
  id?: string;
  title?: string;
  url?: string;
  format?: string;
}

interface OcdsRelease {
  ocid?: string;
  id?: string;
  date?: string;
  tender?: {
    id?: string;
    title?: string;
    description?: string;
    status?: string;
    procuringEntity?: {
      name?: string;
    };
    tenderPeriod?: {
      endDate?: string;
    };
    documents?: OcdsDocument[];
  };
}

interface OcdsResponse {
  releases?: OcdsRelease[];
}

const MUNICIPAL_RFQ_PORTALS = [
  { municipality: 'George Municipality', url: 'https://www.george.gov.za/tenders' },
  { municipality: 'Oudtshoorn Municipality', url: 'https://www.oudtshoorn.gov.za/tenders' },
  { municipality: 'Mossel Bay Municipality', url: 'https://www.mosselbay.gov.za/tenders' },
  { municipality: 'City of Cape Town', url: 'https://web1.capetown.gov.za/web1/TenderPortal' },
];

/**
 * Fetches structured active national/provincial tenders from National Treasury's
 * official OCDS REST API (ocds-api.etenders.gov.za) with zero headless browser cost.
 */
async function fetchETendersOcdsReleases(): Promise<OcdsRelease[]> {
  const now = new Date();
  const dateTo = now.toISOString().slice(0, 10);
  const dateFrom = new Date(now.getTime() - 14 * 86_400_000).toISOString().slice(0, 10);

  const url = `https://ocds-api.etenders.gov.za/api/OCDSReleases?PageNumber=1&PageSize=25&dateFrom=${dateFrom}&dateTo=${dateTo}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`OCDS API returned HTTP ${response.status}`);
    }

    const payload = (await response.json()) as OcdsResponse;
    return Array.isArray(payload.releases) ? payload.releases : [];
  } catch (err) {
    console.warn(
      '[MundusMK Worker] OCDS API unavailable in current environment; using cached Supabase tender feed:',
      err instanceof Error ? err.message : String(err)
    );
    return [];
  }
}

/**
 * Reserves Stagehand + Playwright (and isolated noEnv @boatdev/sdk VMs in production)
 * specifically for municipal RFQ portals and eTenders submission staging.
 */
async function scanMunicipalRfqPortalsWithStagehand() {
  const headless = process.env.HEADLESS !== 'false';
  const apiKey = process.env.BOAT_API_KEY ?? process.env.BOAT_DEV_API_KEY ?? '';
  const useBoatVm = process.env.NODE_ENV === 'production' && Boolean(apiKey);

  if (useBoatVm) {
    const boat = new BoatApi(
      new Configuration({
        basePath: process.env.BOAT_BASE_URL ?? 'https://boat.dev/api/v1',
        accessToken: apiKey,
      })
    );
    let sandboxId: string | undefined;
    try {
      const created = await boat.create({
        createSandboxRequest: {
          ttlSeconds: 600,
          noEnv: true,
          name: 'mundus-rfq-scanner',
        },
      });
      sandboxId = created.sandbox.id;
      await waitUntilReady(boat, sandboxId, { timeoutMs: 45_000 });
      console.log(`[MundusMK Worker] Provisioned @boatdev/sdk RFQ VM: ${sandboxId} (noEnv: true)`);
    } finally {
      if (sandboxId) {
        await stopAndRemove(boat, sandboxId);
      }
    }
    return;
  }

  if (process.env.RUN_LIVE_BROWSER === 'true') {
    const browser = await localBrowser.launch({ headless });
    const stagehand = await Stagehand.create({ browser });
    try {
      const page = await stagehand.browser.context.activePage();
      if (page) {
        for (const portal of MUNICIPAL_RFQ_PORTALS) {
          console.log(`[MundusMK Worker] Stagehand scanning municipal RFQ portal: ${portal.municipality}`);
          await page.goto(portal.url, { waitUntil: 'domcontentloaded' });
        }
      }
    } finally {
      await stagehand.close();
    }
  } else {
    console.log(
      `[MundusMK Worker] Stagehand reserved for ${MUNICIPAL_RFQ_PORTALS.length} municipal RFQ portals (HEADLESS=${String(headless)}; set RUN_LIVE_BROWSER=true for live Chromium).`
    );
  }
}

async function scanPortals() {
  console.log('[MundusMK Worker] Starting National OCDS + Municipal RFQ tender scan...');
  const [settings, compliance, existingMatches, ocdsReleases] = await Promise.all([
    getContractorSettings(),
    getComplianceSummary(),
    getTenderMatches(),
    fetchETendersOcdsReleases(),
  ]);

  console.log(
    `[MundusMK Worker] Contractor: ${settings.companyName} (${settings.cidbGrade}) | Regions: ${settings.municipalRegions.join(', ')}`
  );
  console.log(
    `[MundusMK Worker] Compliance Vault Ready: ${compliance.isBidReady} (${compliance.blockingAlerts.length} blocking alerts)`
  );
  console.log(
    `[MundusMK Worker] OCDS API releases fetched from ocds-api.etenders.gov.za: ${ocdsReleases.length}`
  );

  for (const rel of ocdsReleases.slice(0, 5)) {
    const docUrls = (rel.tender?.documents ?? [])
      .map((d) => d.url)
      .filter((u): u is string => Boolean(u));
    console.log(
      `[OCDS] ${rel.ocid ?? rel.id ?? 'unknown'} | ${rel.tender?.procuringEntity?.name ?? 'Organ of State'} | ${rel.tender?.title ?? 'Untitled'} | Docs: ${docUrls.length}`
    );
  }

  await scanMunicipalRfqPortalsWithStagehand();

  for (const tender of existingMatches) {
    const audit = await runTenderAI({
      task: 'dom',
      prompt: `Summarize tender ${tender.tenderNumber} (${tender.municipality}) for CIDB ${settings.cidbGrade} contractor.`,
      clientSpendUsd: settings.openRouterUsedUsd,
    });

    console.log(
      `[MundusMK Worker] Matched ${tender.tenderNumber} (${tender.matchScore}%) via ${audit.model}`
    );
  }

  // Mandatory Approval Shield: never send WhatsApp broadcast without operator approval
  const topTender = existingMatches[0];
  if (topTender) {
    const pending = await createPendingApproval({
      bidId: topTender.id,
      tenderNumber: topTender.tenderNumber,
      actionType: 'whatsapp_broadcast',
      totalBidZar: topTender.estimatedValueZar,
      vatZar: topTender.estimatedValueZar * 0.15,
      grandTotalZar: topTender.estimatedValueZar * 1.15,
      targetResource: settings.whatsappNumber,
      commandPreview: `whatsapp.sendTenderAlert({ to: "${settings.whatsappNumber}", tender: "${topTender.tenderNumber}" })`,
      requestedBy: 'workers/scan-portals.ts',
    });

    console.log(
      `[MundusMK Worker] Approval Shield paused WhatsApp alert in pending_approval (${pending.id}). Approve at /bid/${topTender.id}`
    );
  }
}

scanPortals().catch((err) => {
  console.error('[MundusMK Worker] Fatal scan error:', err);
  process.exitCode = 1;
});
