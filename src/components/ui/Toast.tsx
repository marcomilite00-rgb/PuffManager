import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export interface ToastMessage {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface ToastContainerProps {
  toasts: ToastMessage[];
  onRemove: (id: string) => void;
}

const icons = {
  success: <CheckCircle2 size={18} style={{ color: '#2F7D4F' }} />,
  error: <AlertCircle size={18} style={{ color: '#C0392B' }} />,
  info: <Info size={18} style={{ color: 'var(--accent)' }} />,
};

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onRemove }) => {
  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[200] flex flex-col gap-2 w-[calc(100%-32px)] max-w-sm pointer-events-none">
      <AnimatePresence>
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onRemove={onRemove} />
        ))}
      </AnimatePresence>
    </div>
  );
};

const ToastItem: React.FC<{ toast: ToastMessage; onRemove: (id: string) => void }> = ({ toast, onRemove }) => {
  useEffect(() => {
    const timer = setTimeout(() => onRemove(toast.id), 3000);
    return () => clearTimeout(timer);
  }, [toast.id, onRemove]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12, transition: { duration: 0.18 } }}
      transition={{ type: 'spring', damping: 28, stiffness: 320 }}
      className="ios-banner pointer-events-auto flex items-center gap-3 px-4 py-3"
    >
      {icons[toast.type]}
      <span className="flex-1 ios-subhead">{toast.message}</span>
      <button onClick={() => onRemove(toast.id)} className="ios-press p-1" style={{ color: 'var(--label-tertiary)' }} aria-label="Chiudi notifica">
        <X size={16} />
      </button>
    </motion.div>
  );
};
