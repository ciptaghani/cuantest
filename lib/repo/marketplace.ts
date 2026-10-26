import 'server-only';
import { apiFetch } from '@/lib/api';
import type { MarketplaceData } from '@/lib/marketplace';

/** Semua data Marketplace dari backend Express (dulu dibaca langsung dari database). */
export async function getMarketplaceData(): Promise<MarketplaceData> {
  return apiFetch<MarketplaceData>('/api/marketplace/data');
}

/** Target margin bersih (%) dari pengaturan, default 12. */
