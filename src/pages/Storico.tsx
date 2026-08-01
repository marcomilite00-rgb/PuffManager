import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import { safeNumber, formatEur } from '../lib/money';
import { useToast } from '../components/ui/ToastProvider';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { EmptyState } from '../components/ui/EmptyState';
import {
    Search, ChevronDown, ChevronUp, Package, User, TrendingUp, Filter,
    Download, Calendar, Euro, Archive, ShoppingCart, Clock, Trash2
} from 'lucide-react';
import { clsx } from 'clsx';
import { Badge } from '../components/ui/Badge';
import { PageSkeleton } from '../components/ui/PageSkeleton';
import type { OrderWithItems, StaffMinimal, ArchivedLoad } from '../types/database';

export const Storico: React.FC = () => {
    const { showToast } = useToast();
    const [orders, setOrders] = useState<OrderWithItems[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [showAllArchivedOrders, setShowAllArchivedOrders] = useState(false);
    const [staffList, setStaffList] = useState<StaffMinimal[]>([]);
    const [viewMode, setViewMode] = useState<'orders' | 'sessions'>('orders');
    const [archivedLoads, setArchivedLoads] = useState<ArchivedLoad[]>([]);
    const [filterStaff, setFilterStaff] = useState<string>('all');
    const [filterDateStart, setFilterDateStart] = useState<string>('');
    const [filterDateEnd, setFilterDateEnd] = useState<string>('');
    const [filterMinAmount, setFilterMinAmount] = useState<string>('');
    const [filterMaxAmount, setFilterMaxAmount] = useState<string>('');
    const [showFilters, setShowFilters] = useState(false);
    const [selectedLoad, setSelectedLoad] = useState<ArchivedLoad | null>(null);
    const [lastResetDate, setLastResetDate] = useState<string | null>(null);
    const [deleteConfirmLoad, setDeleteConfirmLoad] = useState<ArchivedLoad | null>(null);

    useEffect(() => { fetchData(); }, []);

    const fetchData = async () => {
        try {
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
            const combinedLoads: ArchivedLoad[] = [];
            if (loadsRes.data) combinedLoads.push(...loadsRes.data);
            if (legacyLoadsRes.data) {
                combinedLoads.push(...legacyLoadsRes.data.map((l: { id: string; created_at: string; gross_total: number; money_spent_moved?: number | null; reinvest_amount?: number | null }) => ({
                    id: l.id, closed_at: l.created_at, gross_total: l.gross_total,
                    soldi_spesi_carico: l.money_spent_moved || l.reinvest_amount,
                    pezzi_comprati: 0, is_legacy: true, items_sold_snapshot: []
                })));
            }
            setArchivedLoads(combinedLoads.sort((a, b) => new Date(b.closed_at || b.created_at).getTime() - new Date(a.closed_at || a.created_at).getTime()));
        } catch (error) {
            console.error('Storico load error:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteSession = async () => {
        if (!deleteConfirmLoad) return;
        const load = deleteConfirmLoad;
        const closedAt = new Date(load.closed_at);
        const sortedLoads = [...archivedLoads].sort((a, b) => new Date(a.closed_at).getTime() - new Date(b.closed_at).getTime());
        const idx = sortedLoads.findIndex(l => l.id === load.id);
        const prevClosedAt = idx > 0 ? new Date(sortedLoads[idx - 1].closed_at) : new Date(0);

        const { error: ordersError } = await supabase
            .from('orders').delete()
            .eq('is_archived', true)
            .gte('created_at', prevClosedAt.toISOString())
            .lt('created_at', closedAt.toISOString());

        if (ordersError) { showToast('Errore eliminazione ordini: ' + ordersError.message, 'error'); setDeleteConfirmLoad(null); return; }

        const { error: loadError } = await supabase.from('archived_loads').delete().eq('id', load.id);
        if (loadError) { showToast('Errore eliminazione sessione: ' + loadError.message, 'error'); setDeleteConfirmLoad(null); return; }

        fetchData();
        showToast('Sessione eliminata', 'success');
        setDeleteConfirmLoad(null);
    };

    const filteredOrders = useMemo(() => {
        return orders.filter(order => {
            const matchesSearch = (order.customer_name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
                (order.staff?.name?.toLowerCase() || '').includes(searchTerm.toLowerCase());
            const matchesStaff = filterStaff === 'all' || order.sold_by_staff_id === filterStaff;
            const orderDate = new Date(order.created_at).toLocaleDateString('en-CA');
            const matchesDateStart = !filterDateStart || orderDate >= filterDateStart;
            const matchesDateEnd = !filterDateEnd || orderDate <= filterDateEnd;
            const amount = safeNumber(order.gross_total);
            const matchesMin = !filterMinAmount || amount >= safeNumber(filterMinAmount);
            const matchesMax = !filterMaxAmount || amount <= safeNumber(filterMaxAmount);
            return matchesSearch && matchesStaff && matchesDateStart && matchesDateEnd && matchesMin && matchesMax;
        });
    }, [orders, searchTerm, filterStaff, filterDateStart, filterDateEnd, filterMinAmount, filterMaxAmount]);

    const exportToCSV = () => {
        const esc = (v: unknown) => {
            const s = String(v ?? '');
            return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };
        const headers = ['Data', 'Cliente', 'Staff', 'Lordo (€)', 'Articoli'];
        const rows = filteredOrders.map(o => [
            new Date(o.created_at).toLocaleString('it-IT'),
            o.customer_name || 'Generic', o.staff?.name || 'Unknown', safeNumber(o.gross_total).toFixed(2), (o.items || []).length
        ]);
        const csvContent = "data:text/csv;charset=utf-8," +
            headers.join(',') + "\n" +
            rows.map(r => r.map(esc).join(',')).join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `storico_ordini_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
        showToast('CSV esportato!', 'success');
    };

    if (loading) return (
        <PageSkeleton titleClass="w-48 h-10" blocks={[{ count: 3, className: 'h-32' }, { count: 5, className: 'h-24' }]} />
    );

    return (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-3 md:space-y-6">
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3">
                <div className="space-y-1">
                    <h1 className="text-2xl md:text-4xl font-black italic tracking-tighter text-white uppercase leading-none">
                        Storico<span className="text-primary not-italic">{viewMode === 'orders' ? 'Ordini' : 'Sessioni'}</span>
                    </h1>
                    <p className="label-caps text-[9px] md:text-xs text-slate-500">
                        {viewMode === 'orders' ? 'Archivio completo delle transazioni' : 'Registro delle chiusure cassa effettuate'}
                    </p>
                </div>
                <div className="flex flex-wrap gap-1.5 md:gap-2">
                    <div className="flex p-0.5 bg-white/5 rounded-lg md:rounded-xl border border-white/5 mr-auto md:mr-0 w-full md:w-auto">
                        <button onClick={() => setViewMode('orders')}
                            className={clsx("flex-1 md:flex-none px-3 py-1.5 md:px-4 md:py-2 rounded-md md:rounded-lg font-black label-caps text-[9px] md:text-[10px] transition-all flex items-center justify-center gap-1.5",
                                viewMode === 'orders' ? "bg-primary text-surface-950" : "text-slate-500 hover:text-white")}>
                            <ShoppingCart size={12} /><span>Ordini</span>
                        </button>
                        <button onClick={() => setViewMode('sessions')}
                            className={clsx("flex-1 md:flex-none px-3 py-1.5 md:px-4 md:py-2 rounded-md md:rounded-lg font-black label-caps text-[9px] md:text-[10px] transition-all flex items-center justify-center gap-1.5",
                                viewMode === 'sessions' ? "bg-primary text-surface-950" : "text-slate-500 hover:text-white")}>
                            <Archive size={12} /><span>Archivio</span>
                        </button>
                    </div>
                    <div className="flex gap-1.5 w-full md:w-auto">
                        {viewMode === 'orders' && (
                            <button onClick={() => setShowFilters(!showFilters)}
                                className={clsx("flex-1 md:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 md:px-4 md:py-2 rounded-lg md:rounded-xl font-black label-caps text-[9px] md:text-[10px] transition-all border",
                                    showFilters ? "bg-primary text-surface-950 border-primary" : "bg-surface-900 text-slate-400 border-white/5")}>
                                <Filter size={12} /><span>Filtri</span>
                                {filteredOrders.length !== orders.length && <span>({filteredOrders.length})</span>}
                            </button>
                        )}
                        <button onClick={exportToCSV}
                            className="flex-1 md:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 md:px-4 md:py-2 bg-surface-900 border border-white/5 text-white font-black rounded-lg md:rounded-xl hover:bg-white/5 transition-all label-caps text-[9px] md:text-[10px]">
                            <Download size={12} /><span>CSV</span>
                        </button>
                    </div>
                </div>
            </div>

            {showFilters && (
                <div className="p-4 md:p-6 glass rounded-[2rem] border-primary/20 bg-primary/5 animate-slide-up grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="space-y-2">
                        <label className="label-caps text-[9px] text-primary flex items-center gap-1.5"><User size={10} /> Staff</label>
                        <select value={filterStaff} onChange={(e) => setFilterStaff(e.target.value)}
                            className="w-full bg-surface-950 border border-white/10 rounded-xl py-2 px-3 text-white font-bold text-xs focus:ring-1 focus:ring-primary/50">
                            <option value="all">Tutti</option>
                            {staffList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    </div>
                    <div className="space-y-2">
                        <label className="label-caps text-[9px] text-primary flex items-center gap-1.5"><Calendar size={10} /> Range Date</label>
                        <div className="flex gap-1.5">
                            <input type="date" value={filterDateStart} onChange={(e) => setFilterDateStart(e.target.value)}
                                className="flex-1 bg-surface-950 border border-white/10 rounded-xl py-2 px-2 text-white text-[10px] font-bold" />
                            <input type="date" value={filterDateEnd} onChange={(e) => setFilterDateEnd(e.target.value)}
                                className="flex-1 bg-surface-950 border border-white/10 rounded-xl py-2 px-2 text-white text-[10px] font-bold" />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <label className="label-caps text-[9px] text-primary flex items-center gap-1.5"><Euro size={10} /> Importo</label>
                        <div className="flex items-center gap-1.5">
                            <input type="number" placeholder="Min" value={filterMinAmount} onChange={(e) => setFilterMinAmount(e.target.value)}
                                className="flex-1 bg-surface-950 border border-white/10 rounded-xl py-2 px-3 text-white text-xs font-bold" />
                            <span className="text-slate-600 text-xs">→</span>
                            <input type="number" placeholder="Max" value={filterMaxAmount} onChange={(e) => setFilterMaxAmount(e.target.value)}
                                className="flex-1 bg-surface-950 border border-white/10 rounded-xl py-2 px-3 text-white text-xs font-bold" />
                        </div>
                    </div>
                    <div className="flex flex-col justify-end">
                        <button onClick={() => { setFilterStaff('all'); setFilterDateStart(''); setFilterDateEnd(''); setFilterMinAmount(''); setFilterMaxAmount(''); setSearchTerm(''); }}
                            className="w-full py-2.5 bg-white/5 border border-white/10 rounded-xl text-slate-400 font-bold label-caps text-[9px] hover:text-white transition-colors">Reset Filtri</button>
                    </div>
                </div>
            )}

            <div className="relative group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-primary transition-colors" size={14} />
                <input type="text" placeholder={viewMode === 'orders' ? "Cerca cliente o staff..." : "Cerca in archivio..."}
                    value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-surface-900 border border-white/5 rounded-xl py-3 pl-10 pr-4 focus:outline-none focus:border-primary/40 text-sm font-bold italic text-white placeholder:text-slate-700 transition-all" />
            </div>

            <div className="space-y-2">
                {viewMode === 'orders' ? (
                    (() => {
                        const activeOrders = filteredOrders.filter(o => {
                            if (o.is_archived) return false;
                            if (lastResetDate && new Date(o.created_at) < new Date(lastResetDate)) return false;
                            return true;
                        });
                        if (activeOrders.length === 0) {
                            return <EmptyState icon={ShoppingCart} title="Nessuna transazione in questa sessione" />;
                        }
                        return activeOrders.map((order) => {
                            const isExpanded = expandedId === order.id;
                            const date = new Date(order.created_at);
                            const items = order.items || [];
                            return (
                                <div key={order.id} className="glass-card rounded-2xl md:rounded-[2rem] border-white/5 overflow-hidden group">
                                    <div onClick={() => setExpandedId(isExpanded ? null : order.id)}
                                        className="p-4 md:p-6 lg:p-8 flex items-center justify-between gap-4 cursor-pointer">
                                        <div className="flex items-center gap-4 md:gap-6 min-w-0">
                                            <div className={clsx("w-12 h-12 md:w-16 md:h-16 rounded-xl md:rounded-[1.5rem] flex items-center justify-center transition-transform group-hover:scale-110 duration-500 relative shrink-0",
                                                order.status === 'PARTIAL_PAYMENT' ? "bg-warning/10 text-warning" : "bg-success/10 text-success")}>
                                                <TrendingUp size={24} className="md:w-7 md:h-7" />
                                                {order.status === 'PARTIAL_PAYMENT' && <div className="absolute -top-1 -right-1 w-3 h-3 bg-warning rounded-full border-2 border-surface-900" />}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-xl md:text-3xl font-black text-white italic tracking-tighter leading-tight tabular-nums">€{Number(order.gross_total).toFixed(2)}</p>
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
                                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                                                className="bg-black/40 border-t border-white/5 overflow-hidden">
                                                <div className="p-4 md:p-8 space-y-4 md:space-y-6">
                                                    <div className="label-caps text-[10px] text-slate-500 flex items-center gap-2 px-1"><Package size={14} /> Composizione Ordine</div>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                                                        {items.map((item) => (
                                                            <div key={item.id} className="p-3 md:p-5 glass-card rounded-xl md:rounded-[1.5rem] border-white/5 flex items-center justify-between">
                                                                <div className="min-w-0">
                                                                    <p className="font-black text-white text-xs md:text-base leading-tight uppercase truncate">{item.variant?.model?.name}</p>
                                                                    <p className="text-[9px] md:text-[10px] label-caps text-slate-500 mt-1 italic">{item.variant?.flavor?.name}</p>
                                                                </div>
                                                                <div className="text-right shrink-0 ml-4">
                                                                    <p className="text-sm md:text-lg font-black text-primary italic tabular-nums">€{formatEur(safeNumber(item.unit_price_final) * safeNumber(item.qty))}</p>
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
                                                            <span className="text-2xl md:text-4xl font-black text-white italic tracking-tighter tabular-nums">€{Number(order.gross_total).toFixed(2)}</span>
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
                    <div className="space-y-8">
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
                                        {archivedOrders.slice(0, showAllArchivedOrders ? Infinity : 5).map((order) => {
                                            const isExpanded = expandedId === order.id;
                                            const date = new Date(order.created_at);
                                            return (
                                                <div key={order.id} className="glass-card rounded-2xl md:rounded-[1.5rem] border-white/5 overflow-hidden group opacity-60 hover:opacity-100 transition-all duration-300">
                                                    <div onClick={() => setExpandedId(isExpanded ? null : order.id)}
                                                        className="p-4 md:p-5 flex items-center justify-between gap-4 cursor-pointer">
                                                        <div className="flex items-center gap-4 min-w-0">
                                                            <div className="min-w-0">
                                                                <p className="text-base md:text-lg font-black text-white italic tracking-tighter leading-tight tabular-nums">€{Number(order.gross_total).toFixed(2)}</p>
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
                                                            <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
                                                                className="bg-black/40 border-t border-white/5 p-4 space-y-3">
                                                                {(order.items || []).map((item) => (
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
                                        {archivedOrders.length > 5 && !showAllArchivedOrders && (
                                            <button onClick={() => setShowAllArchivedOrders(true)}
                                                className="w-full py-3 text-center text-slate-500 text-[10px] label-caps hover:text-white transition-colors">
                                                Mostra tutti gli ordini archiviati ({archivedOrders.length})
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })()}

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
                                        return (l.gross_total?.toString().includes(s) || new Date(l.closed_at).toLocaleDateString().includes(s));
                                    });
                                    return filteredLoads.length > 0 ? filteredLoads.map((load) => (
                                        <div key={load.id} className="glass-card rounded-2xl md:rounded-[2rem] border-white/5 overflow-hidden">
                                            <div className="p-4 md:p-6 lg:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-12 h-12 md:w-16 md:h-16 rounded-xl md:rounded-2xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                                                        <Archive size={24} />
                                                    </div>
                                                    <div>
                                                        <p className="text-xl md:text-3xl font-black text-white italic tracking-tighter leading-tight tabular-nums">€{Number(load.gross_total).toFixed(2)}</p>
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
                                                        <span className="text-primary italic tabular-nums">€{Number(load.unit_cost_calcolato || (load.pezzi_comprati ? (load.soldi_spesi_carico / load.pezzi_comprati) : 0)).toFixed(2)}</span>
                                                    </div>
                                                    <div className="px-3 py-1.5 bg-white/5 rounded-lg border border-white/5">
                                                        <span className="text-slate-500 mr-2 uppercase">SPESA:</span>
                                                        <span className="text-white italic tabular-nums">€{Number(load.soldi_spesi_carico || 0).toFixed(0)}</span>
                                                    </div>
                                                    <button onClick={() => setSelectedLoad(selectedLoad?.id === load.id ? null : load)}
                                                        className="px-3 py-1.5 bg-primary text-surface-950 rounded-lg font-black uppercase tracking-tighter">
                                                        {selectedLoad?.id === load.id ? 'CHIUDI' : 'DETTAGLI'}
                                                    </button>
                                                    <button onClick={() => !load.is_legacy && setDeleteConfirmLoad(load)}
                                                        disabled={load.is_legacy}
                                                        className={clsx("w-9 h-9 flex items-center justify-center rounded-lg active:scale-90 transition-all border",
                                                            load.is_legacy ? "bg-white/5 border-white/5 text-slate-700 cursor-not-allowed opacity-40" : "bg-danger/10 border-danger/20 text-danger hover:bg-danger/20")}
                                                        title={load.is_legacy ? "Sessione legacy: non è possibile eliminare" : "Elimina sessione"}>
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                            <AnimatePresence>
                                                {selectedLoad?.id === load.id && (
                                                    <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
                                                        className="border-t border-white/5 bg-black/40 overflow-hidden">
                                                        <div className="p-4 md:p-8 space-y-4">
                                                            <h4 className="label-caps text-[10px] text-slate-500 flex items-center gap-2 px-1"><Package size={14} /> Venduto in questa sessione</h4>
                                                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                                                {load.items_sold_snapshot?.map((item, idx) => (
                                                                    <div key={idx} className="p-3 bg-white/5 rounded-xl border border-white/5 flex justify-between items-center">
                                                                        <div className="min-w-0">
                                                                            <p className="text-[10px] font-black text-white uppercase truncate">{item.model_name}</p>
                                                                            <p className="text-[8px] text-slate-500 truncate">{item.flavor_name}</p>
                                                                            {item.customer_name && <p className="text-[8px] text-primary/80 mt-0.5 font-bold italic truncate">👤 {item.customer_name}</p>}
                                                                        </div>
                                                                        <div className="text-right">
                                                                            <p className="text-xs font-black text-primary italic">{item.qty}pz</p>
                                                                            <p className="text-[8px] text-slate-600 uppercase tabular-nums">€{item.price}</p>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                                {load.is_legacy && <div className="col-span-full py-4 text-center">
                                                                    <p className="text-[10px] text-slate-500 italic">Dettaglio non disponibile per sessioni legacy</p>
                                                                </div>}
                                                            </div>
                                                        </div>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    )) : (
                                        <EmptyState icon={Package} title="Nessun risultato trovato" />
                                    );
                                })()}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <ConfirmModal isOpen={!!deleteConfirmLoad} onClose={() => setDeleteConfirmLoad(null)}
                onConfirm={handleDeleteSession}
                title="Elimina Sessione" message="Questa operazione è irreversibile. Verranno eliminati tutti gli ordini archiviati in quella sessione."
                variant="danger" confirmLabel="Elimina Sessione" />
        </motion.div>
    );
};
