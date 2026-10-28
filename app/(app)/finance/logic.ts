import { ACC, type FinAccount } from '@/lib/finance';

/** Akun untuk barang lain di faktur (perlengkapan, peralatan, beban). */
export const isItemAccount = (a: FinAccount | undefined) => !!a && (a.type === 'EXPENSE' || a.type === 'ASSET') && !a.isCash && !a.isWallet;
/** Akun baris pembayaran beban. */
export const isExpenseAccount = (a: FinAccount | undefined) =>
  !!a && (a.type === 'EXPENSE' || a.type === 'OTHER_EXPENSE' || (a.type === 'ASSET' && !a.isCash && !a.isWallet && a.code !== ACC.inventory));
/** Akun lawan penerimaan lain. */
export const isReceiptAccount = (a: FinAccount | undefined) => !!a && (a.type === 'OTHER_INCOME' || a.type === 'LIABILITY' || (a.type === 'EQUITY' && a.code !== ACC.openingEquity));
