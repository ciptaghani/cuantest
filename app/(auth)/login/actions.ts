'use client';

import type { ActionResult } from '@/lib/auth/guard';
import { apiFetch, backendUrl } from '@/lib/api';
import { firstAllowedPath } from '@/lib/auth/permissions';

export interface LoginState {
  error: string;
}

/** Login via backend Express (JWT di cookie httpOnly, dikirim otomatis browser). */
export async function login(username: string, password: string): Promise<ActionResult<{ path: string }>> {
  const u = username.trim().toLowerCase();
  if (!u) return { ok: false, error: 'Isi ID' };
  if (!password) return { ok: false, error: 'Isi password' };
  let res: Response;
  try {
    res = await fetch(backendUrl('/api/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username: u, password }),
    });
  } catch {
    return { ok: false, error: 'Backend tidak bisa dihubungi. Pastikan service Express jalan, lalu coba lagi.' };
  }
  if (!res.ok) {
    let msg = 'ID atau password salah.';
    try {
      msg = ((await res.json()) as { message?: string }).message || msg;
    } catch {
      /* abaikan */
    }
    return { ok: false, error: msg };
  }
  const { user } = (await res.json()) as { user?: { role: 'ADMIN' | 'STAFF'; active: boolean; permissions: never[] } };
  if (!user) return { ok: false, error: 'Backend tidak mengembalikan user.' };
  return { ok: true, data: { path: firstAllowedPath({ role: user.role, active: user.active, permissions: user.permissions }) } };
}

export async function logout(): Promise<void> {
  try {
    await apiFetch('/api/auth/logout', { method: 'POST' });
  } catch {
    /* abaikan */
  }
  window.location.href = '/login';
}
