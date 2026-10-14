/**
 * Tes parity: hasil lib/ TypeScript harus sama dengan fungsi asli di reference/cuan-lens.html
 * untuk data yang sama (selisih uang ≤ Rp1).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { buildLedger, cashFlow, glAgg, invTotals, profitLoss, restockSchedule, settlement, sortRestockRows, trialBalance } from '@/lib/finance';
import { adsAction, adsWeekly, bcgItems, mkAdvice, mkRanges, planSuggest, scaleCandidates } from '@/lib/marketing';
import { autoMatchAll, bestCatalog, compute, currentRange, dataRange, learnRates, type MarketplaceData, type StoreRate } from '@/lib/marketplace';
import { financeFromHtml, marketplaceFromHtml, opsFromHtml } from '@/lib/migrate/fromHtml';
import { autoMap, num, parseTs, SKU_FIELDS, ORDER_FIELDS } from '@/lib/parse';
import {
  avgDaily,
  buildDailySales,
  buildOpsModel,
  convRatio,
  decantsOf,
  geserTargets,
  hppCalc,
  mutasi,
  mutasiWh,
  stockCalc,
  stockCalcWh,
  taskRows,
  umurStok,
  type OpsModel,
} from '@/lib/ops';
import { buildFixture, TODAY, type HtmlFixture } from './fixture';
import { near, nearFields } from './compare';
import { loadHtml, plain, type HtmlRuntime } from './htmlRuntime';

const AGG = ['omzet', 'hpp', 'ads', 'adSales', 'qty', 'lineN', 'estN', 'orderN', 'admin', 'ams', 'mp', 'cost', 'gp', 'preAds', 'net', 'margin', 'roas', 'roasAd', 'be', 'estPct'];
// nama komponen potongan HTML → lib
const FEE_PAIRS: [string, string][] = [
  ['admin', 'admin'],
  ['proses', 'process'],
  ['ongkir', 'freeShip'],
  ['layanan', 'service'],
  ['pajak', 'tax'],
  ['lain', 'other'],
  ['ams', 'ams'],
];

type H = Record<string, unknown>;

let fx: HtmlFixture;
let html: HtmlRuntime;
let mp: MarketplaceData;
let rates: Record<string, StoreRate>;
let model: OpsModel;
let fin: ReturnType<typeof financeFromHtml>;

beforeAll(async () => {
  fx = buildFixture();
  // 1) Bangkitkan penjualan harian seperti tombol "Kirim penjualan ke Operasional" di HTML.
  const pre = loadHtml(fx);
  await pre.call<Promise<number>>('opPushSales(null)');
  const writes = (pre.out.writes || {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(writes)) fx.docs[k] = v as Record<string, unknown>;
  expect(Object.keys(writes).length).toBeGreaterThan(30);
  // 2) Pencocokan iklan otomatis (sama seperti saat impor di HTML).
  html = loadHtml(fx);
  html.call('autoMatchAll()');
  mp = marketplaceFromHtml(fx.S);
  mp.adMap = autoMatchAll(mp.ads, mp.catalogs, mp.adMap);
  rates = learnRates(mp);
  html.call('learnRates()');
  model = buildOpsModel(opsFromHtml(fx.docs, TODAY));
  fin = financeFromHtml(fx.docs, mp, TODAY);
});

describe('fixture menyentuh cabang penting (supaya parity tidak lolos karena data kosong)', () => {
  it('cakupan data', () => {
    const r = compute(mp, ['2026-01-01', '2026-03-31'], rates);
    expect(r.lines.length).toBeGreaterThan(300);
    expect(r.lines.some((l) => l.src === 'aktual') && r.lines.some((l) => l.src === 'estimasi')).toBe(true);
    expect(r.lines.some((l) => l.flags.some((f) => f[1] === 'HPP kosong'))).toBe(true);
    expect(r.lines.some((l) => l.flags.some((f) => f[1] === 'Jual < HPP'))).toBe(true);
    expect(r.catalogs.some((c) => c.poolAds > 0)).toBe(true);
    expect(Object.values(mp.fees).some((f) => f.admin === 0 && f.total > 0)).toBe(true);
    expect(Object.values(mp.adMap).some((m) => m.catalogKey === '' && !m.manual)).toBe(true);
    const h = hppCalc(model);
    const bases = new Set(Object.values(h).map((x) => x.basis));
    for (const b of ['master', 'restock', 'produksi', 'geser']) expect(bases.has(b as never), b).toBe(true);
    expect(new Set(taskRows(model).map((t) => t.prio)).size).toBeGreaterThanOrEqual(3);
    expect(new Set(taskRows(model).map((t) => t.fsSt)).size).toBeGreaterThanOrEqual(3);
    expect(new Set(umurStok(model).rows.map((t) => t.status)).size).toBeGreaterThanOrEqual(3);
    expect(model.movements.filter((m) => m.type === 'TRANSFER').length).toBeGreaterThan(3);
    const st = settlement(mp, rates, '2026-01-01', '2026-03-31', TODAY);
    expect(st.settled.length).toBeGreaterThan(10);
    expect(st.late.length).toBeGreaterThan(0);
    expect(st.noDate).toBeGreaterThan(0);
    const rs = restockSchedule(model, [...fin.purchaseOrders, ...fin.invoices]).rows;
    expect(new Set(rs.map((x) => x.priority)).size).toBeGreaterThanOrEqual(3);
    expect(rs.some((x) => x.supplier)).toBe(true);
  });
});

describe('parse', () => {
  it('num & parseTs sama dengan HTML', () => {
    const cases: unknown[] = ['Rp1.234.567', '1,234.50', '12,5', ' 7 ', '', null, 42, 'abc', '-1.000', 'IDR 2.500,75'];
    for (const c of cases) expect(num(c), String(c)).toBe(html.call(`num(${JSON.stringify(c)})`));
    const ts: unknown[] = ['2026-01-05 13:45', '05/01/2026 08:03', '2026/1/5', 46027.5, 'kemarin', '31-12-2025'];
    for (const c of ts) expect(parseTs(c), String(c)).toBe(html.call(`parseTs(${JSON.stringify(c)})`));
  });

  it('autoMap menebak kolom seperti HTML', () => {
    const headers = ['No. Pesanan', 'Waktu Pesanan Dibuat', 'Nama Produk', 'Nomor Referensi SKU', 'Nama Variasi', 'Jumlah', 'Total Harga Produk', 'Status Pesanan', 'SKU Induk'];
    const h = plain<H>(html.call(`autoMap(${JSON.stringify(headers)},ORD_F_TEST)`.replace('ORD_F_TEST', JSON.stringify(ORDER_FIELDS))));
    expect(autoMap(headers, ORDER_FIELDS)).toEqual(h);
    const sh = ['Master SKU', 'Nama Produk (Key)', 'COGS (Rp)', 'Brand', 'Ukuran (ml)', 'Harga Jual (Rp)'];
    expect(autoMap(sh, SKU_FIELDS)).toEqual(plain<H>(html.call(`autoMap(${JSON.stringify(sh)},${JSON.stringify(SKU_FIELDS)})`)));
  });
});

describe('marketplace', () => {
  it('pencocokan iklan → katalog', () => {
    const hMap = plain<Record<string, unknown>>(html.call('S.adMap'));
    for (const [k, v] of Object.entries(hMap)) {
      if (k.startsWith('_m')) continue;
      expect(mp.adMap[k]?.catalogKey ?? '', k).toBe(v);
    }
    expect(bestCatalog(mp.catalogs, 's1', 'HMNS Alpha Decant Parfume 5ml')).toBe(html.call(`bestCat('s1','HMNS Alpha Decant Parfume 5ml')`));
    expect(bestCatalog(mp.catalogs, 's1', 'Iklan toko umum ramadhan')).toBe('');
  });

  it('tarif efektif (≥ 5 pesanan aktual) vs cadangan', () => {
    const h = plain<Record<string, H>>(html.call('RATES'));
    expect(rates.s1.source).toBe('efektif');
    expect(rates.s2.source).toBe('cadangan');
    for (const id of Object.keys(h)) {
      expect(rates[id].source).toBe(h[id].src);
      expect(rates[id].n).toBe(h[id].n);
      for (const [hk, lk] of FEE_PAIRS) near(rates[id][lk as keyof StoreRate], h[id][hk], `${id}.${lk}`, 1e-9);
    }
  });

  it('dataRange & currentRange', () => {
    expect(dataRange(mp)).toEqual(plain(html.call('dataRange()')));
    for (const p of ['7', '30', 'all'] as const) {
      html.call(`UI.period=${JSON.stringify(p)}`);
      expect(currentRange(mp, p), p).toEqual(plain(html.call('currentRange()')));
    }
  });

  const ranges: [string, string][] = [
    ['2026-01-01', '2026-03-31'],
    ['2026-03-01', '2026-03-31'],
    ['2026-02-10', '2026-02-10'],
  ];
  const filters: { channel?: '' | 'shopee' | 'tiktok'; storeId?: string; brand?: string }[] = [{}, { channel: 'tiktok' }, { storeId: 's1' }, { brand: 'smolify.id' }];

  for (const range of ranges)
    for (const f of filters)
      it(`compute ${range.join('…')} ${JSON.stringify(f)}`, () => {
        html.call(`UI.channel=${JSON.stringify(f.channel || '')};UI.brand=${JSON.stringify(f.brand || '')};UI.store=${JSON.stringify(f.storeId || '')}`);
        const h = plain<H & { T: H; cats: H[]; skus: H[]; stores: H[]; lines: H[]; adDaily: Record<string, number> }>(html.call(`compute(${JSON.stringify(range)})`));
        const r = compute(mp, range, rates, f);
        nearFields(r.total as unknown as H, h.T, [...AGG, 'unalloc'], 'T');
        for (const [hk, lk] of FEE_PAIRS) near(r.total[lk as 'admin'], h.T[hk], `T.${lk}`);
        expect(r.lines.length).toBe(h.lines.length);
        r.lines.forEach((l, i) => {
          const hl = h.lines[i];
          nearFields(l as unknown as H, hl, ['hpp', 'mp', 'pre', 'unit'], `line${i}`);
          for (const [hk, lk] of FEE_PAIRS) near(l[lk as 'admin'], hl[hk], `line${i}.${lk}`);
          expect(l.src).toBe(hl.src);
          expect(l.flags).toEqual(hl.flags);
        });
        expect(r.catalogs.length).toBe(h.cats.length);
        const hc = Object.fromEntries(h.cats.map((c) => [c.key as string, c]));
        for (const c of r.catalogs) {
          nearFields(c as unknown as H, hc[c.key], AGG, `cat ${c.key}`);
          near(c.poolAds, hc[c.key].poolAds ?? 0, `cat ${c.key}.poolAds`);
          expect([...c.skuCodes].sort()).toEqual([...((hc[c.key].skuSet as string[]) || [])].sort());
          expect(c.noHpp).toBe(hc[c.key].noHpp);
        }
        const hs = Object.fromEntries(h.skus.map((c) => [c.key as string, c]));
        expect(r.skus.length).toBe(h.skus.length);
        for (const s of r.skus) nearFields(s as unknown as H, hs[s.key], AGG, `sku ${s.key}`);
        const hst = Object.fromEntries(h.stores.map((c) => [c.id as string, c]));
        for (const s of r.stores) nearFields(s as unknown as H, hst[s.id], AGG, `store ${s.id}`);
        expect(Object.keys(r.adDaily).sort()).toEqual(Object.keys(h.adDaily).sort());
        for (const d in r.adDaily) near(r.adDaily[d], h.adDaily[d], `adDaily ${d}`);
      });
});

describe('operasional', () => {
  it('kategori SKU & sumber fullsize', () => {
    const h = plain<H & { skus: Record<string, H>; mainSrc: H; autoSrc: H }>(html.call('opModel()'));
    for (const code in model.skuMap) expect(model.skuMap[code].category, code).toBe(h.skus[code].cat);
    expect(model.mainSrc).toEqual(h.mainSrc);
    expect(model.autoSrc).toEqual(h.autoSrc);
    expect(model.mainSrc['HMNS||Orevall']).toBe('HMNS-ORV-50'); // override
    expect(model.autoSrc['HMNS||Orevall']).toBe('HMNS-ORV-100'); // terbesar
  });

  it('stok per gudang (opname dasar, transaksi di tanggal opname, pindah gudang)', () => {
    for (const wh of ['jogja', 'sini', 'rembang']) {
      const h = plain<H & { B: string; st: Record<string, H> }>(html.call(`stockCalcWh(opModel(),${JSON.stringify(wh)})`));
      const r = stockCalcWh(model, wh);
      expect(r.baseDate, wh).toBe(h.B);
      expect(Object.keys(r.st).sort()).toEqual(Object.keys(h.st).sort());
      for (const s in r.st) nearFields(r.st[s] as unknown as H, h.st[s], ['base', 'in', 'use', 'sold', 'out', 'now'], `${wh}.${s}`, 1e-9);
    }
    // stok per tanggal tertentu
    const at = '2026-02-20';
    const h = plain<{ st: Record<string, H> }>(html.call(`stockCalc(opModel(),${JSON.stringify(at)})`));
    const r = stockCalc(model, at);
    for (const s in h.st) near(r.st[s].now, h.st[s].now, `at ${s}`, 1e-9);
    // opname final setelah hari ini tidak dipakai
    expect(stockCalcWh(model, 'jogja').baseDate).toBe('2026-01-31');
  });

  it('HPP rata-rata bergerak & HPP decant', () => {
    const h = plain<Record<string, H>>(html.call('hppCalc(opModel())'));
    const r = hppCalc(model);
    for (const s in h) {
      nearFields(r[s] as unknown as H, h[s], ['now', 'n'], s);
      expect(r[s].basis, s).toBe(h[s].basis);
      if (h[s].theo === null) expect(r[s].theo).toBeNull();
      else near(r[s].theo, h[s].theo, `${s}.theo`);
      expect(r[s].pack).toEqual(h[s].pack);
    }
  });

  it('rata-rata jual harian & task produksi', () => {
    const ha = plain<H & { avg: H }>(html.call('avgDaily(opModel())'));
    const ra = avgDaily(model);
    expect(ra.span).toBe(ha.span);
    expect(ra.ok).toBe(ha.ok);
    for (const s in ha.avg) near(ra.avg[s], ha.avg[s], s, 1e-9);
    const ht = plain<H[]>(html.call('taskRows(opModel())'));
    const rt = taskRows(model);
    expect(rt.length).toBe(ht.length);
    rt.forEach((t, i) => {
      expect(t.code).toBe(ht[i].sku);
      nearFields(t as unknown as H, ht[i], ['a', 'stock', 'min', 'buf', 'rop', 'kurang', 'r', 'need', 'fsStock'], t.code, 1e-9);
      expect(t.prio, t.code).toBe(ht[i].prio);
      expect(t.fsSt, t.code).toBe(ht[i].fsSt);
      expect(t.fs).toBe(ht[i].fs);
    });
  });

  it('decantsOf / geserTargets / convRatio', () => {
    for (const src of ['HMNS-ORV-100', 'HMNS-ORV-50', 'HMNS-ORV-10', 'KONOS-UTO-50', 'BKT-MINI']) {
      expect(decantsOf(model, src).map((x) => x.code), src).toEqual(plain<H[]>(html.call(`decantsOf(opModel(),${JSON.stringify(src)})`)).map((x) => x.sku));
      expect(geserTargets(model, src).map((x) => x.code), src).toEqual(plain<H[]>(html.call(`geserTargets(opModel(),${JSON.stringify(src)})`)).map((x) => x.sku));
      for (const t of ['HMNS-ORV-2', 'HMNS-ORV-5', 'KONOS-UTO-2'])
        expect(convRatio(model, model.skuMap[src], model.skuMap[t]), `${src}→${t}`).toBe(
          html.call(`(()=>{const m=opModel();return convRatio(m,m.skus[${JSON.stringify(src)}],m.skus[${JSON.stringify(t)}])})()`),
        );
    }
  });

  it('kartu stok (mutasi) multi gudang', () => {
    for (const sku of ['HMNS-ORV-5', 'HMNS-ORV-50', 'KONOS-UTO-2']) {
      for (const wh of ['jogja', 'sini']) {
        const h = plain<H[]>(html.call(`mutasiWh(opModel(),${JSON.stringify(sku)},${JSON.stringify(wh)})`));
        const r = mutasiWh(model, sku, wh);
        expect(r.length, `${sku}@${wh}`).toBe(h.length);
        r.forEach((v, i) => {
          nearFields(v as unknown as H, h[i], ['in', 'out', 'after'], `${sku}@${wh}#${i}`, 1e-9);
          expect(v.desc).toBe(h[i].desc);
          expect(v.d).toBe(h[i].d);
        });
      }
      const h = plain<{ open: number; rows: H[] }>(html.call(`mutasi(opModel(),${JSON.stringify(sku)},'2026-02-01','2026-03-15',['jogja','sini','rembang'])`));
      const r = mutasi(model, sku, '2026-02-01', '2026-03-15', ['jogja', 'sini', 'rembang']);
      near(r.open, h.open, `${sku} open`, 1e-9);
      expect(r.rows.map((x) => x.saldo)).toEqual(h.rows.map((x) => x.saldo));
    }
  });

  it('umur stok (status Restock/Produksi/Sales/Safe)', () => {
    html.call('pgAge(opModel())');
    const h = plain<{ rows: H[]; span: number }>(html.out.age);
    const r = umurStok(model);
    expect(r.span).toBe(h.span);
    expect(r.rows.length).toBe(h.rows.length);
    r.rows.forEach((x, i) => {
      expect(x.code).toBe(h.rows[i].sku);
      expect(x.status, x.code).toBe(h.rows[i].status);
      expect(x.saran, x.code).toBe(h.rows[i].saran);
      nearFields(x as unknown as H, h.rows[i], ['stock', 'avg', 'age', 'noSale'], x.code, 1e-9);
    });
  });

  it('penjualan harian dibangkitkan dari pesanan', () => {
    const by = buildDailySales(mp.orders, mp.stores);
    for (const [d, rows] of Object.entries(by)) expect(rows, d).toEqual((fx.docs[`sales/${d}`] as { rows: unknown }).rows);
    expect(Object.keys(by).length).toBe(Object.keys(fx.docs).filter((k) => k.startsWith('sales/')).length);
  });
});

describe('finance', () => {
  const ledger = () =>
    buildLedger({
      start: fin.start,
      accounts: fin.accounts,
      opening: fin.opening,
      marketplace: mp,
      rates,
      walletOf: fin.walletOf,
      invoices: fin.invoices,
      payments: fin.payments,
      transfers: fin.transfers,
    });

  it('total faktur (diskon baris, diskon %, ongkir)', () => {
    for (const v of fin.invoices) {
      const h = plain<H>(html.call(`invTotals(OP.docs['fin/main/inv/${v.id}'])`));
      const r = invTotals(v);
      nearFields(r as unknown as H, h, ['sub', 'hd', 'total'], v.number, 1e-9);
    }
  });

  it('buku besar sama dengan HTML dan seimbang', () => {
    const h = plain<{ E: { date: string; ref: string; kind: string; lines: { acc: string; d: number; c: number }[] }[] }>(html.call('finLedger()'));
    const L = ledger();
    expect(L.entries.length).toBe(h.E.length);
    const code = (id: string) => fin.idToCode[id] ?? id;
    L.entries.forEach((e, i) => {
      const he = h.E[i];
      expect([e.date, e.ref, e.kind]).toEqual([he.date, he.ref, he.kind]);
      const sum = (ls: { acc: string; d: number; c: number }[]) => {
        const o: Record<string, number> = {};
        for (const l of ls) o[l.acc] = (o[l.acc] || 0) + l.d - l.c;
        return o;
      };
      const a = sum(e.lines);
      const b = sum(he.lines.map((l) => ({ ...l, acc: code(l.acc) })));
      expect(Object.keys(a).sort(), e.ref).toEqual(Object.keys(b).sort());
      for (const k in a) near(a[k], b[k], `${e.ref}.${k}`, 0.05);
    });
    const tb = trialBalance(L);
    expect(tb.balanced).toBe(true);
    expect(Math.abs(tb.debit - tb.credit)).toBeLessThan(0.005);
  });

  for (const [from, to] of [
    ['2026-01-01', '2026-01-31'],
    ['2026-02-01', '2026-03-31'],
    ['2026-01-01', '2026-03-31'],
  ])
    it(`buku besar, laba rugi, arus kas ${from}…${to}`, () => {
      const L = ledger();
      const hGl = plain<Record<string, H>>(html.call(`glAgg(finLedger(),'${from}','${to}')`));
      const gl = glAgg(L, from, to);
      for (const [id, x] of Object.entries(hGl)) nearFields(gl[fin.idToCode[id] ?? id] as unknown as H, x, ['open', 'd', 'c', 'end'], id);

      html.call(`FN.ui.pl.from='${from}';FN.ui.pl.to='${to}';FN.ui.cf.from='${from}';FN.ui.cf.to='${to}'`);
      try {
        html.call('fnPL()');
      } catch {
        /* render HTML boleh gagal; angka sudah diambil */
      }
      const hp = plain<{ P: H; H: H; B: H; PL: H; BL: H; kotor: number; op: number; non: number; net: number }>(html.out.pl);
      const pl = profitLoss(L, fin.accounts, from, to);
      near(pl.revenue.total, hp.P.t, 'pendapatan');
      near(pl.cogs.total, hp.H.t, 'hpp');
      near(pl.expense.total, hp.B.t, 'beban');
      near(pl.otherIncome.total, hp.PL.t, 'pendapatan lain');
      near(pl.otherExpense.total, hp.BL.t, 'beban lain');
      near(pl.grossProfit, hp.kotor, 'laba kotor');
      near(pl.operatingProfit, hp.op, 'laba operasional');
      near(pl.netProfit, hp.net, 'laba bersih');

      try {
        html.call('fnCF()');
      } catch {
        /* idem */
      }
      const hc = plain<{ open: number; end: number; O: number; I: number; F: number; drift: number }>(html.out.cf);
      const cf = cashFlow(L, fin.accounts, from, to);
      near(cf.open, hc.open, 'kas awal');
      near(cf.end, hc.end, 'kas akhir');
      near(cf.sections.op.total, hc.O, 'operasi');
      near(cf.sections.inv.total, hc.I, 'investasi');
      near(cf.sections.fin.total, hc.F, 'pendanaan');
      near(cf.drift, hc.drift, 'drift');
    });

  it('settlement', () => {
    html.call(`FN.ui.st.from='2026-02-01';FN.ui.st.to='2026-03-31'`);
    try {
      html.call('fnSt()');
    } catch {
      /* idem */
    }
    const h = plain<{ inP: H[]; un: H[]; late: H[]; per: H[]; noDate: number }>(html.out.st);
    const r = settlement(mp, rates, '2026-02-01', '2026-03-31', TODAY);
    expect(r.settled.length).toBe(h.inP.length);
    expect(r.unsettled.length).toBe(h.un.length);
    expect(r.late.length).toBe(h.late.length);
    expect(r.noDate).toBe(h.noDate);
    r.perStore.forEach((p, i) => {
      near(p.settled, h.per[i].set, `${p.store.id}.set`);
      near(p.unsettled, h.per[i].un, `${p.store.id}.un`);
      expect(p.oldest).toBe(h.per[i].old);
    });
    const hm = Object.fromEntries(h.inP.map((o) => [o.k as string, o]));
    for (const o of r.settled) nearFields(o as unknown as H, hm[o.key], ['sub', 'fee', 'net'], o.key);
  });

  it('schedule restock', () => {
    html.call(`FN.ui.rs.all=true;FN.ui.rs.cover=30;FN.ui.rs.brand='';FN.ui.rs.sup='';FN.ui.rs.pr='';FN.ui.rs.q=''`);
    try {
      html.call('fnRs()');
    } catch {
      /* idem */
    }
    const h = plain<H[]>(html.call('FN._rsRows'));
    const r = sortRestockRows(restockSchedule(model, [...fin.purchaseOrders, ...fin.invoices], 30).rows);
    expect(r.length).toBe(h.length);
    r.forEach((x, i) => {
      expect(x.code).toBe(h[i].sku);
      expect(x.priority, x.code).toBe(h[i].pr);
      expect(x.when).toBe(h[i].when);
      expect(x.supplier).toBe(h[i].sup);
      nearFields(x as unknown as H, h[i], ['stock', 'avg', 'lt', 'need', 'price', 'cost', 'viaDecant', 'days'], x.code);
    });
  });
});

describe('marketing', () => {
  it('saran dashboard, saran iklan, BCG (katalog & SKU)', () => {
    const end = dataRange(mp)[1] as string;
    for (const days of [7, 30]) {
      const { cur, prev } = mkRanges(days, end);
      expect([cur, prev]).toEqual(plain(html.call(`(()=>{const r=mkRanges(${days});return [r.cur,r.prev]})()`)));
      for (const store of ['', 's1']) {
        const R = compute(mp, cur, rates, { storeId: store });
        const P = compute(mp, prev, rates, { storeId: store });
        const st = stockCalc(model).st;
        for (const kind of ['kat', 'sku'] as const) {
          const list = kind === 'kat' ? R.catalogs : R.skus;
          const pm = Object.fromEntries((kind === 'kat' ? P.catalogs : P.skus).map((x) => [x.key, x]));
          const h = plain<{ key: string; A: unknown[] }[]>(
            html.call(`(()=>{const R=mkCompute(${JSON.stringify(cur)},${JSON.stringify(store)}),P=mkCompute(${JSON.stringify(prev)},${JSON.stringify(store)}),st=stockCalc(opModel()).st,pm={};
              (${JSON.stringify(kind)}==='kat'?P.cats:P.skus).forEach(x=>pm[x.key]=x);
              return (${JSON.stringify(kind)}==='kat'?R.cats:R.skus).map(x=>({key:x.key,A:mkAdvice(x,pm[x.key],${JSON.stringify(kind)},${days},st)}))})()`),
          );
          const mine = list.map((x) => ({ key: x.key, A: mkAdvice(x, pm[x.key], kind, days, st, 12) }));
          expect(mine).toEqual(h);
        }
        const ha = plain<{ key: string; s: H }[]>(
          html.call(`(()=>{const R=mkCompute(${JSON.stringify(cur)},${JSON.stringify(store)}),P=mkCompute(${JSON.stringify(prev)},${JSON.stringify(store)}),pm={};P.cats.forEach(x=>pm[x.key]=x);
            return R.cats.filter(x=>x.ads>0).map(x=>({key:x.key,s:adsAction(x,pm[x.key],${days})}))})()`),
        );
        const pm = Object.fromEntries(P.catalogs.map((x) => [x.key, x]));
        const ra = R.catalogs.filter((x) => x.ads > 0).map((x) => ({ key: x.key, s: adsAction(x, pm[x.key], days) }));
        expect(ra.length).toBe(ha.length);
        ra.forEach((x, i) => {
          expect(x.key).toBe(ha[i].key);
          expect([x.s.a, x.s.cls, x.s.lvl]).toEqual([ha[i].s.a, ha[i].s.cls, ha[i].s.lvl]);
          near(x.s.tr ?? NaN, (ha[i].s.tr as number | null) ?? NaN, `${x.key}.tr`, 1e-9);
        });
        if (store) {
          const b = bcgItems(R.catalogs, P.catalogs);
          const hb = plain<{ key: string; q: string; g: number; share: number }[]>(
            html.call(`(()=>{const R=mkCompute(${JSON.stringify(cur)},'s1'),P=mkCompute(${JSON.stringify(prev)},'s1'),pm={};P.cats.forEach(x=>pm[x.key]=x);
              const L=R.cats.filter(x=>x.omzet>0),tot=L.reduce((a,x)=>a+x.omzet,0);
              const items=L.map(x=>{const p=pm[x.key],g=p&&p.omzet?(x.omzet-p.omzet)/p.omzet:1;return {key:x.key,g:Math.max(-1,Math.min(2,g)),share:tot?x.omzet/tot:0}});
              const sx=items.length?1/items.length:0;items.forEach(i=>{i.q=i.share>=sx?(i.g>=.1?'star':'cow'):(i.g>=.1?'q':'dog')});return items})()`),
          );
          expect(b.items.map((i) => [i.x.key, i.q])).toEqual(hb.map((i) => [i.key, i.q]));
        }
      }
    }
  });

  it('iklan mingguan & saran kalender', () => {
    for (const store of ['', 's2']) {
      const h = plain<[string, H][]>(html.call(`adsWeekly(${JSON.stringify(store)})`));
      const r = adsWeekly(mp.ads, mp.stores, store);
      expect(r.map((w) => w[0])).toEqual(h.map((w) => w[0]));
      r.forEach((w, i) => nearFields(w[1] as unknown as H, h[i][1], ['spend', 'sales'], w[0]));
    }
    const end = dataRange(mp)[1] as string;
    const { cur, prev } = mkRanges(30, end);
    const scale = scaleCandidates(compute(mp, cur, rates), compute(mp, prev, rates), 30);
    for (const month of ['2026-03', '2026-02', '2026-12']) expect(planSuggest(month, scale), month).toEqual(plain(html.call(`planSuggest(${JSON.stringify(month)})`)));
  });
});
