'use client';

import { motion } from 'framer-motion';

interface ToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  label?: string;
  description?: string;
}

export function Toggle({ enabled, onChange, label, description }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={() => onChange(!enabled)}
      className="flex items-center gap-3 group cursor-pointer bg-transparent border-none p-0 text-left"
    >
      <div
        className={`
          relative inline-flex h-6 w-11 shrink-0 rounded-full
          transition-colors duration-200 ease-in-out
          ${enabled ? 'bg-accent-500' : 'bg-surface-tertiary'}
        `}
      >
        <motion.div
          className="pointer-events-none inline-block size-5 rounded-full bg-white shadow-lg"
          animate={{ x: enabled ? 22 : 2 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          style={{ marginTop: 2 }}
        />
      </div>
      {(label || description) && (
        <div className="flex flex-col">
          {label && (
            <span className="text-sm font-medium text-text-primary">
              {label}
            </span>
          )}
          {description && (
            <span className="text-xs text-text-tertiary">{description}</span>
          )}
        </div>
      )}
    </button>
  );
}
