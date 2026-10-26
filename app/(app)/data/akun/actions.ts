'use client';

import type { ActionResult } from '@/lib/auth/guard';
import { apiFetch } from '@/lib/api';

// Izin (admin) & validasi dilakukan di backend Express (POST /api/accounts/<aksi>).

async function call(action: string, input: unknown): Promise<ActionResult> {
  try {
    return await apiFetch<ActionResult>(`/api/accounts/${action}`, { method: 'POST', body: JSON.stringify(input ?? {}) });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Backend tidak bisa dihubungi.' };
  }
}

export async function createUser(input: unknown): Promise<ActionResult> {
  return call('createUser', input);
}

export async function updateAccess(input: unknown): Promise<ActionResult> {
  return call('updateAccess', input);
}

export async function setActive(input: unknown): Promise<ActionResult> {
  return call('setActive', input);
}

export async function resetPassword(input: unknown): Promise<ActionResult> {
  return call('resetPassword', input);
}

export async function deleteUser(input: unknown): Promise<ActionResult> {
  return call('deleteUser', input);
}
