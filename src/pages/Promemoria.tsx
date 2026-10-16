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
  staff?: { name: string } | null;
  order?: {
    gross_total: number;
    staff?: { name: string } | null;
    items: Array<{
      id: string;
      qty: number;
      unit_price_final: number;
      variant: { model: { name: string }; flavor: { name: string } };
    }>;
  };
}

interface ParsedReminderItem {
  model?: string;
  flavor: string;
  qty: number;
  price: number;
}

const getReminderItems = (reminder: Reminder): ParsedReminderItem[] => {
  if (reminder.order?.items && reminder.order.items.length > 0) {
    return reminder.order.items.map((it) => ({
      model: it.variant?.model?.name || '',
      flavor: it.variant?.flavor?.name || 'Gusto non specificato',
      qty: it.qty,
      price: safeNumber(it.unit_price_final) * safeNumber(it.qty),
    }));
  }
  if (reminder.description) {
    const raw = reminder.description.replace(/^Saldo:\s*/i, '').trim();
    if (raw) {
      return [
        {
          flavor: raw,
          qty: 1,
          price: safeNumber(reminder.amount_due),
        },
      ];
    }
  }
  return [
    {
      flavor: 'Debito registrato',
      qty: 1,
      price: safeNumber(reminder.amount_due),
    },
  ];
};

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
          '*, staff:created_by_staff_id(name), order:orders(gross_total, staff:sold_by_staff_id(name), items:order_items(*, variant:product_variants(model:product_models(name), flavor:product_flavors(name))))'
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
            const items = getReminderItems(reminder);
            const staffName =
              reminder.staff?.name || reminder.order?.staff?.name;

            return (
              <div
                key={reminder.id}
                className="spatial-panel p-5 sm:p-6 border border-white/15 flex flex-col gap-4 relative overflow-hidden"
              >
                {/* Header Row: Cliente a sinistra, Soldi che mancano in piccolo a destra */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-2xl bg-[#FF453A]/15 border border-[#FF453A]/25 text-[#FF453A] flex items-center justify-center font-bold text-base shrink-0">
                      {(reminder.customer_name || 'C').charAt(0).toUpperCase()}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="spatial-headline text-[15px] sm:text-[16px] font-semibold text-white truncate">
                        {reminder.customer_name || 'Cliente'}
                      </p>
                      <p className="spatial-caption text-white/40 text-[11px] mt-0.5">
                        Registrato il{' '}
                        {new Date(reminder.created_at).toLocaleDateString('it-IT', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                        {staffName ? (
                          <>
                            {' '}da{' '}
                            <span className="text-white/75 font-medium">
                              {staffName}
                            </span>
                          </>
                        ) : null}
                      </p>
                    </div>
                  </div>

                  {/* Restante da pagare in piccolo */}
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right">
                      <span className="text-[10px] uppercase font-semibold text-white/40 block tracking-wider leading-none mb-1">
                        Mancano
                      </span>
                      <span className="text-sm sm:text-base font-bold text-[#FF453A] leading-none">
                        €{formatEur(due)}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setMenuId(isMenuOpen ? null : reminder.id)}
                      className="min-w-[36px] min-h-[36px] rounded-full bg-white/5 hover:bg-white/15 active:scale-95 flex items-center justify-center transition-all shrink-0 ml-1 text-white/60 hover:text-white"
                      aria-label="Altre opzioni debito"
                    >
                      <MoreVertical size={16} />
                    </button>
                  </div>
                </div>

                {/* ── IL GUSTO IN GRANDE ── */}
                <div className="spatial-subpanel p-3.5 sm:p-4 rounded-2xl flex flex-col gap-2.5 border border-white/10 bg-white/[0.04]">
                  {items.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1.5"
                    >
                      <div className="min-w-0 flex-1">
                        {item.model && (
                          <span className="text-[11px] font-semibold text-[#0A84FF] uppercase tracking-wider block mb-0.5">
                            {item.model}
                          </span>
                        )}
                        <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight leading-snug break-words">
                          {item.flavor}
                        </h3>
                      </div>
                      <div className="text-xs text-white/60 shrink-0 font-medium sm:text-right">
                        {item.qty} pz · €{formatEur(item.price)}
                      </div>
                    </div>
                  ))}
                </div>

                {/* ── Riga dei soldi che mancano (in piccolo) ── */}
                <div className="space-y-1.5 px-0.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-white/50">
                      Già Corrisposto: €{formatEur(paid)} ({paidRatio.toFixed(0)}%)
                    </span>
                    <span className="text-[#FF453A] font-semibold">
                      Debito: €{formatEur(due)} ({dueRatio.toFixed(0)}%)
                    </span>
                  </div>

                  {/* Slim Ambient LED Double-Track Line */}
                  <div className="relative w-full h-1.5 rounded-full bg-white/10 overflow-hidden flex border border-white/10">
                    <div
                      className="h-full bg-gradient-to-r from-[#0A84FF] to-[#30D158] transition-all duration-300"
                      style={{ width: `${paidRatio}%` }}
                    />
                    <div
                      className="h-full bg-[#FF453A] shadow-[0_0_8px_#FF453A] transition-all duration-300"
                      style={{ width: `${dueRatio}%` }}
                    />
                  </div>
                </div>

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
                          className="min-h-[44px] rounded-full font-semibold text-xs flex items-center justify-center gap-1.5 bg-[#30D158]/15 hover:bg-[#30D158]/25 border border-[#30D158]/30 text-[#30D158] transition-all active:scale-95"
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
                          className="min-h-[44px] rounded-full font-semibold text-xs flex items-center justify-center gap-1.5 bg-[#FF9F0A]/15 hover:bg-[#FF9F0A]/25 border border-[#FF9F0A]/30 text-[#FF9F0A] transition-all active:scale-95 disabled:opacity-40"
                        >
                          <Calendar size={14} /> Riprenota
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDeleteConfirmId(reminder.id);
                            setMenuId(null);
                          }}
                          className="min-h-[44px] rounded-full font-semibold text-xs flex items-center justify-center gap-1.5 bg-[#FF453A]/15 hover:bg-[#FF453A]/25 border border-[#FF453A]/30 text-[#FF453A] transition-all active:scale-95"
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
