import { z } from 'zod';
import { AuthError, authorizeAny } from '@/lib/auth/guard';
import { prisma } from '@/lib/db';
import { missingRequired, sanitizeMapping, type ImportSummary } from '@/lib/import/common';
import { IMPORT_KINDS, IMPORT_SPEC, type ImportKind } from '@/lib/import/kinds';
import { planAds, planFees, planOrders } from '@/lib/import/marketplace';
import { planHistory, planOpname, planProductInfo, planSkus } from '@/lib/import/ops';
import { discard, loadStaged } from '@/lib/import/staging';
import { norm } from '@/lib/parse';
import { invalidate, TAGS } from '@/lib/repo/cache';
import { ImportError, importAds, importFees, importHistory, importOpname, importOrders, importProductInfo, importSkus } from '@/lib/repo/imports';

import type { SheetRow } from '@/lib/parse/workbook';

export const runtime = 'nodejs';

const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal YYYY-MM-DD');
const RowSchema = z.object({
  row: z.number(),
  cells: z.record(z.unknown()),
});

const Body = z.object({
  token: z.string().uuid('Upload ulang file.').optional(),
  rows: z.array(RowSchema).optional(),
  headers: z.array(z.string()).optional(),
  mapping: z.record(z.string().max(300)),
  params: z
    .object({
      storeId: z.string().max(40).optional(),
      warehouseId: z.string().max(40).optional(),
      date: DateStr.optional(),
      from: DateStr.optional().or(z.literal('')),
      to: DateStr.optional().or(z.literal('')),
      label: z.string().trim().max(120).optional(),
    })
    .default({}),
  isFinal: z.boolean().optional(),
  batchIndex: z.number().optional(),
  totalBatches: z.number().optional(),
});

const MAX_ERRORS = 100;

function json(summary: ImportSummary, status = 200) {
  const errors = summary.errors.slice(0, MAX_ERRORS);
  if (summary.errors.length > MAX_ERRORS) summary.notes.push(`${summary.errors.length - MAX_ERRORS} error lain tidak ditampilkan.`);
  return Response.json({ ok: status === 200, ...summary, errors }, { status });
}

const fail = (error: string, status = 400) => Response.json({ ok: false, error }, { status });

/** Impor file yang sudah di-upload ke /api/import/parse atau dikirim bertahap (batching) dari browser. */
export async function POST(req: Request, ctx: { params: Promise<{ kind: string }> }): Promise<Response> {
  const { kind: rawKind } = await ctx.params;
  if (!(IMPORT_KINDS as readonly string[]).includes(rawKind)) return fail('Jenis impor tidak dikenal.', 404);
  const kind = rawKind as ImportKind;
  const spec = IMPORT_SPEC[kind];

  let user;
  try {
    user = await authorizeAny(spec.areas);
  } catch (e) {
    if (e instanceof AuthError) return fail(e.message, e.status);
    throw e;
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message || 'Permintaan tidak valid.');
  const { token, rows, params } = parsed.data;
  let inputRows: SheetRow[];
  let headers: string[];
  let stagedFileName = '';

  if (rows && Array.isArray(rows)) {
    inputRows = rows;
    headers = parsed.data.headers || (rows.length ? Object.keys(rows[0].cells) : Object.values(parsed.data.mapping));
  } else if (token) {
    const staged = await loadStaged(user.id, token);
    if (!staged) return fail('File upload sudah kedaluwarsa atau tidak ditemukan. Upload ulang file.', 410);
    inputRows = staged.rows;
    headers = staged.headers;
    stagedFileName = staged.fileName;
  } else {
    return fail('Data baris atau token upload harus disertakan.');
  }

  const mapping = sanitizeMapping(parsed.data.mapping, headers, spec.fields);
  const miss = missingRequired(spec.fields, mapping);
  if (miss) return fail(miss);

  const isFinal = parsed.data.isFinal !== false;

  try {
    let summary: ImportSummary;
    switch (kind) {
      case 'orders': {
        if (!params.storeId) return fail('Pilih toko dulu.');
        if (!mapping.subtotal && !mapping.unit) return fail('Pilih kolom Subtotal atau Harga satuan.');
        summary = await importOrders(params.storeId, planOrders(inputRows, mapping), { isFinal });
        if (isFinal) invalidate(TAGS.marketplace, TAGS.ops);
        break;
      }
      case 'fees': {
        if (!params.storeId) return fail('Pilih toko dulu.');
        summary = await importFees(params.storeId, planFees(inputRows, mapping));
        if (isFinal) invalidate(TAGS.marketplace);
        break;
      }
      case 'ads': {
        if (!params.storeId) return fail('Pilih toko dulu.');
        const plan = planAds(inputRows, mapping, { from: params.from || undefined, to: params.to || undefined });
        if (!plan.ads.length && plan.summary.errors.some((e) => e.row === 0)) return fail(plan.summary.errors[0].message);
        summary = await importAds(params.storeId, plan, { isFinal });
        if (isFinal) invalidate(TAGS.marketplace);
        break;
      }
      case 'sku': {
        const plan = planSkus(inputRows, mapping);
        summary = await importSkus(plan.skus, plan.summary);
        if (isFinal) invalidate(TAGS.ops, TAGS.marketplace);
        break;
      }
      case 'opname': {
        if (!params.warehouseId || !params.date) return fail('Pilih gudang dan tanggal opname.');
        const known = new Set((await prisma.sku.findMany({ select: { code: true } })).map((s) => s.code));
        const plan = planOpname(inputRows, mapping, known);
        summary = await importOpname(params.warehouseId, params.date, plan.counts, user.id, plan.summary);
        if (isFinal) invalidate(TAGS.ops);
        break;
      }
      case 'history': {
        const known = new Set((await prisma.sku.findMany({ select: { code: true } })).map((s) => s.code));
        const plan = planHistory(inputRows, mapping, known);
        summary = await importHistory(plan.avg, params.label || stagedFileName || '', plan.summary, { clearOld: parsed.data.batchIndex === 0 || parsed.data.batchIndex === undefined });
        if (isFinal) invalidate(TAGS.ops);
        break;
      }
      case 'productInfo': {
        const skus = await prisma.sku.findMany({ select: { productKey: true, brand: { select: { name: true } } } });
        const variants = new Map<string, { brand: string; product: string }>();
        for (const s of skus) if (s.brand.name || s.productKey) variants.set(norm(s.brand.name) + '|' + norm(s.productKey), { brand: s.brand.name, product: s.productKey });
        const plan = planProductInfo(inputRows, mapping, variants);
        summary = await importProductInfo(plan.items, plan.summary);
        break;
      }
    }
    if (token) await discard(token);
    return json(summary);
  } catch (e) {
    if (e instanceof ImportError) return fail(e.message);
    console.error('[import]', kind, e);
    return fail('Impor gagal dan dibatalkan seluruhnya (tidak ada data yang tersimpan). Coba lagi atau hubungi admin.', 500);
  }
}
