import React, { useState, useEffect, useCallback } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { motion, AnimatePresence } from 'motion/react';
import {
  ShoppingCart,
  Calendar,
  Package,
  CreditCard,
  History,
  Settings,
  LogOut,
  X,
  Bell,
  ArrowLeftRight,
} from 'lucide-react';
import { cn } from '../../lib/cn';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [hasReminders, setHasReminders] = useState(false);

  const checkReminders = useCallback(async () => {
    if (!user) return;
    let query = supabase
      .from('reminders')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active');
    if (user.role === 'helper') {
      const { data: staffId } = await supabase
        .from('staff_sessions')
        .select('staff_id')
        .eq('auth_uid', user.id)
        .single();
      if (staffId) query = query.eq('created_by_staff_id', staffId.staff_id);
    }
    const { count } = await query;
    setHasReminders(count ? count > 0 : false);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const timer = setTimeout(checkReminders, 0);
    const interval = setInterval(checkReminders, 30000);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [user, checkReminders]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isMobileMenuOpen) {
        setIsMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMobileMenuOpen]);

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

  return (
    <div className="min-h-[100dvh] flex flex-col lg:flex-row relative">
      {/* ── Desktop Floating Rail (≥1024px / lg) ── */}
      <aside className="hidden lg:flex spatial-rail">
        {/* App Logo Pill */}
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-white/20 to-white/5 border border-white/20 flex items-center justify-center p-2 mb-6 shadow-lg shadow-black/40 overflow-hidden">
          <img
            src="/logo.png"
            alt="HiFancy Puff Manager"
            className="w-full h-full object-contain filter drop-shadow-md"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src =
                'https://hifancypuff.com/wp-content/uploads/2024/08/cropped-logo.png';
            }}
          />
        </div>

        {/* Navigation Items */}
        <nav className="flex flex-col items-center gap-3 w-full" aria-label="Navigazione principale">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'group relative w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-200',
                  isActive
                    ? 'bg-[#0A84FF] text-white shadow-[0_0_20px_rgba(10,132,255,0.6)]'
                    : 'text-white/60 hover:text-white hover:bg-white/10'
                )
              }
              aria-label={item.label}
            >
              {({ isActive }) => (
                <>
                  <item.icon size={20} strokeWidth={isActive ? 2.3 : 1.8} />
                  {item.alert && (
                    <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#FF453A] ring-2 ring-[#0E0F13] shadow-[0_0_8px_#FF453A]" />
                  )}
                  {/* Tooltip on hover */}
                  <span className="absolute left-[72px] px-3 py-1.5 rounded-xl bg-[#14161C]/95 border border-white/20 text-xs font-medium text-white whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 shadow-xl backdrop-blur-md z-50">
                    {item.label}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Bottom Actions */}
        <div className="mt-auto flex flex-col items-center gap-3 pt-4 border-t border-white/10 w-full">
          {isAdmin && (
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                cn(
                  'group relative w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-200',
                  isActive
                    ? 'bg-[#0A84FF] text-white shadow-[0_0_20px_rgba(10,132,255,0.6)]'
                    : 'text-white/60 hover:text-white hover:bg-white/10'
                )
              }
              aria-label="Pannello Amministrazione"
            >
              <Settings size={20} />
              <span className="absolute left-[72px] px-3 py-1.5 rounded-xl bg-[#14161C]/95 border border-white/20 text-xs font-medium text-white whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 shadow-xl backdrop-blur-md z-50">
                Admin
              </span>
            </NavLink>
          )}

          {/* Profile Switcher */}
          <Link
            to="/login"
            className="group relative w-11 h-11 rounded-full bg-white/10 border border-white/20 flex items-center justify-center font-bold text-sm text-white hover:bg-white/20 transition-colors"
            aria-label={`Cambia profilo (${user.name})`}
          >
            {user.name[0]?.toUpperCase()}
            <span className="absolute left-[72px] px-3 py-1.5 rounded-xl bg-[#14161C]/95 border border-white/20 text-xs font-medium text-white whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 shadow-xl backdrop-blur-md z-50">
              {user.name} ({user.role})
            </span>
          </Link>

          {/* Logout */}
          <button
            type="button"
            onClick={logout}
            className="w-11 h-11 rounded-full flex items-center justify-center text-white/40 hover:text-[#FF453A] hover:bg-[#FF453A]/10 transition-colors"
            aria-label="Disconnetti"
          >
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      {/* ── Main Content Area ── */}
      <div className="flex-1 min-w-0 flex flex-col lg:pl-[104px]">
        {/* Mobile Header (<1024px) */}
        <header className="lg:hidden sticky top-0 z-40 spatial-header-mobile px-4 pt-[max(10px,calc(env(safe-area-inset-top,0px)+6px))] pb-2.5 transition-colors">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-white/25 to-white/10 border border-white/20 flex items-center justify-center p-1 shadow-sm overflow-hidden">
                <img
                  src="/logo.png"
                  alt="HiFancy Puff Manager"
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src =
                      'https://hifancypuff.com/wp-content/uploads/2024/08/cropped-logo.png';
                  }}
                />
              </div>
              <div>
                <h1 className="spatial-headline text-[15px] font-semibold tracking-tight leading-tight">
                  Puff Manager
                </h1>
                <p className="spatial-caption text-[10px] opacity-60 capitalize leading-tight">
                  {user.name} ({user.role})
                </p>
              </div>
            </div>

            {/* Operator Account Button */}
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(true)}
              className="flex items-center gap-2 pl-3 pr-1 py-1 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 transition-all border border-white/10"
              aria-label="Profilo operatore e opzioni"
            >
              <span className="text-xs font-semibold">{user.name}</span>
              <div className="w-7 h-7 rounded-full bg-[#0A84FF] text-white flex items-center justify-center font-bold text-xs shadow-md">
                {user.name.charAt(0).toUpperCase()}
              </div>
            </button>
          </div>
        </header>

        {/* Mobile Profile & Account Sheet (<1024px) */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <React.Fragment key="mobile-profile-sheet">
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsMobileMenuOpen(false)}
                className="fixed inset-0 z-[120] lg:hidden bg-black/60 backdrop-blur-sm"
              />
              {/* Profile Sheet */}
              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 30, stiffness: 320 }}
                className="spatial-sheet fixed bottom-0 left-0 right-0 z-[130] p-6 pt-3 pb-[max(24px,calc(env(safe-area-inset-bottom,0px)+24px))] flex flex-col lg:hidden"
              >
                {/* Grabber */}
                <div className="spatial-grabber" />

                {/* Operator Identity */}
                <div className="flex items-center justify-between pb-4 mb-4 border-b border-white/10">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-[#0A84FF] text-white flex items-center justify-center font-bold text-lg shadow-lg shadow-[#0A84FF]/30">
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="spatial-headline text-lg font-semibold">{user.name}</h3>
                      <span className="spatial-chip spatial-chip-blue text-[11px] py-0.5 mt-0.5">
                        Ruolo: {user.role}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="min-w-[44px] min-h-[44px] rounded-full bg-white/10 hover:bg-white/20 active:scale-95 flex items-center justify-center transition-all shrink-0"
                    aria-label="Chiudi pannello profilo"
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* Admin Link if admin */}
                {isAdmin && (
                  <div className="mb-4">
                    <Link
                      to="/admin"
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="spatial-btn-blue w-full h-12 text-sm font-semibold flex items-center justify-center gap-2 shadow-xl"
                    >
                      <Settings size={18} />
                      <span>Pannello Amministrazione</span>
                    </Link>
                  </div>
                )}

                {/* Actions: Switch Profile / Logout */}
                <div className="flex gap-2.5">
                  <Link
                    to="/login"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="spatial-btn-ghost flex-1 min-h-[44px] text-xs font-semibold flex items-center justify-center gap-2"
                  >
                    <ArrowLeftRight size={15} />
                    <span>Cambia Operatore</span>
                  </Link>
                  <button
                    type="button"
                    onClick={logout}
                    className="flex-1 min-h-[44px] rounded-full text-xs font-semibold bg-[#FF453A]/15 border border-[#FF453A]/30 text-[#FF453A] hover:bg-[#FF453A]/25 transition-all active:scale-95 flex items-center justify-center gap-2"
                  >
                    <LogOut size={15} />
                    <span>Disconnetti</span>
                  </button>
                </div>
              </motion.div>
            </React.Fragment>
          )}
        </AnimatePresence>

        {/* Page Content: padding bottom for mobile dock */}
        <main className="flex-1 min-w-0 px-3 sm:px-6 lg:px-8 py-2 sm:py-3 pb-[max(180px,calc(env(safe-area-inset-bottom,0px)+140px))] lg:pb-8">
          {children}
        </main>

        {/* Mobile Floating Dock (<1024px) */}
        <nav
          className="lg:hidden spatial-dock flex items-center justify-around"
          aria-label="Dock di navigazione inferiore"
        >
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className="flex-1 min-w-0"
              title={item.label}
              aria-label={item.label}
            >
              {({ isActive }) => (
                <div
                  className={cn(
                    'flex flex-col items-center justify-center gap-0.5 min-h-[46px] py-1 px-1 rounded-2xl transition-all duration-200 active:scale-95',
                    isActive
                      ? 'bg-[#0A84FF] text-white shadow-[0_0_14px_rgba(10,132,255,0.5)]'
                      : 'opacity-60 hover:opacity-100'
                  )}
                >
                  <span className="relative inline-flex">
                    <item.icon size={20} strokeWidth={isActive ? 2.4 : 1.8} />
                    {item.alert && (
                      <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[#FF453A] shadow-[0_0_6px_#FF453A]" />
                    )}
                  </span>
                  <span
                    className="tracking-tight text-[9.5px] truncate max-w-full"
                    style={{ fontWeight: isActive ? 600 : 500 }}
                  >
                    {item.label}
                  </span>
                </div>
              )}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
};
