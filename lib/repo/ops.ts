import 'server-only';
import { todayKey, type DateKey } from '@/lib/date';
import { prisma } from '@/lib/db';
import { buildOpsModel, variantKey, type DailySales, type MovementType, type OpsInput, type OpsModel } from '@/lib/ops';
import { cached, TAGS } from './cache';
import { dateKey, num, numOrNull, toDbDate } from './convert';

async function load(): Promise<Omit<OpsInput, 'today'>> {
  const [cfg, warehouses, skus, rules, packs, overrides, brands, movements, opnames, sales, history] = await Promise.all([
    prisma.appConfig.findUnique({ where: { id: 1 } }),
    prisma.warehouse.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.sku.findMany({ where: { active: true }, include: { brand: true }, orderBy: { code: 'asc' } }),
    prisma.conversionRule.findMany({ include: { brand: true } }),
    prisma.pack.findMany(),
    prisma.sourceOverride.findMany({ include: { brand: true, sku: true } }),
    prisma.brand.findMany(),
    prisma.stockMovement.findMany({ include: { lines: { include: { sku: true } }, sourceSku: true }, orderBy: [{ date: 'asc' }, { createdAt: 'asc' }] }),
    prisma.opname.findMany({ include: { counts: { include: { sku: true } } }, orderBy: { date: 'asc' } }),
    prisma.dailySale.findMany({ include: { sku: true }, orderBy: { date: 'asc' } }),
    prisma.historyAvg.findMany({ include: { sku: true } }),
  ]);
  const main = cfg?.mainWarehouseId && warehouses.some((w) => w.id === cfg.mainWarehouseId) ? cfg.mainWarehouseId : (warehouses[0]?.id ?? '');
  const salesWh = cfg?.salesWarehouseId && warehouses.some((w) => w.id === cfg.salesWarehouseId) ? cfg.salesWarehouseId : main;

  const salesByDate: Record<DateKey, DailySales> = {};
  for (const s of sales) {
    const d = dateKey(s.date);
    const day = (salesByDate[d] ||= { date: d, source: s.source, rows: {} });
    if (!day.source.split(' + ').includes(s.source)) day.source += ' + ' + s.source;
    day.rows[s.sku.code] = (day.rows[s.sku.code] || 0) + s.qty;
  }
  const sourceOverrides: Record<string, string> = {};
  for (const o of overrides) sourceOverrides[variantKey(o.brand.name, o.productKey)] = o.sku.code;
  const leadTimes: Record<string, number | null> = {};
  for (const b of brands) leadTimes[b.name] = b.leadTimeDays;
  return {
    warehouses: warehouses.map((w) => ({ id: w.id, name: w.name })),
    skus: skus.map((s) => ({ code: s.code, brand: s.brand.name, product: s.productKey, variant: s.variant, ml: num(s.ml), price: num(s.price), cogs: num(s.cogs) })),
    rules: rules.map((r) => ({ brand: r.brand.name, fromMl: num(r.fromMl), toMl: num(r.toMl), qtyPerBottle: num(r.qtyPerBottle), packId: r.packId })),
    packs: packs.map((p) => ({ id: p.id, name: p.name, bottle: num(p.bottle), sticker: num(p.sticker), other: num(p.other) })),
    sourceOverrides,
    leadTimes,
    movements: movements.map((m) => ({
      id: m.id,
      type: m.type,
      date: dateKey(m.date),
      seq: m.createdAt.getTime(),
      warehouseId: m.warehouseId,
      toWarehouseId: m.toWarehouseId,
      sourceSku: m.sourceSku?.code ?? null,
      sourceQty: num(m.sourceQty),
      reason: m.reason ?? '',
      note: m.note ?? '',
      lines: m.lines.map((l) => ({ sku: l.sku.code, qty: l.qty, unitPrice: numOrNull(l.unitPrice) })),
    })),
    opnames: opnames.map((o) => ({
      date: dateKey(o.date),
      warehouseId: o.warehouseId,
      final: o.final,
      counts: Object.fromEntries(o.counts.map((c) => [c.sku.code, c.qty])),
    })),
    sales: salesByDate,
    history: Object.fromEntries(history.map((h) => [h.sku.code, num(h.avgDaily)])),
    historyLabel: cfg?.historyLabel ?? '',
    config: {
      shrinkPct: num(cfg?.shrinkPct) || 95,
      targetDays: cfg?.targetDays || 14,
      avgMode: cfg?.avgMode ?? 'HISTORY',
      avgDays: cfg?.avgDays || 30,
      mainWarehouseId: main,
      salesWarehouseId: salesWh,
    },
  };
}

const getOpsInput = cached(load, 'ops-input', [TAGS.ops]);

/** Model operasional siap hitung (stok, HPP, task) untuk hari ini (WIB). */
export async function getOpsModel(today: DateKey = todayKey()): Promise<OpsModel> {
  return buildOpsModel({ ...(await getOpsInput()), today });
}

// ---------------------------------------------------------------------------
// Riwayat untuk halaman (tidak di-cache: daftar pendek per periode, perlu nama pencatat)
// ---------------------------------------------------------------------------

export interface MovementLogRow {
  id: string;
  type: MovementType;
  date: DateKey;
  warehouseId: string;
  toWarehouseId: string | null;
  sourceSku: string | null;
  sourceQty: number;
  reason: string;
  note: string;
  lines: { sku: string; qty: number; unitPrice: number | null }[];
  /** Dibuat otomatis dari faktur pembelian (hanya bisa diubah di Finance). */
  fromInvoice: boolean;
  by: string;
}

/** Catatan produksi / keluar-masuk dalam periode, terbaru dulu. */
export async function listMovements(types: MovementType[], from: DateKey, to: DateKey): Promise<MovementLogRow[]> {
  const rows = await prisma.stockMovement.findMany({
    where: { type: { in: types }, date: { gte: toDbDate(from), lte: toDbDate(to) } },
    include: { lines: { include: { sku: { select: { code: true } } } }, sourceSku: { select: { code: true } }, createdBy: { select: { name: true } } },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    take: 2000,
  });
  return rows.map((e) => ({
    id: e.id,
    type: e.type,
    date: dateKey(e.date),
    warehouseId: e.warehouseId,
    toWarehouseId: e.toWarehouseId,
    sourceSku: e.sourceSku?.code ?? null,
    sourceQty: num(e.sourceQty),
    reason: e.reason ?? '',
    note: e.note ?? '',
    lines: e.lines.map((l) => ({ sku: l.sku.code, qty: l.qty, unitPrice: numOrNull(l.unitPrice) })),
    fromInvoice: !!e.invoiceId,
    by: e.createdBy?.name ?? '',
  }));
}

export interface RuleRow {
  id: string;
  brand: string;
  fromMl: number;
  toMl: number;
  qtyPerBottle: number;
  packId: string;
}

/** Aturan konversi beserta id-nya (untuk edit per baris di Master & aturan). */
export async function listRules(): Promise<RuleRow[]> {
  const rows = await prisma.conversionRule.findMany({ include: { brand: { select: { name: true } } } });
  return rows
    .map((r) => ({ id: r.id, brand: r.brand.name, fromMl: num(r.fromMl), toMl: num(r.toMl), qtyPerBottle: num(r.qtyPerBottle), packId: r.packId ?? '' }))
    .sort((a, b) => a.brand.localeCompare(b.brand) || a.fromMl - b.fromMl || a.toMl - b.toMl);
}

export interface OpnameSession {
  id: string;
  date: DateKey;
  warehouseId: string;
  final: boolean;
  /** SKU yang sudah diisi qty-nya. */
  filled: number;
}

export async function listOpnames(): Promise<OpnameSession[]> {
  const rows = await prisma.opname.findMany({ include: { _count: { select: { counts: { where: { qty: { not: null } } } } } }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }] });
  return rows.map((o) => ({ id: o.id, date: dateKey(o.date), warehouseId: o.warehouseId, final: o.final, filled: o._count.counts }));
}

/** Hitungan fisik satu sesi opname (kode SKU → qty, null = belum dihitung). */
export async function opnameCounts(id: string): Promise<Record<string, number | null>> {
  const rows = await prisma.opnameCount.findMany({ where: { opnameId: id }, select: { qty: true, sku: { select: { code: true } } } });
  return Object.fromEntries(rows.map((c) => [c.sku.code, c.qty]));
}

export interface ReturnRow {
  id: string;
  date: DateKey;
  code: string;
  matches: boolean;
  processed: boolean;
  note: string;
  by: string;
}

export async function listReturns(from: DateKey, to: DateKey): Promise<ReturnRow[]> {
  const rows = await prisma.returnNote.findMany({
    where: { date: { gte: toDbDate(from), lte: toDbDate(to) } },
    include: { createdBy: { select: { name: true } } },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    take: 5000,
  });
  return rows.map((r) => ({ id: r.id, date: dateKey(r.date), code: r.code, matches: r.matches, processed: r.processed, note: r.note ?? '', by: r.createdBy?.name ?? '' }));
}

export interface AttendanceMonth {
  employees: { id: string; name: string }[];
  /** employeeId → hari (1–31) → isian */
  days: Record<string, Record<number, { present: boolean; note: string }>>;
}

/** Absensi satu bulan (`YYYY-MM`). Karyawan nonaktif yang punya catatan di bulan itu tetap ditampilkan. */
export async function attendanceMonth(month: string, lastDay: number): Promise<AttendanceMonth> {
  const [emps, rows] = await Promise.all([
    prisma.employee.findMany({ orderBy: { name: 'asc' } }),
    prisma.attendance.findMany({ where: { date: { gte: toDbDate(`${month}-01`), lte: toDbDate(`${month}-${String(lastDay).padStart(2, '0')}`) } } }),
  ]);
  const days: AttendanceMonth['days'] = {};
  for (const a of rows) (days[a.employeeId] ||= {})[Number(dateKey(a.date).slice(8))] = { present: a.present, note: a.note ?? '' };
  return { employees: emps.filter((e) => e.active || days[e.id]).map((e) => ({ id: e.id, name: e.name })), days };
}
