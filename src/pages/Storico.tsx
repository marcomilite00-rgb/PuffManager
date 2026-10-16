import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { motion, AnimatePresence } from 'motion/react';
import { safeNumber, formatEur } from '../lib/money';
import { useToast } from '../components/ui/ToastProvider';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { EmptyState } from '../components/ui/EmptyState';
import { Search, ChevronDown, Package, Download, Trash2, X } from 'lucide-react';
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
            setArchivedLoads(combinedLoads.sort((a, b) => new Date(b.closed_at || b.created_at || 0).getTime() - new Date(a.closed_at || a.created_at || 0).getTime()));
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
            o.customer_name || 'Generico', o.staff?.name || 'Sconosciuto', safeNumber(o.gross_total).toFixed(2), (o.items || []).length
        ]);
        const csvContent = "data:text/csv;charset=utf-8," +
            headers.join(',') + "\n" +
            rows.map(r => r.map(esc).join(',')).join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `storico_ordini_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
        showToast('CSV esportato', 'success');
    };

    const resetFilters = () => { setFilterStaff('all'); setFilterDateStart(''); setFilterDateEnd(''); setFilterMinAmount(''); setFilterMaxAmount(''); setSearchTerm(''); };

    if (loading) return (
        <PageSkeleton titleClass="w-48 h-9" blocks={[{ count: 1, className: 'h-12' }, { count: 5, className: 'h-[68px]' }]} />
    );

    const activeOrders = filteredOrders.filter(o => {
        if (o.is_archived) return false;
        if (lastResetDate && new Date(o.created_at) < new Date(lastResetDate)) return false;
        return true;
    });
    const archivedOrders = filteredOrders.filter(o => {
        if (o.is_archived) return true;
        if (lastResetDate && new Date(o.created_at) < new Date(lastResetDate)) return true;
        return false;
    });
    const filteredLoads = archivedLoads.filter(l => {
        if (!searchTerm) return true;
        const s = searchTerm.toLowerCase();
        return (l.gross_total?.toString().includes(s) || new Date(l.closed_at).toLocaleDateString().includes(s));
    });

    return (
        <div className="ios-page">
            <div className="flex items-end justify-between gap-3">
                <div>
                    <h1 className="ios-title-large">Storico</h1>
                    <p className="ios-footnote mt-0.5">{viewMode === 'orders' ? `${activeOrders.length} ordini in sessione` : `${filteredLoads.length} chiusure registrate`}</p>
                </div>
                <button onClick={exportToCSV} className="ios-press flex items-center gap-1.5 px-3 py-2 rounded-xl text-[14px] font-medium shrink-0" style={{ background: 'var(--surface-secondary)', color: 'var(--accent)' }}>
                    <Download size={15} /> CSV
                </button>
            </div>

            <div className="ios-segmented" role="tablist">
                <button role="tab" aria-selected={viewMode === 'orders'} onClick={() => setViewMode('orders')}>Ordini</button>
                <button role="tab" aria-selected={viewMode === 'sessions'} onClick={() => setViewMode('sessions')}>Sessioni</button>
            </div>

            <div className="ios-search">
                <Search size={18} style={{ color: 'var(--label-tertiary)', flexShrink: 0 }} />
                <input type="search" placeholder={viewMode === 'orders' ? 'Cerca cliente o staff' : 'Cerca in archivio'} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} aria-label="Cerca" />
                {searchTerm && <button onClick={() => setSearchTerm('')} className="ios-press" style={{ color: 'var(--label-tertiary)' }} aria-label="Pulisci"><X size={16} /></button>}
            </div>

            {viewMode === 'orders' && (
                <div className="ios-card">
                    <button onClick={() => setShowFilters(!showFilters)} className="ios-press w-full flex items-center justify-between p-4">
                        <span className="ios-headline text-[15px]">Filtri{(filteredOrders.length !== orders.length) && <span className="ios-footnote"> · {filteredOrders.length}</span>}</span>
                        <ChevronDown size={18} style={{ transform: showFilters ? 'rotate(180deg)' : undefined, color: 'var(--label-tertiary)' }} />
                    </button>
                    <AnimatePresence initial={false}>
                        {showFilters && (
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                                <div className="px-4 pb-4 grid gap-3">
                                    <div>
                                        <label className="ios-footnote block mb-1">Staff</label>
                                        <select value={filterStaff} onChange={(e) => setFilterStaff(e.target.value)} className="ios-input">
                                            <option value="all">Tutti</option>
                                            {staffList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                        </select>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2.5">
                                        <div>
                                            <label className="ios-footnote block mb-1">Dal</label>
                                            <input type="date" value={filterDateStart} onChange={(e) => setFilterDateStart(e.target.value)} className="ios-input" />
                                        </div>
                                        <div>
                                            <label className="ios-footnote block mb-1">Al</label>
                                            <input type="date" value={filterDateEnd} onChange={(e) => setFilterDateEnd(e.target.value)} className="ios-input" />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2.5">
                                        <div>
                                            <label className="ios-footnote block mb-1">Min €</label>
                                            <input type="number" placeholder="0" value={filterMinAmount} onChange={(e) => setFilterMinAmount(e.target.value)} className="ios-input ios-amount" />
                                        </div>
                                        <div>
                                            <label className="ios-footnote block mb-1">Max €</label>
                                            <input type="number" placeholder="—" value={filterMaxAmount} onChange={(e) => setFilterMaxAmount(e.target.value)} className="ios-input ios-amount" />
                                        </div>
                                    </div>
                                    <button onClick={resetFilters} className="ios-press py-2.5 rounded-xl text-[15px]" style={{ background: 'var(--surface-tertiary)', color: 'var(--label-secondary)' }}>
                                        Azzera filtri
                                    </button>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            )}

            {viewMode === 'orders' ? (
                activeOrders.length === 0 ? (
                    <EmptyState title="Nessun ordine" subtitle="Nessuna transazione in questa sessione" />
                ) : (
                    <div className="ios-grouped">
                        {activeOrders.map((order) => {
                            const isExpanded = expandedId === order.id;
                            const date = new Date(order.created_at);
                            const items = order.items || [];
                            return (
                                <div key={order.id}>
                                    <button onClick={() => setExpandedId(isExpanded ? null : order.id)} className="ios-row ios-press w-full text-left" style={{ minHeight: 60 }}>
                                        <div className="flex-1 min-w-0">
                                            <p className="ios-headline ios-amount text-[16px]">€{Number(order.gross_total).toFixed(2)}</p>
                                            <p className="ios-caption truncate">{order.customer_name || 'Generico'} · {order.staff?.name || 'Sistema'} · {date.toLocaleDateString('it-IT')}</p>
                                        </div>
                                        {order.status === 'PARTIAL_PAYMENT' && <Badge variant="warning" size="xs">Parziale</Badge>}
                                        <ChevronDown size={18} style={{ transform: isExpanded ? 'rotate(180deg)' : undefined, color: 'var(--label-tertiary)' }} />
                                    </button>
                                    <AnimatePresence initial={false}>
                                        {isExpanded && (
                                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                                                <div className="px-4 py-3 flex flex-col gap-1.5" style={{ background: 'var(--surface)', borderTop: '1px solid var(--separator)' }}>
                                                    {items.map((item) => (
                                                        <div key={item.id} className="flex items-center justify-between gap-3 py-1">
                                                            <p className="ios-subhead truncate">{item.variant?.model?.name} · {item.variant?.flavor?.name} <span className="ios-caption">×{item.qty}</span></p>
                                                            <span className="ios-subhead ios-amount shrink-0">€{formatEur(safeNumber(item.unit_price_final) * safeNumber(item.qty))}</span>
                                                        </div>
                                                    ))}
                                                    <p className="ios-caption pt-1">Ricevuta {order.id.slice(0, 8)}… · totale €{Number(order.gross_total).toFixed(2)}</p>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            );
                        })}
                    </div>
                )
            ) : (
                <div className="flex flex-col gap-5">
                    {archivedOrders.length > 0 && (
                        <section>
                            <h2 className="ios-footnote px-1 mb-1.5">ORDINI ARCHIVIATI</h2>
                            <div className="ios-grouped">
                                {archivedOrders.slice(0, showAllArchivedOrders ? undefined : 5).map((order) => (
                                    <div key={order.id} className="ios-row" style={{ opacity: 0.75 }}>
                                        <div className="flex-1 min-w-0">
                                            <p className="ios-headline ios-amount text-[15px]">€{Number(order.gross_total).toFixed(2)}</p>
                                            <p className="ios-caption truncate">{order.customer_name || 'Generico'} · {new Date(order.created_at).toLocaleDateString('it-IT')}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            {archivedOrders.length > 5 && !showAllArchivedOrders && (
                                <button onClick={() => setShowAllArchivedOrders(true)} className="ios-press w-full text-center py-2.5 ios-footnote" style={{ color: 'var(--accent)' }}>
                                    Mostra tutti ({archivedOrders.length})
                                </button>
                            )}
                        </section>
                    )}
                    <section>
                        <h2 className="ios-footnote px-1 mb-1.5">CHIUSURE SESSIONI</h2>
                        {filteredLoads.length === 0 ? (
                            <EmptyState icon={Package} title="Nessuna sessione" />
                        ) : (
                            <div className="flex flex-col gap-3">
                                {filteredLoads.map((load) => {
                                    const open = selectedLoad?.id === load.id;
                                    return (
                                        <div key={load.id} className="ios-card overflow-hidden">
                                            <div className="flex items-center gap-3 p-4">
                                                <div className="flex-1 min-w-0">
                                                    <p className="ios-title-3 ios-amount">€{Number(load.gross_total).toFixed(2)}</p>
                                                    <p className="ios-caption">
                                                        {new Date(load.closed_at).toLocaleDateString('it-IT')} · spesa €{Number(load.soldi_spesi_carico || 0).toFixed(0)}
                                                        {load.is_legacy ? ' · legacy' : ''}
                                                    </p>
                                                </div>
                                                <button onClick={() => setSelectedLoad(open ? null : load)} className="ios-press px-3 py-2 rounded-xl text-[14px] font-semibold" style={{ background: 'var(--accent-tint)', color: 'var(--accent)' }}>
                                                    {open ? 'Chiudi' : 'Dettagli'}
                                                </button>
                                                <button onClick={() => !load.is_legacy && setDeleteConfirmLoad(load)} disabled={load.is_legacy} className="ios-press p-2.5 rounded-xl disabled:opacity-30" style={{ background: 'rgba(255,59,48,0.12)', color: '#FF3B30' }} aria-label="Elimina sessione">
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                            <AnimatePresence initial={false}>
                                                {open && (
                                                    <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                                                        <div className="px-4 pb-4 grid sm:grid-cols-2 gap-1.5" style={{ borderTop: '1px solid var(--separator)', paddingTop: 12 }}>
                                                            {load.items_sold_snapshot?.map((item, idx) => (
                                                                <div key={idx} className="flex items-center justify-between gap-2 py-1">
                                                                    <p className="ios-subhead truncate">{item.model_name} · {item.flavor_name}</p>
                                                                    <span className="ios-subhead ios-amount shrink-0">{item.qty}pz · €{item.price}</span>
                                                                </div>
                                                            ))}
                                                            {load.is_legacy && <p className="ios-caption">Dettaglio non disponibile per sessioni legacy</p>}
                                                        </div>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </section>
                </div>
            )}

            <ConfirmModal isOpen={!!deleteConfirmLoad} onClose={() => setDeleteConfirmLoad(null)}
                onConfirm={handleDeleteSession}
                title="Elimina sessione" message="Verranno eliminati tutti gli ordini archiviati in quella sessione. Operazione irreversibile."
                variant="danger" confirmLabel="Elimina" />
        </div>
    );
};
