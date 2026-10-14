import 'server-only';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { guardedAction, type ActionResult } from '@/lib/auth/guard';
import { prisma } from '@/lib/db';
import { toDbDate } from '@/lib/repo/convert';
import { LOG_TYPES, PLAN_CATS } from './constants';

const Id = z.string().min(1).max(40);
const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Isi tanggal');

function done(path: string, message: string): ActionResult {
  revalidatePath(path);
  return { ok: true, message };
}

async function catalogId(storeId: string, key: string): Promise<string | null | false> {
  if (!key) return null;
  const c = await prisma.catalog.findUnique({ where: { storeId_externalKey: { storeId, externalKey: key } }, select: { id: true } });
  return c ? c.id : false;
}

export const addAdLogImpl = guardedAction(
  'MARKETING',
  z.object({
    date: DateStr,
    storeId: Id,
    catalogKey: z.string().max(191).default(''),
    type: z.enum(LOG_TYPES),
    from: z.string().trim().max(100).default(''),
    to: z.string().trim().max(100).default(''),
    note: z.string().trim().max(2000).default(''),
  }),
  async (v, user) => {
    const cat = await catalogId(v.storeId, v.catalogKey);
    if (cat === false) return { ok: false, error: 'Katalog tidak ditemukan' };
    if (!(await prisma.store.count({ where: { id: v.storeId } }))) return { ok: false, error: 'Toko tidak ditemukan' };
    await prisma.adChangeLog.create({
      data: { date: toDbDate(v.date), storeId: v.storeId, catalogId: cat, type: v.type, fromValue: v.from || null, toValue: v.to || null, note: v.note || null, createdById: user.id },
    });
    return done('/marketing/ads', 'Log tersimpan');
  },
);

export const deleteAdLogImpl = guardedAction('MARKETING', z.object({ id: Id }), async (v) => {
  await prisma.adChangeLog.deleteMany({ where: { id: v.id } });
  return done('/marketing/ads', 'Log dihapus');
});

export const addPlanImpl = guardedAction(
  'MARKETING',
  z.object({
    date: DateStr,
    title: z.string().trim().min(1, 'Isi judul rencana').max(191),
    category: z.enum(PLAN_CATS),
    storeId: z.string().max(40).default(''),
    note: z.string().trim().max(2000).default(''),
  }),
  async (v, user) => {
    if (v.storeId && !(await prisma.store.count({ where: { id: v.storeId } }))) return { ok: false, error: 'Toko tidak ditemukan' };
    await prisma.marketingPlan.create({ data: { date: toDbDate(v.date), title: v.title, category: v.category, storeId: v.storeId || null, note: v.note || null, createdById: user.id } });
    return done('/marketing/planning', 'Rencana tersimpan');
  },
);

export const setPlanDoneImpl = guardedAction('MARKETING', z.object({ id: Id, done: z.boolean() }), async (v) => {
  await prisma.marketingPlan.updateMany({ where: { id: v.id }, data: { done: v.done } });
  return done('/marketing/planning', v.done ? 'Selesai' : 'Dibuka lagi');
});

export const deletePlanImpl = guardedAction('MARKETING', z.object({ id: Id }), async (v) => {
  await prisma.marketingPlan.deleteMany({ where: { id: v.id } });
  return done('/marketing/planning', 'Rencana dihapus');
});
