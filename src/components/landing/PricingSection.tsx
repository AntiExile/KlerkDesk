'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { ArrowRight, Check } from 'lucide-react';
import {
  PRICING_TIERS,
  formatTierPrice,
  type CurrencyCode,
} from './pricing-data';

export function PricingSection() {
  const [currency, setCurrency] = useState<CurrencyCode>('ZAR');

  return (
    <MotionConfig reducedMotion="user">
      <section
        id="pricing"
        className="scroll-mt-16 px-4 sm:px-6 py-16 border-t border-white/[0.06]"
      >
        <div className="max-w-5xl mx-auto">
          {/* Section Header & Currency Toggle */}
          <div className="text-center mb-10 space-y-4">
            <h2 className="text-2xl sm:text-4xl font-bold tracking-tight text-white m-0 text-balance">
              Simple, predictable pricing
            </h2>
            <p className="text-sm sm:text-base text-zinc-400 max-w-2xl mx-auto m-0 leading-relaxed">
              Start free with daily scans, upgrade when you want automated SBD packs and a dedicated cloud desk.
            </p>

            <div className="pt-1 flex justify-center">
              <div
                role="group"
                aria-label="Pricing currency"
                className="inline-flex items-center gap-1 p-1 rounded-full bg-[#111113] border border-white/10"
              >
                <button
                  type="button"
                  aria-pressed={currency === 'ZAR'}
                  onClick={() => setCurrency('ZAR')}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer border-0 whitespace-nowrap shrink-0 ${
                    currency === 'ZAR'
                      ? 'bg-white text-black'
                      : 'bg-transparent text-zinc-400 hover:text-white'
                  }`}
                >
                  ZAR (R)
                </button>
                <button
                  type="button"
                  aria-pressed={currency === 'USD'}
                  onClick={() => setCurrency('USD')}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer border-0 whitespace-nowrap shrink-0 ${
                    currency === 'USD'
                      ? 'bg-white text-black'
                      : 'bg-transparent text-zinc-400 hover:text-white'
                  }`}
                >
                  USD ($)
                </button>
              </div>
            </div>
          </div>

          {/* 3-Tier Pricing Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
            {PRICING_TIERS.map((tier) => {
              const price = formatTierPrice(tier, currency);
              const isHighlighted = Boolean(tier.highlighted);

              return (
                <div
                  key={tier.id}
                  className={
                    isHighlighted
                      ? 'bg-[#141417] border border-emerald-500/40 rounded-2xl p-6 relative flex flex-col justify-between gap-6 shadow-xl shadow-emerald-950/20 transition-transform duration-200 hover:-translate-y-0.5'
                      : 'bg-[#111113] border border-white/10 rounded-2xl p-6 flex flex-col justify-between gap-6 transition-transform duration-200 hover:-translate-y-0.5'
                  }
                >
                  {isHighlighted && tier.badgeLabel && (
                    <span className="absolute top-5 right-5 bg-emerald-500/15 text-emerald-400 text-xs px-2.5 py-0.5 rounded-full font-medium whitespace-nowrap">
                      {tier.badgeLabel}
                    </span>
                  )}

                  <div className="space-y-4">
                    <div>
                      <h3
                        className={
                          isHighlighted
                            ? 'text-base font-semibold text-white m-0 pr-24'
                            : 'text-base font-semibold text-white m-0'
                        }
                      >
                        {tier.name}
                      </h3>
                      <p className="text-xs sm:text-sm text-zinc-400 mt-1.5 mb-0 leading-relaxed min-h-[2.75rem]">
                        {tier.subtitle}
                      </p>
                    </div>

                    <div className="flex items-baseline gap-1.5 pt-1">
                      <AnimatePresence mode="wait">
                        <motion.span
                          key={`${tier.id}-${currency}`}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -6 }}
                          transition={{ duration: 0.16 }}
                          className="text-3xl sm:text-4xl font-bold text-white tabular-nums tracking-tight"
                        >
                          {price.amount}
                        </motion.span>
                      </AnimatePresence>
                      <span className="text-sm text-zinc-500 whitespace-nowrap">
                        {price.period}
                      </span>
                    </div>

                    <ul className="space-y-2.5 text-sm text-zinc-300 list-none p-0 m-0 pt-2 border-t border-white/[0.06]">
                      {tier.features.map((feature) => (
                        <li key={feature} className="flex items-start gap-2.5">
                          <Check className="size-4 text-emerald-400 mt-0.5 shrink-0" />
                          <span className="text-xs sm:text-sm leading-relaxed">
                            {feature}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <Link
                    href={tier.ctaHref}
                    className={
                      isHighlighted
                        ? 'bg-white text-black hover:bg-zinc-200 font-medium rounded-full w-full py-2.5 inline-flex items-center justify-center text-sm no-underline transition-colors whitespace-nowrap'
                        : 'bg-[#18181B] hover:bg-[#222227] border border-white/10 text-white font-medium rounded-full w-full py-2.5 inline-flex items-center justify-center text-sm no-underline transition-colors whitespace-nowrap'
                    }
                  >
                    {tier.ctaLabel}
                  </Link>
                </div>
              );
            })}
          </div>

          <div className="mt-8 text-center">
            <a
              href="mailto:support@mundusmk.co.za?subject=Enterprise%20%2F%20Custom%20Agent%20Workflows"
              className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-emerald-400 no-underline transition-colors"
            >
              <span>Enterprise / Custom Agent Workflows</span>
              <ArrowRight className="size-3.5" />
            </a>
          </div>
        </div>
      </section>
    </MotionConfig>
  );
}
