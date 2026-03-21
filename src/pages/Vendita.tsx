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
    User,
    Trash2,
    Search,
    Package
} from 'lucide-react';
import { clsx } from 'clsx';
import { PaymentModal } from '../components/PaymentModal';
import { Badge } from '../components/ui/Badge';

interface CartItem extends ProductVariant {
    qty: number;
    price_final: number;
}

const getFlavorGradient = (name: string) => {
    const gradients = [
        'from-cyan-500/20 to-blue-500/5',
        'from-emerald-500/20 to-teal-500/5',
        'from-purple-500/20 to-pink-500/5',
        'from-orange-500/20 to-amber-500/5',
        'from-rose-500/20 to-red-500/5',
        'from-indigo-500/20 to-violet-500/5',
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return gradients[Math.abs(hash) % gradients.length];
};

export const Vendita: React.FC = () => {
    const { user } = useAuth();
    const [variants, setVariants] = useState<ProductVariant[]>([]);
    const [inventory, setInventory] = useState<Inventory[]>([]);
    const [cart, setCart] = useState<CartItem[]>([]);
    const [customerName, setCustomerName] = useState('');
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);

    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [paymentAmount, setPaymentAmount] = useState('');

    useEffect(() => { fetchData(); }, []);

    const fetchData = async () => {
        const [variantsRes, inventoryRes] = await Promise.all([
            supabase.from('product_variants').select('*, model:product_models(name), flavor:product_flavors(name)').eq('active', true),
            supabase.from('inventory').select('*'),
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
        setPaymentAmount('');
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
        <div className="flex flex-col gap-8 p-6 animate-pulse">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-8 space-y-6">
                    <div className="h-12 w-48 skeleton" />
                    <div className="h-16 w-full skeleton" />
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                        {[...Array(6)].map((_, i) => <div key={i} className="h-40 skeleton" />)}
                    </div>
                </div>
            </div>
        </div>
    );

    return (
        <div className="space-y-6 md:space-y-12 animate-fade safe-area-pt pb-28">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-10 px-4 md:px-6">
                {/* Selection Area */}
                <div className="lg:col-span-8 space-y-5 md:space-y-8">
                    <div className="flex flex-col gap-1">
                        <h1 className="text-4xl md:text-7xl font-black italic tracking-tighter text-white uppercase leading-none">
                            Vendita<span className="text-primary not-italic">Rapida</span>
                        </h1>
                        <p className="label-caps text-[10px] md:text-xs text-slate-500 tracking-widest">Seleziona i prodotti dal magazzino</p>
                    </div>

                    <div className="relative group">
                        <Search className="absolute left-4 md:left-5 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-primary transition-colors" size={16} />
                        <input
                            type="text"
                            placeholder="Cerca prodotto..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full bg-surface-900 border border-white/5 rounded-xl md:rounded-2xl py-3.5 md:py-4.5 pl-12 md:pl-14 pr-4 focus:outline-none focus:border-primary/40 text-white placeholder:text-slate-700 transition-all text-sm md:text-lg italic font-medium"
                        />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar">
                        {filteredVariants.map((v) => {
                            const inv = inventory.find(i => i.variant_id === v.id);
                            const qty = inv ? inv.qty : 0;
                            const inCart = cart.find(c => c.id === v.id)?.qty || 0;
                            const avail = qty - inCart;
                            const maxStock = 20; // Assume 20 as max for visual reference
                            const stockPercent = Math.min((avail / maxStock) * 100, 100);

                            return (
                                <button
                                    key={v.id}
                                    onClick={() => avail > 0 && addToCart(v)}
                                    disabled={avail <= 0}
                                    className={clsx(
                                        "relative flex flex-col p-4 md:p-6 rounded-2xl md:rounded-[3rem] border overflow-hidden transition-all duration-300 transform active:scale-95 group",
                                        avail <= 0 
                                            ? "opacity-40 grayscale bg-surface-900 border-white/5 cursor-not-allowed shadow-none" 
                                            : "bg-gradient-to-br border-white/10 hover:border-primary/40 hover:shadow-[0_20px_40px_rgba(0,0,0,0.3)] shadow-xl",
                                        getFlavorGradient(v.flavor_name || '')
                                    )}
                                >
                                    <div className="flex justify-between items-start z-10">
                                        <div className="min-w-0 flex-1 pr-2">
                                            <p className="font-black text-base md:text-2xl leading-none uppercase tracking-tighter text-white truncate italic">{v.model_name}</p>
                                            <p className="text-[9px] md:text-sm text-slate-400 font-bold mt-1 md:mt-2 italic uppercase tracking-widest opacity-70 truncate">{v.flavor_name}</p>
                                        </div>
                                        <Badge 
                                            variant={avail === 0 ? 'danger' : avail < 4 ? 'warning' : 'primary'}
                                            size="sm"
                                            className="px-1.5 py-0"
                                        >
                                            {avail}
                                        </Badge>
                                    </div>

                                    {/* Stock Progress Bar */}
                                    <div className="mt-4 md:mt-8 space-y-2 z-10">
                                        <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                                            <div 
                                                className={clsx(
                                                    "h-full transition-all duration-1000",
                                                    avail > 10 ? "bg-success shadow-[0_0_10px_rgba(16,185,129,0.5)]" : avail > 3 ? "bg-warning" : "bg-danger"
                                                )}
                                                style={{ width: `${stockPercent}%` }}
                                            />
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <p className="text-xl md:text-4xl font-black text-white italic tracking-tighter leading-none pt-1">€{Number(v.default_price).toFixed(0)}</p>
                                            <div className="p-2 md:p-3 rounded-lg md:rounded-2xl bg-white/5 group-hover:bg-primary group-hover:text-surface-950 transition-all duration-300 transform group-hover:rotate-12 border border-white/5">
                                                <Plus size={18} className="md:w-6 md:h-6" />
                                            </div>
                                        </div>
                                    </div>
                                    
                                    {/* Subtle Glass Pattern */}
                                    <div className="absolute -bottom-4 -right-4 w-24 h-24 bg-white/5 rounded-full blur-2xl group-hover:bg-primary/10 transition-colors" />
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="lg:col-span-4 flex flex-col gap-6">
                    <div className="glass rounded-3xl md:rounded-[4rem] p-5 md:p-10 border-white/5 flex flex-col h-fit md:sticky md:top-10 shadow-3xl bg-surface-950/60 backdrop-blur-3xl">
                        <div className="flex items-center gap-4 mb-6 md:mb-10">
                            <div className="w-10 h-10 md:w-16 md:h-16 bg-primary/20 rounded-xl md:rounded-2xl flex items-center justify-center text-primary shadow-lg shadow-primary/10">
                                <ShoppingCart size={20} className="md:w-8 md:h-8" />
                            </div>
                            <h2 className="text-xl md:text-3xl font-black italic uppercase tracking-tighter leading-none">Carrello</h2>
                        </div>

                        <div className="space-y-3 mb-6 md:mb-10">
                            <label className="label-caps text-[9px] md:text-[10px] text-slate-500 block px-2 tracking-widest uppercase font-black">
                                Identificativo Cliente <span className="text-danger">*</span>
                            </label>
                            <div className="relative">
                                <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-700" size={14} />
                                <input
                                    type="text"
                                    placeholder="Nome o Alias cliente..."
                                    value={customerName}
                                    onChange={(e) => setCustomerName(e.target.value)}
                                    className={clsx(
                                        "w-full bg-surface-950/80 border rounded-xl md:rounded-2xl py-3.5 md:py-4.5 pl-11 md:pl-12 pr-4 focus:outline-none transition-all font-black text-sm md:text-base placeholder:text-slate-800 italic",
                                        cart.length > 0 && !customerName.trim() ? "border-danger/40 text-danger" : "border-white/5 text-white focus:border-primary/40"
                                    )}
                                />
                            </div>
                        </div>

                        <div className="flex-1 space-y-3 max-h-[40vh] md:max-h-[50vh] overflow-y-auto pr-1 custom-scrollbar mb-6 md:mb-10">
                            {cart.length > 0 ? (
                                cart.map((item) => (
                                    <div key={item.id} className="p-4 md:p-6 rounded-2xl md:rounded-[2.5rem] border border-white/5 bg-white/5 space-y-4 group transition-all hover:bg-white/10">
                                        <div className="flex justify-between items-start">
                                            <div className="min-w-0 pr-2">
                                                <p className="font-black text-white text-sm md:text-lg leading-tight uppercase truncate italic">{item.model_name}</p>
                                                <p className="text-[8px] md:text-[10px] label-caps text-slate-500 italic mt-0.5 md:mt-1 uppercase tracking-widest leading-none">{item.flavor_name}</p>
                                            </div>
                                            <button onClick={() => setCart(cart.filter(c => c.id !== item.id))} className="text-slate-600 hover:text-danger p-2 transition-colors">
                                                <Trash2 size={18} />
                                            </button>
                                        </div>                                        <div className="flex items-center justify-between gap-3">
                                            <div className="flex items-center bg-surface-950 rounded-lg md:rounded-xl border border-white/5 p-0.5 overflow-hidden">
                                                <button onClick={() => removeFromCart(item.id)} className="p-1.5 md:p-2 hover:bg-white/5 text-slate-500">
                                                    <Minus size={14} />
                                                </button>
                                                <span className="w-6 md:w-8 text-center font-black text-primary text-sm md:text-lg">{item.qty}</span>
                                                <button onClick={() => addToCart(item)} className="p-1.5 md:p-2 hover:bg-white/5 text-slate-500">
                                                    <Plus size={14} />
                                                </button>
                                            </div>

                                            <div className="flex items-center gap-1.5 md:gap-2 flex-1 max-w-[80px] md:max-w-[120px] bg-surface-950 px-2.5 md:px-4 py-1.5 md:py-2.5 rounded-lg md:rounded-xl border border-white/5">
                                                <span className="text-[8px] md:text-[10px] font-black text-slate-600 tracking-tighter uppercase italic">€</span>
                                                <input
                                                    type="number"
                                                    value={item.price_final || ''}
                                                    onFocus={(e) => e.target.select()}
                                                    onChange={(e) => updateCartPrice(item.id, e.target.value === '' ? 0 : Number(e.target.value))}
                                                    className="w-full bg-transparent text-right font-black text-white focus:outline-none text-xs md:text-lg italic"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="text-center py-20 bg-white/5 rounded-[2.5rem] border-2 border-dashed border-white/5">
                                    <Package size={48} className="mx-auto text-slate-800 mb-4 opacity-20" />
                                    <p className="label-caps text-[10px] text-slate-600">Nessun articolo selezionato</p>
                                </div>
                            )}
                        </div>

                        <div className="pt-6 md:pt-10 border-t border-white/5 space-y-6 md:space-y-10">
                            <div className="flex items-end justify-between px-1">
                                <span className="label-caps text-[9px] md:text-[10px] text-slate-600 font-bold uppercase tracking-widest italic leading-none">Totale</span>
                                <span className="text-3xl md:text-6xl font-black text-primary italic tracking-tighter leading-none">€{cartTotal.toFixed(2)}</span>
                            </div>

                            <div className="grid grid-cols-1 gap-3 md:gap-5">
                                <button
                                    onClick={handleIncassaClick}
                                    disabled={cart.length === 0 || !customerName.trim() || actionLoading}
                                    className="w-full py-6 md:py-8 bg-primary text-surface-950 rounded-3xl md:rounded-[2.5rem] font-black text-lg md:text-2xl label-caps shadow-2xl shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-30 disabled:grayscale uppercase italic tracking-tighter"
                                >
                                    {actionLoading ? <div className="w-6 h-6 border-4 border-surface-950 border-t-white rounded-full animate-spin mx-auto" /> : "Incassa Ora"}
                                </button>
                                <button
                                    onClick={handlePrenota}
                                    disabled={cart.length === 0 || !customerName.trim() || actionLoading}
                                    className="w-full py-5 md:py-7 bg-success/10 border border-success/30 text-success rounded-3xl md:rounded-[2.5rem] font-black text-base md:text-xl label-caps hover:bg-success/20 active:scale-95 transition-all disabled:opacity-30 disabled:grayscale uppercase italic tracking-tighter"
                                >
                                    Crea Prenotazione
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <PaymentModal
                isOpen={showPaymentModal}
                onClose={() => setShowPaymentModal(false)}
                onConfirm={handlePaymentConfirmed}
                totalAmount={cartTotal}
                initialAmount={paymentAmount}
            />
        </div>
    );
};
