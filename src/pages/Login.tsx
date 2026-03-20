import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { LogIn, User as UserIcon, Lock, Eye, EyeOff } from 'lucide-react';
import { clsx } from 'clsx';

interface StaffForLogin {
    id: string;
    name: string;
    role: string;
    has_pin: boolean;
}

export const Login: React.FC = () => {
    const navigate = useNavigate();
    const { user, login } = useAuth();
    const [staffList, setStaffList] = useState<StaffForLogin[]>([
        { id: '1', name: 'Marco', role: 'admin', has_pin: true },
        { id: '2', name: 'Andrea', role: 'staff', has_pin: true },
        { id: '3', name: 'Jacopo', role: 'helper', has_pin: false }
    ]);
    const [selectedStaff, setSelectedStaff] = useState<StaffForLogin | null>(null);
    const [pin, setPin] = useState('');
    const [showPin, setShowPin] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (user) {
            navigate('/inventario');
        }
        fetchStaff();
    }, [user, navigate]);

    const fetchStaff = async () => {
        try {
            // Try RPC function first (returns has_pin without exposing pin_hash)
            const { data: rpcData, error: rpcError } = await supabase
                .rpc('get_staff_list_for_login');

            if (!rpcError && rpcData && rpcData.length > 0) {
                setStaffList(rpcData);
                return;
            }

            // Fallback to direct query (for development)
            const { data, error } = await supabase
                .from('staff')
                .select('id, name, role, pin_hash')
                .order('name');

            if (data && data.length > 0) {
                setStaffList(data.map(s => ({
                    id: s.id,
                    name: s.name,
                    role: s.role,
                    has_pin: s.pin_hash !== null
                })));
            }
            if (error) console.error('Database fetch failed:', error.message);
        } catch (err) {
            console.error('Fallback enabled.');
        }
    };

    const handleLogin = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!selectedStaff) return;

        setLoading(true);
        setError('');
        try {
            // Pass PIN only if staff requires it
            await login(selectedStaff.name, selectedStaff.has_pin ? pin : undefined);
            navigate('/inventario');
        } catch (err: any) {
            setError(err.message || 'Errore durante il login');
        } finally {
            setLoading(false);
        }
    };

    if (!selectedStaff) {
        return (
            <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 sm:p-6 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-slate-900 to-slate-950 safe-area-pt safe-area-pb">
                <div className="w-full max-w-sm glass p-5 sm:p-6 md:p-8 rounded-[2rem] md:rounded-[2.5rem] border border-white/5 animate-in fade-in zoom-in duration-500 shadow-2xl">
                    <div className="text-center mb-6 sm:mb-8 md:mb-10">
                        <h1 className="text-2xl sm:text-3xl md:text-4xl font-black mb-2 tracking-tight uppercase">Puff Manager Pro</h1>
                        <p className="text-slate-500 font-black uppercase tracking-widest text-[9px] sm:text-[10px]">Seleziona il tuo profilo</p>
                    </div>

                    <div className={staffList.length > 6 ? "grid grid-cols-2 gap-2" : "space-y-2"}>
                        {staffList.map((staff) => (
                            <button
                                key={staff.id}
                                onClick={() => setSelectedStaff(staff)}
                                className={`w-full flex items-center justify-between ${staffList.length > 6 ? 'p-3' : 'p-3 sm:p-4'} glass rounded-xl sm:rounded-2xl hover:bg-white/10 transition-all border hover:border-primary/20 group active:scale-[0.98] ${staffList.length > 6 ? 'h-16' : 'h-16 md:h-auto md:p-5'} border-white/5`}
                            >
                                <div className="flex items-center gap-2 sm:gap-3">
                                    <div className={`${staffList.length > 6 ? 'w-9 h-9 rounded-lg' : 'w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl'} bg-slate-900 flex items-center justify-center text-slate-400 group-hover:text-primary transition-colors shrink-0`}>
                                        <UserIcon className="w-4 h-4 md:w-5 md:h-5" />
                                    </div>
                                    <div className="text-left overflow-hidden">
                                        <p className={`${staffList.length > 6 ? 'text-sm' : 'text-sm md:text-base'} font-black group-hover:text-white transition-colors uppercase tracking-tight truncate`}>{staff.name}</p>
                                        <div className="flex items-center gap-1.5">
                                            <p className="text-[8px] md:text-[9px] uppercase font-black tracking-widest text-slate-500 group-hover:text-primary/70 transition-colors">{staff.role}</p>
                                            {staff.has_pin && (
                                                <span className="text-[7px] md:text-[8px] px-1.5 py-0.5 bg-primary/10 text-primary rounded-full font-bold uppercase tracking-wide">PIN</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 sm:p-6 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-slate-900/40 to-slate-950 safe-area-pt safe-area-pb">
            <div className="w-full max-w-sm glass-dark p-6 sm:p-8 md:p-10 rounded-[2rem] md:rounded-[3rem] border border-white/10 shadow-3xl animate-in zoom-in-95 duration-500 relative overflow-hidden">
                <button
                    onClick={() => { setSelectedStaff(null); setPin(''); setError(''); }}
                    className="absolute top-5 left-5 sm:top-6 sm:left-6 text-slate-500 hover:text-white transition-colors text-xs font-black uppercase tracking-widest"
                >
                    &larr; Indietro
                </button>

                <div className="text-center mb-6 sm:mb-8 md:mb-10 mt-8 sm:mt-6 md:mt-4">
                    <div className="w-14 h-14 sm:w-16 sm:h-16 md:w-20 md:h-20 bg-primary/20 rounded-2xl md:rounded-[2rem] flex items-center justify-center text-primary mx-auto mb-4 md:mb-6 shadow-lg shadow-primary/10">
                        <UserIcon className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8" />
                    </div>
                    <h2 className="text-xl sm:text-2xl md:text-3xl font-black uppercase tracking-tight">{selectedStaff.name}</h2>
                    <p className="text-slate-500 font-bold uppercase tracking-widest text-[9px] md:text-[10px] mt-1">{selectedStaff.role}</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-5 sm:space-y-6 md:space-y-8">
                    {selectedStaff.has_pin ? (
                        <div className="space-y-3 sm:space-y-4">
                            <label className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 block text-center mb-2">Inserisci PIN (4-8 cifre)</label>
                            <div className="relative">
                                <Lock className="absolute left-5 sm:left-6 top-1/2 -translate-y-1/2 text-slate-500 w-5 h-5 sm:w-6 sm:h-6" />
                                <input
                                    type={showPin ? "text" : "password"}
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    maxLength={8}
                                    placeholder="••••"
                                    value={pin}
                                    onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                                    className="w-full bg-slate-900 border border-white/10 rounded-2xl md:rounded-[2rem] py-5 sm:py-6 md:py-8 px-12 sm:px-14 text-center text-2xl sm:text-3xl md:text-4xl font-black tracking-[0.3em] sm:tracking-[0.5em] md:tracking-[0.8em] focus:outline-none focus:ring-4 focus:ring-primary/20 focus:border-primary/50 transition-all text-white placeholder:tracking-normal placeholder:opacity-20"
                                    autoFocus
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPin(!showPin)}
                                    className="absolute right-4 sm:right-5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors p-2"
                                >
                                    {showPin ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="py-6 sm:py-8 md:py-10 text-center glass rounded-2xl md:rounded-3xl border border-dashed border-white/10">
                            <p className="text-slate-400 font-black text-sm md:text-base">Nessun PIN richiesto.</p>
                            <p className="text-[9px] md:text-[10px] text-slate-600 uppercase font-black tracking-widest mt-2">Premi continua per entrare</p>
                        </div>
                    )}

                    {error && (
                        <div className="p-3 md:p-4 bg-red-500/10 border border-red-500/20 rounded-xl md:rounded-2xl text-red-500 text-xs md:text-sm font-black text-center animate-shake uppercase tracking-tight">
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading || (selectedStaff.has_pin && pin.length < 4)}
                        className={clsx(
                            "w-full py-4 sm:py-5 md:py-6 rounded-2xl md:rounded-[2rem] text-base sm:text-lg md:text-xl font-black transition-all flex items-center justify-center gap-3 shadow-2xl uppercase tracking-widest",
                            loading ? "bg-slate-800 text-slate-500" : "bg-primary text-black hover:scale-[1.02] active:scale-[0.98] hover:shadow-primary/20 shadow-primary/10"
                        )}
                    >
                        {loading ? (
                            <div className="w-6 h-6 md:w-8 md:h-8 border-[3px] md:border-4 border-slate-500 border-t-white rounded-full animate-spin"></div>
                        ) : (
                            <>
                                <LogIn className="w-5 h-5 md:w-6 md:h-6" />
                                <span>ENTRA</span>
                            </>
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
};
