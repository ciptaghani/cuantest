/** Info SKU untuk form (stok per gudang, HPP, hasil produksi). Diisi backend (POST /api/ops/skuSnapshot). */
export interface SkuSnapshot {
  code: string;
  label: string;
  category: string;
  ml: number;
  hpp: number;
  stock: { id: string; name: string; now: number }[];
  /** Hasil produksi/geser yang mungkin (hanya kalau diminta). */
  targets: { code: string; label: string; ml: number; ratio: number; stock: number }[];
}
