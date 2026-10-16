import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { toCents, fromCents, safeNumber } from '../lib/money';
import { getErrorMessage } from '../lib/error';
import { useAuth } from '../context/AuthContext';
import { useRealtime } from '../hooks/useRealtime';
import { useDebounce } from '../hooks/useDebounce';
import { useToast } from '../components/ui/ToastProvider';
import type { ProductVariant, Inventory } from '../types/database';
import { Plus, Minus, ShoppingCart, Search, X, Trash2, Loader2, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { PaymentModal } from '../components/PaymentModal';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { PageSkeleton } from '../components/ui/PageSkeleton';
import { cn } from '../lib/cn';

interface CartItem extends ProductVariant {
  qty: number;
  price_final: number;
}

export const Vendita: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [inventory, setInventory] = useState<Inventory[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [search, setSearch] = useState('');
  const [selectedModel, setSelectedModel] = useState('Tutti');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);

  const debouncedSearch = useDebounce(search, 200);

  const fetchData = async () => {
    const [variantsRes, inventoryRes] = await Promise.all([
      supabase
        .from('product_variants')
        .select('*, model:product_models(name), flavor:product_flavors(name)')
        .eq('active', true),
      supabase.from('inventory').select('*'),
    ]);
    if (variantsRes.data) {
      setVariants(
        variantsRes.data.map(
          (v: ProductVariant & { model?: { name: string }; flavor?: { name: string } }) => ({
            ...v,
            model_name: v.model?.name ?? '',
            flavor_name: v.flavor?.name ?? '',
          })
        )
      );
    }
    if (inventoryRes.data) setInventory(inventoryRes.data);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  useRealtime<Inventory>('inventory', (payload) => {
    if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
      const newData = payload.new as Inventory;
      setInventory((prev) => {
        const index = prev.findIndex((i) => i.variant_id === newData.variant_id);
        if (index >= 0) {
          const next = [...prev];
          next[index] = newData;
          return next;
        }
        return [...prev, newData];
      });
    }
  });

  const modelList = useMemo(() => {
    const set = new Set<string>();
    variants.forEach((v) => {
      if (v.model_name) set.add(v.model_name);
    });
    return ['Tutti', ...Array.from(set).sort()];
  }, [variants]);

  const filteredVariants = useMemo(() => {
    return variants
      .filter((v) => {
        const matchesSearch =
          v.model_name?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
          v.flavor_name?.toLowerCase().includes(debouncedSearch.toLowerCase());
        const matchesCategory =
          selectedModel === 'Tutti' || v.model_name === selectedModel;
        return matchesSearch && matchesCategory;
      })
      .sort((a, b) => (a.model_name || '').localeCompare(b.model_name || ''));
  }, [variants, debouncedSearch, selectedModel]);

  const addToCart = useCallback(
    (v: ProductVariant) => {
      const inv = inventory.find((i) => i.variant_id === v.id);
      const currentStock = inv ? inv.qty : 0;
      const inCart = cart.find((c) => c.id === v.id);
      if ((inCart ? inCart.qty : 0) >= currentStock) {
        showToast('Stock insufficiente', 'error');
        return;
      }
      setCart((prev) => {
        const existing = prev.find((c) => c.id === v.id);
        if (existing) {
          return prev.map((c) => (c.id === v.id ? { ...c, qty: c.qty + 1 } : c));
        }
        return [...prev, { ...v, qty: 1, price_final: v.default_price }];
      });
    },
    [cart, inventory, showToast]
  );

  const changeQty = useCallback((id: string, delta: number) => {
    setCart((prev) => {
      const item = prev.find((c) => c.id === id);
      if (!item) return prev;
      const next = item.qty + delta;
      if (next <= 0) return prev.filter((c) => c.id !== id);
      return prev.map((c) => (c.id === id ? { ...c, qty: next } : c));
    });
  }, []);

  const updateCartPrice = (id: string, price: number) => {
    setCart((prev) =>
      prev.map((c) => (c.id === id ? { ...c, price_final: price } : c))
    );
  };

  const cartTotal = useMemo(
    () =>
      fromCents(
        cart.reduce(
          (acc, curr) =>
            acc + safeNumber(curr.qty) * toCents(curr.price_final),
          0
        )
      ),
    [cart]
  );

  const cartCount = useMemo(
    () => cart.reduce((acc, c) => acc + c.qty, 0),
    [cart]
  );

  const handlePaymentConfirmed = async (amount: number) => {
    if (cart.length === 0) return;
    setActionLoading(true);
    setShowPaymentModal(false);
    try {
      const { error } = await supabase.rpc('direct_sale', {
        p_staff_id: user?.id,
        p_customer_name: customerName,
        p_payment_amount: amount,
        p_items: cart.map((c) => ({
          variant_id: c.id,
          qty: c.qty,
          price_default: c.default_price,
          price_final: c.price_final,
        })),
      });
      if (error) throw error;
      setCart([]);
      setCustomerName('');
      setCartOpen(false);
      showToast('Vendita completata con successo', 'success');
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
        p_items: cart.map((c) => ({
          variant_id: c.id,
          qty: c.qty,
          price_default: c.default_price,
          price_final: c.price_final,
        })),
      });
      if (error) throw error;
      setCart([]);
      setCustomerName('');
      setCartOpen(false);
      showToast('Prenotazione creata con successo', 'success');
    } catch (err) {
      showToast(getErrorMessage(err, 'Errore durante la prenotazione'), 'error');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <PageSkeleton
        titleClass="w-56 h-10"
        blocks={[
          { count: 1, className: 'h-12' },
          { count: 6, className: 'h-32' },
        ]}
      />
    );
  }

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6">
      {/* ── Top Header & Hero ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="spatial-chip spatial-chip-blue text-[11px] py-0.5">
              <Sparkles size={11} /> Terminale Cassa
            </span>
            <span className="spatial-caption text-white/50">
              {variants.length} Articoli
            </span>
          </div>
          <h1 className="spatial-title text-2xl sm:text-3xl font-semibold text-white">
            Vendita Rapida
          </h1>
        </div>

        {/* Search Bar */}
        <div className="spatial-search w-full sm:w-80">
          <Search size={18} className="text-white/40 shrink-0" />
          <input
            type="search"
            placeholder="Cerca modello o gusto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Cerca prodotto"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="text-white/40 hover:text-white"
              aria-label="Pulisci ricerca"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* ── Segmented Navigation (Style Stanze/Categories) ── */}
      <div className="spatial-segmented">
        {modelList.map((model) => {
          const isActive = selectedModel === model;
          return (
            <button
              key={model}
              type="button"
              onClick={() => setSelectedModel(model)}
              className={cn(
                'spatial-segmented-item',
                isActive && 'spatial-segmented-item-active'
              )}
            >
              {model}
            </button>
          );
        })}
      </div>

      {/* ── Product Catalog (2-Column Grid on Mobile, 3-4 on Tablet/Desktop) ── */}
      {filteredVariants.length === 0 ? (
        <EmptyState
          title="Nessun prodotto trovato"
          subtitle="Prova a selezionare un'altra categoria o modificare la parola chiave cercata"
        />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          {filteredVariants.map((v) => {
            const inv = inventory.find((i) => i.variant_id === v.id);
            const qty = inv ? inv.qty : 0;
            const inCart = cart.find((c) => c.id === v.id)?.qty || 0;
            const avail = Math.max(qty - inCart, 0);
            const isOutOfStock = avail <= 0;

            return (
              <div
                key={v.id}
                className={cn(
                  'spatial-tile relative flex flex-col justify-between group transition-all duration-200',
                  isOutOfStock
                    ? 'opacity-40 grayscale pointer-events-none'
                    : 'hover:border-white/30 hover:shadow-xl'
                )}
              >
                <div>
                  <div className="flex items-center justify-between gap-1 mb-1.5">
                    <span className="spatial-caption text-[10px] text-white/50 truncate">
                      {v.model_name}
                    </span>
                    <Badge
                      variant={avail === 0 ? 'danger' : avail < 4 ? 'warning' : 'success'}
                      size="xs"
                    >
                      {avail} pz
                    </Badge>
                  </div>
                  <h3 className="spatial-headline text-[15px] sm:text-[16px] text-white font-semibold line-clamp-2 leading-tight">
                    {v.flavor_name}
                  </h3>
                </div>

                <div className="flex items-center justify-between gap-2 mt-4 pt-3 border-t border-white/10">
                  <span className="spatial-amount text-base sm:text-lg font-bold text-white">
                    €{Number(v.default_price).toFixed(2)}
                  </span>
                  <button
                    type="button"
                    onClick={() => !isOutOfStock && addToCart(v)}
                    disabled={isOutOfStock}
                    className="w-9 h-9 rounded-full bg-[#0A84FF] hover:bg-[#0070E0] active:scale-95 text-white flex items-center justify-center shadow-[0_0_12px_rgba(10,132,255,0.45)] transition-all shrink-0 focus-visible:outline-none"
                    aria-label={`Aggiungi ${v.model_name} ${v.flavor_name} al carrello`}
                  >
                    <Plus size={18} strokeWidth={2.5} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Floating Cart Bar Above Dock ── */}
      <AnimatePresence>
        {cart.length > 0 && !cartOpen && (
          <motion.div
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 60, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className="fixed left-4 right-4 z-40 max-w-lg mx-auto"
            style={{
              bottom: 'calc(env(safe-area-inset-bottom, 0px) + 78px)',
            }}
          >
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              className="w-full h-14 px-5 rounded-full spatial-panel-strong border border-white/30 flex items-center justify-between text-white shadow-2xl transition-transform active:scale-98"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-[#0A84FF] text-white flex items-center justify-center font-bold text-sm shadow-[0_0_12px_rgba(10,132,255,0.6)]">
                  <ShoppingCart size={17} />
                </div>
                <div className="text-left">
                  <p className="text-sm font-semibold leading-tight">
                    {cartCount} {cartCount === 1 ? 'articolo' : 'articoli'}
                  </p>
                  <p className="spatial-caption text-[10px] text-white/50">
                    Tocca per concludere
                  </p>
                </div>
              </div>
              <span className="spatial-amount text-lg font-bold text-white">
                €{cartTotal.toFixed(2)}
              </span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Cart Drawer / Sheet ── */}
      <AnimatePresence>
        {cartOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] flex items-end justify-center bg-black/60 backdrop-blur-md"
            onClick={() => setCartOpen(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 320 }}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="cart-sheet-title"
              className="spatial-sheet w-full sm:max-w-lg flex flex-col p-6 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+24px)]"
              style={{ maxHeight: '90dvh' }}
            >
              <div className="spatial-grabber" />

              <div className="flex items-center justify-between pb-3 mb-2 border-b border-white/10">
                <div>
                  <h2
                    id="cart-sheet-title"
                    className="spatial-headline text-lg font-semibold text-white"
                  >
                    Riepilogo Carrello
                  </h2>
                  <p className="spatial-caption text-white/50">
                    {cartCount} {cartCount === 1 ? 'pezzo' : 'pezzi'} nel carrello
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setCartOpen(false)}
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white transition-colors"
                  aria-label="Chiudi carrello"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Customer Name Field */}
              <div className="py-2">
                <label
                  htmlFor="cart-customer-input"
                  className="spatial-caption block mb-1 text-white/60 font-semibold"
                >
                  Nome Cliente (Obbligatorio) *
                </label>
                <input
                  id="cart-customer-input"
                  type="text"
                  placeholder="Inserisci nome cliente o riferimento"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className={cn(
                    'w-full px-4 py-3 rounded-2xl bg-white/10 border text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-[#0A84FF]/40 text-base transition-all',
                    !customerName.trim() && cart.length > 0
                      ? 'border-[#FF9F0A]/50'
                      : 'border-white/15 focus:border-[#0A84FF]'
                  )}
                />
              </div>

              {/* Cart Items List */}
              <div className="flex-1 overflow-y-auto my-3 space-y-2.5 pr-1">
                {cart.length === 0 ? (
                  <EmptyState title="Carrello vuoto" subtitle="Aggiungi qualche prodotto dal catalogo" />
                ) : (
                  cart.map((item) => (
                    <div
                      key={item.id}
                      className="spatial-subpanel p-3.5 flex flex-col gap-2.5"
                    >
                      <div className="flex justify-between items-start gap-2">
                        <div className="min-w-0">
                          <p className="spatial-caption text-[10px] text-white/50 truncate">
                            {item.model_name}
                          </p>
                          <p className="spatial-headline text-sm text-white font-semibold truncate">
                            {item.flavor_name}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setCart((prev) => prev.filter((c) => c.id !== item.id))
                          }
                          className="p-1 rounded-full text-white/40 hover:text-[#FF453A] hover:bg-[#FF453A]/10 transition-colors"
                          aria-label={`Rimuovi ${item.flavor_name}`}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>

                      {/* Stepper + Price Input */}
                      <div className="flex items-center justify-between gap-3 pt-2 border-t border-white/5">
                        <div className="flex items-center gap-2 bg-white/10 rounded-full p-1 border border-white/10">
                          <button
                            type="button"
                            onClick={() => changeQty(item.id, -1)}
                            className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 flex items-center justify-center text-white transition-all"
                            aria-label="Diminuisci quantità"
                          >
                            <Minus size={13} />
                          </button>
                          <span className="spatial-amount text-sm font-semibold w-6 text-center text-white">
                            {item.qty}
                          </span>
                          <button
                            type="button"
                            onClick={() => addToCart(item)}
                            className="w-7 h-7 rounded-full bg-[#0A84FF] active:scale-95 flex items-center justify-center text-white shadow-[0_0_8px_rgba(10,132,255,0.5)] transition-all"
                            aria-label="Aumenta quantità"
                          >
                            <Plus size={13} />
                          </button>
                        </div>

                        {/* Editable Price */}
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 border border-white/10">
                          <span className="text-xs text-white/50">€</span>
                          <input
                            type="number"
                            step="0.01"
                            value={item.price_final || ''}
                            onFocus={(e) => e.target.select()}
                            onChange={(e) =>
                              updateCartPrice(
                                item.id,
                                e.target.value === '' ? 0 : Number(e.target.value)
                              )
                            }
                            className="spatial-amount bg-transparent text-right font-semibold text-white focus:outline-none w-16 text-sm"
                            aria-label={`Prezzo per ${item.flavor_name}`}
                          />
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Cart Footer */}
              <div className="pt-3 border-t border-white/10">
                <div className="flex items-center justify-between mb-4">
                  <span className="spatial-subhead text-sm text-white/60">
                    Totale Complessivo
                  </span>
                  <span className="spatial-amount text-2xl font-bold text-white tracking-tight">
                    €{cartTotal.toFixed(2)}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setShowPaymentModal(true)}
                    disabled={cart.length === 0 || !customerName.trim() || actionLoading}
                    className="spatial-btn-primary h-12 text-sm font-semibold flex items-center justify-center shadow-lg"
                  >
                    {actionLoading ? (
                      <Loader2 size={18} className="animate-spin text-black" />
                    ) : (
                      'Incassa ora'
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={handlePrenota}
                    disabled={cart.length === 0 || !customerName.trim() || actionLoading}
                    className="h-12 rounded-full font-semibold text-sm flex items-center justify-center bg-[#30D158]/20 border border-[#30D158]/40 text-[#30D158] hover:bg-[#30D158]/30 active:scale-98 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Crea prenotazione
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Payment Modal */}
      <PaymentModal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        onConfirm={handlePaymentConfirmed}
        totalAmount={cartTotal}
        loading={actionLoading}
      />
    </div>
  );
};
