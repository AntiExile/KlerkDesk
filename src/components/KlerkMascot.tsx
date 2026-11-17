'use client';

import { useCallback, useEffect, useRef } from 'react';
import { createDefinition, createPose, type MascotDefinition } from 'open-mascot';
import { createMascot, type MascotController } from 'open-mascot/web';
import {
  KLERK_MASCOT_VARIANTS,
  normalizeLookTarget,
  type KlerkMascotMood,
  type KlerkMascotVariant,
} from '@/lib/mascot';

export type { KlerkMascotMood, KlerkMascotVariant } from '@/lib/mascot';

export interface KlerkMascotProps {
  mood?: KlerkMascotMood;
  variant?: KlerkMascotVariant;
  size?: number;
  followCursor?: boolean;
  interactiveClick?: boolean;
  className?: string;
}

function buildKlerkDefinition(variant: KlerkMascotVariant): MascotDefinition {
  const preset = KLERK_MASCOT_VARIANTS[variant];
  const definition = createDefinition({
    name: 'Klerk',
    shape: preset.shape,
    color: preset.color,
    eyeShape: 'capsule',
    eyeColor: preset.eyeColor,
    stageColor: '#0A0A0B',
    renderMode: 'projected-3d',
  });

  if (definition.expressions.beaming) {
    definition.expressions.beaming.motion = {
      body: 'boing',
      eyes: 'none',
    };
  }

  if (definition.expressions.uneasy) {
    definition.expressions.uneasy.motion = {
      body: 'slow-drift',
      eyes: 'tremble',
    };
  }

  if (definition.expressions.curious) {
    definition.expressions.curious.motion = {
      body: 'slow-drift',
      eyes: 'none',
    };
  }

  definition.expressions.attentive = {
    label: 'Attentive',
    pose: createPose({
      pitch: -3,
      yaw: 8,
      roll: 3,
      gazeX: 2,
      leftEye: { scaleX: 0.96, scaleY: 1.12, x: 0, y: 0, rotation: 0 },
      rightEye: { scaleX: 0.96, scaleY: 1.12, x: 0, y: 0, rotation: 0 },
    }),
    motion: {
      body: 'slow-drift',
      eyes: 'micro-saccades',
    },
  };

  return definition;
}

function applyMoodToController(
  mascot: MascotController,
  mood: KlerkMascotMood
): void {
  switch (mood) {
    case 'scanning':
      mascot.setExpression('curious');
      break;
    case 'waiting_approval':
      mascot.setExpression('attentive');
      break;
    case 'approved':
      mascot.setExpression('beaming');
      mascot.play('happy');
      break;
    case 'blocked':
      mascot.setExpression('uneasy');
      break;
    case 'idle':
    default:
      mascot.setExpression('neutral');
      mascot.play('idle');
      break;
  }
}

export function KlerkMascot({
  mood = 'idle',
  variant = 'chief',
  size = 64,
  followCursor = true,
  interactiveClick = true,
  className = '',
}: KlerkMascotProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mascotRef = useRef<MascotController | null>(null);
  const moodRef = useRef<KlerkMascotMood>(mood);
  const clickResetTimerRef = useRef<number | null>(null);

  moodRef.current = mood;

  useEffect(() => {
    const host = containerRef.current;
    if (!host) return;

    const mediaQuery =
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null;
    const reducedMotion = Boolean(mediaQuery?.matches);

    const definition = buildKlerkDefinition(variant);
    const mascot = createMascot(host, {
      definition,
      animation: 'idle',
      autoplay: !reducedMotion,
      reducedMotion,
    });

    // Keep the outer stage rectangle transparent so the 3D blob floats cleanly over any obsidian card
    const bgRect = mascot.element.querySelector('rect');
    if (bgRect) {
      bgRect.setAttribute('fill-opacity', '0');
    }
    mascot.element.style.width = '100%';
    mascot.element.style.height = '100%';
    mascot.element.style.display = 'block';
    mascot.element.style.overflow = 'visible';

    mascotRef.current = mascot;
    applyMoodToController(mascot, moodRef.current);

    return () => {
      if (clickResetTimerRef.current !== null) {
        window.clearTimeout(clickResetTimerRef.current);
        clickResetTimerRef.current = null;
      }
      mascotRef.current = null;
      mascot.destroy();
    };
  }, [variant]);

  useEffect(() => {
    const mascot = mascotRef.current;
    if (!mascot) return;
    if (clickResetTimerRef.current !== null) {
      window.clearTimeout(clickResetTimerRef.current);
      clickResetTimerRef.current = null;
    }
    applyMoodToController(mascot, mood);
  }, [mood]);

  useEffect(() => {
    if (!followCursor) {
      mascotRef.current?.clearLookTarget();
      return;
    }

    const mediaQuery =
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null;

    if (mediaQuery?.matches) {
      mascotRef.current?.clearLookTarget();
      return;
    }

    let frameScheduled = false;
    let latestPoint: { x: number; y: number } | null = null;

    const flushLookTarget = () => {
      frameScheduled = false;
      const mascot = mascotRef.current;
      const host = containerRef.current;
      if (!mascot || !host || !latestPoint) return;
      const rect = host.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const target = normalizeLookTarget(latestPoint.x, latestPoint.y, rect);
      mascot.setLookTarget(target);
    };

    const handlePointerMove = (event: PointerEvent) => {
      latestPoint = { x: event.clientX, y: event.clientY };
      if (!frameScheduled) {
        frameScheduled = true;
        window.requestAnimationFrame(flushLookTarget);
      }
    };

    const handlePointerLeave = () => {
      latestPoint = null;
      mascotRef.current?.clearLookTarget();
    };

    const handleReducedMotionChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        latestPoint = null;
        mascotRef.current?.clearLookTarget();
      }
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('pointerleave', handlePointerLeave);
    window.addEventListener('blur', handlePointerLeave);
    mediaQuery?.addEventListener('change', handleReducedMotionChange);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerleave', handlePointerLeave);
      window.removeEventListener('blur', handlePointerLeave);
      mediaQuery?.removeEventListener('change', handleReducedMotionChange);
    };
  }, [followCursor]);

  const handleClick = useCallback(() => {
    if (!interactiveClick) return;
    const mascot = mascotRef.current;
    if (!mascot) return;

    mascot.setExpression('beaming');
    mascot.play('happy');

    if (clickResetTimerRef.current !== null) {
      window.clearTimeout(clickResetTimerRef.current);
    }
    clickResetTimerRef.current = window.setTimeout(() => {
      clickResetTimerRef.current = null;
      if (mascotRef.current) {
        applyMoodToController(mascotRef.current, moodRef.current);
      }
    }, 1800);
  }, [interactiveClick]);

  const variantLabel = KLERK_MASCOT_VARIANTS[variant].label;

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={`${variantLabel} (${mood.replace('_', ' ')})`}
      data-mascot-variant={variant}
      data-mascot-mood={mood}
      onClick={interactiveClick ? handleClick : undefined}
      style={{ width: size, height: size }}
      className={`relative inline-flex items-center justify-center shrink-0 select-none ${
        interactiveClick ? 'cursor-pointer' : ''
      } ${className}`.trim()}
    />
  );
}
