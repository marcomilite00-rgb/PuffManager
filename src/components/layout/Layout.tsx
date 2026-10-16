import React, { useState, useEffect, useCallback } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { motion, AnimatePresence } from 'motion/react';
import {
    ShoppingCart, Calendar, Package, CreditCard, History, Settings,
    LogOut, Menu, X, Bell, ArrowLeftRight
} from 'lucide-react';

interface LayoutProps { children: React.ReactNode; }

export const Layout: React.FC<LayoutProps> = ({ children }) => {
    const { user, logout } = useAuth();
    const location = useLocation();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [hasReminders, setHasReminders] = useState(false);

    const checkReminders = useCallback(async () => {
        if (!user) return;
        let query = supabase.from('reminders').select('id', { count: 'exact', head: true }).eq('status', 'active');
        if (user.role === 'helper') {
            const { data: staffId } = await supabase.from('staff_sessions').select('staff_id').eq('auth_uid', user.id).single();
            if (staffId) query = query.eq('created_by_staff_id', staffId.staff_id);
        }
        const { count } = await query;
        setHasReminders(count ? count > 0 : false);
    }, [user]);

    useEffect(() => {
        if (!user) return;
        const timer = setTimeout(checkReminders, 0);
        const interval = setInterval(checkReminders, 30000);
        return () => { clearTimeout(timer); clearInterval(interval); };
    }, [user, checkReminders]);

    if (!user || location.pathname === '/login') return <>{children}</>;

    const role = user.role?.toLowerCase() || '';
    const isAdmin = role === 'admin';

    const navItems = [
        { to: '/vendita', icon: ShoppingCart, label: 'Vendita' },
        { to: '/prenotazioni', icon: Calendar, label: 'Prenotazioni' },
        { to: '/inventario', icon: Package, label: 'Magazzino' },
        { to: '/cassa', icon: CreditCard, label: 'Cassa' },
        { to: '/storico', icon: History, label: 'Storico' },
        { to: '/promemoria', icon: Bell, label: 'Scadenze', alert: hasReminders },
    ];

    const railBtn = (active: boolean): React.CSSProperties => ({
        background: active ? 'var(--label)' : 'transparent',
        color: active ? 'var(--surface-secondary)' : 'var(--label-secondary)',
    });

    return (
        <div className="min-h-screen flex font-body" style={{ background: 'var(--surface)', color: 'var(--label)' }}>
            {/* Rail verticale stile Orizon (desktop) */}
            <aside className="hidden md:flex flex-col items-center py-5 pl-5 pr-1 sticky top-0 h-screen z-50 shrink-0">
                <div className="ios-tabbar flex flex-col items-center gap-1.5 px-2.5 py-3 flex-1" style={{ borderRadius: 28 }}>
                    <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-[15px] mb-2" style={{ background: 'var(--label)', color: 'var(--surface-secondary)', fontFamily: 'var(--font-family-title)' }}>
                        P
                    </div>
                    {navItems.map((item) => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            title={item.label}
                            className="ios-press relative w-11 h-11 rounded-full flex items-center justify-center"
                            style={({ isActive }: { isActive: boolean }) => railBtn(isActive)}
                        >
                            <item.icon size={19} strokeWidth={2} />
                            {item.alert && (
                                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full" style={{ background: '#C0392B' }} />
                            )}
                        </NavLink>
                    ))}
                    <div className="flex-1" />
                    {isAdmin && (
                        <NavLink to="/admin" title="Admin" className="ios-press w-11 h-11 rounded-full flex items-center justify-center"
                            style={({ isActive }: { isActive: boolean }) => railBtn(isActive)}>
                            <Settings size={19} />
                        </NavLink>
                    )}
                    <Link to="/login" title={`Cambia profilo (${user.name})`}
                        className="ios-press w-11 h-11 rounded-full flex items-center justify-center font-semibold text-[15px]"
                        style={{ background: 'var(--surface-tertiary)', color: 'var(--label)' }}>
                        {user.name[0]?.toUpperCase()}
                    </Link>
                    <button onClick={logout} title="Esci" className="ios-press w-11 h-11 rounded-full flex items-center justify-center" style={{ color: 'var(--label-tertiary)' }}>
                        <LogOut size={18} />
                    </button>
                </div>
            </aside>

            <div className="flex-1 min-w-0 flex flex-col">
                {/* Header mobile */}
                <header className="md:hidden sticky top-0 z-50 px-4 pt-3">
                    <div className="ios-tabbar flex items-center justify-between pl-5 pr-2 py-2">
                        <div>
                            <h1 className="ios-headline" style={{ fontFamily: 'var(--font-family-title)', fontWeight: 600 }}>Puff Manager</h1>
                            <p className="ios-caption capitalize">{user.role} · {user.name}</p>
                        </div>
                        <button onClick={() => setIsMobileMenuOpen(true)} className="orizon-circle-btn" aria-label="Menu">
                            <Menu size={20} />
                        </button>
                    </div>
                </header>

                {/* Drawer mobile */}
                <AnimatePresence>
                    {isMobileMenuOpen && (
                        <React.Fragment key="mobile-drawer">
                            <motion.div
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                onClick={() => setIsMobileMenuOpen(false)}
                                className="fixed inset-0 z-[60] md:hidden"
                                style={{ background: 'rgba(30,22,14,0.4)', backdropFilter: 'blur(4px)' }}
                            />
                            <motion.div
                                initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
                                transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                                className="fixed top-3 right-3 bottom-24 w-72 z-[70] p-4 flex flex-col md:hidden ios-card"
                                style={{ borderRadius: 28 }}
                            >
                                <div className="flex justify-between items-center mb-3 px-1">
                                    <span className="ios-footnote">Menu</span>
                                    <button onClick={() => setIsMobileMenuOpen(false)} className="orizon-circle-btn orizon-circle-btn-soft" style={{ width: 38, height: 38 }} aria-label="Chiudi menu">
                                        <X size={18} />
                                    </button>
                                </div>
                                <nav className="flex-1 space-y-1 overflow-y-auto">
                                    {[...navItems, ...(isAdmin ? [{ to: '/admin', icon: Settings, label: 'Admin' }] : [])].map((item) => (
                                        <NavLink
                                            key={item.to}
                                            to={item.to}
                                            onClick={() => setIsMobileMenuOpen(false)}
                                            className="ios-press flex items-center gap-3 px-4 py-3 rounded-2xl text-[15px]"
                                            style={({ isActive }: { isActive: boolean }) => isActive
                                                ? { background: 'var(--label)', color: 'var(--surface-secondary)', fontWeight: 600 }
                                                : { color: 'var(--label)' }}
                                        >
                                            <item.icon size={19} />
                                            <span className="flex-1">{item.label}</span>
                                            {'alert' in item && item.alert && <span className="w-2 h-2 rounded-full" style={{ background: '#C0392B' }} />}
                                        </NavLink>
                                    ))}
                                </nav>
                                <div className="pt-3 mt-2 flex gap-2" style={{ borderTop: '1px solid var(--separator)' }}>
                                    <Link to="/login" onClick={() => setIsMobileMenuOpen(false)} className="ios-press flex-1 flex items-center justify-center gap-2 py-2.5 rounded-full text-[14px] font-medium" style={{ background: 'var(--surface-tertiary)', color: 'var(--label)' }}>
                                        <ArrowLeftRight size={15} /> Profilo
                                    </Link>
                                    <button onClick={logout} className="ios-press flex-1 flex items-center justify-center gap-2 py-2.5 rounded-full text-[14px] font-medium" style={{ background: 'rgba(192,57,43,0.1)', color: '#C0392B' }}>
                                        <LogOut size={15} /> Esci
                                    </button>
                                </div>
                            </motion.div>
                        </React.Fragment>
                    )}
                </AnimatePresence>

                <main className="flex-1 min-w-0">
                    {children}
                </main>

                {/* Tabbar pill fluttuante (mobile) */}
                <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 px-4" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
                    <div className="ios-tabbar flex items-center justify-around px-2 py-2">
                        {navItems.map((item) => (
                            <NavLink key={item.to} to={item.to} className="ios-press flex-1 min-w-0" title={item.label}>
                                {({ isActive }) => (
                                    <div className="flex flex-col items-center gap-1 py-1 rounded-2xl"
                                        style={isActive ? { background: 'var(--label)', color: 'var(--surface-secondary)' } : { color: 'var(--label-tertiary)' }}>
                                        <span className="relative">
                                            <item.icon size={21} strokeWidth={isActive ? 2.2 : 1.7} />
                                            {item.alert && <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full" style={{ background: '#C0392B' }} />}
                                        </span>
                                        <span style={{ fontSize: 9.5, fontWeight: isActive ? 600 : 500, lineHeight: 1 }}>{item.label}</span>
                                    </div>
                                )}
                            </NavLink>
                        ))}
                    </div>
                </nav>
            </div>
        </div>
    );
};
