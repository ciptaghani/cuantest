'use server';

import type { ActionResult } from '@/lib/auth/guard';
import { saveInfoImpl } from './logic';

// Izin (menu CS) & validasi Zod dilakukan di logic.ts lewat guardedAction.

export async function saveInfo(input: unknown): Promise<ActionResult> {
  return saveInfoImpl(input);
}
