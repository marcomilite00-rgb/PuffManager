import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { getErrorMessage } from '../lib/error';
import { Delete, ChevronLeft, Shield, RefreshCw, ChevronRight } from 'lucide-react';
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
      setError(getErrorMessage(err, 'PIN errato, riprova'));
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
      <div className="min-h-screen flex flex-col items-center" style={{ background: 'var(--surface)' }}>
        <div className="w-full max-w-md px-4 pt-16 pb-8 flex-1 flex flex-col">
          <h1 className="ios-title-large text-center">Puff Manager</h1>
          <p className="ios-footnote text-center mt-1 mb-6">Chi sta usando il gestionale?</p>

          {fetching ? (
            <div className="ios-grouped">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="ios-row"><div className="w-10 h-10 rounded-full ios-skeleton" /><div className="flex-1 h-4 ios-skeleton" /></div>
              ))}
            </div>
          ) : fetchError ? (
            <div className="ios-card p-5 text-center">
              <Shield size={22} className="mx-auto mb-2" style={{ color: '#C0392B' }} />
              <p className="ios-subhead">{fetchError}</p>
              <button onClick={fetchStaff} className="ios-btn ios-btn-tinted mt-4 w-full">
                <RefreshCw size={16} /> Riprova
              </button>
            </div>
          ) : staffList.length === 0 ? (
            <div className="ios-card p-6 text-center">
              <p className="ios-headline">Nessun profilo</p>
              <p className="ios-footnote mt-1">Contatta un amministratore per creare lo staff</p>
            </div>
          ) : (
            <div className="ios-grouped">
              {staffList.map((staff) => (
                <button
                  key={staff.id}
                  onClick={() => setSelectedStaff(staff)}
                  className="ios-row ios-press w-full text-left"
                >
                  <div className="w-10 h-10 rounded-full flex items-center justify-center font-semibold" style={{ background: 'var(--label)', color: 'var(--surface-secondary)' }}>
                    {staff.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="ios-headline text-[16px] truncate">{staff.name}</p>
                    <p className="ios-caption capitalize">{staff.role}{staff.has_pin ? ' · PIN' : ''}</p>
                  </div>
                  <ChevronRight size={18} style={{ color: 'var(--label-tertiary)' }} />
                </button>
              ))}
            </div>
          )}
          <p className="ios-caption text-center mt-6">Seleziona il tuo nome per continuare</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center" style={{ background: 'var(--surface)' }} onKeyDown={handleKeyDown}>
      <div className="w-full max-w-xs px-4 pt-10 pb-8 flex flex-col items-center">
        <button onClick={goBack} className="ios-press self-start flex items-center gap-1 mb-6" style={{ color: 'var(--accent)' }}>
          <ChevronLeft size={20} /> <span className="text-[17px]">Profili</span>
        </button>

        <div className="w-16 h-16 rounded-full flex items-center justify-center mb-3" style={{ background: 'var(--label)', color: 'var(--surface-secondary)', fontSize: 26, fontWeight: 600 }}>
          {selectedStaff.name.charAt(0).toUpperCase()}
        </div>
        <h2 className="ios-title-3">{selectedStaff.name}</h2>
        <p className="ios-footnote capitalize mt-0.5 mb-5">{selectedStaff.role}</p>

        <motion.div
          key={shakeKey}
          animate={error ? { x: [0, -8, 8, -6, 6, 0] } : {}}
          transition={{ duration: 0.35 }}
          className="flex justify-center gap-2.5 py-2"
        >
          {[...Array(requiredPinLen)].map((_, i) => (
            <div
              key={i}
              className="rounded-full transition-all"
              style={{
                width: 13, height: 13,
                background: pin.length > i ? 'var(--accent)' : 'var(--surface-tertiary)',
                border: pin.length > i ? 'none' : '1px solid var(--separator)',
              }}
            />
          ))}
        </motion.div>

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

        <AnimatePresence>
          {error && (
            <motion.p
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="ios-footnote mt-1"
              style={{ color: '#C0392B' }}
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>

        <div className="grid grid-cols-3 gap-3 mt-5 w-full">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
            <button
              key={num}
              onClick={() => handleNumberClick(num.toString())}
              className="ios-press rounded-full flex items-center justify-center"
              style={{ height: 72, background: 'var(--surface-secondary)', border: '1px solid var(--separator)', fontSize: 26, fontWeight: 400 }}
            >
              {num}
            </button>
          ))}
          <button
            onClick={() => setPin('')}
            className="ios-press rounded-full flex items-center justify-center ios-footnote"
            style={{ height: 72 }}
            aria-label="Cancella"
          >
            Cancella
          </button>
          <button
            onClick={() => handleNumberClick('0')}
            className="ios-press rounded-full flex items-center justify-center"
            style={{ height: 72, background: 'var(--surface-secondary)', border: '1px solid var(--separator)', fontSize: 26 }}
          >
            0
          </button>
          <button
            onClick={handleBackspace}
            className="ios-press rounded-full flex items-center justify-center"
            style={{ height: 72, color: 'var(--label)' }}
            aria-label="Indietro"
          >
            <Delete size={22} />
          </button>
        </div>

        <button
          onClick={handleLogin}
          disabled={loading || !canSubmit}
          className={clsx('ios-btn ios-press w-full mt-5', canSubmit ? 'ios-btn-filled' : '')}
          style={canSubmit ? undefined : { background: 'var(--surface-tertiary)', color: 'var(--label-secondary)' }}
        >
          {loading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Accedi'}
        </button>
      </div>
    </div>
  );
};
