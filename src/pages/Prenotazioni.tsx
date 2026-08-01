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
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calendar, CheckCircle2, XCircle, Edit3, Clock, User,
  ChevronDown, ChevronUp, Plus, Minus, Trash2, X, Search,
  ArrowUpDown
} from 'lucide-react';
import { clsx } from 'clsx';
import { Badge } from '../components/ui/Badge';
import { GlassCard } from '../components/ui/GlassCard';
import { PaymentModal } from '../components/PaymentModal';
import { PageSkeleton } from '../components/ui/PageSkeleton';

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
      showToast('Vendita completata!', 'success');
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
      setShowAddItemModal(false); fetchData(); fetchVariantsAndInventory();
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
    <PageSkeleton titleClass="w-56 h-10" blocks={[{ count: 1, className: 'h-12' }, { count: 5, className: 'h-28' }]} />
  );

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-3 md:space-y-8 relative z-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-2 md:gap-4">
        <div className="space-y-0.5 md:space-y-2">
          <h1 className="text-2xl md:text-5xl font-black italic tracking-tighter text-white uppercase leading-none">
            Preno<span className="text-primary not-italic">tazioni</span>
          </h1>
          <p className="label-caps text-[9px] md:text-xs text-slate-500 tracking-widest">Gestione ordini ed attese</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={staffFilter} onChange={(e) => setStaffFilter(e.target.value)}
            className="bg-surface-900/80 border border-white/5 text-white font-bold label-caps text-[9px] px-3 py-2 rounded-xl focus:ring-0">
            <option value="all">Tutti</option>
            {staffList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button onClick={() => setDateSort(d => d === 'desc' ? 'asc' : 'desc')}
            className="p-2 bg-surface-900/80 border border-white/5 rounded-xl text-slate-500 hover:text-white transition-all" aria-label="Ordina per data">
            <ArrowUpDown size={16} />
          </button>
          <div className="px-4 py-2 md:px-6 md:py-4 rounded-2xl md:rounded-[2rem] bg-primary/5 border border-primary/20 backdrop-blur-xl shrink-0 flex flex-col items-center">
            <span className="label-caps text-[7px] md:text-[10px] text-primary/70 mb-0.5 block uppercase font-black">In Attesa</span>
            <motion.span key={filteredReservations.length} initial={{ scale: 1.3 }} animate={{ scale: 1 }}
              className="text-2xl md:text-4xl font-black italic tracking-tighter text-white leading-none">
              {filteredReservations.length}
            </motion.span>
          </div>
        </div>
      </div>

      <div className="relative group">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-primary transition-colors" size={14} />
        <input type="text" placeholder="Cerca cliente o staff..." value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-surface-900/80 border border-white/5 rounded-xl py-3 pl-10 pr-4 focus:outline-none focus:border-primary/40 text-sm font-bold italic text-white placeholder:text-slate-700 transition-all" />
      </div>

      <div className="space-y-3">
        {filteredReservations.length > 0 ? filteredReservations.map((res) => {
          const isExpanded = expandedId === res.id;
          const items = res.items || [];
          const total = fromCents(items.reduce((acc, curr) => acc + safeNumber(curr.qty) * toCents(curr.unit_price_final), 0));
          const staffName = res.staff?.name || 'Sistema';

          return (
            <GlassCard key={res.id} glow="primary" className={clsx(isExpanded ? "border-primary/20" : "")}>
              <div onClick={() => setExpandedId(isExpanded ? null : res.id)}
                className="p-4 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer">
                <div className="flex items-center gap-4 md:gap-6">
                  <motion.div whileHover={{ scale: 1.1 }}
                    className="w-12 h-12 md:w-16 md:h-16 rounded-xl md:rounded-[1.5rem] bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-primary shadow-xl">
                    <User size={22} className="md:w-7 md:h-7" />
                  </motion.div>
                  <div>
                    <p className="text-lg md:text-2xl font-black text-white italic tracking-tighter uppercase leading-none">{res.customer_name || 'Generic'}</p>
                    <div className="flex items-center gap-2 mt-1 md:mt-2">
                      <Badge variant="primary" size="sm" className="text-[8px] md:text-[10px]">{items.length} Articoli</Badge>
                      <span className="text-[8px] md:text-[10px] label-caps text-slate-500">By {staffName}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between md:justify-end gap-4 md:gap-6 w-full md:w-auto mt-2 md:mt-0 pt-3 md:pt-0 border-t md:border-t-0 border-white/5">
                  <div className="text-left md:text-right">
                    <p className="text-2xl md:text-3xl font-black text-primary italic tracking-tighter tabular-nums">€{total.toFixed(2)}</p>
                    <div className="flex items-center gap-1.5 justify-start md:justify-end py-1 text-[8px] md:text-[9px] label-caps text-slate-600">
                      <Clock size={10} />{new Date(res.created_at).toLocaleDateString('it-IT')}
                    </div>
                  </div>
                  <div className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center bg-white/5 rounded-full text-slate-600 group-hover:text-primary transition-colors">
                    {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </div>
                </div>
              </div>

              <AnimatePresence>
                {isExpanded && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                    className="bg-black/40 border-t border-white/5 overflow-hidden">
                    <div className="p-4 md:p-8 space-y-6 md:space-y-8">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                        {items.map((item) => (
                          <div key={item.id}
                            className="p-4 md:p-5 rounded-2xl md:rounded-[2rem] bg-gradient-to-br from-white/[0.04] to-white/[0.01] border border-white/5 flex items-center justify-between group/item">
                            <div className="min-w-0 pr-2">
                              <p className="font-black text-white text-sm md:text-base leading-tight uppercase truncate italic">{item.variant?.model?.name ?? ''}</p>
                              <p className="text-[8px] md:text-[10px] label-caps text-slate-600 mt-0.5 md:mt-1 italic uppercase tracking-widest">{item.variant?.flavor?.name ?? ''}</p>
                            </div>
                            <div className="flex items-center gap-3 md:gap-4 shrink-0">
                              <div className="text-right">
                                <p className="text-base md:text-lg font-black text-white italic leading-none mb-1 tabular-nums">€{(item.unit_price_final * item.qty).toFixed(2)}</p>
                                <p className="text-[8px] md:text-[9px] label-caps text-slate-600">{item.qty}pz x €{item.unit_price_final}</p>
                              </div>
                              <div className="flex items-center gap-1.5 md:gap-2">
                                <button onClick={() => setEditItem({
                                  itemId: item.id, qty: item.qty, price: Number(item.unit_price_final),
                                  modelName: item.variant?.model?.name ?? '', flavorName: item.variant?.flavor?.name ?? '',
                                  maxQty: Number(item.qty) + Number(getAvailableQty(item.variant?.id ?? ''))
                                })}
                                  className="p-2 md:p-3 bg-white/5 text-slate-400 hover:text-white rounded-lg md:rounded-xl active:scale-90 transition-all border border-white/5"
                                  aria-label="Modifica"><Edit3 size={14} className="md:w-4 md:h-4" /></button>
                                <button onClick={() => handleDeleteItem(item.id)}
                                  className="p-2 md:p-3 bg-danger/10 hover:bg-danger/20 text-danger rounded-lg md:rounded-xl active:scale-90 transition-all border border-danger/20"
                                  aria-label="Elimina"><Trash2 size={14} className="md:w-4 md:h-4" /></button>
                              </div>
                            </div>
                          </div>
                        ))}
                        <button onClick={() => { setAddItemResId(res.id); setShowAddItemModal(true); }}
                          className="p-5 rounded-[2rem] border-2 border-dashed border-white/5 flex items-center justify-center gap-3 text-slate-500 hover:text-primary hover:border-primary/40 hover:bg-primary/5 transition-all text-sm font-black label-caps">
                          <Plus size={20} /> Aggiungi Articolo
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <motion.button whileTap={{ scale: 0.98 }}
                          onClick={() => { setPaymentData({ id: res.id, total }); setShowPaymentModal(true); }}
                          className="py-6 bg-gradient-to-r from-primary to-primary-dark text-surface-950 font-black rounded-3xl text-xl label-caps shadow-2xl shadow-primary/20 flex items-center justify-center gap-3">
                          <CheckCircle2 size={24} /> Concludi Vendita
                        </motion.button>
                        <motion.button whileTap={{ scale: 0.98 }}
                          onClick={() => setCancelConfirmId(res.id)}
                          disabled={actionLoading === res.id}
                          className="py-6 bg-surface-800 text-danger border border-danger/20 font-black rounded-3xl text-lg label-caps hover:bg-danger/10 transition-all disabled:opacity-50 flex items-center justify-center gap-3">
                          {actionLoading === res.id ? (
                            <div className="w-5 h-5 border-2 border-danger border-t-transparent rounded-full animate-spin" />
                          ) : (<><XCircle size={20} /> Annulla</>)}
                        </motion.button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </GlassCard>
          );
        }) : (
          <EmptyState icon={Calendar} title="Nessuna prenotazione attiva" subtitle="Le prenotazioni appariranno qui" />
        )}
      </div>

      <ConfirmModal isOpen={!!cancelConfirmId} onClose={() => setCancelConfirmId(null)}
        onConfirm={() => cancelConfirmId && handleAnnulla(cancelConfirmId)}
        title="Annulla Prenotazione" message="Lo stock verrà ripristinato." variant="danger"
        confirmLabel="Annulla" loading={actionLoading !== null} />

      {/* Payment Modal */}
      <PaymentModal isOpen={showPaymentModal && !!paymentData}
        onClose={() => setShowPaymentModal(false)}
        onConfirm={handleConfirmPayment}
        totalAmount={paymentData?.total ?? 0}
        loading={actionLoading !== null} />

      {/* Add Item Modal */}
      <AnimatePresence>
        {showAddItemModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-xl p-4">
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
              className="w-full max-w-2xl max-h-[85vh] rounded-[3rem] border border-white/10 shadow-2xl flex flex-col overflow-hidden bg-gradient-to-br from-white/[0.04] to-white/[0.01] backdrop-blur-3xl">
              <div className="p-8 border-b border-white/5 flex items-center justify-between">
                <div><h3 className="text-2xl font-black text-white italic tracking-tighter uppercase">Catalogo Prodotti</h3>
                  <p className="label-caps text-[10px] text-slate-500 mt-1">Scegli la variante da aggiungere</p></div>
                <button onClick={() => setShowAddItemModal(false)} className="p-3 bg-white/5 rounded-full text-slate-500 hover:text-white transition-all" aria-label="Chiudi"><X size={24} /></button>
              </div>
              <div className="p-6 border-b border-white/5">
                <div className="relative group">
                  <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-primary transition-colors" size={20} />
                  <input type="text" placeholder="Cerca prodotto..." value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-surface-950 border border-white/5 rounded-2xl py-5 pl-16 pr-6 focus:outline-none focus:border-primary/40 text-white font-bold italic" />
                </div>
              </div>
              <div className="flex-1 p-6 space-y-3 overflow-y-auto">
                {filteredVariants.map((v) => {
                  const avail = getAvailableQty(v.id);
                  const isSelected = selectedVariant?.id === v.id;
                  return (
                    <button key={v.id} onClick={() => { setSelectedVariant(v); setAddQty(1); setAddPrice(v.default_price); }}
                      className={clsx("w-full p-6 rounded-[2rem] border transition-all text-left flex items-center justify-between group",
                        isSelected ? "bg-primary border-primary p-7" : "bg-white/5 border-white/5 hover:bg-white/10")}>
                      <div className="min-w-0">
                        <p className={clsx("font-black text-xl italic tracking-tighter uppercase truncate", isSelected ? "text-surface-950" : "text-white")}>{v.model?.name}</p>
                        <p className={clsx("label-caps text-[9px] mt-1", isSelected ? "text-surface-950/70" : "text-slate-500")}>{v.flavor?.name}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={clsx("text-2xl font-black italic", isSelected ? "text-surface-950" : "text-primary")}>€{v.default_price}</p>
                        <Badge variant={isSelected ? 'surface' : 'ghost'} size="sm">DISP: {avail}</Badge>
                      </div>
                    </button>
                  );
                })}
              </div>
              {selectedVariant && (
                <div className="p-8 bg-surface-950/50 border-t border-white/5 space-y-6">
                  <div className="flex items-center gap-8">
                    <div className="flex-1">
                      <label className="label-caps text-[9px] text-slate-500 mb-2 block px-1">Quantità</label>
                      <div className="flex items-center gap-4 bg-white/5 p-2 rounded-2xl border border-white/5">
                        <button onClick={() => setAddQty(Math.max(1, addQty - 1))}
                          className="w-12 h-12 flex items-center justify-center bg-white/10 rounded-xl text-white" aria-label="Diminuisci"><Minus size={18} /></button>
                        <span className="flex-1 text-center text-3xl font-black italic">{addQty}</span>
                        <button onClick={() => setAddQty(Math.min(getAvailableQty(selectedVariant.id), addQty + 1))}
                          className="w-12 h-12 flex items-center justify-center bg-primary text-surface-950 rounded-xl" aria-label="Aumenta"><Plus size={18} /></button>
                      </div>
                    </div>
                    <div className="flex-1">
                      <label className="label-caps text-[9px] text-slate-500 mb-2 block px-1">Prezzo €</label>
                      <input type="number" step="0.01" value={addPrice}
                        onChange={(e) => setAddPrice(Number(e.target.value))}
                        className="w-full bg-white/5 border border-white/5 rounded-2xl py-4.5 px-6 text-2xl font-black text-primary italic text-center focus:outline-none focus:border-primary/50" />
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <button onClick={() => setShowAddItemModal(false)}
                      className="flex-1 py-5 rounded-2xl bg-white/5 label-caps text-xs font-black text-slate-500 hover:text-white transition-all">Chiudi</button>
                    <button onClick={handleAddItem} disabled={getAvailableQty(selectedVariant.id) <= 0}
                      className="flex-1 py-5 rounded-2xl bg-primary text-surface-950 label-caps text-base font-black hover:scale-[1.02] active:scale-95 transition-all shadow-xl shadow-primary/20">Conferma Aggiunta</button>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit Item Panel */}
      <AnimatePresence>
        {editItem && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-end justify-center bg-black/80 backdrop-blur-sm" onClick={() => setEditItem(null)}>
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 200 }}
              className="w-full max-w-lg rounded-t-[3rem] border-t border-white/10 p-10 space-y-8 safe-area-bottom shadow-2xl bg-gradient-to-br from-white/[0.06] to-white/[0.01] backdrop-blur-3xl"
              onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-2">
                <div><h4 className="text-2xl font-black italic text-white uppercase tracking-tighter">{editItem.modelName}</h4>
                  <p className="label-caps text-[10px] text-slate-500 mt-1">{editItem.flavorName}</p></div>
                <button onClick={() => setEditItem(null)} className="p-3 bg-white/5 rounded-full text-slate-500 hover:text-white" aria-label="Chiudi"><X size={20} /></button>
              </div>
              <div className="space-y-4">
                <p className="label-caps text-[10px] text-slate-500 text-center">Modifica Quantità</p>
                <div className="flex items-center justify-center gap-10">
                  <button onPointerDown={e => { e.preventDefault(); setEditItem(p => p ? { ...p, qty: Math.max(1, p.qty - 1) } : null); }}
                    className="w-20 h-20 bg-white/5 border border-white/5 rounded-[1.5rem] flex items-center justify-center text-white hover:bg-white/10 active:scale-90 transition-all" aria-label="Diminuisci"><Minus size={32} /></button>
                  <div className="flex flex-col items-center">
                    <span className="text-7xl font-black text-white italic tracking-tighter leading-none">{editItem.qty}</span>
                    <Badge variant="surface" size="sm" className="mt-4">MAX: {editItem.maxQty}</Badge>
                  </div>
                  <button onPointerDown={e => { e.preventDefault(); setEditItem(p => (p && p.qty < p.maxQty) ? { ...p, qty: p.qty + 1 } : p); }}
                    className={clsx("w-20 h-20 rounded-[1.5rem] flex items-center justify-center text-2xl font-bold active:scale-90 transition-all",
                      editItem.qty < editItem.maxQty ? "bg-primary text-surface-950" : "bg-white/5 text-slate-600 opacity-30 cursor-not-allowed")}
                    aria-label="Aumenta"><Plus size={32} /></button>
                </div>
              </div>
              <div className="space-y-2">
                <label className="label-caps text-[10px] text-slate-500 block px-2">Nuovo Prezzo (€)</label>
                <input type="number" step="0.01" value={editItem.price}
                  onChange={e => setEditItem(p => p ? { ...p, price: parseFloat(e.target.value) || 0 } : null)}
                  className="w-full bg-surface-950 border border-white/5 rounded-2xl py-5 px-6 text-3xl font-black text-primary italic text-center focus:outline-none focus:border-primary/50" />
              </div>
              <div className="flex flex-col gap-3">
                <button onClick={() => editItem && handleUpdateQty(editItem.itemId, editItem.qty, editItem.price)}
                  className="w-full py-6 bg-gradient-to-r from-primary to-primary-dark text-surface-950 font-black rounded-3xl text-xl label-caps shadow-2xl shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all">Salva Cambiamenti</button>
                <button onClick={() => setEditItem(null)}
                  className="w-full py-4 text-slate-500 font-bold label-caps text-xs">Annulla</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
