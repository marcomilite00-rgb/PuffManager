import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { safeNumber } from '../lib/money';
import { useRealtime } from '../hooks/useRealtime';
import { Badge } from '../components/ui/Badge';
import { PageSkeleton } from '../components/ui/PageSkeleton';
import { Gauge } from '../components/ui/Gauge';
import type {
  Settings,
  Staff,
  OrderWithItems,
  ReminderSummary,
  Order,
  OrderPayment,
} from '../types/database';
import { CreditCard, TrendingUp, TrendingDown, Receipt, Users, AlertCircle } from 'lucide-react';

export const Cassa: React.FC = () => {
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [reminders, setReminders] = useState<ReminderSummary[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);

  const loadInit = useCallback(async () => {
    try {
      const [oRes, sRes, setRes, rRes] = await Promise.all([
        supabase
          .from('orders')
          .select('*, payments(*), items:order_items(*, variant:product_variants(unit_cost))'),
        supabase.from('staff').select('*'),
        supabase.from('settings').select('*').limit(1),
        supabase.from('reminders').select('*').gt('amount_due', 0),
      ]);
      if (oRes.data) setOrders(oRes.data);
      if (sRes.data) setStaff(sRes.data);
      if (setRes.data?.[0]) setSettings(setRes.data[0]);
      if (rRes.data) setReminders(rRes.data);
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
      pays.forEach((p) => {
        const payDate = p.created_at ? new Date(p.created_at) : null;
        if (!lastReset || (payDate && payDate >= lastReset)) grossTotal += safeNumber(p.amount);
      });
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
    const earnings: { [key: string]: number } = {};
    staff.forEach((s) => (earnings[s.id] = 0));
    const lastReset = settings?.last_reset_date ? new Date(settings.last_reset_date) : null;
    orders.forEach((order) => {
      const staffId = order.sold_by_staff_id;
      if (!staffId || !(staffId in earnings)) return;
      const payments = order.payments || [];
      payments.forEach((p) => {
        const payDate = p.created_at ? new Date(p.created_at) : null;
        if (!lastReset || (payDate && payDate >= lastReset)) earnings[staffId] += safeNumber(p.amount);
      });
    });
    const totalGross = Object.values(earnings).reduce((acc, val) => acc + val, 0);
    const totalNet = totals.net;
    return staff
      .map((s) => {
        const gross = earnings[s.id] || 0;
        const share = totalGross > 0 ? gross / totalGross : 0;
        return {
          ...s,
          gross,
          netto: totalGross * share,
          utile: totalNet * share,
          percent: share * 100,
        };
      })
      .sort((a, b) => b.gross - a.gross);
  }, [orders, staff, settings, totals.net]);

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
    <div className="w-full max-w-5xl mx-auto space-y-6">
      {/* ── Top Header ── */}
      <div className="flex items-center justify-between pt-2">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="spatial-chip spatial-chip-blue text-[11px] py-0.5">
              <CreditCard size={11} /> Cassa & Bilancio
            </span>
            <span className="spatial-caption text-white/50">
              Aggiornamento live
            </span>
          </div>
          <h1 className="spatial-title text-2xl sm:text-3xl font-semibold text-white">
            Pannello Cassa
          </h1>
        </div>
      </div>

      {/* ── Hero Widget with Center Gauge Dial (Air Conditioner / Thermostat Style) ── */}
      <div className="spatial-panel-strong p-6 sm:p-8 flex flex-col items-center justify-center text-center relative overflow-hidden">
        {/* Subtle Ambient Radial behind Gauge */}
        <div
          className="absolute w-72 h-72 rounded-full pointer-events-none -z-10 blur-3xl opacity-20"
          style={{ background: gaugeColor }}
        />

        {/* Circular Thermostat Gauge */}
        <Gauge
          value={gaugePercent}
          size={230}
          strokeWidth={14}
          color={gaugeColor}
          className="my-2"
        >
          <div className="flex flex-col items-center justify-center">
            <span className="spatial-caption text-white/50 text-[10px] uppercase tracking-wider mb-1">
              Bilancio Netto
            </span>
            <span className="spatial-amount text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-none mb-1">
              €{totals.net.toFixed(2)}
            </span>
            <span className="spatial-caption text-[10px] text-white/40">
              {settings?.last_reset_date
                ? `Dal ${new Date(settings.last_reset_date).toLocaleDateString('it-IT')}`
                : 'Sessione corrente'}
            </span>
          </div>
        </Gauge>

        {/* Status Chip */}
        <div className="mt-3 flex items-center justify-center gap-2">
          {isNetPositive ? (
            <span className="spatial-chip spatial-chip-green text-xs font-semibold py-1 px-3">
              <TrendingUp size={13} /> In Attivo ({gaugePercent.toFixed(0)}% del lordo)
            </span>
          ) : (
            <span className="spatial-chip spatial-chip-red text-xs font-semibold py-1 px-3">
              <TrendingDown size={13} /> In Deficit
            </span>
          )}
        </div>
      </div>

      {/* ── 3 Smart-Home KPI Tiles: Lordo, Spese, Extra ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        {/* Lordo */}
        <div className="spatial-tile">
          <div className="flex items-center justify-between">
            <span className="spatial-caption text-white/50">Incasso Lordo</span>
            <div className="w-9 h-9 rounded-full bg-[#0A84FF]/15 border border-[#0A84FF]/30 flex items-center justify-center text-[#0A84FF]">
              <TrendingUp size={17} />
            </div>
          </div>
          <div className="mt-2">
            <p className="spatial-amount text-2xl sm:text-3xl font-bold text-white tracking-tight">
              €{totals.gross.toFixed(2)}
            </p>
            <p className="spatial-footnote text-xs text-white/50 mt-0.5">
              Pagamenti totali registrati
            </p>
          </div>
        </div>

        {/* Spese Carico */}
        <div className="spatial-tile border-[#FF453A]/20">
          <div className="flex items-center justify-between">
            <span className="spatial-caption text-[#FF453A]">Spese Totali</span>
            <div className="w-9 h-9 rounded-full bg-[#FF453A]/15 border border-[#FF453A]/30 flex items-center justify-center text-[#FF453A]">
              <Receipt size={17} />
            </div>
          </div>
          <div className="mt-2">
            <p className="spatial-amount text-2xl sm:text-3xl font-bold text-[#FF453A] tracking-tight">
              €{totals.spent.toFixed(2)}
            </p>
            <p className="spatial-footnote text-xs text-white/50 mt-0.5">
              Spese fisse e fornitura
            </p>
          </div>
        </div>

        {/* Extra Correnti */}
        <div className="spatial-tile border-[#FF9F0A]/20">
          <div className="flex items-center justify-between">
            <span className="spatial-caption text-[#FF9F0A]">Spese Extra</span>
            <div className="w-9 h-9 rounded-full bg-[#FF9F0A]/15 border border-[#FF9F0A]/30 flex items-center justify-center text-[#FF9F0A]">
              <AlertCircle size={17} />
            </div>
          </div>
          <div className="mt-2">
            <p className="spatial-amount text-2xl sm:text-3xl font-bold text-[#FF9F0A] tracking-tight">
              €{totals.currentLoadExpenses.toFixed(2)}
            </p>
            <p className="spatial-footnote text-xs text-white/50 mt-0.5">
              Uscite del carico corrente
            </p>
          </div>
        </div>
      </div>

      {/* ── Ripartizione Staff con Barre di Avanzamento Blu ── */}
      <section className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="spatial-caption text-white/60 tracking-wider font-semibold flex items-center gap-2">
            <Users size={13} /> RIPARTIZIONE UTILI STAFF
          </h2>
          <span className="spatial-caption text-white/40">
            {staffEarningsList.length} Membri attivi
          </span>
        </div>

        <div className="spatial-panel p-0 overflow-hidden divide-y divide-white/10">
          {staffEarningsList.map((s) => (
            <div
              key={s.id}
              className="spatial-row px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3.5 flex-1 min-w-0">
                <div className="w-11 h-11 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center font-bold text-white text-base shrink-0">
                  {s.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="spatial-headline text-[15px] font-semibold text-white truncate">
                    {s.name}
                  </p>
                  {/* Blue Progress Bar */}
                  <div className="spatial-progress-track mt-2 max-w-xs">
                    <div
                      className="spatial-progress-fill bg-[#0A84FF] shadow-[0_0_8px_rgba(10,132,255,0.6)]"
                      style={{ width: `${Math.max(0, Math.min(s.percent, 100))}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="text-left sm:text-right shrink-0 pl-14 sm:pl-0">
                <span className="spatial-amount text-lg font-bold text-white block">
                  €{s.utile.toFixed(2)}
                </span>
                <p className="spatial-caption text-white/50 mt-0.5">
                  {s.percent.toFixed(0)}% quota · Lordo €{s.netto.toFixed(2)}
                </p>
              </div>
            </div>
          ))}
          {staffEarningsList.length === 0 && (
            <p className="spatial-footnote p-6 text-center text-white/40">
              Nessun dato registrato per lo staff nella sessione corrente
            </p>
          )}
        </div>
      </section>

      {/* ── Sospesi / Debiti da Incassare ── */}
      {reminders.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <h2 className="spatial-caption text-[#FF453A] tracking-wider font-semibold flex items-center gap-2">
              <AlertCircle size={13} /> CREDITI SOSPESI ({reminders.length})
            </h2>
            <span className="spatial-caption text-white/40">
              In attesa di saldo
            </span>
          </div>

          <div className="spatial-panel p-0 overflow-hidden divide-y divide-white/10">
            {reminders.map((d) => (
              <div
                key={d.id}
                className="spatial-row px-4 sm:px-6 py-3.5 flex items-center justify-between gap-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="spatial-headline text-[15px] font-semibold text-white truncate">
                    {d.customer_name || 'Cliente'}
                  </p>
                  <p className="spatial-caption text-white/40 mt-0.5">
                    Registrato il {new Date(d.created_at).toLocaleDateString('it-IT')}
                  </p>
                </div>
                <div className="shrink-0">
                  <Badge variant="danger" size="sm">
                    €{safeNumber(d.amount_due).toFixed(2)} da incassare
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
