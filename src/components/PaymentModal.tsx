import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { safeNumber } from '../lib/money';
import { useToast } from './ui/ToastProvider';
import { Loader2 } from 'lucide-react';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (amount: number) => void;
  totalAmount: number;
  loading?: boolean;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  totalAmount,
  loading = false,
}) => {
  const { showToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [amount, setAmount] = useState('');

  useEffect(() => {
    if (isOpen) {
      setAmount('');
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

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

  const total = safeNumber(totalAmount);

  const handleConfirm = () => {
    const value = amount === '' ? total : parseFloat(amount.replace(',', '.'));
    if (isNaN(value) || value < 0) {
      showToast('Inserisci un importo valido', 'error');
      return;
    }
    onConfirm(value);
  };

  const parsedAmount = amount === '' ? total : parseFloat(amount.replace(',', '.'));
  const isPartial = !isNaN(parsedAmount) && parsedAmount < total;
  const debtDiff = isPartial ? Math.max(0, total - parsedAmount) : 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center sm:p-4 bg-black/60 backdrop-blur-md"
          onClick={() => !loading && onClose()}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="payment-modal-title"
            className="spatial-sheet w-full sm:max-w-md p-6 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+24px)] flex flex-col"
          >
            {/* Grabber */}
            <div className="spatial-grabber" />

            {/* Header / Total Due */}
            <div className="text-center mt-1 mb-6">
              <p id="payment-modal-title" className="spatial-caption text-white/50 mb-1">
                Totale da incassare
              </p>
              <p className="spatial-amount text-[40px] font-bold text-white tracking-tight leading-tight">
                €{total.toFixed(2)}
              </p>
            </div>

            {/* Input Amount */}
            <div className="mb-4">
              <label htmlFor="payment-input" className="spatial-footnote block text-center mb-2 text-white/60">
                Importo corrisposto dal cliente
              </label>
              <div className="relative">
                <input
                  id="payment-input"
                  ref={inputRef}
                  type="text"
                  inputMode="decimal"
                  placeholder={`Intero (€${total.toFixed(2)})`}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full text-center spatial-amount bg-white/10 border border-white/20 rounded-2xl text-white placeholder:text-white/30 focus:border-[#0A84FF] focus:outline-none focus:ring-2 focus:ring-[#0A84FF]/30 transition-all py-3.5 px-4"
                  style={{ fontSize: 28, fontWeight: 700 }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleConfirm();
                  }}
                />
              </div>
            </div>

            {/* Hint / Reminder Notice */}
            <div className="min-h-[40px] flex items-center justify-center text-center px-2 mb-4">
              {isPartial ? (
                <p className="spatial-footnote text-[#FF9F0A] font-medium bg-[#FF9F0A]/10 border border-[#FF9F0A]/20 py-1.5 px-3 rounded-full">
                  Restante €{debtDiff.toFixed(2)} registrato in Promemoria
                </p>
              ) : (
                <p className="spatial-footnote text-white/40">
                  Lascia vuoto per incassare la quota totale.
                </p>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="spatial-btn-ghost flex-1 h-12 text-sm font-semibold"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={loading}
                className="spatial-btn-primary flex-1 h-12 text-sm font-semibold"
              >
                {loading ? <Loader2 size={18} className="animate-spin" /> : 'Incassa'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
