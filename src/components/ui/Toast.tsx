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
  success: <CheckCircle2 size={19} className="text-[#30D158] shrink-0" />,
  error: <AlertCircle size={19} className="text-[#FF453A] shrink-0" />,
  info: <Info size={19} className="text-[#0A84FF] shrink-0" />,
};

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onRemove }) => {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed left-1/2 -translate-x-1/2 z-[200] flex flex-col items-center gap-2 w-[calc(100%-32px)] max-w-sm pointer-events-none"
      style={{ top: 'calc(env(safe-area-inset-top, 0px) + 16px)' }}
    >
      <AnimatePresence>
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onRemove={onRemove} />
        ))}
      </AnimatePresence>
    </div>
  );
};

const ToastItem: React.FC<{ toast: ToastMessage; onRemove: (id: string) => void }> = ({
  toast,
  onRemove,
}) => {
  useEffect(() => {
    const timer = setTimeout(() => onRemove(toast.id), 3000);
    return () => clearTimeout(timer);
  }, [toast.id, onRemove]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -16, scale: 0.95, transition: { duration: 0.18 } }}
      transition={{ type: 'spring', damping: 28, stiffness: 320 }}
      className="pointer-events-auto flex items-center gap-3 px-4 py-2.5 rounded-full spatial-panel-strong border border-white/20 shadow-2xl backdrop-blur-2xl"
      style={{ maxWidth: '100%' }}
    >
      {icons[toast.type]}
      <span className="flex-1 spatial-subhead text-white text-[14px] leading-tight font-medium truncate">
        {toast.message}
      </span>
      <button
        type="button"
        onClick={() => onRemove(toast.id)}
        className="p-1 rounded-full text-white/40 hover:text-white transition-colors focus-visible:outline-none"
        aria-label="Chiudi notifica"
      >
        <X size={15} />
      </button>
    </motion.div>
  );
};
