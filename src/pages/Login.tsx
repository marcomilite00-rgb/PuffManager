import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { LogIn, User as UserIcon, Delete, X, ArrowLeft } from 'lucide-react';
import { clsx } from 'clsx';

interface StaffForLogin {
    id: string;
    name: string;
    role: string;
    has_pin: boolean;
}

const getAvatarColor = (name: string) => {
    const colors = [
        'bg-cyan-500', 'bg-emerald-500', 'bg-blue-500', 
        'bg-purple-500', 'bg-pink-500', 'bg-orange-500', 
        'bg-indigo-500', 'bg-rose-500'
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
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

    useEffect(() => {
        if (user) navigate('/inventario');
        fetchStaff();
    }, [user, navigate]);

    const fetchStaff = async () => {
        try {
            const { data } = await supabase.from('staff').select('id, name, role, pin_hash').order('name');
            if (data) {
                setStaffList(data.map(s => ({
                    id: s.id,
                    name: s.name,
                    role: s.role,
                    has_pin: s.pin_hash !== null
                })));
            }
        } catch (err) {
            console.error('Fetch failed');
        }
    };

    const handleNumberClick = (num: string) => {
        if (pin.length < 8) {
            setPin(prev => prev + num);
            if (error) setError('');
        }
    };

    const handleBackspace = () => {
        setPin(prev => prev.slice(0, -1));
    };

    const handleLogin = async () => {
        if (!selectedStaff) return;
        setLoading(true);
        setError('');
        try {
            await login(selectedStaff.name, selectedStaff.has_pin ? pin : undefined);
            navigate('/inventario');
        } catch (err: any) {
            setError(err.message || 'PIN Errato');
            setPin('');
        } finally {
            setLoading(false);
        }
    };

    // Auto-login if no PIN required
    useEffect(() => {
        if (selectedStaff && !selectedStaff.has_pin) {
            handleLogin();
        }
    }, [selectedStaff]);

    if (!selectedStaff) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-surface-950 safe-area-pt safe-area-pb">
                <div className="w-full max-w-md space-y-12 animate-fade">
                    <div className="text-center space-y-4">
                        <h1 className="text-4xl md:text-5xl font-black tracking-tighter text-white uppercase italic">
                            Puff Manager<span className="text-primary not-italic">Pro</span>
                        </h1>
                        <p className="label-caps text-slate-500 text-xs">Seleziona il tuo profilo per iniziare</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4 sm:gap-6">
                        {staffList.map((staff) => (
                            <button
                                key={staff.id}
                                onClick={() => setSelectedStaff(staff)}
                                className="group flex flex-col items-center gap-4 p-6 glass-card rounded-[2.5rem] relative overflow-hidden active:scale-95"
                            >
                                <div className={clsx(
                                    "w-16 h-16 rounded-[1.5rem] flex items-center justify-center text-2xl font-black text-white shadow-2xl transition-transform group-hover:scale-110 duration-500",
                                    getAvatarColor(staff.name)
                                )}>
                                    {staff.name.charAt(0)}
                                </div>
                                <div className="text-center">
                                    <p className="font-black text-white text-lg tracking-tight uppercase">{staff.name}</p>
                                    <p className="label-caps text-[9px] text-slate-500 group-hover:text-primary transition-colors">{staff.role}</p>
                                </div>
                                {staff.has_pin && (
                                    <div className="absolute top-3 right-3 w-2 h-2 bg-primary rounded-full shadow-[0_0_10px_rgba(0,188,212,0.5)]"></div>
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-surface-950 safe-area-pt safe-area-pb animate-fade">
            <div className="w-full max-w-sm space-y-10">
                <div className="flex flex-col items-center text-center space-y-6">
                    <button 
                        onClick={() => { setSelectedStaff(null); setPin(''); setError(''); }}
                        className="flex items-center gap-2 text-slate-500 hover:text-white label-caps text-[10px] transition-colors bg-white/5 px-4 py-2 rounded-full"
                    >
                        <ArrowLeft size={14} /> cambia profilo
                    </button>

                    <div className={clsx(
                        "w-24 h-24 rounded-[2rem] flex items-center justify-center text-4xl font-black text-white shadow-3xl animate-slide-up",
                        getAvatarColor(selectedStaff.name)
                    )}>
                        {selectedStaff.name.charAt(0)}
                    </div>
                    
                    <div>
                        <h2 className="text-3xl font-black text-white italic tracking-tighter uppercase">{selectedStaff.name}</h2>
                        <p className="label-caps text-[10px] text-primary mt-1">{selectedStaff.role}</p>
                    </div>
                </div>

                {/* PIN Dots Display */}
                <div className="flex justify-center gap-4 py-4">
                    {[...Array(4)].map((_, i) => (
                        <div 
                            key={i}
                            className={clsx(
                                "w-4 h-4 rounded-full border-2 transition-all duration-300",
                                pin.length > i 
                                    ? "bg-primary border-primary shadow-[0_0_15px_rgba(0,188,212,0.6)] scale-110" 
                                    : "bg-transparent border-white/10"
                            )}
                        />
                    ))}
                </div>

                {error && (
                    <div className="p-4 bg-danger/10 border border-danger/20 rounded-2xl text-danger text-[10px] label-caps text-center animate-shake">
                        {error}
                    </div>
                )}

                {/* Visual Numpad */}
                <div className="grid grid-cols-3 gap-4">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                        <button
                            key={num}
                            onClick={() => handleNumberClick(num.toString())}
                            className="h-20 glass-card rounded-2xl flex items-center justify-center text-2xl font-black text-white hover:bg-white/10 active:scale-90 transition-all"
                        >
                            {num}
                        </button>
                    ))}
                    <button
                        onClick={() => setPin('')}
                        className="h-20 flex items-center justify-center text-slate-500 hover:text-white transition-colors"
                        aria-label="Cancella tutto"
                    >
                        <X size={24} />
                    </button>
                    <button
                        onClick={() => handleNumberClick('0')}
                        className="h-20 glass-card rounded-2xl flex items-center justify-center text-2xl font-black text-white hover:bg-white/10 active:scale-90 transition-all"
                    >
                        0
                    </button>
                    <button
                        onClick={handleBackspace}
                        className="h-20 flex items-center justify-center text-slate-500 hover:text-white transition-colors"
                        aria-label="Cancella cifra"
                    >
                        <Delete size={24} />
                    </button>
                </div>

                <button
                    onClick={handleLogin}
                    disabled={loading || pin.length < 4}
                    className={clsx(
                        "w-full py-6 rounded-[2rem] text-xl font-black transition-all flex items-center justify-center gap-3 shadow-3xl label-caps",
                        loading || pin.length < 4 
                            ? "bg-surface-800 text-slate-600 border border-white/5 opacity-50 cursor-not-allowed" 
                            : "bg-primary text-surface-950 hover:scale-105 active:scale-95 shadow-primary/20"
                    )}
                >
                    {loading ? (
                        <div className="w-6 h-6 border-4 border-surface-950 border-t-white rounded-full animate-spin"></div>
                    ) : (
                        <>
                            <LogIn size={20} />
                            <span>Entra</span>
                        </>
                    )}
                </button>
            </div>
        </div>
    );
};
