import 'server-only';
import type { DateKey } from '@/lib/date';
import { todayKey } from '@/lib/date';
import { prisma } from '@/lib/db';
import { ACC, buildLedger, type AccountType, type DocLine, type FinAccount, type Ledger, type Payment, type PurchaseDoc, type Transfer } from '@/lib/finance';
import { cached, TAGS } from './cache';
import { dateKey, num } from './convert';
import { getMarketplace } from './marketplace';

/** Faktur / PO beserta data yang hanya dipakai halaman (tidak memengaruhi hitungan). */
export interface DocRow extends PurchaseDoc {
  lines: (DocLine & { unit: string })[];
  dueDate: DateKey | '';
  poId: string | null;
  note: string;
  /** Faktur: barang SKU sudah diterima → barang masuk di Operasional. */
  received: boolean;
  warehouseId: string | null;
  status: 'OPEN' | 'INVOICED' | 'CANCELLED';
}

export interface PaymentRow extends Payment {
  lines: { account: string; amount: number; note: string }[];
  hasProof: boolean;
  by: string;
}

export interface TransferRow extends Transfer {
  note: string;
  by: string;
}

export interface FinanceInput {
  start: string;
  accounts: FinAccount[];
  opening: Record<string, number>;
  walletOf: Record<string, string>;
  invoices: DocRow[];
  purchaseOrders: DocRow[];
  payments: PaymentRow[];
  transfers: TransferRow[];
  suppliers: string[];
}

/** Top up tanpa toko: channel dari akun beban iklannya (label jurnal). */
const adsChannel = (code: string | undefined) => (code === ACC.adsShopee ? 'shopee' : code === ACC.adsTiktok ? 'tiktok' : null);

async function load(): Promise<FinanceInput> {
  const [cfg, accounts, opening, invoices, pos, payments, transfers, suppliers] = await Promise.all([
    prisma.appConfig.findUnique({ where: { id: 1 } }),
    prisma.account.findMany({ where: { active: true }, include: { bankAccount: true, storeWallet: true } }),
    prisma.openingBalance.findMany({ include: { account: true } }),
    prisma.purchaseInvoice.findMany({ include: { supplier: true, lines: { include: { sku: true, account: true } } }, orderBy: { date: 'asc' } }),
    prisma.purchaseOrder.findMany({ include: { supplier: true, lines: { include: { sku: true } } }, orderBy: { date: 'asc' } }),
    prisma.payment.findMany({
      include: { bankAccount: { include: { account: true } }, lines: { include: { account: true } }, account: true, store: true, createdBy: { select: { name: true } } },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.transfer.findMany({ include: { fromAccount: true, toAccount: true, createdBy: { select: { name: true } } }, orderBy: { date: 'asc' } }),
    prisma.supplier.findMany({ select: { name: true }, orderBy: { name: 'asc' } }),
  ]);
  const walletOf: Record<string, string> = {};
  const finAccounts: FinAccount[] = accounts.map((a) => {
    if (a.storeWallet) walletOf[a.storeWallet.id] = a.code;
    return {
      code: a.code,
      name: a.name,
      type: a.type,
      group: a.group,
      isCash: a.isCash,
      isInvest: a.isInvest,
      isBank: !!a.bankAccount,
      isWallet: !!a.storeWallet,
      channel: a.storeWallet ? (a.storeWallet.channel === 'TIKTOK' ? 'tiktok' : 'shopee') : null,
    };
  });
  return {
    start: cfg?.financeStartDate ? dateKey(cfg.financeStartDate) : todayKey().slice(0, 8) + '01',
    accounts: finAccounts,
    opening: Object.fromEntries(opening.map((o) => [o.account.code, num(o.amount)])),
    walletOf,
    invoices: invoices.map((v) => ({
      id: v.id,
      number: v.number,
      date: dateKey(v.date),
      supplier: v.supplier?.name ?? '',
      discIsPct: v.discIsPct,
      discValue: num(v.discValue),
      extra: num(v.extra),
      lines: v.lines.map((l) => ({ kind: l.kind, sku: l.sku?.code ?? null, name: l.name, account: l.account?.code ?? null, qty: num(l.qty), unit: l.unit, price: num(l.price), disc: num(l.disc) })),
      dueDate: v.dueDate ? dateKey(v.dueDate) : '',
      poId: v.poId,
      note: v.note ?? '',
      received: v.received,
      warehouseId: v.receivedWarehouseId,
      status: 'OPEN' as const,
    })),
    purchaseOrders: pos.map((v) => ({
      id: v.id,
      number: v.number,
      date: dateKey(v.date),
      supplier: v.supplier?.name ?? '',
      discIsPct: v.discIsPct,
      discValue: num(v.discValue),
      extra: num(v.extra),
      lines: v.lines.map((l) => ({ kind: l.skuId ? ('SKU' as const) : ('OTHER' as const), sku: l.sku?.code ?? null, name: l.name, account: null, qty: num(l.qty), unit: l.unit, price: num(l.price), disc: num(l.disc) })),
      dueDate: '' as const,
      poId: null,
      note: v.note ?? '',
      received: false,
      warehouseId: null,
      status: v.status,
    })),
    payments: payments.map((p) => ({
      id: p.id,
      number: p.number,
      kind: p.kind,
      date: dateKey(p.date),
      bank: p.bankAccount?.account.code ?? null,
      amount: num(p.amount),
      note: p.note ?? '',
      lines: p.lines.map((l) => ({ account: l.account.code, amount: num(l.amount), note: l.note ?? '' })),
      invoiceId: p.invoiceId,
      refPaymentId: p.refPaymentId,
      account: p.account?.code ?? null,
      channel: p.store ? (p.store.channel === 'TIKTOK' ? 'tiktok' : 'shopee') : adsChannel(p.account?.code),
      hasProof: !!p.proofPath,
      by: p.createdBy?.name ?? '',
    })),
    transfers: transfers.map((x) => ({
      id: x.id,
      number: x.number,
      date: dateKey(x.date),
      from: x.fromAccount.code,
      to: x.toAccount.code,
      amount: num(x.amount),
      fee: num(x.fee),
      note: x.note ?? '',
      by: x.createdBy?.name ?? '',
    })),
    suppliers: suppliers.map((s) => s.name),
  };
}

export const getFinanceInput = cached(load, 'finance-input', [TAGS.finance]);

async function ledger(): Promise<Ledger> {
  const [fin, mp] = await Promise.all([getFinanceInput(), getMarketplace()]);
  return buildLedger({ ...fin, marketplace: mp.data, rates: mp.rates });
}

/** Buku besar dibangkitkan dari data sumber; di-cache sampai ada transaksi Finance/Marketplace/Operasional baru. */
export const getLedger = cached(ledger, 'ledger', [TAGS.finance, TAGS.marketplace, TAGS.ops]);

export interface FinanceSettings {
  accounts: { code: string; name: string; type: AccountType; group: string | null; isSystem: boolean; isBank: boolean; isWallet: boolean }[];
  banks: { id: string; code: string; name: string; number: string }[];
}

/** Daftar akun & rekening untuk halaman Pengaturan akun. */
export async function getFinanceSettings(): Promise<FinanceSettings> {
  const accounts = await prisma.account.findMany({ where: { active: true }, include: { bankAccount: true, storeWallet: { select: { id: true } } } });
  const collator = new Intl.Collator(undefined, { numeric: true });
  accounts.sort((a, b) => collator.compare(a.code, b.code));
  return {
    accounts: accounts.map((a) => ({ code: a.code, name: a.name, type: a.type, group: a.group, isSystem: a.isSystem, isBank: !!a.bankAccount, isWallet: !!a.storeWallet })),
    banks: accounts.flatMap((a) => (a.bankAccount ? [{ id: a.bankAccount.id, code: a.code, name: a.bankAccount.name, number: a.bankAccount.number ?? '' }] : [])),
  };
}
