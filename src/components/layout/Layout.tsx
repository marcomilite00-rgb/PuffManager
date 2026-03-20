
import { useState, useEffect } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import {
    ShoppingCart,
    Calendar,
    Package,
    CreditCard,
    History,
    UserCircle,
    Settings,
    LogOut,
    ChevronDown,
    X,
    Lock,
    Check,
    Eye,
    EyeOff,
    AlertCircle
} from 'lucide-react';

import { clsx } from 'clsx';

interface LayoutProps {
    children: React.ReactNode;
}

interface StaffForSwitch {
    id: string;
    name: string;
    role: string;
    has_pin: boolean;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
    const { user, logout, switchProfile } = useAuth();
    const location = useLocation();

    // Profile switcher state
    const [showProfileSwitcher, setShowProfileSwitcher] = useState(false);
    const [staffList, setStaffList] = useState<StaffForSwitch[]>([]);
    const [selectedProfile, setSelectedProfile] = useState<StaffForSwitch | null>(null);
    const [pin, setPin] = useState('');
    const [showPin, setShowPin] = useState(false);
    const [pinError, setPinError] = useState('');
    const [switching, setSwitching] = useState(false);
    const [hasReminders, setHasReminders] = useState(false);

    useEffect(() => {
        checkReminders();
        const interval = setInterval(checkReminders, 30000); // Check every 30s
        return () => clearInterval(interval);
    }, [user]);

    const checkReminders = async () => {
        if (!user) return;

        let query = supabase.from('reminders').select('id', { count: 'exact', head: true }).eq('status', 'active');

        // Helpers only see their own notification if they created it
        if (user.role === 'helper') {
            const { data: staffId } = await supabase.from('staff_sessions').select('staff_id').eq('auth_uid', user.id).single();
            if (staffId) {
                query = query.eq('created_by_staff_id', staffId.staff_id);
            }
        }

        const { count } = await query;
        setHasReminders(count ? count > 0 : false);
    };

    useEffect(() => {
        if (showProfileSwitcher) {
            fetchStaffList();
        }
    }, [showProfileSwitcher]);

    const fetchStaffList = async () => {
        try {
            const { data: rpcData, error: rpcError } = await supabase
                .rpc('get_staff_list_for_login');

            if (!rpcError && rpcData && rpcData.length > 0) {
                setStaffList(rpcData);
                return;
            }

            const { data } = await supabase
                .from('staff')
                .select('id, name, role, pin_hash')
                .order('name');

            if (data) {
                setStaffList(data.map(s => ({
                    id: s.id,
                    name: s.name,
                    role: s.role,
                    has_pin: s.pin_hash !== null
                })));
            }
        } catch (err) {
            console.error('Failed to fetch staff list');
        }
    };

    const handleProfileSelect = (staff: StaffForSwitch) => {
        if (staff.name === user?.name) {
            closeProfileSwitcher();
            return;
        }

        if (staff.has_pin) {
            setSelectedProfile(staff);
            setPin('');
            setPinError('');
        } else {
            doSwitch(staff.name);
        }
    };

    const handlePinSubmit = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!selectedProfile || !pin) return;

        await doSwitch(selectedProfile.name, pin);
    };

    const doSwitch = async (name: string, pinCode?: string) => {
        setSwitching(true);
        setPinError('');
        try {
            await switchProfile(name, pinCode);
            closeProfileSwitcher();
        } catch (err: any) {
            setPinError(err.message || 'Errore durante il cambio profilo');
        } finally {
            setSwitching(false);
        }
    };

    const closeProfileSwitcher = () => {
        setShowProfileSwitcher(false);
        setSelectedProfile(null);
        setPin('');
        setShowPin(false);
        setPinError('');
    };

    const handleLogout = async () => {
        await logout();
        closeProfileSwitcher();
    };

    if (!user || location.pathname === '/login') return <>{children}</>;

    const isAdmin = user.role === 'admin';
    const isStaff = user.role === 'staff';
    const canSeeAdmin = isAdmin;
    const canSeeFinance = isAdmin || isStaff;

    const navItems = [
        { to: '/vendita', icon: ShoppingCart, label: 'Vendita' },
        { to: '/prenotazioni', icon: Calendar, label: 'Prenotazioni' },
        { to: '/inventario', icon: Package, label: 'Inventario' },
        ...(canSeeFinance ? [
            { to: '/cassa', icon: CreditCard, label: 'Cassa' },
            { to: '/storico', icon: History, label: 'Storico' }
        ] : []),
        { to: '/promemoria', icon: AlertCircle, label: 'Promemoria', alert: hasReminders },
    ];


    return (
        <div className="min-h-screen bg-slate-950 text-white flex flex-col md:flex-row">
            {/* Desktop Sidebar */}
            <aside className="hidden md:flex flex-col w-72 h-screen fixed left-0 top-0 bg-slate-900 border-r border-white/5 z-20">
                <div className="p-8">
                    <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-primary to-cyan-300 bg-clip-text text-transparent">
                        Puff Manager Pro
                    </h1>
                </div>

                <nav className="flex-1 px-4 space-y-2">
                    {navItems.map((item) => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            className={({ isActive }) => clsx(
                                "flex items-center gap-4 px-4 py-4 rounded-2xl transition-all duration-300",
                                isActive ? "bg-primary/20 text-primary border border-primary/20 shadow-[0_0_20px_rgba(34,211,238,0.1)]" : "text-slate-400 hover:bg-white/5 hover:text-white"
                            )}
                        >
                            <div className="relative">
                                <item.icon size={22} />
                                {(item as any).alert && (
                                    <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                                    </span>
                                )}
                            </div>
                            <span className="font-medium">{item.label}</span>
                        </NavLink>
                    ))}
                </nav>

                <div className="p-4 mt-auto space-y-4">
                    {canSeeAdmin && (
                        <Link
                            to="/admin"
                            className="flex items-center gap-4 px-4 py-4 rounded-2xl bg-slate-800/50 hover:bg-slate-800 border border-white/5 text-slate-300 transition-all hover:border-primary/30"
                        >
                            <Settings size={20} className="text-primary" />
                            <div className="flex flex-col">
                                <span className="text-xs text-primary font-bold tracking-widest uppercase">Pannello</span>
                                <span className="font-medium">ADMIN</span>
                            </div>
                        </Link>
                    )}

                    <button
                        onClick={() => setShowProfileSwitcher(true)}
                        className="w-full flex items-center gap-3 p-4 bg-white/5 rounded-3xl border border-white/5 hover:bg-white/10 transition-all cursor-pointer"
                    >
                        <UserCircle size={32} className="text-slate-500" />
                        <div className="flex-1 overflow-hidden text-left">
                            <p className="text-sm font-bold truncate">{user.name}</p>
                            <p className="text-[10px] text-slate-500 uppercase tracking-widest">{user.role}</p>
                        </div>
                        <ChevronDown size={18} className="text-slate-500" />
                    </button>
                </div>
            </aside>

            {/* Mobile Header - Profile indicator */}
            <div className="md:hidden fixed top-0 left-0 right-0 z-40 glass-dark border-b border-white/10 safe-area-top">
                <div className="flex items-center justify-between px-4 py-3">
                    <h1 className="text-lg font-black tracking-tight bg-gradient-to-r from-primary to-cyan-300 bg-clip-text text-transparent">
                        Puff Manager
                    </h1>
                    <button
                        onClick={() => setShowProfileSwitcher(true)}
                        className="flex items-center gap-2 px-3 py-2 bg-white/5 rounded-2xl border border-white/10 active:scale-95 transition-transform"
                    >
                        <UserCircle size={20} className="text-primary" />
                        <span className="text-sm font-bold">{user.name}</span>
                        <ChevronDown size={14} className="text-slate-500" />
                    </button>
                </div>
            </div>

            {/* Main Content Area */}
            <main className="flex-1 md:ml-72 pb-24 md:pb-0 min-h-screen pt-14 md:pt-0">
                <div className="w-full p-4 md:p-8 safe-area-pt">
                    {children}
                </div>
            </main>

            {/* Mobile Bottom Nav */}
            <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 glass-dark border-t border-white/10 safe-area-bottom">
                <div className="flex justify-around items-center h-20 px-2 relative">
                    {navItems.map((item) => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            className={({ isActive }) => clsx(
                                "flex flex-col items-center justify-center flex-1 h-full transition-all duration-300",
                                isActive ? "text-primary translate-y-[-2px]" : "text-slate-500"
                            )}
                        >
                            {({ isActive }) => (
                                <>
                                    <div className={clsx(
                                        "p-2 rounded-xl transition-all duration-500 relative",
                                        isActive && "bg-primary/10 shadow-[0_0_20px_rgba(34,211,238,0.1)]"
                                    )}>
                                        <item.icon size={22} strokeWidth={isActive ? 2.5 : 2} />
                                        {(item as any).alert && (
                                            <span className="absolute top-1 right-1 flex h-2 w-2">
                                                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                                            </span>
                                        )}
                                    </div>
                                    <span className={clsx(
                                        "text-[9px] font-black uppercase tracking-tighter transition-all duration-300",
                                        isActive ? "opacity-100 scale-100 h-auto mt-1" : "opacity-0 scale-50 h-0 overflow-hidden mt-0"
                                    )}>
                                        {item.label}
                                    </span>
                                </>
                            )}
                        </NavLink>
                    ))}

                    {canSeeAdmin && (
                        <NavLink
                            to="/admin"
                            className={({ isActive }) => clsx(
                                "flex flex-col items-center justify-center flex-1 h-full transition-all",
                                isActive ? "text-primary translate-y-[-2px]" : "text-slate-500"
                            )}
                        >
                            {({ isActive }) => (
                                <>
                                    <div className={clsx(
                                        "p-2 rounded-xl transition-all duration-500",
                                        isActive && "bg-primary/10 shadow-[0_0_20px_rgba(34,211,238,0.1)]"
                                    )}>
                                        <UserCircle size={22} strokeWidth={isActive ? 2.5 : 2} />
                                    </div>
                                    <span className={clsx(
                                        "text-[9px] font-black uppercase tracking-tighter transition-all duration-300",
                                        isActive ? "opacity-100 scale-100 h-auto mt-1" : "opacity-0 scale-50 h-0 overflow-hidden mt-0"
                                    )}>
                                        Admin
                                    </span>
                                </>
                            )}
                        </NavLink>
                    )}
                </div>
            </nav>

            {/* Profile Switcher Modal */}
            {showProfileSwitcher && (
                <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="w-full md:w-auto md:min-w-[400px] max-w-lg glass-dark rounded-t-[2rem] md:rounded-[2rem] p-6 border border-white/10 animate-in slide-in-from-bottom-8 md:zoom-in-95 duration-300 max-h-[80vh] overflow-y-auto safe-area-bottom">
                        {/* Header */}
                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <h3 className="text-xl font-black">Cambia Profilo</h3>
                                <p className="text-xs text-slate-500 uppercase tracking-widest">Profilo attuale: {user.name}</p>
                            </div>
                            <button
                                onClick={closeProfileSwitcher}
                                className="p-2 bg-white/5 rounded-full hover:bg-white/10 transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {selectedProfile ? (
                            /* PIN Entry for selected profile */
                            <form onSubmit={handlePinSubmit} className="space-y-6">
                                <div className="text-center">
                                    <div className="w-16 h-16 bg-primary/20 rounded-2xl flex items-center justify-center text-primary mx-auto mb-4">
                                        <UserCircle size={32} />
                                    </div>
                                    <h4 className="text-2xl font-black">{selectedProfile.name}</h4>
                                    <p className="text-xs text-slate-500 uppercase tracking-widest mt-1">{selectedProfile.role}</p>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 text-center block">Inserisci PIN</label>
                                    <div className="relative">
                                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                                        <input
                                            type={showPin ? "text" : "password"}
                                            inputMode="numeric"
                                            pattern="[0-9]*"
                                            maxLength={8}
                                            placeholder="••••"
                                            value={pin}
                                            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                                            className="w-full bg-slate-900 border border-white/10 rounded-2xl py-4 px-12 text-center text-2xl font-black tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-primary/50"
                                            autoFocus
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPin(!showPin)}
                                            className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                                        >
                                            {showPin ? <EyeOff size={18} /> : <Eye size={18} />}
                                        </button>
                                    </div>
                                </div>

                                {pinError && (
                                    <p className="text-red-400 text-sm font-bold text-center">{pinError}</p>
                                )}

                                <div className="flex gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setSelectedProfile(null)}
                                        className="flex-1 py-4 bg-white/5 text-white font-bold rounded-2xl hover:bg-white/10 transition-all"
                                    >
                                        Indietro
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={switching || pin.length < 4}
                                        className="flex-1 py-4 bg-primary text-black font-black rounded-2xl hover:bg-primary-dark transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                                    >
                                        {switching ? (
                                            <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                                        ) : (
                                            <>
                                                <Check size={18} />
                                                Accedi
                                            </>
                                        )}
                                    </button>
                                </div>
                            </form>
                        ) : (
                            /* Profile List */
                            <>
                                <div className={staffList.length > 6 ? "grid grid-cols-2 gap-2" : "space-y-2"}>
                                    {staffList.map((staff) => (
                                        <button
                                            key={staff.id}
                                            onClick={() => handleProfileSelect(staff)}
                                            className={clsx(
                                                `w-full flex items-center gap-3 rounded-xl border transition-all active:scale-[0.98]`,
                                                staffList.length > 6 ? 'p-3 h-16' : 'p-3 h-16',
                                                staff.name === user.name
                                                    ? "bg-[#00E5FF]/10 border-[#00E5FF]/40 text-[#00E5FF]"
                                                    : "bg-white/5 border-white/5 hover:bg-white/10"
                                            )}
                                        >
                                            <div className={clsx(
                                                "w-10 h-10 rounded-xl flex items-center justify-center font-black text-base shrink-0",
                                                staff.name === user.name ? "bg-[#00E5FF]/20 text-[#00E5FF]" : "bg-slate-800 text-slate-400"
                                            )}>
                                                {staff.name[0]}
                                            </div>
                                            <div className="flex-1 text-left overflow-hidden">
                                                <p className="font-bold text-sm truncate">{staff.name}</p>
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-[9px] text-slate-500 uppercase tracking-widest">{staff.role}</span>
                                                    {staff.has_pin && (
                                                        <span className="flex items-center gap-1 text-[8px] text-slate-600">
                                                            <Lock size={9} /> PIN
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            {staff.name === user.name && (
                                                <span className="text-[9px] text-[#00E5FF] font-black uppercase shrink-0">Attivo</span>
                                            )}
                                        </button>
                                    ))}
                                </div>

                                <div className="mt-6 pt-4 border-t border-white/10">
                                    <button
                                        onClick={handleLogout}
                                        className="w-full flex items-center justify-center gap-2 py-4 bg-red-500/10 text-red-400 font-bold rounded-2xl hover:bg-red-500/20 transition-all active:scale-[0.98]"
                                    >
                                        <LogOut size={18} />
                                        Esci dall'app
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
