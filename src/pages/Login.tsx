import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { getErrorMessage } from '../lib/error';
import { LogIn, Delete, ArrowLeft, Eye, EyeOff, Shield, RefreshCw, Users } from 'lucide-react';
import { clsx } from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';

interface StaffForLogin {
  id: string;
  name: string;
  role: string;
  has_pin: boolean;
  pin_length?: number;
}

const getAvatarColor = (name: string) => {
  const colors = [
    'from-cyan-500 to-blue-600', 'from-emerald-500 to-teal-600',
    'from-blue-500 to-indigo-600', 'from-purple-500 to-violet-600',
    'from-pink-500 to-rose-600', 'from-orange-500 to-amber-600',
    'from-indigo-500 to-purple-600', 'from-rose-500 to-pink-600',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
};

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const { user, login } = useAuth();
  const [staffList, setStaffList] = useState<StaffForLogin[]>([]);
  const [selectedStaff, setSelectedStaff] = useState<StaffForLogin | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchStaff = useCallback(async () => {
    setFetching(true);
    setFetchError('');
    try {
      const { data, error } = await supabase.rpc('get_staff_list_for_login');
      if (error) throw error;
      if (Array.isArray(data)) {
        setStaffList(data.map(s => ({
          id: s.id,
          name: s.name,
          role: s.role,
          has_pin: s.has_pin,
          pin_length: s.pin_length ?? 6,
        })));
      } else {
        setStaffList([]);
      }
    } catch (err) {
      setFetchError(getErrorMessage(err, 'Impossibile caricare lo staff'));
      setStaffList([]);
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    if (user) navigate('/inventario');
    fetchStaff();
  }, [user, navigate, fetchStaff]);

  const requiredPinLen = selectedStaff?.has_pin ? (selectedStaff.pin_length || 6) : 0;

  const handleNumberClick = useCallback((num: string) => {
    if (pin.length < requiredPinLen) {
      setPin(prev => prev + num);
      if (error) setError('');
    }
  }, [pin.length, requiredPinLen, error]);

  const handleBackspace = useCallback(() => {
    setPin(prev => prev.slice(0, -1));
  }, []);

  const canSubmit = !!selectedStaff && (!selectedStaff.has_pin || pin.length === requiredPinLen);

  const handleLogin = useCallback(async () => {
    if (!selectedStaff) return;
    if (selectedStaff.has_pin && pin.length !== requiredPinLen) return;
    setLoading(true);
    setError('');
    try {
      await login(selectedStaff.name, selectedStaff.has_pin ? pin : undefined);
      navigate('/inventario');
    } catch (err) {
      setError(getErrorMessage(err, 'PIN Errato'));
      setPin('');
      setShakeKey(k => k + 1);
    } finally {
      setLoading(false);
    }
  }, [selectedStaff, pin, requiredPinLen, login, navigate]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && canSubmit) handleLogin();
    if (e.key === 'Backspace') handleBackspace();
    if (/^[0-9]$/.test(e.key)) handleNumberClick(e.key);
    if (e.key === 'Escape') { setSelectedStaff(null); setPin(''); setError(''); }
  }, [canSubmit, handleLogin, handleBackspace, handleNumberClick]);

  useEffect(() => {
    if (selectedStaff && !selectedStaff.has_pin) handleLogin();
  }, [selectedStaff, handleLogin]);

  useEffect(() => {
    if (selectedStaff?.has_pin) inputRef.current?.focus();
  }, [selectedStaff]);

  const goBack = () => { setSelectedStaff(null); setPin(''); setError(''); };

  if (!selectedStaff) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-surface-950 safe-area-pt safe-area-pb relative overflow-y-auto digital-grid">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/[0.02] via-transparent to-transparent pointer-events-none" />
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-32 -left-32 w-96 h-96 bg-violet-600/8 rounded-full blur-3xl animate-nebula" />
          <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-cyan-500/8 rounded-full blur-3xl animate-nebula" style={{ animationDelay: '-6s' }} />
        </div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md space-y-10 relative z-10">
          <div className="text-center space-y-3">
            <motion.h1
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
              className="text-4xl md:text-5xl font-black tracking-tighter uppercase italic neon-text"
            >
              Puff Manager<span className="text-primary not-italic">Pro</span>
            </motion.h1>
            <p className="label-caps text-slate-500 text-[9px] tracking-[0.3em]">Seleziona il tuo profilo</p>
          </div>

          {fetching ? (
            <div className="grid grid-cols-2 gap-4 sm:gap-5">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-40 rounded-[2rem] skeleton" />
              ))}
            </div>
          ) : fetchError ? (
            <div className="space-y-4">
              <div className="p-4 bg-danger/10 border border-danger/20 rounded-2xl flex items-start gap-3">
                <Shield size={16} className="text-danger shrink-0 mt-0.5" />
                <p className="text-danger text-[11px] font-semibold leading-relaxed">{fetchError}</p>
              </div>
              <button
                onClick={fetchStaff}
                className="mx-auto flex items-center gap-2 px-5 py-2.5 rounded-full glass-key text-slate-300 hover:text-white text-xs font-bold transition-all active:scale-95"
              >
                <RefreshCw size={14} /> Riprova
              </button>
            </div>
          ) : staffList.length === 0 ? (
            <div className="p-6 rounded-[2rem] glass-card text-center space-y-3">
              <Users size={28} className="mx-auto text-slate-500" />
              <p className="text-slate-400 text-sm font-semibold">Nessun profilo disponibile</p>
              <p className="text-slate-600 text-xs">Contatta un amministratore per creare lo staff</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:gap-5">
              {staffList.map((staff, i) => (
                <motion.button
                  key={staff.id}
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + i * 0.07, duration: 0.5, ease: 'easeOut' }}
                  onClick={() => setSelectedStaff(staff)}
                  className="group relative flex flex-col items-center gap-4 p-5 rounded-[2rem] glass-key hover:border-primary/30 transition-all duration-500 active:scale-95"
                >
                  <div className={clsx(
                    "w-16 h-16 rounded-xl bg-gradient-to-br flex items-center justify-center text-2xl font-black text-white shadow-lg transition-all duration-500 group-hover:scale-110 group-hover:shadow-xl group-hover:shadow-primary/20",
                    getAvatarColor(staff.name)
                  )}>
                    {staff.name.charAt(0)}
                  </div>
                  <div className="text-center">
                    <p className="font-black text-white text-base tracking-tight uppercase leading-none">{staff.name}</p>
                    <p className="label-caps text-[8px] text-slate-500 mt-1.5 tracking-widest uppercase">{staff.role}</p>
                  </div>
                  {staff.has_pin && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="absolute top-3 right-3 w-2.5 h-2.5 hex-dot bg-primary animate-hex-glow"
                    />
                  )}
                </motion.button>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center py-6 px-4 bg-surface-950 safe-area-pt safe-area-pb relative overflow-y-auto digital-grid">
      <div className="absolute inset-0 bg-gradient-to-b from-primary/[0.02] via-transparent to-transparent pointer-events-none" />
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-violet-600/8 rounded-full blur-3xl animate-nebula" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-cyan-500/8 rounded-full blur-3xl animate-nebula" style={{ animationDelay: '-6s' }} />
      </div>

      <div className="w-full max-w-xs space-y-3 relative z-10 my-auto">
        <button
          onClick={goBack}
          className="flex items-center gap-2 text-slate-500 hover:text-white label-caps text-[9px] transition-colors mx-auto chrome-badge px-4 py-2 rounded-full"
        >
          <ArrowLeft size={12} /> cambia profilo
        </button>

        <div className="flex flex-col items-center text-center space-y-2">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', damping: 15, stiffness: 200 }}
            className="relative"
          >
            <div className="w-16 h-16 rounded-2xl gem-avatar flex items-center justify-center text-2xl font-black text-white shadow-2xl">
              {selectedStaff.name.charAt(0)}
            </div>
            <div className="neon-ring rounded-2xl" />
          </motion.div>

          <div>
            <h2 className="text-2xl font-black tracking-tight leading-tight animate-shimmer-metallic">{selectedStaff.name}</h2>
            <p className="label-caps text-[8px] tracking-widest chrome-badge inline-block px-2.5 py-0.5 rounded-full mt-1.5 text-white/80">{selectedStaff.role}</p>
          </div>
        </div>

        <motion.div
          key={shakeKey}
          animate={error ? { x: [0, -5, 5, -5, 5, 0] } : {}}
          transition={{ duration: 0.4 }}
          className="flex justify-center gap-2 py-1"
        >
          {[...Array(requiredPinLen)].map((_, i) => (
            <motion.div
              key={i}
              initial={{ scale: 0, rotate: -30 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: i * 0.05, type: 'spring', stiffness: 300 }}
              className={clsx(
                "hex-dot w-[14px] h-[14px] transition-all duration-500",
                pin.length > i
                  ? "bg-gradient-to-br from-primary to-secondary shadow-[0_0_12px_rgba(0,229,255,0.6)] animate-hex-glow"
                  : error
                    ? "bg-danger/40"
                    : "bg-white/8"
              )}
            />
          ))}
        </motion.div>

        <input
          ref={inputRef}
          type={showPin ? "text" : "password"}
          value={pin}
          onKeyDown={handleKeyDown}
          className="sr-only"
          autoComplete="off"
          inputMode="numeric"
          readOnly
        />

        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="p-3 bg-danger/10 border border-danger/20 rounded-2xl flex items-center gap-2"
            >
              <Shield size={14} className="text-danger shrink-0 animate-neon-flicker" />
              <span className="text-danger text-[9px] label-caps flex-1">{error}</span>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid grid-cols-3 gap-1.5">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
            <motion.button
              key={num}
              whileTap={{ scale: 0.9 }}
              onClick={() => handleNumberClick(num.toString())}
              className="glass-key h-14 rounded-xl flex items-center justify-center text-lg font-black text-white/90 hover:text-white hover:border-primary/30 active:border-primary/50 transition-all"
            >
              <span className="relative z-10">{num}</span>
            </motion.button>
          ))}
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => setPin('')}
            className="glass-key h-14 rounded-xl flex items-center justify-center text-slate-500 hover:text-white/80 transition-all"
          >
            <Delete size={18} />
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => handleNumberClick('0')}
            className="glass-key h-14 rounded-xl flex items-center justify-center text-lg font-black text-white/90 hover:text-white hover:border-primary/30 active:border-primary/50 transition-all"
          >
            <span className="relative z-10">0</span>
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={handleBackspace}
            className="glass-key h-14 rounded-xl flex items-center justify-center text-slate-500 hover:text-white/80 transition-all"
          >
            <Delete size={18} />
          </motion.button>
        </div>

        <div className="flex gap-2">
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => setShowPin(!showPin)}
            className="glass-key p-3 rounded-xl shrink-0 text-slate-500 hover:text-white/80 transition-all"
            title={showPin ? 'Nascondi PIN' : 'Mostra PIN'}
          >
            {showPin ? <EyeOff size={16} /> : <Eye size={16} />}
          </motion.button>

          <motion.button
            whileTap={!(loading || !canSubmit) ? { scale: 0.95 } : {}}
            onClick={handleLogin}
            disabled={loading || !canSubmit}
            className={clsx(
              "flex-1 py-3.5 rounded-xl text-sm font-black transition-all flex items-center justify-center gap-2 shadow-lg border relative overflow-hidden",
              loading || !canSubmit
                ? "bg-surface-800/50 text-slate-600 border-white/5 opacity-50 cursor-not-allowed"
                : "bg-gradient-to-r from-primary via-cyan-400 to-primary-dark text-surface-950 border-primary/30 shadow-primary/20 hover:shadow-primary/30"
            )}
          >
            {!(loading || !canSubmit) && (
              <div className="absolute inset-0 bg-[length:200%_100%] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
            )}
            {loading ? (
              <div className="w-5 h-5 border-[3px] border-surface-950 border-t-white rounded-full animate-spin relative z-10" />
            ) : (
              <>
                <LogIn size={16} className="relative z-10" />
                <span className="relative z-10">Entra</span>
              </>
            )}
          </motion.button>
        </div>
      </div>
    </div>
  );
};
