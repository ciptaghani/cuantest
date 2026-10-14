import 'server-only';
import { redirect } from 'next/navigation';
import type { z } from 'zod';
import { canAccess, type Area } from './permissions';
import { getCurrentUser, type CurrentUser } from './session';

export class AuthError extends Error {
  constructor(
    public status: 401 | 403,
    message: string,
  ) {
    super(message);
  }
}

/** Halaman: wajib login, kalau belum → /login. */
export async function requireUser(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) redirect('/login');
  return u;
}

/**
 * Halaman: wajib login + punya akses ke area, kalau tidak → /tidak-ada-akses.
 * Panggil di baris pertama setiap page.tsx, sebelum memuat data. `<AreaGate>` di layout saja tidak cukup:
 * Next.js merender page paralel dengan layout, jadi isi page tetap ikut terkirim walaupun layout menolak.
 */
export async function requireArea(area: Area): Promise<CurrentUser> {
  const u = await requireUser();
  if (!canAccess(u, area)) redirect('/tidak-ada-akses');
  return u;
}

/** Server action / logika server: wajib login + punya akses ke area. Melempar AuthError. */
export async function authorize(area: Area): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) throw new AuthError(401, 'Sesi berakhir. Silakan masuk lagi.');
  if (!canAccess(u, area)) throw new AuthError(403, 'Kamu tidak punya akses ke menu ini.');
  return u;
}

/** Seperti `authorize`, tapi cukup punya akses ke salah satu area. */
export async function authorizeAny(areas: Area[]): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) throw new AuthError(401, 'Sesi berakhir. Silakan masuk lagi.');
  if (!areas.some((a) => canAccess(u, a))) throw new AuthError(403, 'Kamu tidak punya akses ke menu ini.');
  return u;
}

/** ID user untuk kolom createdBy. */
export async function actorId(): Promise<string> {
  return (await requireUser()).id;
}

export type ActionResult<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

/**
 * Bungkus server action: cek izin dulu, lalu validasi input dengan Zod.
 * Semua server action di app wajib lewat sini (Definition of Done).
 */
export function guardedAction<S extends z.ZodTypeAny, T = undefined>(
  area: Area,
  schema: S,
  fn: (input: z.infer<S>, user: CurrentUser) => Promise<ActionResult<T>>,
): (input: unknown) => Promise<ActionResult<T>> {
  return async (input: unknown) => {
    let user: CurrentUser;
    try {
      user = await authorize(area);
    } catch (e) {
      if (e instanceof AuthError) return { ok: false, error: e.message };
      throw e;
    }
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      const flat = parsed.error.flatten();
      return { ok: false, error: flat.formErrors[0] || 'Isian belum lengkap atau tidak valid.', fieldErrors: flat.fieldErrors as Record<string, string[]> };
    }
    return fn(parsed.data, user);
  };
}

/** Route handler: 401 kalau belum login, 403 kalau tidak punya akses. */
export function withArea<C>(area: Area | Area[], handler: (req: Request, ctx: C, user: CurrentUser) => Promise<Response>) {
  return async (req: Request, ctx: C): Promise<Response> => {
    try {
      const user = Array.isArray(area) ? await authorizeAny(area) : await authorize(area);
      return await handler(req, ctx, user);
    } catch (e) {
      if (e instanceof AuthError) return Response.json({ error: e.message }, { status: e.status });
      throw e;
    }
  };
}
