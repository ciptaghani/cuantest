'use server';

import type { ActionResult } from '@/lib/auth/guard';
import { addAdLogImpl, addPlanImpl, deleteAdLogImpl, deletePlanImpl, setPlanDoneImpl } from './logic';

// Izin (menu Marketing) & validasi Zod dilakukan di logic.ts lewat guardedAction.

export async function addAdLog(input: unknown): Promise<ActionResult> {
  return addAdLogImpl(input);
}

export async function deleteAdLog(input: unknown): Promise<ActionResult> {
  return deleteAdLogImpl(input);
}

export async function addPlan(input: unknown): Promise<ActionResult> {
  return addPlanImpl(input);
}

export async function setPlanDone(input: unknown): Promise<ActionResult> {
  return setPlanDoneImpl(input);
}

export async function deletePlan(input: unknown): Promise<ActionResult> {
  return deletePlanImpl(input);
}
