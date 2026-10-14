import 'server-only';
import { todayKey } from '@/lib/date';
import { prisma } from '@/lib/db';
import { buildLedger, type FinAccount, type Ledger, type Payment, type PurchaseDoc, type Transfer } from '@/lib/finance';
import { cached, TAGS } from './cache';
import { dateKey, num } from './convert';
import { getMarketplace } from './marketplace';

export interface FinanceInput {
  start: string;
  accounts: FinAccount[];
  opening: Record<string, number>;
  walletOf: Record<string, string>;
  invoices: PurchaseDoc[];
  purchaseOrders: PurchaseDoc[];
  payments: Payment[];
  transfers: Transfer[];
}

async function load(): Promise<FinanceInput> {
  const [cfg, accounts, opening, invoices, pos, payments, transfers] = await Promise.all([
    prisma.appConfig.findUnique({ where: { id: 1 } }),
    prisma.account.findMany({ where: { active: true }, include: { bankAccount: true, storeWallet: true } }),
    prisma.openingBalance.findMany({ include: { account: true } }),
    prisma.purchaseInvoice.findMany({ include: { supplier: true, lines: { include: { sku: true, account: true } } }, orderBy: { date: 'asc' } }),
    prisma.purchaseOrder.findMany({ include: { supplier: true, lines: { include: { sku: true } } }, orderBy: { date: 'asc' } }),
    prisma.payment.findMany({ include: { bankAccount: { include: { account: true } }, lines: { include: { account: true } }, account: true, store: true }, orderBy: [{ date: 'asc' }, { createdAt: 'asc' }] }),
    prisma.transfer.findMany({ include: { fromAccount: true, toAccount: true }, orderBy: { date: 'asc' } }),
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
      lines: v.lines.map((l) => ({ kind: l.kind, sku: l.sku?.code ?? null, name: l.name, account: l.account?.code ?? null, qty: num(l.qty), price: num(l.price), disc: num(l.disc) })),
    })),
    purchaseOrders: pos.map((v) => ({
      id: v.id,
      number: v.number,
      date: dateKey(v.date),
      supplier: v.supplier?.name ?? '',
      discIsPct: v.discIsPct,
      discValue: num(v.discValue),
      extra: num(v.extra),
      lines: v.lines.map((l) => ({ kind: l.skuId ? ('SKU' as const) : ('OTHER' as const), sku: l.sku?.code ?? null, name: l.name, account: null, qty: num(l.qty), price: num(l.price), disc: num(l.disc) })),
    })),
    payments: payments.map((p) => ({
      id: p.id,
      number: p.number,
      kind: p.kind,
      date: dateKey(p.date),
      bank: p.bankAccount?.account.code ?? null,
      amount: num(p.amount),
      note: p.note ?? '',
      lines: p.lines.map((l) => ({ account: l.account.code, amount: num(l.amount) })),
      invoiceId: p.invoiceId,
      refPaymentId: p.refPaymentId,
      account: p.account?.code ?? null,
      channel: p.store ? (p.store.channel === 'TIKTOK' ? 'tiktok' : 'shopee') : null,
    })),
    transfers: transfers.map((x) => ({ id: x.id, number: x.number, date: dateKey(x.date), from: x.fromAccount.code, to: x.toAccount.code, amount: num(x.amount), fee: num(x.fee) })),
  };
}

export const getFinanceInput = cached(load, 'finance-input', [TAGS.finance]);

async function ledger(): Promise<Ledger> {
  const [fin, mp] = await Promise.all([getFinanceInput(), getMarketplace()]);
  return buildLedger({ ...fin, marketplace: mp.data, rates: mp.rates });
}

/** Buku besar dibangkitkan dari data sumber; di-cache sampai ada transaksi Finance/Marketplace/Operasional baru. */
export const getLedger = cached(ledger, 'ledger', [TAGS.finance, TAGS.marketplace, TAGS.ops]);
