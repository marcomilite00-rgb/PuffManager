import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  glow?: 'primary' | 'danger' | 'success' | 'warning' | 'none';
  hover?: boolean;
  as?: 'div' | 'button' | 'article';
  onClick?: () => void;
}

export const GlassCard: React.FC<GlassCardProps> = ({
  children,
  className,
  glow = 'none',
  hover = true,
  as: Tag = 'div',
  onClick,
}) => {
  const glowStyles = {
    primary: 'border-primary/10 hover:border-primary/25',
    danger: 'border-danger/10 hover:border-danger/25',
    success: 'border-success/10 hover:border-success/25',
    warning: 'border-warning/10 hover:border-warning/25',
    none: 'border-white/5 hover:border-white/10',
  };

  return (
    <Tag
      onClick={onClick}
      className={cn(
        'relative overflow-hidden rounded-2xl md:rounded-[2rem] backdrop-blur-xl transition-all duration-500',
        'bg-gradient-to-br from-white/[0.04] to-white/[0.01]',
        'border',
        glowStyles[glow],
        hover && 'hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-0.5',
        'group',
        className
      )}
    >
      {/* Subtle inner glow */}
      <div className="absolute -inset-1 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none rounded-[inherit]" />
      {/* Content */}
      <div className="relative z-10">{children}</div>
    </Tag>
  );
};
