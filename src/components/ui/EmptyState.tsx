import React from 'react';
import { motion } from 'framer-motion';
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
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="flex flex-col items-center justify-center py-16 px-6 rounded-3xl border border-dashed border-white/5 bg-white/[0.02]"
  >
    <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-5">
      <Icon size={32} className="text-slate-600" />
    </div>
    <h3 className="text-base font-black text-slate-400 uppercase tracking-widest text-center">{title}</h3>
    {subtitle && <p className="text-xs text-slate-600 mt-2 text-center max-w-xs">{subtitle}</p>}
    {action && <div className="mt-5">{action}</div>}
  </motion.div>
);
