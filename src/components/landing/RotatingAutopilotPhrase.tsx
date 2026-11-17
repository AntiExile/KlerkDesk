'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type Variants,
} from 'framer-motion';

interface RotatingAutopilotPhraseProps {
  word: string;
}

const CHAR_VARIANTS: Variants = {
  initial: {
    y: 18,
    opacity: 0,
    scale: 0.94,
    filter: 'blur(4px)',
  },
  animate: (index: number) => ({
    y: 0,
    opacity: 1,
    scale: 1,
    filter: 'blur(0px)',
    transition: {
      duration: 0.38,
      delay: index * 0.028,
      ease: [0.16, 1, 0.3, 1],
    },
  }),
  exit: (index: number) => ({
    y: -14,
    opacity: 0,
    scale: 0.96,
    filter: 'blur(3px)',
    transition: {
      duration: 0.14,
      delay: index * 0.008,
      ease: [0.4, 0, 1, 1],
    },
  }),
};

const REDUCED_CHAR_VARIANTS: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.14 } },
  exit: { opacity: 0, transition: { duration: 0.1 } },
};

export function RotatingAutopilotPhrase({
  word,
}: RotatingAutopilotPhraseProps) {
  const prefersReduced = useReducedMotion();
  const measureRef = useRef<HTMLSpanElement>(null);
  const [measuredWidth, setMeasuredWidth] = useState<number | null>(null);
  const hasAnimatedOnceRef = useRef(false);

  const characters = Array.from(word);

  useLayoutEffect(() => {
    const el = measureRef.current;
    if (!el) return;

    const updateWidth = () => {
      const nextWidth = Math.ceil(el.getBoundingClientRect().width);
      if (nextWidth > 0) {
        setMeasuredWidth((prev) => {
          if (prev !== null) {
            hasAnimatedOnceRef.current = true;
          }
          return nextWidth;
        });
      }
    };

    updateWidth();

    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(updateWidth);
    observer.observe(el);
    return () => observer.disconnect();
  }, [word]);

  const shouldAnimateWidth =
    !prefersReduced && hasAnimatedOnceRef.current && measuredWidth !== null;

  return (
    <>
      {/* Hidden mirror with identical character structure to measure exact target width */}
      <span
        ref={measureRef}
        aria-hidden="true"
        className="pointer-events-none invisible absolute left-0 top-0 inline-flex items-baseline whitespace-pre font-bold tracking-tight select-none"
      >
        {characters.map((char, idx) => (
          <span key={`m-${idx}`} className="inline-block">
            {char === ' ' ? '\u00A0' : char}
          </span>
        ))}
      </span>

      {/* Smoothly width-interpolated inline container anchored to text baseline */}
      <motion.span
        aria-label={word}
        initial={false}
        animate={measuredWidth !== null ? { width: measuredWidth } : undefined}
        transition={
          shouldAnimateWidth
            ? {
                width: {
                  type: 'spring',
                  stiffness: 145,
                  damping: 23,
                  mass: 0.9,
                },
              }
            : { duration: 0 }
        }
        className="relative inline-flex items-baseline justify-center align-baseline whitespace-nowrap text-[#34D399]"
      >
        {/* Invisible baseline-holder preserves exact vertical alignment & line height */}
        <span
          aria-hidden="true"
          className="invisible pointer-events-none select-none whitespace-pre"
        >
          {word}
        </span>

        {/* Sequential letter-by-letter cross-transition inside the smoothly resizing width */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={word}
            aria-hidden="true"
            initial="initial"
            animate="animate"
            exit="exit"
            className="pointer-events-none absolute inset-0 inline-flex items-baseline justify-center whitespace-pre"
          >
            {characters.map((char, index) => (
              <motion.span
                key={`${word}-${index}`}
                custom={index}
                variants={prefersReduced ? REDUCED_CHAR_VARIANTS : CHAR_VARIANTS}
                className="inline-block will-change-transform"
              >
                {char === ' ' ? '\u00A0' : char}
              </motion.span>
            ))}
          </motion.span>
        </AnimatePresence>
      </motion.span>
    </>
  );
}
