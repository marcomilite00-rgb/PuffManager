import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { safeNumber, formatEur } from '../lib/money';
import { getErrorMessage } from '../lib/error';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ui/ToastProvider';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { EmptyState } from '../components/ui/EmptyState';
import { AlertCircle, Ellipsis } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { PaymentModal } from '../components/PaymentModal';
import { Badge } from '../components/ui/Badge';
import { PageSkeleton } from '../components/ui/PageSkeleton';

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
    const [menuId, setMenuId] = useState<string | null>(null);

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

    const finalizePayment = async (reminderId: string, amount: number) => {
        try {
            const { error } = await supabase.rpc('pay_reminder', { p_reminder_id: reminderId, p_payment_amount: amount, p_staff_id: user?.id });
            if (error) throw error;
            setShowPaymentModal(false); setSelectedReminder(null); fetchReminders();
            showToast('Pagamento registrato', 'success');
        } catch (err) { showToast(getErrorMessage(err, 'Errore nel pagamento'), 'error'); }
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
            showToast('Debito chiuso', 'success');
        } catch { showToast('Errore eliminazione', 'error'); } finally { setDeleteConfirmId(null); }
    };

    const handleCancelToReservation = async (id: string) => {
        setActionLoading(id);
        try {
            const { error } = await supabase.rpc('cancel_reminder_to_reservation', { p_reminder_id: id });
            if (error) throw error;
            fetchReminders();
            showToast('Tornato tra le prenotazioni', 'info');
        } catch (err) { showToast(getErrorMessage(err, 'Errore durante l\'annullamento'), 'error'); } finally { setActionLoading(null); setCancelConfirmId(null); }
    };

    if (loading) return (
        <PageSkeleton titleClass="w-48 h-9" blocks={[{ count: 3, className: 'h-44' }]} />
    );

    const totalDue = reminders.reduce((a, r) => a + safeNumber(r.amount_due), 0);

    return (
        <div className="ios-page">
            <div>
                <h1 className="ios-title-large">Promemoria</h1>
                <p className="ios-footnote mt-0.5">
                    {reminders.length === 0 ? 'Tutti i pagamenti sono in regola' : `${reminders.length} debiti · €${formatEur(totalDue)} da incassare`}
                </p>
            </div>

            {reminders.length === 0 ? (
                <EmptyState icon={AlertCircle} title="Nessun debito" subtitle="Tutti i pagamenti sono in regola" />
            ) : (
                <div className="flex flex-col gap-3">
                    {reminders.map((reminder) => (
                        <div key={reminder.id} className="ios-card p-4">
                            <div className="flex items-center gap-3">
                                <div className="w-11 h-11 rounded-full flex items-center justify-center font-semibold text-white shrink-0" style={{ background: '#C0392B' }}>
                                    {(reminder.customer_name || 'C').charAt(0).toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="ios-headline text-[16px] truncate">{reminder.customer_name || 'Cliente'}</p>
                                    <p className="ios-caption">{new Date(reminder.created_at).toLocaleDateString('it-IT')}</p>
                                </div>
                                <div className="text-right shrink-0">
                                    <p className="ios-caption">Restante</p>
                                    <p className="ios-title-3 ios-amount" style={{ color: '#C0392B' }}>€{formatEur(reminder.amount_due)}</p>
                                </div>
                                <button onClick={() => setMenuId(menuId === reminder.id ? null : reminder.id)} className="ios-press p-2 -mr-2" style={{ color: 'var(--label-tertiary)' }} aria-label="Altre azioni">
                                    <Ellipsis size={20} />
                                </button>
                            </div>

                            <div className="mt-3 rounded-xl px-3 py-2.5 flex items-center justify-between" style={{ background: 'var(--surface-tertiary)' }}>
                                <span className="ios-footnote">Totale transazione €{formatEur(safeNumber(reminder.order?.gross_total) + safeNumber(reminder.amount_due))}</span>
                                <Badge variant="danger" size="xs">Da pagare</Badge>
                            </div>

                            {reminder.order?.items && reminder.order.items.length > 0 && (
                                <div className="mt-2 flex flex-col gap-1">
                                    {reminder.order.items.map((item) => (
                                        <div key={item.id} className="flex items-center justify-between gap-3 px-1 py-1">
                                            <p className="ios-subhead truncate">{item.variant?.model?.name} · {item.variant?.flavor?.name} <span className="ios-caption">×{item.qty}</span></p>
                                            <span className="ios-subhead ios-amount shrink-0">€{formatEur(safeNumber(item.unit_price_final) * safeNumber(item.qty))}</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <button
                                onClick={() => { setSelectedReminder(reminder); setShowPaymentModal(true); }}
                                className="ios-btn ios-btn-filled w-full mt-3"
                            >
                                Incassa
                            </button>

                            <AnimatePresence>
                                {menuId === reminder.id && (
                                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                                        <div className="grid grid-cols-3 gap-2 mt-2.5">
                                            <button onClick={() => { finalizePayment(reminder.id, reminder.amount_due); setMenuId(null); }} className="ios-press py-2 rounded-xl text-[14px] font-medium" style={{ background: 'rgba(52,199,89,0.12)', color: '#248A3D' }}>
                                                Saldato
                                            </button>
                                            <button onClick={() => { setCancelConfirmId(reminder.id); setMenuId(null); }} disabled={actionLoading === reminder.id} className="ios-press py-2 rounded-xl text-[14px] font-medium disabled:opacity-50" style={{ background: 'rgba(255,149,0,0.14)', color: '#C93400' }}>
                                                Riprenota
                                            </button>
                                            <button onClick={() => { setDeleteConfirmId(reminder.id); setMenuId(null); }} className="ios-press py-2 rounded-xl text-[14px] font-medium" style={{ background: 'rgba(255,59,48,0.12)', color: '#C0392B' }}>
                                                Elimina
                                            </button>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    ))}
                </div>
            )}

            <ConfirmModal isOpen={!!cancelConfirmId} onClose={() => setCancelConfirmId(null)}
                onConfirm={() => cancelConfirmId && handleCancelToReservation(cancelConfirmId)}
                title="Riporta a prenotazione" message="L'ordine tornerà tra le prenotazioni. I pagamenti già effettuati verranno eliminati."
                variant="warning" confirmLabel="Conferma" loading={actionLoading !== null} />

            <ConfirmModal isOpen={!!deleteConfirmId} onClose={() => setDeleteConfirmId(null)}
                onConfirm={() => deleteConfirmId && handleDelete(deleteConfirmId)}
                title="Chiudi debito" message="Il debito verrà annullato senza movimenti di cassa."
                variant="danger" confirmLabel="Elimina" />

            {selectedReminder && (
                <PaymentModal isOpen={showPaymentModal}
                    onClose={() => { setShowPaymentModal(false); setSelectedReminder(null); }}
                    onConfirm={handlePaymentConfirm} totalAmount={selectedReminder.amount_due} />
            )}
        </div>
    );
};
