import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { getErrorMessage } from '../lib/error';
import { Delete, ChevronLeft, Shield, RefreshCw, ChevronRight, KeyRound, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import { motion, AnimatePresence } from 'motion/react';

interface StaffForLogin {
  id: string;
  name: string;
  role: string;
  has_pin: boolean;
  pin_length?: number;
}

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
  const [shakeKey, setShakeKey] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchStaff = useCallback(async () => {
    setFetching(true);
    setFetchError('');
    try {
      const { data, error } = await supabase.rpc('get_staff_list_for_login');
      if (error) throw error;
      if (Array.isArray(data)) {
        setStaffList(
          data.map((s) => ({
            id: s.id,
            name: s.name,
            role: s.role,
            has_pin: s.has_pin,
            pin_length: s.pin_length ?? 6,
          }))
        );
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

  const requiredPinLen = selectedStaff?.has_pin ? selectedStaff.pin_length || 6 : 0;

  const handleNumberClick = useCallback(
    (num: string) => {
      if (pin.length < requiredPinLen) {
        setPin((prev) => prev + num);
        if (error) setError('');
      }
    },
    [pin.length, requiredPinLen, error]
  );

  const handleBackspace = useCallback(() => {
    setPin((prev) => prev.slice(0, -1));
  }, []);

  const canSubmit = !!selectedStaff && selectedStaff.has_pin && pin.length === requiredPinLen;

  const handleLogin = useCallback(async () => {
    if (!selectedStaff) return;
    if (!selectedStaff.has_pin) {
      setError('Nessun PIN configurato per questo profilo. Contatta un amministratore.');
      return;
    }
    if (pin.length !== requiredPinLen) return;
    setLoading(true);
    setError('');
    try {
      await login(selectedStaff.name, pin);
      navigate('/inventario');
    } catch (err) {
      setError(getErrorMessage(err, 'PIN errato, riprova'));
      setPin('');
      setShakeKey((k) => k + 1);
    } finally {
      setLoading(false);
    }
  }, [selectedStaff, pin, requiredPinLen, login, navigate]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && canSubmit) handleLogin();
      if (e.key === 'Backspace') handleBackspace();
      if (/^[0-9]$/.test(e.key)) handleNumberClick(e.key);
      if (e.key === 'Escape') {
        setSelectedStaff(null);
        setPin('');
        setError('');
      }
    },
    [canSubmit, handleLogin, handleBackspace, handleNumberClick]
  );

  useEffect(() => {
    if (selectedStaff && !selectedStaff.has_pin) {
      setError('Nessun PIN configurato per questo profilo. Contatta un amministratore.');
    }
  }, [selectedStaff]);

  useEffect(() => {
    if (selectedStaff?.has_pin) inputRef.current?.focus();
  }, [selectedStaff]);

  const goBack = () => {
    setSelectedStaff(null);
    setPin('');
    setError('');
  };

  if (!selectedStaff) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md flex flex-col items-center">
          {/* Logo Brand Pill */}
          <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-white/20 to-white/5 border border-white/25 flex items-center justify-center p-3 mb-4 shadow-2xl overflow-hidden">
            <img
              src="/logo.png"
              alt="HiFancy Puff Manager Pro"
              className="w-full h-full object-contain filter drop-shadow-md"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src =
                  'https://hifancypuff.com/wp-content/uploads/2024/08/cropped-logo.png';
              }}
            />
          </div>
          <h1 className="spatial-title text-center text-white mb-1">
            Puff Manager Pro
          </h1>
          <p className="spatial-subhead text-center mb-8">
            Chi sta accedendo al terminale?
          </p>

          {fetching ? (
            <div className="spatial-panel w-full space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-3">
                  <div className="w-12 h-12 rounded-full spatial-skeleton shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="w-32 h-4 spatial-skeleton rounded" />
                    <div className="w-20 h-3 spatial-skeleton rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : fetchError ? (
            <div className="spatial-panel-strong w-full p-6 text-center">
              <Shield size={28} className="mx-auto mb-3 text-[#FF453A]" />
              <p className="spatial-headline text-white mb-1">{fetchError}</p>
              <button
                type="button"
                onClick={fetchStaff}
                className="spatial-btn-ghost mt-4 w-full h-11 text-sm font-semibold"
              >
                <RefreshCw size={16} /> Riprova
              </button>
            </div>
          ) : staffList.length === 0 ? (
            <div className="spatial-panel w-full p-8 text-center">
              <p className="spatial-headline text-white">Nessun operatore configurato</p>
              <p className="spatial-footnote text-white/50 mt-1">
                Contatta un amministratore per abilitare gli account staff
              </p>
            </div>
          ) : (
            <div className="spatial-panel w-full p-2 divide-y divide-white/10 overflow-hidden">
              {staffList.map((staff) => (
                <button
                  key={staff.id}
                  type="button"
                  onClick={() => setSelectedStaff(staff)}
                  className="spatial-row spatial-row-clickable w-full text-left px-4 py-3.5 flex items-center gap-3.5 group rounded-2xl transition-colors hover:bg-white/10"
                >
                  <div className="w-11 h-11 rounded-full bg-white/15 border border-white/20 flex items-center justify-center font-bold text-white text-base shadow-sm shrink-0">
                    {staff.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="spatial-headline text-[16px] text-white font-medium truncate uppercase">
                      {staff.name}
                    </p>
                    <p className="spatial-caption text-[11px] text-white/50 capitalize mt-0.5">
                      {staff.role}
                    </p>
                  </div>
                  {staff.has_pin && (
                    <span className="spatial-chip spatial-chip-blue text-[11px] py-0.5 px-2">
                      <KeyRound size={12} /> PIN
                    </span>
                  )}
                  <ChevronRight
                    size={18}
                    className="text-white/40 group-hover:text-white transition-colors shrink-0 ml-1"
                  />
                </button>
              ))}
            </div>
          )}
          <p className="spatial-caption text-center text-white/40 mt-6">
            Tocca il tuo profilo per accedere
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-[100dvh] flex flex-col items-center justify-center p-4 focus:outline-none"
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <div className="w-full max-w-xs flex flex-col items-center">
        {/* Back pill button */}
        <button
          type="button"
          onClick={goBack}
          className="self-start min-h-[44px] flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/10 hover:bg-white/18 active:scale-95 text-white/80 hover:text-white text-sm font-medium mb-6 transition-all border border-white/15"
        >
          <ChevronLeft size={16} /> Profili
        </button>

        {/* Profile Avatar */}
        <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-white/25 to-white/10 border border-white/30 flex items-center justify-center mb-3 text-white text-3xl font-bold shadow-2xl">
          {selectedStaff.name.charAt(0).toUpperCase()}
        </div>
        <h2 className="spatial-headline text-xl text-white font-semibold uppercase">
          {selectedStaff.name}
        </h2>
        <p className="spatial-subhead text-sm text-white/50 capitalize mt-0.5 mb-6">
          {selectedStaff.role}
        </p>

        {/* PIN Dots with Shake on error */}
        <motion.div
          key={shakeKey}
          animate={error ? { x: [0, -10, 10, -8, 8, -4, 4, 0] } : {}}
          transition={{ duration: 0.4 }}
          className="flex justify-center items-center gap-3.5 py-3 mb-2"
        >
          {[...Array(requiredPinLen)].map((_, i) => (
            <div
              key={i}
              className={clsx(
                'rounded-full transition-all duration-200',
                pin.length > i
                  ? 'w-3.5 h-3.5 bg-[#0A84FF] shadow-[0_0_12px_rgba(10,132,255,0.8)] scale-110'
                  : 'w-3 h-3 bg-white/15 border border-white/25'
              )}
            />
          ))}
        </motion.div>

        {/* Hidden Input for Keyboard Typing */}
        <input
          ref={inputRef}
          type="password"
          value={pin}
          onKeyDown={handleKeyDown}
          className="sr-only"
          autoComplete="off"
          inputMode="numeric"
          readOnly
          aria-label="PIN"
        />

        {/* Error message */}
        <div className="h-6 flex items-center justify-center">
          <AnimatePresence>
            {error && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="spatial-footnote text-[#FF453A] font-medium text-xs"
              >
                {error}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        {/* Spatial Keypad Tiles */}
        <div className="grid grid-cols-3 gap-3.5 mt-4 w-full">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
            <button
              key={num}
              type="button"
              onClick={() => handleNumberClick(num.toString())}
              className="h-[72px] rounded-full bg-white/10 hover:bg-white/20 active:scale-95 border border-white/15 flex items-center justify-center text-white text-2xl font-semibold transition-all shadow-md"
            >
              {num}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPin('')}
            className="h-[72px] rounded-full hover:bg-white/10 active:scale-95 flex items-center justify-center spatial-footnote text-white/60 hover:text-white transition-all text-xs font-semibold uppercase tracking-wider"
            aria-label="Cancella tutto"
          >
            Cancella
          </button>
          <button
            type="button"
            onClick={() => handleNumberClick('0')}
            className="h-[72px] rounded-full bg-white/10 hover:bg-white/20 active:scale-95 border border-white/15 flex items-center justify-center text-white text-2xl font-semibold transition-all shadow-md"
          >
            0
          </button>
          <button
            type="button"
            onClick={handleBackspace}
            className="h-[72px] rounded-full hover:bg-white/10 active:scale-95 flex items-center justify-center text-white/70 hover:text-white transition-all"
            aria-label="Cancella ultima cifra"
          >
            <Delete size={22} />
          </button>
        </div>

        {/* Submit Pill Button */}
        <button
          type="button"
          onClick={handleLogin}
          disabled={loading || !canSubmit}
          className={clsx(
            'w-full mt-6 h-12 rounded-full font-semibold text-sm transition-all flex items-center justify-center shadow-lg',
            canSubmit
              ? 'spatial-btn-primary'
              : 'bg-white/10 text-white/30 border border-white/10 cursor-not-allowed'
          )}
        >
          {loading ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            'Accedi'
          )}
        </button>
      </div>
    </div>
  );
};
