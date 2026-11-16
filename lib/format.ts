import type { TenderMatch } from '@/types';

/**
 * Formats South African Rand figures with space thousands separators (`R 14 850 000`)
 * matching tabular-nums presentation across the conversational stream and drawers.
 */
export function formatSpacedRand(amount: number, decimals = 0): string {
  const fixed = amount.toFixed(decimals);
  const [whole, frac] = fixed.split('.');
  const spaced = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return decimals > 0 ? `R ${spaced}.${frac}` : `R ${spaced}`;
}

export function formatMillionsRand(amount: number): string {
  const millions = amount / 1_000_000;
  return `R ${millions.toFixed(2)}M`;
}

export function getShortTenderLabel(tender: TenderMatch): string {
  if (tender.id === 'ET-2026-WC-0842') return 'George — York St Upgrade';
  if (tender.id === 'ET-2026-WC-0911') return 'Oudtshoorn — Bulk Water';
  if (tender.id === 'ET-2026-WC-1044') return 'Mossel Bay — Stormwater';
  if (tender.id === 'ET-2026-CPT-2201') return 'Cape Town — Civil Plinths';
  return `${tender.region} — ${tender.tenderNumber}`;
}

export function formatShortClosingDate(isoDate: string): string {
  try {
    return new Date(isoDate).toLocaleDateString('en-ZA', {
      day: 'numeric',
      month: 'short',
    });
  } catch {
    return isoDate.slice(0, 10);
  }
}
