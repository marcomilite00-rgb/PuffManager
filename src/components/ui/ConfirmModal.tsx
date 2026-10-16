import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle } from 'lucide-react';

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

const accent: Record<NonNullable<ConfirmModalProps['variant']>, string> = {
  danger: '#C0392B',
  warning: '#B97A1A',
  primary: '#3A2A5E',
};

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen, onClose, onConfirm, title, message,
  confirmLabel = 'Conferma', cancelLabel = 'Annulla',
  variant = 'danger', loading, icon
}) => {
  const color = accent[variant];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.4)' }}
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 32, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 32, opacity: 0 }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            onClick={(e) => e.stopPropagation()}
            role="alertdialog" aria-modal="true"
            className="ios-sheet w-full max-w-sm p-5"
          >
            <div className="flex flex-col items-center text-center gap-3">
              <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: `${color}1F`, color }}>
                {icon || <AlertTriangle size={24} />}
              </div>
              <div>
                <h3 className="ios-headline">{title}</h3>
                <p className="ios-footnote mt-1">{message}</p>
              </div>
            </div>
            <div className="flex gap-2.5 mt-5">
              <button onClick={onClose} disabled={loading} className="ios-btn ios-press flex-1" style={{ background: 'var(--surface-tertiary)', color: 'var(--accent)' }}>
                {cancelLabel}
              </button>
              <button
                onClick={onConfirm}
                disabled={loading}
                className="ios-btn ios-press flex-1 text-white"
                style={{ background: color }}
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
