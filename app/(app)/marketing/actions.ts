'use client';

import type { ActionResult } from '@/lib/auth/guard';
import { apiFetch } from '@/lib/api';

// Izin (menu Marketing) & validasi dilakukan di backend Express (POST /api/marketing/<aksi>).

async function call(action: string, input: unknown): Promise<ActionResult> {
  try {
    return await apiFetch<ActionResult>(`/api/marketing/${action}`, { method: 'POST', body: JSON.stringify(input ?? {}) });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Backend tidak bisa dihubungi.' };
  }
}

export async function addAdLog(input: unknown): Promise<ActionResult> {
  return call('addAdLog', input);
}

export async function deleteAdLog(input: unknown): Promise<ActionResult> {
  return call('deleteAdLog', input);
}

export async function addPlan(input: unknown): Promise<ActionResult> {
  return call('addPlan', input);
}

export async function setPlanDone(input: unknown): Promise<ActionResult> {
  return call('setPlanDone', input);
}

export async function deletePlan(input: unknown): Promise<ActionResult> {
  return call('deletePlan', input);
}
