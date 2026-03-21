import React, { useState, useEffect } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ShoppingCart,
    Calendar,
    Package,
    CreditCard,
    History,
    Settings,
    LogOut,
    Menu,
    X,
    Bell,
    ChevronRight,
    ArrowLeftRight
} from 'lucide-react';
import { clsx } from 'clsx';

interface LayoutProps {
    children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
    const { user, logout } = useAuth();
    const location = useLocation();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [hasReminders, setHasReminders] = useState(false);

    useEffect(() => {
        if (!user) return;
        checkReminders();
        const interval = setInterval(checkReminders, 30000);
        return () => clearInterval(interval);
    }, [user]);

    const checkReminders = async () => {
        if (!user) return;
        let query = supabase.from('reminders').select('id', { count: 'exact', head: true }).eq('status', 'active');
        if (user.role === 'helper') {
            const { data: staffId } = await supabase.from('staff_sessions').select('staff_id').eq('auth_uid', user.id).single();
            if (staffId) query = query.eq('created_by_staff_id', staffId.staff_id);
        }
        const { count } = await query;
        setHasReminders(count ? count > 0 : false);
    };

    if (!user || location.pathname === '/login') return <>{children}</>;

    const role = user.role?.toLowerCase() || '';
    const isAdmin = role === 'admin';
    
    const navItems = [
        { to: '/vendita', icon: ShoppingCart, label: 'Vendita' },
        { to: '/prenotazioni', icon: Calendar, label: 'Prenotazioni' },
        { to: '/inventario', icon: Package, label: 'Inventario' },
        { to: '/cassa', icon: CreditCard, label: 'Cassa' },
        { to: '/storico', icon: History, label: 'Storico' },
        { to: '/promemoria', icon: Bell, label: 'Promemoria', alert: hasReminders },
    ];

    return (
        <div className="min-h-screen bg-surface-950 text-white flex flex-col md:flex-row font-body overflow-x-hidden">
            {/* Desktop Sidebar */}
            <aside className="hidden md:flex flex-col w-80 h-screen fixed left-0 top-0 bg-surface-900 border-r border-white/5 z-50">
                <div className="p-10">
                    <h1 className="text-3xl font-black italic tracking-tighter text-white uppercase leading-none">
                        Puff Manager<span className="text-primary not-italic">Pro</span>
                    </h1>
                </div>

                <nav className="flex-1 px-6 space-y-2">
                    {navItems.map((item) => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            className={({ isActive }) => clsx(
                                "group flex items-center gap-4 px-6 py-4 rounded-[1.5rem] transition-all duration-500 relative overflow-hidden",
                                isActive 
                                    ? "bg-primary text-surface-950 shadow-[0_10px_25px_rgba(34,211,238,0.2)]" 
                                    : "text-slate-500 hover:text-white hover:bg-white/5"
                            )}
                        >
                            <item.icon size={22} className={clsx("transition-transform duration-500", "group-hover:scale-110")} />
                            <span className="font-black label-caps text-[11px]">{item.label}</span>
                            {item.alert && (
                                <span className={clsx(
                                    "ml-auto w-2 h-2 rounded-full",
                                    location.pathname === item.to ? "bg-surface-950" : "bg-danger shadow-[0_0_10px_rgba(239,68,68,0.5)]"
                                )} />
                            )}
                        </NavLink>
                    ))}
                </nav>

                <div className="p-6 mt-auto space-y-4">
                    {isAdmin && (
                        <Link
                            to="/admin"
                            className="flex items-center gap-4 p-5 rounded-[2rem] bg-surface-800/50 hover:bg-surface-800 border border-white/5 text-slate-400 transition-all hover:border-primary/30 group"
                        >
                            <div className="p-3 bg-primary/10 rounded-xl text-primary group-hover:scale-110 transition-transform">
                                <Settings size={20} />
                            </div>
                            <div className="flex flex-col">
                                <span className="label-caps text-[9px] text-primary">Sistema</span>
                                <span className="font-black text-sm uppercase italic">Admin Panel</span>
                            </div>
                            <ChevronRight size={16} className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                        </Link>
                    )}

                    <div className="p-6 bg-white/5 rounded-[2.5rem] border border-white/5 space-y-4">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center text-surface-950 text-xl font-black">
                                {user.name[0]}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-black text-white text-base truncate leading-tight uppercase">{user.name}</p>
                                <p className="label-caps text-[9px] text-slate-500 uppercase tracking-widest">{user.role}</p>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <Link to="/login" className="flex items-center justify-center p-3 bg-white/5 rounded-xl text-slate-400 hover:text-white transition-colors" title="Cambia Profilo">
                                <ArrowLeftRight size={18} />
                            </Link>
                            <button onClick={logout} className="flex items-center justify-center p-3 bg-danger/10 rounded-xl text-danger hover:bg-danger/20 transition-all" title="Esci">
                                <LogOut size={18} />
                            </button>
                        </div>
                    </div>
                </div>
            </aside>

            {/* Mobile Header */}
            <header className="md:hidden fixed top-0 left-0 right-0 z-50 glass-dark border-b border-white/5 safe-area-top h-14">
                <div className="flex items-center justify-between px-5 h-full">
                    <h1 className="text-lg font-black italic tracking-tighter text-white uppercase pt-1">
                        Puff<span className="text-primary not-italic">Pro</span>
                    </h1>
                    <button onClick={() => setIsMobileMenuOpen(true)} className="p-2 text-slate-500">
                        <Menu size={20} />
                    </button>
                </div>
            </header>

            {/* Mobile Menu Drawer */}
            <AnimatePresence>
                {isMobileMenuOpen && (
                    <React.Fragment key="mobile-drawer">
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setIsMobileMenuOpen(false)}
                            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] md:hidden"
                        />
                        <motion.div 
                            initial={{ x: '100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '100%' }}
                            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                            className="fixed top-0 right-0 bottom-0 w-80 bg-surface-900 z-[70] p-8 flex flex-col shadow-3xl md:hidden safe-area-pt safe-area-pb"
                        >
                            <div className="flex justify-between items-center mb-10">
                                <span className="label-caps text-xs text-slate-500">Menu Navigazione</span>
                                <button onClick={() => setIsMobileMenuOpen(false)} className="p-2 text-slate-400 hover:text-white">
                                    <X size={24} />
                                </button>
                            </div>

                            <nav className="flex-1 space-y-2">
                                {navItems.map((item) => (
                                    <NavLink
                                        key={item.to}
                                        to={item.to}
                                        onClick={() => setIsMobileMenuOpen(false)}
                                        className={({ isActive }) => clsx(
                                            "flex items-center gap-4 px-6 py-5 rounded-2xl transition-all",
                                            isActive ? "bg-primary text-surface-950 font-black shadow-lg" : "text-slate-400 hover:bg-white/5"
                                        )}
                                    >
                                        <item.icon size={22} />
                                        <span className="label-caps text-xs">{item.label}</span>
                                    </NavLink>
                                ))}
                            </nav>

                            <div className="mt-auto space-y-6">
                                {isAdmin && (
                                    <Link to="/admin" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-4 p-5 rounded-2xl bg-white/5 text-slate-400 border border-white/5">
                                        <Settings size={20} className="text-primary" />
                                        <span className="label-caps text-xs">Admin Panel</span>
                                    </Link>
                                )}
                                <div className="flex items-center gap-4 p-5 bg-white/5 rounded-[2rem] border border-white/5">
                                    <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-surface-950 font-black">{user.name[0]}</div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-black text-sm uppercase truncate italic">{user.name}</p>
                                    </div>
                                    <button onClick={logout} className="p-3 text-danger"><LogOut size={20} /></button>
                                </div>
                            </div>
                        </motion.div>
                    </React.Fragment>
                )}
            </AnimatePresence>

            {/* Mobile Bottom Nav */}
            <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 glass-dark border-t border-white/5 safe-area-bottom h-16 shadow-[0_-10px_30px_rgba(0,0,0,0.5)]">
                <div className="flex justify-around items-center h-full px-1">
                    {[navItems[0], navItems[1], navItems[2], navItems[5], navItems[3]].map((item) => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            className="flex-1 h-full"
                        >
                            {({ isActive }) => (
                                <div className={clsx(
                                    "flex flex-col items-center justify-center h-full transition-all duration-300 gap-1 relative",
                                    isActive ? "text-primary scale-105" : "text-slate-600"
                                )}>
                                    <div className="relative">
                                        <item.icon size={20} strokeWidth={isActive ? 3 : 2} />
                                        {item.alert && (
                                            <span className="absolute -top-1 -right-1 w-2 h-2 bg-danger rounded-full border border-surface-900" />
                                        )}
                                    </div>
                                    <span className="text-[7.5px] font-black uppercase tracking-widest opacity-80 leading-none pt-0.5">{item.label}</span>
                                </div>
                            )}
                        </NavLink>
                    ))}
                </div>
            </nav>

            <main className="flex-1 md:ml-80 pb-20 md:pb-0 min-h-screen pt-14 md:pt-0 bg-surface-950">
                <div className="w-full max-w-[1920px] mx-auto px-3 py-4 md:p-10 lg:p-14">
                    {children}
                </div>
            </main>
        </div>
    );
};
