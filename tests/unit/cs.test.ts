import { describe, expect, it } from 'vitest';
import { expStatus } from '@/lib/cs';

describe('status expired (CS)', () => {
  it('lewat = bad, ≤ 90 hari = mid, lebih = ok, kosong = none', () => {
    const t = '2026-10-14';
    expect(expStatus('', t)).toEqual({ cls: 'none', days: null });
    expect(expStatus('2026-10-13', t)).toEqual({ cls: 'bad', days: -1 });
    expect(expStatus('2026-10-14', t)).toEqual({ cls: 'mid', days: 0 });
    expect(expStatus('2027-01-12', t)).toEqual({ cls: 'mid', days: 90 });
    expect(expStatus('2027-01-13', t)).toEqual({ cls: 'ok', days: 91 });
  });
});
