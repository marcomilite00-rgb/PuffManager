import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { toCents, fromCents, safeNumber } from '../lib/money';
import { useAuth } from '../context/AuthContext';
import { useRealtime } from '../hooks/useRealtime';
import type { ProductVariant, Inventory } from '../types/database';
import {
    Plus,
    Minus,
    ShoppingCart,
    Calendar,
    User,
    Trash2,
    CheckCircle2,
    Search
} from 'lucide-react';
import { clsx } from 'clsx';
import { PaymentModal } from '../components/PaymentModal';

interface CartItem extends ProductVariant {
    qty: number;
    price_final: number;
}

export const Vendita: React.FC = () => {
    const { user } = useAuth();
    const [variants, setVariants] = useState<ProductVariant[]>([]);
    const [inventory, setInventory] = useState<Inventory[]>([]);
    const [cart, setCart] = useState<CartItem[]>([]);
    const [customerName, setCustomerName] = useState('');
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);

    // Payment Modal State
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [paymentAmount, setPaymentAmount] = useState('');

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        const [variantsRes, inventoryRes] = await Promise.all([
            supabase
                .from('product_variants')
                .select('*, model:product_models(name), flavor:product_flavors(name)')
                .eq('active', true),
            supabase
                .from('inventory')
                .select('*'),
        ]);

        if (variantsRes.data) {
            setVariants(variantsRes.data.map((v: any) => ({
                ...v,
                model_name: v.model.name,
                flavor_name: v.flavor.name
            })));
        }
        if (inventoryRes.data) setInventory(inventoryRes.data);
        setLoading(false);
    };

    useRealtime<Inventory>('inventory', (payload: any) => {
        if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
            const newData = payload.new as Inventory;
            setInventory(prev => {
                const index = prev.findIndex(i => i.variant_id === newData.variant_id);
                if (index >= 0) {
                    const next = [...prev];
                    next[index] = newData;
                    return next;
                }
                return [...prev, newData];
            });
        }
    });

    const filteredVariants = useMemo(() => {
        return variants.filter(v =>
            v.model_name?.toLowerCase().includes(search.toLowerCase()) ||
            v.flavor_name?.toLowerCase().includes(search.toLowerCase())
        ).sort((a, b) => a.model_name!.localeCompare(b.model_name!));
    }, [variants, search]);

    const addToCart = (v: ProductVariant) => {
        const inv = inventory.find(i => i.variant_id === v.id);
        const currentStock = inv ? inv.qty : 0;
        const inCart = cart.find(c => c.id === v.id);

        if ((inCart ? inCart.qty : 0) >= currentStock) {
            alert('Stock insufficiente!');
            return;
        }

        if (inCart) {
            setCart(cart.map(c => c.id === v.id ? { ...c, qty: c.qty + 1 } : c));
        } else {
            setCart([...cart, { ...v, qty: 1, price_final: v.default_price }]);
        }
    };

    const removeFromCart = (id: string) => {
        const item = cart.find(c => c.id === id);
        if (item && item.qty > 1) {
            setCart(cart.map(c => c.id === id ? { ...c, qty: c.qty - 1 } : c));
        } else {
            setCart(cart.filter(c => c.id !== id));
        }
    };

    const updateCartPrice = (id: string, price: number) => {
        setCart(cart.map(c => c.id === id ? { ...c, price_final: price } : c));
    };

    const cartTotal = fromCents(cart.reduce((acc, curr) => acc + safeNumber(curr.qty) * toCents(curr.price_final), 0));

    const handleIncassaClick = () => {
        if (cart.length === 0) return;
        setPaymentAmount(''); // Reset
        setShowPaymentModal(true);
    };

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
                    variant_id: c.id,
                    qty: c.qty,
                    price_default: c.default_price,
                    price_final: c.price_final
                }))
            });

            if (error) throw error;
            setCart([]);
            setCustomerName('');
            alert('Vendita completata!');
        } catch (err: any) {
            alert(err.message || 'Errore durante la vendita');
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
                    variant_id: c.id,
                    qty: c.qty,
                    price_default: c.default_price,
                    price_final: c.price_final
                }))
            });

            if (error) throw error;
            setCart([]);
            setCustomerName('');
            alert('Prenotazione creata!');
        } catch (err: any) {
            alert(err.message || 'Errore durante la prenotazione');
        } finally {
            setActionLoading(false);
        }
    };

    if (loading) return (
        <div className="flex items-center justify-center min-h-[60vh]">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
    );

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Selection Area */}
                <div className="lg:col-span-8 space-y-4 md:space-y-6">
                    <div className="flex flex-col gap-1">
                        <h1 className="text-2xl md:text-3xl font-black tracking-tight uppercase">Vendita Rapida</h1>
                        <p className="text-sm text-slate-500 font-bold uppercase tracking-widest">Seleziona i prodotti</p>
                    </div>

                    <div className="relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                        <input
                            type="text"
                            placeholder="Cerca prodotto..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full bg-slate-900 border border-white/10 rounded-2xl py-3.5 md:py-4 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-primary/50 text-base md:text-lg"
                        />
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3 md:gap-4 max-h-[60vh] md:max-h-[80vh] overflow-y-auto pr-1 md:pr-2 custom-scrollbar">
                        {filteredVariants.map((v) => {
                            const inv = inventory.find(i => i.variant_id === v.id);
                            const qty = inv ? inv.qty : 0;
                            const inCart = cart.find(c => c.id === v.id)?.qty || 0;
                            const avail = qty - inCart;

                            return (
                                <button
                                    key={v.id}
                                    onClick={() => avail > 0 && addToCart(v)}
                                    disabled={avail <= 0}
                                    className={clsx(
                                        "flex flex-col p-4 md:p-4 rounded-2xl md:rounded-3xl border transition-all duration-300 transform active:scale-95 text-left group gap-2 min-h-[100px] md:min-h-0",
                                        avail <= 0 ? "opacity-50 grayscale bg-slate-900 border-white/5 cursor-not-allowed" : "bg-white/5 border-white/5 hover:border-primary/30 hover:bg-white/10"
                                    )}
                                >
                                    <div className="flex justify-between items-start gap-2">
                                        <div className="flex-1 min-w-0">
                                            {/* NO TRUNCATE - text wraps naturally */}
                                            <p className="font-black text-sm md:text-lg leading-snug uppercase break-words hyphens-auto" style={{ wordBreak: 'break-word' }}>{v.model_name}</p>
                                            <p className="text-[11px] md:text-sm text-slate-400 font-bold break-words mt-0.5" style={{ wordBreak: 'break-word' }}>{v.flavor_name}</p>
                                        </div>
                                        <div className={clsx(
                                            "shrink-0 px-2 py-1 rounded-lg text-[10px] md:text-xs font-black uppercase",
                                            avail < 5 ? "bg-red-500/20 text-red-400" : "bg-primary/20 text-primary"
                                        )}>
                                            {avail}
                                        </div>
                                    </div>
                                    <div className="flex justify-between items-center mt-auto pt-2">
                                        <p className="text-lg md:text-xl font-black text-white">€{Number(v.default_price).toFixed(0)}</p>
                                        <div className="p-2.5 md:p-2 rounded-xl bg-white/5 group-hover:bg-primary group-hover:text-black transition-colors">
                                            <Plus size={20} className="w-5 h-5 md:w-[18px] md:h-[18px]" />
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Cart Area */}
                <div className="lg:col-span-4 flex flex-col gap-6">
                    <div className="glass rounded-[2.5rem] p-6 border-white/10 flex flex-col h-fit sticky top-8">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-12 h-12 bg-primary/20 rounded-2xl flex items-center justify-center text-primary">
                                <ShoppingCart size={24} />
                            </div>
                            <h2 className="text-2xl font-bold">Riepilogo Ordine</h2>
                        </div>

                        <div className="space-y-4 mb-6">
                            <label className="text-sm font-bold text-slate-500 tracking-widest uppercase ml-1">
                                Cliente <span className="text-red-400">*</span>
                            </label>
                            <div className="relative">
                                <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                                <input
                                    type="text"
                                    placeholder="Nome cliente (obbligatorio)..."
                                    value={customerName}
                                    onChange={(e) => setCustomerName(e.target.value)}
                                    className={clsx(
                                        "w-full bg-black/40 border rounded-2xl py-3 pl-12 pr-4 focus:outline-none focus:ring-1 focus:ring-primary/50 transition-colors",
                                        cart.length > 0 && !customerName.trim()
                                            ? "border-red-500/50 bg-red-500/5"
                                            : "border-white/10"
                                    )}
                                />
                            </div>
                            {cart.length > 0 && !customerName.trim() && (
                                <p className="text-xs text-red-400 font-bold ml-1">⚠ Inserisci il nome del cliente per procedere</p>
                            )}
                        </div>

                        <div className="flex-1 space-y-4 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar mb-6">
                            {cart.length > 0 ? (
                                cart.map((item) => (
                                    <div key={item.id} className="p-4 bg-white/5 rounded-2xl border border-white/5 space-y-3">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <p className="font-bold">{item.model_name}</p>
                                                <p className="text-xs text-slate-500">{item.flavor_name}</p>
                                            </div>
                                            <button
                                                onClick={() => setCart(cart.filter(c => c.id !== item.id))}
                                                className="text-slate-600 hover:text-red-400 transition-colors"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>

                                        <div className="flex items-center justify-between gap-4">
                                            <div className="flex items-center bg-black/40 rounded-xl border border-white/5 overflow-hidden">
                                                <button onClick={() => removeFromCart(item.id)} className="p-2 hover:bg-white/5 text-slate-400">
                                                    <Minus size={16} />
                                                </button>
                                                <span className="w-8 text-center font-bold">{item.qty}</span>
                                                <button onClick={() => addToCart(item)} className="p-2 hover:bg-white/5 text-slate-400">
                                                    <Plus size={16} />
                                                </button>
                                            </div>

                                            <div className="flex items-center gap-2 flex-1 max-w-[120px]">
                                                <span className="text-xs text-slate-500 font-bold">€</span>
                                                <input
                                                    type="number"
                                                    value={item.price_final || ''}
                                                    onFocus={(e) => e.target.select()}
                                                    onChange={(e) => updateCartPrice(item.id, e.target.value === '' ? 0 : Number(e.target.value))}
                                                    className="w-full bg-black/40 border border-white/5 rounded-xl py-1 px-2 text-right font-bold text-primary focus:outline-none focus:border-primary/50"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="text-center py-12 text-slate-600 border-2 border-dashed border-white/5 rounded-3xl">
                                    Il carrello è vuoto
                                </div>
                            )}
                        </div>

                        <div className="pt-6 border-t border-white/10 space-y-6">
                            <div className="flex justify-between items-end">
                                <span className="text-lg font-bold text-slate-400">Totale parziale</span>
                                <span className="text-4xl font-black text-white">€{cartTotal.toFixed(2)}</span>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <button
                                    onClick={handlePrenota}
                                    disabled={cart.length === 0 || !customerName.trim() || actionLoading}
                                    className="flex flex-col items-center justify-center gap-1 py-4 px-4 bg-emerald-500/10 text-emerald-400 rounded-3xl border border-emerald-500/20 hover:bg-emerald-500/20 transition-all font-bold disabled:opacity-30 disabled:cursor-not-allowed"
                                >
                                    <Calendar size={20} />
                                    <span>PRENOTA</span>
                                </button>
                                <button
                                    onClick={handleIncassaClick}
                                    disabled={cart.length === 0 || !customerName.trim() || actionLoading}
                                    className="flex flex-col items-center justify-center gap-1 py-4 px-4 bg-primary text-black rounded-3xl hover:bg-primary-dark transition-all font-black disabled:opacity-30 disabled:cursor-not-allowed shadow-[0_10px_30px_rgba(34,211,238,0.2)]"
                                >
                                    {actionLoading ? (
                                        <div className="w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
                                    ) : (
                                        <>
                                            <CheckCircle2 size={24} />
                                            <span>INCASSA ORA</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Payment Modal */}
            <PaymentModal
                isOpen={showPaymentModal}
                onClose={() => setShowPaymentModal(false)}
                onConfirm={(amount) => {
                    setPaymentAmount(amount.toString());
                    // We need to wait for state update or pass directly. 
                    // Best to refactor handleConfirmPayment to accept amount or use effect.
                    // Actually, handleConfirmPayment calculates from paymentAmount state. 
                    // Let's modify handleConfirmPayment to take an arg or just update state and call it?
                    // React state update is async. 
                    // BETTER: Call a new handler that takes the amount directly.
                    handlePaymentConfirmed(amount);
                }}
                totalAmount={cartTotal}
                initialAmount={paymentAmount}
            />
        </div>
    );
};
