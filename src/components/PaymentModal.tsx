import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { safeNumber } from '../lib/money';
import { useToast } from './ui/ToastProvider';

interface PaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (amount: number) => void;
    totalAmount: number;
    loading?: boolean;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
    isOpen, onClose, onConfirm, totalAmount, loading = false
}) => {
    const { showToast } = useToast();
    const inputRef = useRef<HTMLInputElement>(null);
    const [amount, setAmount] = useState('');

    useEffect(() => {
        if (isOpen) {
            setAmount('');
            const timer = setTimeout(() => { inputRef.current?.focus(); }, 80);
            return () => clearTimeout(timer);
        }
    }, [isOpen]);

    const handleConfirm = () => {
        const value = amount === '' ? totalAmount : parseFloat(amount.replace(',', '.'));
        if (isNaN(value) || value < 0) {
            showToast('Inserisci un importo valido', 'error');
            return;
        }
        onConfirm(value);
    };

    const total = safeNumber(totalAmount);

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:p-4"
                    style={{ background: 'rgba(0,0,0,0.4)' }}
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ y: 48 }} animate={{ y: 0 }} exit={{ y: 48 }}
                        transition={{ type: 'spring', damping: 30, stiffness: 320 }}
                        onClick={e => e.stopPropagation()}
                        role="dialog" aria-modal="true"
                        className="ios-sheet w-full sm:max-w-md p-5 pb-8"
                    >
                        <div className="ios-grabber" />
                        <div className="text-center mt-1 mb-5">
                            <p className="ios-footnote">Totale dovuto</p>
                            <p className="ios-title-1 ios-amount mt-1">€{total.toFixed(2)}</p>
                        </div>
                        <label className="ios-footnote block mb-2 px-1">Importo incassato</label>
                        <input
                            ref={inputRef}
                            type="number"
                            step="0.01"
                            inputMode="decimal"
                            placeholder={`Intero (€${total.toFixed(2)})`}
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            className="ios-input ios-amount text-center"
                            style={{ fontSize: 28, fontWeight: 700, padding: '14px 16px' }}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleConfirm(); if (e.key === 'Escape') onClose(); }}
                        />
                        <p className="ios-footnote mt-3 px-1">
                            Lascia vuoto per incassare tutto. Se inserisci meno, la differenza resta in Promemoria.
                        </p>
                        <div className="flex gap-2.5 mt-5">
                            <button onClick={onClose} disabled={loading} className="ios-btn ios-press flex-1" style={{ background: 'var(--surface-tertiary)', color: 'var(--accent)' }}>
                                Annulla
                            </button>
                            <button onClick={handleConfirm} disabled={loading} className="ios-btn ios-btn-filled ios-press flex-1">
                                {loading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Incassa'}
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};
