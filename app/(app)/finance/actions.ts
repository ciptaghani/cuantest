'use server';

import type { ActionResult } from '@/lib/auth/guard';
import * as L from './logic';

// Izin (menu Finance) & validasi Zod dilakukan di logic.ts lewat guardedAction.

export async function saveDoc(input: unknown): Promise<ActionResult> {
  return L.saveDocImpl(input);
}
export async function deleteDoc(input: unknown): Promise<ActionResult> {
  return L.deleteDocImpl(input);
}
export async function savePayment(input: unknown): Promise<ActionResult<{ id: string }>> {
  return L.savePaymentImpl(input);
}
export async function deletePayment(input: unknown): Promise<ActionResult> {
  return L.deletePaymentImpl(input);
}
export async function saveTransfer(input: unknown): Promise<ActionResult> {
  return L.saveTransferImpl(input);
}
export async function deleteTransfer(input: unknown): Promise<ActionResult> {
  return L.deleteTransferImpl(input);
}
export async function bankAdd(input: unknown): Promise<ActionResult> {
  return L.bankAddImpl(input);
}
export async function bankUpdate(input: unknown): Promise<ActionResult> {
  return L.bankUpdateImpl(input);
}
export async function bankRemove(input: unknown): Promise<ActionResult> {
  return L.bankRemoveImpl(input);
}
export async function setStart(input: unknown): Promise<ActionResult> {
  return L.setStartImpl(input);
}
export async function setOpening(input: unknown): Promise<ActionResult> {
  return L.setOpeningImpl(input);
}
export async function openingFromStock(input: unknown): Promise<ActionResult> {
  return L.openingFromStockImpl(input);
}
export async function accountAdd(input: unknown): Promise<ActionResult> {
  return L.accountAddImpl(input);
}
export async function accountRemove(input: unknown): Promise<ActionResult> {
  return L.accountRemoveImpl(input);
}
