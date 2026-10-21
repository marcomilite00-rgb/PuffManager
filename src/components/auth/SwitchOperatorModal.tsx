import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../ui/ToastProvider';
import { getErrorMessage } from '../../lib/error';
import {
  X,
  ChevronLeft,
  Delete,
  Loader2,
  Check,
  KeyRound,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { clsx } from 'clsx';

interface StaffForLogin {
  id: string;
  name: string;
  role: string;
  has_pin: boolean;
  pin_length?: number;
}

interface SwitchOperatorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SwitchOperatorModal: React.FC<SwitchOperatorModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { user, switchProfile, switchAsAdmin } = useAuth();
  const { showToast } = useToast();

  const [staffList, setStaffList] = useState<StaffForLogin[]>([]);
  const [selectedStaff, setSelectedStaff] = useState<StaffForLogin | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);

  const isCurrentAdmin = user?.role?.toLowerCase() === 'admin';

  // Load available staff
  const loadStaff = useCallback(async () => {
    setFetching(true);
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
        // Fallback to direct query
        const { data: directData } = await supabase
          .from('staff')
          .select('id, name, role')
          .order('name');
        if (directData) {
          setStaffList(
            directData.map((s) => ({
              id: s.id,
              name: s.name,
              role: s.role,
              has_pin: true,
              pin_length: 6,
            }))
          );
        }
      }
    } catch (err) {
      console.error('Failed to load staff in switch modal:', err);
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setSelectedStaff(null);
      setPin('');
      setError('');
      loadStaff();
    }
  }, [isOpen, loadStaff]);

  const requiredPinLen = selectedStaff?.has_pin ? selectedStaff.pin_length || 6 : 0;

  // Handle staff selection click
  const handleSelectStaff = async (staff: StaffForLogin) => {
    // 1. Same operator check -> No PIN needed, return / stay on screen
    if (staff.id === user?.id || staff.name.toLowerCase() === user?.name?.toLowerCase()) {
      showToast(`Sei già connesso come ${staff.name.toUpperCase()}`, 'success');
      onClose();
      return;
    }

    // 2. Admin bypass -> Admin can enter everyone without PIN
    if (isCurrentAdmin) {
      setLoading(true);
      try {
        await switchAsAdmin(staff.name);
        showToast(`Passato al profilo di ${staff.name.toUpperCase()} (Admin)`, 'success');
        onClose();
      } catch (err) {
        const errorMsg = getErrorMessage(err, 'Errore nel cambio profilo');
        showToast(errorMsg, 'error');
        // If server rejected admin switch (e.g. session expired or desynchronized), fallback to PIN entry
        if (errorMsg.includes('Access Denied') || errorMsg.includes('amministratori')) {
          setSelectedStaff(staff);
          setPin('');
          setError('Sessione operatore scaduta o non sincronizzata. Inserisci il PIN per accedere.');
        }
      } finally {
        setLoading(false);
      }
      return;
    }

    // 3. Target staff doesn't have a PIN -> block non-admin switch
    if (!staff.has_pin) {
      showToast(`Il profilo ${staff.name.toUpperCase()} non ha un PIN configurato. Configuralo prima dall'area Admin.`, 'error');
      return;
    }

    // 4. Regular operator with PIN -> show PIN screen
    setSelectedStaff(staff);
    setPin('');
    setError('');
  };

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

  // Submit PIN
  const handlePinSubmit = useCallback(async () => {
    if (!selectedStaff) return;
    if (selectedStaff.has_pin && pin.length !== requiredPinLen) return;

    setLoading(true);
    setError('');
    try {
      await switchProfile(selectedStaff.name, pin);
      showToast(`Passato al profilo di ${selectedStaff.name.toUpperCase()}`, 'success');
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, 'PIN errato, riprova'));
      setPin('');
      setShakeKey((k) => k + 1);
    } finally {
      setLoading(false);
    }
  }, [selectedStaff, pin, requiredPinLen, switchProfile, showToast, onClose]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedStaff) {
          setSelectedStaff(null);
          setPin('');
          setError('');
        } else {
          onClose();
        }
        return;
      }

      if (selectedStaff) {
        if (/^[0-9]$/.test(e.key)) {
          handleNumberClick(e.key);
        } else if (e.key === 'Backspace') {
          handleBackspace();
        } else if (e.key === 'Enter' && pin.length === requiredPinLen) {
          handlePinSubmit();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedStaff, pin.length, requiredPinLen, handleNumberClick, handleBackspace, handlePinSubmit, onClose]);

  // Auto-submit when PIN length is reached
  useEffect(() => {
    if (selectedStaff && pin.length === requiredPinLen && requiredPinLen > 0) {
      handlePinSubmit();
    }
  }, [pin, requiredPinLen, selectedStaff, handlePinSubmit]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[150] flex items-center justify-center p-3 sm:p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => !loading && onClose()}
          className="fixed inset-0 bg-black/70 backdrop-blur-md"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ type: 'spring', damping: 25, stiffness: 350 }}
          className="relative w-full max-w-md bg-[#16181F]/95 border border-white/20 rounded-3xl p-5 sm:p-6 shadow-2xl backdrop-blur-2xl z-10 overflow-hidden"
        >
          {/* Top Bar with Title & Close Button */}
          <div className="flex items-center justify-between pb-3 mb-4 border-b border-white/10">
            {selectedStaff ? (
              <button
                type="button"
                onClick={() => {
                  setSelectedStaff(null);
                  setPin('');
                  setError('');
                }}
                disabled={loading}
                className="flex items-center gap-1.5 text-xs font-semibold text-white/70 hover:text-white transition-colors"
              >
                <ChevronLeft size={16} />
                <span>Torna agli operatori</span>
              </button>
            ) : (
              <div>
                <h2 className="spatial-title text-lg sm:text-xl font-bold text-white leading-tight">
                  Cambia Operatore
                </h2>
                <p className="spatial-footnote text-[11px] text-white/50 mt-0.5">
                  {isCurrentAdmin
                    ? 'Modalità Admin: accesso senza PIN'
                    : 'Seleziona un profilo per cambiare sessione'}
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 flex items-center justify-center transition-all text-white/70 hover:text-white shrink-0 ml-auto"
              aria-label="Chiudi finestra e torna alla schermata principale"
            >
              <X size={16} />
            </button>
          </div>

          {/* VIEW 1: Staff Selection List */}
          {!selectedStaff ? (
            <div className="space-y-3">
              {fetching ? (
                <div className="space-y-2 py-4">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="h-16 rounded-2xl bg-white/5 animate-pulse flex items-center px-4 gap-3"
                    >
                      <div className="w-10 h-10 rounded-full bg-white/10" />
                      <div className="space-y-1.5 flex-1">
                        <div className="w-24 h-3.5 bg-white/10 rounded" />
                        <div className="w-16 h-2.5 bg-white/10 rounded" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : staffList.length === 0 ? (
                <div className="py-8 text-center text-white/50 text-xs">
                  Nessun operatore configurato
                </div>
              ) : (
                <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                  {staffList.map((s) => {
                    const isCurrent = s.id === user?.id || s.name.toLowerCase() === user?.name?.toLowerCase();
                    const initial = s.name.charAt(0).toUpperCase();

                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => handleSelectStaff(s)}
                        disabled={loading}
                        className={clsx(
                          'w-full p-3.5 rounded-2xl border text-left flex items-center justify-between gap-3 transition-all active:scale-[0.98]',
                          isCurrent
                            ? 'bg-[#0A84FF]/15 border-[#0A84FF]/40 shadow-[0_0_15px_rgba(10,132,255,0.2)]'
                            : 'bg-white/5 hover:bg-white/10 border-white/10'
                        )}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={clsx(
                              'w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0 border shadow-sm',
                              isCurrent
                                ? 'bg-[#0A84FF] text-white border-white/20'
                                : 'bg-white/10 text-white/90 border-white/15'
                            )}
                          >
                            {initial}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <h3 className="text-sm font-bold text-white uppercase truncate">
                                {s.name}
                              </h3>
                              {isCurrent && (
                                <span className="spatial-chip spatial-chip-blue text-[9px] py-0.5 px-2">
                                  In uso
                                </span>
                              )}
                            </div>
                            <span className="spatial-caption text-[11px] text-white/50 capitalize">
                              {s.role}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {isCurrent ? (
                            <div className="w-7 h-7 rounded-full bg-[#0A84FF]/20 text-[#0A84FF] flex items-center justify-center">
                              <Check size={15} />
                            </div>
                          ) : isCurrentAdmin ? (
                            <span className="text-[10px] font-semibold text-[#30D158] bg-[#30D158]/15 border border-[#30D158]/30 rounded-full px-2 py-0.5 flex items-center gap-1">
                              <Sparkles size={11} /> Entra
                            </span>
                          ) : s.has_pin ? (
                            <div className="w-7 h-7 rounded-full bg-white/5 text-white/40 flex items-center justify-center">
                              <KeyRound size={13} />
                            </div>
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-white/5 text-white/40 flex items-center justify-center">
                              <ArrowRight size={14} />
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Cancel Button */}
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="w-full mt-4 h-10 rounded-full text-xs font-semibold text-white/60 hover:text-white bg-white/5 hover:bg-white/10 transition-colors"
              >
                Annulla e torna alla schermata
              </button>
            </div>
          ) : (
            /* VIEW 2: PIN Entry */
            <div className="flex flex-col items-center">
              {/* Target Staff Avatar & Name */}
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#0A84FF] to-[#0055D4] text-white flex items-center justify-center font-bold text-xl mb-2 shadow-[0_0_20px_rgba(10,132,255,0.45)] border border-white/20">
                {selectedStaff.name.charAt(0).toUpperCase()}
              </div>
              <h3 className="text-base font-bold text-white uppercase">
                {selectedStaff.name}
              </h3>
              <p className="spatial-caption text-[11px] text-white/50 mb-3">
                Inserisci il PIN per accedere al profilo
              </p>

              {/* PIN Dots with Shake */}
              <motion.div
                key={shakeKey}
                animate={error ? { x: [0, -10, 10, -8, 8, -4, 4, 0] } : {}}
                transition={{ duration: 0.35 }}
                className="flex justify-center items-center gap-3 py-2"
              >
                {[...Array(requiredPinLen)].map((_, i) => (
                  <div
                    key={i}
                    className={clsx(
                      'rounded-full transition-all duration-150',
                      pin.length > i
                        ? 'w-3 h-3 bg-[#0A84FF] shadow-[0_0_10px_rgba(10,132,255,0.8)] scale-110'
                        : 'w-2.5 h-2.5 bg-white/15 border border-white/25'
                    )}
                  />
                ))}
              </motion.div>

              {/* Error feedback */}
              <div className="h-5 flex items-center justify-center">
                <AnimatePresence>
                  {error && (
                    <motion.p
                      initial={{ opacity: 0, y: -3 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="text-[#FF453A] font-semibold text-[11px]"
                    >
                      {error}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>

              {/* Compact Keypad */}
              <div className="grid grid-cols-3 gap-2.5 mt-2 w-full max-w-[280px]">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => handleNumberClick(num.toString())}
                    disabled={loading}
                    className="h-14 rounded-2xl bg-white/10 hover:bg-white/20 active:scale-95 border border-white/15 flex items-center justify-center text-white text-xl font-bold transition-all shadow-sm"
                  >
                    {num}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setPin('')}
                  disabled={loading}
                  className="h-14 rounded-2xl hover:bg-white/10 active:scale-95 flex items-center justify-center text-white/50 hover:text-white text-[10px] font-bold uppercase transition-all"
                >
                  Cancella
                </button>
                <button
                  type="button"
                  onClick={() => handleNumberClick('0')}
                  disabled={loading}
                  className="h-14 rounded-2xl bg-white/10 hover:bg-white/20 active:scale-95 border border-white/15 flex items-center justify-center text-white text-xl font-bold transition-all shadow-sm"
                >
                  0
                </button>
                <button
                  type="button"
                  onClick={handleBackspace}
                  disabled={loading}
                  className="h-14 rounded-2xl hover:bg-white/10 active:scale-95 flex items-center justify-center text-white/70 hover:text-white transition-all"
                  aria-label="Cancella ultima cifra"
                >
                  <Delete size={18} />
                </button>
              </div>

              {loading && (
                <div className="mt-3 flex items-center gap-2 text-xs text-white/60">
                  <Loader2 size={14} className="animate-spin" />
                  <span>Accesso in corso...</span>
                </div>
              )}
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
