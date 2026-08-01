export const getErrorMessage = (err: unknown, fallback = 'Errore') =>
    err instanceof Error ? err.message : fallback;
