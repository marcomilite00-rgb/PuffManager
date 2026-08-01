import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Euro } from 'lucide-react';
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
            // Reset the field each time the modal opens (parent may reuse the component)
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setAmount('');
            const timer = setTimeout(() => { inputRef.current?.focus(); }, 50);
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

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
                    onClick={onClose}>
                    <motion.div initial={{ scale: 0.92, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92, y: 20 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 260 }}
                        onClick={e => e.stopPropagation()}
                        role="dialog" aria-modal="true"
                        className="w-full max-w-md rounded-[2rem] p-8 border border-white/10 shadow-2xl bg-gradient-to-br from-white/[0.06] to-white/[0.01] backdrop-blur-3xl">
                        <div className="text-center mb-8">
                            <div className="w-16 h-16 bg-success/10 rounded-2xl flex items-center justify-center text-success mx-auto mb-4 border border-success/20">
                                <CheckCircle2 size={32} />
                            </div>
                            <h3 className="text-2xl font-black text-white uppercase italic tracking-tight">Conferma Pagamento</h3>
                            <p className="text-slate-400 mt-2 text-sm">
                                Totale Dovuto: <span className="text-success font-bold tabular-nums">€{safeNumber(totalAmount).toFixed(2)}</span>
                            </p>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1 mb-2 block">Importo Incassato</label>
                                <div className="relative">
                                    <Euro className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                                    <input ref={inputRef} type="number" step="0.01"
                                        placeholder={`Intero (€${safeNumber(totalAmount).toFixed(2)})`}
                                        value={amount} onChange={(e) => setAmount(e.target.value)}
                                        className="w-full bg-black/30 border border-white/10 rounded-xl py-4 pl-10 pr-4 text-xl font-bold text-white focus:outline-none focus:border-success/50 focus:shadow-[0_0_20px_rgba(0,255,163,0.08)] transition-all"
                                        onKeyDown={(e) => { if (e.key === 'Enter') handleConfirm(); if (e.key === 'Escape') onClose(); }} />
                                </div>
                                <p className="text-xs text-slate-600 mt-2 ml-1">
                                    Lascia vuoto per incassare l'intero importo.
                                    <br />
                                    Se inserisci meno, la differenza rimarrà in <strong className="text-primary">Promemoria</strong>.
                                </p>
                            </div>
                            <div className="flex gap-3 mt-8">
                                <button onClick={onClose} disabled={loading}
                                    className="flex-1 py-4 bg-white/5 text-slate-400 font-bold rounded-xl hover:bg-white/10 transition-colors text-xs uppercase tracking-widest disabled:opacity-50">
                                    Annulla
                                </button>
                                <button onClick={handleConfirm} disabled={loading}
                                    className="flex-1 py-4 bg-gradient-to-r from-success to-success-dark text-surface-950 font-black rounded-xl hover:shadow-xl shadow-lg shadow-success/20 transition-all text-xs uppercase tracking-widest disabled:opacity-50 flex items-center justify-center gap-2">
                                    {loading ? <div className="w-4 h-4 border-2 border-surface-950 border-t-transparent rounded-full animate-spin" /> : 'Incassa'}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};
