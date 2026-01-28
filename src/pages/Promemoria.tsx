import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import {
    AlertCircle,
    Calendar,
    Clock,
    User,
    CheckCircle2,
    Trash2,
    ArrowLeft
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
                .select('*, order:orders(gross_total)')
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
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight">Promemoria</h1>
                <p className="text-slate-400">Pagamenti in sospeso e note</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {reminders.length > 0 ? (
                    reminders.map((reminder) => (
                        <div
                            key={reminder.id}
                            className="glass p-6 rounded-[2rem] border border-red-500/20 relative group overflow-hidden hover:border-red-500/50 transition-all"
                        >
                            <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:scale-110 transition-transform duration-500">
                                <AlertCircle size={120} className="text-red-500" />
                            </div>

                            <div className="relative z-10 space-y-4">
                                {/* Header with Totals */}
                                <div className="flex flex-col gap-4">
                                    <div className="flex justify-between items-start">
                                        <div className="p-3 bg-red-500/10 text-red-400 rounded-full">
                                            <AlertCircle size={24} />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Prezzo Concordato</p>
                                            <h3 className="text-xl font-bold text-slate-300">
                                                €{((reminder.order?.gross_total || 0) + reminder.amount_due).toFixed(2)}
                                            </h3>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[10px] font-bold text-red-400 uppercase tracking-widest mb-1">Rimanente</p>
                                            <h3 className="text-3xl font-black text-white">
                                                €{reminder.amount_due.toFixed(2)}
                                            </h3>
                                        </div>
                                    </div>
                                </div>

                                {/* Customer & Description */}
                                <div>
                                    <div className="flex items-center gap-2 mb-2">
                                        <User size={14} className="text-slate-500" />
                                        <p className="font-bold text-lg text-slate-200">{reminder.customer_name || 'Cliente'}</p>
                                    </div>
                                    <p className="text-sm text-slate-400 leading-relaxed bg-black/20 p-3 rounded-xl border border-white/5">
                                        {reminder.description}
                                    </p>
                                </div>

                                {/* Actions */}
                                <div className="grid grid-cols-2 gap-3 pt-2">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleReminderClick(reminder);
                                        }}
                                        className="py-3 px-4 bg-white/5 hover:bg-white/10 text-slate-300 font-bold rounded-xl text-sm transition-colors border border-white/5"
                                    >
                                        MODIFICA
                                    </button>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            finalizePayment(reminder.id, reminder.amount_due); // Immediate full pay (Resolved)
                                        }}
                                        className="py-3 px-4 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 font-bold rounded-xl text-sm transition-colors border border-emerald-500/20 flex items-center justify-center gap-2"
                                    >
                                        <CheckCircle2 size={16} />
                                        RISOLTO
                                    </button>
                                    <button
                                        onClick={(e) => handleCancelToReservation(reminder.id, e)}
                                        disabled={actionLoading === reminder.id}
                                        className="py-3 px-4 bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 font-bold rounded-xl text-sm transition-colors border border-orange-500/20 flex items-center justify-center gap-2 disabled:opacity-50"
                                    >
                                        {actionLoading === reminder.id ? (
                                            <div className="w-4 h-4 border-2 border-orange-400 border-t-transparent rounded-full animate-spin"></div>
                                        ) : (
                                            <>
                                                <ArrowLeft size={16} />
                                                ANNULLA
                                            </>
                                        )}
                                    </button>
                                    <button
                                        onClick={(e) => handleDelete(reminder.id, e)}
                                        className="py-3 px-4 bg-red-500/10 hover:bg-red-500/20 text-red-400 font-bold rounded-xl text-sm transition-colors border border-red-500/20 flex items-center justify-center gap-2"
                                    >
                                        <Trash2 size={16} />
                                        ELIMINA
                                    </button>
                                </div>

                                {/* Footer Info */}
                                <div className="pt-4 border-t border-white/5 flex items-center justify-between text-xs text-slate-500">
                                    <div className="flex items-center gap-1.5">
                                        <Calendar size={12} />
                                        {new Date(reminder.created_at).toLocaleDateString('it-IT')}
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <Clock size={12} />
                                        {new Date(reminder.created_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="col-span-full py-20 text-center glass rounded-[2.5rem] border-dashed border-white/10">
                        <AlertCircle size={48} className="mx-auto text-slate-700 mb-4" />
                        <p className="text-slate-500 font-medium">NESSUN PROMEMORIA DISPONIBILE</p>
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
