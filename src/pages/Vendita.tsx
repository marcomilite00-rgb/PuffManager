import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { toCents, fromCents, safeNumber } from '../lib/money';
import { getErrorMessage } from '../lib/error';
import { useAuth } from '../context/AuthContext';
import { useRealtime } from '../hooks/useRealtime';
import { useDebounce } from '../hooks/useDebounce';
import { useToast } from '../components/ui/ToastProvider';
import { useLayout } from '../context/LayoutContext';
import type { ProductVariant, Inventory } from '../types/database';
import {
  Plus, Minus, ShoppingCart, User, Trash2, Search, Package,
  X, CreditCard, Calendar, DollarSign
} from 'lucide-react';
import { clsx } from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';
import { PaymentModal } from '../components/PaymentModal';
import { Badge } from '../components/ui/Badge';
import { TiltCard } from '../components/ui/TiltCard';
import { EmptyState } from '../components/ui/EmptyState';
import { PageSkeleton } from '../components/ui/PageSkeleton';

interface CartItem extends ProductVariant { qty: number; price_final: number; }

const getFlavorGradient = (name: string) => {
  const gradients = [
    'from-cyan-500/15 via-blue-500/8 to-transparent',
    'from-emerald-500/15 via-teal-500/8 to-transparent',
    'from-purple-500/15 via-pink-500/8 to-transparent',
    'from-orange-500/15 via-amber-500/8 to-transparent',
    'from-rose-500/15 via-red-500/8 to-transparent',
    'from-indigo-500/15 via-violet-500/8 to-transparent',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return gradients[Math.abs(hash) % gradients.length];
};

export const Vendita: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { setHideMobileHeader } = useLayout();
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [inventory, setInventory] = useState<Inventory[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [cartOpen, _setCartOpen] = useState(false);
  const setCartOpen = useCallback((open: boolean) => {
    _setCartOpen(open);
    setHideMobileHeader(open);
  }, [setHideMobileHeader]);

  const debouncedSearch = useDebounce(search, 200);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    const [variantsRes, inventoryRes] = await Promise.all([
      supabase.from('product_variants').select('*, model:product_models(name), flavor:product_flavors(name)').eq('active', true),
      supabase.from('inventory').select('*'),
    ]);
    if (variantsRes.data) {
      setVariants(variantsRes.data.map((v: ProductVariant & { model?: { name: string }; flavor?: { name: string } }) => ({
        ...v, model_name: v.model?.name ?? '', flavor_name: v.flavor?.name ?? ''
      })));
    }
    if (inventoryRes.data) setInventory(inventoryRes.data);
    setLoading(false);
  };

  useRealtime<Inventory>('inventory', (payload) => {
    if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
      const newData = payload.new as Inventory;
      setInventory(prev => {
        const index = prev.findIndex(i => i.variant_id === newData.variant_id);
        if (index >= 0) { const next = [...prev]; next[index] = newData; return next; }
        return [...prev, newData];
      });
    }
  });

  const filteredVariants = useMemo(() => {
    return variants.filter(v =>
      v.model_name?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      v.flavor_name?.toLowerCase().includes(debouncedSearch.toLowerCase())
    ).sort((a, b) => (a.model_name || '').localeCompare(b.model_name || ''));
  }, [variants, debouncedSearch]);

  const addToCart = useCallback((v: ProductVariant) => {
    const inv = inventory.find(i => i.variant_id === v.id);
    const currentStock = inv ? inv.qty : 0;
    const inCart = cart.find(c => c.id === v.id);
    if ((inCart ? inCart.qty : 0) >= currentStock) {
      showToast('Stock insufficiente!', 'error');
      return;
    }
    setCart(prev => {
      const existing = prev.find(c => c.id === v.id);
      if (existing) return prev.map(c => c.id === v.id ? { ...c, qty: c.qty + 1 } : c);
      return [...prev, { ...v, qty: 1, price_final: v.default_price }];
    });
  }, [cart, inventory, showToast]);

  const removeFromCart = useCallback((id: string) => {
    setCart(prev => {
      const item = prev.find(c => c.id === id);
      if (item && item.qty > 1) return prev.map(c => c.id === id ? { ...c, qty: c.qty - 1 } : c);
      return prev.filter(c => c.id !== id);
    });
  }, []);

  const updateCartPrice = (id: string, price: number) => {
    setCart(prev => prev.map(c => c.id === id ? { ...c, price_final: price } : c));
  };

  const cartTotal = useMemo(() =>
    fromCents(cart.reduce((acc, curr) => acc + safeNumber(curr.qty) * toCents(curr.price_final), 0)),
    [cart]
  );

  const cartCount = useMemo(() => cart.reduce((acc, c) => acc + c.qty, 0), [cart]);

  const handlePaymentConfirmed = async (amount: number) => {
    if (cart.length === 0) return;
    setActionLoading(true);
    setShowPaymentModal(false);
    try {
      const { error } = await supabase.rpc('direct_sale', {
        p_staff_id: user?.id,
        p_customer_name: customerName,
        p_payment_amount: amount,
        p_items: cart.map(c => ({
          variant_id: c.id, qty: c.qty,
          price_default: c.default_price, price_final: c.price_final
        }))
      });
      if (error) throw error;
      setCart([]);
      setCustomerName('');
      showToast('Vendita completata con successo!', 'success');
    } catch (err) {
      showToast(getErrorMessage(err, 'Errore durante la vendita'), 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handlePrenota = async () => {
    if (cart.length === 0) return;
    setActionLoading(true);
    try {
      const { error } = await supabase.rpc('create_reservation', {
        p_staff_id: user?.id,
        p_customer_name: customerName,
        p_items: cart.map(c => ({
          variant_id: c.id, qty: c.qty,
          price_default: c.default_price, price_final: c.price_final
        }))
      });
      if (error) throw error;
      setCart([]);
      setCustomerName('');
      showToast('Prenotazione creata!', 'success');
    } catch (err) {
      showToast(getErrorMessage(err, 'Errore durante la prenotazione'), 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const highlightText = (text: string, query: string) => {
    if (!query) return text;
    const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
    return parts.map((part, i) =>
      part.toLowerCase() === query.toLowerCase()
        ? <span key={i} className="text-primary bg-primary/8 rounded px-0.5 font-black">{part}</span>
        : part
    );
  };

  if (loading) return (
    <PageSkeleton titleClass="w-48 h-10" blocks={[{ count: 1, className: 'h-14' }, { count: 6, className: 'h-44' }]} />
  );

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 md:gap-6">
        <div className="lg:col-span-8 space-y-3 md:space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col gap-0.5">
              <h1 className="text-2xl md:text-5xl font-black italic tracking-tighter text-white uppercase leading-none">
                Vendita<span className="text-primary not-italic">Rapida</span>
              </h1>
              <p className="label-caps text-[9px] md:text-xs text-slate-500 tracking-widest">Seleziona i prodotti</p>
            </div>
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => setCartOpen(true)}
              className="lg:hidden relative p-3 bg-white/5 rounded-xl border border-white/5 hover:border-primary/30 transition-all"
              aria-label="Apri carrello"
            >
              <ShoppingCart size={20} className="text-primary" />
              {cartCount > 0 && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-primary text-surface-950 rounded-full text-[9px] font-black flex items-center justify-center shadow-lg"
                >
                  {cartCount}
                </motion.span>
              )}
            </motion.button>
          </div>

          <div className="relative group">
            <Search className="absolute left-4 md:left-5 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-primary transition-colors" size={16} />
            <input
              type="text" placeholder="Cerca prodotto..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-surface-900/80 border border-white/5 rounded-xl md:rounded-2xl py-3.5 md:py-4.5 pl-12 md:pl-14 pr-4 focus:outline-none focus:border-primary/40 focus:shadow-[0_0_20px_rgba(0,229,255,0.08)] text-white placeholder:text-slate-700 transition-all text-sm md:text-lg italic font-medium"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 max-h-[70vh] overflow-y-auto pr-2">
            {filteredVariants.map((v) => {
              const inv = inventory.find(i => i.variant_id === v.id);
              const qty = inv ? inv.qty : 0;
              const inCart = cart.find(c => c.id === v.id)?.qty || 0;
              const avail = Math.max(qty - inCart, 0);
              const maxStock = inv && inv.initial_load_qty && inv.initial_load_qty > 0
                ? inv.initial_load_qty : (qty > 0 ? qty : 1);
              const stockPercent = Math.min((avail / maxStock) * 100, 100);

              return (
                <TiltCard key={v.id} tiltDegree={6} glare={false} disabled={avail <= 0}>
                  <button
                    onClick={() => avail > 0 && addToCart(v)}
                    disabled={avail <= 0}
                    className={clsx(
                      "relative flex flex-col p-4 md:p-6 rounded-2xl md:rounded-[3rem] border overflow-hidden transition-all duration-300 transform active:scale-95 group w-full text-left",
                      avail <= 0
                        ? "opacity-40 grayscale bg-surface-900 border-white/5 cursor-not-allowed shadow-none"
                        : "bg-gradient-to-br border-white/8 hover:border-primary/30 hover:shadow-[0_20px_40px_rgba(0,0,0,0.4)] shadow-xl",
                      getFlavorGradient(v.flavor_name || '')
                    )}
                  >
                    <div className="flex justify-between items-start z-10">
                      <div className="min-w-0 flex-1 pr-2">
                        <p className="font-black text-base md:text-2xl leading-none uppercase tracking-tighter text-white truncate italic">
                          {highlightText(v.model_name || '', debouncedSearch)}
                        </p>
                        <p className="text-[9px] md:text-sm text-slate-400 font-bold mt-1 md:mt-2 italic uppercase tracking-widest opacity-70 truncate">
                          {highlightText(v.flavor_name || '', debouncedSearch)}
                        </p>
                      </div>
                      <Badge variant={avail === 0 ? 'danger' : avail < 4 ? 'warning' : 'primary'} size="sm" className="px-1.5 py-0">
                        {avail}
                      </Badge>
                    </div>
                    <div className="mt-4 md:mt-8 space-y-2 z-10">
                      <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${stockPercent}%` }}
                          transition={{ duration: 1, ease: 'easeOut' }}
                          className={clsx("h-full rounded-full", avail > 10 ? "bg-success" : avail > 3 ? "bg-warning" : "bg-danger")}
                        />
                      </div>
                      <div className="flex gap-0.5 mt-1">
                        {Array.from({ length: Math.min(maxStock, 20) }).map((_, i) => (
                          <div key={i} className={clsx("h-2 flex-1 rounded-sm", i < avail ? "bg-success" : "bg-white/5")} />
                        ))}
                      </div>
                      <div className="flex justify-between items-center pt-1">
                        <p className="text-xl md:text-4xl font-black text-white italic tracking-tighter leading-none">€{Number(v.default_price).toFixed(0)}</p>
                        <motion.div whileHover={{ rotate: 90 }} className="p-2 md:p-3 rounded-lg md:rounded-2xl bg-white/5 group-hover:bg-primary group-hover:text-surface-950 transition-all border border-white/5">
                          <Plus size={18} className="md:w-6 md:h-6" />
                        </motion.div>
                      </div>
                    </div>
                    <div className="absolute -bottom-4 -right-4 w-24 h-24 bg-white/5 rounded-full blur-2xl group-hover:bg-primary/10 transition-colors" />
                  </button>
                </TiltCard>
              );
            })}
          </div>
        </div>

        {/* Desktop Cart Panel */}
        <div className="hidden lg:flex lg:col-span-4 flex-col gap-6">
          <div className="glass rounded-3xl md:rounded-[4rem] p-5 md:p-10 border-white/5 flex flex-col h-fit md:sticky md:top-10 shadow-2xl bg-surface-950/60 backdrop-blur-3xl">
            <div className="flex items-center gap-4 mb-6 md:mb-10">
              <div className="w-10 h-10 md:w-16 md:h-16 bg-primary/15 rounded-xl md:rounded-2xl flex items-center justify-center text-primary shadow-lg shadow-primary/10">
                <ShoppingCart size={20} className="md:w-8 md:h-8" />
              </div>
              <h2 className="text-xl md:text-3xl font-black italic uppercase tracking-tighter leading-none">Carrello</h2>
              {cartCount > 0 && (
                <span className="px-2 py-0.5 bg-primary/20 text-primary rounded-full text-[9px] font-black">{cartCount}</span>
              )}
            </div>

            <div className="space-y-3 mb-6 md:mb-10">
              <label className="label-caps text-[9px] md:text-[10px] text-slate-500 block px-2 tracking-widest uppercase font-black">
                Cliente <span className="text-danger">*</span>
              </label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-700" size={14} />
                <input type="text" placeholder="Nome o Alias..." value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className={clsx(
                    "w-full bg-surface-950/80 border rounded-xl md:rounded-2xl py-3.5 md:py-4.5 pl-11 md:pl-12 pr-4 focus:outline-none transition-all font-black text-sm md:text-base placeholder:text-slate-800 italic",
                    cart.length > 0 && !customerName.trim() ? "border-danger/40 text-danger" : "border-white/5 text-white focus:border-primary/40"
                  )} />
              </div>
            </div>

            <div className="flex-1 space-y-3 mb-6 md:mb-10 max-h-[40vh] overflow-y-auto pr-1">
              {cart.length > 0 ? cart.map((item) => (
                <motion.div key={item.id} layout initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
                  className="p-4 md:p-6 rounded-2xl md:rounded-[2.5rem] border border-white/5 bg-white/5 space-y-4 group transition-all hover:bg-white/10 hover:border-primary/20">
                  <div className="flex justify-between items-start">
                    <div className="min-w-0 pr-2">
                      <p className="font-black text-white text-sm md:text-lg leading-tight uppercase truncate italic">{item.model_name}</p>
                      <p className="text-[8px] md:text-[10px] label-caps text-slate-500 italic mt-0.5 md:mt-1 uppercase tracking-widest leading-none">{item.flavor_name}</p>
                    </div>
                    <button onClick={() => setCart(prev => prev.filter(c => c.id !== item.id))} className="text-slate-600 hover:text-danger p-2 transition-colors shrink-0" aria-label="Rimuovi">
                      <Trash2 size={18} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center bg-surface-950 rounded-lg md:rounded-xl border border-white/5 p-0.5 overflow-hidden">
                      <button onClick={() => removeFromCart(item.id)} className="p-1.5 md:p-2 hover:bg-white/5 text-slate-500 transition-colors" aria-label="Diminuisci quantità"><Minus size={14} /></button>
                      <span className="w-6 md:w-8 text-center font-black text-primary text-sm md:text-lg">{item.qty}</span>
                      <button onClick={() => addToCart(item)} className="p-1.5 md:p-2 hover:bg-white/5 text-slate-500 transition-colors" aria-label="Aumenta quantità"><Plus size={14} /></button>
                    </div>
                    <div className="flex items-center gap-1.5 md:gap-2 flex-1 max-w-[80px] md:max-w-[120px] bg-surface-950 px-2.5 md:px-4 py-1.5 md:py-2.5 rounded-lg md:rounded-xl border border-white/5">
                      <span className="text-[8px] md:text-[10px] font-black text-slate-600 tracking-tighter uppercase italic">€</span>
                      <input type="number" value={item.price_final || ''}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => updateCartPrice(item.id, e.target.value === '' ? 0 : Number(e.target.value))}
                        className="w-full bg-transparent text-right font-black text-white focus:outline-none text-xs md:text-lg italic" />
                    </div>
                  </div>
                </motion.div>
              )) : (
                <EmptyState icon={Package} title="Nessun articolo" subtitle="Aggiungi prodotti dal catalogo" />
              )}
            </div>

            <div className="pt-6 md:pt-10 border-t border-white/5 space-y-6 md:space-y-10">
              <div className="flex items-end justify-between px-1">
                <span className="label-caps text-[9px] md:text-[10px] text-slate-600 font-bold uppercase tracking-widest italic leading-none">Totale</span>
                <motion.span key={cartTotal} initial={{ scale: 1.2, opacity: 0.5 }} animate={{ scale: 1, opacity: 1 }}
                  className="text-3xl md:text-6xl font-black text-primary italic tracking-tighter leading-none tabular-nums">
                  €{cartTotal.toFixed(2)}
                </motion.span>
              </div>
              <div className="grid grid-cols-1 gap-3 md:gap-5">
                <motion.button
                  whileTap={cart.length > 0 && customerName.trim() ? { scale: 0.98 } : {}}
                  onClick={() => setShowPaymentModal(true)}
                  disabled={cart.length === 0 || !customerName.trim() || actionLoading}
                  className="w-full py-6 md:py-8 bg-gradient-to-r from-primary to-primary-dark text-surface-950 rounded-3xl md:rounded-[2.5rem] font-black text-lg md:text-2xl label-caps shadow-2xl shadow-primary/20 hover:shadow-primary/30 disabled:opacity-30 disabled:grayscale uppercase italic tracking-tighter transition-all flex items-center justify-center gap-3"
                >
                  {actionLoading ? <div className="w-6 h-6 border-4 border-surface-950 border-t-white rounded-full animate-spin" /> : <><CreditCard size={20} /> Incassa Ora</>}
                </motion.button>
                <motion.button
                  whileTap={cart.length > 0 && customerName.trim() ? { scale: 0.98 } : {}}
                  onClick={handlePrenota}
                  disabled={cart.length === 0 || !customerName.trim() || actionLoading}
                  className="w-full py-5 md:py-7 bg-success/10 border border-success/30 text-success rounded-3xl md:rounded-[2.5rem] font-black text-base md:text-xl label-caps hover:bg-success/20 active:scale-95 transition-all disabled:opacity-30 disabled:grayscale uppercase italic tracking-tighter flex items-center justify-center gap-3"
                >
                  <Calendar size={18} /> Crea Prenotazione
                </motion.button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Cart Drawer */}
      <AnimatePresence>
        {cartOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-xl lg:hidden"
            onClick={() => setCartOpen(false)}>
            <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              onClick={(e) => e.stopPropagation()}
              className="absolute right-0 top-0 bottom-0 w-full max-w-md bg-surface-950/95 backdrop-blur-3xl border-l border-white/5 p-6 flex flex-col safe-area-pt safe-area-pb shadow-2xl">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <ShoppingCart size={20} className="text-primary" />
                  <h2 className="text-xl font-black italic uppercase">Carrello</h2>
                  {cartCount > 0 && <span className="px-2 py-0.5 bg-primary/20 text-primary rounded-full text-[9px] font-black">{cartCount}</span>}
                </div>
                <button onClick={() => setCartOpen(false)} className="p-2 text-slate-500 hover:text-white" aria-label="Chiudi carrello"><X size={20} /></button>
              </div>
              <div className="space-y-3 mb-6">
                <label className="label-caps text-[9px] text-slate-500 block px-1">Cliente <span className="text-danger">*</span></label>
                <input type="text" placeholder="Nome o Alias..." value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full bg-surface-900/80 border border-white/5 rounded-xl py-3 px-4 focus:outline-none focus:border-primary/40 text-white font-bold text-sm italic" />
              </div>
              <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                {cart.length > 0 ? cart.map((item) => (
                  <div key={item.id} className="p-4 rounded-2xl border border-white/5 bg-white/5 space-y-3">
                    <div className="flex justify-between items-start">
                      <p className="font-black text-white text-sm uppercase truncate italic">{item.model_name}</p>
                      <button onClick={() => setCart(prev => prev.filter(c => c.id !== item.id))} className="text-slate-600 hover:text-danger shrink-0 ml-2" aria-label="Rimuovi"><Trash2 size={14} /></button>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center bg-surface-950 rounded-lg border border-white/5 p-0.5">
                        <button onClick={() => removeFromCart(item.id)} className="p-1.5 hover:bg-white/5 text-slate-500"><Minus size={12} /></button>
                        <span className="w-6 text-center font-black text-primary text-sm">{item.qty}</span>
                        <button onClick={() => addToCart(item)} className="p-1.5 hover:bg-white/5 text-slate-500"><Plus size={12} /></button>
                      </div>
                      <div className="flex items-center gap-1 bg-surface-950 px-2 py-1.5 rounded-lg border border-white/5">
                        <span className="text-[8px] font-black text-slate-600">€</span>
                        <input type="number" value={item.price_final || ''} onFocus={(e) => e.target.select()}
                          onChange={(e) => updateCartPrice(item.id, e.target.value === '' ? 0 : Number(e.target.value))}
                          className="w-16 bg-transparent text-right font-black text-white focus:outline-none text-xs italic" />
                      </div>
                    </div>
                  </div>
                )) : (
                  <EmptyState icon={Package} title="Carrello vuoto" />
                )}
              </div>
              <div className="pt-6 border-t border-white/5 space-y-4 mt-4">
                <div className="flex items-center justify-between px-1">
                  <span className="label-caps text-[9px] text-slate-600 font-bold">Totale</span>
                  <motion.span key={cartTotal} initial={{ scale: 1.1 }} animate={{ scale: 1 }}
                    className="text-2xl font-black text-primary italic tabular-nums">€{cartTotal.toFixed(2)}</motion.span>
                </div>
                <motion.button whileTap={{ scale: 0.95 }}
                  onClick={() => { setCartOpen(false); setShowPaymentModal(true); }}
                  disabled={cart.length === 0 || !customerName.trim() || actionLoading}
                  className="w-full py-4 bg-gradient-to-r from-primary to-primary-dark text-surface-950 rounded-2xl font-black text-base shadow-xl disabled:opacity-30 flex items-center justify-center gap-2">
                  <DollarSign size={18} /> Incassa Ora
                </motion.button>
                <motion.button whileTap={{ scale: 0.95 }}
                  onClick={() => { handlePrenota(); setCartOpen(false); }}
                  disabled={cart.length === 0 || !customerName.trim() || actionLoading}
                  className="w-full py-3 bg-success/10 border border-success/30 text-success rounded-2xl font-black text-sm disabled:opacity-30 flex items-center justify-center gap-2">
                  <Calendar size={16} /> Crea Prenotazione
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <PaymentModal isOpen={showPaymentModal} onClose={() => setShowPaymentModal(false)}
        onConfirm={handlePaymentConfirmed} totalAmount={cartTotal} />
    </motion.div>
  );
};
