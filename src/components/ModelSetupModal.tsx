'use client';

import {
  useState,
  useEffect,
  useRef,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  X,
  FileCheck2,
  FileWarning,
  ShieldCheck,
  Building2,
  BadgeCheck,
  UserCheck,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import {
  useComplianceVaultQuery,
  useUploadComplianceMutation,
} from '@/lib/convex-react';
import type {
  ComplianceDoc,
  ComplianceDocType,
  ComplianceSummary,
} from '@/types';

interface ModelSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  compliance: ComplianceSummary;
  onComplianceUpdated?: (summary: ComplianceSummary) => void;
  initialDocType?: ComplianceDocType | null;
}

type FilterTab = 'all' | 'action_needed' | 'valid' | 'expiring_soon';

const DOC_META: Record<
  ComplianceDocType,
  {
    displayName: string;
    icon: typeof ShieldCheck;
    iconBg: string;
    needsExpiry: boolean;
  }
> = {
  csd: {
    displayName: 'Central Supplier Database (CSD)',
    icon: Building2,
    iconBg: 'bg-rose-500/15 text-rose-300 border-rose-500/20',
    needsExpiry: false,
  },
  tax_pin: {
    displayName: 'SARS Tax Compliance PIN',
    icon: ShieldCheck,
    iconBg: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20',
    needsExpiry: true,
  },
  coida: {
    displayName: 'COIDA Good Standing',
    icon: FileWarning,
    iconBg: 'bg-amber-500/15 text-amber-300 border-amber-500/20',
    needsExpiry: true,
  },
  bbbee: {
    displayName: 'B-BBEE Certificate / Affidavit',
    icon: BadgeCheck,
    iconBg: 'bg-sky-500/15 text-sky-300 border-sky-500/20',
    needsExpiry: true,
  },
  cipc: {
    displayName: 'CIPC CoR 14.3 Certified',
    icon: FileCheck2,
    iconBg: 'bg-violet-500/15 text-violet-300 border-violet-500/20',
    needsExpiry: false,
  },
  certified_id: {
    displayName: 'Certified Director IDs',
    icon: UserCheck,
    iconBg: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/20',
    needsExpiry: false,
  },
};

function formatRowSubtitle(doc: ComplianceDoc): string {
  if (doc.status === 'missing') {
    if (doc.type === 'csd') {
      return 'Not uploaded yet • 7-day rule';
    }
    if (doc.type === 'cipc' || doc.type === 'certified_id') {
      return 'Not uploaded yet • 90-day rule';
    }
    return 'Not uploaded yet';
  }
  if (doc.type === 'csd') {
    if (doc.status === 'expired' && doc.daysUntilExpiry !== null) {
      return `Expired ${Math.abs(doc.daysUntilExpiry)}d ago • 7-day rule`;
    }
    return `Fresh (${doc.ageDays}d old) • 7-day rule`;
  }
  if (doc.type === 'cipc' || doc.type === 'certified_id') {
    if (doc.status === 'expired' && doc.daysUntilExpiry !== null) {
      return `Expired ${Math.abs(doc.daysUntilExpiry)}d ago • 90-day rule`;
    }
    return `Valid • ${doc.daysUntilExpiry ?? 90}d left (90-day rule)`;
  }
  if (doc.status === 'expired' && doc.daysUntilExpiry !== null) {
    return `Expired ${Math.abs(doc.daysUntilExpiry)}d ago`;
  }
  if (doc.status === 'warning' && doc.daysUntilExpiry !== null) {
    return `Expiring in ${doc.daysUntilExpiry}d`;
  }
  return doc.daysUntilExpiry !== null
    ? `Valid • ${doc.daysUntilExpiry}d left`
    : 'Valid';
}

export function ModelSetupModal({
  isOpen,
  onClose,
  compliance,
  onComplianceUpdated,
  initialDocType = null,
}: ModelSetupModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const reactiveCompliance = useComplianceVaultQuery(compliance);
  const uploadCompliance = useUploadComplianceMutation();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [editingDoc, setEditingDoc] = useState<ComplianceDoc | null>(null);
  const [referenceNumber, setReferenceNumber] = useState('');
  const [issuedAt, setIssuedAt] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [expiresAt, setExpiresAt] = useState(
    new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10)
  );
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen && !dialog.open) {
      dialog.showModal();
      setFeedbackMessage(null);
      setErrorMessage(null);
      if (initialDocType) {
        const target = reactiveCompliance.docs.find(
          (d) => d.type === initialDocType
        );
        if (target) {
          setEditingDoc(target);
          setReferenceNumber(
            target.status === 'missing' ||
              target.referenceNumber === 'Not uploaded'
              ? ''
              : target.referenceNumber
          );
          setIssuedAt(new Date().toISOString().slice(0, 10));
        }
      } else {
        setEditingDoc(null);
      }
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen, initialDocType, reactiveCompliance.docs]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    let pressedOutside = false;
    const isOutside = (e: PointerEvent) => {
      const r = dialog.getBoundingClientRect();
      return (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      );
    };

    const onPointerDown = (e: PointerEvent) => {
      pressedOutside = isOutside(e);
    };
    const onPointerUp = (e: PointerEvent) => {
      if (pressedOutside && isOutside(e)) {
        onClose();
      }
    };
    const onCloseEvent = () => {
      onClose();
    };

    dialog.addEventListener('pointerdown', onPointerDown);
    dialog.addEventListener('pointerup', onPointerUp);
    dialog.addEventListener('close', onCloseEvent);

    return () => {
      dialog.removeEventListener('pointerdown', onPointerDown);
      dialog.removeEventListener('pointerup', onPointerUp);
      dialog.removeEventListener('close', onCloseEvent);
    };
  }, [onClose]);

  const beginEdit = (doc: ComplianceDoc) => {
    setEditingDoc(doc);
    setReferenceNumber(
      doc.status === 'missing' || doc.referenceNumber === 'Not uploaded'
        ? ''
        : doc.referenceNumber
    );
    setIssuedAt(new Date().toISOString().slice(0, 10));
    setExpiresAt(
      doc.expiresAt
        ? doc.expiresAt.slice(0, 10)
        : new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10)
    );
    setSelectedFile(null);
    setFeedbackMessage(null);
    setErrorMessage(null);
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
    if (file) {
      setErrorMessage(null);
    }
  };

  const handleOpenCsdUpload = () => {
    const csd = reactiveCompliance.docs.find((d) => d.type === 'csd');
    if (csd) {
      beginEdit(csd);
    }
  };

  const handleUploadSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingDoc) return;

    const cleanRef = referenceNumber.trim();
    if (cleanRef.length < 2) {
      setErrorMessage('Enter the certificate or MAAA reference number.');
      return;
    }

    if (!selectedFile) {
      setErrorMessage(
        'Select the actual PDF or certified image file to upload into Convex Storage.'
      );
      return;
    }

    setIsSubmitting(true);
    setFeedbackMessage(null);
    setErrorMessage(null);

    try {
      const meta = DOC_META[editingDoc.type];
      const summary = await uploadCompliance({
        type: editingDoc.type,
        referenceNumber: cleanRef,
        issuedAt: new Date(issuedAt).toISOString(),
        expiresAt: meta.needsExpiry ? new Date(expiresAt).toISOString() : null,
        fileName: selectedFile.name,
        fileSizeBytes: selectedFile.size,
        file: selectedFile,
      });
      onComplianceUpdated?.(summary);
      setFeedbackMessage(
        `${meta.displayName} binary uploaded to Convex File Storage.`
      );
      setEditingDoc(null);
      setSelectedFile(null);
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Failed to upload compliance binary.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredDocs = reactiveCompliance.docs.filter((doc) => {
    const meta = DOC_META[doc.type];
    const matchesSearch =
      meta.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.referenceNumber.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (filterTab === 'action_needed') {
      return doc.status === 'expired' || doc.status === 'missing';
    }
    if (filterTab === 'expiring_soon') {
      return doc.status === 'warning' || doc.status === 'expired';
    }
    if (filterTab === 'valid') {
      return doc.status === 'valid';
    }
    return true;
  });

  const filters: { id: FilterTab; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'action_needed', label: 'Action Needed' },
    { id: 'valid', label: 'Valid' },
    { id: 'expiring_soon', label: 'Expiring Soon' },
  ];

  return (
    <dialog
      ref={dialogRef}
      {...({ closedby: 'any' } as Record<string, string>)}
      aria-labelledby="compliance-vault-title"
      className="m-auto w-full max-w-2xl rounded-2xl bg-[#141416] text-zinc-100 border border-white/10 p-0 shadow-2xl shadow-black/80 backdrop:bg-black/70 backdrop:backdrop-blur-sm open:block"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 34 }}
        className="flex flex-col"
      >
        {/* Header */}
        <div className="px-6 pt-5 pb-4 flex items-start justify-between gap-4 border-b border-white/[0.06]">
          <div>
            <h2
              id="compliance-vault-title"
              className="text-base font-semibold text-zinc-100 tracking-tight m-0"
            >
              Compliance Vault
            </h2>
            <p className="text-xs text-zinc-400 mt-1 m-0">
              Your contractor docs in Convex File Storage. CSD must be ≤ 7 days and certified CIPC/IDs ≤ 90 days.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Compliance Vault"
            className="size-8 rounded-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] flex items-center justify-center text-zinc-400 hover:text-zinc-100 cursor-pointer transition-colors shrink-0"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Search & Filter Tabs */}
        <div className="px-6 pt-4 pb-3 space-y-3 border-b border-white/[0.06]">
          <div className="flex items-center gap-2.5 px-3.5 h-10 rounded-xl bg-[#0C0C0D] border border-white/[0.08]">
            <Search className="size-4 text-zinc-500 shrink-0" />
            <input
              type="text"
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search compliance docs..."
              className="flex-1 bg-transparent border-none outline-none text-xs text-zinc-100 placeholder:text-zinc-500"
            />
            <button
              type="button"
              onClick={handleOpenCsdUpload}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-[11px] font-medium text-zinc-200 cursor-pointer shrink-0"
            >
              <RefreshCw className="size-3" />
              <span>Upload CSD PDF</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {filters.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilterTab(f.id)}
                className={`px-3 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer border ${
                  filterTab === f.id
                    ? 'bg-zinc-100 text-zinc-950 border-zinc-100'
                    : 'bg-white/[0.04] text-zinc-400 hover:text-zinc-200 border-white/[0.06]'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {feedbackMessage && (
          <div className="mx-6 mt-3 px-3.5 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-2 text-xs text-emerald-300">
            <CheckCircle2 className="size-3.5 shrink-0" />
            <span>{feedbackMessage}</span>
          </div>
        )}

        {errorMessage && (
          <div className="mx-6 mt-3 px-3.5 py-2 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center gap-2 text-xs text-rose-300">
            <AlertCircle className="size-3.5 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* 2-Column Clean Row Layout */}
        <div className="px-6 py-4 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 max-h-[52vh] overflow-y-auto">
          {filteredDocs.length === 0 ? (
            <div className="col-span-full py-8 text-center text-xs text-zinc-500">
              No compliance documents match this filter.
            </div>
          ) : (
            filteredDocs.map((doc) => {
              const meta = DOC_META[doc.type];
              const Icon = meta.icon;
              const needsAction =
                doc.status === 'expired' ||
                doc.status === 'missing' ||
                doc.status === 'warning';

              return (
                <div
                  key={doc.id}
                  className="flex items-center justify-between gap-3 py-2.5 border-b border-white/[0.05] last:border-b-0"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`size-9 rounded-xl border flex items-center justify-center shrink-0 ${meta.iconBg}`}
                    >
                      <Icon className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-zinc-100 truncate">
                        {meta.displayName}
                      </div>
                      <div
                        className={`text-[11px] truncate tabular-nums mt-0.5 ${
                          doc.status === 'expired'
                            ? 'text-rose-400'
                            : doc.status === 'warning'
                              ? 'text-amber-300'
                              : 'text-zinc-500'
                        }`}
                      >
                        {formatRowSubtitle(doc)}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => beginEdit(doc)}
                    className={`px-3 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer shrink-0 border ${
                      needsAction
                        ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border-white/15'
                        : 'bg-white/[0.04] hover:bg-white/[0.08] text-zinc-400 border-white/[0.06]'
                    }`}
                  >
                    {doc.status === 'expired' || doc.status === 'missing'
                      ? 'Upload'
                      : doc.status === 'warning'
                        ? 'Renew'
                        : 'Replace'}
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Inline Binary Upload Drawer */}
        <AnimatePresence>
          {editingDoc && (
            <motion.form
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 34 }}
              onSubmit={handleUploadSubmit}
              className="px-6 py-4 bg-[#0C0C0D] border-t border-white/[0.08] space-y-3 overflow-hidden"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-200">
                  Upload {DOC_META[editingDoc.type].displayName}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setEditingDoc(null);
                    setErrorMessage(null);
                  }}
                  className="text-[11px] text-zinc-500 hover:text-zinc-300 bg-transparent border-none cursor-pointer"
                >
                  Cancel
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <input
                  type="text"
                  required
                  aria-label="Document reference number"
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                  placeholder="Reference No."
                  className="rounded-lg bg-[#141416] border border-white/10 px-2.5 py-1.5 text-xs text-zinc-100 font-mono outline-none focus:border-white/25"
                />
                <input
                  type="date"
                  required
                  aria-label="Issue or certified date"
                  value={issuedAt}
                  onChange={(e) => setIssuedAt(e.target.value)}
                  className="rounded-lg bg-[#141416] border border-white/10 px-2.5 py-1.5 text-xs text-zinc-100 font-mono outline-none focus:border-white/25"
                />
                {DOC_META[editingDoc.type].needsExpiry ? (
                  <input
                    type="date"
                    required
                    aria-label="Certificate expiry date"
                    value={expiresAt}
                    onChange={(e) => setExpiresAt(e.target.value)}
                    className="rounded-lg bg-[#141416] border border-white/10 px-2.5 py-1.5 text-xs text-zinc-100 font-mono outline-none focus:border-white/25"
                  />
                ) : (
                  <label className="flex items-center justify-center gap-1.5 rounded-lg bg-[#141416] border border-dashed border-white/15 px-2.5 py-1.5 text-[11px] text-zinc-300 cursor-pointer hover:border-white/30">
                    <UploadCloud className="size-3.5 text-zinc-400 shrink-0" />
                    <span className="truncate">
                      {selectedFile ? selectedFile.name : 'Choose PDF / Scan *'}
                    </span>
                    <input
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg"
                      onChange={handleFileChange}
                      className="sr-only"
                    />
                  </label>
                )}
              </div>

              <div className="flex items-center justify-between gap-3">
                {DOC_META[editingDoc.type].needsExpiry ? (
                  <label className="inline-flex items-center gap-1.5 text-[11px] text-zinc-300 hover:text-white cursor-pointer">
                    <UploadCloud className="size-3.5 shrink-0" />
                    <span className="truncate max-w-[260px]">
                      {selectedFile
                        ? `${selectedFile.name} (${Math.round(selectedFile.size / 1024)} KB)`
                        : 'Attach PDF / certified scan *'}
                    </span>
                    <input
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg"
                      onChange={handleFileChange}
                      className="sr-only"
                    />
                  </label>
                ) : (
                  <span className="text-[11px] text-zinc-500">
                    {editingDoc.type === 'csd'
                      ? '7-day rule applied from issue date'
                      : '90-day SAPS/Commissioner rule applied'}
                  </span>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting || !selectedFile}
                  className="px-4 py-1.5 rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-semibold border-none cursor-pointer flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isSubmitting && <Loader2 className="size-3 animate-spin" />}
                  <span>Save to Vault</span>
                </button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>
      </motion.div>
    </dialog>
  );
}
