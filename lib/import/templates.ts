// Isi template Excel. Nama kolom & petunjuk sama persis dengan reference/cuan-lens.html
// (skuTemplate, opnTemplate, csTemplate) supaya file lama tetap bisa diupload.
import type { SheetSpec } from '@/lib/parse/workbook';

export const SKU_TEMPLATE_HEADERS = ['Master SKU', 'Brand', 'Nama Produk (Key)', 'Varian / Ukuran (asli)', 'Ukuran (ml)', 'Harga Jual (Rp)', 'HPP (Rp)'];

export interface SkuTemplateRow {
  code: string;
  brand: string;
  product: string;
  variant: string;
  ml: number;
  price: number;
  cogs: number;
}

/** Master SKU & HPP. `rows` kosong = template contoh + sheet Petunjuk. */
export function skuTemplate(rows: SkuTemplateRow[] | null): SheetSpec[] {
  const cols = [22, 16, 28, 24, 12, 16, 14];
  if (rows) {
    const data = [...rows]
      .sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0))
      .map((v) => [v.code, v.brand, v.product, v.variant, v.ml || '', v.price || '', v.cogs || '']);
    return [{ name: 'Master SKU & HPP', rows: [SKU_TEMPLATE_HEADERS, ...data], cols }];
  }
  return [
    {
      name: 'Master SKU & HPP',
      cols,
      rows: [
        SKU_TEMPLATE_HEADERS,
        ['HMNS-ALP-5', 'HMNS', 'Alpha', 'Alpha / 5ml', 5, 30000, 17600],
        ['HMNS-ALP-100', 'HMNS', 'Alpha', 'Alpha 100ml', 100, 320000, 240000],
        ['SML-KEY', 'Smolify', 'Gantungan Kunci Makrame', '', 0, 25000, 9000],
      ],
    },
    {
      name: 'Petunjuk',
      cols: [120],
      rows: [
        ['Petunjuk'],
        ['Master SKU wajib, harus sama dengan Kode Variasi / Nomor Referensi SKU di Shopee dan Seller SKU di TikTok.'],
        ['HPP (Rp) wajib. Brand, Nama Produk (Key), Ukuran (ml), dan Harga Jual dipakai di menu Operasional (kategori fullsize/decant dihitung dari brand + ukuran).'],
        ['Nama Produk (Key) diisi nama varian tanpa ukuran, sama untuk semua ukuran satu varian, mis. Alpha.'],
        ['Hapus baris contoh sebelum upload. SKU yang sudah ada akan diperbarui.'],
      ],
    },
  ];
}

export interface OpnameTemplateRow {
  brand: string;
  code: string;
  /** Stok tercatat sistem per tanggal opname. */
  recorded: number;
  /** Hasil hitung yang sudah diisi (null = kosong). */
  counted: number | null;
}

export function opnameTemplate(rows: OpnameTemplateRow[]): SheetSpec[] {
  return [
    {
      name: 'Stock Opname',
      cols: [6, 18, 22, 14, 18],
      rows: [
        ['No', 'Nama Brand', 'Kode SKU', 'Qty Tercatat', 'Qty Stock Opname'],
        ...rows.map((r, i) => [i + 1, r.brand, r.code, Math.round(r.recorded * 100) / 100, r.counted === null ? '' : r.counted]),
      ],
    },
  ];
}


/** Histori rata-rata jual harian per SKU (diisi dari laporan penjualan lama). */

export interface InfoTemplateRow {
  brand: string;
  product: string;
  expiredAt: string;
  notes: string;
  lookUrl: string;
}

export function productInfoTemplate(rows: InfoTemplateRow[]): SheetSpec[] {
  return [
    {
      name: 'Info Barang',
      cols: [16, 28, 22, 60, 40],
      rows: [['Brand', 'Nama Variant', 'Tanggal Expired (YYYY-MM-DD)', 'Notes / Deskripsi', 'Link Look Visual'], ...rows.map((r) => [r.brand, r.product, r.expiredAt, r.notes, r.lookUrl])],
    },
    {
      name: 'Petunjuk',
      rows: [
        ['Petunjuk'],
        ['Jangan ubah kolom Brand dan Nama Variant, keduanya dipakai untuk mencocokkan varian.'],
        ['Tanggal expired format YYYY-MM-DD, mis. 2027-06-30.'],
        ['Link look visual opsional, harus diawali https://.'],
        ['Sel yang dikosongkan tidak menghapus data yang sudah ada. Baris yang tidak diubah boleh dibiarkan.'],
      ],
    },
  ];
}
