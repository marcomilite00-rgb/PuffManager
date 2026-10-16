import React from 'react';
import { cn } from '../../lib/cn';

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
  as: Tag = 'div',
  onClick,
}) => {
  return (
    <Tag onClick={onClick} className={cn('ios-card p-4', className)}>
      {children}
    </Tag>
  );
};
