/**
 * Konversi data versi HTML (state Marketplace `cuanlens-v2` + dokumen database artifact)
 * ke tipe domain di lib/. Dipakai oleh tes parity dan skrip migrasi (Fase 9).
 */
import type { DateKey } from '@/lib/date';
import { ACC, adsAccountFor, type AccountType, type DocLine, type FinAccount, type Payment, type PaymentKind, type PurchaseDoc, type Transfer } from '@/lib/finance/types';
import type { AdMatch, AdRecord, Channel, MarketplaceData, OrderFee, OrderLine, Store } from '@/lib/marketplace/types';
import type { ConversionRule, DailySales, Movement, MovementType, Opname, OpsConfig, OpsInput, OpsSku, Pack, Warehouse } from '@/lib/ops/types';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const obj = (v: unknown): Obj => (isObj(v) ? v : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (v == null ? '' : String(v));
const n = (v: unknown): number => +(v as number) || 0;
const optNum = (v: unknown): number | null => (v === undefined || v === null || v === '' ? null : +(v as number));

export interface HtmlExport {
  /** localStorage `cuanlens-v2` */
  S: unknown;
  /** dokumen database artifact, key = path (mis. "ops/config", "prod/2026-01-05") */
  docs: Record<string, unknown>;
}

const DEF_WH: Warehouse[] = [
  { id: 'jogja', name: 'Gudang Jogja' },
  { id: 'sini', name: 'Toko Siniparfum' },
  { id: 'rembang', name: 'Gudang Rembang' },
];

const DEF_COA: [string, string, AccountType, string?, ('cash' | 'invest')?][] = [
  ['1-100', 'Kas Tunai', 'ASSET', undefined, 'cash'],
  ['1-140', 'Persediaan Barang', 'ASSET'],
  ['1-200', 'Peralatan', 'ASSET', undefined, 'invest'],
  ['2-100', 'Utang Usaha', 'LIABILITY'],
  ['2-110', 'Utang Beban', 'LIABILITY'],
  ['3-100', 'Modal Pemilik', 'EQUITY'],
  ['3-900', 'Ekuitas Saldo Awal', 'EQUITY'],
  ['4-100', 'Penjualan', 'REVENUE'],
  ['5-100', 'Beban Pokok Penjualan', 'COGS'],
  ['6-101', 'Beban Iklan Shopee', 'EXPENSE', 'Beban Iklan'],
  ['6-102', 'Beban Iklan TikTok', 'EXPENSE', 'Beban Iklan'],
  ['6-109', 'Beban Iklan Lainnya', 'EXPENSE', 'Beban Iklan'],
  ['6-200', 'Beban Gaji, Upah & Honorer', 'EXPENSE'],
  ['6-300', 'Beban Perlengkapan Kantor', 'EXPENSE'],
  ['6-401', 'Beban Fee Shopee', 'EXPENSE', 'Beban Fee'],
  ['6-402', 'Beban Fee TikTok', 'EXPENSE', 'Beban Fee'],
  ['6-501', 'Beban Affiliate Shopee', 'EXPENSE', 'Beban Affiliate'],
  ['6-502', 'Beban Affiliate TikTok', 'EXPENSE', 'Beban Affiliate'],
  ['6-600', 'Beban Listrik', 'EXPENSE', 'Beban Utilitas'],
  ['6-610', 'Beban Air', 'EXPENSE', 'Beban Utilitas'],
  ['6-620', 'Beban Internet & Telepon', 'EXPENSE', 'Beban Utilitas'],
  ['6-630', 'Beban Sewa Tempat', 'EXPENSE'],
  ['6-640', 'Beban Pengiriman', 'EXPENSE'],
  ['6-690', 'Beban Operasional Lainnya', 'EXPENSE'],
  ['7-100', 'Pendapatan Diluar Usaha Lainnya', 'OTHER_INCOME', 'Pendapatan Diluar Usaha'],
  ['7-200', 'Pendapatan Bunga Bank', 'OTHER_INCOME', 'Pendapatan Diluar Usaha'],
  ['8-100', 'Beban Administrasi Bank', 'OTHER_EXPENSE'],
  ['8-900', 'Beban Non Operasional Lainnya', 'OTHER_EXPENSE'],
];

const TYPE_MAP: Record<string, AccountType> = {
  aset: 'ASSET',
  kewajiban: 'LIABILITY',
  modal: 'EQUITY',
  pendapatan: 'REVENUE',
  hpp: 'COGS',
  beban: 'EXPENSE',
  pendapatan_lain: 'OTHER_INCOME',
  beban_lain: 'OTHER_EXPENSE',
};

const channelOf = (v: unknown): Channel => (str(v) === 'tiktok' ? 'tiktok' : 'shopee');

// ---------------- Marketplace ----------------

export function marketplaceFromHtml(Sraw: unknown): MarketplaceData {
  const S = obj(Sraw);
  const stores: Store[] = arr(S.stores).map((x) => {
    const s = obj(x);
    const f = obj(s.fees);
    return {
      id: str(s.id),
      name: str(s.name),
      channel: channelOf(s.channel),
      brand: str(s.brand),
      isDemo: !!s.demo,
      fees: { admin: n(f.admin), freeShip: n(f.ongkir), service: n(f.layanan), tax: n(f.pajak), ams: n(f.ams), process: n(f.proses) },
    };
  });
  const orders: OrderLine[] = arr(S.orders).map((x) => {
    const o = obj(x);
    return { storeId: str(o.store), orderNo: str(o.orderId), ts: str(o.ts), catalogKey: str(o.cat), sku: str(o.sku), name: str(o.name), qty: n(o.qty), subtotal: n(o.sub) };
  });
  const fees: Record<string, OrderFee> = {};
  for (const [k, v] of Object.entries(obj(S.ofee))) {
    const f = obj(v);
    fees[k] = {
      admin: n(f.admin),
      process: n(f.proses),
      freeShip: n(f.ongkir),
      service: n(f.layanan),
      tax: n(f.pajak),
      other: n(f.lain),
      ams: n(f.ams),
      total: n(f.total),
      settledAt: f.settled ? str(f.settled) : null,
    };
  }
  const catalogs: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj(S.cats))) catalogs[k] = str(v);
  const skus: MarketplaceData['skus'] = {};
  for (const [k, v] of Object.entries(obj(S.skus))) {
    const s = obj(v);
    skus[k] = { name: str(s.name) || k, cogs: n(s.cogs) };
  }
  const ads: AdRecord[] = arr(S.ads).map((x) => {
    const a = obj(x);
    return { storeId: str(a.store), from: str(a.from), to: str(a.to), adName: str(a.adName), catalogKey: str(a.cat), amount: n(a.amount), sales: n(a.sales) };
  });
  const rawMap = obj(S.adMap);
  const adMap: Record<string, AdMatch> = {};
  for (const [k, v] of Object.entries(rawMap)) {
    if (k.startsWith('_m')) continue;
    adMap[k] = { catalogKey: str(v), manual: !!rawMap['_m' + k] };
  }
  return { stores, orders, fees, catalogs, skus, ads, adMap };
}

// ---------------- Operasional ----------------

const MOVEMENT_TYPE: Record<string, MovementType> = { produksi: 'PRODUCTION', geser: 'SHIFT', masuk: 'IN', keluar: 'OUT', pindah: 'TRANSFER' };

export function opsFromHtml(docs: Record<string, unknown>, today: DateKey): OpsInput {
  const cfg = obj(docs['ops/config']);
  const whsRaw = arr(cfg.warehouses).map(obj).filter((w) => w.id);
  const warehouses: Warehouse[] = whsRaw.length ? whsRaw.map((w) => ({ id: str(w.id), name: str(w.name) })) : DEF_WH;
  const main = cfg.mainWh && warehouses.some((w) => w.id === cfg.mainWh) ? str(cfg.mainWh) : warehouses[0].id;
  const salesWh = cfg.salesWh && warehouses.some((w) => w.id === cfg.salesWh) ? str(cfg.salesWh) : main;

  const skus: OpsSku[] = Object.entries(obj(obj(docs['ops/master']).skus))
    .filter(([, v]) => isObj(v))
    .map(([code, v]) => {
      const s = obj(v);
      return { code, brand: str(s.b), product: str(s.p), variant: str(s.v), ml: n(s.ml), price: n(s.price), cogs: n(s.cogs) };
    });
  const rules: ConversionRule[] = arr(cfg.conv)
    .filter(Boolean)
    .map((x) => {
      const c = obj(x);
      return { brand: str(c.brand), fromMl: n(c.from), toMl: n(c.to), qtyPerBottle: n(c.qty), packId: c.botol ? str(c.botol) : null };
    });
  const packs: Pack[] = arr(cfg.pack)
    .map(obj)
    .filter((p) => p.id)
    .map((p) => ({ id: str(p.id), name: str(p.name), bottle: n(p.botol), sticker: n(p.stiker), other: n(p.lain) }));
  const sourceOverrides: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj(cfg.srcMap))) if (v) sourceOverrides[k] = str(v);
  const leadTimes: Record<string, number | null> = {};
  for (const [k, v] of Object.entries(obj(cfg.lead))) if (v !== null && v !== undefined) leadTimes[k] = optNum(v);

  const movements: Movement[] = [];
  const opnames: Opname[] = [];
  const sales: Record<DateKey, DailySales> = {};
  for (const [path, raw] of Object.entries(docs)) {
    if (!isObj(raw)) continue;
    if (path.startsWith('prod/')) {
      const date = str(raw.date) || path.slice(5);
      for (const [id, ev] of Object.entries(obj(raw.entries))) {
        if (!isObj(ev)) continue;
        const type = MOVEMENT_TYPE[str(ev.type)] ?? 'PRODUCTION';
        movements.push({
          id,
          type,
          date,
          seq: n(ev.at),
          warehouseId: str(ev.wh) || main,
          toWarehouseId: ev.toWh ? str(ev.toWh) : null,
          sourceSku: ev.src ? str(ev.src) : null,
          sourceQty: n(ev.bottles),
          reason: str(ev.reason),
          note: str(ev.note),
          lines: arr(ev.outs)
            .map(obj)
            .filter((o) => o.sku)
            .map((o) => ({ sku: str(o.sku), qty: n(o.qty), unitPrice: optNum(o.price) })),
        });
      }
    } else if (path.startsWith('opname/')) {
      const counts: Record<string, number | null> = {};
      for (const [k, v] of Object.entries(obj(raw.counts))) counts[k] = optNum(v);
      opnames.push({ date: str(raw.date) || path.slice(7, 17), warehouseId: str(raw.wh) || main, final: !!raw.final, counts });
    } else if (path.startsWith('sales/') && isObj(raw.rows)) {
      const date = str(raw.date) || path.slice(6);
      const rows: Record<string, number> = {};
      for (const [k, v] of Object.entries(raw.rows)) rows[k] = n(v);
      sales[date] = { date, source: str(raw.source), rows };
    }
  }
  const hist = obj(docs['ops/history']);
  const history: Record<string, number> = {};
  for (const [k, v] of Object.entries(obj(hist.avg))) history[k] = n(v);
  const avgModeRaw = str(cfg.avgMode);
  const config: OpsConfig = {
    shrinkPct: n(cfg.yieldPct) || 95,
    targetDays: n(cfg.minDays) || 14,
    avgMode: avgModeRaw === 'log' ? 'LOG' : avgModeRaw === 'max' ? 'MAX' : 'HISTORY',
    avgDays: n(cfg.avgDays) || 30,
    mainWarehouseId: main,
    salesWarehouseId: salesWh,
  };
  return { warehouses, skus, rules, packs, sourceOverrides, leadTimes, movements, opnames, sales, history, historyLabel: str(hist.label), config, today };
}

// ---------------- Finance ----------------

export interface FinanceFromHtml {
  start: DateKey;
  accounts: FinAccount[];
  opening: Record<string, number>;
  walletOf: Record<string, string>;
  invoices: PurchaseDoc[];
  purchaseOrders: PurchaseDoc[];
  payments: Payment[];
  transfers: Transfer[];
  /** id akun HTML (mis. "B-bca", "W-s1") → kode akun */
  idToCode: Record<string, string>;
}

const PAY_KIND: Record<string, PaymentKind> = { beban: 'EXPENSE', faktur: 'INVOICE', topup: 'ADS_TOPUP', terima: 'RECEIPT', sisa: 'EXPENSE_REMAINDER' };

export function financeFromHtml(docs: Record<string, unknown>, mp: MarketplaceData, today: DateKey): FinanceFromHtml {
  const c = obj(docs['fin/main/cfg/main']);
  const accounts: FinAccount[] = [];
  const idToCode: Record<string, string> = {};
  const push = (id: string, a: FinAccount) => {
    accounts.push(a);
    idToCode[id] = a.code;
  };
  for (const [code, name, type, group, flag] of DEF_COA)
    push(code, { code, name, type, group: group ?? null, isCash: flag === 'cash', isInvest: flag === 'invest', isBank: false, isWallet: false, channel: null });
  arr(c.banks)
    .filter(Boolean)
    .map(obj)
    .forEach((b, i) =>
      push('B-' + str(b.id), {
        code: '1-11' + (i + 1),
        name: str(b.name) + (b.no ? ' ' + str(b.no) : ''),
        type: 'ASSET',
        group: null,
        isCash: true,
        isInvest: false,
        isBank: true,
        isWallet: false,
        channel: null,
      }),
    );
  const walletOf: Record<string, string> = {};
  mp.stores
    .filter((s) => !s.isDemo)
    .forEach((s, i) => {
      const code = '1-12' + (i + 1);
      walletOf[s.id] = code;
      push('W-' + s.id, { code, name: 'Saldo ' + s.name, type: 'ASSET', group: null, isCash: false, isInvest: false, isBank: false, isWallet: true, channel: s.channel });
    });
  arr(c.accs)
    .map(obj)
    .filter((a) => a.id)
    .forEach((a) =>
      push(str(a.id), {
        code: str(a.code) || str(a.id),
        name: str(a.name),
        type: TYPE_MAP[str(a.type)] ?? 'EXPENSE',
        group: a.group ? str(a.group) : null,
        isCash: !!a.cash,
        isInvest: !!a.invest,
        isBank: false,
        isWallet: false,
        channel: null,
      }),
    );
  const code = (id: unknown) => (id ? (idToCode[str(id)] ?? str(id)) : '');

  const opening: Record<string, number> = {};
  for (const [k, v] of Object.entries(obj(c.open))) opening[code(k)] = n(v);

  const docsOf = (prefix: string): (Obj & { id: string })[] =>
    Object.entries(docs)
      .filter(([k, v]) => k.startsWith(prefix + '/') && isObj(v))
      .map(([k, v]) => ({ ...obj(v), id: k.slice(prefix.length + 1) }));

  const purchase = (v: Obj & { id: string }): PurchaseDoc => ({
    id: v.id,
    number: str(v.no),
    date: str(v.date),
    supplier: str(v.supplier),
    discIsPct: !!v.discPct,
    discValue: n(v.discVal),
    extra: n(v.extra),
    lines: arr(v.lines)
      .map(obj)
      .map(
        (l): DocLine => ({
          kind: str(l.kind) === 'sku' ? 'SKU' : 'OTHER',
          sku: l.sku ? str(l.sku) : null,
          name: str(l.name),
          account: str(l.kind) === 'sku' ? ACC.inventory : l.acc ? code(l.acc) : null,
          qty: n(l.qty),
          price: n(l.price),
          disc: n(l.disc),
        }),
      ),
  });

  const payments: Payment[] = docsOf('fin/main/pay').map((p) => {
    const kind = PAY_KIND[str(p.kind)] ?? 'EXPENSE';
    const ch = p.ch ? channelOf(p.ch) : null;
    return {
      id: p.id,
      number: str(p.no),
      kind,
      date: str(p.date),
      bank: p.bank ? code(p.bank) : null,
      amount: n(p.amount),
      note: str(p.note),
      lines: arr(p.lines)
        .map(obj)
        .map((l) => ({ account: code(l.acc), amount: n(l.amount) })),
      invoiceId: p.invId ? str(p.invId) : null,
      refPaymentId: p.refId ? str(p.refId) : null,
      account: kind === 'ADS_TOPUP' ? adsAccountFor(str(p.ch) === 'tiktok' ? 'tiktok' : str(p.ch) === 'shopee' ? 'shopee' : null) : p.acc ? code(p.acc) : null,
      channel: ch,
    };
  });

  const transfers: Transfer[] = docsOf('fin/main/xfer').map((x) => ({
    id: x.id,
    number: str(x.no),
    date: str(x.date),
    from: code(x.from),
    to: code(x.to),
    amount: n(x.amount),
    fee: n(x.fee),
  }));

  return {
    start: str(c.start) || today.slice(0, 8) + '01',
    accounts,
    opening,
    walletOf,
    invoices: docsOf('fin/main/inv').map(purchase),
    purchaseOrders: docsOf('fin/main/po').map(purchase),
    payments,
    transfers,
    idToCode,
  };
}
