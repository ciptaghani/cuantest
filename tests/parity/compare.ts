import { expect } from 'vitest';

/** Toleransi parity: selisih ≤ Rp1 (pembulatan). */
export const TOL = 1;

/** Sama untuk angka (≤ tol, NaN = NaN, ±Infinity sama tanda) dan nilai lain (deep equal). */
export function near(actual: unknown, expected: unknown, path = '', tol = TOL): void {
  if (typeof expected === 'number' || typeof actual === 'number') {
    const a = actual as number;
    const e = expected as number;
    if (Number.isNaN(e) || e === undefined || e === null) {
      expect(Number.isNaN(a) || a === undefined || a === null, `${path}: ${a} vs ${e}`).toBe(true);
      return;
    }
    if (!Number.isFinite(e)) {
      expect(a, path).toBe(e);
      return;
    }
    expect(Math.abs(a - e), `${path}: ${a} vs ${e}`).toBeLessThanOrEqual(tol);
    return;
  }
  expect(actual, path).toEqual(expected);
}

/** Bandingkan field-field tertentu dari dua objek. */
export function nearFields(actual: Record<string, unknown>, expected: Record<string, unknown>, fields: string[], path = '', tol = TOL) {
  for (const f of fields) near(actual[f], expected[f], `${path}.${f}`, tol);
}
