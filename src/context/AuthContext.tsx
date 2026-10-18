import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { Staff } from '../types/database';

interface AuthContextType {
    user: Staff | null;
    loading: boolean;
    login: (staffName: string, pin?: string) => Promise<void>;
    logout: () => Promise<void>;
    switchProfile: (staffName: string, pin?: string) => Promise<void>;
    switchAsAdmin: (staffName: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<Staff | null>(null);
    const [loading, setLoading] = useState(true);

    const logout = useCallback(async () => {
        setLoading(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
                await supabase
                    .from('staff_sessions')
                    .update({ revoked_at: new Date().toISOString() })
                    .eq('auth_uid', session.user.id);
            }
            await supabase.auth.signOut();
            setUser(null);
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        let active = true;
        void (async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession();

                if (session) {
                    const { data: staffSession, error } = await supabase
                        .from('staff_sessions')
                        .select('staff_id, pin_version, staff:staff(id, name, role, pin_version)')
                        .eq('auth_uid', session.user.id)
                        .is('revoked_at', null)
                        .single();

                    if (error || !staffSession?.staff) {
                        if (active) await logout();
                        return;
                    }

                    const staff = staffSession.staff as unknown as Staff;

                    if (staffSession.pin_version !== null &&
                        staffSession.pin_version !== staff.pin_version) {
                        if (active) await logout();
                        return;
                    }

                    setUser({
                        id: staff.id,
                        name: staff.name,
                        role: staff.role,
                        pin_version: staff.pin_version,
                        created_at: ''
                    });
                }
            } catch (error) {
                console.error('Error checking session:', error);
            } finally {
                if (active) setLoading(false);
            }
        })();
        return () => { active = false; };
    }, [logout]);

    const login = async (staffName: string, pin?: string) => {
        setLoading(true);
        try {
            // 1. Ensure anonymous session exists first
            let { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                const { data: authData, error: authError } = await supabase.auth.signInAnonymously();
                if (authError || !authData?.session) throw authError || new Error('Autenticazione iniziale non riuscita');
                session = authData.session;
            }

            // 2. Authenticate staff and securely mint session via RPC
            const { data: authResult, error: authRpcError } = await supabase
                .rpc('authenticate_staff', {
                    p_staff_name: staffName,
                    p_pin: pin || null
                });

            if (authRpcError) {
                throw new Error(authRpcError.message || 'Errore durante il login');
            }

            if (authResult && authResult.length > 0) {
                const result = authResult[0] as {
                    staff_id: string;
                    staff_name: string;
                    staff_role: Staff['role'];
                    staff_pin_version: number;
                    error_message?: string | null;
                };

                if (result.error_message) {
                    throw new Error(result.error_message);
                }

                setUser({
                    id: result.staff_id,
                    name: result.staff_name,
                    role: result.staff_role,
                    pin_version: result.staff_pin_version,
                    created_at: ''
                });
                return;
            }

            throw new Error('Credenziali non valide o operatore non trovato');
        } catch (error: unknown) {
            console.error('Login error:', error);
            throw error;
        } finally {
            setLoading(false);
        }
    };

    const switchAsAdmin = async (staffName: string) => {
        setLoading(true);
        try {
            const { data: switchResult, error: switchError } = await supabase
                .rpc('switch_operator_as_admin', {
                    p_target_staff_name: staffName
                });

            if (switchError) {
                throw new Error(switchError.message || 'Impossibile cambiare operatore');
            }

            if (switchResult && switchResult.length > 0) {
                const result = switchResult[0];
                setUser({
                    id: result.staff_id,
                    name: result.staff_name,
                    role: result.staff_role,
                    pin_version: result.staff_pin_version,
                    created_at: ''
                });
                return;
            }

            throw new Error('Operatore bersaglio non trovato');
        } catch (error) {
            console.error('switchAsAdmin error:', error);
            throw error;
        } finally {
            setLoading(false);
        }
    };

    const switchProfile = async (staffName: string, pin?: string) => {
        if (user?.role === 'admin' && !pin) {
            await switchAsAdmin(staffName);
            return;
        }
        await logout();
        await login(staffName, pin);
    };

    return (
        <AuthContext.Provider value={{ user, loading, login, logout, switchProfile, switchAsAdmin }}>
            {children}
        </AuthContext.Provider>
    );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
