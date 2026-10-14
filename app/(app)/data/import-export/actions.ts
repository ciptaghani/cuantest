'use server';

import type { ActionResult } from '@/lib/auth/guard';
import { addManualAdImpl, createStoreImpl, deleteStoreImpl, setAdMatchImpl, setTargetMarginImpl, updateStoreImpl } from './logic';

// Izin (menu Data) & validasi Zod dilakukan di logic.ts lewat guardedAction.

export async function createStore(input: unknown): Promise<ActionResult> {
  return createStoreImpl(input);
}

export async function updateStore(input: unknown): Promise<ActionResult> {
  return updateStoreImpl(input);
}

export async function deleteStore(input: unknown): Promise<ActionResult> {
  return deleteStoreImpl(input);
}

export async function setTargetMargin(input: unknown): Promise<ActionResult> {
  return setTargetMarginImpl(input);
}

export async function setAdMatch(input: unknown): Promise<ActionResult> {
  return setAdMatchImpl(input);
}

export async function addManualAd(input: unknown): Promise<ActionResult> {
  return addManualAdImpl(input);
}
