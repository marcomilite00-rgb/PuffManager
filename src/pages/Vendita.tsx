import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { toCents, fromCents, safeNumber } from '../lib/money';
import { getErrorMessage } from '../lib/error';
import { useAuth } from '../context/AuthContext';
import { useRealtime } from '../hooks/useRealtime';
import { useDebounce } from '../hooks/useDebounce';
import { useToast } from '../components/ui/ToastProvider';
import type { ProductVariant, Inventory } from '../types/database';
import { Plus, Minus, ShoppingCart, Search, X, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { PaymentModal } from '../components/PaymentModal';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { PageSkeleton } from '../components/ui/PageSkeleton';

interface CartItem extends ProductVariant { qty: number; price_final: number; }

export const Vendita: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [inventory, setInventory] = useState<Inventory[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);

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
      showToast('Stock insufficiente', 'error');
      return;
    }
    setCart(prev => {
      const existing = prev.find(c => c.id === v.id);
      if (existing) return prev.map(c => c.id === v.id ? { ...c, qty: c.qty + 1 } : c);
      return [...prev, { ...v, qty: 1, price_final: v.default_price }];
    });
  }, [cart, inventory, showToast]);

  const changeQty = useCallback((id: string, delta: number) => {
    setCart(prev => {
      const item = prev.find(c => c.id === id);
      if (!item) return prev;
      const next = item.qty + delta;
      if (next <= 0) return prev.filter(c => c.id !== id);
      return prev.map(c => c.id === id ? { ...c, qty: next } : c);
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
      setCartOpen(false);
      showToast('Vendita completata', 'success');
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
      setCartOpen(false);
      showToast('Prenotazione creata', 'success');
    } catch (err) {
      showToast(getErrorMessage(err, 'Errore durante la prenotazione'), 'error');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return (
    <PageSkeleton titleClass="w-48 h-9" blocks={[{ count: 1, className: 'h-12' }, { count: 5, className: 'h-[72px]' }]} />
  );

  return (
    <div className="ios-page">
      <div className="orizon-hero p-6 md:p-8">
        <p className="ios-caption" style={{ color: 'rgba(255,248,238,0.7)' }}>Punto vendita</p>
        <h1 className="ios-title-large mt-1" style={{ color: '#FFF8EE' }}>Vendi<br />in un tocco</h1>
        <div className="flex items-end justify-between gap-3 mt-4">
          <p className="ios-subhead" style={{ color: 'rgba(255,248,238,0.8)' }}>
            {variants.length} prodotti · {cartCount > 0 ? `${cartCount} nel carrello` : 'tocca + per aggiungere'}
          </p>
          {cart.length > 0 && (
            <button onClick={() => setCartOpen(true)} className="orizon-circle-btn" style={{ background: '#FFF8EE', color: '#241A38' }} aria-label="Apri carrello">
              <ShoppingCart size={20} />
            </button>
          )}
        </div>
      </div>

      <div className="ios-search">
        <Search size={18} style={{ color: 'var(--label-tertiary)', flexShrink: 0 }} />
        <input type="search" placeholder="Cerca modello o gusto" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Cerca prodotto" />
        {search && (
          <button onClick={() => setSearch('')} className="ios-press" aria-label="Pulisci ricerca" style={{ color: 'var(--label-tertiary)' }}>
            <X size={16} />
          </button>
        )}
      </div>

      <div className="ios-grouped">
        {filteredVariants.length === 0 && (
          <div className="p-5"><EmptyState title="Nessun prodotto" subtitle="Prova a modificare la ricerca" /></div>
        )}
        {filteredVariants.map((v) => {
          const inv = inventory.find(i => i.variant_id === v.id);
          const qty = inv ? inv.qty : 0;
          const inCart = cart.find(c => c.id === v.id)?.qty || 0;
          const avail = Math.max(qty - inCart, 0);
          return (
            <div key={v.id} className="ios-row" style={{ minHeight: 68 }}>
              <div className="flex-1 min-w-0">
                <p className="ios-headline text-[16px] truncate">{v.model_name}</p>
                <p className="ios-caption truncate">{v.flavor_name}</p>
                <p className="ios-subhead ios-amount mt-0.5">€{Number(v.default_price).toFixed(2)}</p>
              </div>
              <Badge variant={avail === 0 ? 'danger' : avail < 4 ? 'warning' : 'surface'} size="sm">{avail}</Badge>
              <button
                onClick={() => avail > 0 && addToCart(v)}
                disabled={avail <= 0}
                className="ios-press rounded-full flex items-center justify-center disabled:opacity-30"
                style={{ width: 34, height: 34, background: 'var(--accent-tint)', color: 'var(--accent)' }}
                aria-label={`Aggiungi ${v.model_name} ${v.flavor_name}`}
              >
                <Plus size={18} />
              </button>
            </div>
          );
        })}
      </div>

      {/* Barra carrello */}
      <AnimatePresence>
        {cart.length > 0 && !cartOpen && (
          <motion.button
            initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
            onClick={() => setCartOpen(true)}
            className="ios-press fixed left-4 right-4 bottom-24 md:bottom-8 z-40 ios-btn ios-btn-filled"
            style={{ boxShadow: 'var(--ios-shadow-md)' }}
          >
            <ShoppingCart size={18} />
            Vedi carrello · {cartCount} · €{cartTotal.toFixed(2)}
          </motion.button>
        )}
      </AnimatePresence>

      {/* Sheet carrello unificato */}
      <AnimatePresence>
        {cartOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.4)' }}
            onClick={() => setCartOpen(false)}>
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="ios-sheet w-full sm:max-w-lg flex flex-col"
              style={{ maxHeight: '88vh' }}
            >
              <div className="ios-grabber" />
              <div className="flex items-center justify-between px-5 pb-1">
                <h2 className="ios-title-3">Carrello {cartCount > 0 && <span className="ios-footnote">· {cartCount} pz</span>}</h2>
                <button onClick={() => setCartOpen(false)} className="ios-press p-2 -mr-2" style={{ color: 'var(--accent)' }} aria-label="Chiudi carrello">
                  <X size={22} />
                </button>
              </div>
              <div className="px-5 py-3">
                <label className="ios-footnote block mb-1.5">Cliente *</label>
                <input
                  type="text" placeholder="Nome o alias" value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="ios-input"
                />
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-1 space-y-2.5">
                {cart.length === 0 && <EmptyState title="Carrello vuoto" />}
                {cart.map((item) => (
                  <div key={item.id} className="ios-card p-3.5">
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0">
                        <p className="ios-headline text-[15px] truncate">{item.model_name}</p>
                        <p className="ios-caption truncate">{item.flavor_name}</p>
                      </div>
                      <button onClick={() => setCart(prev => prev.filter(c => c.id !== item.id))} className="ios-press p-1.5" style={{ color: '#FF3B30' }} aria-label="Rimuovi">
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <div className="flex items-center justify-between gap-3 mt-2.5">
                      <div className="flex items-center gap-3 rounded-xl px-1 py-1" style={{ background: 'var(--surface-tertiary)' }}>
                        <button onClick={() => changeQty(item.id, -1)} className="ios-press w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--surface-secondary)' }} aria-label="Diminuisci"><Minus size={15} /></button>
                        <span className="ios-headline text-[15px] w-5 text-center">{item.qty}</span>
                        <button onClick={() => addToCart(item)} className="ios-press w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--label)', color: 'var(--surface-secondary)' }} aria-label="Aumenta"><Plus size={15} /></button>
                      </div>
                      <div className="flex items-center gap-1 rounded-xl px-3 py-2" style={{ background: 'var(--surface-tertiary)' }}>
                        <span className="ios-caption">€</span>
                        <input type="number" value={item.price_final || ''}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => updateCartPrice(item.id, e.target.value === '' ? 0 : Number(e.target.value))}
                          className="ios-amount bg-transparent text-right font-semibold focus:outline-none w-16" style={{ fontSize: 16 }} aria-label="Prezzo" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-5 pt-3 pb-6" style={{ borderTop: '1px solid var(--separator)', paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}>
                <div className="flex items-center justify-between mb-3">
                  <span className="ios-footnote">Totale</span>
                  <span className="ios-title-1 ios-amount">€{cartTotal.toFixed(2)}</span>
                </div>
                <div className="grid gap-2">
                  <button onClick={() => setShowPaymentModal(true)} disabled={cart.length === 0 || !customerName.trim() || actionLoading} className="ios-btn ios-btn-filled w-full">
                    {actionLoading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Incassa ora'}
                  </button>
                  <button onClick={handlePrenota} disabled={cart.length === 0 || !customerName.trim() || actionLoading} className="ios-btn w-full" style={{ background: 'rgba(52,199,89,0.12)', color: '#248A3D' }}>
                    Crea prenotazione
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <PaymentModal isOpen={showPaymentModal} onClose={() => setShowPaymentModal(false)}
        onConfirm={handlePaymentConfirmed} totalAmount={cartTotal} loading={actionLoading} />
    </div>
  );
};
