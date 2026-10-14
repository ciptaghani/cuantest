import 'server-only';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { removesLastAdmin, type UserChange } from '@/lib/auth/accounts';
import { guardedAction, type ActionResult } from '@/lib/auth/guard';
import { hashPassword, MIN_PASSWORD_LENGTH } from '@/lib/auth/password';
import { ALL_MENUS } from '@/lib/auth/permissions';

const MenuEnum = z.enum(ALL_MENUS as [string, ...string[]]).transform((m) => m as (typeof ALL_MENUS)[number]);
const RoleEnum = z.enum(['ADMIN', 'STAFF']);
const Password = z.string().min(MIN_PASSWORD_LENGTH, `Password minimal ${MIN_PASSWORD_LENGTH} karakter`).max(200);
const UserId = z.string().min(1).max(40);

const LAST_ADMIN = 'Minimal harus ada satu admin aktif.';

async function guardLastAdmin(change: UserChange): Promise<string | null> {
  const users = await prisma.user.findMany({ select: { id: true, role: true, active: true } });
  return removesLastAdmin(users, change) ? LAST_ADMIN : null;
}

function done(message: string): ActionResult {
  revalidatePath('/data/akun');
  return { ok: true, message };
}

export const createUserImpl = guardedAction(
  'ACCOUNTS',
  z
    .object({
      name: z.string().trim().min(1, 'Isi nama').max(80),
      username: z
        .string()
        .trim()
        .toLowerCase()
        .regex(/^[a-z0-9._-]{3,32}$/, 'ID login 3–32 karakter: huruf kecil, angka, titik, strip, atau garis bawah (tanpa spasi)'),
      password: Password,
      confirm: z.string(),
      role: RoleEnum,
      permissions: z.array(MenuEnum).max(ALL_MENUS.length),
    })
    .refine((v) => v.password === v.confirm, { message: 'Ulangi password tidak sama', path: ['confirm'] }),
  async (v) => {
    if (await prisma.user.findUnique({ where: { username: v.username } })) return { ok: false, error: 'ID login sudah dipakai' };
    await prisma.user.create({
      data: {
        name: v.name,
        username: v.username,
        passwordHash: await hashPassword(v.password),
        role: v.role,
        permissions: { create: (v.role === 'ADMIN' ? ALL_MENUS : v.permissions).map((menu) => ({ menu })) },
      },
    });
    return done(`User ${v.name} ditambahkan`);
  },
);

export const updateAccessImpl = guardedAction(
  'ACCOUNTS',
  z.object({ userId: UserId, role: RoleEnum, permissions: z.array(MenuEnum).max(ALL_MENUS.length) }),
  async (v) => {
    const err = await guardLastAdmin({ userId: v.userId, kind: 'role', role: v.role });
    if (err) return { ok: false, error: err };
    const menus = v.role === 'ADMIN' ? ALL_MENUS : v.permissions;
    await prisma.$transaction([
      prisma.user.update({ where: { id: v.userId }, data: { role: v.role } }),
      prisma.userPermission.deleteMany({ where: { userId: v.userId } }),
      prisma.userPermission.createMany({ data: menus.map((menu) => ({ userId: v.userId, menu })) }),
    ]);
    return done('Akses diperbarui');
  },
);

export const setActiveImpl = guardedAction('ACCOUNTS', z.object({ userId: UserId, active: z.boolean() }), async (v, me) => {
  if (!v.active && v.userId === me.id) return { ok: false, error: 'Tidak bisa menonaktifkan akun sendiri.' };
  const err = await guardLastAdmin({ userId: v.userId, kind: 'active', active: v.active });
  if (err) return { ok: false, error: err };
  await prisma.$transaction([
    prisma.user.update({ where: { id: v.userId }, data: { active: v.active } }),
    // nonaktif → semua session langsung putus
    ...(v.active ? [] : [prisma.session.deleteMany({ where: { userId: v.userId } })]),
  ]);
  return done(v.active ? 'User diaktifkan' : 'User dinonaktifkan');
});

export const resetPasswordImpl = guardedAction('ACCOUNTS', z.object({ userId: UserId, password: Password }), async (v, me) => {
  await prisma.$transaction([
    prisma.user.update({ where: { id: v.userId }, data: { passwordHash: await hashPassword(v.password) } }),
    // keluarkan semua perangkat lain milik user itu (session admin yang sedang dipakai tetap)
    prisma.session.deleteMany({ where: { userId: v.userId, NOT: { id: me.sessionId } } }),
  ]);
  return done('Password diganti');
});

export const deleteUserImpl = guardedAction('ACCOUNTS', z.object({ userId: UserId }), async (v, me) => {
  if (v.userId === me.id) return { ok: false, error: 'Tidak bisa menghapus akun sendiri.' };
  const err = await guardLastAdmin({ userId: v.userId, kind: 'delete' });
  if (err) return { ok: false, error: err };
  await prisma.user.delete({ where: { id: v.userId } });
  return done('User dihapus');
});
