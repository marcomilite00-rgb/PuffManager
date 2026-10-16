import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { safeNumber, toCents, fromCents } from '../lib/money';
import { getErrorMessage } from '../lib/error';
import { useAuth } from '../context/AuthContext';
import { useRealtime } from '../hooks/useRealtime';
import { useToast } from '../components/ui/ToastProvider';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { EmptyState } from '../components/ui/EmptyState';
import type {
  Inventory,
  VariantJoined,
  ReservationItem,
  ReservationWithItems,
  StaffMinimal,
} from '../types/database';
import { motion, AnimatePresence } from 'motion/react';
import {
  ChevronDown,
  Plus,
  Minus,
  Search,
  X,
  CheckCircle2,
  Calendar,
  ArrowUpDown,
  Loader2,
  Edit2,
  Trash2,
} from 'lucide-react';
import { Badge } from '../components/ui/Badge';
import { PaymentModal } from '../components/PaymentModal';
import { PageSkeleton } from '../components/ui/PageSkeleton';
import { cn } from '../lib/cn';

export const Prenotazioni: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [reservations, setReservations] = useState<ReservationWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editItem, setEditItem] = useState<{
    itemId: string;
    qty: number;
    price: number;
    modelName: string;
    flavorName: string;
    maxQty: number;
  } | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentData, setPaymentData] = useState<{ id: string; total: number } | null>(null);
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [addItemResId, setAddItemResId] = useState<string | null>(null);
  const [variants, setVariants] = useState<VariantJoined[]>([]);
  const [inventory, setInventory] = useState<Inventory[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedVariant, setSelectedVariant] = useState<VariantJoined | null>(null);
  const [addQty, setAddQty] = useState(1);
  const [addPrice, setAddPrice] = useState(0);
  const [staffFilter, setStaffFilter] = useState('all');
  const [dateSort, setDateSort] = useState<'asc' | 'desc'>('desc');
  const [staffList, setStaffList] = useState<StaffMinimal[]>([]);
  const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null);

  const fetchData = async () => {
    const { data } = await supabase
      .from('reservations')
      .select(
        '*, items:reservation_items(*, variant:product_variants(id, model:product_models(name), flavor:product_flavors(name))), staff:created_by_staff_id(name)'
      )
      .eq('status', 'RESERVED')
      .order('created_at', { ascending: false });
    if (data) setReservations(data as ReservationWithItems[]);
    setLoading(false);
  };

  const fetchStaff = async () => {
    const { data } = await supabase.from('staff').select('id, name').order('name');
    if (data) setStaffList(data);
  };

  const fetchVariantsAndInventory = async () => {
    const [variantsRes, inventoryRes] = await Promise.all([
      supabase
        .from('product_variants')
        .select('*, model:product_models(name), flavor:product_flavors(name)')
        .eq('active', true),
      supabase.from('inventory').select('*'),
    ]);
    if (variantsRes.data) setVariants(variantsRes.data);
    if (inventoryRes.data) setInventory(inventoryRes.data);
  };

  useEffect(() => {
    fetchData();
    fetchVariantsAndInventory();
    fetchStaff();
  }, []);

  useRealtime<ReservationWithItems>('reservations', () => fetchData());
  useRealtime<ReservationItem>('reservation_items', () => fetchData());
  useRealtime<Inventory>('inventory', () => fetchVariantsAndInventory());

  const filteredReservations = useMemo(() => {
    let result = [...reservations];
    if (staffFilter !== 'all') {
      result = result.filter((r) => r.created_by_staff_id === staffFilter);
    }
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      result = result.filter(
        (r) =>
          r.customer_name?.toLowerCase().includes(s) ||
          r.staff?.name?.toLowerCase().includes(s)
      );
    }
    result.sort((a, b) => {
      const cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return dateSort === 'desc' ? -cmp : cmp;
    });
    return result;
  }, [reservations, staffFilter, searchTerm, dateSort]);

  const handleConfirmPayment = async (amount: number) => {
    if (!paymentData) return;
    setActionLoading(paymentData.id);
    setShowPaymentModal(false);
    try {
      const { error } = await supabase.rpc('fulfill_reservation', {
        p_res_id: paymentData.id,
        p_staff_id: user?.id,
        p_payment_amount: amount,
      });
      if (error) throw error;
      showToast('Vendita completata con successo', 'success');
    } catch (err) {
      showToast(getErrorMessage(err), 'error');
    } finally {
      setActionLoading(null);
      setPaymentData(null);
    }
  };

  const handleAnnulla = async (id: string) => {
    setActionLoading(id);
    try {
      const { error } = await supabase.rpc('cancel_reservation', { p_res_id: id });
      if (error) throw error;
      showToast('Prenotazione annullata', 'info');
    } catch (err) {
      showToast(getErrorMessage(err), 'error');
    } finally {
      setActionLoading(null);
      setCancelConfirmId(null);
    }
  };

  const handleUpdateQty = async (itemId: string, newQty: number, newPrice: number) => {
    if (newQty < 1) return;
    try {
      const { error } = await supabase.rpc('update_reservation_item', {
        p_item_id: itemId,
        p_new_qty: newQty,
        p_new_price: newPrice,
      });
      if (error) throw error;
      setEditItem(null);
      fetchData();
      fetchVariantsAndInventory();
    } catch (err) {
      showToast(getErrorMessage(err), 'error');
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    try {
      const { error } = await supabase.rpc('delete_reservation_item', {
        p_item_id: itemId,
      });
      if (error) throw error;
      fetchData();
    } catch (err) {
      showToast(getErrorMessage(err), 'error');
    }
  };

  const handleAddItem = async () => {
    if (!selectedVariant || !addItemResId) return;
    try {
      const { error } = await supabase.rpc('add_reservation_item', {
        p_reservation_id: addItemResId,
        p_variant_id: selectedVariant.id,
        p_qty: addQty,
        p_price_final: addPrice,
      });
      if (error) throw error;
      setShowAddItemModal(false);
      setSelectedVariant(null);
      fetchData();
      fetchVariantsAndInventory();
    } catch (err) {
      showToast(getErrorMessage(err), 'error');
    }
  };

  const getAvailableQty = (variantId: string) => {
    const inv = inventory.find((i) => i.variant_id === variantId);
    return inv ? inv.qty : 0;
  };

  const filteredVariants = variants.filter((v) =>
    `${v.model?.name} ${v.flavor?.name}`.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <PageSkeleton
        titleClass="w-52 h-10"
        blocks={[
          { count: 1, className: 'h-12' },
          { count: 4, className: 'h-24' },
        ]}
      />
    );
  }

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6">
      {/* ── Top Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="spatial-chip spatial-chip-orange text-[11px] py-0.5">
              <Calendar size={11} /> Prenotazioni
            </span>
            <span className="spatial-caption text-white/50">
              {filteredReservations.length} Attive
            </span>
          </div>
          <h1 className="spatial-title text-2xl sm:text-3xl font-semibold text-white">
            Ordini Riservati
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setDateSort((d) => (d === 'desc' ? 'asc' : 'desc'))}
            className="spatial-btn-ghost h-11 px-4 text-xs font-semibold flex items-center gap-2 shrink-0"
            aria-label="Inverti ordinamento data"
          >
            <ArrowUpDown size={14} />
            <span>{dateSort === 'desc' ? 'Più recenti' : 'Meno recenti'}</span>
          </button>

          {/* Search Pill */}
          <div className="spatial-search flex-1 sm:w-64">
            <Search size={16} className="text-white/40 shrink-0" />
            <input
              type="search"
              placeholder="Cerca cliente o staff..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="Cerca prenotazione"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="text-white/40 hover:text-white"
                aria-label="Pulisci ricerca"
              >
                <X size={15} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Staff Segmented Filter ── */}
      <div className="spatial-segmented">
        <button
          type="button"
          onClick={() => setStaffFilter('all')}
          className={cn(
            'spatial-segmented-item',
            staffFilter === 'all' && 'spatial-segmented-item-active'
          )}
        >
          Tutti gli operatori
        </button>
        {staffList.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setStaffFilter(s.id)}
            className={cn(
              'spatial-segmented-item',
              staffFilter === s.id && 'spatial-segmented-item-active'
            )}
          >
            {s.name}
          </button>
        ))}
      </div>

      {/* ── Reservations List ── */}
      {filteredReservations.length === 0 ? (
        <EmptyState
          title="Nessuna prenotazione trovata"
          subtitle="Non ci sono prenotazioni attive con i filtri selezionati"
        />
      ) : (
        <div className="space-y-3.5">
          {filteredReservations.map((res) => {
            const isExpanded = expandedId === res.id;
            const items = res.items || [];
            const total = fromCents(
              items.reduce(
                (acc, curr) =>
                  acc + safeNumber(curr.qty) * toCents(curr.unit_price_final),
                0
              )
            );

            return (
              <div
                key={res.id}
                className="spatial-panel p-0 overflow-hidden border border-white/15 transition-all duration-200"
              >
                {/* Header Row clickable */}
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : res.id)}
                  className="w-full flex items-center gap-3.5 p-4 sm:p-5 text-left transition-colors hover:bg-white/5 focus-visible:outline-none"
                  aria-expanded={isExpanded}
                >
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-white/20 to-white/5 border border-white/20 flex items-center justify-center font-bold text-white text-lg shadow-sm shrink-0">
                    {(res.customer_name || 'G').charAt(0).toUpperCase()}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="spatial-headline text-[16px] text-white font-semibold truncate">
                        {res.customer_name || 'Generico'}
                      </p>
                      <span className="w-2 h-2 rounded-full bg-[#FF9F0A] shadow-[0_0_6px_#FF9F0A] shrink-0" />
                    </div>
                    <p className="spatial-caption text-white/50 truncate">
                      {items.length} {items.length === 1 ? 'articolo' : 'articoli'} · Inserito da{' '}
                      {res.staff?.name || 'Sistema'} ·{' '}
                      {new Date(res.created_at).toLocaleDateString('it-IT', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="spatial-amount text-lg sm:text-xl font-bold text-white block">
                      €{total.toFixed(2)}
                    </span>
                  </div>

                  <ChevronDown
                    size={20}
                    className={cn(
                      'text-white/40 transition-transform duration-250 shrink-0 ml-1',
                      isExpanded && 'rotate-180 text-white'
                    )}
                  />
                </button>

                {/* Expanded Item Detail */}
                <AnimatePresence initial={false}>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: 'easeInOut' }}
                      className="overflow-hidden border-t border-white/10"
                    >
                      <div className="p-4 sm:p-6 bg-black/25 flex flex-col gap-3">
                        <p className="spatial-caption text-white/40 font-semibold mb-1">
                          Articoli in attesa di ritiro
                        </p>

                        {/* Items */}
                        <div className="space-y-2">
                          {items.map((item) => (
                            <div
                              key={item.id}
                              className="spatial-subpanel p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                            >
                              <div className="min-w-0">
                                <p className="spatial-caption text-[10px] text-white/50 truncate">
                                  {item.variant?.model?.name ?? 'Modello'}
                                </p>
                                <p className="spatial-headline text-[15px] font-semibold text-white truncate">
                                  {item.variant?.flavor?.name ?? 'Gusto'}
                                </p>
                                <p className="spatial-footnote text-xs text-white/60 mt-0.5">
                                  {item.qty} pz × €{Number(item.unit_price_final).toFixed(2)}
                                </p>
                              </div>

                              <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                                <span className="spatial-amount text-base font-bold text-white sm:mr-3">
                                  €{(Number(item.unit_price_final) * Number(item.qty)).toFixed(2)}
                                </span>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setEditItem({
                                        itemId: item.id,
                                        qty: Number(item.qty),
                                        price: Number(item.unit_price_final),
                                        modelName: item.variant?.model?.name ?? '',
                                        flavorName: item.variant?.flavor?.name ?? '',
                                        maxQty:
                                          Number(item.qty) +
                                          Number(getAvailableQty(item.variant?.id ?? '')),
                                      })
                                    }
                                    className="px-3 py-1.5 rounded-full text-xs font-semibold bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition-colors flex items-center gap-1.5"
                                  >
                                    <Edit2 size={12} /> Modifica
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteItem(item.id)}
                                    className="px-3 py-1.5 rounded-full text-xs font-semibold bg-[#FF453A]/15 hover:bg-[#FF453A]/25 text-[#FF453A] border border-[#FF453A]/30 transition-colors flex items-center gap-1.5"
                                  >
                                    <Trash2 size={12} /> Rimuovi
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Dashed Add Article Button */}
                        <button
                          type="button"
                          onClick={() => {
                            setAddItemResId(res.id);
                            setSelectedVariant(null);
                            setShowAddItemModal(true);
                          }}
                          className="w-full py-3 rounded-2xl flex items-center justify-center gap-2 text-sm font-semibold text-white/70 hover:text-white transition-all duration-150 border-2 border-dashed border-white/20 hover:border-[#0A84FF] hover:bg-[#0A84FF]/10 mt-1"
                        >
                          <Plus size={16} /> Aggiungi articolo
                        </button>

                        {/* Main Actions */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3 pt-3 border-t border-white/10">
                          <button
                            type="button"
                            onClick={() => {
                              setPaymentData({ id: res.id, total });
                              setShowPaymentModal(true);
                            }}
                            disabled={actionLoading === res.id}
                            className="spatial-btn-blue h-12 text-sm font-semibold flex items-center justify-center gap-2 shadow-lg"
                          >
                            {actionLoading === res.id ? (
                              <Loader2 size={18} className="animate-spin text-white" />
                            ) : (
                              <>
                                <CheckCircle2 size={18} /> Concludi vendita
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => setCancelConfirmId(res.id)}
                            disabled={actionLoading === res.id}
                            className="h-12 rounded-full font-semibold text-sm flex items-center justify-center bg-[#FF453A]/15 hover:bg-[#FF453A]/25 border border-[#FF453A]/30 text-[#FF453A] transition-colors disabled:opacity-40"
                          >
                            Annulla prenotazione
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={!!cancelConfirmId}
        onClose={() => setCancelConfirmId(null)}
        onConfirm={() => cancelConfirmId && handleAnnulla(cancelConfirmId)}
        title="Annulla prenotazione"
        message="Sei sicuro di voler annullare questa prenotazione? Lo stock degli articoli riservati verrà immediatamente ripristinato."
        variant="danger"
        confirmLabel="Annulla prenotazione"
        loading={actionLoading !== null}
      />

      {/* Payment Modal */}
      <PaymentModal
        isOpen={showPaymentModal && !!paymentData}
        onClose={() => setShowPaymentModal(false)}
        onConfirm={handleConfirmPayment}
        totalAmount={paymentData?.total ?? 0}
        loading={actionLoading !== null}
      />

      {/* Sheet Aggiungi Articolo */}
      <AnimatePresence>
        {showAddItemModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center sm:p-4 bg-black/60 backdrop-blur-md"
            onClick={() => setShowAddItemModal(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 320 }}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="add-item-title"
              className="spatial-sheet w-full sm:max-w-lg flex flex-col p-6 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+24px)]"
              style={{ maxHeight: '88dvh' }}
            >
              <div className="spatial-grabber" />
              <h3 id="add-item-title" className="spatial-headline text-lg font-semibold text-white mb-3">
                Aggiungi Articolo alla Prenotazione
              </h3>

              <div className="flex-1 overflow-y-auto space-y-2 min-h-0 mb-4 pr-1">
                {filteredVariants.map((v) => {
                  const avail = getAvailableQty(v.id);
                  const sel = selectedVariant?.id === v.id;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => {
                        setSelectedVariant(v);
                        setAddQty(1);
                        setAddPrice(Number(v.default_price));
                      }}
                      className={cn(
                        'w-full flex items-center justify-between p-3.5 rounded-2xl text-left border transition-all',
                        sel
                          ? 'bg-[#0A84FF]/20 border-[#0A84FF] shadow-[0_0_12px_rgba(10,132,255,0.3)]'
                          : 'bg-white/5 hover:bg-white/10 border-white/10'
                      )}
                    >
                      <div className="min-w-0 pr-2">
                        <p className="spatial-caption text-[10px] text-white/50 truncate">
                          {v.model?.name}
                        </p>
                        <p className="spatial-headline text-sm font-semibold text-white truncate">
                          {v.flavor?.name}
                        </p>
                      </div>
                      <div className="text-right shrink-0 flex items-center gap-2">
                        <span className="spatial-amount text-sm font-bold text-white">
                          €{Number(v.default_price).toFixed(2)}
                        </span>
                        <Badge variant={avail > 0 ? 'success' : 'danger'} size="xs">
                          {avail} pz
                        </Badge>
                      </div>
                    </button>
                  );
                })}
              </div>

              {selectedVariant && (
                <div className="py-3 border-t border-white/10 space-y-3 mb-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1">
                      <label className="spatial-caption block mb-1 text-white/60">
                        Quantità (disp: {getAvailableQty(selectedVariant.id)})
                      </label>
                      <div className="flex items-center justify-between bg-white/10 rounded-full p-1 border border-white/15">
                        <button
                          type="button"
                          onClick={() => setAddQty(Math.max(1, addQty - 1))}
                          className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"
                          aria-label="Diminuisci quantità"
                        >
                          <Minus size={14} />
                        </button>
                        <span className="spatial-amount text-base font-bold text-white">
                          {addQty}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setAddQty(
                              Math.min(getAvailableQty(selectedVariant.id), addQty + 1)
                            )
                          }
                          className="w-8 h-8 rounded-full bg-[#0A84FF] flex items-center justify-center text-white shadow-[0_0_8px_rgba(10,132,255,0.5)]"
                          aria-label="Aumenta quantità"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    </div>

                    <div className="flex-1">
                      <label className="spatial-caption block mb-1 text-white/60">
                        Prezzo Unitario (€)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={addPrice}
                        onChange={(e) => setAddPrice(Number(e.target.value))}
                        className="w-full text-center spatial-amount bg-white/10 border border-white/15 rounded-full py-2 text-white font-bold text-base focus:outline-none focus:border-[#0A84FF]"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddItemModal(false)}
                  className="spatial-btn-ghost flex-1 h-12 text-sm font-semibold"
                >
                  Annulla
                </button>
                <button
                  type="button"
                  onClick={handleAddItem}
                  disabled={!selectedVariant || getAvailableQty(selectedVariant.id) <= 0}
                  className="spatial-btn-primary flex-1 h-12 text-sm font-semibold"
                >
                  Aggiungi
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sheet Modifica Articolo */}
      <AnimatePresence>
        {editItem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center sm:p-4 bg-black/60 backdrop-blur-md"
            onClick={() => setEditItem(null)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 320 }}
              className="spatial-sheet w-full sm:max-w-md p-6 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+24px)]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="spatial-grabber" />
              <h4 className="spatial-headline text-lg font-semibold text-white mt-1">
                {editItem.modelName}
              </h4>
              <p className="spatial-subhead text-sm text-white/50 mb-5">
                {editItem.flavorName}
              </p>

              <div className="mb-5">
                <label className="spatial-caption block text-center mb-2 text-white/60">
                  Quantità (Massimo disponibile: {editItem.maxQty})
                </label>
                <div className="flex items-center justify-center gap-6">
                  <button
                    type="button"
                    onClick={() =>
                      setEditItem((p) =>
                        p ? { ...p, qty: Math.max(1, p.qty - 1) } : null
                      )
                    }
                    className="w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 border border-white/15 flex items-center justify-center text-white text-lg transition-all"
                    aria-label="Diminuisci quantità"
                  >
                    <Minus size={20} />
                  </button>
                  <span className="spatial-amount text-3xl font-bold text-white w-16 text-center">
                    {editItem.qty}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setEditItem((p) =>
                        p && p.qty < p.maxQty ? { ...p, qty: p.qty + 1 } : p
                      )
                    }
                    className="w-12 h-12 rounded-full bg-[#0A84FF] active:scale-95 flex items-center justify-center text-white text-lg shadow-[0_0_12px_rgba(10,132,255,0.6)] transition-all"
                    aria-label="Aumenta quantità"
                  >
                    <Plus size={20} />
                  </button>
                </div>
              </div>

              <div className="mb-6">
                <label className="spatial-caption block text-center mb-2 text-white/60">
                  Prezzo Unitario Modificato (€)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={editItem.price}
                  onChange={(e) =>
                    setEditItem((p) =>
                      p ? { ...p, price: parseFloat(e.target.value) || 0 } : null
                    )
                  }
                  className="w-full text-center spatial-amount bg-white/10 border border-white/20 rounded-2xl py-3 text-white text-xl font-bold focus:outline-none focus:border-[#0A84FF]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setEditItem(null)}
                  className="spatial-btn-ghost h-12 text-sm font-semibold"
                >
                  Annulla
                </button>
                <button
                  type="button"
                  onClick={() =>
                    editItem &&
                    handleUpdateQty(editItem.itemId, editItem.qty, editItem.price)
                  }
                  className="spatial-btn-primary h-12 text-sm font-semibold"
                >
                  Salva Modifiche
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
