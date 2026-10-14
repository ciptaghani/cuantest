import 'server-only';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { guardedAction, type ActionResult } from '@/lib/auth/guard';
import { prisma } from '@/lib/db';
import { convRatio, decantsOf, geserTargets, hppCalc, opnameFinalFill, opnameRows, skuLabel, stockCalc } from '@/lib/ops';
import { invalidate, TAGS } from '@/lib/repo/cache';
import { toDbDate } from '@/lib/repo/convert';
import { getOpsModel } from '@/lib/repo/ops';
import { OUT_REASONS } from './constants';

const Id = z.string().min(1).max(40);
const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Isi tanggal');
const Code = z.string().trim().min(1, 'Isi SKU').max(191);
const Note = z.string().trim().max(2000).default('');

function ok(message: string, paths: string[]): ActionResult {
  for (const p of paths) revalidatePath(p);
  return { ok: true, message };
}

async function skuIds(codes: string[]): Promise<Map<string, string>> {
  const rows = await prisma.sku.findMany({ where: { code: { in: codes } }, select: { id: true, code: true } });
  return new Map(rows.map((r) => [r.code, r.id]));
}

async function activeWarehouse(id: string) {
  return prisma.warehouse.findFirst({ where: { id, active: true } });
}

// ---------------------------------------------------------------------------
// Info SKU untuk form (stok per gudang, HPP, hasil produksi)
// ---------------------------------------------------------------------------

export interface SkuSnapshot {
  code: string;
  label: string;
  category: string;
  ml: number;
  hpp: number;
  stock: { id: string; name: string; now: number }[];
  /** Hasil produksi/geser yang mungkin (hanya kalau diminta). */
  targets: { code: string; label: string; ml: number; ratio: number; stock: number }[];
}

export const skuSnapshotImpl = guardedAction(
  'OPS',
  z.object({ sku: z.string().trim().max(191), mode: z.enum(['io', 'PRODUCTION', 'SHIFT']).default('io'), warehouseId: z.string().max(40).default('') }),
  async (v) => {
    const m = await getOpsModel();
    const s = m.skuMap[v.sku];
    if (!s) return { ok: false as const, error: 'SKU tidak ada di master.' };
    const { per } = stockCalc(m);
    const stock = m.warehouses.map((w) => ({ id: w.id, name: w.name, now: per[w.id]?.[v.sku]?.now ?? 0 }));
    const targets =
      v.mode === 'io'
        ? []
        : (v.mode === 'SHIFT' ? geserTargets(m, v.sku) : decantsOf(m, v.sku)).map((t) => ({
            code: t.code,
            label: skuLabel(t),
            ml: t.ml,
            ratio: convRatio(m, s, t),
            stock: per[v.warehouseId]?.[t.code]?.now ?? 0,
          }));
    const data: SkuSnapshot = { code: s.code, label: skuLabel(s), category: s.category, ml: s.ml, hpp: hppCalc(m)[v.sku]?.now ?? s.cogs, stock, targets };
    return { ok: true as const, data };
  },
);

// ---------------------------------------------------------------------------
// Produksi & geser decant
// ---------------------------------------------------------------------------

export const saveProductionImpl = guardedAction(
  'OPS',
  z.object({
    type: z.enum(['PRODUCTION', 'SHIFT']),
    date: DateStr,
    warehouseId: Id,
    src: Code,
    bottles: z.coerce.number().min(0, 'Qty sumber tidak boleh minus').max(1e6),
    outs: z.array(z.object({ sku: Code, qty: z.coerce.number().int('Qty hasil harus bilangan bulat').min(0).max(1e7) })).max(300),
    note: Note,
  }),
  async (v, user) => {
    const m = await getOpsModel();
    const src = m.skuMap[v.src];
    if (!src) return { ok: false, error: v.type === 'SHIFT' ? 'Pilih SKU sumber decant atau fullsize dari master' : 'Pilih SKU fullsize sumber dari master' };
    if (v.type === 'SHIFT' && src.category !== 'Decant' && src.category !== 'Fullsize') return { ok: false, error: 'Geser decant hanya dari SKU decant atau fullsize' };
    if (!(await activeWarehouse(v.warehouseId))) return { ok: false, error: 'Gudang tidak ditemukan' };
    const outs = v.outs.filter((o) => o.qty > 0 && (v.type !== 'SHIFT' || o.sku !== v.src));
    if (v.type === 'SHIFT' && !v.bottles) return { ok: false, error: 'Isi qty sumber yang dipakai' };
    if (!outs.length) return { ok: false, error: v.type === 'SHIFT' ? 'Isi qty hasil geser' : 'Isi qty decant yang dihasilkan' };
    const ids = await skuIds([v.src, ...outs.map((o) => o.sku)]);
    const unknown = outs.filter((o) => !ids.has(o.sku)).map((o) => o.sku);
    if (unknown.length) return { ok: false, error: `SKU tidak ada di master: ${unknown.join(', ')}` };
    await prisma.stockMovement.create({
      data: {
        type: v.type,
        date: toDbDate(v.date),
        warehouseId: v.warehouseId,
        sourceSkuId: ids.get(v.src),
        sourceQty: v.bottles,
        note: v.note || null,
        createdById: user.id,
        lines: { create: outs.map((o) => ({ skuId: ids.get(o.sku) as string, qty: o.qty })) },
      },
    });
    invalidate(TAGS.ops);
    return ok('Tersimpan. Stok sudah diperbarui.', ['/operasional', '/operasional/produksi']);
  },
);

// ---------------------------------------------------------------------------
// Barang masuk / keluar / pindah gudang
// ---------------------------------------------------------------------------

export const saveIOImpl = guardedAction(
  'OPS',
  z
    .object({
      type: z.enum(['IN', 'OUT', 'TRANSFER']),
      date: DateStr,
      warehouseId: Id,
      toWarehouseId: z.string().max(40).default(''),
      sku: Code,
      qty: z.coerce.number().int('Qty harus bilangan bulat').positive('Isi qty').max(1e7),
      price: z.union([z.literal(''), z.coerce.number().min(0, 'Harga tidak boleh minus').max(1e12)]).default(''),
      reason: z.string().max(60).default(''),
      note: Note,
    })
    .refine((v) => v.type !== 'TRANSFER' || (v.toWarehouseId && v.toWarehouseId !== v.warehouseId), { message: 'Pilih gudang tujuan yang berbeda', path: ['toWarehouseId'] })
    .refine((v) => v.type !== 'OUT' || (OUT_REASONS as readonly string[]).includes(v.reason), { message: 'Pilih alasan barang keluar', path: ['reason'] }),
  async (v, user) => {
    const ids = await skuIds([v.sku]);
    if (!ids.has(v.sku)) return { ok: false, error: 'SKU tidak ada di master. Tambahkan dulu di Master & aturan.' };
    if (!(await activeWarehouse(v.warehouseId))) return { ok: false, error: 'Gudang tidak ditemukan' };
    if (v.type === 'TRANSFER' && !(await activeWarehouse(v.toWarehouseId))) return { ok: false, error: 'Gudang tujuan tidak ditemukan' };
    await prisma.stockMovement.create({
      data: {
        type: v.type,
        date: toDbDate(v.date),
        warehouseId: v.warehouseId,
        toWarehouseId: v.type === 'TRANSFER' ? v.toWarehouseId : null,
        reason: v.type === 'OUT' ? v.reason : null,
        note: v.note || null,
        createdById: user.id,
        lines: { create: [{ skuId: ids.get(v.sku) as string, qty: v.qty, unitPrice: v.type === 'IN' && v.price !== '' ? v.price : null }] },
      },
    });
    invalidate(TAGS.ops);
    const label = { IN: 'Barang masuk', OUT: 'Barang keluar', TRANSFER: 'Pindah gudang' }[v.type];
    return ok(`${label} tersimpan`, ['/operasional', '/operasional/keluar-masuk']);
  },
);

export const deleteMovementImpl = guardedAction('OPS', z.object({ id: Id }), async (v) => {
  const mv = await prisma.stockMovement.findUnique({ where: { id: v.id }, select: { invoiceId: true } });
  if (!mv) return { ok: false, error: 'Catatan tidak ditemukan' };
  if (mv.invoiceId) return { ok: false, error: 'Catatan ini dibuat dari faktur pembelian. Ubah atau hapus fakturnya di Finance.' };
  await prisma.stockMovement.delete({ where: { id: v.id } });
  invalidate(TAGS.ops);
  return ok('Catatan dihapus. Stok dihitung ulang.', ['/operasional/produksi', '/operasional/keluar-masuk']);
});

// ---------------------------------------------------------------------------
// Stock opname (input per baris supaya bisa dikerjakan bersamaan)
// ---------------------------------------------------------------------------

export const opnameCreateImpl = guardedAction('OPS', z.object({ date: DateStr, warehouseId: Id }), async (v, user) => {
  const wh = await activeWarehouse(v.warehouseId);
  if (!wh) return { ok: false as const, error: 'Gudang tidak ditemukan' };
  const ex = await prisma.opname.findUnique({ where: { warehouseId_date: { warehouseId: v.warehouseId, date: toDbDate(v.date) } } });
  if (ex) return { ok: true as const, data: { id: ex.id }, message: 'Sesi opname sudah ada, dibuka.' };
  const op = await prisma.opname.create({ data: { date: toDbDate(v.date), warehouseId: v.warehouseId, createdById: user.id } });
  invalidate(TAGS.ops);
  revalidatePath('/operasional/opname');
  return { ok: true as const, data: { id: op.id }, message: `Sesi opname ${wh.name} dibuat` };
});

async function draftOpname(id: string) {
  const op = await prisma.opname.findUnique({ where: { id } });
  if (!op) return { error: 'Sesi opname tidak ditemukan' } as const;
  if (op.final) return { error: 'Sesi ini sudah final. Buka lagi dulu untuk mengubah.' } as const;
  return { op } as const;
}

export const opnameSetCountImpl = guardedAction(
  'OPS',
  z.object({ opnameId: Id, sku: Code, qty: z.union([z.null(), z.coerce.number().int('Qty harus bilangan bulat').min(0, 'Qty tidak boleh minus').max(1e7)]) }),
  async (v, user) => {
    const d = await draftOpname(v.opnameId);
    if ('error' in d) return { ok: false, error: d.error as string };
    const ids = await skuIds([v.sku]);
    const skuId = ids.get(v.sku);
    if (!skuId) return { ok: false, error: 'SKU tidak ada di master' };
    await prisma.opnameCount.upsert({
      where: { opnameId_skuId: { opnameId: v.opnameId, skuId } },
      create: { opnameId: v.opnameId, skuId, qty: v.qty, countedById: user.id },
      update: { qty: v.qty, countedById: user.id },
    });
    // Hitungan draft tidak memengaruhi stok (hanya opname final), jadi cache model ops tidak perlu dibuang.
    return { ok: true };
  },
);

export const opnameFinalizeImpl = guardedAction('OPS', z.object({ opnameId: Id }), async (v, user) => {
  const d = await draftOpname(v.opnameId);
  if ('error' in d) return { ok: false, error: d.error as string };
  const op = d.op;
  const m = await getOpsModel();
  const counts = await prisma.opnameCount.findMany({ where: { opnameId: op.id }, include: { sku: { select: { code: true } } } });
  const rows = opnameRows(m, { date: op.date.toISOString().slice(0, 10), warehouseId: op.warehouseId, counts: Object.fromEntries(counts.map((c) => [c.sku.code, c.qty])) });
  const fill = opnameFinalFill(rows);
  const ids = await skuIds(Object.keys(fill));
  await prisma.$transaction(
    async (tx) => {
      const data = Object.entries(fill)
        .filter(([c]) => ids.has(c))
        .map(([c, q]) => ({ opnameId: op.id, skuId: ids.get(c) as string, qty: Math.round(q), countedById: user.id }));
      // baris kosong yang sudah ada (qty null) diganti stok sistem
      await tx.opnameCount.deleteMany({ where: { opnameId: op.id, qty: null } });
      for (let i = 0; i < data.length; i += 1000) await tx.opnameCount.createMany({ data: data.slice(i, i + 1000), skipDuplicates: true });
      await tx.opname.update({ where: { id: op.id }, data: { final: true, finalizedAt: new Date() } });
    },
    { timeout: 120_000 },
  );
  invalidate(TAGS.ops);
  return ok('Opname final. Stok real-time memakai baseline baru.', ['/operasional/opname', '/operasional/stok']);
});

export const opnameReopenImpl = guardedAction('OPS', z.object({ opnameId: Id }), async (v) => {
  await prisma.opname.update({ where: { id: v.opnameId }, data: { final: false, finalizedAt: null } });
  invalidate(TAGS.ops);
  return ok('Sesi dibuka lagi. Selama dibuka, stok memakai baseline sebelumnya.', ['/operasional/opname']);
});

export const opnameDeleteImpl = guardedAction('OPS', z.object({ opnameId: Id }), async (v) => {
  const d = await draftOpname(v.opnameId);
  if ('error' in d) return { ok: false, error: d.error as string };
  await prisma.opname.delete({ where: { id: v.opnameId } });
  invalidate(TAGS.ops);
  return ok('Sesi opname dihapus', ['/operasional/opname']);
});

// ---------------------------------------------------------------------------
// Retur (catatan saja, tidak mengubah stok)
// ---------------------------------------------------------------------------

export const returCreateImpl = guardedAction(
  'OPS',
  z.object({ date: DateStr, code: z.string().trim().min(1, 'Scan / ketik no. resi').max(191), matches: z.boolean(), force: z.boolean().default(false) }),
  async (v, user) => {
    if (!v.force) {
      const dup = await prisma.returnNote.findFirst({ where: { code: { equals: v.code, mode: 'insensitive' } }, select: { date: true } });
      if (dup) return { ok: true as const, data: { duplicate: dup.date.toISOString().slice(0, 10) } };
    }
    await prisma.returnNote.create({ data: { date: toDbDate(v.date), code: v.code, matches: v.matches, createdById: user.id } });
    revalidatePath('/operasional/retur');
    return { ok: true as const, data: { duplicate: '' }, message: `${v.code} tersimpan · ${v.matches ? 'Sesuai' : 'Tidak sesuai'}` };
  },
);

export const returUpdateImpl = guardedAction(
  'OPS',
  z.object({ id: Id, matches: z.boolean().optional(), processed: z.boolean().optional(), note: z.string().trim().max(2000).optional() }),
  async ({ id, ...data }) => {
    await prisma.returnNote.updateMany({ where: { id }, data: { ...data, note: data.note === undefined ? undefined : data.note || null } });
    return ok('Tersimpan', ['/operasional/retur']);
  },
);

export const returDeleteImpl = guardedAction('OPS', z.object({ id: Id }), async (v) => {
  await prisma.returnNote.deleteMany({ where: { id: v.id } });
  return ok('Retur dihapus', ['/operasional/retur']);
});

// ---------------------------------------------------------------------------
// Absensi (per sel, supaya input bersamaan tidak saling menimpa)
// ---------------------------------------------------------------------------

export const employeeAddImpl = guardedAction('OPS', z.object({ name: z.string().trim().min(1, 'Isi nama karyawan').max(100) }), async (v) => {
  await prisma.employee.create({ data: { name: v.name } });
  return ok(`${v.name} ditambahkan`, ['/operasional/absensi']);
});

export const employeeRemoveImpl = guardedAction('OPS', z.object({ id: Id }), async (v) => {
  await prisma.employee.updateMany({ where: { id: v.id }, data: { active: false } });
  return ok('Karyawan dihapus dari daftar. Riwayat absensinya tetap tersimpan.', ['/operasional/absensi']);
});

export const attendanceSetImpl = guardedAction(
  'OPS',
  z.object({ employeeId: Id, date: DateStr, present: z.boolean().optional(), note: z.string().trim().max(500).optional() }),
  async (v, user) => {
    if (!(await prisma.employee.count({ where: { id: v.employeeId } }))) return { ok: false, error: 'Karyawan tidak ditemukan' };
    const data = { ...(v.present !== undefined ? { present: v.present } : {}), ...(v.note !== undefined ? { note: v.note || null } : {}), updatedById: user.id };
    await prisma.attendance.upsert({
      where: { employeeId_date: { employeeId: v.employeeId, date: toDbDate(v.date) } },
      create: { employeeId: v.employeeId, date: toDbDate(v.date), present: v.present ?? false, note: v.note || null, updatedById: user.id },
      update: data,
    });
    revalidatePath('/operasional/absensi');
    return { ok: true, message: v.note !== undefined ? (v.note ? 'Catatan tersimpan' : 'Catatan dihapus') : undefined };
  },
);
