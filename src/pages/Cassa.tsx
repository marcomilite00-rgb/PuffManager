import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { safeNumber } from '../lib/money';
import type { Order, Staff } from '../types/database';
import {
    TrendingUp,
    AlertCircle,
    ArrowUpRight,
    DollarSign,
    RefreshCcw,
    Users,
    PieChart,
    Clock
} from 'lucide-react';

export const Cassa: React.FC = () => {
    const [orders, setOrders] = useState<Order[]>([]);
    const [staff, setStaff] = useState<Staff[]>([]);
    const [reminders, setReminders] = useState<any[]>([]); // New state for real debts
    const [settings, setSettings] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchData();

        // Subscribe to real-time changes
        const subscription = supabase
            .channel('cassa_changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, () => fetchData())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => fetchData())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'reminders' }, () => fetchData())
            .subscribe();

        return () => {
            subscription.unsubscribe();
        };
    }, []);

    const fetchData = async () => {
        const [ordersRes, staffRes, settingsRes, remindersRes] = await Promise.all([
            supabase
                .from('orders')
                .select('*, payments(*), items:order_items(*, variant:product_variants(unit_cost))'),
            supabase
                .from('staff')
                .select('*'),
            supabase
                .from('settings')
                .select('*')
                .single(),
            supabase
                .from('reminders')
                .select('*')
                .gt('amount_due', 0)
                .order('created_at', { ascending: false })
        ]);

        if (ordersRes.data) setOrders(ordersRes.data as any);
        if (staffRes.data) setStaff(staffRes.data);
        if (settingsRes.data) setSettings(settingsRes.data);
        if (remindersRes.data) setReminders(remindersRes.data);

        setLoading(false);
    };

    // Session payments: filter individual payments by their created_at,
    // matching the closing RPC logic (which filters payments.created_at >= last_reset_date).
    // This correctly counts reminder payments made this session even if the
    // original order was from a prior session.
    const sessionPayments = useMemo(() => {
        const resetDate = settings?.last_reset_date ? new Date(settings.last_reset_date) : null;
        const all: { amount: number; staffId: string }[] = [];
        orders.forEach(order => {
            ((order as any).payments || []).forEach((p: any) => {
                const pDate = new Date(p.created_at);
                if (!resetDate || pDate >= resetDate) {
                    all.push({ amount: safeNumber(p.amount), staffId: order.sold_by_staff_id });
                }
            });
        });
        return all;
    }, [orders, settings]);

    const totals = useMemo(() => {
        const gross = sessionPayments.reduce((acc, p) => acc + p.amount, 0);

        const spentTotal = safeNumber(settings?.money_spent_total);

        let reinvestmentAmount = 0;
        if (settings) {
            if (settings.reinvest_mode === 'percentage') {
                reinvestmentAmount = (gross * safeNumber(settings.reinvest_value)) / 100;
            } else {
                reinvestmentAmount = safeNumber(settings.reinvest_value);
            }
        }

        const net = gross - reinvestmentAmount;

        return { gross, spent: spentTotal, net, reinvestment: reinvestmentAmount };
    }, [sessionPayments, settings]);

    const staffEarnings = useMemo(() => {
        const earnings: { [key: string]: { gross: number, cost: number } } = {};
        staff.forEach(s => earnings[s.id] = { gross: 0, cost: 0 });

        const resetDate = settings?.last_reset_date ? new Date(settings.last_reset_date) : null;

        // Sum payments and costs per staff member from session
        orders.forEach(order => {
            const staffId = order.sold_by_staff_id;
            if (earnings[staffId] === undefined) return;

            // Sum session payments for this order
            let orderSessionGross = 0;
            ((order as any).payments || []).forEach((p: any) => {
                const pDate = new Date(p.created_at);
                if (!resetDate || pDate >= resetDate) {
                    orderSessionGross += safeNumber(p.amount);
                }
            });

            if (orderSessionGross > 0) {
                earnings[staffId].gross += orderSessionGross;

                // Calculate real cost from items (unit_cost × qty)
                const orderItems = (order as any).items || [];
                const orderCost = orderItems.reduce((acc: number, item: any) => {
                    return acc + safeNumber(item.qty) * safeNumber(item.variant?.unit_cost);
                }, 0);

                // Proportional cost: if partial payment, take cost proportionally
                const orderGrossTotal = safeNumber(order.gross_total);
                const costProportion = orderGrossTotal > 0 ? orderSessionGross / orderGrossTotal : 1;
                earnings[staffId].cost += orderCost * costProportion;
            }
        });

        const totalNet = Object.values(earnings).reduce((a, b) => a + (b.gross - b.cost), 0);
        const absTotalNet = Math.abs(totalNet);

        return staff.map(s => {
            const net = earnings[s.id].gross - earnings[s.id].cost;
            const percent = absTotalNet > 0 ? (net / absTotalNet) * 100 : 0;
            return {
                ...s,
                gross: earnings[s.id].gross,
                net,
                percent
            };
        }).sort((a, b) => b.gross - a.gross);
    }, [orders, staff, settings]);

    if (loading) return (
        <div className="flex items-center justify-center min-h-[60vh]">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
    );

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight text-white">Cassa & Split</h1>
                <p className="text-slate-400">Riepilogo finanziario e ripartizione staff</p>
            </div>

            {/* Main Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
                <div className="md:col-span-3 glass rounded-[2rem] md:rounded-[3rem] p-6 md:p-10 flex flex-col items-center justify-center text-center border-white/10 shadow-2xl relative overflow-hidden group">
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent pointer-events-none group-hover:scale-110 transition-transform duration-700"></div>
                    <span className="text-[10px] md:text-xs font-black uppercase tracking-[0.2em] md:tracking-[0.3em] text-slate-500 mb-2">Incasso Netto Attuale</span>
                    <h2 className="text-4xl sm:text-5xl md:text-7xl font-black tracking-tighter text-white mb-4">
                        €{totals.net.toFixed(2)}
                    </h2>
                    <div className="flex gap-2 items-center bg-white/5 px-4 py-2 rounded-2xl border border-white/5">
                        <TrendingUp size={16} className="text-primary" />
                        <span className="text-[10px] md:text-sm font-bold text-primary uppercase tracking-widest">Margine operativo</span>
                    </div>
                </div>

                <div className="glass rounded-[1.5rem] md:rounded-[2rem] p-5 md:p-6 border-white/5 hover:border-emerald-500/30 transition-all group">
                    <div className="flex items-center justify-between mb-4">
                        <div className="p-3 bg-emerald-500/10 rounded-2xl text-emerald-400">
                            <TrendingUp size={24} className="w-5 h-5 md:w-6 md:h-6" />
                        </div>
                        <ArrowUpRight size={18} className="text-slate-700 group-hover:text-emerald-500 transition-colors" />
                    </div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Incasso Lordo</p>
                    <p className="text-2xl md:text-3xl font-black">€{totals.gross.toFixed(2)}</p>
                </div>

                <div className="glass rounded-[1.5rem] md:rounded-[2rem] p-5 md:p-6 border-white/5 hover:border-red-500/30 transition-all group">
                    <div className="flex items-center justify-between mb-4">
                        <div className="p-3 bg-red-500/10 rounded-2xl text-red-400">
                            <DollarSign size={24} className="w-5 h-5 md:w-6 md:h-6" />
                        </div>
                    </div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Soldi Spesi</p>
                    <p className="text-2xl md:text-3xl font-black">€{totals.spent.toFixed(2)}</p>
                </div>

                <div className="glass rounded-[1.5rem] md:rounded-[2rem] p-5 md:p-6 border-white/5 hover:border-orange-500/30 transition-all group">
                    <div className="flex items-center justify-between mb-4">
                        <div className="p-3 bg-orange-500/10 rounded-2xl text-orange-400">
                            <RefreshCcw size={24} className="w-5 h-5 md:w-6 md:h-6" />
                        </div>
                    </div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Per Reinvestimento</p>
                    <p className="text-2xl md:text-3xl font-black">€{totals.reinvestment.toFixed(2)}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Staff Split */}
                <div className="space-y-4 md:space-y-6">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-white/5 rounded-xl text-slate-400">
                            <Users size={18} />
                        </div>
                        <h3 className="text-lg md:text-xl font-bold uppercase tracking-tight">Ripartizione Guadagni</h3>
                    </div>

                    <div className="glass rounded-[2rem] md:rounded-[2.5rem] border border-white/5 overflow-hidden">
                        <div className="overflow-x-auto scrollbar-hide">
                            <table className="w-full min-w-[500px] md:min-w-0">
                                <thead>
                                    <tr className="bg-white/5 border-b border-white/5">
                                        <th className="px-4 md:px-6 py-4 text-left text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Staff</th>
                                        <th className="px-4 md:px-6 py-4 text-center text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400">Lordo</th>
                                        <th className="px-4 md:px-6 py-4 text-center text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] text-primary">Netto</th>
                                        <th className="px-4 md:px-6 py-4 text-right text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">%</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {staffEarnings.map((s) => (
                                        <tr key={s.id} className="hover:bg-white/5 transition-colors group">
                                            <td className="px-4 md:px-6 py-4 md:py-5">
                                                <div className="flex flex-col">
                                                    <span className="text-xs md:text-sm font-black text-white">{s.name}</span>
                                                    <span className="text-[8px] md:text-[10px] font-bold text-slate-500 uppercase tracking-widest">{s.role}</span>
                                                </div>
                                            </td>
                                            <td className="px-4 md:px-6 py-4 md:py-5 text-center">
                                                <span className="text-base md:text-lg font-black text-emerald-400">€{s.gross.toFixed(0)}</span>
                                            </td>
                                            <td className="px-4 md:px-6 py-4 md:py-5 text-center">
                                                <div className="inline-flex flex-col items-center">
                                                    <span className={`text-lg md:text-xl font-black ${s.net >= 0 ? 'text-[#00E676]' : 'text-[#FF4444]'}`}>€{s.net.toFixed(0)}</span>
                                                    <div className="w-12 md:w-16 h-1 bg-white/10 rounded-full mt-1 overflow-hidden">
                                                        <div
                                                            className={`h-full ${s.net >= 0 ? 'bg-[#00E676]' : 'bg-[#FF4444]'}`}
                                                            style={{ width: `${s.gross > 0 ? Math.min(Math.abs(s.net / s.gross) * 100, 100) : 0}%` }}
                                                        ></div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 md:px-6 py-4 md:py-5 text-right">
                                                <span className="text-xs md:text-sm font-black text-slate-400 tracking-tighter">{s.percent.toFixed(0)}%</span>
                                            </td>
                                        </tr>
                                    ))}

                                    {/* Totale Riassuntivo */}
                                    <tr className="bg-white/5 border-t border-white/10">
                                        <td className="px-4 md:px-6 py-4 md:py-5">
                                            <span className="text-xs md:text-sm font-black text-slate-400 uppercase tracking-widest">Totale Cassa</span>
                                        </td>
                                        <td className="px-4 md:px-6 py-4 md:py-5 text-center">
                                            <span className="text-base md:text-lg font-black text-emerald-400">€{totals.gross.toFixed(0)}</span>
                                        </td>
                                        <td className="px-4 md:px-6 py-4 md:py-5 text-center">
                                            <span className={`text-lg md:text-xl font-black ${staffEarnings.reduce((acc, s) => acc + s.net, 0) >= 0 ? 'text-[#00E676]' : 'text-[#FF4444]'}`}>€{staffEarnings.reduce((acc, s) => acc + s.net, 0).toFixed(0)}</span>
                                        </td>
                                        <td className="px-4 md:px-6 py-4 md:py-5 text-right">
                                            <span className="text-xs md:text-sm font-black text-slate-400 font-mono">100%</span>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        <div className="p-4 md:p-6 border-t border-white/5 bg-white/5">
                            <div className="flex items-center gap-3 text-[10px] md:text-sm text-slate-500">
                                <PieChart size={16} className="text-primary shrink-0" />
                                <p className="leading-tight">Il netto è calcolato come vendite lorde meno il costo reale degli articoli venduti (unit_cost dal database).</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Debts Area - NOW USING REAL REMINDERS TABLE */}
                <div className="space-y-6">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-red-500/10 rounded-xl text-red-400">
                            <AlertCircle size={20} />
                        </div>
                        <h3 className="text-xl font-bold italic tracking-tight">Debiti / In Sospeso</h3>
                    </div>

                    <div className="space-y-4">
                        {reminders.length > 0 ? (
                            reminders.map(d => (
                                <div key={d.id} className="glass rounded-3xl p-5 border border-white/5 flex items-center justify-between group hover:border-red-500/20 transition-all">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 bg-red-500/10 rounded-2xl flex items-center justify-center text-red-500">
                                            <Clock size={20} />
                                        </div>
                                        <div>
                                            <p className="font-bold">{d.customer_name || 'Generic'}</p>
                                            <p className="text-xs text-slate-500">{new Date(d.created_at).toLocaleDateString()}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xs text-slate-500 uppercase font-bold tracking-tight">Da Pagare</p>
                                        <p className="text-2xl font-black text-red-400">€{d.amount_due.toFixed(2)}</p>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="text-center py-16 glass rounded-[2.5rem] border-dashed border-white/10">
                                <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center text-emerald-500 mx-auto mb-4">
                                    <Clock size={32} />
                                </div>
                                <h4 className="font-bold text-slate-400">Nessun debito in sospeso</h4>
                                <p className="text-xs text-slate-600 mt-1 uppercase tracking-widest font-bold">Cassa in pareggio</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
