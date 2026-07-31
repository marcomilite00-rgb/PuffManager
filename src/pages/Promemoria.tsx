import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { safeNumber, formatEur } from '../lib/money';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ui/ToastProvider';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { EmptyState } from '../components/ui/EmptyState';
import {
    AlertCircle, Calendar, Clock, User, CheckCircle2, Trash2, ArrowLeft, Package
} from 'lucide-react';
import { motion } from 'framer-motion';
import { PaymentModal } from '../components/PaymentModal';
import { Badge } from '../components/ui/Badge';

interface Reminder {
    id: string; created_at: string; customer_name: string; description: string;
    amount_due: number; created_by_staff_id: string;
    order?: { gross_total: number; items: Array<{ id: string; qty: number; unit_price_final: number; variant: { model: { name: string }; flavor: { name: string } } }>; };
}

export const Promemoria: React.FC = () => {
    const { user } = useAuth();
    const { showToast } = useToast();
    const [reminders, setReminders] = useState<Reminder[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedReminder, setSelectedReminder] = useState<Reminder | null>(null);
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null);
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

    useEffect(() => {
        fetchReminders();
        const subscription = supabase
            .channel('reminders_changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'reminders' }, () => { fetchReminders(); })
            .subscribe();
        return () => { subscription.unsubscribe(); };
    }, []);

    const fetchReminders = async () => {
        try {
            const { data, error } = await supabase
                .from('reminders')
                .select('*, order:orders(gross_total, items:order_items(*, variant:product_variants(model:product_models(name), flavor:product_flavors(name))))')
                .eq('status', 'active').order('created_at', { ascending: false });
            if (error) throw error;
            setReminders(data || []);
        } catch (error) { console.error('Error fetching reminders:', error); } finally { setLoading(false); }
    };

    const handleReminderClick = (reminder: Reminder) => { setSelectedReminder(reminder); setShowPaymentModal(true); };

    const finalizePayment = async (reminderId: string, amount: number) => {
        try {
            const { error } = await supabase.rpc('pay_reminder', { p_reminder_id: reminderId, p_payment_amount: amount, p_staff_id: user?.id });
            if (error) throw error;
            setShowPaymentModal(false); setSelectedReminder(null); fetchReminders();
            showToast('Pagamento registrato!', 'success');
        } catch (err: any) { showToast(err.message || 'Errore nel pagamento', 'error'); }
    };

    const handlePaymentConfirm = async (amount: number) => {
        if (!selectedReminder) return;
        await finalizePayment(selectedReminder.id, amount);
    };

    const handleDelete = async (id: string) => {
        try {
            const { error } = await supabase.rpc('resolve_reminder_debt', { p_reminder_id: id });
            if (error) throw error;
            fetchReminders();
            showToast('Promemoria eliminato', 'success');
        } catch (error) { showToast('Errore eliminazione', 'error'); } finally { setDeleteConfirmId(null); }
    };

    const handleCancelToReservation = async (id: string) => {
        setActionLoading(id);
        try {
            const { error } = await supabase.rpc('cancel_reminder_to_reservation', { p_reminder_id: id });
            if (error) throw error;
            fetchReminders();
            showToast('Promemoria annullato, tornato a Prenotazioni', 'info');
        } catch (err: any) { showToast(err.message || 'Errore durante l\'annullamento', 'error'); } finally { setActionLoading(null); setCancelConfirmId(null); }
    };

    if (loading) return (
        <div className="p-6 space-y-6">
            <div className="h-10 w-56 skeleton" />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[...Array(3)].map((_, i) => <div key={i} className="h-52 skeleton" />)}
            </div>
        </div>
    );

    return (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-3 md:space-y-6">
            <div className="flex flex-col gap-0.5">
                <h1 className="text-2xl md:text-4xl font-black italic tracking-tighter text-white uppercase leading-none">Promemoria</h1>
                <p className="label-caps text-[9px] md:text-xs text-slate-500">Pagamenti in sospeso e note importanti</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {reminders.length > 0 ? reminders.map((reminder) => (
                    <motion.div key={reminder.id} layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                        className="glass-card p-4 md:p-6 rounded-2xl md:rounded-[2rem] border-red-500/20 relative group overflow-hidden hover:border-red-500/40 transition-all">
                        <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform duration-500 pointer-events-none">
                            <AlertCircle size={80} className="text-red-500" />
                        </div>
                        <div className="relative z-10 space-y-3 md:space-y-4">
                            <div className="flex flex-col gap-3">
                                <div className="flex justify-between items-start">
                                    <div className="p-2 bg-danger/10 text-danger rounded-full">
                                        <AlertCircle size={18} />
                                    </div>
                                    <Badge variant="danger" size="xs">DA PAGARE</Badge>
                                </div>
                                <div className="grid grid-cols-2 gap-3 bg-white/5 rounded-xl p-3 md:p-4">
                                    <div>
                                        <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">TOTALE</p>
                                        <h3 className="text-xl md:text-2xl font-black text-white leading-tight italic tracking-tighter tabular-nums">
                                            €{formatEur(safeNumber(reminder.order?.gross_total) + safeNumber(reminder.amount_due))}
                                        </h3>
                                    </div>
                                    <div className="text-right border-l border-white/5 pl-3">
                                        <p className="text-[8px] font-bold text-danger uppercase tracking-widest mb-0.5">RESTANTE</p>
                                        <h3 className={`text-xl md:text-2xl font-black leading-tight italic tracking-tighter tabular-nums ${safeNumber(reminder.amount_due) > 0 ? 'text-danger' : 'text-success'}`}>
                                            €{formatEur(reminder.amount_due)}
                                        </h3>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <div className="flex items-center gap-2 mb-2 px-1">
                                    <div className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center text-slate-500">
                                        <User size={12} />
                                    </div>
                                    <p className="font-black text-sm text-slate-200 tracking-tight uppercase italic">{reminder.customer_name || 'Cliente'}</p>
                                </div>
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2 text-slate-600 text-[8px] font-black uppercase tracking-[0.2em] px-1">
                                        <Package size={10} /> DETTAGLIO ARTICOLI
                                    </div>
                                    <div className="space-y-1.5">
                                        {reminder.order?.items && reminder.order.items.length > 0 ? reminder.order.items.map((item) => (
                                            <div key={item.id} className="flex items-center justify-between gap-3 p-2 bg-black/20 rounded-xl border border-white/5">
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-[11px] font-bold text-slate-300 truncate leading-tight uppercase">{item.variant?.model?.name || 'Prodotto'}</p>
                                                    <p className="text-[9px] text-slate-500 truncate italic leading-tight">{item.variant?.flavor?.name || '-'}</p>
                                                </div>
                                                <div className="text-right shrink-0">
                                                    <p className="text-xs font-black text-primary italic tabular-nums">€{formatEur(safeNumber(item.unit_price_final) * safeNumber(item.qty))}</p>
                                                    <p className="text-[8px] text-slate-600 font-bold">{item.qty}pz</p>
                                                </div>
                                            </div>
                                        )) : (
                                            <div className="p-3 bg-black/20 rounded-xl border border-white/5">
                                                <p className="text-xs text-slate-500 italic whitespace-pre-wrap">{reminder.description}</p>
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex justify-between items-center p-2 bg-primary/5 rounded-xl border border-primary/10 mt-2">
                                        <span className="text-[8px] font-black text-primary uppercase tracking-widest px-1">TOTALE TRANSAZIONE</span>
                                        <span className="text-base font-black text-primary italic tabular-nums">€{((reminder.order?.gross_total || 0) + reminder.amount_due).toFixed(2)}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2 pt-1">
                                <button onClick={(e) => { e.stopPropagation(); handleReminderClick(reminder); }}
                                    className="py-2.5 px-3 bg-white/5 hover:bg-white/10 text-slate-300 font-bold rounded-xl text-xs transition-colors border border-white/5">
                                    MODIFICA
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); finalizePayment(reminder.id, reminder.amount_due); }}
                                    className="py-2.5 px-3 bg-success/10 hover:bg-success/20 text-success font-bold rounded-xl text-xs transition-colors border border-success/20 flex items-center justify-center gap-1.5">
                                    <CheckCircle2 size={14} /> RISOLTO
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); setCancelConfirmId(reminder.id); }}
                                    disabled={actionLoading === reminder.id}
                                    className="py-2.5 px-3 bg-warning/10 hover:bg-warning/20 text-warning font-bold rounded-xl text-xs transition-colors border border-warning/20 flex items-center justify-center gap-1.5 disabled:opacity-50">
                                    {actionLoading === reminder.id ? <div className="w-3 h-3 border-2 border-warning border-t-transparent rounded-full animate-spin" /> : <><ArrowLeft size={14} /> ANNUL.</>}
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(reminder.id); }}
                                    className="py-2.5 px-3 bg-danger/10 hover:bg-danger/20 text-danger font-bold rounded-xl text-xs transition-colors border border-danger/20 flex items-center justify-center gap-1.5">
                                    <Trash2 size={14} /> ELIMINA
                                </button>
                            </div>

                            <div className="pt-3 border-t border-white/5 flex items-center justify-between text-[10px] text-slate-600">
                                <div className="flex items-center gap-1"><Calendar size={10} /> {new Date(reminder.created_at).toLocaleDateString()}</div>
                                <div className="flex items-center gap-1"><Clock size={10} /> {new Date(reminder.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                            </div>
                        </div>
                    </motion.div>
                )) : (
                    <div className="col-span-full">
                        <EmptyState icon={AlertCircle} title="Nessun promemoria attivo" subtitle="Tutti i pagamenti sono in regola" />
                    </div>
                )}
            </div>

            <ConfirmModal isOpen={!!cancelConfirmId} onClose={() => setCancelConfirmId(null)}
                onConfirm={() => cancelConfirmId && handleCancelToReservation(cancelConfirmId)}
                title="Annulla Promemoria" message="L'ordine tornerà tra le Prenotazioni. I pagamenti già effettuati verranno eliminati."
                variant="warning" confirmLabel="Annulla" loading={actionLoading !== null} />

            <ConfirmModal isOpen={!!deleteConfirmId} onClose={() => setDeleteConfirmId(null)}
                onConfirm={() => deleteConfirmId && handleDelete(deleteConfirmId)}
                title="Elimina Promemoria" message="Il debito verrà annullato. Operazione irreversibile."
                variant="danger" confirmLabel="Elimina" />

            {selectedReminder && (
                <PaymentModal isOpen={showPaymentModal}
                    onClose={() => { setShowPaymentModal(false); setSelectedReminder(null); }}
                    onConfirm={handlePaymentConfirm} totalAmount={selectedReminder.amount_due} />
            )}
        </motion.div>
    );
};
