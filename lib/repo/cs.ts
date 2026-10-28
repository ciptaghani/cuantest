import type { DateKey } from '@/lib/date';
import { apiFetch } from '@/lib/api';

export interface ProductInfoRow {
  expiredAt: DateKey | '';
  notes: string;
  lookUrl: string;
  updatedAt: string;
}

/** Info barang per varian (kunci `brand||produk`, sama dengan csVariants). */
