'use client';

import type { ActionResult } from '@/lib/auth/guard';
import { apiFetch } from '@/lib/api';

// Izin (menu Finance) & validasi dilakukan di backend Express (POST /api/finance/<aksi>).

async function call<T = undefined>(action: string, input: unknown): Promise<ActionResult<T>> {
  try {
    return await apiFetch<ActionResult<T>>(`/api/finance/${action}`, { method: 'POST', body: JSON.stringify(input ?? {}) });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Backend tidak bisa dihubungi.' };
  }
}

export async function saveDoc(input: unknown): Promise<ActionResult> {
  return call('saveDoc', input);
}
export async function deleteDoc(input: unknown): Promise<ActionResult> {
  return call('deleteDoc', input);
}
export async function savePayment(input: unknown): Promise<ActionResult<{ id: string }>> {
  return call<{ id: string }>('savePayment', input);
}
export async function deletePayment(input: unknown): Promise<ActionResult> {
  return call('deletePayment', input);
}
export async function saveTransfer(input: unknown): Promise<ActionResult> {
  return call('saveTransfer', input);
}
export async function deleteTransfer(input: unknown): Promise<ActionResult> {
  return call('deleteTransfer', input);
}
export async function bankAdd(input: unknown): Promise<ActionResult> {
  return call('bankAdd', input);
}
export async function bankUpdate(input: unknown): Promise<ActionResult> {
  return call('bankUpdate', input);
}
export async function bankRemove(input: unknown): Promise<ActionResult> {
  return call('bankRemove', input);
}
export async function setStart(input: unknown): Promise<ActionResult> {
  return call('setStart', input);
}
export async function setOpening(input: unknown): Promise<ActionResult> {
  return call('setOpening', input);
}
export async function openingFromStock(input: unknown): Promise<ActionResult> {
  return call('openingFromStock', input);
}
export async function accountAdd(input: unknown): Promise<ActionResult> {
  return call('accountAdd', input);
}
export async function accountRemove(input: unknown): Promise<ActionResult> {
  return call('accountRemove', input);
}
