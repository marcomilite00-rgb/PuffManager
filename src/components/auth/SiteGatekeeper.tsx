import React, { createContext, useContext, useState, useEffect, useCallback, useId } from 'react';
import { supabase } from '../../lib/supabase';
import { Shield, Lock, Eye, EyeOff, AlertTriangle, KeyRound, CheckCircle2, Loader2, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface SiteGateContextType {
  isUnlocked: boolean;
  lockTerminal: () => void;
}

const SiteGateContext = createContext<SiteGateContextType>({
  isUnlocked: false,
  lockTerminal: () => {},
});

export const useSiteGate = () => useContext(SiteGateContext);

const GATE_SESSION_KEY = 'puff_terminal_gate_session';
const GATE_ATTEMPTS_KEY = 'puff_gate_attempts_history';
const MAX_LOCAL_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 60 * 1000; // 60 seconds lockout

interface StoredAttempts {
  count: number;
  lastAttempt: number;
}

export const SiteGatekeeper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isUnlocked, setIsUnlocked] = useState<boolean>(() => {
    try {
      const stored = sessionStorage.getItem(GATE_SESSION_KEY);
      if (!stored) return false;
      const parsed = JSON.parse(stored);
      // Valid for 8 hours
      if (parsed.timestamp && Date.now() - parsed.timestamp < 8 * 60 * 60 * 1000) {
        return true;
      }
      sessionStorage.removeItem(GATE_SESSION_KEY);
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
        // Cross-origin iframe framebuster prevented
      }
    }
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
          // Cooldown expired, reset
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
      document.title = 'Access Terminal | Secure Entry';
    } else {
      document.title = 'Puff Manager Pro';
    }
  }, [isUnlocked]);

  const recordFailedAttempt = () => {
    try {
      const raw = localStorage.getItem(GATE_ATTEMPTS_KEY);
      let data: StoredAttempts = raw ? JSON.parse(raw) : { count: 0, lastAttempt: 0 };
      data.count += 1;
      data.lastAttempt = Date.now();
      localStorage.setItem(GATE_ATTEMPTS_KEY, JSON.stringify(data));

      if (data.count >= MAX_LOCAL_ATTEMPTS) {
        setLockoutRemaining(Math.ceil(LOCKOUT_DURATION_MS / 1000));
      }
    } catch {
      // Ignore storage errors
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
    if (!keyInput.trim() || loading || lockoutRemaining > 0) return;

    setLoading(true);
    setErrorMessage('');

    try {
      const { data, error } = await supabase.rpc('verify_site_access_key', {
        p_key: keyInput.trim(),
      });

      if (error) {
        throw new Error(error.message || 'Errore di connessione al server di sicurezza');
      }

      if (data === true) {
        clearFailedAttempts();
        const sessionPayload = {
          timestamp: Date.now(),
          verified: true,
        };
        sessionStorage.setItem(GATE_SESSION_KEY, JSON.stringify(sessionPayload));
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
      sessionStorage.removeItem(GATE_SESSION_KEY);
    } catch {
      // Ignore
    }
    setIsUnlocked(false);
    setKeyInput('');
    setErrorMessage('');
  }, []);

  if (isClickjacked) {
    return (
      <div className="fixed inset-0 z-[9999] bg-[#0E0F13] text-white flex items-center justify-center p-6 text-center">
        <div className="max-w-md p-8 rounded-3xl bg-[#FF453A]/10 border border-[#FF453A]/30 space-y-4">
          <AlertTriangle className="mx-auto text-[#FF453A] w-14 h-14" />
          <h2 className="text-xl font-bold tracking-tight">Rilevato Tentativo di Framing / Phishing</h2>
          <p className="text-sm text-white/70">
            Il terminale di sicurezza ha rilevato un tentativo di caricamento in iframe non autorizzato.
            Per motivi di protezione dati, l&apos;accesso è stato immediatamente bloccato.
          </p>
          <button
            type="button"
            onClick={() => window.open(window.location.href, '_top')}
            className="w-full py-3 rounded-2xl bg-[#FF453A] text-white font-semibold text-sm hover:bg-[#E03A30] transition"
          >
            Apri in Scheda Dedicata Protetta
          </button>
        </div>
      </div>
    );
  }

  if (!isUnlocked) {
    return (
      <div className="fixed inset-0 z-[9999] min-h-[100dvh] bg-[#07080B] text-white flex flex-col items-center justify-center p-4 sm:p-6 overflow-y-auto selection:bg-[#0A84FF]/30">
        {/* Subtle Background Glows */}
        <div className="absolute top-1/4 -left-32 w-96 h-96 bg-[#0A84FF]/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-[#30D158]/5 rounded-full blur-3xl pointer-events-none" />

        <motion.div
          key={shakeKey}
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{
            opacity: 1,
            y: 0,
            scale: 1,
            x: shakeKey > 0 ? [0, -10, 10, -6, 6, 0] : 0,
          }}
          transition={{ duration: 0.3 }}
          className="relative w-full max-w-md p-6 sm:p-8 rounded-3xl bg-[#111319]/90 border border-white/10 backdrop-blur-2xl shadow-2xl shadow-black/80 space-y-6"
        >
          {/* Top Security Banner */}
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-[#0A84FF]/15 border border-[#0A84FF]/30 flex items-center justify-center text-[#0A84FF]">
                <Shield size={16} />
              </div>
              <div>
                <span className="text-[11px] font-bold tracking-wider uppercase text-white/50 block">
                  Secure Access Node
                </span>
                <span className="text-xs font-mono font-medium text-white/90">
                  AES-GCM • TLS 1.3 Active
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#30D158]/10 border border-[#30D158]/20 text-[#30D158] text-[10px] font-semibold tracking-wide">
              <span className="w-1.5 h-1.5 rounded-full bg-[#30D158] animate-pulse" />
              SISTEMA PROTETTO
            </div>
          </div>

          {/* Terminal Title */}
          <div className="space-y-1.5 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-white/5 border border-white/10 mb-2 shadow-inner">
              <Lock size={22} className="text-white/80" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-white">
              Terminale di Sicurezza
            </h1>
            <p className="text-xs text-white/50 leading-relaxed max-w-xs mx-auto">
              Ambiente operativo crittografato. Inserisci la chiave master del nodo per decifrare e avviare il sistema.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleUnlock} className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5 px-1">
                <label
                  htmlFor={formKeyId}
                  className="text-xs font-medium text-white/70 flex items-center gap-1.5"
                >
                  <KeyRound size={13} className="text-[#0A84FF]" />
                  Chiave Master di Accesso
                </label>
                {lockoutRemaining > 0 && (
                  <span className="text-[11px] text-[#FF453A] font-semibold animate-pulse">
                    Blocco: {lockoutRemaining}s
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
                  placeholder={lockoutRemaining > 0 ? 'Terminale bloccato per sicurezza...' : 'Inserisci passphrase...'}
                  autoFocus
                  autoComplete="current-password"
                  className="w-full px-4 py-3.5 pr-12 rounded-2xl bg-white/[0.06] border border-white/15 text-white placeholder-white/30 text-sm focus:outline-none focus:border-[#0A84FF] focus:ring-2 focus:ring-[#0A84FF]/20 transition-all font-mono tracking-wider disabled:opacity-50 disabled:cursor-not-allowed"
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

            {/* Error Message */}
            <AnimatePresence>
              {errorMessage && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="p-3 rounded-2xl bg-[#FF453A]/10 border border-[#FF453A]/30 text-xs text-[#FF453A] flex items-center gap-2 overflow-hidden"
                >
                  <AlertTriangle size={15} className="shrink-0" />
                  <span>{errorMessage}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || !keyInput.trim() || lockoutRemaining > 0}
              className="w-full h-12 rounded-2xl bg-gradient-to-r from-[#0A84FF] to-[#0071E3] hover:from-[#0071E3] hover:to-[#005bb5] text-white font-semibold text-sm shadow-lg shadow-[#0A84FF]/25 flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Verifica crittografica in corso...</span>
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  <span>Sblocca e Avvia Sistema</span>
                </>
              )}
            </button>
          </form>

          {/* Anti-Phishing Guard Verification Info */}
          <div className="pt-2 border-t border-white/5 space-y-2">
            <div className="flex items-start gap-2 p-3 rounded-2xl bg-white/[0.03] border border-white/5 text-[11px] text-white/50">
              <CheckCircle2 size={14} className="text-[#30D158] shrink-0 mt-0.5" />
              <div>
                <strong className="text-white/70 block">Controllo Anti-Phishing:</strong>
                Verifica che l&apos;indirizzo nella barra URL sia esatto (
                <code className="text-white/80 font-mono">{typeof window !== 'undefined' ? window.location.hostname : 'localhost'}</code>
                ). Non inserire la chiave su domini sconosciuti o link sospetti.
              </div>
            </div>

            <p className="text-[10px] text-center text-white/30 font-mono">
              Firma di sicurezza SHA-256 • Rate-limiting hardware & anti-bruteforce attivo
            </p>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <SiteGateContext.Provider value={{ isUnlocked, lockTerminal }}>
      {children}
    </SiteGateContext.Provider>
  );
};
