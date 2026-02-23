import React, { useEffect, useRef } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { safeNumber } from '../lib/money';

interface PaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (amount: number) => void;
    totalAmount: number;
    initialAmount?: string;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    totalAmount,
    initialAmount = ''
}) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const [amount, setAmount] = React.useState(initialAmount);

    useEffect(() => {
        if (isOpen) {
            setAmount(initialAmount);
            // Focus input on open
            setTimeout(() => {
                inputRef.current?.focus();
            }, 50);
        }
    }, [isOpen, initialAmount]);

    if (!isOpen) return null;

    const handleConfirm = () => {
        const value = amount === '' ? totalAmount : parseFloat(amount.replace(',', '.'));
        if (isNaN(value) || value < 0) {
            alert('Inserisci un importo valido');
            return;
        }
        onConfirm(value);
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full max-w-md bg-[#1a1c2e] p-8 rounded-[2rem] border border-white/10 shadow-2xl animate-in zoom-in-95 duration-200 m-4">
                <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-500 mx-auto mb-4">
                        <CheckCircle2 size={32} />
                    </div>
                    <h3 className="text-2xl font-black text-white">Conferma Pagamento</h3>
                    <p className="text-slate-400 mt-2">Totale Dovuto: <span className="text-emerald-400 font-bold">€{safeNumber(totalAmount).toFixed(2)}</span></p>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1 mb-2 block">Importo Incassato</label>
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">€</span>
                            <input
                                ref={inputRef}
                                type="number"
                                step="0.01"
                                placeholder={`Intero (€${safeNumber(totalAmount).toFixed(2)})`}
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                className="w-full bg-black/20 border border-white/10 rounded-xl py-4 pl-8 pr-4 text-xl font-bold text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleConfirm();
                                    if (e.key === 'Escape') onClose();
                                }}
                            />
                        </div>
                        <p className="text-xs text-slate-500 mt-2 ml-1">
                            Lascia vuoto per incassare l'intero importo.
                            <br />
                            Se inserisci meno, la differenza rimarrà in <strong>Promemoria</strong>.
                        </p>
                    </div>

                    <div className="flex gap-3 mt-8">
                        <button
                            onClick={onClose}
                            className="flex-1 py-4 bg-white/5 text-slate-400 font-bold rounded-xl hover:bg-white/10 transition-colors"
                        >
                            Annulla
                        </button>
                        <button
                            onClick={handleConfirm}
                            className="flex-1 py-4 bg-primary text-black font-black rounded-xl hover:bg-primary-dark transition-colors shadow-[0_4px_20px_rgba(34,211,238,0.2)]"
                        >
                            Incassa
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
