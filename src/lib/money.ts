/**
 * Safe money utilities — cents-based arithmetic to avoid floating-point issues.
 * Usage:
 *   toCents(7.50)      → 750
 *   fromCents(750)      → 7.5
 *   safeNumber("10.5")  → 10.5
 *   safeNumber(null)    → 0
 *   safeNumber(NaN)     → 0
 */

/** Convert any value to a safe finite number, defaulting to 0. */
export const safeNumber = (v: unknown): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

/** Convert a monetary value to integer cents (avoids FP in sums). */
export const toCents = (v: unknown): number =>
    Math.round(safeNumber(v) * 100);

/** Convert integer cents back to a decimal euro value. */
export const fromCents = (c: number): number => c / 100;

/** Format a number as €X.XX string. Safe against null/NaN. */
export const formatEur = (v: unknown): string =>
    safeNumber(v).toFixed(2);
