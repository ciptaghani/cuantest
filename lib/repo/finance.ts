import type { DateKey } from '@/lib/date';
import { apiFetch } from '@/lib/api';
import type { AccountType, DocLine, FinAccount, Ledger, Payment, PurchaseDoc, Transfer } from '@/lib/finance';

export type { Ledger };

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


/** Buku besar dibangkitkan dari data sumber oleh backend. */

export interface FinanceSettings {
  accounts: { code: string; name: string; type: AccountType; group: string | null; isSystem: boolean; isBank: boolean; isWallet: boolean }[];
  banks: { id: string; code: string; name: string; number: string }[];
}

/** Daftar akun & rekening untuk halaman Pengaturan akun. */
