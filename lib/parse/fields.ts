import type { FieldDef } from './index';

// Disalin dari SKU_F, ORD_F, FEE_F, AD_F di reference/cuan-lens.html.

export const SKU_FIELDS: FieldDef[] = [
  { k: 'sku', l: 'SKU', req: true, c: ['master sku', 'sku', 'kode sku', 'kode variasi', 'seller sku', 'nomor referensi sku'] },
  { k: 'name', l: 'Nama produk', c: ['nama produk (key)', 'nama produk', 'nama', 'product name', 'produk'] },
  { k: 'cogs', l: 'HPP', req: true, c: ['cogs (rp)', 'hpp', 'cogs', 'harga modal', 'modal', 'hpp/pcs', 'hpp per pcs'] },
  { k: 'brand', l: 'Brand', c: ['brand', 'merek'] },
  { k: 'ml', l: 'Ukuran (ml)', c: ['ukuran (ml)', 'size ml', 'ml', 'ukuran'] },
  { k: 'price', l: 'Harga jual', c: ['harga jual (rp)', 'harga jual'] },
  { k: 'variant', l: 'Varian', c: ['varian / ukuran (asli)', 'varian', 'variasi'] },
];

export const ORDER_FIELDS: FieldDef[] = [
  { k: 'orderId', l: 'No. pesanan', req: true, c: ['no. pesanan', 'no pesanan', 'nomor pesanan', 'order id', 'order no'] },
  { k: 'date', l: 'Waktu pesanan', req: true, c: ['waktu pesanan dibuat', 'created time', 'order creation time', 'tanggal pesanan', 'waktu pembayaran dilakukan', 'paid time', 'order date'] },
  { k: 'name', l: 'Nama produk (katalog)', req: true, c: ['nama produk', 'product name'] },
  { k: 'cat', l: 'SKU Induk / ID produk', c: ['sku induk', 'parent sku', 'id produk', 'product id'] },
  { k: 'sku', l: 'SKU variasi', req: true, c: ['nomor referensi sku', 'kode variasi', 'seller sku', 'sku'] },
  { k: 'variation', l: 'Nama variasi', c: ['nama variasi', 'variation', 'variasi'] },
  { k: 'qty', l: 'Jumlah', req: true, c: ['jumlah', 'quantity', 'qty'] },
  { k: 'subtotal', l: 'Subtotal (harga × qty)', c: ['sku subtotal after discount', 'total harga produk', 'subtotal produk', 'subtotal'] },
  { k: 'unit', l: 'Harga satuan setelah diskon', c: ['harga setelah diskon', 'harga satuan', 'sku unit original price', 'unit price'] },
  { k: 'status', l: 'Status pesanan', c: ['status pesanan', 'order status', 'status'] },
];

export const FEE_FIELDS: FieldDef[] = [
  { k: 'orderId', l: 'No. pesanan', req: true, c: ['no. pesanan', 'no pesanan', 'nomor pesanan', 'order id', 'order/adjustment id'] },
  { k: 'admin', l: 'Biaya administrasi', c: ['biaya administrasi', 'biaya admin', 'platform commission fee', 'biaya komisi platform', 'komisi platform'] },
  { k: 'process', l: 'Biaya proses pesanan', c: ['biaya proses pesanan', 'biaya pemrosesan pesanan', 'order processing fee', 'transaction fee', 'biaya transaksi'] },
  { k: 'freeShip', l: 'Gratis Ongkir XTRA', c: ['biaya gratis ongkir xtra', 'gratis ongkir xtra', 'biaya program gratis ongkir xtra', 'free shipping program fee', 'sfp service fee', 'biaya program gratis ongkir'] },
  { k: 'service', l: 'Layanan / Promo XTRA', c: ['biaya layanan promo xtra', 'biaya layanan', 'service fee', 'biaya program promo xtra', 'cashback xtra', 'bonus cashback service fee'] },
  { k: 'ams', l: 'Komisi AMS / affiliate', c: ['biaya komisi ams', 'komisi ams', 'biaya ams', 'affiliate commission', 'komisi affiliate', 'komisi afiliasi'] },
  { k: 'tax', l: 'Pajak (PPh 22)', c: ['pph 22', 'pph22', 'pajak', 'tax'] },
  { k: 'other', l: 'Potongan lain', c: ['biaya lain', 'biaya lainnya', 'other fees', 'other fee'] },
  { k: 'total', l: 'Total penghasilan (cadangan)', c: ['total penghasilan', 'estimasi total penghasilan', 'total settlement amount', 'settlement amount'] },
  { k: 'settled', l: 'Tanggal dana dilepas', c: ['tanggal dana dilepaskan', 'waktu dana dilepaskan', 'tanggal penyelesaian pembayaran', 'order settled time', 'settled time', 'settlement time', 'tanggal settlement'] },
];

/** Template stock opname (kolom tetap di HTML: "Kode SKU", "Qty Stock Opname"). */
export const OPNAME_FIELDS: FieldDef[] = [
  { k: 'sku', l: 'Kode SKU', req: true, c: ['kode sku', 'sku'] },
  { k: 'qty', l: 'Qty Stock Opname', req: true, c: ['qty stock opname', 'qty opname'] },
];

/** Template info barang CS. */
export const PRODUCT_INFO_FIELDS: FieldDef[] = [
  { k: 'brand', l: 'Brand', req: true, c: ['brand'] },
  { k: 'product', l: 'Nama Variant', req: true, c: ['nama variant', 'nama produk', 'variant', 'varian'] },
  { k: 'expired', l: 'Tanggal Expired', c: ['tanggal expired (yyyy-mm-dd)', 'tanggal expired', 'expired'] },
  { k: 'notes', l: 'Notes / Deskripsi', c: ['notes / deskripsi', 'notes', 'deskripsi'] },
  { k: 'look', l: 'Link Look Visual', c: ['link look visual', 'link look', 'look'] },
];

/** Histori rata-rata jual harian per SKU (dasar task produksi mode "Histori"). */
export const HISTORY_FIELDS: FieldDef[] = [
  { k: 'sku', l: 'Kode SKU', req: true, c: ['kode sku', 'master sku', 'sku'] },
  { k: 'avg', l: 'Rata-rata jual harian', req: true, c: ['rata-rata jual harian', 'rata-rata harian', 'rata-rata', 'avg daily', 'avg', 'jual/hari', 'penjualan per hari'] },
];

export const AD_FIELDS: FieldDef[] = [
  { k: 'adName', l: 'Nama iklan / produk', req: true, c: ['nama iklan', 'nama produk', 'info iklan', 'product name', 'nama', 'iklan'] },
  { k: 'amount', l: 'Biaya iklan', req: true, c: ['biaya', 'biaya iklan', 'pengeluaran', 'cost', 'spend'] },
  { k: 'sales', l: 'Penjualan dari iklan', c: ['penjualan', 'omzet penjualan', 'penjualan langsung', 'gmv', 'gross revenue', 'sales'] },
  { k: 'date', l: 'Tanggal (kalau per hari)', c: ['tanggal', 'date'] },
];
