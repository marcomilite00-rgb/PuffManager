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
  Menu,
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
    <div className="min-h-[100dvh] flex flex-col md:flex-row relative text-[#F4F2EC]">
      {/* ── Desktop Floating Rail (≥768px / md) ── */}
      <aside className="hidden md:flex spatial-rail">
        {/* App Logo Pill */}
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-white/20 to-white/5 border border-white/20 flex items-center justify-center font-bold text-lg text-white mb-6 shadow-lg shadow-black/40">
          P
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
      <div className="flex-1 min-w-0 flex flex-col md:pl-[104px]">
        {/* Mobile Header in Floating Glass Pill */}
        <header className="md:hidden sticky top-0 z-40 px-3 pt-[calc(env(safe-area-inset-top,0px)+8px)] pb-2 pointer-events-none">
          <div className="pointer-events-auto flex items-center justify-between px-4 py-2.5 rounded-full spatial-panel-strong shadow-xl border border-white/20">
            <div>
              <h1 className="spatial-headline text-[16px] font-semibold tracking-tight text-white">
                Puff Manager
              </h1>
              <p className="spatial-caption text-[10px] text-white/50 capitalize">
                {user.role} · {user.name}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(true)}
              className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
              aria-label="Apri menu"
            >
              <Menu size={18} />
            </button>
          </div>
        </header>

        {/* Mobile Drawer */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <React.Fragment key="mobile-drawer">
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsMobileMenuOpen(false)}
                className="fixed inset-0 z-[60] md:hidden bg-black/60 backdrop-blur-sm"
              />
              {/* Drawer Sheet */}
              <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 30, stiffness: 320 }}
                className="fixed top-3 right-3 bottom-[calc(env(safe-area-inset-bottom,0px)+80px)] w-72 z-[70] p-4 flex flex-col md:hidden spatial-panel-strong border border-white/25 rounded-3xl shadow-2xl"
              >
                <div className="flex justify-between items-center mb-4 px-1 pb-3 border-b border-white/10">
                  <div>
                    <p className="spatial-headline text-[15px] font-semibold text-white">
                      {user.name}
                    </p>
                    <p className="spatial-caption text-[10px] text-white/50 capitalize">
                      {user.role}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
                    aria-label="Chiudi menu"
                  >
                    <X size={16} />
                  </button>
                </div>

                <nav className="flex-1 space-y-1.5 overflow-y-auto pr-1">
                  {[
                    ...navItems,
                    ...(isAdmin
                      ? [{ to: '/admin', icon: Settings, label: 'Amministrazione' }]
                      : []),
                  ].map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-3 px-3.5 py-3 rounded-2xl text-[14px] transition-all',
                          isActive
                            ? 'bg-[#0A84FF] text-white font-semibold shadow-[0_0_16px_rgba(10,132,255,0.4)]'
                            : 'text-white/70 hover:bg-white/10 hover:text-white'
                        )
                      }
                    >
                      <item.icon size={18} />
                      <span className="flex-1">{item.label}</span>
                      {'alert' in item && item.alert && (
                        <span className="w-2 h-2 rounded-full bg-[#FF453A] shadow-[0_0_6px_#FF453A]" />
                      )}
                    </NavLink>
                  ))}
                </nav>

                <div className="pt-3 mt-2 flex gap-2 border-t border-white/10">
                  <Link
                    to="/login"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-full text-xs font-semibold bg-white/10 hover:bg-white/20 text-white transition-colors"
                  >
                    <ArrowLeftRight size={14} /> Profilo
                  </Link>
                  <button
                    type="button"
                    onClick={logout}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-full text-xs font-semibold bg-[#FF453A]/15 border border-[#FF453A]/30 text-[#FF453A] hover:bg-[#FF453A]/25 transition-colors"
                  >
                    <LogOut size={14} /> Esci
                  </button>
                </div>
              </motion.div>
            </React.Fragment>
          )}
        </AnimatePresence>

        {/* Page Content: padding bottom for mobile dock */}
        <main className="flex-1 min-w-0 px-3 md:px-8 py-3 pb-[calc(env(safe-area-inset-bottom,0px)+96px)] md:pb-8">
          {children}
        </main>

        {/* Mobile Floating Dock (≤768px) */}
        <nav
          className="md:hidden spatial-dock flex items-center justify-around"
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
                    'flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 rounded-2xl transition-all duration-200',
                    isActive
                      ? 'bg-[#0A84FF] text-white shadow-[0_0_14px_rgba(10,132,255,0.5)]'
                      : 'text-white/50 hover:text-white'
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
