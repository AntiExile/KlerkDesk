import type { ReactNode, ButtonHTMLAttributes } from 'react';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  tooltip?: string;
  variant?: 'ghost' | 'subtle';
  size?: 'sm' | 'md';
}

const sizeClasses = {
  sm: 'size-7 [&_svg]:size-3.5',
  md: 'size-8 [&_svg]:size-4',
} as const;

const variantClasses = {
  ghost: `
    bg-transparent text-text-secondary
    hover:text-text-primary hover:bg-surface-tertiary
    active:bg-surface-tertiary/80
  `,
  subtle: `
    bg-surface-tertiary/50 text-text-secondary
    hover:text-text-primary hover:bg-surface-tertiary
    active:bg-surface-tertiary/80
  `,
} as const;

export function IconButton({
  children,
  tooltip,
  variant = 'ghost',
  size = 'md',
  className = '',
  ...props
}: IconButtonProps) {
  return (
    <button
      type="button"
      title={tooltip}
      className={`
        inline-flex items-center justify-center rounded-md
        transition-colors duration-150 ease-in-out
        cursor-pointer border-none
        focus-visible:outline-2 focus-visible:outline-accent-500
        ${sizeClasses[size]}
        ${variantClasses[variant]}
        ${className}
      `}
      {...props}
    >
      {children}
    </button>
  );
}
