/** Fase 7: nomor dokumen dan baris laporan (halaman = Excel). */
import { describe, expect, it } from 'vitest';
import { buildLedger, glDetail, glSummary, nextDocNumber, profitLoss, profitLossRows } from '@/lib/finance';
import { learnRates } from '@/lib/marketplace';
import { financeFromHtml, marketplaceFromHtml } from '@/lib/migrate/fromHtml';
import { buildFixture } from '../parity/fixture';

describe('nomor dokumen', () => {
  it('memakai nomor terbesar + 1, tidak bentrok setelah ada yang dihapus', () => {
    expect(nextDocNumber([], 'PO', '2026-10-14')).toBe('PO/202610/001');
    // PO/202610/001 dihapus: jumlah = 1, tapi 002 sudah dipakai
    expect(nextDocNumber(['PO/202610/002', 'PO/202609/007'], 'PO', '2026-10-01')).toBe('PO/202610/003');
    expect(nextDocNumber(['BKK/202610/009'], 'BKM', '2026-10-01')).toBe('BKM/202610/001');
  });
});

describe('laporan', () => {
  for (const seed of [1, 4, 9]) {
    const fx = buildFixture(seed);
    const mp = marketplaceFromHtml(fx.S);
    const fin = financeFromHtml(fx.docs, mp, fx.today);
    const L = buildLedger({ ...fin, marketplace: mp, rates: learnRates(mp) });
    const from = fin.start;
    const to = fx.today;

    it(`baris laba rugi = angka laba rugi (seed ${seed})`, () => {
      const pl = profitLoss(L, fin.accounts, from, to);
      const rows = profitLossRows(pl);
      expect(rows.find((r) => r.label === 'LABA BERSIH')?.value).toBe(pl.netProfit);
      expect(rows.find((r) => r.label === 'LABA KOTOR')?.value).toBe(pl.grossProfit);
      const revenue = rows.filter((r) => r.kind === 'row' && r.code && fin.accounts.find((a) => a.code === r.code)?.type === 'REVENUE');
      expect(revenue.reduce((s, r) => s + (r.value ?? 0), 0)).toBeCloseTo(pl.revenue.total, 2);
    });

    it(`buku besar seimbang & detail berakhir di saldo akhir (seed ${seed})`, () => {
      const gl = glSummary(L, fin.accounts, from, to);
      expect(gl.balanced).toBe(true);
      expect(gl.rows.length).toBeGreaterThan(0);
      for (const r of gl.rows) {
        const d = glDetail(L, r.account.code, from, to);
        expect(d.open).toBeCloseTo(r.open, 2);
        expect(d.rows.length ? d.rows[d.rows.length - 1].balance : d.open).toBeCloseTo(r.end, 2);
      }
    });
  }
});
