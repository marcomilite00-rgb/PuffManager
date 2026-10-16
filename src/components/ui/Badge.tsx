import React from 'react';
import { cn } from '../../lib/cn';
import type { ClassValue } from 'clsx';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'primary' | 'success' | 'danger' | 'warning' | 'surface' | 'ghost';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: ClassValue;
  icon?: React.ReactNode;
}

const variantStyles: Record<NonNullable<BadgeProps['variant']>, { chip: string; dot: string }> = {
  primary: {
    chip: 'spatial-chip-blue',
    dot: 'bg-[#0A84FF] shadow-[0_0_8px_rgba(10,132,255,0.7)]',
  },
  success: {
    chip: 'spatial-chip-green',
    dot: 'bg-[#30D158] shadow-[0_0_8px_rgba(48,209,88,0.7)]',
  },
  danger: {
    chip: 'spatial-chip-red',
    dot: 'bg-[#FF453A] shadow-[0_0_8px_rgba(255,69,58,0.7)]',
  },
  warning: {
    chip: 'spatial-chip-orange',
    dot: 'bg-[#FF9F0A] shadow-[0_0_8px_rgba(255,159,10,0.7)]',
  },
  surface: {
    chip: 'spatial-chip-surface',
    dot: 'bg-white/60',
  },
  ghost: {
    chip: 'spatial-chip-surface bg-white/5 border-white/10 text-white/70',
    dot: 'bg-white/40',
  },
};

const sizes = {
  xs: 'text-[10px] px-2 py-0.5 h-5 gap-1.5',
  sm: 'text-[11px] px-2.5 py-0.5 h-6 gap-1.5',
  md: 'text-[12px] px-3 py-1 h-7 gap-2',
  lg: 'text-[13px] px-3.5 py-1.5 h-8 gap-2',
};

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'surface',
  size = 'md',
  className,
  icon,
}) => {
  const current = variantStyles[variant];

  return (
    <span
      className={cn(
        'spatial-chip font-medium',
        current.chip,
        sizes[size],
        className
      )}
    >
      {icon ? (
        <span className="shrink-0 inline-flex items-center">{icon}</span>
      ) : (
        <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', current.dot)} />
      )}
      <span className="truncate">{children}</span>
    </span>
  );
};
