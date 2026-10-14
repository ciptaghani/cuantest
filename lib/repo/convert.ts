import type { DateKey } from '@/lib/date';

/** Prisma Decimal / number / null → number. */
export const num = (v: { toString(): string } | number | null | undefined): number => (v == null ? 0 : Number(v));
export const numOrNull = (v: { toString(): string } | number | null | undefined): number | null => (v == null ? null : Number(v));

/** Kolom @db.Date → "YYYY-MM-DD". */
export const dateKey = (d: Date): DateKey => d.toISOString().slice(0, 10);
export const toDbDate = (k: DateKey): Date => new Date(`${k}T00:00:00.000Z`);

/**
 * Waktu pesanan disimpan "naive": jam lokal WIB ditulis apa adanya sebagai UTC,
 * jadi "2026-01-05T13:45" tetap "2026-01-05T13:45" saat dibaca, di zona waktu server mana pun.
 */
export const naiveTs = (d: Date): string => d.toISOString().slice(0, 16);
export const toNaiveDate = (ts: string): Date => new Date(`${ts.slice(0, 16)}:00.000Z`);
