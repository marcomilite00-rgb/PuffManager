import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';
import { clsx } from 'clsx';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'primary';
  loading?: boolean;
  icon?: React.ReactNode;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen, onClose, onConfirm, title, message,
  confirmLabel = 'Conferma', cancelLabel = 'Annulla',
  variant = 'danger', loading, icon
}) => {
  const variantStyles = {
    danger: { bg: 'bg-danger/10', text: 'text-danger', border: 'border-danger/20', btn: 'bg-danger text-white hover:bg-danger-dark shadow-danger/20' },
    warning: { bg: 'bg-warning/10', text: 'text-warning', border: 'border-warning/20', btn: 'bg-warning text-surface-950 hover:bg-warning-dark shadow-warning/20' },
    primary: { bg: 'bg-primary/10', text: 'text-primary', border: 'border-primary/20', btn: 'bg-primary text-surface-950 hover:bg-primary-dark shadow-primary/20' },
  };
  const s = variantStyles[variant];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.92, y: 20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.92, y: 20, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 260 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-3xl p-6 border border-white/10 shadow-2xl bg-gradient-to-br from-white/[0.06] to-white/[0.01] backdrop-blur-3xl"
          >
            <div className="flex flex-col items-center text-center space-y-4">
              <div className={clsx('w-14 h-14 rounded-2xl flex items-center justify-center border', s.bg, s.text, s.border)}>
                {icon || <AlertTriangle size={28} />}
              </div>
              <div>
                <h3 className="text-lg font-black text-white uppercase italic tracking-tight">{title}</h3>
                <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">{message}</p>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={onClose}
                disabled={loading}
                className="flex-1 py-3 rounded-xl bg-white/5 text-slate-400 font-bold text-xs uppercase tracking-widest hover:text-white transition-colors disabled:opacity-50"
              >
                {cancelLabel}
              </button>
              <button
                onClick={onConfirm}
                disabled={loading}
                className={clsx(
                  'flex-1 py-3 rounded-xl font-black text-xs uppercase tracking-widest shadow-lg transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2',
                  s.btn
                )}
              >
                {loading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
