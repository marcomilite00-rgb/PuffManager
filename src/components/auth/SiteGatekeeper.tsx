import React, { useState, useEffect, useCallback, useId } from 'react';
import { supabase } from '../../lib/supabase';
import { SiteGateContext } from '../../context/SiteGateContext';
import {
  ShieldCheck,
  Lock,
  Eye,
  EyeOff,
  AlertTriangle,
  KeyRound,
  CheckCircle2,
  Loader2,
  Sparkles,
  Terminal,
  Cpu,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const DEVICE_GATE_TOKEN_KEY = 'puff_terminal_device_token';
const GATE_ATTEMPTS_KEY = 'puff_gate_attempts_history';
const MAX_LOCAL_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 60 * 1000; // 60 seconds cooldown
const TOKEN_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days device persistence

interface StoredAttempts {
  count: number;
  lastAttempt: number;
}

export const SiteGatekeeper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isUnlocked, setIsUnlocked] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(DEVICE_GATE_TOKEN_KEY);
      if (!stored) return false;
      const parsed = JSON.parse(stored);
      if (
        parsed.deviceVerified === true &&
        parsed.timestamp &&
        Date.now() - parsed.timestamp < TOKEN_MAX_AGE_MS
      ) {
        return true;
      }
      localStorage.removeItem(DEVICE_GATE_TOKEN_KEY);
      return false;
    } catch {
      return false;
    }
  });

  const [keyInput, setKeyInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [shakeKey, setShakeKey] = useState(0);
  const [isClickjacked, setIsClickjacked] = useState(false);
  const [lockoutRemaining, setLockoutRemaining] = useState<number>(0);
  const formKeyId = useId();

  // Clickjacking detection
  useEffect(() => {
    if (window.self !== window.top) {
      setIsClickjacked(true);
      try {
        window.top?.location.replace(window.self.location.href);
      } catch {
        // Prevent cross-origin iframe embedding
      }
    }
  }, []);

  // Listen for terminal lock broadcast (e.g. triggered on employee logout)
  useEffect(() => {
    const handleTerminalLockEvent = () => {
      try {
        localStorage.removeItem(DEVICE_GATE_TOKEN_KEY);
        sessionStorage.removeItem(DEVICE_GATE_TOKEN_KEY);
      } catch {
        // Ignore storage errors
      }
      setIsUnlocked(false);
      setKeyInput('');
      setErrorMessage('');
    };

    window.addEventListener('puff:lock-terminal', handleTerminalLockEvent);
    return () => {
      window.removeEventListener('puff:lock-terminal', handleTerminalLockEvent);
    };
  }, []);

  // Check brute force cooldown
  const checkBruteForceStatus = useCallback((): number => {
    try {
      const raw = localStorage.getItem(GATE_ATTEMPTS_KEY);
      if (!raw) return 0;
      const data: StoredAttempts = JSON.parse(raw);
      if (data.count >= MAX_LOCAL_ATTEMPTS) {
        const elapsed = Date.now() - data.lastAttempt;
        if (elapsed < LOCKOUT_DURATION_MS) {
          return Math.ceil((LOCKOUT_DURATION_MS - elapsed) / 1000);
        } else {
          localStorage.removeItem(GATE_ATTEMPTS_KEY);
          return 0;
        }
      }
      return 0;
    } catch {
      return 0;
    }
  }, []);

  useEffect(() => {
    const remaining = checkBruteForceStatus();
    setLockoutRemaining(remaining);

    if (remaining > 0) {
      const interval = setInterval(() => {
        setLockoutRemaining((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [checkBruteForceStatus]);

  // Document cloaking title
  useEffect(() => {
    if (!isUnlocked) {
      document.title = 'Access Terminal | Secure Node';
    } else {
      document.title = 'Puff Manager Pro';
    }
  }, [isUnlocked]);

  const recordFailedAttempt = () => {
    try {
      const raw = localStorage.getItem(GATE_ATTEMPTS_KEY);
      const data: StoredAttempts = raw ? JSON.parse(raw) : { count: 0, lastAttempt: 0 };
      data.count += 1;
      data.lastAttempt = Date.now();
      localStorage.setItem(GATE_ATTEMPTS_KEY, JSON.stringify(data));

      if (data.count >= MAX_LOCAL_ATTEMPTS) {
        setLockoutRemaining(Math.ceil(LOCKOUT_DURATION_MS / 1000));
      }
    } catch {
      // Ignore
    }
  };

  const clearFailedAttempts = () => {
    try {
      localStorage.removeItem(GATE_ATTEMPTS_KEY);
    } catch {
      // Ignore
    }
  };

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanKey = keyInput.trim();
    if (!cleanKey || loading || lockoutRemaining > 0) return;

    setLoading(true);
    setErrorMessage('');

    try {
      const { data, error } = await supabase.rpc('verify_site_access_key', {
        p_key: cleanKey,
      });

      if (error) {
        throw new Error(error.message || 'Errore di connessione al nodo crittografico');
      }

      if (data === true) {
        clearFailedAttempts();
        const payload = {
          deviceVerified: true,
          timestamp: Date.now(),
          boundHost: window.location.hostname,
        };
        // Persist on device so same device doesn't require re-authentication every time
        localStorage.setItem(DEVICE_GATE_TOKEN_KEY, JSON.stringify(payload));
        setIsUnlocked(true);
        setKeyInput('');
      } else {
        recordFailedAttempt();
        setShakeKey((k) => k + 1);
        setErrorMessage('Chiave di accesso non valida. Accesso negato.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Errore imprevisto di autenticazione';
      setShakeKey((k) => k + 1);
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  const lockTerminal = useCallback(() => {
    try {
      localStorage.removeItem(DEVICE_GATE_TOKEN_KEY);
      sessionStorage.removeItem(DEVICE_GATE_TOKEN_KEY);
    } catch {
      // Ignore
    }
    setIsUnlocked(false);
    setKeyInput('');
    setErrorMessage('');
  }, []);

  const unlockTerminal = useCallback(() => {
    setIsUnlocked(true);
  }, []);

  if (isClickjacked) {
    return (
      <div className="fixed inset-0 z-[9999] bg-[#07080B] text-white flex items-center justify-center p-6 text-center">
        <div className="max-w-md p-8 rounded-3xl bg-[#FF453A]/10 border border-[#FF453A]/30 space-y-4 backdrop-blur-2xl">
          <AlertTriangle className="mx-auto text-[#FF453A] w-14 h-14" />
          <h2 className="text-xl font-bold tracking-tight">Rilevato Tentativo di Framing</h2>
          <p className="text-sm text-white/70">
            Il modulo di sicurezza ha bloccato il caricamento in un contenitore iframe non autorizzato.
          </p>
          <button
            type="button"
            onClick={() => window.open(window.location.href, '_top')}
            className="w-full py-3.5 rounded-2xl bg-[#FF453A] text-white font-semibold text-sm hover:bg-[#E03A30] transition shadow-lg shadow-[#FF453A]/20"
          >
            Apri in Finestra Protetta Dedicata
          </button>
        </div>
      </div>
    );
  }

  if (!isUnlocked) {
    const currentHost = typeof window !== 'undefined' ? window.location.hostname : 'localhost';

    return (
      <div className="fixed inset-0 z-[9999] min-h-[100dvh] bg-[#07080B] text-white flex flex-col items-center justify-center p-4 sm:p-6 overflow-y-auto selection:bg-[#0A84FF]/30">
        {/* Ambient Glows */}
        <div className="fixed top-1/4 -left-32 w-96 h-96 bg-[#0A84FF]/15 rounded-full blur-[128px] pointer-events-none" />
        <div className="fixed bottom-1/4 -right-32 w-96 h-96 bg-[#5E5CE6]/12 rounded-full blur-[128px] pointer-events-none" />
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-[#30D158]/5 rounded-full blur-[140px] pointer-events-none" />

        <motion.div
          key={shakeKey}
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{
            opacity: 1,
            y: 0,
            scale: 1,
            x: shakeKey > 0 ? [0, -12, 12, -8, 8, -4, 4, 0] : 0,
          }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="relative w-full max-w-md p-6 sm:p-8 rounded-3xl bg-[#111319]/90 border border-white/10 backdrop-blur-2xl shadow-2xl shadow-black/80 space-y-6"
        >
          {/* Header Status Bar */}
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#0A84FF]/25 to-[#0A84FF]/10 border border-[#0A84FF]/35 flex items-center justify-center text-[#0A84FF] shadow-inner">
                <ShieldCheck size={18} />
              </div>
              <div>
                <span className="text-[10px] font-bold tracking-widest uppercase text-white/50 block">
                  Security Gateway
                </span>
                <span className="text-xs font-mono font-medium text-white/90 flex items-center gap-1.5">
                  <Cpu size={12} className="text-[#30D158]" />
                  Bcrypt • Hardware Bound
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#30D158]/10 border border-[#30D158]/25 text-[#30D158] text-[10px] font-bold tracking-wider uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-[#30D158] animate-pulse" />
              PROTETTO
            </div>
          </div>

          {/* Central Security Emblem */}
          <div className="space-y-2 text-center pt-1">
            <div className="relative inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-b from-white/10 to-white/5 border border-white/15 mb-1 shadow-inner group">
              <Lock size={24} className="text-white/90 group-hover:scale-105 transition-transform" />
              <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[#0A84FF] border-2 border-[#111319] flex items-center justify-center">
                <Terminal size={10} className="text-white" />
              </div>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
              Puff Gateway Access
            </h1>
            <p className="text-xs text-white/55 leading-relaxed max-w-xs mx-auto">
              Ambiente operativo crittografato. Inserisci la passphrase master autorizzata per sbloccare il terminale.
            </p>
          </div>

          {/* Access Form */}
          <form onSubmit={handleUnlock} className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2 px-1">
                <label
                  htmlFor={formKeyId}
                  className="text-xs font-medium text-white/70 flex items-center gap-1.5"
                >
                  <KeyRound size={13} className="text-[#0A84FF]" />
                  Passphrase Master Nodo
                </label>
                {lockoutRemaining > 0 && (
                  <span className="text-[11px] text-[#FF453A] font-semibold animate-pulse">
                    Cooldown: {lockoutRemaining}s
                  </span>
                )}
              </div>

              <div className="relative">
                <input
                  id={formKeyId}
                  type={showPassword ? 'text' : 'password'}
                  value={keyInput}
                  onChange={(e) => {
                    setKeyInput(e.target.value);
                    if (errorMessage) setErrorMessage('');
                  }}
                  disabled={loading || lockoutRemaining > 0}
                  placeholder={
                    lockoutRemaining > 0
                      ? 'Terminale temporaneamente in cooldown...'
                      : 'Inserisci chiave master...'
                  }
                  autoFocus
                  autoComplete="current-password"
                  className="w-full px-4 py-3.5 pr-12 rounded-2xl bg-white/[0.06] border border-white/15 text-white placeholder-white/30 text-sm focus:outline-none focus:border-[#0A84FF] focus:ring-2 focus:ring-[#0A84FF]/25 transition-all font-mono tracking-wider disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80 transition-colors p-1"
                  aria-label={showPassword ? 'Nascondi passphrase' : 'Mostra passphrase'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Error Message Pill */}
            <AnimatePresence>
              {errorMessage && (
                <motion.div
                  initial={{ opacity: 0, height: 0, y: -4 }}
                  animate={{ opacity: 1, height: 'auto', y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  className="p-3 rounded-2xl bg-[#FF453A]/10 border border-[#FF453A]/30 text-xs text-[#FF453A] flex items-center gap-2 overflow-hidden shadow-sm"
                >
                  <AlertTriangle size={15} className="shrink-0" />
                  <span>{errorMessage}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Unlock Button */}
            <button
              type="submit"
              disabled={loading || !keyInput.trim() || lockoutRemaining > 0}
              className="w-full h-12 rounded-2xl bg-gradient-to-r from-[#0A84FF] via-[#0071E3] to-[#005bb5] hover:brightness-110 active:scale-[0.98] text-white font-semibold text-sm shadow-lg shadow-[#0A84FF]/30 flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Verifica crittografica in corso...</span>
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  <span>Autentica e Sblocca Dispositivo</span>
                </>
              )}
            </button>
          </form>

          {/* Security & Anti-Phishing Guard Footer */}
          <div className="pt-2 border-t border-white/5 space-y-2.5">
            <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-white/[0.03] border border-white/5 text-[11px] text-white/60">
              <CheckCircle2 size={14} className="text-[#30D158] shrink-0 mt-0.5" />
              <div>
                <strong className="text-white/80 block">Dispositivo Autorizzato:</strong>
                Una volta convalidata, la sessione viene memorizzata in modo persistente su questo dispositivo.
                Controlla che l&apos;host sia corretto:{' '}
                <code className="text-[#0A84FF] font-mono font-medium">{currentHost}</code>
              </div>
            </div>

            <p className="text-[10px] text-center text-white/35 font-mono">
              Crittografia SHA-256 • Autenticazione end-to-end attiva
            </p>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <SiteGateContext.Provider value={{ isUnlocked, lockTerminal, unlockTerminal }}>
      {children}
    </SiteGateContext.Provider>
  );
};
export default SiteGatekeeper;
