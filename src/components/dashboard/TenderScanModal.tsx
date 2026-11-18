'use client';

import { useState, useEffect, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Loader2,
  MapPin,
  Sparkles,
  X,
} from 'lucide-react';
import { recommendTenderSectorsAction } from '@/app/actions/compliance';
import {
  AI_SECTOR_DISCLAIMER,
  isSectorUsingCidb,
  SA_PROVINCES,
  TENDER_SECTORS,
  TENDER_SORT_OPTIONS,
  type SectorRecommendationResult,
  type TenderScanPreferences,
  type TenderSectorId,
  type TenderSortOption,
  type TenderTypeFilter,
} from '@/lib/etenders-live';

interface TenderScanModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialPreferences: TenderScanPreferences | null;
  defaultCidbGrade?: string;
  onConfirmScan: (preferences: TenderScanPreferences) => Promise<void>;
}

const CIDB_GRADE_OPTIONS = [
  '',
  '1CE',
  '2CE',
  '3CE',
  '4CE',
  '5CE',
  '6CE',
  '7CE',
  '8CE',
  '9CE',
  '3GB',
  '4GB',
  '5GB',
  '6GB',
  '7GB',
  '4EP',
  '5EP',
  '6EP',
  '4EB',
  '4ME',
  '5ME',
];

const TENDER_TYPE_OPTIONS: Array<{ id: TenderTypeFilter; label: string }> = [
  { id: 'all', label: 'All Tenders (RFB + RFQ + RFP)' },
  { id: 'rfb', label: 'Open Bids (RFB)' },
  { id: 'rfq', label: 'Quotations (RFQ)' },
  { id: 'rfp', label: 'Proposals (RFP)' },
];

export function TenderScanModal({
  isOpen,
  onClose,
  initialPreferences,
  defaultCidbGrade = '',
  onConfirmScan,
}: TenderScanModalProps) {
  const [selectedSectors, setSelectedSectors] = useState<TenderSectorId[]>(
    initialPreferences?.sectors ?? []
  );
  const [selectedProvinces, setSelectedProvinces] = useState<string[]>(
    initialPreferences?.provinces ?? ['All South Africa']
  );
  const [tenderType, setTenderType] = useState<TenderTypeFilter>(
    initialPreferences?.tenderType ?? 'all'
  );
  const [sortBy, setSortBy] = useState<TenderSortOption>(
    initialPreferences?.sortBy ?? 'best_match'
  );
  const [cidbGrade, setCidbGrade] = useState<string>(
    initialPreferences?.cidbGrade || defaultCidbGrade || ''
  );
  const [customKeywords, setCustomKeywords] = useState<string>(
    initialPreferences?.customKeywords ?? ''
  );

  // Natural-language AI Sector Advisor state
  const [businessDescription, setBusinessDescription] = useState('');
  const [isRecommending, setIsRecommending] = useState(false);
  const [aiRecommendation, setAiRecommendation] =
    useState<SectorRecommendationResult | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    if (initialPreferences) {
      setSelectedSectors(initialPreferences.sectors);
      setSelectedProvinces(
        initialPreferences.provinces.length > 0
          ? initialPreferences.provinces
          : ['All South Africa']
      );
      setTenderType(initialPreferences.tenderType);
      setSortBy(initialPreferences.sortBy ?? 'best_match');
      setCidbGrade(initialPreferences.cidbGrade || defaultCidbGrade || '');
      setCustomKeywords(initialPreferences.customKeywords || '');
    } else if (defaultCidbGrade && !cidbGrade) {
      setCidbGrade(defaultCidbGrade);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialPreferences, defaultCidbGrade]);

  const toggleSector = (id: TenderSectorId) => {
    setScanError(null);
    setSelectedSectors((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const toggleProvince = (province: string) => {
    if (province === 'All South Africa') {
      setSelectedProvinces(['All South Africa']);
      return;
    }
    setSelectedProvinces((prev) => {
      const withoutAll = prev.filter((p) => p !== 'All South Africa');
      if (withoutAll.includes(province)) {
        const next = withoutAll.filter((p) => p !== province);
        return next.length > 0 ? next : ['All South Africa'];
      }
      return [...withoutAll, province];
    });
  };

  const handleRecommendSectors = async () => {
    const trimmed = businessDescription.trim();
    if (!trimmed) {
      setAiError(
        'Write a short description of what your business does first so Klerk can suggest your sectors.'
      );
      return;
    }

    setAiError(null);
    setIsRecommending(true);
    try {
      const recommendation = await recommendTenderSectorsAction(trimmed);
      setAiRecommendation(recommendation);
      setSelectedSectors(recommendation.recommendedSectorIds);
      if (recommendation.suggestedCidbGrade && !cidbGrade) {
        setCidbGrade(recommendation.suggestedCidbGrade);
      }
      setScanError(null);
    } catch (err) {
      setAiError(
        err instanceof Error
          ? err.message
          : 'Could not classify sectors right now. Please select your sector below.'
      );
    } finally {
      setIsRecommending(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (selectedSectors.length === 0) {
      setScanError(
        'Please select at least one sector (or use the AI Sector Advisor above) so KlerkDesk can pull relevant tenders.'
      );
      return;
    }

    setScanError(null);
    setIsScanning(true);
    try {
      const prefs: TenderScanPreferences = {
        sectors: selectedSectors,
        provinces:
          selectedProvinces.length > 0
            ? selectedProvinces
            : ['All South Africa'],
        tenderType,
        sortBy,
        cidbGrade: cidbGrade.trim(),
        customKeywords: customKeywords.trim(),
        configuredAt: new Date().toISOString(),
      };
      await onConfirmScan(prefs);
      onClose();
    } catch (err) {
      setScanError(
        err instanceof Error
          ? err.message
          : 'Failed to scan National Treasury eTenders. Please try again.'
      );
    } finally {
      setIsScanning(false);
    }
  };

  const showCidbSelector =
    selectedSectors.length === 0 || isSectorUsingCidb(selectedSectors);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="tender-scan-modal-title"
            className="w-full max-w-3xl max-h-[90dvh] flex flex-col rounded-2xl bg-[#111113] border border-white/10 shadow-2xl shadow-black/90 overflow-hidden"
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-white/[0.07] flex items-start justify-between gap-4 shrink-0">
              <div className="space-y-1">
                <h2
                  id="tender-scan-modal-title"
                  className="text-lg font-semibold text-white tracking-tight m-0"
                >
                  Tailor your KlerkDesk Tender Feed
                </h2>
                <p className="text-xs text-zinc-400 m-0">
                  Choose your official eTenders procurement sectors and provinces so Klerk only pulls relevant live opportunities into your Klerk Desks.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close sector preferences modal"
                className="size-8 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition-colors cursor-pointer shrink-0"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Scrollable Body */}
            <form
              onSubmit={handleSubmit}
              className="flex-1 overflow-y-auto px-6 py-5 space-y-6"
            >
              {/* 1. Optional Natural Language AI Sector Advisor */}
              <div className="rounded-xl bg-[#151518] border border-emerald-500/20 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="size-4 text-emerald-400 shrink-0" />
                  <span className="text-xs font-semibold text-white">
                    Unsure which official eTenders sector you fall under? (Optional)
                  </span>
                </div>

                <p className="text-xs text-zinc-400 m-0">
                  Describe what your business supplies, builds, or services in plain language and we’ll recommend the most accurate National Treasury sectors below.
                </p>

                <div className="flex flex-col sm:flex-row gap-2.5">
                  <input
                    type="text"
                    value={businessDescription}
                    onChange={(e) => setBusinessDescription(e.target.value)}
                    placeholder="e.g. We install commercial solar PV, backup generators and electrical panels for clinics and schools..."
                    aria-label="Describe what your business does in natural language"
                    className="flex-1 rounded-xl bg-[#0A0A0B] border border-white/10 px-3.5 py-2 text-xs text-white placeholder:text-zinc-600 outline-none focus:border-emerald-400/60"
                  />
                  <button
                    type="button"
                    onClick={handleRecommendSectors}
                    disabled={isRecommending}
                    className="px-3.5 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-xs font-medium text-emerald-200 flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 shrink-0"
                  >
                    {isRecommending ? (
                      <>
                        <Loader2 className="size-3.5 animate-spin" />
                        <span>Analyzing...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="size-3.5 text-emerald-400" />
                        <span>Recommend Sectors</span>
                      </>
                    )}
                  </button>
                </div>

                {aiError && (
                  <p className="text-xs text-rose-400 m-0">{aiError}</p>
                )}

                {aiRecommendation && (
                  <div className="rounded-lg bg-[#0A0A0B]/90 border border-white/10 p-3 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-300">
                        <CheckCircle2 className="size-3.5 text-emerald-400 shrink-0" />
                        <span>
                          Recommended & pre-selected{' '}
                          {aiRecommendation.recommendedSectorIds.length}{' '}
                          {aiRecommendation.recommendedSectorIds.length === 1
                            ? 'sector'
                            : 'sectors'}
                        </span>
                      </span>
                      <span className="text-[10px] font-mono text-zinc-500">
                        Model: {aiRecommendation.modelUsed}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-300 m-0 leading-relaxed">
                      {aiRecommendation.rationale}
                    </p>
                  </div>
                )}

                <div className="flex items-start gap-2 pt-0.5 text-[11px] text-amber-300/90">
                  <AlertTriangle className="size-3.5 text-amber-400 shrink-0 mt-0.5" />
                  <span>{AI_SECTOR_DISCLAIMER}</span>
                </div>
              </div>

              {/* 2. Primary Procurement Sectors (Multi-select) */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-zinc-200">
                    1. Select your eTenders Sector(s)
                  </label>
                  <span className="text-[11px] text-zinc-500 tabular-nums">
                    {selectedSectors.length} selected
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {TENDER_SECTORS.map((sector) => {
                    const isSelected = selectedSectors.includes(sector.id);
                    const isAiSuggested =
                      aiRecommendation?.recommendedSectorIds.includes(
                        sector.id
                      ) ?? false;

                    return (
                      <button
                        key={sector.id}
                        type="button"
                        onClick={() => toggleSector(sector.id)}
                        className={`text-left rounded-xl p-3.5 border transition-all cursor-pointer flex flex-col justify-between gap-1.5 ${
                          isSelected
                            ? 'bg-emerald-500/[0.1] border-emerald-500/45 text-white'
                            : 'bg-[#0A0A0B] border-white/[0.08] text-zinc-300 hover:border-white/20'
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-white">
                              {sector.label}
                            </span>
                            <div className="flex items-center gap-2 shrink-0">
                              {isAiSuggested && (
                                <span className="text-[10px] font-medium text-emerald-400">
                                  AI match
                                </span>
                              )}
                              <span
                                className={`size-4 rounded-md flex items-center justify-center border ${
                                  isSelected
                                    ? 'bg-emerald-400 border-emerald-400 text-zinc-950'
                                    : 'border-white/20 bg-transparent'
                                }`}
                              >
                                {isSelected && <Check className="size-3" />}
                              </span>
                            </div>
                          </div>
                          <p className="text-[11px] text-zinc-400 m-0 leading-snug">
                            {sector.subtitle}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 3. Province Filter */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                    <MapPin className="size-3.5 text-zinc-400" />
                    <span>2. Target Province(s)</span>
                  </label>
                  <span className="text-[11px] text-zinc-500">
                    National tenders are always included
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {SA_PROVINCES.map((prov) => {
                    const active = selectedProvinces.includes(prov);
                    return (
                      <button
                        key={prov}
                        type="button"
                        onClick={() => toggleProvince(prov)}
                        className={`px-2.5 py-1 rounded-full text-xs border transition-colors cursor-pointer ${
                          active
                            ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 font-medium'
                            : 'bg-[#0A0A0B] border-white/10 text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        {prov}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 4. Tender Type, OCDS Sort Order, Conditional CIDB Grade & Optional Keywords */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="scan-tender-type"
                    className="block text-xs font-medium text-zinc-300 mb-1.5"
                  >
                    Tender Type
                  </label>
                  <select
                    id="scan-tender-type"
                    value={tenderType}
                    onChange={(e) =>
                      setTenderType(e.target.value as TenderTypeFilter)
                    }
                    className="w-full rounded-xl bg-[#0A0A0B] border border-white/10 px-3 py-2 text-xs text-white outline-none focus:border-emerald-400/60"
                  >
                    {TENDER_TYPE_OPTIONS.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="scan-sort-order"
                    className="block text-xs font-medium text-zinc-300 mb-1.5"
                  >
                    Sort Recommendations By
                  </label>
                  <select
                    id="scan-sort-order"
                    value={sortBy}
                    onChange={(e) =>
                      setSortBy(e.target.value as TenderSortOption)
                    }
                    className="w-full rounded-xl bg-[#0A0A0B] border border-white/10 px-3 py-2 text-xs text-white outline-none focus:border-emerald-400/60"
                  >
                    {TENDER_SORT_OPTIONS.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                {showCidbSelector && (
                  <div>
                    <label
                      htmlFor="scan-cidb-grade"
                      className="block text-xs font-medium text-zinc-300 mb-1.5"
                    >
                      CIDB Grade (optional)
                    </label>
                    <select
                      id="scan-cidb-grade"
                      value={cidbGrade}
                      onChange={(e) => setCidbGrade(e.target.value)}
                      className="w-full rounded-xl bg-[#0A0A0B] border border-white/10 px-3 py-2 text-xs text-white outline-none focus:border-emerald-400/60"
                    >
                      <option value="">Any CIDB Grade</option>
                      {CIDB_GRADE_OPTIONS.filter(Boolean).map((g) => (
                        <option key={g} value={g}>
                          CIDB {g}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className={showCidbSelector ? '' : 'sm:col-span-2'}>
                  <label
                    htmlFor="scan-custom-keywords"
                    className="block text-xs font-medium text-zinc-300 mb-1.5"
                  >
                    Specific Keywords (optional)
                  </label>
                  <input
                    id="scan-custom-keywords"
                    type="text"
                    value={customKeywords}
                    onChange={(e) => setCustomKeywords(e.target.value)}
                    placeholder="e.g. solar, PPE, stormwater, ERP"
                    className="w-full rounded-xl bg-[#0A0A0B] border border-white/10 px-3 py-2 text-xs text-white placeholder:text-zinc-600 outline-none focus:border-emerald-400/60"
                  />
                </div>
              </div>

              {scanError && (
                <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 px-3.5 py-2.5 text-xs text-rose-300">
                  {scanError}
                </div>
              )}

              {/* Footer + Mandatory AI Disclaimer Clause */}
              <div className="pt-3 border-t border-white/[0.07] space-y-3">
                <p className="text-[11px] text-zinc-500 m-0 leading-relaxed">
                  <strong className="text-zinc-400 font-medium">
                    Please note:
                  </strong>{' '}
                  AI sector recommendations and automated tender matching can make mistakes and should always be double-checked against the official National Treasury eTenders bid specification before preparing a submission.
                </p>

                <div className="flex flex-wrap items-center justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={isScanning}
                    className="px-4 py-2 rounded-full bg-[#18181B] hover:bg-zinc-800 border border-white/10 text-xs font-medium text-zinc-300 cursor-pointer transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isScanning}
                    className="px-5 py-2 rounded-full bg-white hover:bg-zinc-200 text-zinc-950 text-xs font-semibold flex items-center gap-2 cursor-pointer transition-colors disabled:opacity-60"
                  >
                    {isScanning ? (
                      <>
                        <Loader2 className="size-3.5 animate-spin" />
                        <span>Scanning Live eTenders...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="size-3.5" />
                        <span>Save Sectors & Pull Live Tenders</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
