'use server';

import type { ActionResult } from '@/lib/auth/guard';
import { mpDetailImpl, setSkuCogsImpl } from './logic';
import type { CatalogDetail, SkuDetail } from './rows';

// Izin (menu Marketplace) & validasi Zod dilakukan di logic.ts lewat guardedAction.

export async function mpDetail(input: unknown): Promise<ActionResult<CatalogDetail | SkuDetail>> {
  return mpDetailImpl(input);
}

export async function setSkuCogs(input: unknown): Promise<ActionResult> {
  return setSkuCogsImpl(input);
}
