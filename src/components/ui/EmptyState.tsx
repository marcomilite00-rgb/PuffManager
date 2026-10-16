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
  <div className="ios-card flex flex-col items-center justify-center py-12 px-6 text-center">
    <div
      className="w-14 h-14 rounded-full flex items-center justify-center mb-4"
      style={{ background: 'var(--surface-tertiary)', color: 'var(--label-secondary)' }}
    >
      <Icon size={26} />
    </div>
    <h3 className="ios-headline">{title}</h3>
    {subtitle && <p className="ios-footnote mt-1 max-w-xs">{subtitle}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);
