import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { safeNumber } from '../lib/money';
import {
    TrendingUp,
    AlertCircle,
    DollarSign,
    Clock,
    Scale,
    Users,
    UserCircle as UserIcon
} from 'lucide-react';
import { clsx } from 'clsx';
import { Badge } from '../components/ui/Badge';

export const Cassa: React.FC = () => {
    const [orders, setOrders] = useState<any[]>([]);
    const [staff, setStaff] = useState<any[]>([]);
    const [reminders, setReminders] = useState<any[]>([]);
    const [settings, setSettings] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadInit = async () => {
            setLoading(true);
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
            } catch (e) {
                console.error("Cassa load error", e);
            } finally {
                setLoading(false);
            }
        };
        loadInit();
    }, []);

    const totals = useMemo(() => {
        const lastReset = settings?.last_reset_date ? new Date(settings.last_reset_date) : null;
        let grossTotal = 0;
        
        orders.forEach(o => {
            const pays = o.payments || [];
            pays.forEach((p: any) => {
                const payDate = p.created_at ? new Date(p.created_at) : null;
                if (!lastReset || (payDate && payDate >= lastReset)) {
                    grossTotal += safeNumber(p.amount);
                }
            });
        });

        const spent = safeNumber(settings?.money_spent_total);
        const netValue = grossTotal - spent;
        
        const currentLoadExpenses = safeNumber(settings?.money_spent_current_load);

        return { gross: grossTotal, spent, net: netValue, currentLoadExpenses };
    }, [orders, settings]);

    const staffEarningsList = useMemo(() => {
        if (!staff.length) return [];
        const earnings: { [key: string]: { gross: number, cost: number } } = {};
        staff.forEach(s => earnings[s.id] = { gross: 0, cost: 0 });
        
        const lastReset = settings?.last_reset_date ? new Date(settings.last_reset_date) : null;

        orders.forEach(order => {
            const staffId = order.sold_by_staff_id;
            if (!staffId || !earnings[staffId]) return;

            let orderSessionGross = 0;
            const payments = order.payments || [];
            payments.forEach((p: any) => {
                if (!lastReset || new Date(p.created_at) >= lastReset) {
                    orderSessionGross += safeNumber(p.amount);
                }
            });

            if (orderSessionGross > 0) {
                earnings[staffId].gross += orderSessionGross;
                const items = order.items || [];
                const orderCost = items.reduce((acc: number, item: any) => {
                    const cost = safeNumber(item.variant?.unit_cost);
                    return acc + (safeNumber(item.qty) * cost);
                }, 0);
                
                const orderGrossTotal = safeNumber(order.gross_total);
                const costProportion = orderGrossTotal > 0 ? orderSessionGross / orderGrossTotal : 1;
                earnings[staffId].cost += (orderCost * costProportion);
            }
        });

        const totalNetSession = Object.values(earnings).reduce((acc, curr) => acc + (curr.gross - curr.cost), 0);

        return staff.map(s => {
            const e = earnings[s.id] || { gross: 0, cost: 0 };
            const net = e.gross - e.cost;
            return {
                ...s,
                gross: e.gross,
                net: net,
                percent: Math.abs(totalNetSession) > 0 ? (net / Math.abs(totalNetSession)) * 100 : 0
            };
        }).sort((a, b) => b.gross - a.gross);
    }, [orders, staff, settings]);

    if (loading) return (
        <div className="p-10 flex flex-col items-center justify-center min-h-[50vh] gap-6 animate-fade">
            <div className="w-16 h-16 border-8 border-primary/20 border-t-primary rounded-full animate-spin"></div>
            <p className="label-caps text-xs text-slate-500">Analisi Finanziaria...</p>
        </div>
    );

    return (
        <div className="space-y-6 md:space-y-12 animate-fade safe-area-pt p-4 md:p-8 max-w-6xl mx-auto pb-28">
            {/* Header section */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div className="space-y-1 md:space-y-3">
                    <h1 className="text-4xl md:text-7xl font-black italic tracking-tighter text-white uppercase leading-none">
                        Cassa<span className="text-primary not-italic">Pro</span>
                    </h1>
                    <p className="label-caps text-[10px] md:text-xs text-slate-500 tracking-widest uppercase">Analisi finanziaria sessione</p>
                </div>
                {settings?.last_reset_date && (
                    <div className="px-3 py-1.5 md:px-6 md:py-3 glass rounded-xl md:rounded-2xl flex items-center gap-2 md:gap-3 border-white/5 w-fit">
                        <Clock size={12} className="text-primary md:w-4 md:h-4" />
                        <span className="label-caps text-[8px] md:text-[9px] text-slate-500 font-bold uppercase">Reset: <span className="text-white ml-1">{new Date(settings.last_reset_date).toLocaleDateString()}</span></span>
                    </div>
                )}
            </div>

            {/* Main Net Profit View */}
            <div className="relative group">
                <div className="absolute -inset-0.5 md:-inset-1 bg-gradient-to-r from-primary/30 to-success/30 rounded-3xl md:rounded-[3.5rem] blur opacity-10 group-hover:opacity-30 transition duration-1000"></div>
                <div className="relative glass rounded-3xl md:rounded-[3rem] p-6 md:p-20 flex flex-col items-center justify-center text-center border-white/10 shadow-2xl overflow-hidden bg-surface-900/40 backdrop-blur-3xl">
                    <div className="w-10 h-10 md:w-24 md:h-24 bg-primary/10 rounded-xl md:rounded-[2rem] flex items-center justify-center text-primary mb-3 md:mb-8 relative z-10 shadow-inner border border-primary/20">
                        <Scale size={20} className="md:w-12 md:h-12" />
                    </div>
                    <p className="text-[8px] md:text-sm font-black uppercase tracking-[0.3em] md:tracking-[0.5em] text-slate-500 mb-1 md:mb-6 leading-none pt-1">Bilancio Netto Sessione</p>
                    <h2 className={clsx("text-4xl md:text-9xl font-black tracking-tighter mb-2 md:mb-8 italic leading-none tabular-nums drop-shadow-2xl", totals.net >= 0 ? "text-white" : "text-danger")}>
                        €{totals.net.toFixed(2)}
                    </h2>
                    <Badge variant={totals.net >= 0 ? 'success' : 'danger'} size="sm" className="px-2 py-0 md:px-4 md:py-1 md:text-xs">
                        {totals.net >= 0 ? 'SESSIONE IN POSITIVO' : 'DEFICIT OPERATIVO'}
                    </Badge>
                </div>
            </div>

            {/* Stats Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-6">
                {[
                    { label: 'Incasso Lordo', val: totals.gross, icon: TrendingUp, color: 'text-success', bg: 'bg-success/10' },
                    { label: 'Spese Carico', val: totals.spent, icon: DollarSign, color: 'text-danger', bg: 'bg-danger/10' },
                    { label: 'Spese Durante Carico', val: totals.currentLoadExpenses, icon: AlertCircle, color: 'text-amber-500', bg: 'bg-amber-500/10' }
                ].map((stat, i) => (
                    <div key={i} className="glass rounded-xl md:rounded-[2.5rem] p-4 md:p-8 border-white/5 flex items-center md:flex-col gap-4 md:gap-5 group hover:border-primary/20 transition-all">
                        <div className={clsx("w-10 h-10 md:w-16 md:h-16 rounded-lg md:rounded-2xl flex items-center justify-center shadow-lg transition-transform group-hover:scale-110", stat.bg, stat.color)}>
                            <stat.icon size={18} className="md:w-8 md:h-8" />
                        </div>
                        <div className="flex-1 md:text-center min-w-0">
                            <p className="label-caps text-[8px] md:text-[10px] text-slate-500 mb-0.5 md:mb-2 uppercase tracking-widest">{stat.label}</p>
                            <p className="text-xl md:text-4xl font-black text-white italic tracking-tighter truncate leading-none">€{stat.val.toFixed(2)}</p>
                        </div>
                    </div>
                ))}
            </div>
            
            {/* Staff Distribution Section */}
            <div className="space-y-4 md:space-y-8">
                <div className="flex items-center gap-3 px-2">
                    <Users size={20} className="text-primary md:w-6 md:h-6" />
                    <h3 className="text-lg md:text-3xl font-black italic uppercase tracking-tighter">Ripartizione Staff</h3>
                </div>

                {/* Desktop Table / Mobile Cards */}
                <div className="hidden md:block glass-card rounded-[2.5rem] border-white/10 overflow-hidden shadow-2xl">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-white/5 border-b border-white/10">
                                <th className="px-8 py-6 label-caps text-[10px] text-slate-500">Membro</th>
                                <th className="px-8 py-6 label-caps text-[10px] text-center text-success">Lordo</th>
                                <th className="px-8 py-6 label-caps text-[10px] text-center text-primary">Utile</th>
                                <th className="px-8 py-6 label-caps text-[10px] text-right text-slate-500">Quota</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {staffEarningsList.map((s) => (
                                <tr key={s.id} className="hover:bg-white/5 transition-all group">
                                    <td className="px-8 py-6">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-xl bg-surface-950 flex items-center justify-center font-black text-xl text-primary border border-white/10">{s.name[0]}</div>
                                            <div className="flex flex-col">
                                                <span className="text-lg font-black text-white italic uppercase">{s.name}</span>
                                                <span className="label-caps text-[8px] text-slate-600 uppercase">{s.role}</span>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-8 py-6 text-center">
                                        <span className="text-xl font-black italic text-success tracking-tighter">€{s.gross.toFixed(0)}</span>
                                    </td>
                                    <td className="px-8 py-6 text-center">
                                        <div className="flex flex-col items-center gap-2">
                                            <span className={clsx("text-2xl font-black italic tracking-tighter", s.net >= 0 ? "text-primary" : "text-danger")}>€{s.net.toFixed(0)}</span>
                                            <div className="w-20 h-1.5 bg-white/5 rounded-full overflow-hidden">
                                                <div className={clsx("h-full", s.net >= 0 ? "bg-primary" : "bg-danger")} style={{ width: `${s.gross > 0 ? Math.min(Math.abs(s.net/s.gross)*100, 100) : 0}%` }} />
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-8 py-6 text-right font-black text-slate-400 italic text-lg">{s.percent.toFixed(0)}%</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Mobile Specific List */}
                <div className="md:hidden space-y-3">
                    {staffEarningsList.map((s) => (
                        <div key={s.id} className="glass rounded-2xl p-5 border-white/5 space-y-4">
                            <div className="flex justify-between items-center">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-lg bg-surface-900 flex items-center justify-center font-black text-primary border border-white/10 uppercase text-sm">{s.name[0]}</div>
                                    <div className="flex flex-col">
                                        <span className="text-base font-black text-white italic tracking-tight">{s.name}</span>
                                        <span className="label-caps text-[7px] text-slate-600 uppercase tracking-widest leading-none">{s.role}</span>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="label-caps text-[7px] text-slate-500 mb-0.5">Quota Sessione</p>
                                    <p className="text-lg font-black text-white italic leading-none tabular-nums">{s.percent.toFixed(0)}%</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3 pt-4 border-t border-white/5">
                                <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                                    <p className="label-caps text-[7px] text-success mb-1">Cassa Lorda</p>
                                    <p className="text-xl font-black text-success italic tracking-tighter leading-none">€{s.gross.toFixed(0)}</p>
                                </div>
                                <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                                    <p className="label-caps text-[7px] text-primary mb-1">Tuo Guadagno</p>
                                    <p className={clsx("text-xl font-black italic tracking-tighter leading-none", s.net >= 0 ? "text-primary" : "text-danger")}>€{s.net.toFixed(0)}</p>
                                </div>
                            </div>
                        </div>
                    ))}
                    {/* Consolidato Total for Mobile */}
                    <div className="bg-primary/10 border border-primary/20 rounded-2xl p-5 mt-4 flex items-center justify-between shadow-lg">
                        <span className="label-caps text-[10px] text-primary font-black uppercase tracking-tighter">Totale Netto Staff</span>
                        <span className="text-2xl font-black text-white italic tracking-tighter">€{staffEarningsList.reduce((acc, s) => acc + s.net, 0).toFixed(0)}</span>
                    </div>
                </div>
            </div>

            {/* Debts Table */}
            {reminders.length > 0 && (
                <div className="space-y-4 md:space-y-8 pt-6">
                    <div className="flex items-center gap-3 md:gap-4 px-2">
                        <AlertCircle size={20} className="text-danger md:w-6 md:h-6" />
                        <h3 className="text-lg md:text-3xl font-black italic uppercase tracking-tighter">Situazione Sospesi</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-8">
                        {reminders.map(d => (
                            <div key={d.id} className="glass-card rounded-[1.5rem] md:rounded-[2.5rem] p-5 md:p-8 border-white/10 flex flex-col justify-between hover:border-danger/20 transition-all">
                                <div className="flex justify-between items-start mb-6">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 md:w-14 md:h-14 bg-danger/10 rounded-xl md:rounded-2xl flex items-center justify-center text-danger group-hover:scale-110 transition-transform">
                                            <UserIcon size={20} />
                                        </div>
                                        <div>
                                            <p className="font-black text-white uppercase italic text-sm md:text-lg leading-none mb-1">{d.customer_name || 'Generic'}</p>
                                            <p className="label-caps text-[8px] text-slate-600">Creato il {new Date(d.created_at).toLocaleDateString()}</p>
                                        </div>
                                    </div>
                                    <Badge variant="danger" size="sm">DEBITO</Badge>
                                </div>
                                <div className="pt-4 md:pt-8 border-t border-white/5 flex items-end justify-between">
                                    <span className="label-caps text-[8px] md:text-[10px] text-slate-500">Saldo Aperto:</span>
                                    <span className="text-2xl md:text-4xl font-black text-danger italic tabular-nums tracking-tighter">€{safeNumber(d.amount_due).toFixed(2)}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
