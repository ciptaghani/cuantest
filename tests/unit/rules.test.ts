/** Aturan bisnis di task.md §0.3, diuji dengan angka hitungan tangan. */
import { describe, expect, it } from 'vitest';
import { buildLedger, trialBalance, invoiceUnitCosts } from '@/lib/finance';
import { adsAction } from '@/lib/marketing';
import { compute, enrich, learnRates, type MarketplaceData, type Store } from '@/lib/marketplace';
import { financeFromHtml, marketplaceFromHtml } from '@/lib/migrate/fromHtml';
import { autoMap, FEE_FIELDS } from '@/lib/parse';
import { buildOpsModel, hppCalc, stockCalcWh, type OpsInput } from '@/lib/ops';
import { buildFixture } from '../parity/fixture';

const store = (id: string, isDemo = false): Store => ({
  id,
  name: id,
  channel: 'shopee',
  brand: 'ngado.kado',
  isDemo,
  fees: { admin: 8, freeShip: 4.5, service: 4.5, tax: 0.5, ams: 0, process: 1250 },
});

function ops(partial: Partial<OpsInput>): OpsInput {
  return {
    warehouses: [
      { id: 'jogja', name: 'Gudang Jogja' },
      { id: 'sini', name: 'Toko Siniparfum' },
    ],
    skus: [
      { code: 'FS100', brand: 'HMNS', product: 'Orevall', variant: '', ml: 100, price: 0, cogs: 300000 },
      { code: 'D5', brand: 'HMNS', product: 'Orevall', variant: '', ml: 5, price: 0, cogs: 20000 },
    ],
    rules: [{ brand: 'HMNS', fromMl: 100, toMl: 5, qtyPerBottle: 19, packId: 'p5' }],
    packs: [{ id: 'p5', name: 'Botol 5ml', bottle: 2000, sticker: 300, other: 200 }],
    sourceOverrides: {},
    leadTimes: {},
    movements: [],
    opnames: [],
    sales: {},
    history: {},
    historyLabel: '',
    config: { shrinkPct: 95, targetDays: 14, avgMode: 'HISTORY', avgDays: 30, mainWarehouseId: 'jogja', salesWarehouseId: 'jogja' },
    today: '2026-03-31',
    ...partial,
  };
}

describe('stok', () => {
  it('transaksi di tanggal opname sudah termasuk hitungan fisik; penjualan hanya mengurangi gudang pengiriman', () => {
    const m = buildOpsModel(
      ops({
        opnames: [{ date: '2026-03-01', warehouseId: 'jogja', final: true, counts: { D5: 10 } }],
        movements: [
          { id: 'a', type: 'IN', date: '2026-03-01', seq: 1, warehouseId: 'jogja', toWarehouseId: null, sourceSku: null, sourceQty: 0, reason: '', note: '', lines: [{ sku: 'D5', qty: 99, unitPrice: null }] },
          { id: 'b', type: 'IN', date: '2026-03-02', seq: 2, warehouseId: 'jogja', toWarehouseId: null, sourceSku: null, sourceQty: 0, reason: '', note: '', lines: [{ sku: 'D5', qty: 5, unitPrice: null }] },
          { id: 'c', type: 'TRANSFER', date: '2026-03-03', seq: 3, warehouseId: 'jogja', toWarehouseId: 'sini', sourceSku: null, sourceQty: 0, reason: '', note: '', lines: [{ sku: 'D5', qty: 4, unitPrice: null }] },
        ],
        sales: { '2026-03-01': { date: '2026-03-01', source: '', rows: { D5: 7 } }, '2026-03-04': { date: '2026-03-04', source: '', rows: { D5: 3 } } },
      }),
    );
    expect(stockCalcWh(m, 'jogja').st.D5.now).toBe(10 + 5 - 4 - 3);
    expect(stockCalcWh(m, 'sini').st.D5.now).toBe(4);
  });
});

describe('HPP', () => {
  it('decant = HPP sumber ÷ (ml sumber × susut 95%) × ml decant + kemasan', () => {
    const m = buildOpsModel(
      ops({
        opnames: [{ date: '2026-03-01', warehouseId: 'jogja', final: true, counts: { FS100: 2, D5: 0 } }],
        movements: [
          { id: 'p', type: 'PRODUCTION', date: '2026-03-02', seq: 1, warehouseId: 'jogja', toWarehouseId: null, sourceSku: 'FS100', sourceQty: 1, reason: '', note: '', lines: [{ sku: 'D5', qty: 19, unitPrice: null }] },
        ],
      }),
    );
    const h = hppCalc(m);
    const expected = (300000 / (100 * 0.95)) * 5 + 2500;
    expect(h.D5.now).toBeCloseTo(expected, 6);
    expect(h.D5.theo).toBeCloseTo(expected, 6);
    expect(h.D5.basis).toBe('produksi');
  });

  it('fullsize: rata-rata bergerak dari HPP master pada stok opname + barang masuk berharga', () => {
    const m = buildOpsModel(
      ops({
        opnames: [{ date: '2026-03-01', warehouseId: 'jogja', final: true, counts: { FS100: 2 } }],
        movements: [
          { id: 'i', type: 'IN', date: '2026-03-05', seq: 1, warehouseId: 'jogja', toWarehouseId: null, sourceSku: null, sourceQty: 0, reason: '', note: '', lines: [{ sku: 'FS100', qty: 2, unitPrice: 340000 }] },
        ],
      }),
    );
    expect(hppCalc(m).FS100.now).toBe((2 * 300000 + 2 * 340000) / 4);
  });

  it('faktur SKU: harga per pcs termasuk porsi ongkir', () => {
    const r = invoiceUnitCosts({
      discIsPct: false,
      discValue: 0,
      extra: 30000,
      lines: [
        { kind: 'SKU', sku: 'A', name: '', account: null, qty: 2, price: 100000, disc: 0 },
        { kind: 'SKU', sku: 'B', name: '', account: null, qty: 1, price: 100000, disc: 0 },
      ],
    });
    expect(r).toEqual([
      { sku: 'A', qty: 2, unitPrice: 110000 },
      { sku: 'B', qty: 1, unitPrice: 110000 },
    ]);
  });
});

describe('marketplace', () => {
  const base: MarketplaceData = {
    stores: [store('s1')],
    orders: [
      { storeId: 's1', orderNo: 'A', ts: '2026-03-01T10:00', catalogKey: 'C', sku: 'X', name: 'C', qty: 1, subtotal: 30000 },
      { storeId: 's1', orderNo: 'A', ts: '2026-03-01T10:00', catalogKey: 'C', sku: 'Y', name: 'C', qty: 1, subtotal: 70000 },
    ],
    fees: { 's1|A': { admin: 8000, process: 1250, freeShip: 0, service: 0, tax: 0, other: 0, ams: 0, total: 0, settledAt: null } },
    catalogs: {},
    skus: { X: { name: 'X', cogs: 10000 }, Y: { name: 'Y', cogs: 20000 } },
    ads: [],
    adMap: {},
  };

  it('potongan persen dibagi sesuai porsi harga, biaya proses dibagi rata per item', () => {
    const [x, y] = enrich(base.orders, base, learnRates(base));
    expect([x.admin, y.admin]).toEqual([2400, 5600]);
    expect([x.process, y.process]).toEqual([625, 625]);
  });

  it('tarif efektif baru dipakai setelah minimal 5 pesanan aktual', () => {
    expect(learnRates(base).s1.source).toBe('cadangan');
    const many = { ...base, orders: [...base.orders], fees: { ...base.fees } };
    for (let i = 0; i < 4; i++) {
      many.orders.push({ ...base.orders[0], orderNo: 'N' + i });
      many.fees['s1|N' + i] = base.fees['s1|A'];
    }
    expect(learnRates(many).s1.source).toBe('efektif');
  });

  it('iklan katalog dibagi ke SKU sesuai porsi omzet', () => {
    const d = { ...base, ads: [{ storeId: 's1', from: '2026-03-01', to: '2026-03-01', adName: 'C', catalogKey: 'C', amount: 10000, sales: 0 }] };
    const r = compute(d, ['2026-03-01', '2026-03-01'], learnRates(d));
    const ads = Object.fromEntries(r.skus.map((s) => [s.sku, s.ads]));
    expect(ads).toEqual({ X: 3000, Y: 7000 });
  });

  it('"Biaya Isi Saldo Otomatis" tidak dipetakan ke komponen potongan mana pun', () => {
    const m = autoMap(['No. Pesanan', 'Biaya Isi Saldo Otomatis', 'Biaya Administrasi'], FEE_FIELDS);
    expect(Object.values(m)).not.toContain('Biaya Isi Saldo Otomatis');
    expect(m.admin).toBe('Biaya Administrasi');
  });
});

describe('marketing', () => {
  it('ROAS impas > 20x → stop iklan, perbaiki harga', () => {
    const agg = { omzet: 1_000_000, preAds: 40_000, be: 25, roasAd: 10, roas: 10, ads: 100_000 } as Parameters<typeof adsAction>[0];
    expect(adsAction(agg, undefined, 30).lvl).toBe('Stop');
  });
});

describe('finance', () => {
  it('total debit = total kredit untuk data apa pun (20 seed acak)', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const fx = buildFixture(seed);
      const mp = marketplaceFromHtml(fx.S);
      const fin = financeFromHtml(fx.docs, mp, fx.today);
      const L = buildLedger({ ...fin, marketplace: mp, rates: learnRates(mp) });
      for (const e of L.entries) {
        const d = e.lines.reduce((s, l) => s + l.d, 0);
        const c = e.lines.reduce((s, l) => s + l.c, 0);
        expect(Math.abs(d - c), `seed ${seed} ${e.ref}`).toBeLessThan(0.005);
      }
      expect(trialBalance(L).balanced).toBe(true);
    }
  });

  it('toko data contoh tidak masuk buku besar', () => {
    const fx = buildFixture(3);
    const mp = marketplaceFromHtml(fx.S);
    const fin = financeFromHtml(fx.docs, mp, fx.today);
    const L = buildLedger({ ...fin, marketplace: mp, rates: learnRates(mp) });
    expect(L.entries.some((e) => e.ref.includes('Contoh'))).toBe(false);
  });
});
