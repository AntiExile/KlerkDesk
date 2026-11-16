'use client';

interface StatusDotProps {
  status: 'success' | 'warning' | 'error' | 'idle';
  pulse?: boolean;
  size?: 'sm' | 'md';
}

const colorMap = {
  success: 'bg-status-success',
  warning: 'bg-status-warning',
  error: 'bg-status-error',
  idle: 'bg-text-tertiary',
} as const;

const pulseColorMap = {
  success: 'bg-status-success/40',
  warning: 'bg-status-warning/40',
  error: 'bg-status-error/40',
  idle: 'bg-text-tertiary/40',
} as const;

const sizeMap = {
  sm: 'size-2',
  md: 'size-2.5',
} as const;

const pulseSizeMap = {
  sm: 'size-2',
  md: 'size-2.5',
} as const;

export function StatusDot({ status, pulse = false, size = 'sm' }: StatusDotProps) {
  return (
    <span className="relative inline-flex">
      {pulse && (
        <span
          className={`
            animate-ping absolute inline-flex rounded-full opacity-75
            ${pulseColorMap[status]} ${pulseSizeMap[size]}
          `}
        />
      )}
      <span
        className={`
          relative inline-flex rounded-full
          ${colorMap[status]} ${sizeMap[size]}
        `}
      />
    </span>
  );
}
