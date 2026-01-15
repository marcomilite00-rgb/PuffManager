import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
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
    Trash2
} from 'lucide-react';


export const Prenotazioni: React.FC = () => {
    const { user } = useAuth();
    const [reservations, setReservations] = useState<Reservation[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [editItem, setEditItem] = useState<{ itemId: string; qty: number } | null>(null);
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    // Payment Modal State
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [paymentData, setPaymentData] = useState<{ id: string, total: number } | null>(null);
    const [paymentAmount, setPaymentAmount] = useState('');

    useEffect(() => {
        fetchData();
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

    const handleUpdateQty = async (itemId: string, newQty: number) => {
        if (newQty < 1) return;
        try {
            const { error } = await supabase.rpc('update_reservation_item', {
                p_item_id: itemId,
                p_new_qty: newQty
            });
            if (error) throw error;
            setEditItem(null);
            fetchData(); // Force refresh to show updated total and stock
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
                        const total = items.reduce((acc: number, curr: any) => acc + (curr.unit_price_final * curr.qty), 0);

                        return (
                            <div key={res.id} className="glass rounded-[2rem] border border-white/5 overflow-hidden transition-all duration-300">
                                <div
                                    onClick={() => setExpandedId(isExpanded ? null : res.id)}
                                    className="p-6 flex items-center justify-between cursor-pointer hover:bg-white/5"
                                >
                                    <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-8">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                                                <Calendar size={24} />
                                            </div>
                                            <div>
                                                <p className="font-black text-xl">€{total.toFixed(2)}</p>
                                                <div className="flex items-center gap-2">
                                                    <User size={12} className="text-slate-500" />
                                                    <span className="text-xs text-slate-400 font-bold uppercase tracking-widest truncate max-w-[200px]">
                                                        {res.customer_name || 'Generic'} {(res as any).staff?.name ? `(${(res as any).staff.name})` : ''}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-4 text-xs text-slate-500">
                                            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 rounded-full border border-white/5">
                                                <Clock size={14} className="text-primary" />
                                                {new Date(res.created_at).toLocaleDateString('it-IT')} {new Date(res.created_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                                            </div>
                                            <div className="px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-black tracking-tighter uppercase">
                                                {items.length} Articoli
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3">
                                        {isExpanded ? <ChevronUp size={24} className="text-slate-500" /> : <ChevronDown size={24} className="text-slate-500" />}
                                    </div>
                                </div>

                                {isExpanded && (
                                    <div className="p-6 bg-black/40 border-t border-white/5 animate-in slide-in-from-top-2 duration-300">
                                        <div className="space-y-6">
                                            <div className="grid grid-cols-1 gap-3">
                                                {items.map((item: any) => (
                                                    <div key={item.id} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                                                        <div className="flex-1">
                                                            <p className="font-bold text-slate-200">{item.variant.model.name}</p>
                                                            <p className="text-xs text-slate-500">{item.variant.flavor.name}</p>
                                                        </div>

                                                        <div className="flex items-center gap-6">
                                                            {editItem && editItem.itemId === item.id ? (
                                                                <div className="flex items-center gap-3 bg-black/60 rounded-xl px-2 py-1 border border-primary/30">
                                                                    <button onClick={() => setEditItem({ ...editItem, qty: Math.max(1, editItem.qty - 1) })} className="p-1 text-slate-400 hover:text-white">
                                                                        <Minus size={16} />
                                                                    </button>
                                                                    <span className="w-6 text-center font-bold text-primary">{editItem.qty}</span>
                                                                    <button onClick={() => setEditItem({ ...editItem, qty: editItem.qty + 1 })} className="p-1 text-slate-400 hover:text-white">
                                                                        <Plus size={16} />
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleUpdateQty(item.id, editItem.qty)}
                                                                        className="ml-2 p-1.5 bg-primary text-black rounded-lg"
                                                                    >
                                                                        <Save size={14} />
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <div className="flex items-center gap-4">
                                                                    <div className="text-right">
                                                                        <p className="font-black text-slate-300">€{(item.unit_price_final * item.qty).toFixed(2)}</p>
                                                                        <p className="text-[10px] text-slate-500">{item.qty} x €{Number(item.unit_price_final).toFixed(2)}</p>
                                                                    </div>
                                                                    <button
                                                                        onClick={() => setEditItem({ itemId: item.id, qty: item.qty })}
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

                                            <div className="flex flex-col sm:flex-row gap-4 pt-4 border-t border-white/5">
                                                <button
                                                    onClick={() => handleAnnulla(res.id)}
                                                    disabled={actionLoading === res.id}
                                                    className="flex-1 flex items-center justify-center gap-2 py-4 bg-red-500/10 text-red-500 rounded-2xl border border-red-500/10 hover:bg-red-500/20 transition-all font-bold disabled:opacity-50"
                                                >
                                                    <XCircle size={20} />
                                                    ANNULLA PRENOTAZIONE
                                                </button>
                                                <button
                                                    onClick={() => handleVendutoClick(res.id, total)}
                                                    disabled={actionLoading === res.id}
                                                    className="flex-1 flex items-center justify-center gap-2 py-4 bg-emerald-500 text-black rounded-2xl hover:bg-emerald-600 transition-all font-black shadow-[0_10px_30px_rgba(16,185,129,0.2)] disabled:opacity-50"
                                                >
                                                    {actionLoading === res.id ? (
                                                        <div className="w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
                                                    ) : (
                                                        <>
                                                            <CheckCircle2 size={24} />
                                                            SEGNA COME VENDUTO
                                                        </>
                                                    )}
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
                            <p className="text-slate-400 mt-2">Totale Ordine: <span className="text-emerald-400 font-bold">€{paymentData.total.toFixed(2)}</span></p>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1 mb-2 block">Importo Incassato</label>
                                <div className="relative">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">€</span>
                                    <input
                                        type="number"
                                        step="0.01"
                                        placeholder={`Intero (€${paymentData.total.toFixed(2)})`}
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

        </div>
    );
};
