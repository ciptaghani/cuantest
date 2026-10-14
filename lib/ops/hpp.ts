import type { OpsModel } from './model';
import { variantKey } from './types';

export interface HppRow {
  /** HPP sekarang. */
  now: number;
  /** Jumlah penerimaan yang membentuk rata-rata. */
  n: number;
  basis: 'master' | 'restock' | 'produksi' | 'geser';
  /** SKU sumber terakhir (produksi/geser). */
  from: string;
  /** HPP teoritis decant dari HPP sumber fullsize sekarang. */
  theo: number | null;
  /** Biaya kemasan decant. */
  pack: number | null;
}

/**
 * HPP rata-rata bergerak.
 * - Mulai dari HPP master × stok opname final terakhir tiap gudang.
 * - Barang masuk berharga & hasil produksi/geser menambah rata-rata.
 * - Decant = HPP sumber ÷ (ml sumber × susut) × ml decant + biaya kemasan.
 */
export function hppCalc(m: OpsModel): Record<string, HppRow> {
  const y = m.yieldFrac;
  const bs = m.warehouses
    .map((w) => m.opnames.filter((o) => o.final && o.warehouseId === w.id && o.date <= m.today).pop())
    .filter((o): o is NonNullable<typeof o> => !!o);
  const B = bs.length ? bs.map((b) => b.date).sort()[0] : '0000-00-00';
  const q0 = (s: string) => bs.reduce((a, b) => a + (b.counts[s] != null ? Math.max(0, +(b.counts[s] as number) || 0) : 0), 0);
  type X = { qty: number; avg: number; n: number; basis: HppRow['basis'] | ''; last: number | null; from: string };
  const X: Record<string, X> = {};
  const g = (s: string) => (X[s] ||= { qty: q0(s), avg: m.skuMap[s] ? m.skuMap[s].cogs : 0, n: 0, basis: '', last: null, from: '' });

  type Ev = { d: string; t: number; e?: (typeof m.movements)[number]; s?: Record<string, number> };
  const ev: Ev[] = [];
  for (const e of m.movements) if (e.date > B) ev.push({ d: e.date, t: e.seq || 0, e });
  for (const d in m.sales) if (d > B) ev.push({ d, t: 9e15, s: m.sales[d].rows });
  ev.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : a.t - b.t));

  const recv = (s: string, q: number, cost: number, basis: HppRow['basis'], from?: string) => {
    const x = g(s);
    if (!(q > 0)) return;
    x.avg = x.qty <= 0 ? cost : (x.qty * x.avg + q * cost) / (x.qty + q);
    x.qty += q;
    x.n++;
    x.basis = basis;
    x.last = cost;
    x.from = from || '';
  };

  for (const v of ev) {
    if (v.s) {
      for (const s in v.s) g(s).qty -= +v.s[s] || 0;
      continue;
    }
    const e = v.e!;
    if (e.type === 'TRANSFER') continue;
    if (e.type === 'OUT') {
      for (const o of e.lines) if (o.sku) g(o.sku).qty -= +o.qty || 0;
      continue;
    }
    if (e.type === 'IN') {
      for (const o of e.lines) {
        if (!o.sku) continue;
        if (o.unitPrice === null || o.unitPrice === undefined) g(o.sku).qty += +o.qty || 0;
        else recv(o.sku, +o.qty || 0, +o.unitPrice, 'restock');
      }
      continue;
    }
    // PRODUCTION / SHIFT
    const srcCode = e.sourceSku || '';
    const src = m.skuMap[srcCode];
    const sx = g(srcCode);
    const perMl = src && src.ml ? sx.avg / (src.ml * y) : 0;
    sx.qty -= +e.sourceQty || 0;
    for (const o of e.lines) {
      const t = m.skuMap[o.sku];
      if (!t || !src) continue;
      const r = m.packRule(src.brand, src.ml, t.ml);
      recv(o.sku, +o.qty || 0, perMl * t.ml + (r ? m.packCost(r.packId) : 0), e.type === 'SHIFT' ? 'geser' : 'produksi', srcCode);
    }
  }

  const out: Record<string, HppRow> = {};
  for (const s in m.skuMap) {
    const sk = m.skuMap[s];
    const x = X[s];
    let theo: number | null = null;
    let pack: number | null = null;
    if (sk.category === 'Decant') {
      const fs = m.mainSrc[variantKey(sk.brand, sk.product)];
      const f = fs ? m.skuMap[fs] : undefined;
      if (f && f.ml) {
        const fa = X[fs] && X[fs].n ? X[fs].avg : f.cogs;
        const r = m.ruleFor(f.brand, f.ml, sk.ml);
        pack = r ? m.packCost(r.packId) : 0;
        theo = (fa / (f.ml * y)) * sk.ml + pack;
      }
    }
    out[s] = {
      now: x && x.n ? x.avg : sk.cogs,
      n: x ? x.n : 0,
      basis: x && x.n ? (x.basis as HppRow['basis']) : 'master',
      from: x ? x.from : '',
      theo,
      pack,
    };
  }
  return out;
}
