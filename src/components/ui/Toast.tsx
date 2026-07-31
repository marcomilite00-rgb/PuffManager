import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, AlertCircle, X } from 'lucide-react';
import { clsx } from 'clsx';

export interface ToastMessage {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

let toastListeners: ((toast: ToastMessage) => void)[] = [];

export const showToast = (message: string, type: ToastMessage['type'] = 'success') => {
  const id = Date.now().toString();
  toastListeners.forEach(fn => fn({ id, message, type }));
};

interface ToastContainerProps {
  toasts: ToastMessage[];
  onRemove: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onRemove }) => {
  return (
    <div className="fixed bottom-28 md:bottom-8 left-1/2 -translate-x-1/2 z-[200] flex flex-col gap-2 pointer-events-none">
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
      initial={{ opacity: 0, y: 30, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.9, transition: { duration: 0.2 } }}
      className={clsx(
        'pointer-events-auto flex items-center gap-3 px-5 py-3.5 rounded-2xl font-bold text-xs shadow-2xl border backdrop-blur-xl min-w-[280px] max-w-[400px]',
        toast.type === 'success' && 'bg-success/10 border-success/20 text-success shadow-success/10',
        toast.type === 'error' && 'bg-danger/10 border-danger/20 text-danger shadow-danger/10',
        toast.type === 'info' && 'bg-primary/10 border-primary/20 text-primary shadow-primary/10',
      )}
    >
      {toast.type === 'success' && <CheckCircle size={18} />}
      {toast.type === 'error' && <AlertCircle size={18} />}
      {toast.type === 'info' && <AlertCircle size={18} />}
      <span className="flex-1 font-black uppercase tracking-wider text-[9px]">{toast.message}</span>
      <button onClick={() => onRemove(toast.id)} className="opacity-50 hover:opacity-100 transition-opacity" aria-label="Chiudi notifica">
        <X size={14} />
      </button>
    </motion.div>
  );
};

export { toastListeners };
