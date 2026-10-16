import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { safeNumber } from '../lib/money';
import { useRealtime } from '../hooks/useRealtime';
import { Badge } from '../components/ui/Badge';
import { PageSkeleton } from '../components/ui/PageSkeleton';
import type { Settings, Staff, OrderWithItems, ReminderSummary, Order, OrderPayment } from '../types/database';

export const Cassa: React.FC = () => {
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [reminders, setReminders] = useState<ReminderSummary[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);

  const loadInit = useCallback(async () => {
    try {
      const [oRes, sRes, setRes, rRes] = await Promise.all([
        supabase.from('orders').select('*, payments(*), items:order_items(*, variant:product_variants(unit_cost))'),
        supabase.from('staff').select('*'),
        supabase.from('settings').select('*').limit(1),
        supabase.from('reminders').select('*').gt('amount_due', 0)
      ]);
      if (oRes.data) setOrders(oRes.data);
      if (sRes.data) setStaff(sRes.data);
      if (setRes.data?.[0]) setSettings(setRes.data[0]);
      if (rRes.data) setReminders(rRes.data);
    } catch (e) { console.error("Cassa load error", e); } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadInit(); }, [loadInit]);

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
    orders.forEach(o => {
      const pays = o.payments || [];
      pays.forEach((p) => {
        const payDate = p.created_at ? new Date(p.created_at) : null;
        if (!lastReset || (payDate && payDate >= lastReset)) grossTotal += safeNumber(p.amount);
      });
    });
    const spent = safeNumber(settings?.money_spent_total);
    const currentLoadExpenses = safeNumber(settings?.money_spent_current_load);
    return { gross: grossTotal, spent, net: grossTotal - spent - currentLoadExpenses, currentLoadExpenses };
  }, [orders, settings]);

  const staffEarningsList = useMemo(() => {
    if (!staff.length) return [];
    const earnings: { [key: string]: number } = {};
    staff.forEach(s => earnings[s.id] = 0);
    const lastReset = settings?.last_reset_date ? new Date(settings.last_reset_date) : null;
    orders.forEach(order => {
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
    return staff.map(s => {
      const gross = earnings[s.id] || 0;
      const share = totalGross > 0 ? gross / totalGross : 0;
      return {
        ...s,
        gross,
        netto: totalGross * share,
        utile: totalNet * share,
        percent: share * 100
      };
    }).sort((a, b) => b.gross - a.gross);
  }, [orders, staff, settings, totals.net]);

  if (loading) return (
    <PageSkeleton titleClass="w-48 h-9" blocks={[{ count: 3, className: 'h-20' }, { count: 2, className: 'h-[64px]' }]} />
  );

  return (
    <div className="ios-page">
      <div className="orizon-hero p-6 md:p-8 text-center">
        <p className="ios-caption" style={{ color: 'rgba(255,248,238,0.7)' }}>
          Bilancio netto · dal {settings?.last_reset_date ? new Date(settings.last_reset_date).toLocaleDateString('it-IT') : '—'}
        </p>
        <p className="ios-title-large ios-amount mt-2" style={{ fontSize: 52, color: '#FFF8EE' }}>
          €{totals.net.toFixed(2)}
        </p>
        <div className="mt-3 flex justify-center">
          <span className="ios-chip" style={{ background: 'rgba(255,255,255,0.16)', color: '#FFF8EE' }}>
            {totals.net >= 0 ? 'In positivo' : 'In deficit'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        {[
          { label: 'Lordo', val: totals.gross },
          { label: 'Spese', val: totals.spent },
          { label: 'Extra', val: totals.currentLoadExpenses },
        ].map((stat) => (
          <div key={stat.label} className="ios-card p-3.5 text-center">
            <p className="ios-title-3 ios-amount">€{stat.val.toFixed(2)}</p>
            <p className="ios-caption mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      <section>
        <h2 className="ios-footnote px-1 mb-1.5">RIPARTIZIONE STAFF</h2>
        <div className="ios-grouped">
          {staffEarningsList.map((s) => (
            <div key={s.id} className="ios-row" style={{ minHeight: 60 }}>
              <div className="w-10 h-10 rounded-full flex items-center justify-center font-semibold shrink-0" style={{ background: 'var(--label)', color: 'var(--surface-secondary)' }}>
                {s.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="ios-headline text-[15px] truncate">{s.name}</p>
                <div className="h-1 rounded-full mt-1.5" style={{ background: 'var(--surface-tertiary)' }}>
                  <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(s.percent, 100))}%`, background: 'var(--accent)' }} />
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="ios-headline ios-amount text-[15px]">€{s.utile.toFixed(2)}</p>
                <p className="ios-caption">{s.percent.toFixed(0)}% · lordo €{s.netto.toFixed(2)}</p>
              </div>
            </div>
          ))}
          {staffEarningsList.length === 0 && <p className="ios-footnote p-4 text-center">Nessun dato staff</p>}
        </div>
      </section>

      {reminders.length > 0 && (
        <section>
          <h2 className="ios-footnote px-1 mb-1.5">SOSPESI · {reminders.length}</h2>
          <div className="ios-grouped">
            {reminders.map(d => (
              <div key={d.id} className="ios-row">
                <div className="flex-1 min-w-0">
                  <p className="ios-headline text-[15px] truncate">{d.customer_name || 'Cliente'}</p>
                  <p className="ios-caption">{new Date(d.created_at).toLocaleDateString('it-IT')}</p>
                </div>
                <Badge variant="danger" size="sm">€{safeNumber(d.amount_due).toFixed(2)}</Badge>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
