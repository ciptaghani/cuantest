'use client';

import type { ActionResult } from '@/lib/auth/guard';
import { apiFetch } from '@/lib/api';
import type { CatalogDetail, SkuDetail } from './rows';

// Izin (menu Marketplace) & validasi dilakukan di backend Express.

async function call<T = undefined>(action: string, input: unknown): Promise<ActionResult<T>> {
  try {
    return await apiFetch<ActionResult<T>>(`/api/marketplace/${action}`, { method: 'POST', body: JSON.stringify(input ?? {}) });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Backend tidak bisa dihubungi.' };
  }
}

export async function mpDetail(input: unknown): Promise<ActionResult<CatalogDetail | SkuDetail>> {
  return call<CatalogDetail | SkuDetail>('mpDetail', input);
}

export async function setSkuCogs(input: unknown): Promise<ActionResult> {
  return call('setSkuCogs', input);
}
