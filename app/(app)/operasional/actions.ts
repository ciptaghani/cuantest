'use server';

import type { ActionResult } from '@/lib/auth/guard';
import * as L from './logic';
import * as M from './masterLogic';

// Izin (menu Operasional) & validasi Zod dilakukan di logic.ts / masterLogic.ts lewat guardedAction.

export async function skuSnapshot(input: unknown): Promise<ActionResult<L.SkuSnapshot>> {
  return L.skuSnapshotImpl(input);
}
export async function saveProduction(input: unknown): Promise<ActionResult> {
  return L.saveProductionImpl(input);
}
export async function saveIO(input: unknown): Promise<ActionResult> {
  return L.saveIOImpl(input);
}
export async function deleteMovement(input: unknown): Promise<ActionResult> {
  return L.deleteMovementImpl(input);
}
export async function opnameCreate(input: unknown): Promise<ActionResult<{ id: string }>> {
  return L.opnameCreateImpl(input);
}
export async function opnameSetCount(input: unknown): Promise<ActionResult> {
  return L.opnameSetCountImpl(input);
}
export async function opnameFinalize(input: unknown): Promise<ActionResult> {
  return L.opnameFinalizeImpl(input);
}
export async function opnameReopen(input: unknown): Promise<ActionResult> {
  return L.opnameReopenImpl(input);
}
export async function opnameDelete(input: unknown): Promise<ActionResult> {
  return L.opnameDeleteImpl(input);
}
export async function returCreate(input: unknown): Promise<ActionResult<{ duplicate: string }>> {
  return L.returCreateImpl(input);
}
export async function returUpdate(input: unknown): Promise<ActionResult> {
  return L.returUpdateImpl(input);
}
export async function returDelete(input: unknown): Promise<ActionResult> {
  return L.returDeleteImpl(input);
}
export async function employeeAdd(input: unknown): Promise<ActionResult> {
  return L.employeeAddImpl(input);
}
export async function employeeRemove(input: unknown): Promise<ActionResult> {
  return L.employeeRemoveImpl(input);
}
export async function attendanceSet(input: unknown): Promise<ActionResult> {
  return L.attendanceSetImpl(input);
}

export async function skuUpdate(input: unknown): Promise<ActionResult> {
  return M.skuUpdateImpl(input);
}
export async function skuAdd(input: unknown): Promise<ActionResult> {
  return M.skuAddImpl(input);
}
export async function skuRemove(input: unknown): Promise<ActionResult> {
  return M.skuRemoveImpl(input);
}
export async function hppApply(input: unknown): Promise<ActionResult> {
  return M.hppApplyImpl(input);
}
export async function setOpsConfig(input: unknown): Promise<ActionResult> {
  return M.setConfigImpl(input);
}
export async function warehouseAdd(input: unknown): Promise<ActionResult> {
  return M.warehouseAddImpl(input);
}
export async function warehouseRename(input: unknown): Promise<ActionResult> {
  return M.warehouseRenameImpl(input);
}
export async function warehouseRemove(input: unknown): Promise<ActionResult> {
  return M.warehouseRemoveImpl(input);
}
export async function ruleSave(input: unknown): Promise<ActionResult> {
  return M.ruleSaveImpl(input);
}
export async function ruleDelete(input: unknown): Promise<ActionResult> {
  return M.ruleDeleteImpl(input);
}
export async function packSave(input: unknown): Promise<ActionResult> {
  return M.packSaveImpl(input);
}
export async function packDelete(input: unknown): Promise<ActionResult> {
  return M.packDeleteImpl(input);
}
export async function sourceSet(input: unknown): Promise<ActionResult> {
  return M.sourceSetImpl(input);
}
export async function leadTimeSet(input: unknown): Promise<ActionResult> {
  return M.leadTimeSetImpl(input);
}
