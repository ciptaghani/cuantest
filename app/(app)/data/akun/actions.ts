'use server';

import type { ActionResult } from '@/lib/auth/guard';
import { createUserImpl, deleteUserImpl, resetPasswordImpl, setActiveImpl, updateAccessImpl } from './logic';

// Izin (admin) & validasi Zod dilakukan di logic.ts lewat guardedAction.

export async function createUser(input: unknown): Promise<ActionResult> {
  return createUserImpl(input);
}

export async function updateAccess(input: unknown): Promise<ActionResult> {
  return updateAccessImpl(input);
}

export async function setActive(input: unknown): Promise<ActionResult> {
  return setActiveImpl(input);
}

export async function resetPassword(input: unknown): Promise<ActionResult> {
  return resetPasswordImpl(input);
}

export async function deleteUser(input: unknown): Promise<ActionResult> {
  return deleteUserImpl(input);
}
