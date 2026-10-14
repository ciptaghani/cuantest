import 'server-only';
import { rm } from 'node:fs/promises';
import { Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { guardedAction, type ActionResult } from '@/lib/auth/guard';
import { isValidDateKey } from '@/lib/date';
import { prisma } from '@/lib/db';
import { ACC, adsAccountFor, invoiceUnitCosts, invTotals, nextDocNumber, payCalc, type FinAccount } from '@/lib/finance';
import { hppCalc, stockCalc } from '@/lib/ops';
import { invalidate, TAGS } from '@/lib/repo/cache';
import { toDbDate } from '@/lib/repo/convert';
import { getFinanceInput } from '@/lib/repo/finance';
import { getOpsModel } from '@/lib/repo/ops';
import { proofFile } from '@/lib/repo/proof';

const Id = z.string().min(1).max(40);
const OptId = z.string().max(40).default('');
const Code = z.string().trim().max(20);
const DateStr = z.string().refine(isValidDateKey, 'Isi tanggal yang benar');
const Money = z.coerce.number().min(0, 'Nilai tidak boleh minus').max(1e13);
const Note = z.string().trim().max(2000).default('');

function done<T>(message: string, data?: T): ActionResult<T> {
  revalidatePath('/finance', 'layout');
  return { ok: true, message, data };
}

/** Nomor dokumen PREFIX/YYYYMM/NNN. Kalau bentrok dengan simpanan user lain di saat yang sama, coba nomor berikutnya. */
async function withNumber<T>(prefix: string, date: string, existing: (head: string) => Promise<{ number: string }[]>, create: (no: string) => Promise<T>): Promise<T> {
  const head = `${prefix}/${date.slice(0, 7).replace('-', '')}/`;
  for (let i = 0; ; i++) {
    const no = nextDocNumber((await existing(head)).map((r) => r.number), prefix, date);
    try {
      return await create(no);
    } catch (e) {
      if (i < 3 && e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') continue;
      throw e;
    }
  }
}

const accountMap = async () => Object.fromEntries((await getFinanceInput()).accounts.map((a) => [a.code, a])) as Record<string, FinAccount>;

/** Akun untuk barang lain di faktur (perlengkapan, peralatan, beban). */
export const isItemAccount = (a: FinAccount | undefined) => !!a && (a.type === 'EXPENSE' || a.type === 'ASSET') && !a.isCash && !a.isWallet;
/** Akun baris pembayaran beban. */
export const isExpenseAccount = (a: FinAccount | undefined) =>
  !!a && (a.type === 'EXPENSE' || a.type === 'OTHER_EXPENSE' || (a.type === 'ASSET' && !a.isCash && !a.isWallet && a.code !== ACC.inventory));
/** Akun lawan penerimaan lain. */
export const isReceiptAccount = (a: FinAccount | undefined) => !!a && (a.type === 'OTHER_INCOME' || a.type === 'LIABILITY' || (a.type === 'EQUITY' && a.code !== ACC.openingEquity));

// ---------------------------------------------------------------------------
// Pembelian: PO & faktur
// ---------------------------------------------------------------------------

const DocLineIn = z.object({
  kind: z.enum(['SKU', 'OTHER']),
  sku: z.string().trim().max(191).default(''),
  name: z.string().trim().max(300).default(''),
  account: Code.default(''),
  qty: Money,
  unit: z.string().trim().max(20).default('pcs'),
  price: Money,
  disc: Money.default(0),
});

export const saveDocImpl = guardedAction(
  'FINANCE',
  z.object({
    type: z.enum(['PO', 'INV']),
    id: OptId,
    poId: OptId,
    supplier: z.string().trim().min(1, 'Isi pemasok').max(191),
    date: DateStr,
    dueDate: z.union([z.literal(''), DateStr]).default(''),
    lines: z.array(DocLineIn).max(500),
    discIsPct: z.boolean().default(false),
    discValue: Money.default(0),
    extra: Money.default(0),
    received: z.boolean().default(true),
    warehouseId: OptId,
    note: Note,
  }),
  async (v, user) => {
    const isInv = v.type === 'INV';
    const lines = v.lines
      .filter((l) => (l.kind === 'SKU' ? l.sku : l.name) && l.qty > 0)
      .map((l) => ({ ...l, account: l.kind === 'SKU' ? ACC.inventory : l.account || ACC.officeSupplies }));
    if (!lines.length) return { ok: false, error: 'Tambahkan minimal satu barang dengan kuantitas' };
    if (v.discIsPct && v.discValue > 100) return { ok: false, error: 'Diskon persen maks. 100%' };
    if (lines.some((l) => l.kind === 'SKU' && !Number.isInteger(l.qty))) return { ok: false, error: 'Kuantitas SKU harus bilangan bulat' };

    const skuCodes = [...new Set(lines.filter((l) => l.kind === 'SKU').map((l) => l.sku))];
    const skus = new Map((await prisma.sku.findMany({ where: { code: { in: skuCodes } }, select: { id: true, code: true } })).map((s) => [s.code, s.id]));
    const unknown = skuCodes.filter((c) => !skus.has(c));
    if (unknown.length) return { ok: false, error: `SKU tidak ada di master: ${unknown.join(', ')}` };

    const accs = await accountMap();
    if (isInv) {
      const bad = lines.find((l) => l.kind === 'OTHER' && !isItemAccount(accs[l.account]));
      if (bad) return { ok: false, error: `Akun untuk "${bad.name}" tidak valid` };
    }
    const accIds = new Map((await prisma.account.findMany({ where: { code: { in: lines.map((l) => l.account) } }, select: { id: true, code: true } })).map((a) => [a.code, a.id]));

    const doc = { discIsPct: v.discIsPct, discValue: v.discValue, extra: isInv ? v.extra : 0, lines: lines.map((l) => ({ ...l, sku: l.kind === 'SKU' ? l.sku : null })) };
    const t = invTotals(doc);
    const old = v.id ? await (isInv ? prisma.purchaseInvoice.findUnique({ where: { id: v.id } }) : prisma.purchaseOrder.findUnique({ where: { id: v.id } })) : null;
    if (v.id && !old) return { ok: false, error: 'Dokumen tidak ditemukan. Mungkin sudah dihapus.' };
    if (isInv && v.id) {
      const paid = (await prisma.payment.aggregate({ where: { invoiceId: v.id }, _sum: { amount: true } }))._sum.amount;
      if (paid && t.total + 0.5 < Number(paid)) return { ok: false, error: `Total faktur lebih kecil dari yang sudah dibayar (${Number(paid).toLocaleString('id-ID')}). Hapus pembayarannya dulu.` };
    }

    const supplier = await prisma.supplier.upsert({ where: { name: v.supplier }, create: { name: v.supplier }, update: {}, select: { id: true } });
    const base = { date: toDbDate(v.date), supplierId: supplier.id, discIsPct: v.discIsPct, discValue: v.discValue, extra: doc.extra, note: v.note || null };

    if (!isInv) {
      const create = lines.map((l) => ({ skuId: l.kind === 'SKU' ? skus.get(l.sku) : null, name: l.kind === 'SKU' ? '' : l.name, qty: l.qty, unit: l.unit || 'pcs', price: l.price, disc: l.disc }));
      const no = v.id
        ? (await prisma.purchaseOrder.update({ where: { id: v.id }, data: { ...base, lines: { deleteMany: {}, create } } })).number
        : await withNumber(
            'PO',
            v.date,
            (head) => prisma.purchaseOrder.findMany({ where: { number: { startsWith: head } }, select: { number: true } }),
            async (number) => (await prisma.purchaseOrder.create({ data: { ...base, number, createdById: user.id, lines: { create } } })).number,
          );
      invalidate(TAGS.finance);
      return done(`PO ${no} tersimpan`);
    }

    // Faktur: baris SKU yang sudah diterima → barang masuk di Operasional (dibuat ulang tiap simpan).
    const withSku = lines.some((l) => l.kind === 'SKU');
    let warehouseId: string | null = null;
    if (v.received && withSku) {
      const cfg = await prisma.appConfig.findUnique({ where: { id: 1 }, select: { mainWarehouseId: true } });
      const wh = await prisma.warehouse.findFirst({ where: { id: v.warehouseId || cfg?.mainWarehouseId || '', active: true }, select: { id: true } });
      if (!wh) return { ok: false, error: 'Pilih gudang penerimaan' };
      warehouseId = wh.id;
    }
    const units = invoiceUnitCosts(doc);
    const movement = (number: string) =>
      warehouseId
        ? [
            {
              type: 'IN' as const,
              date: toDbDate(v.date),
              warehouseId: warehouseId,
              note: `Faktur ${number} · ${v.supplier}`,
              createdById: user.id,
              lines: { create: units.map((u) => ({ skuId: skus.get(u.sku) as string, qty: u.qty, unitPrice: u.unitPrice })) },
            },
          ]
        : [];
    const invLines = lines.map((l) => ({
      kind: l.kind,
      skuId: l.kind === 'SKU' ? skus.get(l.sku) : null,
      accountId: l.kind === 'OTHER' ? accIds.get(l.account) : null,
      name: l.kind === 'SKU' ? '' : l.name,
      qty: l.qty,
      unit: l.unit || 'pcs',
      price: l.price,
      disc: l.disc,
    }));
    const data = { ...base, dueDate: v.dueDate ? toDbDate(v.dueDate) : null, received: v.received, receivedWarehouseId: warehouseId };
    let no: string;
    if (v.id) {
      no = (old as { number: string }).number;
      await prisma.purchaseInvoice.update({ where: { id: v.id }, data: { ...data, lines: { deleteMany: {}, create: invLines }, stockMovements: { deleteMany: {}, create: movement(no) } } });
    } else {
      const po = v.poId ? await prisma.purchaseOrder.findUnique({ where: { id: v.poId }, select: { id: true } }) : null;
      no = await withNumber(
        'PI',
        v.date,
        (head) => prisma.purchaseInvoice.findMany({ where: { number: { startsWith: head } }, select: { number: true } }),
        async (number) =>
          (
            await prisma.purchaseInvoice.create({
              data: { ...data, number, poId: po?.id ?? null, createdById: user.id, lines: { create: invLines }, stockMovements: { create: movement(number) } },
            })
          ).number,
      );
      if (po) await prisma.purchaseOrder.update({ where: { id: po.id }, data: { status: 'INVOICED' } });
    }
    invalidate(TAGS.finance, TAGS.ops);
    return done(`Faktur ${no} tersimpan${warehouseId ? ' · barang masuk tercatat di Operasional' : ''}`);
  },
);

export const deleteDocImpl = guardedAction('FINANCE', z.object({ type: z.enum(['PO', 'INV']), id: Id }), async (v) => {
  if (v.type === 'PO') {
    await prisma.purchaseOrder.deleteMany({ where: { id: v.id } });
    invalidate(TAGS.finance);
    return done('PO dihapus');
  }
  const inv = await prisma.purchaseInvoice.findUnique({ where: { id: v.id }, select: { poId: true, _count: { select: { payments: true } } } });
  if (!inv) return { ok: false, error: 'Faktur tidak ditemukan' };
  if (inv._count.payments) return { ok: false, error: 'Faktur sudah ada pembayarannya. Hapus pembayarannya dulu.' };
  // Barang masuk dari faktur ini ikut terhapus (onDelete: Cascade).
  await prisma.purchaseInvoice.delete({ where: { id: v.id } });
  if (inv.poId && !(await prisma.purchaseInvoice.count({ where: { poId: inv.poId } }))) await prisma.purchaseOrder.update({ where: { id: inv.poId }, data: { status: 'OPEN' } });
  invalidate(TAGS.finance, TAGS.ops);
  return done('Faktur dihapus');
});

// ---------------------------------------------------------------------------
// Pembayaran
// ---------------------------------------------------------------------------

/** Kode akun kas/bank → id BankAccount (null = Kas Tunai). */
async function bankOf(code: string): Promise<{ id: string | null } | null> {
  if (code === ACC.cash) return { id: null };
  const b = await prisma.bankAccount.findFirst({ where: { account: { code } }, select: { id: true } });
  return b ? { id: b.id } : null;
}

export const savePaymentImpl = guardedAction(
  'FINANCE',
  z.object({
    kind: z.enum(['EXPENSE', 'INVOICE', 'ADS_TOPUP', 'RECEIPT', 'EXPENSE_REMAINDER']),
    date: DateStr,
    bank: Code.min(1, 'Pilih kas/bank'),
    mode: z.enum(['lunas', 'dp']).default('lunas'),
    dpType: z.enum(['rp', 'pct']).default('rp'),
    dpVal: Money.default(0),
    lines: z.array(z.object({ account: Code, note: z.string().trim().max(300).default(''), amount: Money })).max(100).default([]),
    invoiceId: OptId,
    refPaymentId: OptId,
    channel: z.enum(['shopee', 'tiktok', 'lain']).default('shopee'),
    account: Code.default(''),
    amount: Money.default(0),
    note: Note,
  }),
  async (v, user) => {
    const fin = await getFinanceInput();
    const accs = Object.fromEntries(fin.accounts.map((a) => [a.code, a]));
    const bank = await bankOf(v.bank);
    if (!bank) return { ok: false, error: 'Pilih kas/bank' };
    const lines = v.lines.filter((l) => l.account && l.amount > 0);
    let account = '';
    if (v.kind === 'EXPENSE') {
      if (!lines.length) return { ok: false, error: 'Isi minimal satu baris beban' };
      const bad = lines.find((l) => !isExpenseAccount(accs[l.account]));
      if (bad) return { ok: false, error: `Akun ${bad.account} tidak bisa dipakai untuk beban` };
    }
    const invoice = v.kind === 'INVOICE' ? fin.invoices.find((x) => x.id === v.invoiceId) : undefined;
    if (v.kind === 'INVOICE' && !invoice) return { ok: false, error: 'Pilih faktur' };
    const refPayment = v.kind === 'EXPENSE_REMAINDER' ? fin.payments.find((x) => x.id === v.refPaymentId && x.kind === 'EXPENSE') : undefined;
    if (v.kind === 'EXPENSE_REMAINDER' && !refPayment) return { ok: false, error: 'Pembayaran beban asal tidak ditemukan' };
    if (v.kind === 'ADS_TOPUP') account = adsAccountFor(v.channel === 'lain' ? null : v.channel);
    if (v.kind === 'RECEIPT') {
      if (!isReceiptAccount(accs[v.account])) return { ok: false, error: 'Pilih akun penerimaan' };
      account = v.account;
    }
    // Nilai dihitung ulang di server dari data terbaru (lunas = sisa tagihan, DP Rp/% tidak melebihi sisa).
    const amt = Math.round(payCalc({ kind: v.kind, mode: v.mode, dpType: v.dpType, dpVal: v.dpVal, lines, invoice, refPayment, amount: v.amount }, fin.payments).amt * 100) / 100;
    if (!(amt > 0)) return { ok: false, error: v.kind === 'INVOICE' || v.kind === 'EXPENSE_REMAINDER' ? 'Tidak ada sisa tagihan untuk dibayar' : 'Nilai pembayaran masih 0' };

    const lineAccIds = new Map((await prisma.account.findMany({ where: { code: { in: [account, ...lines.map((l) => l.account)] } }, select: { id: true, code: true } })).map((a) => [a.code, a.id]));
    const id = await withNumber(
      v.kind === 'RECEIPT' ? 'BKM' : 'BKK',
      v.date,
      (head) => prisma.payment.findMany({ where: { number: { startsWith: head } }, select: { number: true } }),
      async (number) =>
        (
          await prisma.payment.create({
            data: {
              number,
              kind: v.kind,
              date: toDbDate(v.date),
              bankAccountId: bank.id,
              amount: amt,
              invoiceId: invoice?.id ?? null,
              refPaymentId: refPayment?.id ?? null,
              accountId: account ? lineAccIds.get(account) : null,
              note: v.note || null,
              createdById: user.id,
              lines: { create: v.kind === 'EXPENSE' ? lines.map((l) => ({ accountId: lineAccIds.get(l.account) as string, amount: l.amount, note: l.note || null })) : [] },
            },
          })
        ).id,
    );
    invalidate(TAGS.finance);
    return done('Pembayaran tersimpan', { id });
  },
);

export const deletePaymentImpl = guardedAction('FINANCE', z.object({ id: Id }), async (v) => {
  const p = await prisma.payment.findUnique({ where: { id: v.id }, select: { number: true, proofPath: true, _count: { select: { remainders: true } } } });
  if (!p) return { ok: false, error: 'Pembayaran tidak ditemukan' };
  if (p._count.remainders) return { ok: false, error: 'Hapus dulu pelunasan sisanya' };
  await prisma.payment.delete({ where: { id: v.id } });
  if (p.proofPath) await rm(proofFile(p.proofPath), { force: true });
  invalidate(TAGS.finance);
  return done(`${p.number} dihapus`);
});

// ---------------------------------------------------------------------------
// Pemindahan dana
// ---------------------------------------------------------------------------

export const saveTransferImpl = guardedAction(
  'FINANCE',
  z.object({ date: DateStr, from: Code.min(1, 'Pilih sumber'), to: Code.min(1, 'Pilih tujuan'), amount: Money, fee: Money.default(0), note: Note }),
  async (v, user) => {
    if (v.from === v.to) return { ok: false, error: 'Sumber dan tujuan harus beda' };
    if (!(v.amount > 0)) return { ok: false, error: 'Isi jumlah' };
    const accs = await accountMap();
    if (!accs[v.from]?.isWallet && !accs[v.from]?.isCash) return { ok: false, error: 'Sumber harus saldo marketplace atau kas/bank' };
    if (!accs[v.to]?.isCash) return { ok: false, error: 'Tujuan harus kas/bank' };
    const ids = new Map((await prisma.account.findMany({ where: { code: { in: [v.from, v.to] } }, select: { id: true, code: true } })).map((a) => [a.code, a.id]));
    await withNumber(
      'TRF',
      v.date,
      (head) => prisma.transfer.findMany({ where: { number: { startsWith: head } }, select: { number: true } }),
      (number) =>
        prisma.transfer.create({
          data: { number, date: toDbDate(v.date), fromAccountId: ids.get(v.from) as string, toAccountId: ids.get(v.to) as string, amount: v.amount, fee: v.fee, note: v.note || null, createdById: user.id },
        }),
    );
    invalidate(TAGS.finance);
    return done('Pemindahan dana tersimpan');
  },
);

export const deleteTransferImpl = guardedAction('FINANCE', z.object({ id: Id }), async (v) => {
  await prisma.transfer.deleteMany({ where: { id: v.id } });
  invalidate(TAGS.finance);
  return done('Pemindahan dihapus');
});

// ---------------------------------------------------------------------------
// Pengaturan akun
// ---------------------------------------------------------------------------

/** Kode akun bank berikutnya: 1-111, 1-112, … */
async function nextBankCode(): Promise<string> {
  const used = new Set((await prisma.account.findMany({ where: { code: { startsWith: '1-11' } }, select: { code: true } })).map((a) => a.code));
  for (let i = 1; ; i++) if (!used.has(`1-11${i}`)) return `1-11${i}`;
}

const bankLabel = (name: string, number: string | null) => name + (number ? ' ' + number : '');

export const bankAddImpl = guardedAction(
  'FINANCE',
  z.object({ name: z.string().trim().min(1, 'Isi nama bank').max(100), number: z.string().trim().max(60).default('') }),
  async (v) => {
    const code = await nextBankCode();
    await prisma.account.create({
      data: { code, name: bankLabel(v.name, v.number), type: 'ASSET', isCash: true, isSystem: true, bankAccount: { create: { name: v.name, number: v.number || null } } },
    });
    invalidate(TAGS.finance);
    return done('Rekening ditambahkan');
  },
);

export const bankUpdateImpl = guardedAction(
  'FINANCE',
  z.object({ id: Id, name: z.string().trim().min(1, 'Isi nama bank').max(100).optional(), number: z.string().trim().max(60).optional() }),
  async (v) => {
    const b = await prisma.bankAccount.update({ where: { id: v.id }, data: { name: v.name, number: v.number === undefined ? undefined : v.number || null } });
    await prisma.account.update({ where: { id: b.accountId }, data: { name: bankLabel(b.name, b.number) } });
    invalidate(TAGS.finance);
    return done('Rekening diperbarui');
  },
);

export const bankRemoveImpl = guardedAction('FINANCE', z.object({ id: Id }), async (v) => {
  const b = await prisma.bankAccount.findUnique({ where: { id: v.id }, include: { account: { select: { _count: { select: { transfersFrom: true, transfersTo: true } } } }, _count: { select: { payments: true } } } });
  if (!b) return { ok: false, error: 'Rekening tidak ditemukan' };
  if (b._count.payments || b.account._count.transfersFrom || b.account._count.transfersTo)
    return { ok: false, error: 'Rekening sudah dipakai di pembayaran atau pemindahan dana. Hapus transaksinya dulu.' };
  await prisma.$transaction([prisma.bankAccount.delete({ where: { id: v.id } }), prisma.account.delete({ where: { id: b.accountId } })]);
  invalidate(TAGS.finance);
  return done('Rekening dihapus');
});

export const setStartImpl = guardedAction('FINANCE', z.object({ start: DateStr }), async (v) => {
  await prisma.appConfig.upsert({ where: { id: 1 }, create: { id: 1, financeStartDate: toDbDate(v.start) }, update: { financeStartDate: toDbDate(v.start) } });
  invalidate(TAGS.finance);
  return done('Tanggal mulai disimpan');
});

async function setOpening(code: string, amount: number | null): Promise<ActionResult> {
  const a = await prisma.account.findUnique({ where: { code }, select: { id: true, type: true } });
  if (!a || (a.type !== 'ASSET' && a.type !== 'LIABILITY')) return { ok: false, error: 'Saldo awal hanya untuk akun aset dan kewajiban' };
  if (!amount) await prisma.openingBalance.deleteMany({ where: { accountId: a.id } });
  else await prisma.openingBalance.upsert({ where: { accountId: a.id }, create: { accountId: a.id, amount }, update: { amount } });
  invalidate(TAGS.finance);
  return done('Saldo awal disimpan');
}

export const setOpeningImpl = guardedAction('FINANCE', z.object({ code: Code, amount: z.union([z.null(), z.coerce.number().min(-1e13).max(1e13)]) }), (v) => setOpening(v.code, v.amount));

/** Saldo awal persediaan = stok sekarang (semua gudang) × HPP sekarang. */
export const openingFromStockImpl = guardedAction('FINANCE', z.object({}), async () => {
  const m = await getOpsModel();
  const { st } = stockCalc(m);
  const H = hppCalc(m);
  let value = 0;
  for (const s in m.skuMap) {
    const q = st[s] ? st[s].now : 0;
    if (q > 0) value += q * (H[s] ? H[s].now : m.skuMap[s].cogs);
  }
  const r = await setOpening(ACC.inventory, Math.round(value));
  return r.ok ? done(`Saldo awal persediaan Rp${Math.round(value).toLocaleString('id-ID')}`) : r;
});

export const accountAddImpl = guardedAction(
  'FINANCE',
  z.object({
    code: Code.min(1, 'Isi kode'),
    name: z.string().trim().min(1, 'Isi nama akun').max(120),
    type: z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'EXPENSE', 'OTHER_INCOME', 'OTHER_EXPENSE']),
    group: z.string().trim().max(80).default(''),
  }),
  async (v) => {
    if (await prisma.account.findUnique({ where: { code: v.code } })) return { ok: false, error: 'Kode sudah dipakai' };
    await prisma.account.create({ data: { code: v.code, name: v.name, type: v.type, group: v.group || null } });
    invalidate(TAGS.finance);
    return done(`Akun ${v.code} ditambahkan`);
  },
);

export const accountRemoveImpl = guardedAction('FINANCE', z.object({ code: Code }), async (v) => {
  const a = await prisma.account.findUnique({
    where: { code: v.code },
    select: { id: true, isSystem: true, _count: { select: { invoiceLines: true, paymentLines: true, payments: true, transfersFrom: true, transfersTo: true } }, openingBalance: true },
  });
  if (!a) return { ok: false, error: 'Akun tidak ditemukan' };
  if (a.isSystem) return { ok: false, error: 'Akun bawaan tidak bisa dihapus' };
  if (Object.values(a._count).some(Boolean) || a.openingBalance) return { ok: false, error: 'Akun sudah dipakai di transaksi atau saldo awal' };
  await prisma.account.delete({ where: { id: a.id } });
  invalidate(TAGS.finance);
  return done('Akun dihapus');
});
