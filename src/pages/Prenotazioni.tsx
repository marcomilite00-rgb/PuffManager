import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { safeNumber, toCents, fromCents } from '../lib/money';
import { useAuth } from '../context/AuthContext';
import { useRealtime } from '../hooks/useRealtime';
import type { Reservation } from '../types/database';
import {
    Calendar,
    CheckCircle2,
    XCircle,
    Edit3,
    Clock,
    User,
    ChevronDown,
    ChevronUp,
    Save,
    Plus,
    Minus,
    Trash2,
    Package,
    X,
    Search
} from 'lucide-react';


export const Prenotazioni: React.FC = () => {
    const { user } = useAuth();
    const [reservations, setReservations] = useState<Reservation[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [editItem, setEditItem] = useState<{ itemId: string; qty: number; price: number } | null>(null);
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    // Payment Modal State
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [paymentData, setPaymentData] = useState<{ id: string, total: number } | null>(null);
    const [paymentAmount, setPaymentAmount] = useState('');

    // Add Item Modal State
    const [showAddItemModal, setShowAddItemModal] = useState(false);
    const [addItemResId, setAddItemResId] = useState<string | null>(null);
    const [variants, setVariants] = useState<any[]>([]);
    const [inventory, setInventory] = useState<any[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedVariant, setSelectedVariant] = useState<any | null>(null);
    const [addQty, setAddQty] = useState(1);
    const [addPrice, setAddPrice] = useState(0);

    useEffect(() => {
        fetchData();
        fetchVariantsAndInventory();
    }, []);

    const fetchData = async () => {
        const { data } = await supabase
            .from('reservations')
            .select('*, items:reservation_items(*, variant:product_variants(model:product_models(name), flavor:product_flavors(name))), staff:created_by_staff_id(name)')
            .eq('status', 'RESERVED')
            .order('created_at', { ascending: false });

        if (data) setReservations(data as any);
        setLoading(false);
    };

    const fetchVariantsAndInventory = async () => {
        const [variantsRes, inventoryRes] = await Promise.all([
            supabase
                .from('product_variants')
                .select('*, model:product_models(name), flavor:product_flavors(name)')
                .eq('active', true),
            supabase.from('inventory').select('*')
        ]);
        if (variantsRes.data) setVariants(variantsRes.data);
        if (inventoryRes.data) setInventory(inventoryRes.data);
    };

    useRealtime<Reservation>('reservations', () => fetchData());
    useRealtime<any>('reservation_items', () => fetchData());

    const handleVendutoClick = (id: string, total: number) => {
        setPaymentData({ id, total });
        setPaymentAmount(''); // Default empty
        setShowPaymentModal(true);
    };

    const handleConfirmPayment = async () => {
        if (!paymentData) return;

        const amount = paymentAmount === '' ? paymentData.total : parseFloat(paymentAmount.replace(',', '.'));
        if (isNaN(amount) || amount < 0) {
            alert('Inserisci un importo valido');
            return;
        }

        setActionLoading(paymentData.id);
        setShowPaymentModal(false);

        try {
            const { error } = await supabase.rpc('fulfill_reservation', {
                p_res_id: paymentData.id,
                p_staff_id: user?.id,
                p_payment_amount: amount
            });
            if (error) throw error;
            alert('Resa vendita!');
        } catch (err: any) {
            alert(err.message || 'Errore');
        } finally {
            setActionLoading(null);
            setPaymentData(null);
        }
    };

    const handleAnnulla = async (id: string) => {
        if (!confirm('Annullare questa prenotazione? Lo stock verrà ripristinato.')) return;
        setActionLoading(id);
        try {
            const { error } = await supabase.rpc('cancel_reservation', { p_res_id: id });
            if (error) throw error;
        } catch (err: any) {
            alert(err.message || 'Errore');
        } finally {
            setActionLoading(null);
        }
    };

    const handleUpdateQty = async (itemId: string, newQty: number, newPrice: number) => {
        if (newQty < 1) return;
        try {
            const { error } = await supabase.rpc('update_reservation_item', {
                p_item_id: itemId,
                p_new_qty: newQty,
                p_new_price: newPrice
            });
            if (error) throw error;
            setEditItem(null);
            fetchData(); // Force refresh to show updated total and stock
            fetchVariantsAndInventory(); // Update local inventory state
        } catch (err: any) {
            alert(err.message || 'Errore aggiornamento stock');
        }
    };

    const handleDeleteItem = async (itemId: string) => {
        if (!confirm('Eliminare questo articolo dalla prenotazione? La quantità verrà restituita all\'inventario.')) return;
        try {
            const { error } = await supabase.rpc('delete_reservation_item', { p_item_id: itemId });
            if (error) throw error;
            fetchData();
        } catch (err: any) {
            alert(err.message || 'Errore eliminazione articolo');
        }
    };

    const openAddItemModal = (resId: string) => {
        setAddItemResId(resId);
        setSelectedVariant(null);
        setAddQty(1);
        setAddPrice(0);
        setSearchTerm('');
        setShowAddItemModal(true);
        fetchVariantsAndInventory(); // Refresh stock
    };

    const handleAddItem = async () => {
        if (!selectedVariant || !addItemResId) return;
        try {
            const { error } = await supabase.rpc('add_reservation_item', {
                p_reservation_id: addItemResId,
                p_variant_id: selectedVariant.id,
                p_qty: addQty,
                p_price_final: addPrice
            });
            if (error) throw error;
            setShowAddItemModal(false);
            fetchData();
            fetchVariantsAndInventory();
        } catch (err: any) {
            alert(err.message || 'Errore durante l\'aggiunta');
        }
    };

    const getAvailableQty = (variantId: string) => {
        const inv = inventory.find(i => i.variant_id === variantId);
        return inv ? inv.qty : 0;
    };

    const filteredVariants = variants.filter(v => {
        const name = `${v.model?.name || ''} ${v.flavor?.name || ''}`.toLowerCase();
        return name.includes(searchTerm.toLowerCase()) && getAvailableQty(v.id) > 0;
    });

    if (loading) return (
        <div className="flex items-center justify-center min-h-[60vh]">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
    );

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight">Prenotazioni</h1>
                <p className="text-slate-400">Ordini in attesa di ritiro</p>
            </div>

            <div className="space-y-4">
                {reservations.length > 0 ? (
                    reservations.map((res) => {
                        const isExpanded = expandedId === res.id;
                        const items = (res as any).items || [];
                        const total = fromCents(items.reduce((acc: number, curr: any) => acc + safeNumber(curr.qty) * toCents(curr.unit_price_final), 0));

                        return (
                            <div key={res.id} className="glass rounded-[2rem] border border-white/5 overflow-hidden transition-all duration-300">
                                <div
                                    onClick={() => setExpandedId(isExpanded ? null : res.id)}
                                    className="p-5 sm:p-6 cursor-pointer hover:bg-white/5 transition-colors"
                                >
                                    {/* Header: Customer name + Total */}
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-[#00E5FF]/10 flex items-center justify-center text-[#00E5FF]">
                                                <User size={20} />
                                            </div>
                                            <p className="text-lg font-black text-white truncate max-w-[200px]">
                                                {res.customer_name || 'Generic'}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <p className="text-xl font-black text-[#00E5FF]">€{total.toFixed(2)}</p>
                                            {isExpanded ? <ChevronUp size={22} className="text-slate-500" /> : <ChevronDown size={22} className="text-slate-500" />}
                                        </div>
                                    </div>

                                    {/* Subheader: Date/Time + N Articoli badge + Staff */}
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <div className="flex items-center gap-1.5 px-3 py-1 bg-white/5 rounded-full border border-white/5 text-[10px] text-slate-400 font-bold">
                                            <Clock size={12} className="text-[#00E5FF]" />
                                            {new Date(res.created_at).toLocaleDateString('it-IT')} • {new Date(res.created_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                        <div className="px-3 py-1 rounded-full bg-[#00E5FF]/10 text-[#00E5FF] border border-[#00E5FF]/20 text-[10px] font-black uppercase">
                                            {items.length} Articoli
                                        </div>
                                        {(res as any).staff?.name && (
                                            <div className="px-3 py-1 rounded-full bg-white/5 border border-white/5 text-[10px] text-slate-500 font-bold">
                                                BY: <span className="text-slate-300">{(res as any).staff.name}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {isExpanded && (
                                    <div className="p-6 bg-black/40 border-t border-white/5 animate-in slide-in-from-top-2 duration-300">
                                        <div className="space-y-6">
                                            <div className="grid grid-cols-1 gap-0 divide-y divide-white/5">
                                                {items.map((item: any) => (
                                                    <div key={item.id} className="flex items-center justify-between p-4 hover:bg-white/5 transition-colors">
                                                        <div className="flex-1">
                                                            <p className="font-bold text-slate-200">{item.variant.model.name}</p>
                                                            <p className="text-xs text-slate-400 italic">{item.variant.flavor.name}</p>
                                                        </div>

                                                        <div className="flex items-center gap-6">
                                                            {editItem && editItem.itemId === item.id ? (
                                                                <div className="flex items-center gap-3 bg-black/60 rounded-xl px-3 py-2 border border-primary/30">
                                                                    {/* Quantity Control */}
                                                                    <div className="flex items-center gap-2 border-r border-white/10 pr-3">
                                                                        <button
                                                                            onClick={() => setEditItem({ ...editItem, qty: Math.max(1, editItem.qty - 1) })}
                                                                            className="p-1 text-slate-400 hover:text-white"
                                                                        >
                                                                            <Minus size={14} />
                                                                        </button>
                                                                        <input
                                                                            type="number"
                                                                            min="1"
                                                                            value={editItem.qty}
                                                                            onChange={(e) => {
                                                                                const val = parseInt(e.target.value) || 1;
                                                                                const currentStock = getAvailableQty(item.variant.id);
                                                                                const maxAllowed = item.qty + currentStock;
                                                                                setEditItem({ ...editItem, qty: Math.min(val, maxAllowed) });
                                                                            }}
                                                                            className="w-10 bg-transparent text-center font-bold text-white focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                                        />
                                                                        <button
                                                                            onClick={() => {
                                                                                const currentStock = getAvailableQty(item.variant.id);
                                                                                const maxAllowed = item.qty + currentStock;
                                                                                if (editItem.qty < maxAllowed) {
                                                                                    setEditItem({ ...editItem, qty: editItem.qty + 1 });
                                                                                }
                                                                            }}
                                                                            className="p-1 text-slate-400 hover:text-white"
                                                                        >
                                                                            <Plus size={14} />
                                                                        </button>
                                                                    </div>

                                                                    {/* Price Control */}
                                                                    <div className="flex items-center gap-1">
                                                                        <span className="text-[10px] text-slate-500 font-bold">€</span>
                                                                        <input
                                                                            type="number"
                                                                            step="0.01"
                                                                            value={editItem.price}
                                                                            onChange={(e) => setEditItem({ ...editItem, price: parseFloat(e.target.value) || 0 })}
                                                                            className="w-14 bg-transparent text-primary font-bold focus:outline-none text-right"
                                                                        />
                                                                    </div>

                                                                    <div className="flex items-center gap-1 ml-2 border-l border-white/10 pl-3">
                                                                        <button
                                                                            onClick={() => handleUpdateQty(item.id, editItem.qty, editItem.price)}
                                                                            className="p-1.5 bg-primary text-black rounded-lg hover:bg-emerald-400 transition-colors"
                                                                        >
                                                                            <Save size={16} />
                                                                        </button>
                                                                        <button
                                                                            onClick={() => setEditItem(null)}
                                                                            className="p-1.5 text-slate-500 hover:text-white"
                                                                        >
                                                                            <X size={16} />
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <div className="flex items-center gap-4">
                                                                    <div className="text-right">
                                                                        <p className="font-black text-slate-300">€{(item.unit_price_final * item.qty).toFixed(2)}</p>
                                                                        <p className="text-[10px] text-slate-500">{item.qty} x €{Number(item.unit_price_final).toFixed(2)}</p>
                                                                    </div>
                                                                    <button
                                                                        onClick={() => setEditItem({ itemId: item.id, qty: item.qty, price: item.unit_price_final })}
                                                                        className="p-2 hover:bg-white/10 text-slate-500 hover:text-white transition-colors rounded-xl"
                                                                    >
                                                                        <Edit3 size={16} />
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleDeleteItem(item.id)}
                                                                        className="p-2 hover:bg-red-500/10 text-slate-500 hover:text-red-500 transition-colors rounded-xl"
                                                                        title="Elimina articolo"
                                                                    >
                                                                        <Trash2 size={16} />
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>

                                            {/* Add Item Button */}
                                            <button
                                                onClick={() => openAddItemModal(res.id)}
                                                className="w-full min-h-[48px] py-3 mt-2 bg-[#00E5FF] text-black rounded-xl hover:opacity-90 active:scale-[0.97] transition-all font-black flex items-center justify-center gap-2 text-sm"
                                            >
                                                <Plus size={18} />
                                                AGGIUNGI ARTICOLO
                                            </button>

                                            {/* Sell Button */}
                                            <button
                                                onClick={() => handleVendutoClick(res.id, total)}
                                                disabled={actionLoading === res.id}
                                                className="w-full min-h-[48px] flex items-center justify-center gap-2 py-3 bg-emerald-500 text-black rounded-xl hover:bg-emerald-600 active:scale-[0.97] transition-all font-black shadow-[0_10px_30px_rgba(16,185,129,0.2)] disabled:opacity-50 text-sm"
                                            >
                                                {actionLoading === res.id ? (
                                                    <div className="w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
                                                ) : (
                                                    <>
                                                        <CheckCircle2 size={20} />
                                                        SEGNA COME VENDUTO
                                                    </>
                                                )}
                                            </button>

                                            {/* Annulla Button — separated at bottom */}
                                            <div className="pt-4 border-t border-white/5">
                                                <button
                                                    onClick={() => handleAnnulla(res.id)}
                                                    disabled={actionLoading === res.id}
                                                    className="w-full min-h-[48px] flex items-center justify-center gap-2 py-3 bg-[#FF4444] text-white rounded-xl hover:opacity-90 active:scale-[0.97] transition-all font-bold disabled:opacity-50 text-sm"
                                                >
                                                    <XCircle size={18} />
                                                    ANNULLA PRENOTAZIONE
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })
                ) : (
                    <div className="text-center py-32 glass rounded-[2.5rem] border-dashed border-white/10">
                        <Calendar size={64} className="mx-auto text-slate-800 mb-6" />
                        <h3 className="text-xl font-bold text-slate-500">Nessuna prenotazione attiva</h3>
                        <p className="text-slate-600 mt-2">Le prenotazioni create in Vendita appariranno qui.</p>
                    </div>
                )}
            </div>

            {/* Payment Modal */}
            {showPaymentModal && paymentData && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="w-full max-w-md bg-[#1a1c2e] p-8 rounded-[2rem] border border-white/10 shadow-2xl animate-in zoom-in-95 duration-200 m-4">
                        <div className="text-center mb-8">
                            <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-500 mx-auto mb-4">
                                <CheckCircle2 size={32} />
                            </div>
                            <h3 className="text-2xl font-black text-white">Conferma Pagamento</h3>
                            <p className="text-slate-400 mt-2">Totale Ordine: <span className="text-emerald-400 font-bold">€{safeNumber(paymentData.total).toFixed(2)}</span></p>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1 mb-2 block">Importo Incassato</label>
                                <div className="relative">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">€</span>
                                    <input
                                        type="number"
                                        step="0.01"
                                        placeholder={`Intero (€${safeNumber(paymentData.total).toFixed(2)})`}
                                        value={paymentAmount}
                                        onChange={(e) => setPaymentAmount(e.target.value)}
                                        className="w-full bg-black/20 border border-white/10 rounded-xl py-4 pl-8 pr-4 text-xl font-bold text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                                        autoFocus
                                    />
                                </div>
                                <p className="text-xs text-slate-500 mt-2 ml-1">
                                    Lascia vuoto per confermare l'intero importo.
                                    <br />
                                    Se inserisci meno, verrà creato un <strong>Promemoria</strong>.
                                </p>
                            </div>

                            <div className="flex gap-3 mt-8">
                                <button
                                    onClick={() => setShowPaymentModal(false)}
                                    className="flex-1 py-4 bg-white/5 text-slate-400 font-bold rounded-xl hover:bg-white/10 transition-colors"
                                >
                                    Annulla
                                </button>
                                <button
                                    onClick={handleConfirmPayment}
                                    className="flex-1 py-4 bg-emerald-500 text-black font-black rounded-xl hover:bg-emerald-400 transition-colors shadow-[0_4px_20px_rgba(16,185,129,0.2)]"
                                >
                                    Conferma
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Add Item Modal */}
            {showAddItemModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="w-full max-w-2xl max-h-[90vh] bg-[#1a1c2e] rounded-[2rem] border border-white/10 shadow-2xl animate-in zoom-in-95 duration-200 m-4 flex flex-col">
                        {/* Header */}
                        <div className="p-6 border-b border-white/5 flex items-center justify-between">
                            <div>
                                <h3 className="text-xl font-black text-white">Aggiungi Articolo</h3>
                                <p className="text-xs text-slate-500">Seleziona una variante da aggiungere</p>
                            </div>
                            <button
                                onClick={() => setShowAddItemModal(false)}
                                className="p-2 hover:bg-white/10 rounded-xl transition-colors"
                            >
                                <X size={20} className="text-slate-400" />
                            </button>
                        </div>

                        {/* Search */}
                        <div className="p-4 border-b border-white/5">
                            <div className="relative">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                                <input
                                    type="text"
                                    placeholder="Cerca variante..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full bg-black/20 border border-white/10 rounded-xl py-3 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-primary/50"
                                />
                            </div>
                        </div>

                        {/* Variants List */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-2 max-h-[40vh]">
                            {filteredVariants.length > 0 ? (
                                filteredVariants.map((v: any) => {
                                    const avail = getAvailableQty(v.id);
                                    const isSelected = selectedVariant?.id === v.id;
                                    return (
                                        <button
                                            key={v.id}
                                            onClick={() => {
                                                setSelectedVariant(v);
                                                setAddQty(1);
                                                setAddPrice(v.default_price);
                                            }}
                                            className={`w-full p-4 rounded-xl border transition-all text-left flex items-center justify-between ${isSelected
                                                ? 'bg-primary/20 border-primary/50'
                                                : 'bg-white/5 border-white/5 hover:bg-white/10'
                                                }`}
                                        >
                                            <div>
                                                <p className="font-bold text-white">{v.model?.name}</p>
                                                <p className="text-xs text-slate-400">{v.flavor?.name}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="font-bold text-primary">€{v.default_price}</p>
                                                <p className="text-xs text-slate-500">Disp: {avail}</p>
                                            </div>
                                        </button>
                                    );
                                })
                            ) : (
                                <div className="text-center py-8 text-slate-500">
                                    <Package size={32} className="mx-auto mb-2 opacity-50" />
                                    <p>Nessuna variante disponibile</p>
                                </div>
                            )}
                        </div>

                        {/* Selected Item Controls */}
                        {selectedVariant && (
                            <div className="p-4 border-t border-white/5 bg-black/20">
                                <div className="flex items-center gap-4">
                                    <div className="flex-1">
                                        <p className="text-xs text-slate-500 uppercase font-bold mb-1">Quantità</p>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => setAddQty(Math.max(1, addQty - 1))}
                                                className="p-2 bg-white/5 rounded-lg hover:bg-white/10"
                                            >
                                                <Minus size={16} />
                                            </button>
                                            <input
                                                type="number"
                                                min="1"
                                                value={addQty}
                                                onChange={(e) => {
                                                    const val = parseInt(e.target.value) || 1;
                                                    const avail = getAvailableQty(selectedVariant.id);
                                                    setAddQty(Math.min(val, avail));
                                                }}
                                                className="w-12 bg-transparent text-center font-bold text-xl focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                            />
                                            <button
                                                onClick={() => setAddQty(Math.min(getAvailableQty(selectedVariant.id), addQty + 1))}
                                                className="p-2 bg-white/5 rounded-lg hover:bg-white/10"
                                            >
                                                <Plus size={16} />
                                            </button>
                                        </div>
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-xs text-slate-500 uppercase font-bold mb-1">Prezzo €</p>
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={addPrice}
                                            onChange={(e) => setAddPrice(Number(e.target.value))}
                                            className="w-full bg-black/30 border border-white/10 rounded-lg py-2 px-3 text-lg font-bold text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Footer */}
                        <div className="p-4 border-t border-white/5 flex gap-3">
                            <button
                                onClick={() => setShowAddItemModal(false)}
                                className="flex-1 py-4 bg-white/5 text-slate-400 font-bold rounded-xl hover:bg-white/10 transition-colors"
                            >
                                Annulla
                            </button>
                            <button
                                onClick={handleAddItem}
                                disabled={!selectedVariant}
                                className="flex-1 py-4 bg-primary text-black font-black rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50"
                            >
                                Aggiungi
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};
