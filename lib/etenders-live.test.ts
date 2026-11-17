import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  AI_SECTOR_DISCLAIMER,
  extractCidbGradeFromText,
  inferSaProvince,
  mapOcdsReleasesToOpportunities,
  matchAndScoreETendersOpportunities,
  parseAISectorRecommendation,
  parseScanPrefsFromRegions,
  recommendSectorsHeuristic,
  serializeScanPrefsToRegions,
  type RawETendersOpportunity,
  type RawOcdsRelease,
  type TenderScanPreferences,
} from './etenders-live';
import { createEmptyComplianceDocs, evaluateComplianceSummary } from './compliance';

describe('eTenders Live Sector Matching & OCDS Sorting', () => {
  it('serializes and parses scan preferences cleanly alongside municipalRegions (including sortBy)', () => {
    const prefs: TenderScanPreferences = {
      sectors: ['civil_roads', 'electrical_mechanical'],
      provinces: ['Western Cape', 'Gauteng'],
      tenderType: 'rfb',
      sortBy: 'closing_soon',
      cidbGrade: '6CE',
      customKeywords: 'stormwater solar',
      configuredAt: '2026-11-17T07:00:00.000Z',
    };

    const encoded = serializeScanPrefsToRegions(
      ['George', 'City of Cape Town'],
      prefs
    );
    const parsed = parseScanPrefsFromRegions(encoded, '6CE');

    assert.deepEqual(parsed.municipalRegions, ['George', 'City of Cape Town']);
    assert.ok(parsed.scanPreferences);
    assert.deepEqual(parsed.scanPreferences.sectors, [
      'civil_roads',
      'electrical_mechanical',
    ]);
    assert.deepEqual(parsed.scanPreferences.provinces, [
      'Western Cape',
      'Gauteng',
    ]);
    assert.equal(parsed.scanPreferences.tenderType, 'rfb');
    assert.equal(parsed.scanPreferences.sortBy, 'closing_soon');
    assert.equal(parsed.scanPreferences.cidbGrade, '6CE');
    assert.equal(parsed.scanPreferences.customKeywords, 'stormwater solar');
  });

  it('recommends accurate sectors from natural language and always includes the AI mistake disclaimer', () => {
    const solarCheck = recommendSectorsHeuristic(
      'We install commercial solar PV panels, backup battery inverters, and do electrical maintenance for clinics and schools (CIDB 4EB).'
    );
    assert.ok(
      solarCheck.recommendedSectorIds.includes('electrical_mechanical')
    );
    assert.equal(solarCheck.suggestedCidbGrade, '4EB');
    assert.equal(solarCheck.disclaimer, AI_SECTOR_DISCLAIMER);

    const parsedJson = parseAISectorRecommendation(
      '```json\n{"recommendedSectorIds":["it_telecoms","professional_consulting"],"suggestedCidbGrade":"","rationale":"Cloud ERP and software licensing map to Information and communication on eTenders."}\n```',
      'We build cloud software and provide Microsoft licensing to municipalities',
      'openrouter/free'
    );
    assert.deepEqual(parsedJson.recommendedSectorIds, [
      'it_telecoms',
      'professional_consulting',
    ]);
    assert.equal(parsedJson.modelUsed, 'openrouter/free');
    assert.equal(parsedJson.disclaimer, AI_SECTOR_DISCLAIMER);
  });

  it('extracts CIDB grading designations from National Treasury conditions text', () => {
    const grade = extractCidbGradeFromText(
      'Only tenderers who are a CIDB contractor grading of 9CE as stated on the Tender Data may submit tender offers.',
      ['civil_roads']
    );
    assert.equal(grade, '9CE');
  });

  it('maps OCDS releases with empty mainProcurementCategory, infers province, reads tender.value.amount, and filters closed tenders', () => {
    const ocdsReleases: RawOcdsRelease[] = [
      {
        ocid: 'ocds-9t57fa-990011',
        id: 'rel-1',
        date: '2026-11-16T08:30:00Z',
        buyer: { name: 'Kwa-Zulu Natal - Trade and Investment KwaZulu-Natal' },
        tender: {
          id: '990011',
          title: 'TIKZN 04/2026',
          description: 'Appointment of a service provider for cybersecurity network audit and cloud ERP support',
          status: 'active',
          mainProcurementCategory: '',
          additionalProcurementCategories: ['consultingServices'],
          procurementMethodDetails: 'Open Tender',
          value: { amount: 4_750_000, currency: 'ZAR' },
          tenderPeriod: {
            startDate: '2026-11-16T08:00:00Z',
            endDate: '2027-02-15T11:00:00Z',
          },
        },
      },
      {
        ocid: 'ocds-9t57fa-990012',
        id: 'rel-cancelled',
        date: '2026-11-15T08:00:00Z',
        tender: {
          id: '990012',
          title: 'CANCELLED-01',
          description: 'Cancelled road resurfacing tender',
          status: 'cancelled',
          mainProcurementCategory: 'works',
          tenderPeriod: { endDate: '2027-01-10T11:00:00Z' },
        },
      },
    ];

    const mapped = mapOcdsReleasesToOpportunities(ocdsReleases);
    assert.equal(mapped.length, 1);
    assert.equal(mapped[0].ocid, 'ocds-9t57fa-990011');
    assert.equal(mapped[0].category, 'Services: Professional');
    assert.equal(mapped[0].province, 'KwaZulu-Natal');
    assert.equal(mapped[0].estimatedValueZarOverride, 4_750_000);
    assert.equal(inferSaProvince(['City of Cape Town Metropolitan Municipality']), 'Western Cape');
  });

  it('filters and sorts live eTenders opportunities by best_match, closing_soon, highest_value, and newest', () => {
    const sampleRows: RawETendersOpportunity[] = [
      {
        id: 178417,
        tender_No: 'NRA 2026/0245',
        description:
          'FOR THE CONSTRUCTION OF THE BRIDGE OVER RAIL ON DR MOROKA ROAD IN RUSTENBURG',
        category: 'Construction',
        type: 'Request for Bid(Open-Tender)',
        organ_of_State: 'SANRAL',
        province: 'North West',
        town: 'Rustenburg',
        date_Published: '2026-11-10T09:00:00Z',
        closing_Date: '2027-02-27T12:00:00Z',
        estimatedValueZarOverride: 95_000_000,
        briefingCompulsory: true,
        compulsory_briefing_session: '2026-11-27T11:00:00Z',
        conditions:
          'Only tenderers who are a CIDB contractor grading of 9CE may submit tender offers.',
        supportDocument: [
          {
            supportDocumentID: 'eb180b84-6808-4199-b069-2187e16946a6',
            fileName: 'NRA_2026_0245_Bid_Doc.pdf',
            extension: '.pdf',
          },
        ],
      },
      {
        id: 178520,
        tender_No: 'WC-ROADS-09/2026',
        description:
          'REHABILITATION OF STORMWATER PIPELINE AND PAVING IN GEORGE',
        category: 'Construction',
        type: 'Request for Bid(Open-Tender)',
        organ_of_State: 'George Municipality',
        province: 'Western Cape',
        town: 'George',
        date_Published: '2026-11-17T08:00:00Z',
        closing_Date: '2027-01-12T12:00:00Z',
        estimatedValueZarOverride: 4_200_000,
        conditions: 'CIDB 5CE required.',
      },
      {
        id: 178009,
        tender_No: 'RFP/11/03/26',
        description:
          'APPOINTMENT OF A CLOUD-BASED ACCOUNTING AND PROCUREMENT APPLICATION PARTNER FOR THREE YEARS',
        category: 'Information and communication',
        type: 'Request for Bid(Open-Tender)',
        organ_of_State: 'Gauteng Partnership Fund',
        province: 'Gauteng',
        town: 'Johannesburg',
        closing_Date: '2027-01-20T11:00:00Z',
        briefingCompulsory: false,
        conditions: '',
      },
    ];

    const compliance = evaluateComplianceSummary(createEmptyComplianceDocs());

    const soonest = matchAndScoreETendersOpportunities(
      sampleRows,
      {
        sectors: ['civil_roads'],
        provinces: ['All South Africa'],
        tenderType: 'all',
        sortBy: 'closing_soon',
        cidbGrade: '',
        customKeywords: '',
        configuredAt: new Date().toISOString(),
      },
      compliance
    );
    assert.equal(soonest.tenders.length, 2);
    assert.equal(soonest.tenders[0].tenderNumber, 'WC-ROADS-09/2026');

    const highestValue = matchAndScoreETendersOpportunities(
      sampleRows,
      {
        sectors: ['civil_roads'],
        provinces: ['All South Africa'],
        tenderType: 'all',
        sortBy: 'highest_value',
        cidbGrade: '',
        customKeywords: '',
        configuredAt: new Date().toISOString(),
      },
      compliance
    );
    assert.equal(highestValue.tenders[0].tenderNumber, 'NRA 2026/0245');
    assert.equal(highestValue.tenders[0].estimatedValueZar, 95_000_000);

    const newest = matchAndScoreETendersOpportunities(
      sampleRows,
      {
        sectors: ['civil_roads'],
        provinces: ['All South Africa'],
        tenderType: 'all',
        sortBy: 'newest',
        cidbGrade: '',
        customKeywords: '',
        configuredAt: new Date().toISOString(),
      },
      compliance
    );
    assert.equal(newest.tenders[0].tenderNumber, 'WC-ROADS-09/2026');

    const itResult = matchAndScoreETendersOpportunities(
      sampleRows,
      {
        sectors: ['it_telecoms'],
        provinces: ['Gauteng'],
        tenderType: 'all',
        cidbGrade: '',
        customKeywords: 'cloud',
        configuredAt: new Date().toISOString(),
      },
      compliance
    );

    assert.equal(itResult.tenders.length, 1);
    assert.equal(itResult.tenders[0].tenderNumber, 'RFP/11/03/26');
  });
});

