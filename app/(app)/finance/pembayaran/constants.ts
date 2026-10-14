import type { PaymentKind } from '@/lib/finance/types';

export const PAY_LABEL: Record<PaymentKind, string> = {
  EXPENSE: 'Beban',
  INVOICE: 'Faktur pembelian',
  ADS_TOPUP: 'Top up saldo iklan',
  RECEIPT: 'Penerimaan lain',
  EXPENSE_REMAINDER: 'Pelunasan sisa beban',
};
