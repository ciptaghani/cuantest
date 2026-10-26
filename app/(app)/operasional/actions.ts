'use client';

import type { ActionResult } from '@/lib/auth/guard';
import { apiFetch } from '@/lib/api';
import type { SkuSnapshot } from './logic';

// Izin (menu Operasional) & validasi dilakukan di backend Express (POST /api/ops/<aksi>).

async function call<T = undefined>(action: string, input: unknown): Promise<ActionResult<T>> {
  try {
    return await apiFetch<ActionResult<T>>(`/api/ops/${action}`, { method: 'POST', body: JSON.stringify(input ?? {}) });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Backend tidak bisa dihubungi.' };
  }
}

export async function skuSnapshot(input: unknown): Promise<ActionResult<SkuSnapshot>> {
  return call<SkuSnapshot>('skuSnapshot', input);
}
export async function saveProduction(input: unknown): Promise<ActionResult> {
  return call('saveProduction', input);
}
export async function saveIO(input: unknown): Promise<ActionResult> {
  return call('saveIO', input);
}
export async function deleteMovement(input: unknown): Promise<ActionResult> {
  return call('deleteMovement', input);
}
export async function opnameCreate(input: unknown): Promise<ActionResult<{ id: string }>> {
  return call<{ id: string }>('opnameCreate', input);
}
export async function opnameSetCount(input: unknown): Promise<ActionResult> {
  return call('opnameSetCount', input);
}
export async function opnameFinalize(input: unknown): Promise<ActionResult> {
  return call('opnameFinalize', input);
}
export async function opnameReopen(input: unknown): Promise<ActionResult> {
  return call('opnameReopen', input);
}
export async function opnameDelete(input: unknown): Promise<ActionResult> {
  return call('opnameDelete', input);
}
export async function returCreate(input: unknown): Promise<ActionResult<{ duplicate: string }>> {
  return call<{ duplicate: string }>('returCreate', input);
}
export async function returUpdate(input: unknown): Promise<ActionResult> {
  return call('returUpdate', input);
}
export async function returDelete(input: unknown): Promise<ActionResult> {
  return call('returDelete', input);
}
export async function employeeAdd(input: unknown): Promise<ActionResult> {
  return call('employeeAdd', input);
}
export async function employeeRemove(input: unknown): Promise<ActionResult> {
  return call('employeeRemove', input);
}
export async function attendanceSet(input: unknown): Promise<ActionResult> {
  return call('attendanceSet', input);
}

export async function skuUpdate(input: unknown): Promise<ActionResult> {
  return call('skuUpdate', input);
}
export async function skuAdd(input: unknown): Promise<ActionResult> {
  return call('skuAdd', input);
}
export async function skuRemove(input: unknown): Promise<ActionResult> {
  return call('skuRemove', input);
}
export async function hppApply(input: unknown): Promise<ActionResult> {
  return call('hppApply', input);
}
export async function setOpsConfig(input: unknown): Promise<ActionResult> {
  return call('setOpsConfig', input);
}
export async function warehouseAdd(input: unknown): Promise<ActionResult> {
  return call('warehouseAdd', input);
}
export async function warehouseRename(input: unknown): Promise<ActionResult> {
  return call('warehouseRename', input);
}
export async function warehouseRemove(input: unknown): Promise<ActionResult> {
  return call('warehouseRemove', input);
}
export async function ruleSave(input: unknown): Promise<ActionResult> {
  return call('ruleSave', input);
}
export async function ruleDelete(input: unknown): Promise<ActionResult> {
  return call('ruleDelete', input);
}
export async function packSave(input: unknown): Promise<ActionResult> {
  return call('packSave', input);
}
export async function packDelete(input: unknown): Promise<ActionResult> {
  return call('packDelete', input);
}
export async function sourceSet(input: unknown): Promise<ActionResult> {
  return call('sourceSet', input);
}
export async function leadTimeSet(input: unknown): Promise<ActionResult> {
  return call('leadTimeSet', input);
}
