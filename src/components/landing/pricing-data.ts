export type CurrencyCode = 'ZAR' | 'USD';
export type PlanId = 'starter' | 'pro' | 'ops';

export interface PricingTier {
  id: PlanId;
  name: string;
  subtitle: string;
  priceZar: string;
  priceUsd: string;
  periodLabel: string;
  highlighted?: boolean;
  badgeLabel?: string;
  features: string[];
  ctaLabel: string;
  ctaHref: string;
  signupBadgeDetail: string;
}

export const PRICING_TIERS: PricingTier[] = [
  {
    id: 'starter',
    name: 'Starter',
    subtitle: 'For solo operators testing autonomous workflows.',
    priceZar: 'R0',
    priceUsd: '$0',
    periodLabel: '/ month',
    features: [
      '06:30 AM daily eTenders & municipal scan digest',
      'Conversational KlerkDesk chat workspace',
      '1 active agent workflow thread',
      'Bring-your-own OpenRouter API key (BYOK)',
    ],
    ctaLabel: 'Start free',
    ctaHref: '/signup?plan=starter',
    signupBadgeDetail: 'R0/mo (Free starter tier)',
  },
  {
    id: 'pro',
    name: 'Pro',
    subtitle: 'Full compliance vault, SBD stamping & WhatsApp approvals.',
    priceZar: 'R1,490',
    priceUsd: '$79',
    periodLabel: '/ month',
    highlighted: true,
    badgeLabel: 'Most popular',
    features: [
      'Unlimited OCDS & municipal tender matching',
      'Encrypted Compliance Vault (7-day CSD & 90-day CIPC alerts)',
      'Automated SBD 1, 4 & 6.1 returnable PDF stamping',
      'WhatsApp Approval Shield alerts & mobile sign-off',
      'Managed AI routing included (no API key required)',
    ],
    ctaLabel: 'Start 14-day pilot',
    ctaHref: '/signup?plan=pro',
    signupBadgeDetail: 'R1,490/mo (14-day free pilot)',
  },
  {
    id: 'ops',
    name: 'Ops / Teams',
    subtitle: 'Dedicated cloud desktop browser & done-for-you setup.',
    priceZar: 'R4,950',
    priceUsd: '$275',
    periodLabel: '/ month',
    features: [
      'Everything in Pro',
      'Dedicated persistent cloud desktop browser (60fps stream)',
      'Automated BoQ line-item extraction & margin checks',
      'Up to 5 team seats with role-based Approval Shield',
      'Priority white-glove onboarding by MundusMK',
    ],
    ctaLabel: 'Get started',
    ctaHref: '/signup?plan=ops',
    signupBadgeDetail: 'R4,950/mo (Dedicated cloud desk)',
  },
];

export function formatTierPrice(
  tier: PricingTier,
  currency: CurrencyCode
): { amount: string; period: string } {
  return {
    amount: currency === 'USD' ? tier.priceUsd : tier.priceZar,
    period: tier.periodLabel,
  };
}

export function parsePlanParam(raw: string | null | undefined): PlanId | null {
  if (!raw) return null;
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'starter' || normalized === 'pro' || normalized === 'ops') {
    return normalized;
  }
  return null;
}

export function formatSelectedPlanBadge(planId: PlanId | null): string | null {
  if (!planId) return null;
  const tier = PRICING_TIERS.find((t) => t.id === planId);
  if (!tier) return null;
  return `Selected: ${tier.name} — ${tier.signupBadgeDetail}`;
}
