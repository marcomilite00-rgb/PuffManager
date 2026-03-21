import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import { safeNumber, formatEur } from '../lib/money';
import {
    Search,
    ChevronDown,
    ChevronUp,
    Package,
    User,
    TrendingUp,
    Filter,
    Download,
    Calendar,
    Euro,
    Archive,
    ShoppingCart,
    Clock
} from 'lucide-react';
import { clsx } from 'clsx';
import { Badge } from '../components/ui/Badge';

export const Storico: React.FC = () => {
    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [staffList, setStaffList] = useState<any[]>([]);

    // Filter States
    const [viewMode, setViewMode] = useState<'orders' | 'sessions'>('orders');
    const [archivedLoads, setArchivedLoads] = useState<any[]>([]);
    const [filterStaff, setFilterStaff] = useState<string>('all');
    const [filterDateStart, setFilterDateStart] = useState<string>('');
    const [filterDateEnd, setFilterDateEnd] = useState<string>('');
    const [filterMinAmount, setFilterMinAmount] = useState<string>('');
    const [filterMaxAmount, setFilterMaxAmount] = useState<string>('');
    const [showFilters, setShowFilters] = useState(false);
    const [selectedLoad, setSelectedLoad] = useState<any>(null);
    const [lastResetDate, setLastResetDate] = useState<string | null>(null);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        const [ordersRes, staffRes, loadsRes, legacyLoadsRes, settingsRes] = await Promise.all([
            supabase.from('orders').select('*, items:order_items(*, variant:product_variants(model:product_models(name), flavor:product_flavors(name), unit_cost)), staff:staff(name)').order('created_at', { ascending: false }),
            supabase.from('staff').select('id, name').order('name'),
            supabase.from('archived_loads').select('*').order('closed_at', { ascending: false }),
            supabase.from('load_history').select('*').order('created_at', { ascending: false }),
            supabase.from('settings').select('last_reset_date').limit(1).single()
        ]);
        
        if (ordersRes.data) setOrders(ordersRes.data);
        if (staffRes.data) setStaffList(staffRes.data);
        if (settingsRes.data) setLastResetDate(settingsRes.data.last_reset_date);

        // Merge legacy and new loads
        const combinedLoads: any[] = [];
        if (loadsRes.data) combinedLoads.push(...loadsRes.data);
        if (legacyLoadsRes.data) {
            combinedLoads.push(...legacyLoadsRes.data.map((l: any) => ({
                id: l.id,
                closed_at: l.created_at,
                gross_total: l.gross_total,
                soldi_spesi_carico: l.money_spent_moved || l.reinvest_amount,
                pezzi_comprati: 0,
                is_legacy: true,
                items_sold_snapshot: []
            })));
        }
        setArchivedLoads(combinedLoads.sort((a, b) => new Date(b.closed_at || b.created_at).getTime() - new Date(a.closed_at || a.created_at).getTime()));
        
        setLoading(false);
    };

    const filteredOrders = useMemo(() => {
        return orders.filter(order => {
            const matchesSearch = (order.customer_name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
                (order.staff?.name?.toLowerCase() || '').includes(searchTerm.toLowerCase());
            
            const matchesStaff = filterStaff === 'all' || order.staff_id === filterStaff;
            
            const orderDate = new Date(order.created_at).toISOString().split('T')[0];
            const matchesDateStart = !filterDateStart || orderDate >= filterDateStart;
            const matchesDateEnd = !filterDateEnd || orderDate <= filterDateEnd;
            
            const amount = Number(order.gross_total);
            const matchesMin = !filterMinAmount || amount >= Number(filterMinAmount);
            const matchesMax = !filterMaxAmount || amount <= Number(filterMaxAmount);

            return matchesSearch && matchesStaff && matchesDateStart && matchesDateEnd && matchesMin && matchesMax;
        });
    }, [orders, searchTerm, filterStaff, filterDateStart, filterDateEnd, filterMinAmount, filterMaxAmount]);

    const exportToCSV = () => {
        const headers = ['Data', 'Cliente', 'Staff', 'Lordo (€)', 'Articoli'];
        const rows = filteredOrders.map(o => [
            new Date(o.created_at).toLocaleString('it-IT').replace(',', ''),
            o.customer_name || 'Generic',
            o.staff?.name || 'Unknown',
            o.gross_total,
            (o.items || []).length
        ]);

        const csvContent = "data:text/csv;charset=utf-8," 
            + headers.join(',') + "\n"
            + rows.map(r => r.join(',')).join("\n");

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `storico_ordini_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    if (loading) return (
        <div className="p-6 space-y-8 animate-pulse">
            <div className="h-12 w-64 skeleton" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[...Array(3)].map((_, i) => <div key={i} className="h-32 skeleton" />)}
            </div>
            <div className="space-y-4">
                {[...Array(5)].map((_, i) => <div key={i} className="h-24 skeleton" />)}
            </div>
        </div>
    );

    return (
        <div className="space-y-6 md:space-y-10 animate-fade safe-area-pt pb-20">
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 px-4 md:px-6">
                <div className="space-y-2">
                    <h1 className="text-3xl md:text-5xl lg:text-6xl font-black italic tracking-tighter text-white uppercase leading-none">
                        Storico<span className="text-primary not-italic">{viewMode === 'orders' ? 'Ordini' : 'Sessioni'}</span>
                    </h1>
                    <p className="label-caps text-[10px] md:text-xs text-slate-500">
                        {viewMode === 'orders' ? 'Archivio completo delle transazioni' : 'Registro delle chiusure cassa effettuate'}
                    </p>
                </div>

                <div className="flex flex-wrap gap-2 md:gap-3">
                    <div className="flex p-1 bg-white/5 rounded-xl md:rounded-2xl border border-white/5 mr-auto md:mr-0 w-full md:w-auto">
                        <button 
                            onClick={() => setViewMode('orders')}
                            className={clsx(
                                "flex-1 md:flex-none px-4 py-2 md:px-6 md:py-3 rounded-lg md:rounded-xl font-black label-caps text-[10px] md:text-xs transition-all flex items-center justify-center gap-2",
                                viewMode === 'orders' ? "bg-primary text-surface-950" : "text-slate-500 hover:text-white"
                            )}
                        >
                            <ShoppingCart size={14} />
                            <span>Ordini</span>
                        </button>
                        <button 
                            onClick={() => setViewMode('sessions')}
                            className={clsx(
                                "flex-1 md:flex-none px-4 py-2 md:px-6 md:py-3 rounded-lg md:rounded-xl font-black label-caps text-[10px] md:text-xs transition-all flex items-center justify-center gap-2",
                                viewMode === 'sessions' ? "bg-primary text-surface-950" : "text-slate-500 hover:text-white"
                            )}
                        >
                            <Archive size={14} />
                            <span>Archivio</span>
                        </button>
                    </div>

                    <div className="flex gap-2 w-full md:w-auto">
                        {viewMode === 'orders' && (
                            <button 
                                onClick={() => setShowFilters(!showFilters)}
                                className={clsx(
                                    "flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-3 md:px-6 md:py-4 rounded-xl md:rounded-2xl font-black label-caps text-[10px] md:text-xs transition-all border",
                                    showFilters ? "bg-primary text-surface-950 border-primary shadow-lg" : "bg-surface-900 text-slate-400 border-white/5"
                                )}
                            >
                                <Filter size={16} />
                                <span className="hidden sm:inline">Filtri</span>
                                {filteredOrders.length !== orders.length && <span>({filteredOrders.length})</span>}
                            </button>
                        )}
                        <button 
                            onClick={exportToCSV}
                            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-3 md:px-6 md:py-4 bg-surface-900 border border-white/5 text-white font-black rounded-xl md:rounded-2xl hover:bg-white/5 transition-all label-caps text-[10px] md:text-xs"
                        >
                            <Download size={16} />
                            <span className="hidden sm:inline">Esporta</span>
                            <span className="sm:hidden">CSV</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Filters Panels */}
            {showFilters && (
                <div className="mx-4 md:mx-6 p-8 glass rounded-[2.5rem] border-primary/20 bg-primary/5 animate-slide-up grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 relative overflow-hidden">
                    <div className="space-y-3">
                        <label className="label-caps text-[10px] text-primary px-1 flex items-center gap-2"><User size={12}/> Staff</label>
                        <select 
                            value={filterStaff}
                            onChange={(e) => setFilterStaff(e.target.value)}
                            className="w-full bg-surface-950 border border-white/10 rounded-xl py-3 px-4 text-white font-bold focus:ring-1 focus:ring-primary/50"
                        >
                            <option value="all">Tutti i membri</option>
                            {staffList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    </div>

                    <div className="space-y-3">
                        <label className="label-caps text-[10px] text-primary px-1 flex items-center gap-2"><Calendar size={12}/> Range Date</label>
                        <div className="flex gap-2">
                            <input 
                                type="date"
                                value={filterDateStart}
                                onChange={(e) => setFilterDateStart(e.target.value)}
                                className="flex-1 bg-surface-950 border border-white/10 rounded-xl py-3 px-3 text-white text-xs font-bold"
                            />
                            <input 
                                type="date"
                                value={filterDateEnd}
                                onChange={(e) => setFilterDateEnd(e.target.value)}
                                className="flex-1 bg-surface-950 border border-white/10 rounded-xl py-3 px-3 text-white text-xs font-bold"
                            />
                        </div>
                    </div>

                    <div className="space-y-3">
                        <label className="label-caps text-[10px] text-primary px-1 flex items-center gap-2"><Euro size={12}/> Importo Bruto</label>
                        <div className="flex items-center gap-2">
                            <input 
                                type="number"
                                placeholder="Min"
                                value={filterMinAmount}
                                onChange={(e) => setFilterMinAmount(e.target.value)}
                                className="flex-1 bg-surface-950 border border-white/10 rounded-xl py-3 px-4 text-white text-sm font-bold"
                            />
                            <span className="text-slate-600">→</span>
                            <input 
                                type="number"
                                placeholder="Max"
                                value={filterMaxAmount}
                                onChange={(e) => setFilterMaxAmount(e.target.value)}
                                className="flex-1 bg-surface-950 border border-white/10 rounded-xl py-3 px-4 text-white text-sm font-bold"
                            />
                        </div>
                    </div>

                    <div className="flex flex-col justify-end">
                        <button 
                            onClick={() => {
                                setFilterStaff('all');
                                setFilterDateStart('');
                                setFilterDateEnd('');
                                setFilterMinAmount('');
                                setFilterMaxAmount('');
                                setSearchTerm('');
                            }}
                            className="w-full py-3.5 bg-white/5 border border-white/10 rounded-xl text-slate-400 font-bold label-caps text-[10px] hover:text-white transition-colors"
                        >
                            Reset Filtri
                        </button>
                    </div>
                </div>
            )}

            {/* Quick Search and Overview */}
            <div className="px-4 md:px-6 relative group">
                <Search className="absolute left-10 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-primary transition-colors" size={18} />
                <input
                    type="text"
                    placeholder={viewMode === 'orders' ? "Cerca cliente o staff..." : "Cerca in archivio..."}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-surface-900 border border-white/5 rounded-2xl py-4 md:py-5 pl-14 pr-6 focus:outline-none focus:ring-1 focus:ring-primary/40 text-base md:text-lg font-bold italic text-white placeholder:text-slate-700 transition-all"
                />
            </div>

            {/* Lists grid */}
            <div className="space-y-3 px-4 md:px-6">
                {viewMode === 'orders' ? (
                    (() => {
                        const activeOrders = filteredOrders.filter(o => {
                            if (o.is_archived) return false;
                            if (lastResetDate && new Date(o.created_at) < new Date(lastResetDate)) return false;
                            return true;
                        });
                        
                        if (activeOrders.length === 0) {
                            return (
                                <div className="py-20 md:py-40 text-center glass rounded-3xl border-dashed border-white/10">
                                    <ShoppingCart size={40} className="mx-auto text-slate-800 mb-6 opacity-40" />
                                    <h3 className="label-caps text-xs md:text-sm text-slate-600">Nessuna transazione in questa sessione</h3>
                                </div>
                            );
                        }

                        return activeOrders.map((order) => {
                            const isExpanded = expandedId === order.id;
                            const date = new Date(order.created_at);
                            const items = order.items || [];

                            return (
                                <div key={order.id} className="glass-card rounded-2xl md:rounded-[2rem] border-white/5 overflow-hidden group">
                                    <div
                                        onClick={() => setExpandedId(isExpanded ? null : order.id)}
                                        className="p-4 md:p-6 lg:p-8 flex items-center justify-between gap-4 cursor-pointer"
                                    >
                                        <div className="flex items-center gap-4 md:gap-6 min-w-0">
                                            <div className={clsx(
                                                "w-12 h-12 md:w-16 md:h-16 rounded-xl md:rounded-[1.5rem] flex items-center justify-center transition-transform group-hover:scale-110 duration-500 relative shrink-0",
                                                order.status === 'PARTIAL_PAYMENT' ? "bg-warning/10 text-warning" : "bg-success/10 text-success"
                                            )}>
                                                <TrendingUp size={24} className="md:w-7 md:h-7" />
                                                {order.status === 'PARTIAL_PAYMENT' && (
                                                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-warning rounded-full border-2 border-surface-900"></div>
                                                )}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-xl md:text-3xl font-black text-white italic tracking-tighter leading-tight">€{Number(order.gross_total).toFixed(2)}</p>
                                                <div className="flex flex-wrap items-center gap-2 mt-1">
                                                    <Badge variant="surface" size="xs" icon={<User size={10} />}>
                                                        {order.customer_name || 'Generico'} <span className="mx-1 text-slate-600 opacity-50">•</span> <span className="text-primary/70">{order.staff?.name || 'Sistema'}</span>
                                                    </Badge>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-4 shrink-0">
                                            <div className="text-right hidden sm:block">
                                                <p className="label-caps text-[9px] text-slate-500">Eseguito il</p>
                                                <p className="text-[11px] font-black text-slate-300">
                                                    {date.toLocaleDateString('it-IT')} <span className="text-primary italic">@{date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</span>
                                                </p>
                                            </div>
                                            <div className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center bg-white/5 rounded-full text-slate-600 group-hover:text-primary transition-colors">
                                                {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                            </div>
                                        </div>
                                    </div>

                                    <AnimatePresence>
                                        {isExpanded && (
                                            <motion.div 
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: 'auto', opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                className="bg-black/40 border-t border-white/5 overflow-hidden"
                                            >
                                                <div className="p-4 md:p-8 space-y-4 md:space-y-6">
                                                    <div className="label-caps text-[10px] text-slate-500 flex items-center gap-2 px-1"><Package size={14}/> Composizione Ordine</div>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                                                        {items.map((item: any) => (
                                                            <div key={item.id} className="p-3 md:p-5 glass-card rounded-xl md:rounded-[1.5rem] border-white/5 flex items-center justify-between">
                                                                <div className="min-w-0">
                                                                    <p className="font-black text-white text-xs md:text-base leading-tight uppercase truncate">{item.variant?.model?.name}</p>
                                                                    <p className="text-[9px] md:text-[10px] label-caps text-slate-500 mt-1 italic">{item.variant?.flavor?.name}</p>
                                                                </div>
                                                                <div className="text-right shrink-0 ml-4">
                                                                    <p className="text-sm md:text-lg font-black text-primary italic">€{formatEur(safeNumber(item.unit_price_final) * safeNumber(item.qty))}</p>
                                                                    <p className="text-[8px] md:text-[9px] label-caps text-slate-600 font-bold">{item.qty}pz × €{item.unit_price_final}</p>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>

                                                    <div className="p-4 md:p-8 glass bg-primary/5 rounded-2xl md:rounded-[2rem] border-primary/20 flex flex-col md:flex-row justify-between items-center gap-4">
                                                        <div className="text-center md:text-left">
                                                            <p className="label-caps text-[8px] md:text-[9px] text-primary mb-1">Riferimento Sessione</p>
                                                            <p className="text-[10px] md:text-xs font-bold text-slate-400 max-w-xs">{order.id}</p>
                                                        </div>
                                                        <div className="flex items-baseline gap-2">
                                                            <span className="label-caps text-[10px] md:text-xs text-slate-500">Totale Ricevuta</span>
                                                            <span className="text-2xl md:text-4xl font-black text-white italic tracking-tighter">€{Number(order.gross_total).toFixed(2)}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            );
                        });
                    })()
                ) : (
                    <div className="space-y-8 animate-in fade-in duration-700">
                        {/* Section: Archived Orders */}
                        {(() => {
                            const archivedOrders = filteredOrders.filter(o => {
                                if (o.is_archived) return true;
                                if (lastResetDate && new Date(o.created_at) < new Date(lastResetDate)) return true;
                                return false;
                            });

                            if (archivedOrders.length === 0) return null;

                            return (
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2 px-1">
                                        <Clock size={14} className="text-primary" />
                                        <h3 className="label-caps text-[10px] text-slate-500 uppercase font-black">Ordini in Archivio</h3>
                                    </div>
                                    <div className="space-y-3">
                                        {archivedOrders.slice(0, expandedId === 'show_all_archived' ? Infinity : 5).map((order) => {
                                            const isExpanded = expandedId === order.id;
                                            const date = new Date(order.created_at);
                                            return (
                                                <div key={order.id} className="glass-card rounded-2xl md:rounded-[1.5rem] border-white/5 overflow-hidden group opacity-60 hover:opacity-100 transition-all duration-300">
                                                    <div
                                                        onClick={() => setExpandedId(isExpanded ? null : order.id)}
                                                        className="p-4 md:p-5 flex items-center justify-between gap-4 cursor-pointer"
                                                    >
                                                        <div className="flex items-center gap-4 min-w-0">
                                                            <div className="min-w-0">
                                                                <p className="text-base md:text-lg font-black text-white italic tracking-tighter leading-tight">€{Number(order.gross_total).toFixed(2)}</p>
                                                                <div className="flex items-center gap-2 mt-0.5">
                                                                    <span className="text-[9px] label-caps text-slate-500">
                                                                        {order.customer_name || 'Generico'} <span className="text-primary/50 mx-1">({order.staff?.name || 'Admin'})</span> • {date.toLocaleDateString()}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="w-8 h-8 flex items-center justify-center bg-white/5 rounded-full text-slate-600 group-hover:text-primary transition-colors">
                                                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                                        </div>
                                                    </div>
                                                    <AnimatePresence>
                                                        {isExpanded && (
                                                            <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="bg-black/40 border-t border-white/5 p-4 space-y-3">
                                                                {(order.items || []).map((item: any) => (
                                                                    <div key={item.id} className="flex justify-between items-center text-[10px]">
                                                                        <span className="text-slate-300 uppercase font-bold">{item.variant?.model?.name} {item.variant?.flavor?.name}</span>
                                                                        <span className="text-primary italic">{item.qty}pz × €{item.unit_price_final}</span>
                                                                    </div>
                                                                ))}
                                                            </motion.div>
                                                        )}
                                                    </AnimatePresence>
                                                </div>
                                            );
                                        })}
                                        {archivedOrders.length > 5 && expandedId !== 'show_all_archived' && (
                                            <button onClick={() => setExpandedId('show_all_archived')} className="w-full py-3 text-center text-slate-500 text-[10px] label-caps hover:text-white transition-colors">Mostra tutti gli ordini archiviati ({archivedOrders.length})</button>
                                        )}
                                    </div>
                                </div>
                            );
                        })()}

                        {/* Section: Archived Sessions (Loads) */}
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 px-1">
                                <Archive size={14} className="text-primary" />
                                <h3 className="label-caps text-[10px] text-slate-500 uppercase font-black">Chiusure Sessioni</h3>
                            </div>
                            <div className="space-y-3">
                                {(() => {
                                    const filteredLoads = archivedLoads.filter(l => {
                                        if (!searchTerm) return true;
                                        const s = searchTerm.toLowerCase();
                                        return (l.gross_total?.toString().includes(s) || 
                                                new Date(l.closed_at).toLocaleDateString().includes(s));
                                    });

                                    return filteredLoads.length > 0 ? (
                                        filteredLoads.map((load) => (
                                        <div key={load.id} className="glass-card rounded-2xl md:rounded-[2rem] border-white/5 overflow-hidden">
                                            <div className="p-4 md:p-6 lg:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-12 h-12 md:w-16 md:h-16 rounded-xl md:rounded-2xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                                                        <Archive size={24} />
                                                    </div>
                                                    <div>
                                                        <p className="text-xl md:text-3xl font-black text-white italic tracking-tighter leading-tight">€{Number(load.gross_total).toFixed(2)}</p>
                                                        <div className="flex items-center gap-2 mt-0.5">
                                                            <Clock size={10} className="text-slate-500" />
                                                            <span className="text-[10px] label-caps text-slate-500">
                                                                {new Date(load.closed_at).toLocaleDateString()} @ {new Date(load.closed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex flex-wrap gap-2 text-[10px] font-bold">
                                                    <div className="px-3 py-1.5 bg-white/5 rounded-lg border border-white/5">
                                                        <span className="text-slate-500 mr-2 uppercase">COSTO U:</span>
                                                        <span className="text-primary italic">€{Number(load.unit_cost_calcolato || 0).toFixed(2)}</span>
                                                    </div>
                                                    <div className="px-3 py-1.5 bg-white/5 rounded-lg border border-white/5">
                                                        <span className="text-slate-500 mr-2 uppercase">SPESA:</span>
                                                        <span className="text-white italic">€{Number(load.soldi_spesi_carico || 0).toFixed(0)}</span>
                                                    </div>
                                                    <button 
                                                        onClick={() => setSelectedLoad(selectedLoad?.id === load.id ? null : load)}
                                                        className="px-3 py-1.5 bg-primary text-surface-950 rounded-lg font-black uppercase tracking-tighter"
                                                    >
                                                        {selectedLoad?.id === load.id ? 'CHIUDI' : 'DETTAGLI'}
                                                    </button>
                                                </div>
                                            </div>
                                            
                                            <AnimatePresence>
                                                {selectedLoad?.id === load.id && (
                                                    <motion.div 
                                                        initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
                                                        className="border-t border-white/5 bg-black/40 overflow-hidden"
                                                    >
                                                        <div className="p-4 md:p-8 space-y-4">
                                                            <h4 className="label-caps text-[10px] text-slate-500 flex items-center gap-2 px-1"><Package size={14}/> Venduto in questa sessione</h4>
                                                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                                                {load.items_sold_snapshot?.map((item: any, idx: number) => (
                                                                    <div key={idx} className="p-3 bg-white/5 rounded-xl border border-white/5 flex justify-between items-center">
                                                                        <div className="min-w-0">
                                                                            <p className="text-[10px] font-black text-white uppercase truncate">{item.model_name}</p>
                                                                            <p className="text-[8px] text-slate-500 truncate">{item.flavor_name}</p>
                                                                        </div>
                                                                        <div className="text-right">
                                                                            <p className="text-xs font-black text-primary italic">{item.qty}pz</p>
                                                                            <p className="text-[8px] text-slate-600 uppercase">€{item.price}</p>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                                {load.is_legacy && (
                                                                    <div className="col-span-full py-4 text-center">
                                                                        <p className="text-[10px] text-slate-500 italic">Dettaglio non disponibile per sessioni legacy</p>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    ))
                                ) : (
                                    <div className="py-10 text-center glass rounded-2xl border-dashed border-white/5">
                                        <p className="text-[10px] label-caps text-slate-600">Nessun risultato trovato</p>
                                    </div>
                                );
                            })()}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
