import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { safeNumber, formatEur } from '../lib/money';
import {
    History,
    Search,
    ChevronDown,
    ChevronUp,
    Package,
    User,
    Clock,
    TrendingUp,
    X
} from 'lucide-react';
import { clsx } from 'clsx';
import { useAuth } from '../context/AuthContext';

export const Storico: React.FC = () => {
    const { user } = useAuth();
    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [stats, setStats] = useState<{ gross: number, net: number }>({ gross: 0, net: 0 });
    const [lastResetDate, setLastResetDate] = useState<string | null>(null);
    const [showOldOrders, setShowOldOrders] = useState(false);

    const canViewStats = user?.role === 'admin' || user?.role === 'staff';

    useEffect(() => {
        fetchOrders();
    }, []);

    const fetchOrders = async () => {
        const { data, error } = await supabase
            .from('orders')
            .select(`
                *,
                items:order_items(
                    *,
                    variant:product_variants(
                        model:product_models(name),
                        flavor:product_flavors(name),
                        unit_cost
                    )
                ),
                staff:staff(name)
            `)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching orders:', error);
        } else {
            setOrders(data || []);
        }

        // Fetch stats and last_reset_date
        const { data: settings } = await supabase.from('settings').select('total_gross_earned, total_net_earned, last_reset_date').single();
        if (settings) {
            setLastResetDate(settings.last_reset_date);
            if (canViewStats) {
                setStats({
                    gross: settings.total_gross_earned || 0,
                    net: settings.total_net_earned || 0
                });
            }
        }

        setLoading(false);
    };

    const splitOrders = useMemo(() => {
        if (!lastResetDate) return { current: orders, old: [] };
        const resetTime = new Date(lastResetDate).getTime();

        return {
            current: orders.filter((o: any) => new Date(o.created_at).getTime() > resetTime),
            old: orders.filter((o: any) => new Date(o.created_at).getTime() <= resetTime)
        };
    }, [orders, lastResetDate]);

    const filteredOrders = splitOrders.current.filter((order: any) =>
        (order.customer_name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
        (order.staff?.name?.toLowerCase() || '').includes(searchTerm.toLowerCase())
    );

    const filteredOldOrders = splitOrders.old.filter((order: any) =>
        (order.customer_name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
        (order.staff?.name?.toLowerCase() || '').includes(searchTerm.toLowerCase())
    );

    // Staff search summary: when search matches staff, show aggregate stats
    const staffSearchSummary = useMemo(() => {
        if (!searchTerm || searchTerm.length < 2) return null;

        const term = searchTerm.toLowerCase();
        const matchingStaffOrders = splitOrders.current.filter((o: any) =>
            (o.staff?.name?.toLowerCase() || '').includes(term)
        );

        if (matchingStaffOrders.length === 0) return null;

        // Find the matched staff name
        const staffName = matchingStaffOrders[0]?.staff?.name || searchTerm;

        const totalGross = matchingStaffOrders.reduce((acc: number, o: any) => acc + safeNumber(o.gross_total), 0);
        const totalCost = matchingStaffOrders.reduce((acc: number, o: any) => {
            const items = o.items || [];
            return acc + items.reduce((itemAcc: number, item: any) => {
                return itemAcc + safeNumber(item.qty) * safeNumber(item.variant?.unit_cost);
            }, 0);
        }, 0);
        const totalNet = totalGross - totalCost;

        return {
            staffName,
            totalGross,
            totalNet,
            orderCount: matchingStaffOrders.length
        };
    }, [searchTerm, splitOrders]);

    const OrderCard = ({ order }: { order: any }) => {
        const isExpanded = expandedId === order.id;
        const items = order.items || [];
        const date = new Date(order.created_at);

        return (
            <div key={order.id} className="glass rounded-[1.5rem] md:rounded-[2rem] border border-white/5 overflow-hidden transition-all duration-300 hover:border-white/10">
                <div
                    onClick={() => setExpandedId(isExpanded ? null : order.id)}
                    className="p-4 md:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer hover:bg-white/5"
                >
                    <div className="flex items-center gap-4 md:gap-5">
                        <div className={clsx(
                            "w-12 h-12 md:w-14 md:h-14 rounded-2xl md:rounded-[1.25rem] flex items-center justify-center group-hover:scale-110 transition-transform relative",
                            order.status === 'PARTIAL_PAYMENT' ? "bg-yellow-500/10 text-yellow-500" : "bg-emerald-500/10 text-emerald-400"
                        )}>
                            <TrendingUp size={24} className="w-5 h-5 md:w-6 md:h-6" />
                            {order.status === 'PARTIAL_PAYMENT' && (
                                <div className="absolute top-1 right-1 w-3 h-3 bg-yellow-500 rounded-full border-2 border-slate-900 shadow-sm animate-pulse"></div>
                            )}
                        </div>
                        <div>
                            <p className="text-xl md:text-2xl font-black text-white">€{Number(order.gross_total).toFixed(2)}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                                <User size={12} className="text-slate-500" />
                                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                                    {order.customer_name || 'Generic'}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 sm:gap-6">
                        <div className="flex flex-col items-start sm:items-end">
                            <div className="flex items-center gap-1.5 px-3 py-1 bg-white/5 rounded-full border border-white/5 text-[9px] md:text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">
                                <Clock size={12} className="text-primary" />
                                {date.toLocaleDateString('it-IT')} • {date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                            </div>
                            <p className="text-[8px] md:text-[10px] text-slate-500 font-bold uppercase tracking-widest bg-white/5 px-2 md:px-3 py-0.5 md:py-1 rounded-full border border-white/5">
                                BY: <span className="text-slate-300">{order.staff?.name || 'Unknown'}</span>
                            </p>
                        </div>

                        <div className="flex items-center gap-2">
                            <div className="px-3 md:px-4 py-1.5 md:py-2 rounded-xl bg-primary/10 text-primary border border-primary/20 text-[10px] md:text-xs font-black uppercase tracking-widest whitespace-nowrap">
                                {items.length} Articoli
                            </div>
                            <div className="p-1 md:p-2 text-slate-500">
                                {isExpanded ? <ChevronUp size={24} className="w-5 h-5 md:w-6 md:h-6" /> : <ChevronDown size={24} className="w-5 h-5 md:w-6 md:h-6" />}
                            </div>
                        </div>
                    </div>
                </div>

                {isExpanded && (
                    <div className="p-4 md:p-6 bg-black/40 border-t border-white/5 animate-in slide-in-from-top-2 duration-300">
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 mb-2 text-slate-500">
                                <Package size={16} />
                                <span className="text-[10px] font-black uppercase tracking-widest">Dettaglio Articoli</span>
                            </div>
                            <div className={clsx(
                                "gap-3 grid grid-cols-1",
                                items.length > 3 && "md:grid-cols-2"
                            )}>
                                {items
                                    .sort((a: any, b: any) => (a.variant?.model?.name || '').localeCompare(b.variant?.model?.name || ''))
                                    .map((item: any) => (
                                        <div key={item.id} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5 group hover:border-white/10 transition-colors break-inside-avoid mb-2">
                                            <div className="flex-1">
                                                <p className="font-bold text-slate-200">{item.variant?.model?.name}</p>
                                                <p className="text-xs text-slate-500">{item.variant?.flavor?.name}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="font-black text-primary text-lg">€{formatEur(safeNumber(item.unit_price_final) * safeNumber(item.qty))}</p>
                                                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                                                    {item.qty} x €{formatEur(item.unit_price_final)}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                            </div>

                            <div className="flex justify-between items-center p-5 mt-4 bg-primary/5 rounded-2xl border border-primary/10">
                                <span className="text-xs font-black text-primary uppercase tracking-[0.2em]">Totale Transazione</span>
                                <span className="text-2xl font-black text-primary">€{formatEur(order.gross_total)}</span>
                            </div>

                            {/* Average Unit Price */}
                            {(() => {
                                const totalQty = items.reduce((acc: number, item: any) => acc + safeNumber(item.qty), 0);
                                const avgPrice = order.avg_unit_price != null
                                    ? safeNumber(order.avg_unit_price)
                                    : totalQty > 0 ? safeNumber(order.gross_total) / totalQty : 0;
                                return avgPrice > 0 ? (
                                    <div className="flex justify-between items-center px-5 py-3 mt-2 bg-white/5 rounded-xl border border-white/5">
                                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Prezzo medio/pz</span>
                                        <span className="text-sm font-black text-slate-300">€{avgPrice.toFixed(2)}</span>
                                    </div>
                                ) : null;
                            })()}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    if (loading) return (
        <div className="flex items-center justify-center min-h-[60vh]">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
    );

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex flex-col gap-2">
                    <h1 className="text-3xl font-bold tracking-tight">Storico Ordini</h1>
                    <p className="text-slate-400">Tutte le vendite concluse e i dettagli</p>
                </div>

                {/* Search Bar */}
                <div className="relative group max-w-sm w-full">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-primary transition-colors" size={18} />
                    <input
                        type="text"
                        placeholder="Cerca per cliente o staff..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-slate-600"
                    />
                </div>
            </div>


            {/* Admin/Staff Stats Cards */}
            {canViewStats && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-4 duration-500">
                    <div className="p-6 rounded-[2rem] glass border border-white/5 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform duration-500">
                            <TrendingUp size={100} />
                        </div>
                        <div className="relative z-10">
                            <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-1">Totale Carichi (Lordo)</p>
                            <div className="flex items-baseline gap-1">
                                <span className="text-3xl md:text-4xl font-black text-white">
                                    €{stats.gross.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="p-6 rounded-[2rem] glass border border-white/5 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform duration-500">
                            <Package size={100} />
                        </div>
                        <div className="relative z-10">
                            <p className="text-xs font-black uppercase tracking-widest text-primary mb-1">Totale Carichi (Netto)</p>
                            <div className="flex items-baseline gap-1">
                                <span className="text-3xl md:text-4xl font-black text-primary">
                                    €{stats.net.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            )
            }

            {/* Staff Search Summary Card */}
            {staffSearchSummary && (
                <div className="glass rounded-[2rem] p-6 border border-[#00E5FF]/20 bg-[#00E5FF]/5 animate-in fade-in slide-in-from-top-4 duration-300">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-xl bg-[#00E5FF]/10 flex items-center justify-center text-[#00E5FF]">
                            <User size={20} />
                        </div>
                        <div>
                            <p className="text-lg font-black text-white">{staffSearchSummary.staffName}</p>
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{staffSearchSummary.orderCount} ordini completati</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-white/5 rounded-xl p-4 text-center">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Lordo</p>
                            <p className="text-xl font-black text-emerald-400">€{staffSearchSummary.totalGross.toFixed(2)}</p>
                        </div>
                        <div className="bg-white/5 rounded-xl p-4 text-center">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Netto</p>
                            <p className={`text-xl font-black ${staffSearchSummary.totalNet >= 0 ? 'text-[#00E676]' : 'text-[#FF4444]'}`}>€{staffSearchSummary.totalNet.toFixed(2)}</p>
                        </div>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 gap-4">
                {filteredOrders.length > 0 ? (
                    filteredOrders.map((order) => (
                        <OrderCard key={order.id} order={order} />
                    ))
                ) : (
                    <div className="text-center py-32 glass rounded-[3rem] border-dashed border-white/10">
                        <History size={64} className="mx-auto text-slate-800 mb-6" />
                        <h3 className="text-xl font-bold text-slate-500">Nessun ordine trovato</h3>
                        <p className="text-slate-600 mt-2">Le vendite concluse appariranno qui automaticamente.</p>
                    </div>
                )}
            </div>

            {/* Floating "Carichi Vecchi" Button */}
            {splitOrders.old.length > 0 && (
                <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40">
                    <button
                        onClick={() => setShowOldOrders(true)}
                        className="flex items-center gap-3 px-8 py-4 bg-slate-900 border border-white/10 text-white font-black rounded-full shadow-[0_10px_40px_rgba(0,0,0,0.5)] hover:scale-105 active:scale-95 transition-all text-xs uppercase tracking-[0.2em] whitespace-nowrap backdrop-blur-md"
                    >
                        <History size={18} className="text-primary" />
                        Carichi Vecchi ({splitOrders.old.length})
                    </button>
                </div>
            )}

            {/* Old Orders Modal */}
            {showOldOrders && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-10 bg-black/90 backdrop-blur-xl animate-in fade-in duration-300">
                    <div className="w-full max-w-5xl h-full max-h-[90vh] glass-dark rounded-[2.5rem] md:rounded-[3.5rem] flex flex-col border border-white/10 shadow-2xl animate-in zoom-in-95 duration-300">
                        {/* Modal Header */}
                        <div className="p-8 md:p-10 flex items-center justify-between border-b border-white/5">
                            <div>
                                <h1 className="text-2xl md:text-3xl font-black tracking-tight uppercase">Carichi Vecchi</h1>
                                <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Archivio sessioni precedenti</p>
                            </div>
                            <button
                                onClick={() => setShowOldOrders(false)}
                                className="w-12 h-12 md:w-14 md:h-14 bg-white/5 rounded-full flex items-center justify-center text-slate-500 hover:text-white transition-colors"
                            >
                                <X size={24} />
                            </button>
                        </div>

                        {/* Modal Content - Scrollable */}
                        <div className="flex-1 overflow-y-auto p-4 md:p-10 space-y-4 custom-scrollbar">
                            {filteredOldOrders.length > 0 ? (
                                filteredOldOrders.map((order) => (
                                    <OrderCard key={order.id} order={order} />
                                ))
                            ) : (
                                <div className="text-center py-20">
                                    <Package size={48} className="mx-auto text-slate-800 mb-4" />
                                    <p className="text-slate-500">Nessun ordine nel periodo selezionato.</p>
                                </div>
                            )}
                        </div>

                        {/* Modal Footer */}
                        <div className="p-6 md:p-8 bg-black/40 border-t border-white/5 flex justify-center">
                            <button
                                onClick={() => setShowOldOrders(false)}
                                className="px-10 py-4 bg-white text-black font-black uppercase tracking-widest text-xs rounded-2xl hover:bg-primary transition-all active:scale-95"
                            >
                                Chiudi Archivio
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div >
    );
};
