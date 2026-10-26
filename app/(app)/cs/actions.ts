'use client';

import type { ActionResult } from '@/lib/auth/guard';
import { apiFetch } from '@/lib/api';

// Izin (menu CS) & validasi dilakukan di backend Express.

export async function saveInfo(input: unknown): Promise<ActionResult> {
  try {
    return await apiFetch<ActionResult>('/api/cs/saveInfo', { method: 'POST', body: JSON.stringify(input ?? {}) });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Backend tidak bisa dihubungi.' };
  }
}
