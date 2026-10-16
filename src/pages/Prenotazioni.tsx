import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { safeNumber, toCents, fromCents } from '../lib/money';
import { getErrorMessage } from '../lib/error';
import { useAuth } from '../context/AuthContext';
import { useRealtime } from '../hooks/useRealtime';
import { useToast } from '../components/ui/ToastProvider';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { EmptyState } from '../components/ui/EmptyState';
import type { Inventory, VariantJoined, ReservationItem, ReservationWithItems, StaffMinimal } from '../types/database';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, Plus, Minus, Search, X, CheckCircle2 } from 'lucide-react';
import { Badge } from '../components/ui/Badge';
import { PaymentModal } from '../components/PaymentModal';
import { PageSkeleton } from '../components/ui/PageSkeleton';
import { clsx } from 'clsx';

export const Prenotazioni: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [reservations, setReservations] = useState<ReservationWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editItem, setEditItem] = useState<{ itemId: string; qty: number; price: number; modelName: string; flavorName: string; maxQty: number } | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentData, setPaymentData] = useState<{ id: string, total: number } | null>(null);
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

  useEffect(() => { fetchData(); fetchVariantsAndInventory(); fetchStaff(); }, []);

  const fetchData = async () => {
    const { data } = await supabase
      .from('reservations')
      .select('*, items:reservation_items(*, variant:product_variants(id, model:product_models(name), flavor:product_flavors(name))), staff:created_by_staff_id(name)')
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
      supabase.from('product_variants').select('*, model:product_models(name), flavor:product_flavors(name)').eq('active', true),
      supabase.from('inventory').select('*')
    ]);
    if (variantsRes.data) setVariants(variantsRes.data);
    if (inventoryRes.data) setInventory(inventoryRes.data);
  };

  useRealtime<ReservationWithItems>('reservations', () => fetchData());
  useRealtime<ReservationItem>('reservation_items', () => fetchData());
  useRealtime<Inventory>('inventory', () => fetchVariantsAndInventory());

  const filteredReservations = useMemo(() => {
    let result = [...reservations];
    if (staffFilter !== 'all') result = result.filter((r) => r.created_by_staff_id === staffFilter);
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      result = result.filter((r) =>
        r.customer_name?.toLowerCase().includes(s) || r.staff?.name?.toLowerCase().includes(s));
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
      const { error } = await supabase.rpc('fulfill_reservation', { p_res_id: paymentData.id, p_staff_id: user?.id, p_payment_amount: amount });
      if (error) throw error;
      showToast('Vendita completata', 'success');
    } catch (err) { showToast(getErrorMessage(err), 'error'); } finally { setActionLoading(null); setPaymentData(null); }
  };

  const handleAnnulla = async (id: string) => {
    setActionLoading(id);
    try {
      const { error } = await supabase.rpc('cancel_reservation', { p_res_id: id });
      if (error) throw error;
      showToast('Prenotazione annullata', 'info');
    } catch (err) { showToast(getErrorMessage(err), 'error'); } finally { setActionLoading(null); setCancelConfirmId(null); }
  };

  const handleUpdateQty = async (itemId: string, newQty: number, newPrice: number) => {
    if (newQty < 1) return;
    try {
      const { error } = await supabase.rpc('update_reservation_item', { p_item_id: itemId, p_new_qty: newQty, p_new_price: newPrice });
      if (error) throw error;
      setEditItem(null); fetchData(); fetchVariantsAndInventory();
    } catch (err) { showToast(getErrorMessage(err), 'error'); }
  };

  const handleDeleteItem = async (itemId: string) => {
    try {
      const { error } = await supabase.rpc('delete_reservation_item', { p_item_id: itemId });
      if (error) throw error;
      fetchData();
    } catch (err) { showToast(getErrorMessage(err), 'error'); }
  };

  const handleAddItem = async () => {
    if (!selectedVariant || !addItemResId) return;
    try {
      const { error } = await supabase.rpc('add_reservation_item', { p_reservation_id: addItemResId, p_variant_id: selectedVariant.id, p_qty: addQty, p_price_final: addPrice });
      if (error) throw error;
      setShowAddItemModal(false); setSelectedVariant(null); fetchData(); fetchVariantsAndInventory();
    } catch (err) { showToast(getErrorMessage(err), 'error'); }
  };

  const getAvailableQty = (variantId: string) => {
    const inv = inventory.find(i => i.variant_id === variantId);
    return inv ? inv.qty : 0;
  };

  const filteredVariants = variants.filter(v =>
    `${v.model?.name} ${v.flavor?.name}`.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return (
    <PageSkeleton titleClass="w-48 h-9" blocks={[{ count: 1, className: 'h-12' }, { count: 4, className: 'h-[76px]' }]} />
  );

  return (
    <div className="ios-page">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="ios-title-large">Prenotazioni</h1>
          <p className="ios-footnote mt-0.5">{filteredReservations.length} in attesa</p>
        </div>
        <button onClick={() => setDateSort(d => d === 'desc' ? 'asc' : 'desc')} className="ios-press ios-footnote px-3 py-2 rounded-xl" style={{ background: 'var(--surface-secondary)', color: 'var(--accent)' }}>
          {dateSort === 'desc' ? 'Recenti' : 'Vecchie'}
        </button>
      </div>

      <div className="ios-search">
        <Search size={18} style={{ color: 'var(--label-tertiary)', flexShrink: 0 }} />
        <input type="search" placeholder="Cerca cliente o staff" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} aria-label="Cerca prenotazione" />
        {searchTerm && <button onClick={() => setSearchTerm('')} className="ios-press" style={{ color: 'var(--label-tertiary)' }} aria-label="Pulisci"><X size={16} /></button>}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        <button onClick={() => setStaffFilter('all')} className={clsx('ios-press whitespace-nowrap px-3.5 py-1.5 rounded-full text-[14px]', staffFilter === 'all' ? 'font-semibold' : '')} style={staffFilter === 'all' ? { background: 'var(--label)', color: 'var(--surface-secondary)' } : { background: 'var(--surface-secondary)', color: 'var(--label)' }}>
          Tutti
        </button>
        {staffList.map(s => (
          <button key={s.id} onClick={() => setStaffFilter(s.id)} className={clsx('ios-press whitespace-nowrap px-3.5 py-1.5 rounded-full text-[14px]', staffFilter === s.id ? 'font-semibold' : '')} style={staffFilter === s.id ? { background: 'var(--label)', color: 'var(--surface-secondary)' } : { background: 'var(--surface-secondary)', color: 'var(--label)' }}>
            {s.name}
          </button>
        ))}
      </div>

      {filteredReservations.length === 0 ? (
        <EmptyState title="Nessuna prenotazione" subtitle="Le prenotazioni attive appariranno qui" />
      ) : (
        <div className="flex flex-col gap-3">
          {filteredReservations.map((res) => {
            const isExpanded = expandedId === res.id;
            const items = res.items || [];
            const total = fromCents(items.reduce((acc, curr) => acc + safeNumber(curr.qty) * toCents(curr.unit_price_final), 0));
            return (
              <div key={res.id} className="ios-card overflow-hidden">
                <button onClick={() => setExpandedId(isExpanded ? null : res.id)} className="w-full flex items-center gap-3 p-4 text-left ios-press">
                  <div className="w-11 h-11 rounded-full flex items-center justify-center font-semibold shrink-0" style={{ background: 'var(--label)', color: 'var(--surface-secondary)' }}>
                    {(res.customer_name || 'G').charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="ios-headline text-[16px] truncate">{res.customer_name || 'Generico'}</p>
                    <p className="ios-caption">{items.length} articoli · {res.staff?.name || 'Sistema'} · {new Date(res.created_at).toLocaleDateString('it-IT')}</p>
                  </div>
                  <span className="ios-headline ios-amount">€{total.toFixed(2)}</span>
                  <ChevronDown size={18} className="transition-transform" style={{ transform: isExpanded ? 'rotate(180deg)' : undefined, color: 'var(--label-tertiary)' }} />
                </button>
                <AnimatePresence initial={false}>
                  {isExpanded && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden" style={{ borderTop: '1px solid var(--separator)' }}>
                      <div className="p-4 flex flex-col gap-2.5" style={{ background: 'var(--surface)' }}>
                        {items.map((item) => (
                          <div key={item.id} className="ios-card p-3 flex items-center gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="ios-subhead font-semibold truncate">{item.variant?.model?.name ?? ''}</p>
                              <p className="ios-caption truncate">{item.variant?.flavor?.name ?? ''} · {item.qty} × €{Number(item.unit_price_final).toFixed(2)}</p>
                            </div>
                            <span className="ios-headline ios-amount text-[15px]">€{(Number(item.unit_price_final) * Number(item.qty)).toFixed(2)}</span>
                            <button
                              onClick={() => setEditItem({ itemId: item.id, qty: Number(item.qty), price: Number(item.unit_price_final), modelName: item.variant?.model?.name ?? '', flavorName: item.variant?.flavor?.name ?? '', maxQty: Number(item.qty) + Number(getAvailableQty(item.variant?.id ?? '')) })}
                              className="ios-press ios-footnote px-2.5 py-1.5 rounded-lg" style={{ background: 'var(--accent-tint)', color: 'var(--accent)' }}
                            >
                              Modifica
                            </button>
                            <button onClick={() => handleDeleteItem(item.id)} className="ios-press ios-footnote px-2.5 py-1.5 rounded-lg" style={{ background: 'rgba(255,59,48,0.12)', color: '#C0392B' }}>
                              Rimuovi
                            </button>
                          </div>
                        ))}
                        <button onClick={() => { setAddItemResId(res.id); setSelectedVariant(null); setShowAddItemModal(true); }} className="ios-press flex items-center justify-center gap-2 py-2.5 rounded-xl text-[15px] font-medium" style={{ border: '1.5px dashed var(--separator)', color: 'var(--accent)' }}>
                          <Plus size={17} /> Aggiungi articolo
                        </button>
                        <div className="grid gap-2 mt-1">
                          <button onClick={() => { setPaymentData({ id: res.id, total }); setShowPaymentModal(true); }} disabled={actionLoading === res.id} className="ios-btn ios-btn-filled w-full">
                            {actionLoading === res.id ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <><CheckCircle2 size={18} /> Concludi vendita</>}
                          </button>
                          <button onClick={() => setCancelConfirmId(res.id)} disabled={actionLoading === res.id} className="ios-btn w-full" style={{ background: 'rgba(255,59,48,0.12)', color: '#C0392B' }}>
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

      <ConfirmModal isOpen={!!cancelConfirmId} onClose={() => setCancelConfirmId(null)}
        onConfirm={() => cancelConfirmId && handleAnnulla(cancelConfirmId)}
        title="Annulla prenotazione" message="Lo stock verrà ripristinato." variant="danger"
        confirmLabel="Annulla" loading={actionLoading !== null} />

      <PaymentModal isOpen={showPaymentModal && !!paymentData}
        onClose={() => setShowPaymentModal(false)}
        onConfirm={handleConfirmPayment}
        totalAmount={paymentData?.total ?? 0}
        loading={actionLoading !== null} />

      {/* Sheet aggiunta articolo */}
      <AnimatePresence>
        {showAddItemModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:p-4" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={() => setShowAddItemModal(false)}>
            <motion.div
              initial={{ y: 48 }} animate={{ y: 0 }} exit={{ y: 48 }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="ios-sheet w-full sm:max-w-lg flex flex-col p-5"
              style={{ maxHeight: '85vh' }}
            >
              <div className="ios-grabber" />
              <h3 className="ios-title-3 mt-1 mb-3">Aggiungi articolo</h3>
              <div className="flex-1 overflow-y-auto flex flex-col gap-2 min-h-0 mb-3">
                {filteredVariants.map((v) => {
                  const avail = getAvailableQty(v.id);
                  const sel = selectedVariant?.id === v.id;
                  return (
                    <button key={v.id} onClick={() => { setSelectedVariant(v); setAddQty(1); setAddPrice(Number(v.default_price)); }}
                      className="ios-press flex items-center gap-3 p-3 rounded-2xl text-left"
                      style={sel ? { background: 'var(--accent-tint)', border: '1px solid var(--accent)' } : { background: 'var(--surface-tertiary)' }}>
                      <div className="flex-1 min-w-0">
                        <p className="ios-headline text-[15px] truncate">{v.model?.name}</p>
                        <p className="ios-caption truncate">{v.flavor?.name}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="ios-headline ios-amount text-[15px]">€{Number(v.default_price).toFixed(2)}</p>
                        <Badge variant={avail > 0 ? 'surface' : 'danger'} size="xs">Disp: {avail}</Badge>
                      </div>
                    </button>
                  );
                })}
              </div>
              {selectedVariant && (
                <div className="flex items-center gap-4 py-3" style={{ borderTop: '1px solid var(--separator)' }}>
                  <div className="flex-1">
                    <label className="ios-footnote block mb-1">Quantità</label>
                    <div className="flex items-center gap-3 rounded-xl p-1" style={{ background: 'var(--surface-tertiary)' }}>
                      <button onClick={() => setAddQty(Math.max(1, addQty - 1))} className="ios-press w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'var(--surface-secondary)' }} aria-label="Meno"><Minus size={16} /></button>
                      <span className="flex-1 text-center ios-title-3">{addQty}</span>
                      <button onClick={() => setAddQty(Math.min(getAvailableQty(selectedVariant.id), addQty + 1))} className="ios-press w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'var(--label)', color: 'var(--surface-secondary)' }} aria-label="Più"><Plus size={16} /></button>
                    </div>
                  </div>
                  <div className="flex-1">
                    <label className="ios-footnote block mb-1">Prezzo €</label>
                    <input type="number" step="0.01" value={addPrice} onChange={(e) => setAddPrice(Number(e.target.value))} className="ios-input ios-amount text-center" style={{ fontSize: 20, fontWeight: 700 }} />
                  </div>
                </div>
              )}
              <div className="flex gap-2.5">
                <button onClick={() => setShowAddItemModal(false)} className="ios-btn flex-1" style={{ background: 'var(--surface-tertiary)', color: 'var(--accent)' }}>Chiudi</button>
                <button onClick={handleAddItem} disabled={!selectedVariant || getAvailableQty(selectedVariant.id) <= 0} className="ios-btn ios-btn-filled flex-1">Aggiungi</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sheet modifica articolo */}
      <AnimatePresence>
        {editItem && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={() => setEditItem(null)}>
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="ios-sheet w-full sm:max-w-md p-5 pb-8"
              onClick={e => e.stopPropagation()}
            >
              <div className="ios-grabber" />
              <h4 className="ios-title-3 mt-1">{editItem.modelName}</h4>
              <p className="ios-footnote mb-4">{editItem.flavorName}</p>
              <label className="ios-footnote block mb-1">Quantità (max {editItem.maxQty})</label>
              <div className="flex items-center justify-center gap-6 mb-4">
                <button onClick={() => setEditItem(p => p ? { ...p, qty: Math.max(1, p.qty - 1) } : null)} className="ios-press w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'var(--surface-tertiary)' }} aria-label="Meno"><Minus size={20} /></button>
                <span className="ios-title-large ios-amount">{editItem.qty}</span>
                <button onClick={() => setEditItem(p => (p && p.qty < p.maxQty) ? { ...p, qty: p.qty + 1 } : p)} className="ios-press w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'var(--label)', color: 'var(--surface-secondary)' }} aria-label="Più"><Plus size={20} /></button>
              </div>
              <label className="ios-footnote block mb-1">Prezzo (€)</label>
              <input type="number" step="0.01" value={editItem.price} onChange={e => setEditItem(p => p ? { ...p, price: parseFloat(e.target.value) || 0 } : null)} className="ios-input ios-amount text-center mb-4" style={{ fontSize: 22, fontWeight: 700 }} />
              <div className="grid gap-2">
                <button onClick={() => editItem && handleUpdateQty(editItem.itemId, editItem.qty, editItem.price)} className="ios-btn ios-btn-filled w-full">Salva</button>
                <button onClick={() => setEditItem(null)} className="ios-btn w-full" style={{ background: 'var(--surface-tertiary)', color: 'var(--label-secondary)' }}>Annulla</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
