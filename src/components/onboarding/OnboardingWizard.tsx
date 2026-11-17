'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  useConvexAuth,
  useMutation as useConvexMutation,
  useQuery as useConvexQuery,
} from 'convex/react';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileCheck2,
  FilePlus2,
  Loader2,
  Upload,
} from 'lucide-react';
import { api } from '@/convex/_generated/api';
import { saveContractorSettingsAction } from '@/app/actions/settings';
import { KlerkBrandLink } from '@/components/landing/KlerkLogo';
import {
  useComplianceVaultQuery,
  useUploadComplianceMutation,
} from '@/lib/convex-react';
import type {
  ComplianceDoc,
  ComplianceDocType,
  ComplianceSummary,
  ContractorSettings,
} from '@/types';

const DEMO_USERNAME = 'demo@mundusmk.co.za';

const MUNICIPAL_REGION_OPTIONS = [
  'George',
  'Mossel Bay',
  'Knysna',
  'Oudtshoorn',
  'Bitou',
  'City of Cape Town',
  'Drakenstein',
  'Stellenbosch',
  'eThekwini',
  'City of Johannesburg',
  'City of Tshwane',
];

const CIDB_GRADE_OPTIONS = [
  '1CE',
  '2CE',
  '3CE',
  '4CE',
  '5CE',
  '6CE PE',
  '7CE PE',
  '8CE',
  '9CE',
  '4GB',
  '5GB',
  '6GB PE',
  '7GB',
  '5ME',
  '5EP',
];

const BBBEE_LEVEL_OPTIONS = [
  'Level 1 (135% B-BBEE Recognition)',
  'Level 2 (125% B-BBEE Recognition)',
  'Level 3 (110% B-BBEE Recognition)',
  'Level 4 (100% B-BBEE Recognition)',
  'Exempt Micro Enterprise (EME)',
  'Qualifying Small Enterprise (QSE)',
];

const DOC_PLACEHOLDERS: Record<
  ComplianceDocType,
  { refPlaceholder: string; ruleHint: string; needsExpiry: boolean }
> = {
  csd: {
    refPlaceholder: 'e.g. MAAA0123456',
    ruleHint: '7-day freshness rule for tender staging',
    needsExpiry: false,
  },
  tax_pin: {
    refPlaceholder: 'e.g. TCS-9482014829',
    ruleHint: 'Valid SARS Tax Compliance PIN required',
    needsExpiry: true,
  },
  coida: {
    refPlaceholder: 'e.g. CF-9900248120',
    ruleHint: 'Annual Letter of Good Standing',
    needsExpiry: true,
  },
  bbbee: {
    refPlaceholder: 'e.g. EME-L1-2026-8841',
    ruleHint: 'Sworn Affidavit or SANAS Certificate',
    needsExpiry: true,
  },
  cipc: {
    refPlaceholder: 'e.g. 2021/458912/07',
    ruleHint: '90-day certification freshness rule',
    needsExpiry: false,
  },
  certified_id: {
    refPlaceholder: 'e.g. SAPS-CERT-2026-01',
    ruleHint: '90-day Commissioner of Oaths rule',
    needsExpiry: false,
  },
};

function isLegacyKarooSeedProfile(
  profile:
    | {
        companyName?: string | null;
        csdMaaaNumber?: string | null;
        username?: string | null;
      }
    | null
    | undefined
): boolean {
  if (!profile) return false;
  if (profile.username?.trim().toLowerCase() === DEMO_USERNAME) return false;
  return (
    profile.companyName === 'Karoo Civil & Infrastructure (Pty) Ltd' &&
    profile.csdMaaaNumber === 'MAAA0948215'
  );
}

interface OnboardingWizardProps {
  initialCompliance: ComplianceSummary;
  initialSettings: ContractorSettings;
}

export function OnboardingWizard({
  initialCompliance,
  initialSettings,
}: OnboardingWizardProps) {
  const router = useRouter();
  const { isAuthenticated } = useConvexAuth();
  const currentUser = useConvexQuery(
    api.users.currentUser,
    isAuthenticated ? {} : 'skip'
  );
  const updateConvexProfile = useConvexMutation(api.users.updateProfile);
  const uploadCompliance = useUploadComplianceMutation();
  const compliance = useComplianceVaultQuery(initialCompliance);

  const [step, setStep] = useState<1 | 2>(1);
  const [savingProfile, setSavingProfile] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [companyName, setCompanyName] = useState(initialSettings.companyName || '');
  const [csdMaaaNumber, setCsdMaaaNumber] = useState(
    initialSettings.csdMaaaNumber || ''
  );
  const [registrationNumber, setRegistrationNumber] = useState(
    initialSettings.registrationNumber || ''
  );
  const [taxPinNumber, setTaxPinNumber] = useState(
    initialSettings.taxPinNumber || ''
  );
  const [cidbGrade, setCidbGrade] = useState(initialSettings.cidbGrade || '');
  const [bbbeeLevel, setBbbeeLevel] = useState(initialSettings.bbbeeLevel || '');
  const [whatsappNumber, setWhatsappNumber] = useState(
    initialSettings.whatsappNumber || ''
  );
  const [municipalRegions, setMunicipalRegions] = useState<string[]>(
    initialSettings.municipalRegions ?? []
  );

  const [editingDocType, setEditingDocType] = useState<ComplianceDocType | null>(
    null
  );
  const [docReference, setDocReference] = useState('');
  const [docIssuedAt, setDocIssuedAt] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [docExpiresAt, setDocExpiresAt] = useState('');
  const [docFileName, setDocFileName] = useState('');
  const [docFileSizeBytes, setDocFileSizeBytes] = useState(245_000);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);

  const cleanedLegacyRef = useRef(false);

  useEffect(() => {
    if (!currentUser || cleanedLegacyRef.current) return;
    if (isLegacyKarooSeedProfile(currentUser)) {
      cleanedLegacyRef.current = true;
      void updateConvexProfile({
        companyName: '',
        registrationNumber: '',
        csdMaaaNumber: '',
        taxPinNumber: '',
        cidbGrade: '',
        bbbeeLevel: '',
        municipalRegions: [],
        whatsappNumber: '',
      }).catch(() => {});
      return;
    }

    cleanedLegacyRef.current = true;
    if (currentUser.companyName) setCompanyName(currentUser.companyName);
    if (currentUser.csdMaaaNumber) setCsdMaaaNumber(currentUser.csdMaaaNumber);
    if (currentUser.registrationNumber) {
      setRegistrationNumber(currentUser.registrationNumber);
    }
    if (currentUser.taxPinNumber) setTaxPinNumber(currentUser.taxPinNumber);
    if (currentUser.cidbGrade) setCidbGrade(currentUser.cidbGrade);
    if (currentUser.bbbeeLevel) setBbbeeLevel(currentUser.bbbeeLevel);
    if (currentUser.whatsappNumber) setWhatsappNumber(currentUser.whatsappNumber);
    if (
      Array.isArray(currentUser.municipalRegions) &&
      currentUser.municipalRegions.length > 0
    ) {
      setMunicipalRegions(
        currentUser.municipalRegions.filter((r) => !r.startsWith('__klerk_'))
      );
    }
  }, [currentUser, updateConvexProfile]);

  const uploadedDocsCount = useMemo(
    () => compliance.docs.filter((d) => d.status !== 'missing').length,
    [compliance.docs]
  );

  const toggleRegion = (region: string) => {
    setMunicipalRegions((prev) =>
      prev.includes(region)
        ? prev.filter((r) => r !== region)
        : [...prev, region]
    );
  };

  const persistProfileFields = async (fields: {
    companyName: string;
    registrationNumber: string;
    csdMaaaNumber: string;
    taxPinNumber: string;
    cidbGrade: string;
    bbbeeLevel: string;
    municipalRegions: string[];
    whatsappNumber: string;
  }) => {
    try {
      await updateConvexProfile({
        companyName: fields.companyName,
        registrationNumber: fields.registrationNumber,
        csdMaaaNumber: fields.csdMaaaNumber,
        taxPinNumber: fields.taxPinNumber,
        cidbGrade: fields.cidbGrade,
        bbbeeLevel: fields.bbbeeLevel,
        municipalRegions: fields.municipalRegions,
        whatsappNumber: fields.whatsappNumber,
      });
    } catch {
      // Fallback to server action below
    }
    await saveContractorSettingsAction(fields);
  };

  const handleSaveProfileAndContinue = async (e: FormEvent) => {
    e.preventDefault();
    setProfileError(null);
    setSavingProfile(true);
    try {
      await persistProfileFields({
        companyName: companyName.trim(),
        registrationNumber: registrationNumber.trim(),
        csdMaaaNumber: csdMaaaNumber.trim(),
        taxPinNumber: taxPinNumber.trim(),
        cidbGrade: cidbGrade.trim(),
        bbbeeLevel: bbbeeLevel.trim(),
        municipalRegions,
        whatsappNumber: whatsappNumber.trim(),
      });
      setStep(2);
    } catch {
      setProfileError(
        'Could not save profile right now. You can skip and update it later.'
      );
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSkipStep1ToVault = () => {
    setProfileError(null);
    setStep(2);
  };

  const handleSkipAllToDesk = () => {
    setSkipping(true);
    router.replace('/desk');
  };

  const openDocEditor = (doc: ComplianceDoc) => {
    if (editingDocType === doc.type) {
      setEditingDocType(null);
      return;
    }
    setEditingDocType(doc.type);
    setDocError(null);
    setSelectedFile(null);

    const isMissing = doc.status === 'missing';
    const defaultRef =
      !isMissing && doc.referenceNumber !== 'Not uploaded'
        ? doc.referenceNumber
        : doc.type === 'csd' && csdMaaaNumber.trim()
          ? csdMaaaNumber.trim()
          : doc.type === 'cipc' && registrationNumber.trim()
            ? registrationNumber.trim()
            : doc.type === 'tax_pin' && taxPinNumber.trim()
              ? taxPinNumber.trim()
              : '';

    setDocReference(defaultRef);
    setDocIssuedAt(
      !isMissing && doc.issuedAt
        ? doc.issuedAt.slice(0, 10)
        : new Date().toISOString().slice(0, 10)
    );
    setDocExpiresAt(
      !isMissing && doc.expiresAt ? doc.expiresAt.slice(0, 10) : ''
    );
    setDocFileName(!isMissing ? doc.fileName : '');
    setDocFileSizeBytes(!isMissing ? doc.fileSizeBytes : 245_000);
  };

  const handleSaveDoc = async (doc: ComplianceDoc) => {
    const cleanRef = docReference.trim();
    if (cleanRef.length < 2) {
      setDocError(
        'Please enter a certificate or reference number (at least 2 characters).'
      );
      return;
    }

    if (!selectedFile) {
      setDocError(
        'Please attach the PDF or certified image file to store in your Compliance Vault.'
      );
      return;
    }

    setUploadingDoc(true);
    setDocError(null);
    try {
      const finalFileName =
        selectedFile.name ||
        docFileName.trim() ||
        `${doc.shortLabel.replace(/\s+/g, '_')}_${cleanRef.replace(/[^a-zA-Z0-9_-]/g, '')}.pdf`;

      await uploadCompliance({
        type: doc.type,
        referenceNumber: cleanRef,
        issuedAt: new Date(docIssuedAt).toISOString(),
        expiresAt: docExpiresAt ? new Date(docExpiresAt).toISOString() : null,
        fileName: finalFileName,
        fileSizeBytes: selectedFile.size ?? docFileSizeBytes,
        file: selectedFile,
      });

      setEditingDocType(null);
      setSelectedFile(null);
    } catch (err) {
      setDocError(
        err instanceof Error
          ? err.message
          : 'Unable to upload document right now. Please try again.'
      );
    } finally {
      setUploadingDoc(false);
    }
  };

  return (
    <div className="min-h-dvh bg-[#0A0A0B] text-zinc-100 flex flex-col justify-between px-4 py-6 sm:py-8">
      <header className="max-w-3xl w-full mx-auto flex items-center justify-between gap-4">
        <KlerkBrandLink href="/desk" />
        <button
          type="button"
          onClick={handleSkipAllToDesk}
          disabled={skipping}
          className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 px-3.5 py-1.5 text-xs font-medium text-zinc-300 hover:text-white cursor-pointer transition-colors disabled:opacity-50"
        >
          <span>Skip setup &amp; go to KlerkDesk</span>
          <ArrowRight className="size-3.5" />
        </button>
      </header>

      <main className="w-full max-w-3xl mx-auto my-6">
        <div className="bg-[#111113] border border-white/10 rounded-2xl p-6 sm:p-8 shadow-2xl shadow-black/80 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-5 border-b border-white/[0.08]">
            <div className="space-y-1">
              <div className="text-[11px] font-medium uppercase tracking-wider text-emerald-400/90">
                Step {step} of 2 · Optional Setup
              </div>
              <h1 className="text-xl font-semibold tracking-tight text-white m-0">
                {step === 1
                  ? 'Set up your Contractor Profile'
                  : 'Populate your Compliance Vault'}
              </h1>
              <p className="text-xs text-zinc-400 m-0">
                {step === 1
                  ? 'Used to auto-match CIDB tenders and pre-fill SBD 1, 4 & 6.1 returnables. You can skip and fill this in later.'
                  : 'Add your statutory compliance certificates now, or skip and upload them later inside your Compliance Vault.'}
              </p>
            </div>

            <div className="flex items-center gap-1.5 bg-[#0A0A0B] border border-white/10 rounded-full p-1 self-start sm:self-center shrink-0">
              <button
                type="button"
                onClick={() => setStep(1)}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border-none cursor-pointer transition-colors ${
                  step === 1
                    ? 'bg-white text-black'
                    : 'bg-transparent text-zinc-400 hover:text-white'
                }`}
              >
                <Building2 className="size-3" />
                <span>1. Profile</span>
              </button>
              <button
                type="button"
                onClick={() => setStep(2)}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border-none cursor-pointer transition-colors tabular-nums ${
                  step === 2
                    ? 'bg-white text-black'
                    : 'bg-transparent text-zinc-400 hover:text-white'
                }`}
              >
                <FileCheck2 className="size-3" />
                <span>2. Vault ({uploadedDocsCount}/6)</span>
              </button>
            </div>
          </div>

          {step === 1 ? (
            <form onSubmit={handleSaveProfileAndContinue} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label
                    htmlFor="onboard-company-name"
                    className="block text-xs font-medium text-zinc-300 mb-1.5"
                  >
                    Company Legal Name <span className="text-zinc-500">(optional)</span>
                  </label>
                  <input
                    id="onboard-company-name"
                    type="text"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="e.g. Apex Civil & Roads (Pty) Ltd"
                    className="w-full rounded-xl bg-[#0A0A0B] border border-white/10 px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-emerald-400/60"
                  />
                </div>

                <div>
                  <label
                    htmlFor="onboard-csd-number"
                    className="block text-xs font-medium text-zinc-300 mb-1.5"
                  >
                    CSD Supplier Number (MAAA) <span className="text-zinc-500">(optional)</span>
                  </label>
                  <input
                    id="onboard-csd-number"
                    type="text"
                    value={csdMaaaNumber}
                    onChange={(e) => setCsdMaaaNumber(e.target.value)}
                    placeholder="e.g. MAAA0123456"
                    className="w-full rounded-xl bg-[#0A0A0B] border border-white/10 px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-emerald-400/60 font-mono"
                  />
                </div>

                <div>
                  <label
                    htmlFor="onboard-cipc-number"
                    className="block text-xs font-medium text-zinc-300 mb-1.5"
                  >
                    CIPC Registration Number <span className="text-zinc-500">(optional)</span>
                  </label>
                  <input
                    id="onboard-cipc-number"
                    type="text"
                    value={registrationNumber}
                    onChange={(e) => setRegistrationNumber(e.target.value)}
                    placeholder="e.g. 2021/458912/07"
                    className="w-full rounded-xl bg-[#0A0A0B] border border-white/10 px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-emerald-400/60 font-mono"
                  />
                </div>

                <div>
                  <label
                    htmlFor="onboard-cidb-grade"
                    className="block text-xs font-medium text-zinc-300 mb-1.5"
                  >
                    CIDB Grading Designation <span className="text-zinc-500">(optional)</span>
                  </label>
                  <select
                    id="onboard-cidb-grade"
                    value={cidbGrade}
                    onChange={(e) => setCidbGrade(e.target.value)}
                    className="w-full rounded-xl bg-[#0A0A0B] border border-white/10 px-3.5 py-2.5 text-sm text-white outline-none focus:border-emerald-400/60"
                  >
                    <option value="">Select CIDB grade (or skip for now)</option>
                    {CIDB_GRADE_OPTIONS.map((grade) => (
                      <option key={grade} value={grade}>
                        {grade}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="onboard-bbbee-level"
                    className="block text-xs font-medium text-zinc-300 mb-1.5"
                  >
                    B-BBEE Status Level <span className="text-zinc-500">(optional)</span>
                  </label>
                  <select
                    id="onboard-bbbee-level"
                    value={bbbeeLevel}
                    onChange={(e) => setBbbeeLevel(e.target.value)}
                    className="w-full rounded-xl bg-[#0A0A0B] border border-white/10 px-3.5 py-2.5 text-sm text-white outline-none focus:border-emerald-400/60"
                  >
                    <option value="">Select B-BBEE level (or skip for now)</option>
                    {BBBEE_LEVEL_OPTIONS.map((level) => (
                      <option key={level} value={level}>
                        {level}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="onboard-tax-pin"
                    className="block text-xs font-medium text-zinc-300 mb-1.5"
                  >
                    SARS Tax Compliance PIN <span className="text-zinc-500">(optional)</span>
                  </label>
                  <input
                    id="onboard-tax-pin"
                    type="text"
                    value={taxPinNumber}
                    onChange={(e) => setTaxPinNumber(e.target.value)}
                    placeholder="e.g. TCS-9482014829"
                    className="w-full rounded-xl bg-[#0A0A0B] border border-white/10 px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-emerald-400/60 font-mono"
                  />
                </div>

                <div>
                  <label
                    htmlFor="onboard-whatsapp"
                    className="block text-xs font-medium text-zinc-300 mb-1.5"
                  >
                    WhatsApp Approval Shield Number <span className="text-zinc-500">(optional)</span>
                  </label>
                  <input
                    id="onboard-whatsapp"
                    type="tel"
                    value={whatsappNumber}
                    onChange={(e) => setWhatsappNumber(e.target.value)}
                    placeholder="e.g. +27825550148"
                    className="w-full rounded-xl bg-[#0A0A0B] border border-white/10 px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-emerald-400/60 font-mono"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-zinc-300">
                    Target Municipal Regions <span className="text-zinc-500">(optional)</span>
                  </span>
                  <span className="text-[11px] text-zinc-500 tabular-nums">
                    {municipalRegions.length} selected
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {MUNICIPAL_REGION_OPTIONS.map((region) => {
                    const active = municipalRegions.includes(region);
                    return (
                      <button
                        key={region}
                        type="button"
                        onClick={() => toggleRegion(region)}
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border cursor-pointer transition-colors ${
                          active
                            ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300'
                            : 'bg-[#0A0A0B] border-white/10 text-zinc-400 hover:text-zinc-200 hover:border-white/20'
                        }`}
                      >
                        {active && <Check className="size-3 text-emerald-400" />}
                        <span>{region}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {profileError && (
                <div className="rounded-xl bg-rose-500/10 border border-rose-500/25 px-3.5 py-2.5 text-xs text-rose-200">
                  {profileError}
                </div>
              )}

              <div className="pt-3 border-t border-white/[0.08] flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={handleSkipStep1ToVault}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-[#18181B] hover:bg-[#222227] border border-white/10 text-zinc-200 px-5 py-2.5 text-xs font-medium cursor-pointer transition-colors"
                >
                  <span>Skip for now — I&apos;ll add this later</span>
                </button>

                <button
                  type="submit"
                  disabled={savingProfile}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-white text-black hover:bg-zinc-200 px-6 py-2.5 text-xs font-semibold border-none cursor-pointer transition-colors disabled:opacity-50"
                >
                  {savingProfile && <Loader2 className="size-3.5 animate-spin" />}
                  <span>Save &amp; Continue to Compliance Vault</span>
                  <ArrowRight className="size-3.5" />
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl bg-[#0C0C0E] border border-white/[0.08] p-3.5 flex items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="text-xs font-medium text-zinc-200">
                    Your Compliance Vault starts empty ({uploadedDocsCount} of 6 documents uploaded)
                  </div>
                  <div className="text-[11px] text-zinc-400">
                    Click any statutory document slot below to enter its reference number and attach a PDF now, or skip and upload later from your KlerkDesk sidebar.
                  </div>
                </div>
                <span className="shrink-0 text-[11px] font-mono font-medium text-emerald-400 tabular-nums">
                  {uploadedDocsCount}/6 ready
                </span>
              </div>

              <div className="divide-y divide-white/[0.06] rounded-xl bg-[#0A0A0B] border border-white/10 overflow-hidden">
                {compliance.docs.map((doc) => {
                  const isUploaded = doc.status !== 'missing';
                  const isEditing = editingDocType === doc.type;
                  const meta = DOC_PLACEHOLDERS[doc.type];

                  return (
                    <div key={doc.id} className="p-3.5 sm:px-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-medium text-white">
                              {doc.shortLabel}
                            </span>
                            {isUploaded ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400">
                                <CheckCircle2 className="size-3 shrink-0" />
                                <span>{doc.referenceNumber}</span>
                              </span>
                            ) : (
                              <span className="text-[11px] text-zinc-500">
                                Not uploaded
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-zinc-500 truncate mt-0.5">
                            {meta.ruleHint}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => openDocEditor(doc)}
                          className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-[#16161A] hover:bg-[#1E1E24] border border-white/10 px-3 py-1.5 text-xs font-medium text-zinc-200 cursor-pointer transition-colors"
                        >
                          <FilePlus2 className="size-3.5 text-emerald-400" />
                          <span>{isUploaded ? 'Update' : 'Add now'}</span>
                          {isEditing ? (
                            <ChevronUp className="size-3.5 text-zinc-400" />
                          ) : (
                            <ChevronDown className="size-3.5 text-zinc-400" />
                          )}
                        </button>
                      </div>

                      {isEditing && (
                        <div className="mt-3 pt-3 border-t border-white/[0.06] space-y-3">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                            <div>
                              <label className="block text-[11px] text-zinc-400 mb-1">
                                Reference / Certificate No.
                              </label>
                              <input
                                type="text"
                                value={docReference}
                                onChange={(e) => setDocReference(e.target.value)}
                                placeholder={meta.refPlaceholder}
                                className="w-full rounded-lg bg-[#111113] border border-white/10 px-2.5 py-1.5 text-xs text-white placeholder:text-zinc-600 outline-none focus:border-emerald-400/60 font-mono"
                              />
                            </div>

                            <div>
                              <label className="block text-[11px] text-zinc-400 mb-1">
                                Issue / Certified Date
                              </label>
                              <input
                                type="date"
                                value={docIssuedAt}
                                onChange={(e) => setDocIssuedAt(e.target.value)}
                                className="w-full rounded-lg bg-[#111113] border border-white/10 px-2.5 py-1.5 text-xs text-white outline-none focus:border-emerald-400/60 tabular-nums"
                              />
                            </div>

                            <div>
                              <label className="block text-[11px] text-zinc-400 mb-1">
                                Expiry Date {meta.needsExpiry ? '' : '(optional)'}
                              </label>
                              <input
                                type="date"
                                value={docExpiresAt}
                                onChange={(e) => setDocExpiresAt(e.target.value)}
                                className="w-full rounded-lg bg-[#111113] border border-white/10 px-2.5 py-1.5 text-xs text-white outline-none focus:border-emerald-400/60 tabular-nums"
                              />
                            </div>
                          </div>

                          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                            <label className="inline-flex items-center gap-2 rounded-lg bg-[#111113] hover:bg-[#18181B] border border-dashed border-white/15 px-3 py-1.5 text-xs text-zinc-300 cursor-pointer transition-colors">
                              <Upload className="size-3.5 text-emerald-400 shrink-0" />
                              <span className="truncate max-w-[260px]">
                                {selectedFile
                                  ? `${selectedFile.name} (${Math.round(selectedFile.size / 1024)} KB)`
                                  : 'Attach PDF / certified scan *'}
                              </span>
                              <input
                                type="file"
                                accept=".pdf,image/*"
                                className="hidden"
                                onChange={(e) => {
                                  const f = e.target.files?.[0] ?? null;
                                  setSelectedFile(f);
                                  if (f) {
                                    setDocFileName(f.name);
                                    setDocFileSizeBytes(f.size);
                                  }
                                }}
                              />
                            </label>

                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => setEditingDocType(null)}
                                className="rounded-lg bg-transparent hover:bg-white/[0.05] border border-white/10 px-3 py-1.5 text-xs text-zinc-400 hover:text-white cursor-pointer"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                disabled={uploadingDoc}
                                onClick={() => handleSaveDoc(doc)}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-semibold px-3.5 py-1.5 text-xs border-none cursor-pointer disabled:opacity-50"
                              >
                                {uploadingDoc ? (
                                  <Loader2 className="size-3.5 animate-spin" />
                                ) : (
                                  <Check className="size-3.5" />
                                )}
                                <span>Save to Vault</span>
                              </button>
                            </div>
                          </div>

                          {docError && (
                            <p className="text-[11px] text-rose-300 m-0">{docError}</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="pt-3 border-t border-white/[0.08] flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="inline-flex items-center justify-center gap-1.5 rounded-full bg-transparent hover:bg-white/[0.05] border border-white/10 text-zinc-300 px-4 py-2.5 text-xs font-medium cursor-pointer transition-colors"
                  >
                    <ArrowLeft className="size-3.5" />
                    <span>Back</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSkipAllToDesk}
                    disabled={skipping}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-[#18181B] hover:bg-[#222227] border border-white/10 text-zinc-200 px-5 py-2.5 text-xs font-medium cursor-pointer transition-colors disabled:opacity-50"
                  >
                    <span>Skip for now — I&apos;ll add documents later in my Vault</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleSkipAllToDesk}
                  disabled={skipping}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-white text-black hover:bg-zinc-200 px-6 py-2.5 text-xs font-semibold border-none cursor-pointer transition-colors disabled:opacity-50"
                >
                  {skipping && <Loader2 className="size-3.5 animate-spin" />}
                  <span>Finish Setup &amp; Open KlerkDesk</span>
                  <ArrowRight className="size-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      <footer className="text-center text-[11px] text-zinc-500">
        You can update your Contractor Profile and Compliance Vault at any time from the KlerkDesk sidebar.
      </footer>
    </div>
  );
}
