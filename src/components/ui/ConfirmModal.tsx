import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, Loader2 } from 'lucide-react';

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

const variantStyles: Record<
  NonNullable<ConfirmModalProps['variant']>,
  { color: string; bgTint: string; borderTint: string; shadow: string }
> = {
  danger: {
    color: '#FF453A',
    bgTint: 'rgba(255, 69, 58, 0.16)',
    borderTint: 'rgba(255, 69, 58, 0.3)',
    shadow: '0 8px 24px rgba(255, 69, 58, 0.4)',
  },
  warning: {
    color: '#FF9F0A',
    bgTint: 'rgba(255, 159, 10, 0.16)',
    borderTint: 'rgba(255, 159, 10, 0.3)',
    shadow: '0 8px 24px rgba(255, 159, 10, 0.4)',
  },
  primary: {
    color: '#0A84FF',
    bgTint: 'rgba(10, 132, 255, 0.16)',
    borderTint: 'rgba(10, 132, 255, 0.3)',
    shadow: '0 8px 24px rgba(10, 132, 255, 0.4)',
  },
};

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Conferma',
  cancelLabel = 'Annulla',
  variant = 'danger',
  loading = false,
  icon,
}) => {
  const current = variantStyles[variant];

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, loading, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md"
          onClick={() => !loading && onClose()}
        >
          <motion.div
            initial={{ scale: 0.94, opacity: 0, y: 16 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.94, opacity: 0, y: 16 }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-modal-title"
            className="spatial-panel-strong w-full max-w-sm p-6 flex flex-col items-center text-center"
          >
            {/* Icon */}
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center mb-4 border"
              style={{
                background: current.bgTint,
                borderColor: current.borderTint,
                color: current.color,
              }}
            >
              {icon || <AlertTriangle size={26} />}
            </div>

            {/* Title & Message */}
            <h3 id="confirm-modal-title" className="spatial-headline text-lg font-semibold text-white mb-2">
              {title}
            </h3>
            <p className="spatial-subhead text-sm text-white/60 mb-6 max-w-xs">
              {message}
            </p>

            {/* Buttons */}
            <div className="flex items-center gap-3 w-full">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="spatial-btn-ghost flex-1 h-11 text-sm font-medium"
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={loading}
                className="flex-1 h-11 px-4 rounded-full text-sm font-semibold text-white flex items-center justify-center transition-transform active:scale-98 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: current.color,
                  boxShadow: current.shadow,
                }}
              >
                {loading ? <Loader2 size={18} className="animate-spin" /> : confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
