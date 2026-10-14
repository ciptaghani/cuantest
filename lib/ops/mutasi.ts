import type { DateKey } from '@/lib/date';
import { n0, rp } from '@/lib/format';
import type { OpsModel } from './model';

export interface MutationRow {
  d: DateKey;
  /** 1 = transaksi, 2 = penjualan, 3 = opname (urutan dalam satu tanggal). */
  ord: number;
  t: number;
  in: number;
  out: number;
  desc: string;
  note?: string;
  /** Hitung fisik (hanya baris opname). */
  opn?: number;
  wh: string;
  /** Saldo gudang setelah baris ini. */
  after: number;
  /** Saldo berjalan gabungan (diisi oleh `mutasi`). */
  saldo?: number;
}

/** Kartu stok satu SKU di satu gudang, termasuk penyesuaian opname. */
export function mutasiWh(m: OpsModel, sku: string, wh: string): MutationRow[] {
  type Ev = Omit<MutationRow, 'wh' | 'after'> & Partial<Pick<MutationRow, 'wh' | 'after'>>;
  const ev: Ev[] = [];
  const wn = m.whName(wh);
  for (const o of m.opnames) {
    const c = o.counts[sku];
    if (o.final && o.warehouseId === wh && c !== undefined && c !== null) ev.push({ d: o.date, ord: 3, t: 0, in: 0, out: 0, desc: '', opn: +c });
  }
  for (const e of m.movements) {
    const t = e.seq || 0;
    if (e.type === 'TRANSFER') {
      for (const o of e.lines)
        if (o.sku === sku) {
          if (e.warehouseId === wh) ev.push({ d: e.date, ord: 1, t, in: 0, out: +o.qty || 0, desc: 'Pindah ke ' + m.whName(e.toWarehouseId), note: e.note });
          if (e.toWarehouseId === wh) ev.push({ d: e.date, ord: 1, t, in: +o.qty || 0, out: 0, desc: 'Pindah dari ' + m.whName(e.warehouseId), note: e.note });
        }
      continue;
    }
    if (e.warehouseId !== wh) continue;
    if (e.type === 'OUT') {
      for (const o of e.lines) if (o.sku === sku) ev.push({ d: e.date, ord: 1, t, in: 0, out: +o.qty || 0, desc: 'Barang keluar' + (e.reason ? ' · ' + e.reason : ''), note: e.note });
      continue;
    }
    if (e.sourceSku === sku && +e.sourceQty)
      ev.push({
        d: e.date,
        ord: 1,
        t,
        in: 0,
        out: +e.sourceQty,
        desc: (e.type === 'SHIFT' ? 'Digeser ke ' : 'Dipakai produksi → ') + e.lines.map((o) => o.sku + ' ×' + n0(o.qty)).join(', '),
        note: e.note,
      });
    for (const o of e.lines)
      if (o.sku === sku)
        ev.push({
          d: e.date,
          ord: 1,
          t,
          in: +o.qty || 0,
          out: 0,
          desc:
            e.type === 'IN'
              ? 'Barang masuk' + (o.unitPrice != null ? ' @ ' + rp(o.unitPrice) : '')
              : (e.type === 'SHIFT' ? 'Geser dari ' : 'Produksi dari ') + e.sourceSku + ' ×' + n0(e.sourceQty),
          note: e.note,
        });
  }
  if (wh === m.config.salesWarehouseId)
    for (const d in m.sales) {
      const q = +m.sales[d].rows[sku] || 0;
      if (q) ev.push({ d, ord: 2, t: 0, in: 0, out: q, desc: 'Penjualan' + (m.sales[d].source ? ' · ' + m.sales[d].source : '') });
    }
  ev.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : a.ord - b.ord || (a.t || 0) - (b.t || 0)));
  let saldo = 0;
  for (const v of ev) {
    if (v.opn !== undefined) {
      const adj = v.opn - saldo;
      v.in = adj > 0 ? adj : 0;
      v.out = adj < 0 ? -adj : 0;
      v.desc = `Penyesuaian stock opname (hitung fisik ${n0(v.opn)})`;
      saldo = v.opn;
    } else saldo += v.in - v.out;
    v.wh = wn;
    v.after = saldo;
  }
  return ev as MutationRow[];
}

/** Kartu stok gabungan beberapa gudang dalam periode. */
export function mutasi(m: OpsModel, sku: string, from: DateKey, to: DateKey, warehouseIds: string[]): { open: number; rows: MutationRow[] } {
  let open = 0;
  const rows: MutationRow[] = [];
  for (const wh of warehouseIds) {
    const ev = mutasiWh(m, sku, wh);
    let o = 0;
    for (const v of ev) {
      if (v.d < from) o = v.after;
      else if (v.d <= to) rows.push(v);
    }
    open += o;
  }
  rows.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : a.ord - b.ord || (a.t || 0) - (b.t || 0)));
  let run = open;
  for (const r of rows) {
    run += r.in - r.out;
    r.saldo = run;
  }
  return { open, rows };
}
