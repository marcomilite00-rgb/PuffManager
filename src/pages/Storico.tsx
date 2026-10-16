import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { motion, AnimatePresence } from 'motion/react';
import { safeNumber, formatEur } from '../lib/money';
import { useToast } from '../components/ui/ToastProvider';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { EmptyState } from '../components/ui/EmptyState';
import {
  Search,
  ChevronDown,
  Package,
  Download,
  Trash2,
  X,
  History,
  Filter,
  Receipt,
  RotateCcw,
} from 'lucide-react';
import { Badge } from '../components/ui/Badge';
import { PageSkeleton } from '../components/ui/PageSkeleton';
import type { OrderWithItems, StaffMinimal, ArchivedLoad } from '../types/database';
import { cn } from '../lib/cn';

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

  const fetchData = async () => {
    try {
      const [ordersRes, staffRes, loadsRes, legacyLoadsRes, settingsRes] = await Promise.all([
        supabase
          .from('orders')
          .select(
            '*, items:order_items(*, variant:product_variants(model:product_models(name), flavor:product_flavors(name), unit_cost)), staff:staff(name)'
          )
          .order('created_at', { ascending: false }),
        supabase.from('staff').select('id, name').order('name'),
        supabase.from('archived_loads').select('*').order('closed_at', { ascending: false }),
        supabase.from('load_history').select('*').order('created_at', { ascending: false }),
        supabase.from('settings').select('last_reset_date').limit(1).single(),
      ]);
      if (ordersRes.data) setOrders(ordersRes.data);
      if (staffRes.data) setStaffList(staffRes.data);
      if (settingsRes.data) setLastResetDate(settingsRes.data.last_reset_date);
      const combinedLoads: ArchivedLoad[] = [];
      if (loadsRes.data) combinedLoads.push(...loadsRes.data);
      if (legacyLoadsRes.data) {
        combinedLoads.push(
          ...legacyLoadsRes.data.map(
            (l: {
              id: string;
              created_at: string;
              gross_total: number;
              money_spent_moved?: number | null;
              reinvest_amount?: number | null;
            }) => ({
              id: l.id,
              closed_at: l.created_at,
              gross_total: l.gross_total,
              soldi_spesi_carico: l.money_spent_moved || l.reinvest_amount,
              pezzi_comprati: 0,
              is_legacy: true,
              items_sold_snapshot: [],
            })
          )
        );
      }
      setArchivedLoads(
        combinedLoads.sort(
          (a, b) =>
            new Date(b.closed_at || b.created_at || 0).getTime() -
            new Date(a.closed_at || a.created_at || 0).getTime()
        )
      );
    } catch (error) {
      console.error('Storico load error:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleDeleteSession = async () => {
    if (!deleteConfirmLoad) return;
    const load = deleteConfirmLoad;
    const closedAt = new Date(load.closed_at);
    const sortedLoads = [...archivedLoads].sort(
      (a, b) => new Date(a.closed_at).getTime() - new Date(b.closed_at).getTime()
    );
    const idx = sortedLoads.findIndex((l) => l.id === load.id);
    const prevClosedAt = idx > 0 ? new Date(sortedLoads[idx - 1].closed_at) : new Date(0);

    const { error: ordersError } = await supabase
      .from('orders')
      .delete()
      .eq('is_archived', true)
      .gte('created_at', prevClosedAt.toISOString())
      .lt('created_at', closedAt.toISOString());

    if (ordersError) {
      showToast('Errore eliminazione ordini: ' + ordersError.message, 'error');
      setDeleteConfirmLoad(null);
      return;
    }

    const { error: loadError } = await supabase
      .from('archived_loads')
      .delete()
      .eq('id', load.id);
    if (loadError) {
      showToast('Errore eliminazione sessione: ' + loadError.message, 'error');
      setDeleteConfirmLoad(null);
      return;
    }

    fetchData();
    showToast('Sessione eliminata con successo', 'success');
    setDeleteConfirmLoad(null);
  };

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const matchesSearch =
        (order.customer_name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
        (order.staff?.name?.toLowerCase() || '').includes(searchTerm.toLowerCase());
      const matchesStaff = filterStaff === 'all' || order.sold_by_staff_id === filterStaff;
      const orderDate = new Date(order.created_at).toLocaleDateString('en-CA');
      const matchesDateStart = !filterDateStart || orderDate >= filterDateStart;
      const matchesDateEnd = !filterDateEnd || orderDate <= filterDateEnd;
      const amount = safeNumber(order.gross_total);
      const matchesMin = !filterMinAmount || amount >= safeNumber(filterMinAmount);
      const matchesMax = !filterMaxAmount || amount <= safeNumber(filterMaxAmount);
      return (
        matchesSearch &&
        matchesStaff &&
        matchesDateStart &&
        matchesDateEnd &&
        matchesMin &&
        matchesMax
      );
    });
  }, [
    orders,
    searchTerm,
    filterStaff,
    filterDateStart,
    filterDateEnd,
    filterMinAmount,
    filterMaxAmount,
  ]);

  const exportToCSV = () => {
    const esc = (v: unknown) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const headers = ['Data', 'Cliente', 'Staff', 'Lordo (€)', 'Articoli'];
    const rows = filteredOrders.map((o) => [
      new Date(o.created_at).toLocaleString('it-IT'),
      o.customer_name || 'Generico',
      o.staff?.name || 'Sconosciuto',
      safeNumber(o.gross_total).toFixed(2),
      (o.items || []).length,
    ]);
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      headers.join(',') +
      '\n' +
      rows.map((r) => r.map(esc).join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `storico_ordini_${new Date().toISOString().split('T')[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('File CSV esportato', 'success');
  };

  const resetFilters = () => {
    setFilterStaff('all');
    setFilterDateStart('');
    setFilterDateEnd('');
    setFilterMinAmount('');
    setFilterMaxAmount('');
    setSearchTerm('');
  };

  if (loading) {
    return (
      <PageSkeleton
        titleClass="w-52 h-10"
        blocks={[
          { count: 1, className: 'h-12' },
          { count: 5, className: 'h-20' },
        ]}
      />
    );
  }

  const activeOrders = filteredOrders.filter((o) => {
    if (o.is_archived) return false;
    if (lastResetDate && new Date(o.created_at) < new Date(lastResetDate)) return false;
    return true;
  });

  const archivedOrders = filteredOrders.filter((o) => {
    if (o.is_archived) return true;
    if (lastResetDate && new Date(o.created_at) < new Date(lastResetDate)) return true;
    return false;
  });

  const filteredLoads = archivedLoads.filter((l) => {
    if (!searchTerm) return true;
    const s = searchTerm.toLowerCase();
    return (
      l.gross_total?.toString().includes(s) ||
      new Date(l.closed_at).toLocaleDateString().includes(s)
    );
  });

  const hasActiveFilters =
    filterStaff !== 'all' ||
    filterDateStart !== '' ||
    filterDateEnd !== '' ||
    filterMinAmount !== '' ||
    filterMaxAmount !== '';

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6">
      {/* ── Top Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="spatial-chip spatial-chip-blue text-[11px] py-0.5">
              <History size={11} /> Archivio Transazioni
            </span>
            <span className="spatial-caption text-white/50">
              {viewMode === 'orders'
                ? `${activeOrders.length} ordini in sessione`
                : `${filteredLoads.length} chiusure`}
            </span>
          </div>
          <h1 className="spatial-title text-2xl sm:text-3xl font-semibold text-white">
            Storico Vendite & Chiusure
          </h1>
        </div>

        {/* Export Button Circular/Pill */}
        <button
          type="button"
          onClick={exportToCSV}
          className="spatial-btn-ghost h-11 px-4 text-xs font-semibold flex items-center gap-2 self-start sm:self-auto shrink-0"
          aria-label="Esporta dati in CSV"
        >
          <Download size={15} />
          <span>Esporta CSV</span>
        </button>
      </div>

      {/* ── Segmented Navigation (Ordini vs Sessioni) ── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="spatial-segmented" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'orders'}
            onClick={() => setViewMode('orders')}
            className={cn(
              'spatial-segmented-item px-5',
              viewMode === 'orders' && 'spatial-segmented-item-active'
            )}
          >
            Ordini Sessione
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'sessions'}
            onClick={() => setViewMode('sessions')}
            className={cn(
              'spatial-segmented-item px-5',
              viewMode === 'sessions' && 'spatial-segmented-item-active'
            )}
          >
            Sessioni Archiviate
          </button>
        </div>

        {/* Search Pill */}
        <div className="spatial-search flex-1 sm:max-w-xs">
          <Search size={16} className="text-white/40 shrink-0" />
          <input
            type="search"
            placeholder={
              viewMode === 'orders'
                ? 'Cerca cliente o staff...'
                : 'Cerca per totale o data...'
            }
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            aria-label="Cerca nello storico"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="text-white/40 hover:text-white"
              aria-label="Pulisci ricerca"
            >
              <X size={15} />
            </button>
          )}
        </div>
      </div>

      {/* ── Collapsible Filters Panel (Orders View) ── */}
      {viewMode === 'orders' && (
        <div className="spatial-panel p-0 overflow-hidden border border-white/15">
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className="w-full flex items-center justify-between p-4 text-left transition-colors hover:bg-white/5 focus-visible:outline-none"
            aria-expanded={showFilters}
          >
            <div className="flex items-center gap-2">
              <Filter size={16} className="text-[#0A84FF]" />
              <span className="spatial-headline text-sm font-semibold text-white">
                Filtri Avanzati
              </span>
              {hasActiveFilters && (
                <span className="spatial-chip spatial-chip-blue text-[10px] py-0 px-2 h-5">
                  Attivi ({filteredOrders.length} risultati)
                </span>
              )}
            </div>
            <ChevronDown
              size={18}
              className={cn(
                'text-white/40 transition-transform duration-200',
                showFilters && 'rotate-180 text-white'
              )}
            />
          </button>

          <AnimatePresence initial={false}>
            {showFilters && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="overflow-hidden border-t border-white/10"
              >
                <div className="p-4 sm:p-5 bg-black/20 grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  {/* Staff select */}
                  <div>
                    <label className="spatial-caption block mb-1 text-white/60">
                      Operatore Staff
                    </label>
                    <select
                      value={filterStaff}
                      onChange={(e) => setFilterStaff(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl bg-white/10 border border-white/15 text-white text-sm focus:outline-none focus:border-[#0A84FF]"
                    >
                      <option value="all" className="bg-[#14161C] text-white">
                        Tutti i membri
                      </option>
                      {staffList.map((s) => (
                        <option
                          key={s.id}
                          value={s.id}
                          className="bg-[#14161C] text-white"
                        >
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Dates */}
                  <div>
                    <label className="spatial-caption block mb-1 text-white/60">
                      Intervallo Date
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="date"
                        value={filterDateStart}
                        onChange={(e) => setFilterDateStart(e.target.value)}
                        className="px-2.5 py-2 rounded-xl bg-white/10 border border-white/15 text-white text-xs focus:outline-none focus:border-[#0A84FF]"
                        title="Data inizio"
                      />
                      <input
                        type="date"
                        value={filterDateEnd}
                        onChange={(e) => setFilterDateEnd(e.target.value)}
                        className="px-2.5 py-2 rounded-xl bg-white/10 border border-white/15 text-white text-xs focus:outline-none focus:border-[#0A84FF]"
                        title="Data fine"
                      />
                    </div>
                  </div>

                  {/* Amount Min/Max */}
                  <div>
                    <label className="spatial-caption block mb-1 text-white/60">
                      Importo Lordo (€)
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        placeholder="Min €"
                        value={filterMinAmount}
                        onChange={(e) => setFilterMinAmount(e.target.value)}
                        className="px-3 py-2 rounded-xl bg-white/10 border border-white/15 text-white text-xs focus:outline-none focus:border-[#0A84FF] spatial-amount"
                      />
                      <input
                        type="number"
                        placeholder="Max €"
                        value={filterMaxAmount}
                        onChange={(e) => setFilterMaxAmount(e.target.value)}
                        className="px-3 py-2 rounded-xl bg-white/10 border border-white/15 text-white text-xs focus:outline-none focus:border-[#0A84FF] spatial-amount"
                      />
                    </div>
                  </div>

                  <div className="sm:col-span-3 flex justify-end pt-2">
                    <button
                      type="button"
                      onClick={resetFilters}
                      className="px-4 py-2 rounded-full text-xs font-semibold bg-white/10 hover:bg-white/20 text-white flex items-center gap-1.5 transition-colors"
                    >
                      <RotateCcw size={12} /> Azzera tutti i filtri
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* ── Content View: Orders ── */}
      {viewMode === 'orders' ? (
        activeOrders.length === 0 ? (
          <EmptyState
            title="Nessun ordine trovato"
            subtitle="Non risultano ordini registrati per i filtri attivi"
          />
        ) : (
          <div className="spatial-panel p-0 overflow-hidden divide-y divide-white/10 border border-white/15">
            {activeOrders.map((order) => {
              const isExpanded = expandedId === order.id;
              const date = new Date(order.created_at);
              const items = order.items || [];

              return (
                <div key={order.id} className="transition-colors hover:bg-white/[0.02]">
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : order.id)}
                    className="spatial-row px-4 sm:px-6 py-4 w-full flex items-center justify-between gap-3 text-left focus-visible:outline-none"
                    aria-expanded={isExpanded}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="spatial-amount text-base sm:text-lg font-bold text-white">
                          €{Number(order.gross_total).toFixed(2)}
                        </span>
                        {order.status === 'PARTIAL_PAYMENT' && (
                          <Badge variant="warning" size="xs">
                            Parziale
                          </Badge>
                        )}
                      </div>
                      <p className="spatial-caption text-white/50 truncate">
                        {order.customer_name || 'Generico'} · Operatore:{' '}
                        {order.staff?.name || 'Sistema'} ·{' '}
                        {date.toLocaleDateString('it-IT', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="spatial-caption text-white/40 hidden sm:inline">
                        {items.length} {items.length === 1 ? 'pezzo' : 'pezzi'}
                      </span>
                      <ChevronDown
                        size={18}
                        className={cn(
                          'text-white/40 transition-transform duration-200',
                          isExpanded && 'rotate-180 text-white'
                        )}
                      />
                    </div>
                  </button>

                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.22 }}
                        className="overflow-hidden border-t border-white/10 bg-black/30"
                      >
                        <div className="px-5 py-4 space-y-2">
                          <p className="spatial-caption text-white/40 font-semibold mb-2">
                            Dettaglio scontrino ({items.length} articoli)
                          </p>
                          {items.map((item) => (
                            <div
                              key={item.id}
                              className="spatial-subpanel px-3.5 py-2.5 flex items-center justify-between gap-3"
                            >
                              <div className="min-w-0">
                                <p className="spatial-subhead text-sm text-white font-medium truncate">
                                  {item.variant?.model?.name ?? 'Modello'} ·{' '}
                                  {item.variant?.flavor?.name ?? 'Gusto'}
                                </p>
                                <p className="spatial-caption text-white/40">
                                  {item.qty} pz × €
                                  {Number(item.unit_price_final).toFixed(2)}
                                </p>
                              </div>
                              <span className="spatial-amount text-sm font-bold text-white shrink-0">
                                €{formatEur(safeNumber(item.unit_price_final) * safeNumber(item.qty))}
                              </span>
                            </div>
                          ))}
                          <div className="pt-2 text-right">
                            <span className="spatial-caption text-white/30 text-[10px]">
                              ID Univoco Transazione: {order.id}
                            </span>
                          </div>
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
        /* ── Content View: Sessions (Chiusure) ── */
        <div className="space-y-6">
          {/* Archived orders summary if available */}
          {archivedOrders.length > 0 && (
            <section className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <h2 className="spatial-caption text-white/60 font-semibold tracking-wider">
                  ORDINI ARCHIVIATI DI SESSIONI PRECEDENTI
                </h2>
                <span className="spatial-caption text-white/40">
                  {archivedOrders.length} ordini
                </span>
              </div>

              <div className="spatial-panel p-0 overflow-hidden divide-y divide-white/10">
                {archivedOrders
                  .slice(0, showAllArchivedOrders ? undefined : 5)
                  .map((order) => (
                    <div
                      key={order.id}
                      className="spatial-row px-4 sm:px-6 py-3 opacity-60 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="spatial-amount text-sm font-semibold text-white">
                          €{Number(order.gross_total).toFixed(2)}
                        </p>
                        <p className="spatial-caption text-white/40 truncate">
                          {order.customer_name || 'Generico'} ·{' '}
                          {new Date(order.created_at).toLocaleDateString('it-IT')}
                        </p>
                      </div>
                    </div>
                  ))}
              </div>

              {archivedOrders.length > 5 && !showAllArchivedOrders && (
                <button
                  type="button"
                  onClick={() => setShowAllArchivedOrders(true)}
                  className="w-full text-center py-2.5 text-xs font-semibold text-[#0A84FF] hover:underline"
                >
                  Mostra tutti gli ordini archiviati ({archivedOrders.length})
                </button>
              )}
            </section>
          )}

          {/* Closed sessions list */}
          <section className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <h2 className="spatial-caption text-white/60 font-semibold tracking-wider flex items-center gap-2">
                <Receipt size={13} /> CHIUSURE CARICO REGISTRATE
              </h2>
              <span className="spatial-caption text-white/40">
                {filteredLoads.length} Chiusure totali
              </span>
            </div>

            {filteredLoads.length === 0 ? (
              <EmptyState
                icon={Package}
                title="Nessuna sessione trovata"
                subtitle="Non risultano carichi chiusi nell'archivio"
              />
            ) : (
              <div className="space-y-3.5">
                {filteredLoads.map((load) => {
                  const isOpen = selectedLoad?.id === load.id;

                  return (
                    <div
                      key={load.id}
                      className="spatial-panel border border-white/15 overflow-hidden transition-all duration-200"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2.5 mb-1">
                            <span className="spatial-amount text-xl font-bold text-white">
                              €{Number(load.gross_total).toFixed(2)}
                            </span>
                            <span className="spatial-chip spatial-chip-orange text-xs py-0.5 px-2.5">
                              Spesa €{Number(load.soldi_spesi_carico || 0).toFixed(0)}
                            </span>
                            {load.is_legacy && (
                              <Badge variant="ghost" size="xs">
                                Legacy
                              </Badge>
                            )}
                          </div>
                          <p className="spatial-caption text-white/50">
                            Chiuso il{' '}
                            {new Date(load.closed_at).toLocaleDateString('it-IT', {
                              day: '2-digit',
                              month: 'long',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => setSelectedLoad(isOpen ? null : load)}
                            className="px-4 py-2 rounded-full text-xs font-semibold bg-white/10 hover:bg-white/20 text-white transition-colors"
                          >
                            {isOpen ? 'Chiudi' : 'Dettagli Snapshot'}
                          </button>
                          <button
                            type="button"
                            onClick={() => !load.is_legacy && setDeleteConfirmLoad(load)}
                            disabled={load.is_legacy}
                            className="w-9 h-9 rounded-full bg-[#FF453A]/15 hover:bg-[#FF453A]/25 border border-[#FF453A]/30 text-[#FF453A] flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            aria-label="Elimina sessione archiviata"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>

                      {/* Expanded snapshot details */}
                      <AnimatePresence initial={false}>
                        {isOpen && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.22 }}
                            className="overflow-hidden border-t border-white/10 bg-black/25"
                          >
                            <div className="p-4 sm:p-5">
                              <p className="spatial-caption text-white/40 font-semibold mb-3">
                                Snapshot articoli venduti nel carico
                              </p>
                              {load.is_legacy ? (
                                <p className="spatial-footnote text-white/40 text-xs">
                                  Dettaglio analitico articoli non disponibile per sessioni legacy.
                                </p>
                              ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  {load.items_sold_snapshot?.map((item, idx) => (
                                    <div
                                      key={idx}
                                      className="spatial-subpanel px-3 py-2 flex items-center justify-between text-xs"
                                    >
                                      <span className="text-white font-medium truncate pr-2">
                                        {item.model_name} · {item.flavor_name}
                                      </span>
                                      <span className="spatial-amount text-white/80 shrink-0 font-bold">
                                        {item.qty} pz · €{item.price}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
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

      {/* Delete Session Confirmation Modal */}
      <ConfirmModal
        isOpen={!!deleteConfirmLoad}
        onClose={() => setDeleteConfirmLoad(null)}
        onConfirm={handleDeleteSession}
        title="Elimina Sessione Archiviata"
        message="Verranno eliminati definitivamente tutti gli ordini archiviati in questa sessione e il record del carico. Questa operazione è irreversibile."
        variant="danger"
        confirmLabel="Elimina Definitivamente"
      />
    </div>
  );
};
