'use client';

import type { ActionResult } from '@/lib/auth/guard';
import { apiFetch } from '@/lib/api';

// Izin & validasi dilakukan di backend Express (POST /api/data/<aksi>).

async function call(action: string, input: unknown): Promise<ActionResult> {
  try {
    return await apiFetch<ActionResult>(`/api/data/${action}`, { method: 'POST', body: JSON.stringify(input ?? {}) });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Backend tidak bisa dihubungi.' };
  }
}

export async function createStore(input: unknown): Promise<ActionResult> {
  return call('createStore', input);
}

export async function updateStore(input: unknown): Promise<ActionResult> {
  return call('updateStore', input);
}

export async function deleteStore(input: unknown): Promise<ActionResult> {
  return call('deleteStore', input);
}

export async function setTargetMargin(input: unknown): Promise<ActionResult> {
  return call('setTargetMargin', input);
}

export async function setAdMatch(input: unknown): Promise<ActionResult> {
  return call('setAdMatch', input);
}

export async function addManualAd(input: unknown): Promise<ActionResult> {
  return call('addManualAd', input);
}
