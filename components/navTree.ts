import type { NavItem } from '@/app/(app)/NavBar';

/** Anak tiap menu utama (gaya daftar markdown). Label sama dengan SubNav tiap area. */
export const NAV_CHILDREN: Record<string, { label: string; href: string; group?: string }[]> = {
  '/marketplace': [
    { label: 'Ringkasan', href: '/marketplace/ringkasan' },
    { label: 'Katalog', href: '/marketplace/katalog' },
    { label: 'Per SKU', href: '/marketplace/sku' },
    { label: 'Per Toko', href: '/marketplace/toko' },
  ],
  '/marketing': [
    { label: 'Dashboard', href: '/marketing/dashboard' },
    { label: 'BCG matrix', href: '/marketing/bcg' },
    { label: 'Ads', href: '/marketing/ads' },
    { label: 'Schedule & planning', href: '/marketing/planning' },
  ],
  '/operasional': [
    { label: 'Task produksi', href: '/operasional/task', group: 'Manufaktur' },
    { label: 'Produksi', href: '/operasional/produksi', group: 'Manufaktur' },
    { label: 'Barang keluar masuk', href: '/operasional/keluar-masuk', group: 'Manufaktur' },
    { label: 'Stok real-time', href: '/operasional/stok', group: 'Manufaktur' },
    { label: 'Umur stock', href: '/operasional/umur-stok', group: 'Manufaktur' },
    { label: 'Stock opname', href: '/operasional/opname', group: 'Manufaktur' },
    { label: 'Retur', href: '/operasional/retur', group: 'Operasional' },
    { label: 'Absensi', href: '/operasional/absensi', group: 'Operasional' },
    { label: 'Master & aturan', href: '/operasional/master', group: 'Pengaturan' },
  ],
  '/finance': [
    { label: 'Pembelian barang', href: '/finance/pembelian', group: 'Transaksi' },
    { label: 'Pembayaran', href: '/finance/pembayaran', group: 'Transaksi' },
    { label: 'Pemindahan dana', href: '/finance/pemindahan', group: 'Transaksi' },
    { label: 'Schedule restock', href: '/finance/restock', group: 'Perencanaan' },
    { label: 'Laba rugi', href: '/finance/laba-rugi', group: 'Laporan keuangan' },
    { label: 'Arus kas', href: '/finance/arus-kas', group: 'Laporan keuangan' },
    { label: 'Ringkasan buku besar', href: '/finance/buku-besar', group: 'Laporan keuangan' },
    { label: 'Settlement', href: '/finance/settlement', group: 'Laporan keuangan' },
    { label: 'Akun, bank & saldo awal', href: '/finance/pengaturan', group: 'Pengaturan' },
  ],
  '/cs': [
    { label: 'Info stock', href: '/cs/stock' },
    { label: 'Info barang', href: '/cs/info' },
    { label: 'Input info', href: '/cs/input' },
  ],
  '/data': [
    { label: 'Import / export data', href: '/data/import-export' },
    { label: 'Akun & akses', href: '/data/akun' },
  ],
};

export function withChildren(item: NavItem): NavItem & { children: { label: string; href: string }[] } {
  return { ...item, children: NAV_CHILDREN[item.match] ?? [] };
}
