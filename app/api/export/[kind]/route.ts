import { AuthError, authorizeAny } from '@/lib/auth/guard';
import type { Area } from '@/lib/auth/permissions';
import { isValidDateKey, todayKey } from '@/lib/date';
import { accountName, cashFlow, cashFlowRows, glSummary, profitLoss, profitLossRows, type StatementRow } from '@/lib/finance';
import { prisma } from '@/lib/db';
import { historyTemplate, opnameTemplate, productInfoTemplate, skuTemplate } from '@/lib/import/templates';
import { stockCalc } from '@/lib/ops/stock';
import { writeWorkbook, XLSX_MIME, type SheetSpec } from '@/lib/parse/workbook';
import { dateKey, num, toDbDate } from '@/lib/repo/convert';
import { getFinanceInput, getLedger } from '@/lib/repo/finance';
import { getOpsModel } from '@/lib/repo/ops';

export const runtime = 'nodejs';

const AREAS: Record<string, Area[]> = {
  'sku-template': ['DATA'],
  'sku-master': ['DATA'],
  'opname-template': ['DATA', 'OPS'],
  'product-info-template': ['DATA', 'CS'],
  'history-template': ['DATA', 'OPS'],
  'laba-rugi': ['FINANCE'],
  'arus-kas': ['FINANCE'],
  'buku-besar': ['FINANCE'],
};

/** Baris laporan → sheet (judul, periode, lalu Deskripsi | Nilai dengan indentasi). */
const statementSheet = (name: string, title: string, from: string, to: string, rows: StatementRow[]): SheetSpec => ({
  name,
  cols: [52, 18],
  rows: [[title], [`Dari ${from} s/d ${to}`], [], ['Deskripsi', 'Nilai'], ...rows.map((r) => ['   '.repeat(r.level) + r.label, r.value === null ? null : Math.round(r.value)])],
});

const fail = (error: string, status = 400) => Response.json({ error }, { status });

function file(name: string, sheets: SheetSpec[]): Response {
  const body = writeWorkbook(sheets);
  return new Response(body, {
    headers: {
      'Content-Type': XLSX_MIME,
      'Content-Disposition': `attachment; filename="${name.replace(/[^\w .&()-]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      'Cache-Control': 'no-store',
    },
  });
}

/** Download template / data dalam format Excel (nama kolom sama dengan versi HTML). */
export async function GET(req: Request, ctx: { params: Promise<{ kind: string }> }): Promise<Response> {
  const { kind } = await ctx.params;
  const areas = AREAS[kind];
  if (!areas) return fail('Jenis file tidak dikenal.', 404);
  try {
    await authorizeAny(areas);
  } catch (e) {
    if (e instanceof AuthError) return fail(e.message, e.status);
    throw e;
  }
  const sp = new URL(req.url).searchParams;
  const today = todayKey();

  switch (kind) {
    case 'sku-template':
      return file('Template Master SKU & HPP.xlsx', skuTemplate(null));

    case 'sku-master': {
      const skus = await prisma.sku.findMany({ include: { brand: true } });
      return file(
        `Master SKU & HPP ${today}.xlsx`,
        skuTemplate(skus.map((s) => ({ code: s.code, brand: s.brand.name, product: s.productKey, variant: s.variant, ml: num(s.ml), price: num(s.price), cogs: num(s.cogs) }))),
      );
    }

    case 'opname-template': {
      const wh = sp.get('warehouseId') || '';
      const date = sp.get('date') || '';
      const brand = sp.get('brand') || '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail('Isi tanggal opname.');
      const warehouse = await prisma.warehouse.findUnique({ where: { id: wh } });
      if (!warehouse) return fail('Pilih gudang.');
      const m = await getOpsModel(today);
      const { st } = stockCalc(m, date, [wh]);
      const op = await prisma.opname.findUnique({ where: { warehouseId_date: { warehouseId: wh, date: toDbDate(date) } }, include: { counts: { include: { sku: true } } } });
      const counted = new Map((op?.counts ?? []).map((c) => [c.sku.code, c.qty]));
      const rows = Object.values(m.skuMap)
        .filter((s) => !brand || s.brand === brand)
        .sort((a, b) => a.brand.localeCompare(b.brand) || a.product.localeCompare(b.product) || a.ml - b.ml)
        .map((s) => ({ brand: s.brand, code: s.code, recorded: st[s.code] ? st[s.code].now : 0, counted: counted.get(s.code) ?? null }));
      return file(`Template Stock Opname ${warehouse.name} ${date}${brand ? ' ' + brand : ''}.xlsx`, opnameTemplate(rows));
    }

    case 'history-template': {
      const m = await getOpsModel(today);
      const rows = Object.values(m.skuMap)
        .sort((a, b) => a.brand.localeCompare(b.brand) || a.product.localeCompare(b.product) || a.ml - b.ml)
        .map((s) => ({ code: s.code, brand: s.brand, product: s.product, ml: s.ml, avg: m.history[s.code] ?? null }));
      return file(`Template Histori Penjualan ${today}.xlsx`, historyTemplate(rows));
    }

    case 'product-info-template': {
      const [skus, infos] = await Promise.all([
        prisma.sku.findMany({ where: { active: true }, select: { productKey: true, brandId: true, brand: { select: { name: true } } } }),
        prisma.productInfo.findMany(),
      ]);
      const info = new Map(infos.map((i) => [`${i.brandId}|${i.productKey}`, i]));
      const variants = new Map<string, { brand: string; product: string; key: string }>();
      for (const s of skus) if (s.brand.name || s.productKey) variants.set(`${s.brandId}|${s.productKey}`, { brand: s.brand.name, product: s.productKey, key: `${s.brandId}|${s.productKey}` });
      const rows = [...variants.values()]
        .sort((a, b) => a.brand.localeCompare(b.brand) || a.product.localeCompare(b.product))
        .map((v) => {
          const i = info.get(v.key);
          return { brand: v.brand, product: v.product, expiredAt: i?.expiredAt ? dateKey(i.expiredAt) : '', notes: i?.notes ?? '', lookUrl: i?.lookUrl ?? '' };
        });
      return file(`Template Info Barang ${today}.xlsx`, productInfoTemplate(rows));
    }

    case 'laba-rugi':
    case 'arus-kas':
    case 'buku-besar': {
      const from = isValidDateKey(sp.get('from') || '') ? (sp.get('from') as string) : today.slice(0, 8) + '01';
      const to = isValidDateKey(sp.get('to') || '') ? (sp.get('to') as string) : today;
      const [L, fin] = await Promise.all([getLedger(), getFinanceInput()]);
      if (kind === 'laba-rugi') return file(`Laba Rugi ${from} sd ${to}.xlsx`, [statementSheet('Laba Rugi', 'Laba/Rugi (Standar)', from, to, profitLossRows(profitLoss(L, fin.accounts, from, to)))]);
      if (kind === 'arus-kas') return file(`Arus Kas ${from} sd ${to}.xlsx`, [statementSheet('Arus Kas', 'Arus Kas (metode langsung)', from, to, cashFlowRows(cashFlow(L, fin.accounts, from, to)))]);
      const gl = glSummary(L, fin.accounts, from, to);
      const r0 = (v: number) => Math.round(v * 100) / 100;
      const journal = L.entries
        .filter((e) => e.date >= from && e.date <= to && e.kind !== 'open')
        .flatMap((e) => e.lines.map((l) => [e.date, e.ref, e.desc, l.acc, accountName(L.accounts, l.acc), r0(l.d), r0(l.c)]));
      return file(`Buku Besar ${from} sd ${to}.xlsx`, [
        {
          name: 'Ringkasan',
          cols: [10, 36, 16, 16, 16, 16],
          rows: [['Kode', 'Nama akun', 'Saldo awal', 'Debit', 'Kredit', 'Saldo akhir'], ...gl.rows.map((r) => [r.account.code, r.account.name, r0(r.open), r0(r.d), r0(r.c), r0(r.end)]), ['', 'Total mutasi', null, r0(gl.debit), r0(gl.credit), null]],
        },
        { name: 'Jurnal', cols: [12, 22, 48, 10, 32, 16, 16], rows: [['Tanggal', 'Referensi', 'Keterangan', 'Kode akun', 'Nama akun', 'Debit', 'Kredit'], ...journal] },
      ]);
    }
  }
  return fail('Jenis file tidak dikenal.', 404);
}
