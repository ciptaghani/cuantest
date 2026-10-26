'use client';

import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { canAccess, type Area, type Menu, type Role } from './permissions';

export type { Area };

export interface CurrentUser {
  id: string;
  name: string;
  username: string;
  role: Role;
  active: boolean;
  permissions: Menu[];
}

export type ActionResult<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

/** User yang sedang login (dicek ke backend Express via cookie httpOnly). */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  try {
    const r = await apiFetch<{ user: CurrentUser }>('/api/auth/me');
    return r.user;
  } catch {
    return null;
  }
}

/** Halaman: wajib login, kalau belum → /login. */
export async function requireUser(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) redirect('/login');
  return u;
}

/** Halaman: wajib login + punya akses ke area, kalau tidak → /tidak-ada-akses. */
