'use client';

import { useState, useEffect, type FormEvent } from 'react';
import {
  CheckCircle2,
  Loader2,
  MapPin,
  MessageSquare,
  Plus,
  Shield,
  Trash2,
  Users,
  AlertCircle,
} from 'lucide-react';
import {
  getContractorSettingsAction,
  saveContractorSettingsAction,
} from '@/app/actions/settings';
import { TENDER_SECTORS } from '@/lib/etenders-live';
import type { DirectorInfo, PlanTier } from '@/types';

const CIDB_GRADES = [
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

const BBBEE_LEVELS = [
  'Level 1 (135% Procurement Recognition)',
  'Level 2 (125% Procurement Recognition)',
  'Level 3 (110% Procurement Recognition)',
  'Level 4 (100% Procurement Recognition)',
  'Exempt Micro Enterprise (EME)',
  'Qualifying Small Enterprise (QSE)',
];

const MUNICIPAL_REGIONS = [
  'Oudtshoorn',
  'George',
  'Mossel Bay',
  'Cape Town',
  'Knysna',
  'Bitou',
  'Hessequa',
  'Garden Route District',
  'eThekwini',
  'City of Johannesburg',
  'City of Tshwane',
];

export function DataSyncTab() {
  const [companyName, setCompanyName] = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [csdMaaaNumber, setCsdMaaaNumber] = useState('');
  const [taxRefNumber, setTaxRefNumber] = useState('');
  const [taxPinNumber, setTaxPinNumber] = useState('');
  const [cidbGrade, setCidbGrade] = useState('6CE PE');
  const [bbbeeLevel, setBbbeeLevel] = useState('');
  const [planTier, setPlanTier] = useState<PlanTier>('starter');
  const [municipalRegions, setMunicipalRegions] = useState<string[]>([]);
  const [sectors, setSectors] = useState<string[]>([]);
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [directors, setDirectors] = useState<DirectorInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    getContractorSettingsAction()
      .then((settings) => {
        setCompanyName(settings.companyName ?? '');
        setRegistrationNumber(settings.registrationNumber ?? '');
        setCsdMaaaNumber(settings.csdMaaaNumber ?? '');
        setTaxRefNumber(settings.taxRefNumber ?? '');
        setTaxPinNumber(settings.taxPinNumber ?? '');
        setCidbGrade(settings.cidbGrade || '6CE PE');
        setBbbeeLevel(settings.bbbeeLevel ?? '');
        setPlanTier(settings.planTier ?? 'starter');
        setMunicipalRegions(settings.municipalRegions ?? []);
        setSectors(settings.sectors ?? []);
        setWhatsappNumber(settings.whatsappNumber ?? '');
        setDirectors(settings.directors ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  const toggleRegion = (region: string) => {
    setMunicipalRegions((prev) =>
      prev.includes(region)
        ? prev.filter((r) => r !== region)
        : [...prev, region]
    );
    setSavedSuccess(false);
  };

  const toggleSector = (sectorId: string) => {
    setSectors((prev) =>
      prev.includes(sectorId)
        ? prev.filter((s) => s !== sectorId)
        : [...prev, sectorId]
    );
    setSavedSuccess(false);
  };

  const addDirector = () => {
    setDirectors((prev) => [
      ...prev,
      {
        fullName: '',
        idNumber: '',
        isOrganOfStateEmployee: false,
        organOfStateDetails: '',
        linkedCsdEnterprises: [],
      },
    ]);
    setSavedSuccess(false);
  };

  const updateDirector = (idx: number, patch: Partial<DirectorInfo>) => {
    setDirectors((prev) =>
      prev.map((d, i) => (i === idx ? { ...d, ...patch } : d))
    );
    setSavedSuccess(false);
  };

  const removeDirector = (idx: number) => {
    setDirectors((prev) => prev.filter((_, i) => i !== idx));
    setSavedSuccess(false);
  };

  const addLinkedEnterprise = (dirIdx: number) => {
    setDirectors((prev) =>
      prev.map((d, i) =>
        i === dirIdx
          ? {
              ...d,
              linkedCsdEnterprises: [
                ...d.linkedCsdEnterprises,
                { enterpriseName: '', csdNumber: 'MAAA', status: 'Active' },
              ],
            }
          : d
      )
    );
    setSavedSuccess(false);
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedSuccess(false);
    setErrorMessage(null);
    try {
      const cleanDirectors = directors
        .filter((d) => d.fullName.trim().length > 0 && d.idNumber.trim().length >= 6)
        .map((d) => ({
          ...d,
          fullName: d.fullName.trim(),
          idNumber: d.idNumber.trim(),
          organOfStateDetails: d.organOfStateDetails?.trim() || undefined,
          linkedCsdEnterprises: d.linkedCsdEnterprises.filter(
            (ent) => ent.enterpriseName.trim() && ent.csdNumber.trim()
          ),
        }));

      const updated = await saveContractorSettingsAction({
        companyName,
        registrationNumber,
        csdMaaaNumber,
        taxRefNumber,
        taxPinNumber,
        cidbGrade,
        bbbeeLevel,
        planTier,
        municipalRegions,
        sectors,
        whatsappNumber,
        directors: cleanDirectors,
      });
      setTaxPinNumber(updated.taxPinNumber);
      setWhatsappNumber(updated.whatsappNumber);
      setDirectors(updated.directors ?? cleanDirectors);
      setSavedSuccess(true);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Unable to save contractor profile'
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-5 text-text-tertiary animate-spin" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-text-primary m-0">
          Contractor Profile, Tax &amp; SBD 4 Disclosures
        </h3>
        <p className="text-xs text-text-tertiary mt-1 m-0">
          Used for National Treasury portal matching, WhatsApp Alert routing (+27 E.164), and PFMA SCM Instruction 12 &amp; 14 SBD 4 stamping. SARS TCS PINs are masked at rest; never enter eFiling, CIPC, or CSD passwords.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="company-name"
            className="block text-xs font-medium text-text-secondary mb-1.5"
          >
            Company Legal Name
          </label>
          <input
            id="company-name"
            type="text"
            required
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            className="w-full rounded-lg bg-[#09090B] border border-white/10 px-3 py-2 text-xs text-text-primary outline-none focus:border-accent-500"
          />
        </div>

        <div>
          <label
            htmlFor="registration-number"
            className="block text-xs font-medium text-text-secondary mb-1.5"
          >
            CIPC Registration Number
          </label>
          <input
            id="registration-number"
            type="text"
            value={registrationNumber}
            onChange={(e) => setRegistrationNumber(e.target.value)}
            placeholder="2021/458912/07"
            className="w-full rounded-lg bg-[#09090B] border border-white/10 px-3 py-2 text-xs text-text-primary font-mono outline-none focus:border-accent-500"
          />
        </div>

        <div>
          <label
            htmlFor="csd-number"
            className="block text-xs font-medium text-text-secondary mb-1.5"
          >
            CSD Supplier Number (MAAA)
          </label>
          <input
            id="csd-number"
            type="text"
            required
            value={csdMaaaNumber}
            onChange={(e) => setCsdMaaaNumber(e.target.value)}
            className="w-full rounded-lg bg-[#09090B] border border-white/10 px-3 py-2 text-xs text-text-primary font-mono outline-none focus:border-accent-500"
          />
        </div>

        <div>
          <label
            htmlFor="whatsapp-number"
            className="flex items-center gap-1.5 text-xs font-medium text-text-secondary mb-1.5"
          >
            <MessageSquare className="size-3.5 text-emerald-400" />
            WhatsApp Phone (+27...)
          </label>
          <input
            id="whatsapp-number"
            type="tel"
            required
            value={whatsappNumber}
            onChange={(e) => setWhatsappNumber(e.target.value)}
            placeholder="+27825550148"
            className="w-full rounded-lg bg-[#09090B] border border-white/10 px-3 py-2 text-xs text-text-primary font-mono outline-none focus:border-accent-500"
          />
        </div>

        <div>
          <label
            htmlFor="tax-ref-number"
            className="block text-xs font-medium text-text-secondary mb-1.5"
          >
            SARS Income Tax Reference No.
          </label>
          <input
            id="tax-ref-number"
            type="text"
            value={taxRefNumber}
            onChange={(e) => setTaxRefNumber(e.target.value)}
            placeholder="9482014829"
            className="w-full rounded-lg bg-[#09090B] border border-white/10 px-3 py-2 text-xs text-text-primary font-mono outline-none focus:border-accent-500"
          />
        </div>

        <div>
          <label
            htmlFor="tax-pin-number"
            className="block text-xs font-medium text-text-secondary mb-1.5"
          >
            SARS TCS PIN (Masked at Rest)
          </label>
          <input
            id="tax-pin-number"
            type="text"
            value={taxPinNumber}
            onChange={(e) => setTaxPinNumber(e.target.value)}
            placeholder="TCS-8841209341"
            className="w-full rounded-lg bg-[#09090B] border border-white/10 px-3 py-2 text-xs text-text-primary font-mono outline-none focus:border-accent-500"
          />
        </div>

        <div>
          <label
            htmlFor="cidb-grade"
            className="flex items-center gap-1.5 text-xs font-medium text-text-secondary mb-1.5"
          >
            <Shield className="size-3.5 text-accent-400" />
            CIDB Contractor Grade
          </label>
          <select
            id="cidb-grade"
            value={cidbGrade}
            onChange={(e) => setCidbGrade(e.target.value)}
            className="w-full rounded-lg bg-[#09090B] border border-white/10 px-3 py-2 text-xs text-text-primary outline-none focus:border-accent-500"
          >
            {CIDB_GRADES.map((grade) => (
              <option key={grade} value={grade}>
                {grade}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="bbbee-level"
            className="block text-xs font-medium text-text-secondary mb-1.5"
          >
            B-BBEE Status Level
          </label>
          <select
            id="bbbee-level"
            value={bbbeeLevel}
            onChange={(e) => setBbbeeLevel(e.target.value)}
            className="w-full rounded-lg bg-[#09090B] border border-white/10 px-3 py-2 text-xs text-text-primary outline-none focus:border-accent-500"
          >
            <option value="">Select B-BBEE level</option>
            {BBBEE_LEVELS.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Plan Tier */}
      <div>
        <label
          htmlFor="plan-tier"
          className="block text-xs font-medium text-text-secondary mb-1.5"
        >
          Workspace AI Spend Cap Tier
        </label>
        <select
          id="plan-tier"
          value={planTier}
          onChange={(e) => setPlanTier(e.target.value as PlanTier)}
          className="w-full sm:w-64 rounded-lg bg-[#09090B] border border-white/10 px-3 py-2 text-xs text-text-primary outline-none focus:border-accent-500"
        >
          <option value="starter">Starter ($15 / month cap)</option>
          <option value="pro">Pro ($45 / month cap)</option>
          <option value="ops">Ops ($120 / month cap)</option>
        </select>
      </div>

      {/* Procurement Sectors */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-text-secondary">
            Primary Tender Sectors ({sectors.length} selected)
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {TENDER_SECTORS.map((sec) => {
            const checked = sectors.includes(sec.id);
            return (
              <label
                key={sec.id}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                  checked
                    ? 'border-accent-500/50 bg-accent-500/10 text-text-primary'
                    : 'border-white/10 bg-[#09090B]/60 text-text-secondary hover:border-white/20'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleSector(sec.id)}
                  className="rounded border-white/20"
                />
                <span className="truncate">{sec.label}</span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Municipal Regions */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
            <MapPin className="size-3.5 text-accent-400" />
            Municipal Regions Monitored ({municipalRegions.length} selected)
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {MUNICIPAL_REGIONS.map((region) => {
            const checked = municipalRegions.includes(region);
            return (
              <label
                key={region}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                  checked
                    ? 'border-accent-500/50 bg-accent-500/10 text-text-primary'
                    : 'border-white/10 bg-[#09090B]/60 text-text-secondary hover:border-white/20'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleRegion(region)}
                  className="rounded border-white/20"
                />
                <span className="truncate">{region}</span>
              </label>
            );
          })}
        </div>
      </div>

      {/* SBD 4 Director Disclosures */}
      <div className="space-y-3 pt-2 border-t border-white/10">
        <div className="flex items-center justify-between">
          <div>
            <span className="flex items-center gap-1.5 text-xs font-semibold text-text-primary">
              <Users className="size-3.5 text-accent-400" />
              SBD 4 Director Disclosures (SCM Inst. 12 &amp; 14 of 2026/27)
            </span>
            <p className="text-[11px] text-text-tertiary mt-0.5 m-0">
              Stamped dynamically onto SBD 4 returnables for every tender bid.
            </p>
          </div>
          <button
            type="button"
            onClick={addDirector}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] border border-white/10 text-xs text-zinc-200 cursor-pointer"
          >
            <Plus className="size-3" />
            <span>Add Director</span>
          </button>
        </div>

        {directors.length === 0 ? (
          <div className="rounded-lg bg-[#09090B]/60 border border-white/10 px-3 py-3 text-xs text-zinc-500">
            No directors configured yet. Add company directors to auto-populate SBD 4 disclosure tables.
          </div>
        ) : (
          <div className="space-y-3">
            {directors.map((dir, dIdx) => (
              <div
                key={dIdx}
                className="rounded-xl bg-[#09090B]/80 border border-white/10 p-3 space-y-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-medium text-zinc-400">
                    Director #{dIdx + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeDirector(dIdx)}
                    aria-label={`Remove director ${dIdx + 1}`}
                    className="text-zinc-500 hover:text-rose-400 bg-transparent border-none cursor-pointer p-0.5"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <input
                    type="text"
                    placeholder="Full Name (as per SA ID)"
                    value={dir.fullName}
                    onChange={(e) =>
                      updateDirector(dIdx, { fullName: e.target.value })
                    }
                    className="rounded-lg bg-[#141416] border border-white/10 px-2.5 py-1.5 text-xs text-zinc-100 outline-none focus:border-white/25"
                  />
                  <input
                    type="text"
                    placeholder="SA ID / Passport Number"
                    value={dir.idNumber}
                    onChange={(e) =>
                      updateDirector(dIdx, { idNumber: e.target.value })
                    }
                    className="rounded-lg bg-[#141416] border border-white/10 px-2.5 py-1.5 text-xs font-mono text-zinc-100 outline-none focus:border-white/25"
                  />
                </div>

                <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={dir.isOrganOfStateEmployee}
                    onChange={(e) =>
                      updateDirector(dIdx, {
                        isOrganOfStateEmployee: e.target.checked,
                      })
                    }
                  />
                  <span>Employed by an Organ of State</span>
                </label>

                {dir.isOrganOfStateEmployee && (
                  <input
                    type="text"
                    placeholder="Department / Municipality & Post Details"
                    value={dir.organOfStateDetails ?? ''}
                    onChange={(e) =>
                      updateDirector(dIdx, {
                        organOfStateDetails: e.target.value,
                      })
                    }
                    className="w-full rounded-lg bg-[#141416] border border-white/10 px-2.5 py-1.5 text-xs text-zinc-100 outline-none focus:border-white/25"
                  />
                )}

                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-zinc-500">
                      Linked CSD Enterprises ({dir.linkedCsdEnterprises.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => addLinkedEnterprise(dIdx)}
                      className="text-[11px] text-accent-400 hover:text-accent-300 bg-transparent border-none cursor-pointer"
                    >
                      + Add Enterprise
                    </button>
                  </div>
                  {dir.linkedCsdEnterprises.map((ent, eIdx) => (
                    <div
                      key={eIdx}
                      className="grid grid-cols-1 sm:grid-cols-3 gap-2"
                    >
                      <input
                        type="text"
                        placeholder="Enterprise Name"
                        value={ent.enterpriseName}
                        onChange={(e) => {
                          const next = [...dir.linkedCsdEnterprises];
                          next[eIdx] = {
                            ...ent,
                            enterpriseName: e.target.value,
                          };
                          updateDirector(dIdx, { linkedCsdEnterprises: next });
                        }}
                        className="rounded-lg bg-[#141416] border border-white/10 px-2 py-1 text-[11px] text-zinc-100 outline-none"
                      />
                      <input
                        type="text"
                        placeholder="MAAA Number"
                        value={ent.csdNumber}
                        onChange={(e) => {
                          const next = [...dir.linkedCsdEnterprises];
                          next[eIdx] = { ...ent, csdNumber: e.target.value };
                          updateDirector(dIdx, { linkedCsdEnterprises: next });
                        }}
                        className="rounded-lg bg-[#141416] border border-white/10 px-2 py-1 text-[11px] font-mono text-zinc-100 outline-none"
                      />
                      <input
                        type="text"
                        placeholder="Status (Active / Dormant)"
                        value={ent.status}
                        onChange={(e) => {
                          const next = [...dir.linkedCsdEnterprises];
                          next[eIdx] = { ...ent, status: e.target.value };
                          updateDirector(dIdx, { linkedCsdEnterprises: next });
                        }}
                        className="rounded-lg bg-[#141416] border border-white/10 px-2 py-1 text-[11px] text-zinc-100 outline-none"
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {errorMessage && (
        <div className="rounded-lg bg-rose-500/10 border border-rose-500/25 px-3 py-2 text-xs text-rose-300 flex items-center gap-2">
          <AlertCircle className="size-3.5 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      <div className="flex items-center justify-between pt-3 border-t border-white/10">
        <div className="text-xs">
          {savedSuccess && (
            <span className="inline-flex items-center gap-1.5 text-emerald-400">
              <CheckCircle2 className="size-3.5" />
              Profile, tax details &amp; SBD 4 disclosures saved
            </span>
          )}
        </div>
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 rounded-lg bg-accent-600 hover:bg-accent-500 text-white text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer border-none disabled:opacity-50"
        >
          {saving && <Loader2 className="size-3.5 animate-spin" />}
          <span>{saving ? 'Saving...' : 'Save Contractor Profile'}</span>
        </button>
      </div>
    </form>
  );
}
