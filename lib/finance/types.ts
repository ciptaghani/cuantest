import type { DateKey } from '@/lib/date';
import type { Channel } from '@/lib/marketplace/types';

export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'COGS' | 'EXPENSE' | 'OTHER_INCOME' | 'OTHER_EXPENSE';

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  ASSET: 'Aset',
  LIABILITY: 'Kewajiban',
  EQUITY: 'Ekuitas',
  REVENUE: 'Pendapatan',
  COGS: 'Beban pokok penjualan',
  EXPENSE: 'Beban operasional',
  OTHER_INCOME: 'Pendapatan non operasional',
  OTHER_EXPENSE: 'Beban non operasional',
};

/** Tipe akun bersaldo normal debit. */
export const DEBIT_TYPES: ReadonlySet<AccountType> = new Set(['ASSET', 'COGS', 'EXPENSE', 'OTHER_EXPENSE']);

/** Akun dirujuk lewat kodenya (unik). */
export interface FinAccount {
  code: string;
  name: string;
  type: AccountType;
  group: string | null;
  isCash: boolean;
  isInvest: boolean;
  isBank: boolean;
  /** Saldo marketplace per toko. */
  isWallet: boolean;
  channel: Channel | null;
}

/** Kode akun bawaan yang dipakai ledger. */
export const ACC = {
  cash: '1-100',
  inventory: '1-140',
  payable: '2-100',
  expensePayable: '2-110',
  openingEquity: '3-900',
  sales: '4-100',
  cogs: '5-100',
  adsShopee: '6-101',
  adsTiktok: '6-102',
  adsOther: '6-109',
  officeSupplies: '6-300',
  feeShopee: '6-401',
  feeTiktok: '6-402',
  affShopee: '6-501',
  affTiktok: '6-502',
  bankAdmin: '8-100',
} as const;

export const adsAccountFor = (ch: Channel | null | undefined) => (ch === 'tiktok' ? ACC.adsTiktok : ch === 'shopee' ? ACC.adsShopee : ACC.adsOther);

export type InvoiceLineKind = 'SKU' | 'OTHER';

export interface DocLine {
  kind: InvoiceLineKind;
  sku: string | null;
  name: string;
  /** Kode akun (OTHER). */
  account: string | null;
  qty: number;
  price: number;
  disc: number;
}

/** Faktur pembelian atau PO. */
export interface PurchaseDoc {
  id: string;
  number: string;
  date: DateKey;
  supplier: string;
  lines: DocLine[];
  discIsPct: boolean;
  discValue: number;
  /** Ongkir / biaya lain. */
  extra: number;
}

export type PaymentKind = 'EXPENSE' | 'INVOICE' | 'ADS_TOPUP' | 'RECEIPT' | 'EXPENSE_REMAINDER';

export interface Payment {
  id: string;
  number: string;
  kind: PaymentKind;
  date: DateKey;
  /** Kode akun kas/bank. Kosong = Kas Tunai. */
  bank: string | null;
  amount: number;
  note: string;
  /** Rincian beban (EXPENSE). */
  lines: { account: string; amount: number }[];
  invoiceId: string | null;
  refPaymentId: string | null;
  /** ADS_TOPUP: akun beban iklan. RECEIPT: akun lawan. */
  account: string | null;
  /** ADS_TOPUP: channel untuk label. */
  channel: Channel | null;
}

export interface Transfer {
  id: string;
  number: string;
  date: DateKey;
  from: string;
  to: string;
  amount: number;
  fee: number;
}

export interface LedgerLine {
  acc: string;
  d: number;
  c: number;
}

export type CashflowCategory = 'op' | 'inv' | 'fin';

export interface CashflowItem {
  cat: CashflowCategory;
  label: string;
  amt: number;
}

export type EntryKind = 'open' | 'sale' | 'inv' | 'pay' | 'xfer';

export interface LedgerEntry {
  date: DateKey;
  ref: string;
  kind: EntryKind;
  desc: string;
  lines: LedgerLine[];
  cf: CashflowItem[];
}

export interface Ledger {
  entries: LedgerEntry[];
  accounts: Record<string, FinAccount>;
  start: DateKey;
}
