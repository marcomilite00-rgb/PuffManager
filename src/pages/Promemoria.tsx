import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { safeNumber, formatEur } from '../lib/money';
import { useAuth } from '../context/AuthContext';
import {
    AlertCircle,
    Calendar,
    Clock,
    User,
    CheckCircle2,
    Trash2,
    ArrowLeft,
    Package
} from 'lucide-react';
import { PaymentModal } from '../components/PaymentModal';

interface Reminder {
    id: string;
    created_at: string;
    customer_name: string;
    description: string;
    amount_due: number;
    created_by_staff_id: string;
    order?: {
        gross_total: number;
        items: Array<{
            id: string;
            qty: number;
            unit_price_final: number;
            variant: {
                model: { name: string };
                flavor: { name: string };
            };
        }>;
    };
}

export const Promemoria: React.FC = () => {
    const { user } = useAuth();
    const [reminders, setReminders] = useState<Reminder[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedReminder, setSelectedReminder] = useState<Reminder | null>(null);
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    useEffect(() => {
        fetchReminders();

        // Subscribe to changes
        const subscription = supabase
            .channel('reminders_changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'reminders' }, () => {
                fetchReminders();
            })
            .subscribe();

        return () => {
            subscription.unsubscribe();
        };
    }, []);

    const fetchReminders = async () => {
        try {
            const { data, error } = await supabase
                .from('reminders')
                .select(`
                    *,
                    order:orders(
                        gross_total,
                        items:order_items(
                            *,
                            variant:product_variants(
                                model:product_models(name),
                                flavor:product_flavors(name)
                            )
                        )
                    )
                `)
                .eq('status', 'active')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setReminders(data || []);
        } catch (error) {
            console.error('Error fetching reminders:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleReminderClick = (reminder: Reminder) => {
        setSelectedReminder(reminder);
        setShowPaymentModal(true);
    };

    const finalizePayment = async (reminderId: string, amount: number) => {
        try {
            const { error } = await supabase.rpc('pay_reminder', {
                p_reminder_id: reminderId,
                p_payment_amount: amount,
                p_staff_id: user?.id
            });

            if (error) throw error;

            setShowPaymentModal(false);
            setSelectedReminder(null);
            fetchReminders(); // Refresh list
        } catch (err: any) {
            alert(err.message || 'Errore nel pagamento');
        }
    };

    const handlePaymentConfirm = async (amount: number) => {
        if (!selectedReminder) return;
        await finalizePayment(selectedReminder.id, amount);
    };

    const handleDelete = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm('Sei sicuro di voler eliminare questo promemoria? Il debito verrà annullato.')) return;

        try {
            // Use RPC to resolve debt and fix order status without adding payment
            const { error } = await supabase.rpc('resolve_reminder_debt', {
                p_reminder_id: id
            });

            if (error) throw error;
            fetchReminders();
        } catch (error) {
            console.error('Error deleting reminder:', error);
            alert('Errore eliminazione');
        }
    };

    const handleCancelToReservation = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm('ATTENZIONE: Annullando questo promemoria l\'ordine verrà rimosso dallo storico, i pagamenti già effettuati verranno eliminati e l\'annuncio tornerà tra le Prenotazioni.\n\nVuoi continuare?')) return;

        setActionLoading(id);
        try {
            const { error } = await supabase.rpc('cancel_reminder_to_reservation', {
                p_reminder_id: id
            });

            if (error) throw error;
            fetchReminders();
        } catch (err: any) {
            console.error('Error canceling reminder:', err);
            alert(err.message || 'Errore durante l\'annullamento');
        } finally {
            setActionLoading(null);
        }
    };

    if (loading) return (
        <div className="flex items-center justify-center min-h-[60vh]">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
    );

    return (
        <div className="space-y-6 md:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
            <div className="flex flex-col gap-1 px-1">
                <h1 className="text-3xl md:text-5xl font-black italic tracking-tighter text-white uppercase leading-none">
                    Promemoria
                </h1>
                <p className="label-caps text-[10px] md:text-xs text-slate-500">Pagamenti in sospeso e note importanti</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {reminders.length > 0 ? (
                    reminders.map((reminder) => (
                        <div
                            key={reminder.id}
                            className="glass-card p-4 md:p-6 rounded-2xl md:rounded-[2rem] border-red-500/20 relative group overflow-hidden hover:border-red-500/50 transition-all"
                        >
                            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform duration-500 pointer-events-none">
                                <AlertCircle size={80} className="text-red-500" />
                            </div>

                            <div className="relative z-10 space-y-3 md:space-y-4">
                                {/* Header with Totals */}
                                <div className="flex flex-col gap-3">
                                    <div className="flex justify-between items-start">
                                        <div className="p-2 bg-red-500/10 text-red-400 rounded-full">
                                            <AlertCircle size={18} />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3 bg-white/5 rounded-xl p-3 md:p-4">
                                        <div>
                                            <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">TOTALE</p>
                                            <h3 className="text-xl md:text-2xl font-black text-white leading-tight italic tracking-tighter">
                                                €{formatEur(safeNumber(reminder.order?.gross_total) + safeNumber(reminder.amount_due))}
                                            </h3>
                                        </div>
                                        <div className="text-right border-l border-white/5 pl-3">
                                            <p className="text-[8px] font-bold text-red-400 uppercase tracking-widest mb-0.5">RESTANTE</p>
                                            <h3 className={`text-xl md:text-2xl font-black leading-tight italic tracking-tighter ${safeNumber(reminder.amount_due) > 0 ? 'text-[#FF4444]' : 'text-[#00E676]'}`}>
                                                €{formatEur(reminder.amount_due)}
                                            </h3>
                                        </div>
                                    </div>
                                </div>

                                {/* Customer Details */}
                                <div>
                                    <div className="flex items-center gap-2 mb-2 px-1">
                                        <div className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center text-slate-500">
                                            <User size={12} />
                                        </div>
                                        <p className="font-black text-sm text-slate-200 tracking-tight uppercase italic">{reminder.customer_name || 'Cliente'}</p>
                                    </div>

                                    {/* Items List (Visual transformation) */}
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-2 text-slate-600 text-[8px] font-black uppercase tracking-[0.2em] px-1">
                                            <Package size={10} />
                                            DETTAGLIO ARTICOLI
                                        </div>

                                        <div className="space-y-1.5 max-h-[180px] overflow-y-auto pr-1 custom-scrollbar">
                                            {reminder.order?.items && reminder.order.items.length > 0 ? (
                                                reminder.order.items.map((item) => (
                                                    <div key={item.id} className="flex items-center justify-between gap-3 p-2 bg-black/20 rounded-xl border border-white/5">
                                                        <div className="min-w-0 flex-1">
                                                            <p className="text-[11px] font-bold text-slate-300 truncate leading-tight uppercase">{item.variant?.model?.name || 'Prodotto'}</p>
                                                            <p className="text-[9px] text-slate-500 truncate italic leading-tight">{item.variant?.flavor?.name || '-'}</p>
                                                        </div>
                                                        <div className="text-right shrink-0">
                                                            <p className="text-xs font-black text-primary italic">€{formatEur(safeNumber(item.unit_price_final) * safeNumber(item.qty))}</p>
                                                            <p className="text-[8px] text-slate-600 font-bold">{item.qty}pz</p>
                                                        </div>
                                                    </div>
                                                ))
                                            ) : (
                                                <div className="p-3 bg-black/20 rounded-xl border border-white/5">
                                                    <p className="text-xs text-slate-500 italic whitespace-pre-wrap">{reminder.description}</p>
                                                </div>
                                            )}
                                        </div>

                                        {/* Total Transaction Bar */}
                                        <div className="flex justify-between items-center p-2 bg-primary/5 rounded-xl border border-primary/10 mt-2">
                                            <span className="text-[8px] font-black text-primary uppercase tracking-widest px-1">TOTALE TRANSAZIONE</span>
                                            <span className="text-base font-black text-primary italic">€{((reminder.order?.gross_total || 0) + reminder.amount_due).toFixed(2)}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="grid grid-cols-2 gap-2 pt-1">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleReminderClick(reminder);
                                        }}
                                        className="py-2.5 px-3 bg-white/5 hover:bg-white/10 text-slate-300 font-bold rounded-xl text-xs transition-colors border border-white/5"
                                    >
                                        MODIFICA
                                    </button>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            finalizePayment(reminder.id, reminder.amount_due); // Immediate full pay (Resolved)
                                        }}
                                        className="py-2.5 px-3 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 font-bold rounded-xl text-xs transition-colors border border-emerald-500/20 flex items-center justify-center gap-1.5"
                                    >
                                        <CheckCircle2 size={14} />
                                        RISOLTO
                                    </button>
                                    <button
                                        onClick={(e) => handleCancelToReservation(reminder.id, e)}
                                        disabled={actionLoading === reminder.id}
                                        className="py-2.5 px-3 bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 font-bold rounded-xl text-xs transition-colors border border-orange-500/20 flex items-center justify-center gap-1.5 disabled:opacity-50"
                                    >
                                        {actionLoading === reminder.id ? (
                                            <div className="w-3 h-3 border-2 border-orange-400 border-t-transparent rounded-full animate-spin"></div>
                                        ) : (
                                            <>
                                                <ArrowLeft size={14} />
                                                ANNUL.
                                            </>
                                        )}
                                    </button>
                                    <button
                                        onClick={(e) => handleDelete(reminder.id, e)}
                                        className="py-2.5 px-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 font-bold rounded-xl text-xs transition-colors border border-red-500/20 flex items-center justify-center gap-1.5"
                                    >
                                        <Trash2 size={14} />
                                        ELIMINA
                                    </button>
                                </div>

                                {/* Footer Info */}
                                <div className="pt-3 border-t border-white/5 flex items-center justify-between text-[10px] text-slate-600">
                                    <div className="flex items-center gap-1">
                                        <Calendar size={10} />
                                        {new Date(reminder.created_at).toLocaleDateString()}
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <Clock size={10} />
                                        {new Date(reminder.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="col-span-full py-16 text-center glass-card rounded-2xl border-dashed border-white/10">
                        <AlertCircle size={40} className="mx-auto text-slate-800 mb-4 opacity-30" />
                        <p className="text-slate-500 font-black label-caps text-xs">NESSUN PROMEMORIA ATTIVO</p>
                    </div>
                )}
            </div>

            {selectedReminder && (
                <PaymentModal
                    isOpen={showPaymentModal}
                    onClose={() => {
                        setShowPaymentModal(false);
                        setSelectedReminder(null);
                    }}
                    onConfirm={handlePaymentConfirm}
                    totalAmount={selectedReminder.amount_due}
                />
            )}
        </div>
    );
};
