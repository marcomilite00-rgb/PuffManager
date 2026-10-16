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
  hover = false,
  as: Tag = 'div',
  onClick,
}) => {
  const isInteractive = hover || !!onClick || Tag === 'button';

  return (
    <Tag
      onClick={onClick}
      className={cn(
        'spatial-panel',
        isInteractive && 'spatial-panel-interactive cursor-pointer',
        className
      )}
    >
      {children}
    </Tag>
  );
};
