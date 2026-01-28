import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

export function useRealtime<T extends { [key: string]: any }>(
    table: string,
    onEvent: (payload: RealtimePostgresChangesPayload<T>) => void
) {
    useEffect(() => {
        const channel = supabase
            .channel(`public:${table}`)
            .on(
                'postgres_changes' as any,
                {
                    event: '*',
                    schema: 'public',
                    table: table,
                },
                (payload: RealtimePostgresChangesPayload<T>) => {
                    onEvent(payload);
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [table, onEvent]);
}
