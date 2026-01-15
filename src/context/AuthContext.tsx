import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Staff } from '../types/database';

interface AuthContextType {
    user: Staff | null;
    loading: boolean;
    login: (staffName: string, pin?: string) => Promise<void>;
    logout: () => Promise<void>;
    switchProfile: (staffName: string, pin?: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<Staff | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        checkSession();
    }, []);

    const checkSession = async () => {
        try {
            const { data: { session } } = await supabase.auth.getSession();

            if (session) {
                // Get staff session with pin_version validation
                const { data: staffSession, error } = await supabase
                    .from('staff_sessions')
                    .select('staff_id, pin_version, staff:staff(id, name, role, pin_version)')
                    .eq('auth_uid', session.user.id)
                    .is('revoked_at', null)
                    .single();

                if (error || !staffSession?.staff) {
                    // Session invalid or staff not found
                    await logout();
                    return;
                }

                const staff = staffSession.staff as any;

                // Validate pin_version matches (session invalidation check)
                if (staffSession.pin_version !== null &&
                    staffSession.pin_version !== staff.pin_version) {
                    // PIN was changed, session is invalid
                    console.log('Session invalidated: PIN version mismatch');
                    await logout();
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
            setLoading(false);
        }
    };

    const login = async (staffName: string, pin?: string) => {
        setLoading(true);
        try {
            // 1. Verify PIN using secure RPC function
            const { data: verifyResult, error: verifyError } = await supabase
                .rpc('verify_staff_pin', {
                    p_staff_name: staffName,
                    p_pin: pin || null
                });

            if (verifyError) {
                console.error('PIN verification error:', verifyError);
                // Fallback to direct check for development/demo
                await loginFallback(staffName, pin);
                return;
            }

            if (!verifyResult || verifyResult.length === 0) {
                throw new Error('Staff non trovato');
            }

            const result = verifyResult[0];

            if (!result.valid) {
                if (result.requires_pin && !pin) {
                    throw new Error('PIN richiesto');
                }
                throw new Error('PIN errato');
            }

            // 2. Auth Anonymously
            const { data: { session }, error: authError } = await supabase.auth.signInAnonymously();
            if (authError || !session) throw authError || new Error('Auth failed');

            // 3. Upsert staff session with pin_version
            const { error: sessionError } = await supabase
                .from('staff_sessions')
                .upsert({
                    auth_uid: session.user.id,
                    staff_id: result.staff_id,
                    pin_version: result.staff_pin_version,
                    revoked_at: null
                }, { onConflict: 'auth_uid' });

            if (sessionError) throw sessionError;

            setUser({
                id: result.staff_id,
                name: result.staff_name,
                role: result.staff_role,
                pin_version: result.staff_pin_version,
                created_at: ''
            });
        } catch (error: any) {
            console.error('Login error:', error);
            throw error;
        } finally {
            setLoading(false);
        }
    };

    // Fallback for development/demo when RPC not available
    const loginFallback = async (staffName: string, pin?: string) => {
        const fallbackStaff: Staff[] = [
            { id: '1', name: 'Marco', role: 'admin', has_pin: true, created_at: '' },
            { id: '2', name: 'Andrea', role: 'staff', has_pin: true, created_at: '' },
            { id: '3', name: 'Jacopo', role: 'helper', has_pin: false, created_at: '' }
        ];

        const staff = fallbackStaff.find(s => s.name === staffName);
        if (!staff) throw new Error('Staff non trovato');

        // Check PIN for fallback (hardcoded for demo)
        if (staff.has_pin) {
            const expectedPin = staff.name === 'Marco' ? '0509' : '2012';
            if (!pin) throw new Error('PIN richiesto');
            if (pin !== expectedPin) throw new Error('PIN errato');
        }

        const { data: { session }, error: authError } = await supabase.auth.signInAnonymously();
        if (authError || !session) throw authError || new Error('Auth failed');

        // Try to get real staff from DB
        const { data: dbStaff } = await supabase
            .from('staff')
            .select('*')
            .eq('name', staffName)
            .single();

        const finalStaff = dbStaff || staff;

        await supabase
            .from('staff_sessions')
            .upsert({
                auth_uid: session.user.id,
                staff_id: finalStaff.id,
                revoked_at: null
            }, { onConflict: 'auth_uid' });

        setUser(finalStaff);
    };

    const switchProfile = async (staffName: string, pin?: string) => {
        // First logout current session
        await logout();
        // Then login with new profile
        await login(staffName, pin);
    };

    const logout = async () => {
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
    };

    return (
        <AuthContext.Provider value={{ user, loading, login, logout, switchProfile }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
