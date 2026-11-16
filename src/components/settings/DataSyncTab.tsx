'use client';

import { useState, useEffect, type FormEvent } from 'react';
import { CheckCircle2, Loader2, MapPin, MessageSquare, Shield } from 'lucide-react';
import {
  getContractorSettingsAction,
  saveContractorSettingsAction,
} from '@/app/actions/settings';

const CIDB_GRADES = [
  '1CE', '2CE', '3CE', '4CE', '5CE', '6CE PE', '7CE', '8CE', '9CE',
  '4GB', '5GB', '6GB PE', '7GB',
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
];

export function DataSyncTab() {
  const [companyName, setCompanyName] = useState('');
  const [csdMaaaNumber, setCsdMaaaNumber] = useState('');
  const [cidbGrade, setCidbGrade] = useState('6CE PE');
  const [municipalRegions, setMunicipalRegions] = useState<string[]>([]);
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    getContractorSettingsAction()
      .then((settings) => {
        setCompanyName(settings.companyName);
        setCsdMaaaNumber(settings.csdMaaaNumber);
        setCidbGrade(settings.cidbGrade);
        setMunicipalRegions(settings.municipalRegions);
        setWhatsappNumber(settings.whatsappNumber);
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

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedSuccess(false);
    try {
      await saveContractorSettingsAction({
        companyName,
        csdMaaaNumber,
        cidbGrade,
        municipalRegions,
        whatsappNumber,
      });
      setSavedSuccess(true);
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
        <h3 className="text-sm font-semibold text-text-primary">
          Contractor Profile &amp; Municipal Targeting
        </h3>
        <p className="text-xs text-text-tertiary mt-1">
          Configure CIDB grading, target municipalities for portal scans, and WhatsApp alert routing.
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
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            htmlFor="whatsapp-number"
            className="flex items-center gap-1.5 text-xs font-medium text-text-secondary mb-1.5"
          >
            <MessageSquare className="size-3.5 text-emerald-400" />
            WhatsApp Notification Number
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
      </div>

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

      <div className="flex items-center justify-between pt-3 border-t border-white/10">
        <div className="text-xs">
          {savedSuccess && (
            <span className="inline-flex items-center gap-1.5 text-emerald-400">
              <CheckCircle2 className="size-3.5" />
              Profile &amp; regions saved
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
