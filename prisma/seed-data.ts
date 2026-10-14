import type { AccountType } from '@prisma/client';

// Disalin dari DEF_WH di reference/cuan-lens.html. Urutan pertama = gudang utama.
export const WAREHOUSES = [
  { code: 'jogja', name: 'Gudang Jogja' },
  { code: 'sini', name: 'Toko Siniparfum' },
  { code: 'rembang', name: 'Gudang Rembang' },
] as const;

type CoaRow = {
  code: string;
  name: string;
  type: AccountType;
  group?: string;
  isCash?: boolean;
  isInvest?: boolean;
};

// Disalin dari DEF_COA di reference/cuan-lens.html.
export const DEFAULT_COA: CoaRow[] = [
  { code: '1-100', name: 'Kas Tunai', type: 'ASSET', isCash: true },
  { code: '1-140', name: 'Persediaan Barang', type: 'ASSET' },
  { code: '1-200', name: 'Peralatan', type: 'ASSET', isInvest: true },
  { code: '2-100', name: 'Utang Usaha', type: 'LIABILITY' },
  { code: '2-110', name: 'Utang Beban', type: 'LIABILITY' },
  { code: '3-100', name: 'Modal Pemilik', type: 'EQUITY' },
  { code: '3-900', name: 'Ekuitas Saldo Awal', type: 'EQUITY' },
  { code: '4-100', name: 'Penjualan', type: 'REVENUE' },
  { code: '5-100', name: 'Beban Pokok Penjualan', type: 'COGS' },
  { code: '6-101', name: 'Beban Iklan Shopee', type: 'EXPENSE', group: 'Beban Iklan' },
  { code: '6-102', name: 'Beban Iklan TikTok', type: 'EXPENSE', group: 'Beban Iklan' },
  { code: '6-109', name: 'Beban Iklan Lainnya', type: 'EXPENSE', group: 'Beban Iklan' },
  { code: '6-200', name: 'Beban Gaji, Upah & Honorer', type: 'EXPENSE' },
  { code: '6-300', name: 'Beban Perlengkapan Kantor', type: 'EXPENSE' },
  { code: '6-401', name: 'Beban Fee Shopee', type: 'EXPENSE', group: 'Beban Fee' },
  { code: '6-402', name: 'Beban Fee TikTok', type: 'EXPENSE', group: 'Beban Fee' },
  { code: '6-501', name: 'Beban Affiliate Shopee', type: 'EXPENSE', group: 'Beban Affiliate' },
  { code: '6-502', name: 'Beban Affiliate TikTok', type: 'EXPENSE', group: 'Beban Affiliate' },
  { code: '6-600', name: 'Beban Listrik', type: 'EXPENSE', group: 'Beban Utilitas' },
  { code: '6-610', name: 'Beban Air', type: 'EXPENSE', group: 'Beban Utilitas' },
  { code: '6-620', name: 'Beban Internet & Telepon', type: 'EXPENSE', group: 'Beban Utilitas' },
  { code: '6-630', name: 'Beban Sewa Tempat', type: 'EXPENSE' },
  { code: '6-640', name: 'Beban Pengiriman', type: 'EXPENSE' },
  { code: '6-690', name: 'Beban Operasional Lainnya', type: 'EXPENSE' },
  { code: '7-100', name: 'Pendapatan Diluar Usaha Lainnya', type: 'OTHER_INCOME', group: 'Pendapatan Diluar Usaha' },
  { code: '7-200', name: 'Pendapatan Bunga Bank', type: 'OTHER_INCOME', group: 'Pendapatan Diluar Usaha' },
  { code: '8-100', name: 'Beban Administrasi Bank', type: 'OTHER_EXPENSE' },
  { code: '8-900', name: 'Beban Non Operasional Lainnya', type: 'OTHER_EXPENSE' },
];

// HTML tidak punya daftar kemasan default (dimulai kosong). Harga diisi 0,
// lalu diperbarui di Operasional → Master & aturan → Botol & kemasan.
export const DEFAULT_PACKS = [
  { name: 'Botol decant 2ml', bottle: 0, sticker: 0, other: 0 },
  { name: 'Botol decant 5ml', bottle: 0, sticker: 0, other: 0 },
  { name: 'Botol decant 10ml', bottle: 0, sticker: 0, other: 0 },
];

// Brand produk dari data contoh HTML. HTML juga tidak punya lead time default,
// jadi null (= belum diatur). 99 = kebijakan brand.
export const DEFAULT_BRANDS: { name: string; leadTimeDays: number | null }[] = [
  { name: 'HMNS', leadTimeDays: null },
  { name: 'Mykonos', leadTimeDays: null },
  { name: 'Project 1945', leadTimeDays: null },
  { name: 'Home of Humans', leadTimeDays: null },
];
