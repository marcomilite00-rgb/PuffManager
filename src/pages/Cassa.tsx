import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { safeNumber } from '../lib/money';
import { useRealtime } from '../hooks/useRealtime';
import { Badge } from '../components/ui/Badge';
import { PageSkeleton } from '../components/ui/PageSkeleton';
import { Gauge } from '../components/ui/Gauge';
import { useAuth } from '../context/AuthContext';
import { cn } from '../lib/cn';
import type {
  Settings,
  Staff,
  OrderWithItems,
  ReminderSummary,
  Order,
  OrderPayment,
} from '../types/database';
import { CreditCard, TrendingUp, TrendingDown, Receipt, Users, AlertCircle, X, Info, Percent } from 'lucide-react';

interface StaffProfitItem extends Staff {
  qtySold: number;
  gross: number;
  cogs: number;
  unitProfit: number;
  percent: number;
  pendingDebt?: number;
}

export const Cassa: React.FC = () => {
  const { user } = useAuth();
  const isHelper = user?.role === 'helper';
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [reminders, setReminders] = useState<ReminderSummary[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [staffShares, setStaffShares] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [selectedStaff, setSelectedStaff] = useState<StaffProfitItem | null>(null);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 640 : false
  );

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 640);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedStaff) {
        setSelectedStaff(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedStaff]);

  const loadInit = useCallback(async () => {
    try {
      const [oRes, sRes, setRes, rRes, sharesRes] = await Promise.all([
        supabase
          .from('orders')
          .select('*, payments(*), items:order_items(*, variant:product_variants(unit_cost))'),
        supabase.from('staff').select('*'),
        supabase.from('settings').select('*').limit(1),
        supabase.from('reminders').select('*, staff:created_by_staff_id(name)').gt('amount_due', 0),
        supabase.rpc('get_staff_sales_shares'),
      ]);
      if (oRes.data) setOrders(oRes.data);
      if (sRes.data) setStaff(sRes.data);
      if (setRes.data?.[0]) setSettings(setRes.data[0]);
      if (rRes.data) setReminders(rRes.data);
      if (sharesRes.data && Array.isArray(sharesRes.data)) {
        const sharesMap: Record<string, number> = {};
        sharesRes.data.forEach((item: { staff_id: string; percent: number }) => {
          sharesMap[item.staff_id] = safeNumber(item.percent);
        });
        setStaffShares(sharesMap);
      }
    } catch (e) {
      console.error('Cassa load error', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInit();
  }, [loadInit]);

  useRealtime<Order>('orders', () => loadInit());
  useRealtime<OrderPayment>('payments', () => loadInit());
  useRealtime<Settings>('settings', () => loadInit());
  useRealtime<Staff>('staff', () => loadInit());

  useEffect(() => {
    const timer = setInterval(loadInit, 15000);
    return () => clearInterval(timer);
  }, [loadInit]);

  const totals = useMemo(() => {
    const lastReset = settings?.last_reset_date ? new Date(settings.last_reset_date) : null;
    let grossTotal = 0;
    orders.forEach((o) => {
      const pays = o.payments || [];
      if (pays.length > 0) {
        pays.forEach((p) => {
          const payDate = p.created_at ? new Date(p.created_at) : null;
          if (!lastReset || (payDate && payDate >= lastReset)) grossTotal += safeNumber(p.amount);
        });
      } else if (o.created_at) {
        const orderDate = new Date(o.created_at);
        if (!lastReset || orderDate >= lastReset) grossTotal += safeNumber(o.gross_total);
      }
    });
    const spent = safeNumber(settings?.money_spent_total);
    const currentLoadExpenses = safeNumber(settings?.money_spent_current_load);
    return {
      gross: grossTotal,
      spent,
      net: grossTotal - spent - currentLoadExpenses,
      currentLoadExpenses,
    };
  }, [orders, settings]);

  const staffEarningsList = useMemo(() => {
    if (!staff.length) return [];
    
    // Mappa di accumulo per operatore: quantità, lordo venduto effettivo, cogs e crediti sospesi
    const staffMetricsMap: {
      [key: string]: {
        qtySold: number;
        grossSold: number;
        cogs: number;
        pendingDebt: number;
      };
    } = {};

    staff.forEach((s) => {
      staffMetricsMap[s.id] = { qtySold: 0, grossSold: 0, cogs: 0, pendingDebt: 0 };
    });

    const lastReset = settings?.last_reset_date ? new Date(settings.last_reset_date) : null;

    // Rileva eventuali crediti/promemoria non ancora saldati relativi a questo staff
    reminders.forEach((r) => {
      const staffId = r.created_by_staff_id;
      if (staffId && staffId in staffMetricsMap) {
        staffMetricsMap[staffId].pendingDebt += safeNumber(r.amount_due);
      }
    });

    orders.forEach((order) => {
      const staffId = order.sold_by_staff_id;
      if (!staffId || !(staffId in staffMetricsMap)) return;

      const current = staffMetricsMap[staffId];

      // 1. Incasso Effettivo: Pagamenti reali registrati in questa sessione per vendite dell'operatore
      const pays = order.payments || [];
      if (pays.length > 0) {
        pays.forEach((p) => {
          const payDate = p.created_at ? new Date(p.created_at) : null;
          if (!lastReset || (payDate && payDate >= lastReset)) {
            current.grossSold += safeNumber(p.amount);
          }
        });
      } else if (order.created_at) {
        const orderDate = new Date(order.created_at);
        if (!lastReset || orderDate >= lastReset) {
          current.grossSold += safeNumber(order.gross_total);
        }
      }

      // 2. Articoli venduti e Costo Merce sostenuto per gli ordini di questa sessione
      if (order.created_at) {
        const orderDate = new Date(order.created_at);
        if (lastReset && orderDate < lastReset) return;
      }

      const items = order.items || [];
      items.forEach((item) => {
        const q = safeNumber(item.qty);
        const cost = safeNumber(item.unit_cost ?? item.variant?.unit_cost ?? 0);
        const itemCogs = q * cost;

        current.qtySold += q;
        current.cogs += itemCogs;
      });
    });

    const totalQtySold = Object.values(staffMetricsMap).reduce(
      (acc, val) => acc + val.qtySold,
      0
    );

    return staff
      .map((s) => {
        const metrics = staffMetricsMap[s.id] || { qtySold: 0, grossSold: 0, cogs: 0, pendingDebt: 0 };
        const percent = staffShares[s.id] ?? (totalQtySold > 0 ? (metrics.qtySold / totalQtySold) * 100 : 0);
        // Margine netto reale: Incasso effettivo venduto - Costo fornitura sostenuto
        const unitProfit = metrics.grossSold - metrics.cogs;

        return {
          ...s,
          qtySold: metrics.qtySold,
          gross: metrics.grossSold,
          cogs: metrics.cogs,
          unitProfit,
          percent,
          pendingDebt: metrics.pendingDebt,
        };
      })
      .sort((a, b) => b.percent - a.percent || b.qtySold - a.qtySold);
  }, [orders, staff, settings, reminders, staffShares]);

  const helperStats = useMemo(() => {
    if (!user?.id) {
      return {
        qtySold: 0,
        gross: 0,
        cogs: 0,
        unitProfit: 0,
        percent: 0,
        pendingDebt: 0,
        marginPercent: 0,
        marginPerUnit: 0,
      };
    }

    const lastReset = settings?.last_reset_date ? new Date(settings.last_reset_date) : null;
    let qtySold = 0;
    let gross = 0;
    let cogs = 0;
    let pendingDebt = 0;

    reminders.forEach((r) => {
      if (r.created_by_staff_id === user.id) {
        pendingDebt += safeNumber(r.amount_due);
      }
    });

    orders.forEach((order) => {
      if (order.sold_by_staff_id !== user.id) return;

      if (order.created_at) {
        const orderDate = new Date(order.created_at);
        if (lastReset && orderDate < lastReset) return;
      }

      const items = order.items || [];
      items.forEach((item) => {
        const q = safeNumber(item.qty);
        const sellPrice = safeNumber(item.unit_price_final);
        const buyPrice = safeNumber(item.unit_cost ?? item.variant?.unit_cost ?? 0);

        qtySold += q;
        gross += q * sellPrice; // prezzo singolo di vendita * pezzi venduti (lordo)
        cogs += q * buyPrice;   // prezzo singolo di acquisto * pezzi venduti (costo merce)
      });
    });

    const unitProfit = gross - cogs; // (prezzo singolo di vendita - prezzo singolo di acquisto) * pezzi venduti (netto)
    const marginPercent = gross > 0 ? (unitProfit / gross) * 100 : 0;
    const marginPerUnit = qtySold > 0 ? unitProfit / qtySold : 0;
    const myShare = staffShares[user.id] ?? 0;

    return {
      qtySold,
      gross,
      cogs,
      unitProfit,
      percent: myShare,
      pendingDebt,
      marginPercent,
      marginPerUnit,
    };
  }, [orders, settings, reminders, user?.id, staffShares]);

  // Per helper: mostrare tutti i dipendenti nello spartimento guadagni.
  // Di loro vedono tutto, degli altri vedono solo la percentuale di vendita (il resto è censurato)
  const displayedStaffList = useMemo(() => {
    if (isHelper) {
      return staffEarningsList.map((s) => {
        const isMe = s.id === user?.id;
        const sharePercent = staffShares[s.id] ?? s.percent;

        if (isMe) {
          return {
            ...s,
            qtySold: helperStats.qtySold,
            gross: helperStats.gross,
            cogs: helperStats.cogs,
            unitProfit: helperStats.unitProfit,
            percent: sharePercent,
            pendingDebt: helperStats.pendingDebt,
          };
        }

        // Per gli altri dipendenti: vedono SOLO la percentuale di vendita, il resto è censurato
        return {
          ...s,
          qtySold: 0,
          gross: 0,
          cogs: 0,
          unitProfit: 0,
          percent: sharePercent,
          pendingDebt: 0,
        };
      });
    }
    return staffEarningsList;
  }, [isHelper, staffEarningsList, user?.id, helperStats, staffShares]);

  // Gli helper possono vedere TUTTI i promemoria di tutti i dipendenti
  const visibleReminders = reminders;

  // Gauge calculation: percentage of gross converted to net, or relative to positive target
  const gaugePercent = useMemo(() => {
    if (totals.gross <= 0) return 0;
    return Math.min(100, Math.max(0, (totals.net / totals.gross) * 100));
  }, [totals.gross, totals.net]);

  if (loading) {
    return (
      <PageSkeleton
        titleClass="w-52 h-10"
        blocks={[
          { count: 1, className: 'h-64' },
          { count: 3, className: 'h-24' },
          { count: 2, className: 'h-20' },
        ]}
      />
    );
  }

  const isNetPositive = totals.net >= 0;
  const gaugeColor = isNetPositive ? '#30D158' : '#FF453A';

  return (
    <div className="w-full max-w-5xl mx-auto space-y-3.5 sm:space-y-6">
      {/* ── Top Header ── */}
      <div className="flex items-center justify-between pt-1 sm:pt-2">
        <div>
          <div className="flex items-center gap-1.5 sm:gap-2 mb-0.5 sm:mb-1">
            <span className="spatial-chip spatial-chip-blue text-[10px] sm:text-[11px] py-0.5 px-2">
              <CreditCard size={11} /> Cassa & Bilancio
            </span>
            <span className="spatial-caption text-[10px] sm:text-[11px] text-white/50">
              Aggiornamento live
            </span>
          </div>
          <h1 className="spatial-title text-xl sm:text-3xl font-semibold text-white">
            Pannello Cassa
          </h1>
        </div>
      </div>

      {/* ── Hero Widget with Center Gauge Dial (Air Conditioner / Thermostat Style) ── */}
      <div className="spatial-panel-strong p-3.5 sm:p-8 flex flex-col items-center justify-center text-center relative overflow-hidden">
        {/* Subtle Ambient Radial behind Gauge */}
        <div
          className="absolute w-48 sm:w-72 h-48 sm:h-72 rounded-full pointer-events-none -z-10 blur-3xl opacity-20"
          style={{ background: isHelper ? (helperStats.unitProfit >= 0 ? '#30D158' : '#FF453A') : gaugeColor }}
        />

        {/* Circular Thermostat Gauge */}
        <Gauge
          value={
            isHelper
              ? helperStats.gross > 0
                ? Math.min(100, Math.max(0, (helperStats.unitProfit / helperStats.gross) * 100))
                : 0
              : gaugePercent
          }
          size={isMobile ? 165 : 230}
          strokeWidth={isMobile ? 11 : 14}
          color={isHelper ? (helperStats.unitProfit >= 0 ? '#30D158' : '#FF453A') : gaugeColor}
          className="my-1 sm:my-2"
        >
          <div className="flex flex-col items-center justify-center">
            <span className="spatial-caption text-white/50 text-[9.5px] sm:text-[10px] uppercase tracking-wider mb-0.5 sm:mb-1">
              {isHelper ? 'Tuo Margine Netto' : 'Bilancio Netto'}
            </span>
            <span className="spatial-amount text-2xl sm:text-4xl font-extrabold text-white tracking-tight leading-none mb-0.5 sm:mb-1">
              {isHelper
                ? `${helperStats.unitProfit >= 0 ? '+' : ''}€${helperStats.unitProfit.toFixed(2)}`
                : `€${totals.net.toFixed(2)}`}
            </span>
            <span className="spatial-caption text-[9.5px] sm:text-[10px] text-white/40">
              {settings?.last_reset_date
                ? `Dal ${new Date(settings.last_reset_date).toLocaleDateString('it-IT')}`
                : 'Sessione corrente'}
            </span>
          </div>
        </Gauge>

        {/* Status Chip */}
        <div className="mt-2 sm:mt-3 flex items-center justify-center gap-2">
          {isHelper ? (
            helperStats.unitProfit >= 0 ? (
              <span className="spatial-chip spatial-chip-green text-[11px] sm:text-xs font-semibold py-0.5 sm:py-1 px-2.5 sm:px-3">
                <TrendingUp size={12} /> Margine Medio Attivo: {helperStats.marginPercent.toFixed(1)}% (+€{helperStats.marginPerUnit.toFixed(2)}/pz)
              </span>
            ) : (
              <span className="spatial-chip spatial-chip-red text-[11px] sm:text-xs font-semibold py-0.5 sm:py-1 px-2.5 sm:px-3">
                <TrendingDown size={12} /> Margine in Deficit
              </span>
            )
          ) : isNetPositive ? (
            <span className="spatial-chip spatial-chip-green text-[11px] sm:text-xs font-semibold py-0.5 sm:py-1 px-2.5 sm:px-3">
              <TrendingUp size={12} /> In Attivo ({gaugePercent.toFixed(0)}% del lordo)
            </span>
          ) : (
            <span className="spatial-chip spatial-chip-red text-[11px] sm:text-xs font-semibold py-0.5 sm:py-1 px-2.5 sm:px-3">
              <TrendingDown size={12} /> In Deficit
            </span>
          )}
        </div>
      </div>

      {/* ── Smart-Home KPI Tiles: Lordo, Costo Merce, Netto (o Spese/Extra per admin) ── */}
      <div className={cn('grid gap-2 sm:gap-3.5', isHelper ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-1 sm:grid-cols-3')}>
        {/* Lordo / Tuo Venduto */}
        <div className="spatial-tile p-2.5 sm:p-4 min-h-[72px] sm:min-h-[96px]">
          <div className="flex items-center justify-between gap-1">
            <span className="spatial-caption text-[9.5px] sm:text-[11px] truncate">
              {isHelper ? 'Tuo Venduto (Lordo)' : 'Lordo'}
            </span>
            <div className="w-6 h-6 sm:w-9 sm:h-9 rounded-full bg-[#0A84FF]/15 border border-[#0A84FF]/30 flex items-center justify-center text-[#0A84FF] shrink-0">
              <TrendingUp size={13} className="sm:w-[15px] sm:h-[15px]" />
            </div>
          </div>
          <div className="mt-1 sm:mt-2">
            <p className="spatial-amount text-[16px] sm:text-2xl font-bold tracking-tight">
              €{(isHelper ? helperStats.gross : totals.gross).toFixed(2)}
            </p>
            <p className="spatial-footnote text-[11px] opacity-60 hidden sm:block mt-0.5">
              {isHelper ? `${helperStats.qtySold} pezzi venduti` : 'Pagamenti totali'}
            </p>
          </div>
        </div>

        {/* Costo Merce / Spese */}
        <div className="spatial-tile p-2.5 sm:p-4 min-h-[72px] sm:min-h-[96px] border-[#FF453A]/20">
          <div className="flex items-center justify-between gap-1">
            <span className="spatial-caption text-[9.5px] sm:text-[11px] text-[#FF453A] truncate">
              {isHelper ? 'Costo Merce' : 'Spese'}
            </span>
            <div className="w-6 h-6 sm:w-9 sm:h-9 rounded-full bg-[#FF453A]/15 border border-[#FF453A]/30 flex items-center justify-center text-[#FF453A] shrink-0">
              <Receipt size={13} className="sm:w-[15px] sm:h-[15px]" />
            </div>
          </div>
          <div className="mt-1 sm:mt-2">
            <p className="spatial-amount text-[16px] sm:text-2xl font-bold text-[#FF453A] tracking-tight">
              €{(isHelper ? helperStats.cogs : totals.spent).toFixed(2)}
            </p>
            <p className="spatial-footnote text-[11px] text-[#FF453A]/70 hidden sm:block mt-0.5">
              {isHelper ? 'Prezzo acquisto × pezzi' : 'Fisse e fornitura'}
            </p>
          </div>
        </div>

        {/* Netto Helper o Extra Correnti Admin */}
        {isHelper ? (
          <>
            <div className="spatial-tile p-2.5 sm:p-4 min-h-[72px] sm:min-h-[96px] border-[#30D158]/20">
              <div className="flex items-center justify-between gap-1">
                <span className="spatial-caption text-[9.5px] sm:text-[11px] text-[#30D158] truncate">
                  Tuo Guadagno (Netto)
                </span>
                <div className="w-6 h-6 sm:w-9 sm:h-9 rounded-full bg-[#30D158]/15 border border-[#30D158]/30 flex items-center justify-center text-[#30D158] shrink-0">
                  <TrendingUp size={13} className="sm:w-[15px] sm:h-[15px]" />
                </div>
              </div>
              <div className="mt-1 sm:mt-2">
                <p className="spatial-amount text-[16px] sm:text-2xl font-bold text-[#30D158] tracking-tight">
                  {helperStats.unitProfit >= 0 ? '+' : ''}€{helperStats.unitProfit.toFixed(2)}
                </p>
                <p className="spatial-footnote text-[11px] text-[#30D158]/70 hidden sm:block mt-0.5">
                  Lordo - Costo merce
                </p>
              </div>
            </div>

            {/* Tile 4 per Helper: Margine Medio Attivo */}
            <div className="spatial-tile p-2.5 sm:p-4 min-h-[72px] sm:min-h-[96px] border-[#0A84FF]/25 bg-gradient-to-br from-[#0A84FF]/10 to-transparent">
              <div className="flex items-center justify-between gap-1">
                <span className="spatial-caption text-[9.5px] sm:text-[11px] text-[#0A84FF] font-semibold truncate">
                  Margine Medio Attivo
                </span>
                <div className="w-6 h-6 sm:w-9 sm:h-9 rounded-full bg-[#0A84FF]/20 border border-[#0A84FF]/30 flex items-center justify-center text-[#0A84FF] shrink-0">
                  <Percent size={13} className="sm:w-[15px] sm:h-[15px]" />
                </div>
              </div>
              <div className="mt-1 sm:mt-2">
                <p className="spatial-amount text-[16px] sm:text-2xl font-bold text-white tracking-tight">
                  {helperStats.marginPercent.toFixed(1)}%
                </p>
                <p className="spatial-footnote text-[11px] text-[#0A84FF]/90 font-medium hidden sm:block mt-0.5">
                  +{helperStats.marginPerUnit.toFixed(2)} €/pz medio
                </p>
              </div>
            </div>
          </>
        ) : (
          <div className="spatial-tile p-2.5 sm:p-4 min-h-[72px] sm:min-h-[96px] border-[#FF9F0A]/20">
            <div className="flex items-center justify-between gap-1">
              <span className="spatial-caption text-[9.5px] sm:text-[11px] truncate text-[#FF9F0A]">
                Extra
              </span>
              <div className="w-6 h-6 sm:w-9 sm:h-9 rounded-full flex items-center justify-center shrink-0 border bg-[#FF9F0A]/15 border-[#FF9F0A]/30 text-[#FF9F0A]">
                <AlertCircle size={13} className="sm:w-[15px] sm:h-[15px]" />
              </div>
            </div>
            <div className="mt-1 sm:mt-2">
              <p className="spatial-amount text-[16px] sm:text-2xl font-bold tracking-tight text-[#FF9F0A]">
                €{totals.currentLoadExpenses.toFixed(2)}
              </p>
              <p className="spatial-footnote text-[11px] hidden sm:block mt-0.5 text-[#FF9F0A]/70">
                Carico corrente
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Ripartizione Staff con Barre di Avanzamento ── */}
      <section className="space-y-1.5 sm:space-y-2">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <h2 className="spatial-caption text-white/60 tracking-wider font-semibold flex items-center gap-1.5">
              <Users size={13} /> {isHelper ? 'SPARTIMENTO GUADAGNI & QUOTE VENDITA' : 'RIPARTIZIONE STAFF'}
            </h2>
            <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-[#30D158]/15 border border-[#30D158]/30 text-[#30D158]">
              Modello Unit Profit
            </span>
          </div>
          <span className="spatial-caption text-white/40">
            {isHelper ? `${displayedStaffList.length} Membri (i tuoi dati in chiaro, altri censurati)` : `${staffEarningsList.length} Membri attivi`}
          </span>
        </div>

        <div className="spatial-panel p-0 overflow-hidden divide-y divide-white/10">
          {/* Desktop Column Header Bar: 12-Column Unified Grid */}
          <div className="hidden md:grid grid-cols-12 items-center px-6 py-2.5 text-[11px] font-semibold text-white/40 uppercase tracking-wider bg-white/[0.02] border-b border-white/5 gap-3">
            <span className="col-span-4">Operatore</span>
            <span className="col-span-2 text-right">Pezzi</span>
            <span className="col-span-2 text-right">Venduto (Lordo)</span>
            <span className="col-span-2 text-right">Costo Merce</span>
            <span className="col-span-2 text-right text-[#30D158] font-bold">Margine Netto</span>
          </div>

          {displayedStaffList.map((s) => {
            const isMe = s.id === user?.id;
            const canViewDetails = !isHelper || isMe;

            return (
              <div
                key={s.id}
                onClick={() => {
                  if (canViewDetails) setSelectedStaff(s);
                }}
                className={cn(
                  'spatial-row px-3.5 sm:px-6 py-2.5 sm:py-3.5 transition-all group',
                  canViewDetails
                    ? 'cursor-pointer hover:bg-white/[0.04] active:scale-[0.99]'
                    : 'cursor-default opacity-80'
                )}
                title={canViewDetails ? `Clicca per vedere i dettagli contabili di ${s.name}` : undefined}
              >
                {/* ── Desktop View (≥md): 12-Column Grid perfectly aligned with Header ── */}
                <div className="hidden md:grid grid-cols-12 items-center gap-3 w-full">
                  {/* 1. Operatore: Avatar, Nome, Ruolo, Linea tutta lunga */}
                  <div className="col-span-4 flex items-center gap-3 min-w-0 pr-2">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-white text-neutral-900 flex items-center justify-center font-bold text-xs sm:text-sm shrink-0 shadow-sm group-hover:scale-105 transition-transform">
                      {s.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="spatial-headline text-sm sm:text-[15px] font-semibold text-white truncate leading-tight uppercase">
                          {s.name}
                        </p>
                        {isMe && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-[#0A84FF]/20 text-[#0A84FF] border border-[#0A84FF]/30">
                            TU
                          </span>
                        )}
                        <span className="spatial-caption text-[10px] text-white/40 uppercase hidden lg:inline">
                          {s.role}
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-white/15 overflow-hidden mt-1.5">
                        <div
                          className="h-full rounded-full bg-[#0A84FF] shadow-[0_0_8px_rgba(10,132,255,0.6)] transition-all duration-300"
                          style={{ width: `${Math.max(0, Math.min(s.percent, 100))}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* 2. Pezzi & Quota (per altri: solo percentuale, pezzi censurati) */}
                  <div className="col-span-2 text-right">
                    {canViewDetails ? (
                      <>
                        <span className="spatial-amount text-sm font-semibold text-white block">
                          {s.qtySold} pz
                        </span>
                        <span className="text-[11px] text-white/40 block">
                          {s.percent.toFixed(1)}% quota
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="text-sm text-white/20 font-mono block">••••</span>
                        <span className="text-[11px] text-[#0A84FF] font-semibold block">
                          {s.percent.toFixed(1)}% quota
                        </span>
                      </>
                    )}
                  </div>

                  {/* 3. Venduto Lordo */}
                  <div className="col-span-2 text-right">
                    {canViewDetails ? (
                      <>
                        <span className="spatial-amount text-sm font-semibold text-white block">
                          €{s.gross.toFixed(2)}
                        </span>
                        <span className="text-[11px] text-white/40 block">lordo</span>
                      </>
                    ) : (
                      <>
                        <span className="text-sm text-white/20 font-mono block">••••</span>
                        <span className="text-[11px] text-white/30 block">riservato</span>
                      </>
                    )}
                  </div>

                  {/* 4. Costo Merce (COGS) */}
                  <div className="col-span-2 text-right">
                    {canViewDetails ? (
                      <>
                        <span className="spatial-amount text-sm font-semibold text-[#FF453A]/90 block">
                          €{s.cogs.toFixed(2)}
                        </span>
                        <span className="text-[11px] text-white/40 block">fornitura</span>
                      </>
                    ) : (
                      <>
                        <span className="text-sm text-white/20 font-mono block">••••</span>
                        <span className="text-[11px] text-white/30 block">riservato</span>
                      </>
                    )}
                  </div>

                  {/* 5. Margine Netto e Percentuale */}
                  <div className="col-span-2 text-right">
                    {canViewDetails ? (
                      <>
                        <span className="spatial-amount text-[15px] sm:text-lg font-bold text-[#30D158] block tracking-tight">
                          {s.unitProfit >= 0 ? '+' : ''}€{s.unitProfit.toFixed(2)}
                        </span>
                        <p className="text-[11px] text-white/50 mt-0.5 tracking-normal font-medium">
                          {s.percent.toFixed(1)}%
                        </p>
                      </>
                    ) : (
                      <>
                        <span className="text-sm text-white/20 font-mono block">••••</span>
                        <p className="text-[11px] text-[#0A84FF] mt-0.5 tracking-normal font-semibold">
                          {s.percent.toFixed(1)}% quota
                        </p>
                      </>
                    )}
                  </div>
                </div>

                {/* ── Mobile View (<md): Compact & Responsive ── */}
                <div className="flex md:hidden items-center justify-between gap-3 w-full">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-8 h-8 rounded-full bg-white text-neutral-900 flex items-center justify-center font-bold text-xs shrink-0 shadow-sm">
                      {s.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="spatial-headline text-sm font-semibold text-white truncate leading-tight uppercase">
                          {s.name}
                        </p>
                        {isMe && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-[#0A84FF]/20 text-[#0A84FF] border border-[#0A84FF]/30">
                            TU
                          </span>
                        )}
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-white/15 overflow-hidden mt-1.5">
                        <div
                          className="h-full rounded-full bg-[#0A84FF]"
                          style={{ width: `${Math.max(0, Math.min(s.percent, 100))}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    {canViewDetails ? (
                      <>
                        <span className="spatial-amount text-sm font-bold text-[#30D158] block">
                          {s.unitProfit >= 0 ? '+' : ''}€{s.unitProfit.toFixed(2)}
                        </span>
                        <p className="text-[10px] text-white/50 mt-0.5">
                          {s.qtySold} pz · {s.percent.toFixed(1)}%
                        </p>
                      </>
                    ) : (
                      <>
                        <span className="text-sm text-white/20 font-mono block">••••</span>
                        <p className="text-[11px] text-[#0A84FF] font-semibold mt-0.5">
                          {s.percent.toFixed(1)}% quota
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {displayedStaffList.length === 0 && (
            <p className="spatial-footnote p-6 text-center text-white/40">
              Nessun dato registrato per lo staff nella sessione corrente
            </p>
          )}
        </div>
      </section>

      {/* ── Sospesi / Debiti da Incassare ── */}
      {visibleReminders.length > 0 && (
        <section className="space-y-1.5 sm:space-y-2">
          <div className="flex items-center justify-between px-1">
            <h2 className="spatial-caption text-white/60 tracking-wider font-semibold flex items-center gap-1.5">
              <AlertCircle size={13} className="text-[#FF453A]" /> SOSPESI · {visibleReminders.length}
            </h2>
            <span className="spatial-caption text-white/40">
              In attesa di saldo
            </span>
          </div>

          <div className="spatial-panel p-0 overflow-hidden divide-y divide-white/10">
            {visibleReminders.map((d) => (
              <div
                key={d.id}
                className="spatial-row px-3.5 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between gap-3 min-h-[48px] sm:min-h-[54px]"
              >
                <div className="min-w-0 flex-1">
                  <p className="spatial-headline text-sm sm:text-[15px] font-semibold text-white truncate leading-tight uppercase">
                    {d.customer_name || 'Cliente'}
                  </p>
                  <p className="text-[11px] sm:text-xs text-white/40 mt-0.5">
                    {new Date(d.created_at).toLocaleDateString('it-IT')}
                    {d.staff?.name ? (
                      <>
                        {' · da '}
                        <span className="uppercase">{d.staff.name}</span>
                      </>
                    ) : ''}
                  </p>
                </div>
                <div className="shrink-0">
                  <Badge variant="danger" size="sm" className="font-semibold text-xs py-0.5 px-2.5">
                    €{safeNumber(d.amount_due).toFixed(2)}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Spazio finale extra su mobile per garantire stacco netto sopra la dock flottante */}
      <div className="h-6 sm:h-0" aria-hidden="true" />

      {/* ── Pop-up Dettagli Operatore (VisionOS Modal) ── */}
      {selectedStaff && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-150"
          onClick={() => setSelectedStaff(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="staff-detail-title"
        >
          <div
            className="spatial-panel-strong w-full max-w-md p-5 sm:p-6 rounded-3xl border border-white/20 shadow-2xl relative overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Ambient Radial behind Modal */}
            <div
              className="absolute -top-16 -right-16 w-48 h-48 rounded-full pointer-events-none -z-10 blur-3xl opacity-20"
              style={{ background: '#30D158' }}
            />

            {/* Header: Avatar, Nome, Ruolo, X Close */}
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-12 h-12 rounded-full bg-white text-neutral-900 font-bold text-lg flex items-center justify-center shadow-md shrink-0">
                  {selectedStaff.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h3 id="staff-detail-title" className="spatial-headline text-lg font-bold text-white truncate uppercase">
                    {selectedStaff.name}
                  </h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="spatial-chip spatial-chip-blue text-[10px] py-0.5 px-2 uppercase font-semibold">
                      {selectedStaff.role}
                    </span>
                    <span className="text-[11px] text-white/50">
                      {selectedStaff.percent.toFixed(1)}% pezzi venduti
                    </span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedStaff(null)}
                className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 flex items-center justify-center text-white/70 hover:text-white transition-all shrink-0"
                aria-label="Chiudi dettaglio operatore"
              >
                <X size={18} />
              </button>
            </div>

            {/* Main Highlight: Margine Netto Diretto */}
            <div className="my-4 p-4 rounded-2xl bg-gradient-to-br from-white/10 to-white/[0.03] border border-white/10 text-center">
              <span className="spatial-caption text-white/50 text-[10px] uppercase tracking-wider block mb-1">
                Margine Netto Diretto
              </span>
              <span className="spatial-amount text-3xl sm:text-4xl font-extrabold text-[#30D158] tracking-tight block">
                +€{selectedStaff.unitProfit.toFixed(2)}
              </span>
              <p className="text-[11px] text-white/40 mt-1">
                {settings?.last_reset_date
                  ? `Calcolato dal ${new Date(settings.last_reset_date).toLocaleDateString('it-IT')}`
                  : 'Sessione corrente'}
              </p>
            </div>

            {/* 4 Dettagli Contabili */}
            <div className="grid grid-cols-2 gap-2.5">
              {/* Pezzi Venduti */}
              <div className="spatial-tile p-3">
                <span className="spatial-caption text-[10px] text-white/50 block">Pezzi Venduti</span>
                <p className="spatial-amount text-lg font-bold text-white mt-1">
                  {selectedStaff.qtySold} <span className="text-xs font-normal text-white/50">pz</span>
                </p>
                <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden mt-2">
                  <div
                    className="h-full rounded-full bg-[#0A84FF]"
                    style={{ width: `${Math.max(0, Math.min(selectedStaff.percent, 100))}%` }}
                  />
                </div>
                <span className="text-[10px] text-white/40 mt-1 block">
                  {selectedStaff.percent.toFixed(1)}% del totale pezzi
                </span>
              </div>

              {/* Lordo Incassato */}
              <div className="spatial-tile p-3">
                <span className="spatial-caption text-[10px] text-white/50 block">Lordo Venduto</span>
                <p className="spatial-amount text-lg font-bold text-white mt-1">
                  €{selectedStaff.gross.toFixed(2)}
                </p>
                <span className="text-[10px] text-white/40 mt-2 block">
                  Incasso effettivo venduto
                </span>
              </div>

              {/* Costo Merce (COGS) */}
              <div className="spatial-tile p-3 border-[#FF453A]/20">
                <span className="spatial-caption text-[10px] text-[#FF453A] block">Costo Merce</span>
                <p className="spatial-amount text-lg font-bold text-[#FF453A] mt-1">
                  €{selectedStaff.cogs.toFixed(2)}
                </p>
                <span className="text-[10px] text-[#FF453A]/60 mt-1 block">
                  Fornitura sostenuta
                </span>
              </div>

              {/* Margine Medio per Pezzo */}
              <div className="spatial-tile p-3 border-[#30D158]/20">
                <span className="spatial-caption text-[10px] text-[#30D158] block">Margine Medio</span>
                <p className="spatial-amount text-lg font-bold text-[#30D158] mt-1">
                  +€{(selectedStaff.qtySold > 0 ? selectedStaff.unitProfit / selectedStaff.qtySold : 0).toFixed(2)}
                </p>
                <span className="text-[10px] text-[#30D158]/60 mt-1 block">
                  Per singolo pezzo
                </span>
              </div>

              {/* Eventuali Crediti in Sospeso */}
              {Boolean(selectedStaff.pendingDebt && selectedStaff.pendingDebt > 0) && (
                <div className="col-span-2 p-2.5 rounded-xl bg-[#FF9F0A]/10 border border-[#FF9F0A]/25 flex items-center justify-between text-xs">
                  <span className="text-[#FF9F0A] font-medium flex items-center gap-1.5">
                    <AlertCircle size={13} /> In attesa di saldo (Promemoria)
                  </span>
                  <span className="font-bold text-[#FF9F0A]">€{selectedStaff.pendingDebt!.toFixed(2)}</span>
                </div>
              )}
            </div>

            {/* Nota contabile esplicativa */}
            <div className="mt-3.5 p-3 rounded-xl bg-white/[0.04] border border-white/5 flex items-start gap-2">
              <Info size={14} className="text-white/40 shrink-0 mt-0.5" />
              <p className="text-[11px] text-white/50 leading-relaxed">
                Margine attribuito riga per riga a <strong className="text-white font-medium uppercase">{selectedStaff.name}</strong>:{' '}
                Prezzo di vendita effettivo incassato − Costo fornitura sostenuto.
              </p>
            </div>

            {/* Close Button */}
            <button
              type="button"
              onClick={() => setSelectedStaff(null)}
              className="mt-4 w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/20 active:scale-98 text-white font-semibold text-sm transition-all"
            >
              Chiudi
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
