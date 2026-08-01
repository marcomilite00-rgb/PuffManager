import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

export function useRealtime<T extends Record<string, unknown>>(
    table: string,
    onEvent: (payload: RealtimePostgresChangesPayload<T>) => void
) {
    const onEventRef = useRef(onEvent);

    useEffect(() => {
        onEventRef.current = onEvent;
    });

    useEffect(() => {
        const channel = supabase
            .channel(`public:${table}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table },
                (payload) => { onEventRef.current(payload as RealtimePostgresChangesPayload<T>); }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [table]);
}
