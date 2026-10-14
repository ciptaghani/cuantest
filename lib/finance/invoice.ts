import type { DocLine, Payment, PurchaseDoc } from './types';

export interface DocLineTotal extends DocLine {
  /** qty × harga − diskon baris. */
  gross: number;
  /** Setelah diskon header dibagi proporsional. */
  net: number;
}

export interface DocTotals {
  lines: DocLineTotal[];
  sub: number;
  /** Diskon header (Rp). */
  hd: number;
  total: number;
}

/** Total faktur/PO: diskon baris, diskon header (Rp atau %), lalu ongkir. */
export function invTotals(v: Pick<PurchaseDoc, 'lines' | 'discIsPct' | 'discValue' | 'extra'>): DocTotals {
  const lines = v.lines
    .filter((l) => l && (l.sku || l.name))
    .map((l) => ({ ...l, gross: (+l.qty || 0) * (+l.price || 0) - (+l.disc || 0), net: 0 }));
  const sub = lines.reduce((a, l) => a + l.gross, 0);
  const hd = v.discIsPct ? (sub * (+v.discValue || 0)) / 100 : +v.discValue || 0;
  const total = Math.max(0, sub - hd) + (+v.extra || 0);
  for (const l of lines) l.net = sub ? l.gross * (1 - hd / sub) : 0;
  return { lines, sub, hd, total };
}

export function invPaid(payments: Payment[], invoiceId: string): number {
  return payments.filter((p) => p.kind === 'INVOICE' && p.invoiceId === invoiceId).reduce((a, p) => a + (+p.amount || 0), 0);
}

/** Sisa beban yang belum dibayar (pembayaran DP + pelunasan sisa). */
export function bebanRest(payments: Payment[], p: Payment): { tot: number; paid: number; rest: number } {
  const tot = p.lines.reduce((a, l) => a + (+l.amount || 0), 0);
  const paid = (+p.amount || 0) + payments.filter((x) => x.kind === 'EXPENSE_REMAINDER' && x.refPaymentId === p.id).reduce((a, x) => a + (+x.amount || 0), 0);
  return { tot, paid, rest: Math.max(0, tot - paid) };
}

/**
 * Harga per pcs untuk barang masuk dari faktur SKU: net baris + porsi ongkir, dibagi qty, dibulatkan 2 desimal.
 */
export function invoiceUnitCosts(v: Pick<PurchaseDoc, 'lines' | 'discIsPct' | 'discValue' | 'extra'>): { sku: string; qty: number; unitPrice: number }[] {
  const t = invTotals(v);
  const sku = t.lines.filter((l) => l.kind === 'SKU' && l.sku);
  const skuNet = sku.reduce((a, l) => a + l.net, 0);
  const ex = +v.extra || 0;
  return sku.map((l) => ({
    sku: l.sku as string,
    qty: +l.qty,
    unitPrice: Math.round(((l.net + (skuNet ? (ex * l.net) / skuNet : 0)) / (+l.qty || 1)) * 100) / 100,
  }));
}

export type PayMode = 'lunas' | 'dp';

export interface PayDraft {
  kind: Payment['kind'];
  mode: PayMode;
  dpType: 'rp' | 'pct';
  dpVal: number;
  /** EXPENSE */
  lines?: { amount: number }[];
  /** INVOICE */
  invoice?: PurchaseDoc;
  /** EXPENSE_REMAINDER */
  refPayment?: Payment;
  /** ADS_TOPUP / RECEIPT */
  amount?: number;
}

/** Nilai yang dibayar sekarang (lunas atau DP Rp/%), tidak melebihi sisa. */
export function payCalc(d: PayDraft, payments: Payment[]): { tot?: number; paid?: number; rest?: number; amt: number } {
  const dp = (base: number) => (d.dpType === 'pct' ? (base * (+d.dpVal || 0)) / 100 : +d.dpVal || 0);
  if (d.kind === 'EXPENSE') {
    const tot = (d.lines || []).reduce((a, l) => a + (+l.amount || 0), 0);
    const amt = d.mode === 'lunas' ? tot : dp(tot);
    return { tot, amt: Math.min(tot, amt) };
  }
  if (d.kind === 'INVOICE') {
    if (!d.invoice) return { tot: 0, amt: 0, rest: 0 };
    const t = invTotals(d.invoice);
    const paid = invPaid(payments, d.invoice.id);
    const rest = Math.max(0, t.total - paid);
    const amt = d.mode === 'lunas' ? rest : dp(t.total);
    return { tot: t.total, paid, rest, amt: Math.min(rest, amt) };
  }
  if (d.kind === 'EXPENSE_REMAINDER') {
    const r = d.refPayment ? bebanRest(payments, d.refPayment) : { rest: 0 };
    const amt = d.mode === 'lunas' ? r.rest : dp(r.rest);
    return { tot: r.rest, amt: Math.min(r.rest, amt) };
  }
  return { amt: +(d.amount || 0) };
}

/** Nomor dokumen berikutnya: PREFIX/YYYYMM/001. */
export function nextDocNumber(existing: string[], prefix: string, date: string): string {
  const ym = date.slice(0, 7).replace('-', '');
  const n = existing.filter((no) => no.startsWith(`${prefix}/${ym}`)).length + 1;
  return `${prefix}/${ym}/${String(n).padStart(3, '0')}`;
}
