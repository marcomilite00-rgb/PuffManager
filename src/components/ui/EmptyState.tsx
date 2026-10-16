import React from 'react';
import { Package, type LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon = Package,
  title,
  subtitle,
  action,
}) => (
  <div className="spatial-panel flex flex-col items-center justify-center py-12 px-6 text-center my-4">
    <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4 bg-white/10 border border-white/15 text-white/70 shadow-inner">
      <Icon size={28} />
    </div>
    <h3 className="spatial-headline text-white font-semibold">{title}</h3>
    {subtitle && (
      <p className="spatial-footnote text-white/50 mt-1 max-w-sm">
        {subtitle}
      </p>
    )}
    {action && <div className="mt-5">{action}</div>}
  </div>
);
