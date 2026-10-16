import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { safeNumber, formatEur } from '../lib/money';
import { getErrorMessage } from '../lib/error';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ui/ToastProvider';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { EmptyState } from '../components/ui/EmptyState';
import {
  AlertCircle,
  MoreVertical,
  CreditCard,
  Check,
  Calendar,
  Trash2,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { PaymentModal } from '../components/PaymentModal';
import { PageSkeleton } from '../components/ui/PageSkeleton';

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
      variant: { model: { name: string }; flavor: { name: string } };
    }>;
  };
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

  const fetchReminders = async () => {
    try {
      const { data, error } = await supabase
        .from('reminders')
        .select(
          '*, order:orders(gross_total, items:order_items(*, variant:product_variants(model:product_models(name), flavor:product_flavors(name))))'
        )
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

  useEffect(() => {
    fetchReminders();
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

  const finalizePayment = async (reminderId: string, amount: number) => {
    try {
      const { error } = await supabase.rpc('pay_reminder', {
        p_reminder_id: reminderId,
        p_payment_amount: amount,
        p_staff_id: user?.id,
      });
      if (error) throw error;
      setShowPaymentModal(false);
      setSelectedReminder(null);
      fetchReminders();
      showToast('Pagamento registrato con successo', 'success');
    } catch (err) {
      showToast(getErrorMessage(err, 'Errore nel pagamento'), 'error');
    }
  };

  const handlePaymentConfirm = async (amount: number) => {
    if (!selectedReminder) return;
    await finalizePayment(selectedReminder.id, amount);
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.rpc('resolve_reminder_debt', {
        p_reminder_id: id,
      });
      if (error) throw error;
      fetchReminders();
      showToast('Debito chiuso definitivamente', 'success');
    } catch {
      showToast('Errore durante la chiusura del debito', 'error');
    } finally {
      setDeleteConfirmId(null);
    }
  };

  const handleCancelToReservation = async (id: string) => {
    setActionLoading(id);
    try {
      const { error } = await supabase.rpc('cancel_reminder_to_reservation', {
        p_reminder_id: id,
      });
      if (error) throw error;
      fetchReminders();
      showToast('Ordine riportato tra le prenotazioni attive', 'info');
    } catch (err) {
      showToast(getErrorMessage(err, "Errore durante l'annullamento"), 'error');
    } finally {
      setActionLoading(null);
      setCancelConfirmId(null);
    }
  };

  if (loading) {
    return (
      <PageSkeleton
        titleClass="w-52 h-10"
        blocks={[
          { count: 1, className: 'h-14' },
          { count: 3, className: 'h-44' },
        ]}
      />
    );
  }

  const totalDue = reminders.reduce((a, r) => a + safeNumber(r.amount_due), 0);

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      {/* ── Top Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="spatial-chip spatial-chip-red text-[11px] py-0.5">
              <AlertCircle size={11} /> Scadenze & Debiti
            </span>
            <span className="spatial-caption text-white/50">
              {reminders.length} Sospesi
            </span>
          </div>
          <h1 className="spatial-title text-2xl sm:text-3xl font-semibold text-white">
            Promemoria Debiti
          </h1>
        </div>

        {totalDue > 0 && (
          <div className="spatial-panel py-2.5 px-4 flex items-center gap-3 self-start sm:self-auto border-[#FF453A]/30">
            <div>
              <p className="spatial-caption text-[#FF453A]">Da Incassare Totale</p>
              <p className="spatial-amount text-xl font-bold text-white leading-tight">
                €{formatEur(totalDue)}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Reminders List ── */}
      {reminders.length === 0 ? (
        <EmptyState
          icon={AlertCircle}
          title="Tutti i conti sono saldati"
          subtitle="Non risultano crediti in sospeso o debiti registrati per i clienti."
        />
      ) : (
        <div className="space-y-4">
          {reminders.map((reminder) => {
            const isMenuOpen = menuId === reminder.id;
            const gross =
              safeNumber(reminder.order?.gross_total) ||
              safeNumber(reminder.amount_due);
            const due = safeNumber(reminder.amount_due);
            const paid = Math.max(0, gross - due);
            const paidRatio = gross > 0 ? (paid / gross) * 100 : 0;
            const dueRatio = 100 - paidRatio;

            return (
              <div
                key={reminder.id}
                className="spatial-panel p-5 sm:p-6 border border-white/15 flex flex-col gap-4 relative overflow-hidden"
              >
                {/* Header Row */}
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-[#FF453A]/20 border border-[#FF453A]/30 text-[#FF453A] flex items-center justify-center font-bold text-lg shadow-[0_0_12px_rgba(255,69,58,0.3)] shrink-0">
                    {(reminder.customer_name || 'C').charAt(0).toUpperCase()}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="spatial-headline text-[16px] sm:text-[17px] font-semibold text-white truncate">
                      {reminder.customer_name || 'Cliente'}
                    </p>
                    <p className="spatial-caption text-white/50 mt-0.5">
                      Registrato il{' '}
                      {new Date(reminder.created_at).toLocaleDateString('it-IT', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="spatial-caption text-[#FF453A] block">
                      Restante da pagare
                    </span>
                    <span className="spatial-amount text-2xl font-bold text-[#FF453A] tracking-tight">
                      €{formatEur(due)}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setMenuId(isMenuOpen ? null : reminder.id)}
                    className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center text-white/60 hover:text-white transition-colors shrink-0 ml-1"
                    aria-label="Altre opzioni debito"
                  >
                    <MoreVertical size={18} />
                  </button>
                </div>

                {/* ── Slider Ambient LED Style: Paid vs Remaining Bar ── */}
                <div className="spatial-subpanel p-3.5 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="spatial-caption text-white/60">
                      Già Corrisposto: €{formatEur(paid)} ({paidRatio.toFixed(0)}%)
                    </span>
                    <span className="spatial-caption text-[#FF453A] font-semibold">
                      Debito: €{formatEur(due)} ({dueRatio.toFixed(0)}%)
                    </span>
                  </div>

                  {/* Ambient LED Double-Track Slider */}
                  <div className="relative w-full h-3 rounded-full bg-white/10 overflow-hidden flex p-0.5 border border-white/15">
                    {/* Paid portion: soft blue/green glow */}
                    <div
                      className="h-full rounded-l-full bg-gradient-to-r from-[#0A84FF] to-[#30D158] transition-all duration-300"
                      style={{ width: `${paidRatio}%` }}
                    />
                    {/* Remaining portion: bright LED red glow */}
                    <div
                      className="h-full rounded-r-full bg-[#FF453A] shadow-[0_0_12px_#FF453A] transition-all duration-300"
                      style={{ width: `${dueRatio}%` }}
                    />
                  </div>
                </div>

                {/* Optional Articles Summary */}
                {reminder.order?.items && reminder.order.items.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <p className="spatial-caption text-white/40">
                      Articoli legati all'ordine:
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {reminder.order.items.map((item) => (
                        <div
                          key={item.id}
                          className="spatial-subpanel px-3 py-1.5 flex items-center justify-between text-xs"
                        >
                          <span className="text-white/80 font-medium truncate pr-2">
                            {item.variant?.model?.name} · {item.variant?.flavor?.name}
                          </span>
                          <span className="spatial-amount text-white shrink-0">
                            {item.qty} pz · €{formatEur(safeNumber(item.unit_price_final) * safeNumber(item.qty))}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Single Primary CTA: "Incassa" ── */}
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedReminder(reminder);
                      setShowPaymentModal(true);
                    }}
                    className="spatial-btn-primary w-full h-12 text-sm font-semibold flex items-center justify-center gap-2 shadow-xl"
                  >
                    <CreditCard size={18} />
                    <span>Incassa Somma Dovuta (€{formatEur(due)})</span>
                  </button>
                </div>

                {/* ── Secondary Actions Drawer (Saldato / Riprenota / Elimina) ── */}
                <AnimatePresence>
                  {isMenuOpen && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden border-t border-white/10 pt-3 mt-1"
                    >
                      <p className="spatial-caption text-white/40 mb-2">
                        Azioni rapide sul debito:
                      </p>
                      <div className="grid grid-cols-3 gap-2.5">
                        <button
                          type="button"
                          onClick={() => {
                            finalizePayment(reminder.id, reminder.amount_due);
                            setMenuId(null);
                          }}
                          className="h-10 rounded-full font-semibold text-xs flex items-center justify-center gap-1.5 bg-[#30D158]/15 hover:bg-[#30D158]/25 border border-[#30D158]/30 text-[#30D158] transition-colors"
                        >
                          <Check size={14} /> Saldato
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setCancelConfirmId(reminder.id);
                            setMenuId(null);
                          }}
                          disabled={actionLoading === reminder.id}
                          className="h-10 rounded-full font-semibold text-xs flex items-center justify-center gap-1.5 bg-[#FF9F0A]/15 hover:bg-[#FF9F0A]/25 border border-[#FF9F0A]/30 text-[#FF9F0A] transition-colors disabled:opacity-40"
                        >
                          <Calendar size={14} /> Riprenota
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDeleteConfirmId(reminder.id);
                            setMenuId(null);
                          }}
                          className="h-10 rounded-full font-semibold text-xs flex items-center justify-center gap-1.5 bg-[#FF453A]/15 hover:bg-[#FF453A]/25 border border-[#FF453A]/30 text-[#FF453A] transition-colors"
                        >
                          <Trash2 size={14} /> Elimina
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}

      {/* Revert to Reservation ConfirmModal */}
      <ConfirmModal
        isOpen={!!cancelConfirmId}
        onClose={() => setCancelConfirmId(null)}
        onConfirm={() =>
          cancelConfirmId && handleCancelToReservation(cancelConfirmId)
        }
        title="Riporta l'ordine a prenotazione"
        message="L'ordine tornerà tra le prenotazioni attive e i pagamenti parziali effettuati verranno eliminati. Vuoi procedere?"
        variant="warning"
        confirmLabel="Conferma e Riprenota"
        loading={actionLoading !== null}
      />

      {/* Delete/Resolve Debt ConfirmModal */}
      <ConfirmModal
        isOpen={!!deleteConfirmId}
        onClose={() => setDeleteConfirmId(null)}
        onConfirm={() => deleteConfirmId && handleDelete(deleteConfirmId)}
        title="Chiudi definitivamente debito"
        message="Il debito verrà annullato e archiviato senza registrare entrate di cassa. Operazione irreversibile."
        variant="danger"
        confirmLabel="Elimina Debito"
      />

      {/* Payment Modal for Collection */}
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
