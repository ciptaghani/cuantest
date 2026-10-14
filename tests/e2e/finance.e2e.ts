/**
 * Uji Fase 7 ujung-ke-ujung (manual, tidak ikut `npm test`): halaman, server action, bukti bayar & export Finance lewat HTTP.
 *
 * Syarat: database di .env berisi master SKU + toko hasil e2e impor, dan server jalan:  npm run build && npx next start -p 3311
 * Jalankan dari root repo:
 *   npx tsx --env-file=.env --tsconfig tsconfig.json tests/e2e/finance.e2e.ts
 * Semua data yang dibuat tes ini dihapus lagi (lewat server action, supaya cache ikut dibuang).
 */
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const ROOT = process.cwd();
const BASE = process.env.E2E_BASE_URL || 'http://localhost:3311';
const prisma = new PrismaClient();
const results: string[] = [];
const check = (name: string, ok: boolean, extra = '') => results.push(`${ok ? 'OK  ' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
const near = (a: number, b: number, tol = 1) => Math.abs(a - b) <= tol;

const manifest = JSON.parse(readFileSync(`${ROOT}/.next/server/server-reference-manifest.json`, 'utf8')).node as Record<string, { exportedName: string; filename: string }>;
const actionId = (name: string, area: RegExp) => {
  const hit = Object.entries(manifest).find(([, v]) => v.exportedName === name && area.test(v.filename));
  if (!hit) throw new Error(`action ${name} tidak ditemukan di manifest`);
  return hit[0];
};

async function login(username: string, password: string) {
  const html = await (await fetch(`${BASE}/login`)).text();
  const fd = new FormData();
  for (const [, n, v] of html.matchAll(/<input type="hidden" name="([^"]+)"(?: value="([^"]*)")?\/>/g)) fd.append(n, (v || '').replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
  fd.append('username', username);
  fd.append('password', password);
  const res = await fetch(`${BASE}/login`, { method: 'POST', body: fd, redirect: 'manual', headers: { 'x-forwarded-for': '10.9.0.' + Math.floor(Math.random() * 200) } });
  return 'cl_session=' + (res.headers.get('set-cookie') || '').match(/cl_session=([^;]+)/)![1];
}

type R<T = unknown> = { ok: true; data?: T; message?: string } | { ok: false; error: string };
async function act<T = unknown>(cookie: string, name: string, arg: unknown, area = /finance[\\/]actions/): Promise<R<T>> {
  const res = await fetch(`${BASE}/finance/pembelian`, { method: 'POST', headers: { 'Next-Action': actionId(name, area), cookie, 'Content-Type': 'text/plain;charset=UTF-8', Accept: 'text/x-component' }, body: JSON.stringify([arg]) });
  const line = (await res.text()).split('\n').find((l) => /"ok":/.test(l));
  if (!line) throw new Error(`${name}: respons tanpa hasil (${res.status})`);
  return JSON.parse(line.slice(line.indexOf(':') + 1));
}
const must = async <T = unknown>(cookie: string, name: string, arg: unknown) => {
  const r = await act<T>(cookie, name, arg);
  if (!r.ok) throw new Error(`${name}: ${r.error}`);
  return r;
};

async function page(cookie: string, path: string) {
  const res = await fetch(`${BASE}${path}`, { headers: { cookie } });
  return { status: res.status, html: (await res.text()).replace(/<!-- -->/g, '') };
}

async function main() {
  const t0 = new Date();
  await prisma.loginAttempt.deleteMany();
  const admin = await login(process.env.SEED_ADMIN_USERNAME as string, process.env.SEED_ADMIN_PASSWORD as string);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const month0 = today.slice(0, 8) + '01';
  const cfg0 = await prisma.appConfig.findUniqueOrThrow({ where: { id: 1 } });
  const inv0 = await prisma.openingBalance.findFirst({ where: { account: { code: '1-140' } } });
  const jogja = await prisma.warehouse.findUniqueOrThrow({ where: { code: 'jogja' } });
  const sku = await prisma.sku.findFirstOrThrow({ orderBy: { code: 'asc' } });
  const wallet = await prisma.account.findFirstOrThrow({ where: { storeWallet: { isDemo: false } } });
  const created = { po: '', inv: '', payments: [] as string[], bankId: '', bankCode: '', transfer: '' };
  const summary = async () => (await (await fetch(`${BASE}/api/finance/summary?from=${month0}&to=${today}`, { headers: { cookie: admin } })).json()) as { expense: number; trialBalance: { balanced: boolean; debit: number } };
  const snapStock = async () => {
    const r = await act<{ stock: { id: string; now: number }[] }>(admin, 'skuSnapshot', { sku: sku.code, mode: 'io' }, /operasional[\\/]actions/);
    if (!r.ok || !r.data) throw new Error('snapshot');
    return r.data.stock.find((s) => s.id === jogja.id)!.now;
  };

  try {
    // ---- halaman tampil
    for (const [p, txt] of [
      ['/finance/pembelian', 'Pembelian barang'],
      ['/finance/pembelian?tab=inv', 'No. faktur'],
      ['/finance/pembelian?tab=po&edit=new', 'Buat pesanan pembelian'],
      ['/finance/pembayaran', 'Sisa utang beban'],
      ['/finance/pembayaran?new=EXPENSE', 'Pembayaran baru'],
      ['/finance/pemindahan', 'Riwayat pemindahan'],
      ['/finance/restock', 'Schedule restock'],
      ['/finance/laba-rugi', 'LABA BERSIH'],
      ['/finance/arus-kas', 'Saldo akhir kas &amp; bank'],
      ['/finance/buku-besar', 'Ringkasan buku besar'],
      ['/finance/settlement', 'Daftar pesanan'],
      ['/finance/pengaturan', 'Saldo awal pembukuan'],
    ]) {
      const r = await page(admin, p);
      check(`halaman ${p}`, r.status === 200 && r.html.includes(txt), `status ${r.status}`);
    }

    // ---- pengaturan
    await must(admin, 'setStart', { start: month0 });
    await must(admin, 'bankAdd', { name: 'E2E Bank', number: '123' });
    const bank = await prisma.bankAccount.findFirstOrThrow({ where: { name: 'E2E Bank' }, include: { account: true } });
    created.bankId = bank.id;
    created.bankCode = bank.account.code;
    check('rekening baru jadi akun kas 1-11x', /^1-11\d+$/.test(bank.account.code) && bank.account.isCash && bank.account.name === 'E2E Bank 123');
    const acc = await act(admin, 'accountAdd', { code: '6-9E2E', name: 'Beban Uji', type: 'EXPENSE', group: '' });
    const dup = await act(admin, 'accountAdd', { code: '6-9E2E', name: 'Lagi', type: 'EXPENSE' });
    const rm = await act(admin, 'accountRemove', { code: '6-9E2E' });
    const sys = await act(admin, 'accountRemove', { code: '6-200' });
    check('akun custom: tambah, tolak kode ganda, hapus; akun bawaan tidak bisa dihapus', acc.ok && !dup.ok && rm.ok && !sys.ok);
    const ofs = await act(admin, 'openingFromStock', {});
    check('saldo awal persediaan dari stok', ofs.ok && !!(await prisma.openingBalance.findFirst({ where: { account: { code: '1-140' } } })), ofs.ok ? ofs.message : ofs.error);
    const badOpen = await act(admin, 'setOpening', { code: '6-200', amount: 5 });
    check('saldo awal hanya untuk aset/kewajiban', !badOpen.ok);

    const base = await summary();
    const stock0 = await snapStock();

    // ---- PO → faktur → barang masuk
    const lines = [
      { kind: 'SKU', sku: sku.code, qty: 3, price: 100000, disc: 0 },
      { kind: 'OTHER', name: 'Lakban', account: '6-300', qty: 2, price: 5000, disc: 0 },
    ];
    await must(admin, 'saveDoc', { type: 'PO', supplier: 'E2E Supplier', date: today, lines });
    const po = await prisma.purchaseOrder.findFirstOrThrow({ where: { supplier: { name: 'E2E Supplier' } } });
    created.po = po.id;
    check('nomor PO otomatis', new RegExp(`^PO/${today.slice(0, 7).replace('-', '')}/\\d{3}$`).test(po.number), po.number);
    const badSku = await act(admin, 'saveDoc', { type: 'PO', supplier: 'E2E Supplier', date: today, lines: [{ kind: 'SKU', sku: 'TIDAK-ADA', qty: 1, price: 1 }] });
    check('SKU di luar master ditolak', !badSku.ok);

    await must(admin, 'saveDoc', { type: 'INV', poId: po.id, supplier: 'E2E Supplier', date: today, lines, extra: 15000, received: true, warehouseId: jogja.id });
    const inv = await prisma.purchaseInvoice.findFirstOrThrow({ where: { poId: po.id }, include: { stockMovements: { include: { lines: true } } } });
    created.inv = inv.id;
    const mv = inv.stockMovements[0];
    check('faktur dari PO: PO jadi Difakturkan', (await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } })).status === 'INVOICED');
    check('faktur SKU → barang masuk (ongkir dibagi ke harga per pcs)', inv.stockMovements.length === 1 && mv.type === 'IN' && mv.warehouseId === jogja.id && mv.lines[0].qty === 3 && near(Number(mv.lines[0].unitPrice), 105000, 0.01), `${Number(mv?.lines[0]?.unitPrice)}`);
    const stock1 = await snapStock();
    check('stok Operasional bertambah', stock1 === stock0 + 3, `${stock0} → ${stock1}`);

    // ubah faktur: qty 5 → pergerakan stok ikut diperbarui
    await must(admin, 'saveDoc', { type: 'INV', id: inv.id, supplier: 'E2E Supplier', date: today, lines: [{ ...lines[0], qty: 5 }, lines[1]], extra: 15000, received: true, warehouseId: jogja.id });
    const mvs = await prisma.stockMovement.findMany({ where: { invoiceId: inv.id }, include: { lines: true } });
    check('ubah faktur memperbarui barang masuk (bukan dobel)', mvs.length === 1 && mvs[0].lines[0].qty === 5 && (await snapStock()) === stock0 + 5);
    const delMv = await act(admin, 'deleteMovement', { id: mvs[0].id }, /operasional[\\/]actions/);
    check('barang masuk dari faktur tidak bisa dihapus di Operasional', !delMv.ok);

    // ---- pembayaran faktur DP 40% lalu lunas (total 500.000 + 10.000 + 15.000)
    const total = 525000;
    const dp = await must<{ id: string }>(admin, 'savePayment', { kind: 'INVOICE', date: today, bank: created.bankCode, invoiceId: inv.id, mode: 'dp', dpType: 'pct', dpVal: 40 });
    created.payments.push(dp.data!.id);
    const p1 = await prisma.payment.findUniqueOrThrow({ where: { id: dp.data!.id } });
    check('DP 40% dihitung di server', near(Number(p1.amount), total * 0.4, 0.01) && p1.number.startsWith('BKK/'), `${Number(p1.amount)}`);
    const shrink = await act(admin, 'saveDoc', { type: 'INV', id: inv.id, supplier: 'E2E Supplier', date: today, lines: [{ ...lines[0], qty: 1 }], received: true, warehouseId: jogja.id });
    check('faktur tidak bisa diubah di bawah nilai yang sudah dibayar', !shrink.ok);
    const lunas = await must<{ id: string }>(admin, 'savePayment', { kind: 'INVOICE', date: today, bank: '1-100', invoiceId: inv.id, mode: 'lunas', amount: 1 });
    created.payments.push(lunas.data!.id);
    const p2 = await prisma.payment.findUniqueOrThrow({ where: { id: lunas.data!.id } });
    check('lunas = sisa tagihan (nilai dari client diabaikan), Kas Tunai = tanpa rekening', near(Number(p2.amount), total * 0.6, 0.01) && p2.bankAccountId === null, `${Number(p2.amount)}`);
    const over = await act(admin, 'savePayment', { kind: 'INVOICE', date: today, bank: '1-100', invoiceId: inv.id });
    check('faktur lunas tidak bisa dibayar lagi', !over.ok);
    const delInv = await act(admin, 'deleteDoc', { type: 'INV', id: inv.id });
    check('faktur berpembayaran tidak bisa dihapus', !delInv.ok);

    // ---- beban DP + pelunasan sisa, top up iklan, penerimaan
    const ex = await must<{ id: string }>(admin, 'savePayment', { kind: 'EXPENSE', date: today, bank: created.bankCode, lines: [{ account: '6-200', note: 'Gaji uji', amount: 1000000 }], mode: 'dp', dpType: 'rp', dpVal: 400000 });
    created.payments.push(ex.data!.id);
    const badLine = await act(admin, 'savePayment', { kind: 'EXPENSE', date: today, bank: '1-100', lines: [{ account: '1-100', amount: 5 }] });
    check('akun kas tidak bisa jadi baris beban', !badLine.ok);
    const sisa = await must<{ id: string }>(admin, 'savePayment', { kind: 'EXPENSE_REMAINDER', date: today, bank: created.bankCode, refPaymentId: ex.data!.id });
    created.payments.push(sisa.data!.id);
    check('pelunasan sisa beban = 600.000', near(Number((await prisma.payment.findUniqueOrThrow({ where: { id: sisa.data!.id } })).amount), 600000, 0.01));
    const delParent = await act(admin, 'deletePayment', { id: ex.data!.id });
    check('beban induk tidak bisa dihapus sebelum pelunasannya', !delParent.ok);
    const top = await must<{ id: string }>(admin, 'savePayment', { kind: 'ADS_TOPUP', date: today, bank: created.bankCode, channel: 'tiktok', amount: 250000 });
    created.payments.push(top.data!.id);
    const rec = await must<{ id: string }>(admin, 'savePayment', { kind: 'RECEIPT', date: today, bank: created.bankCode, account: '3-100', amount: 2000000 });
    created.payments.push(rec.data!.id);
    check('penerimaan pakai nomor BKM', (await prisma.payment.findUniqueOrThrow({ where: { id: rec.data!.id } })).number.startsWith('BKM/'));
    const badRec = await act(admin, 'savePayment', { kind: 'RECEIPT', date: today, bank: created.bankCode, account: '3-900', amount: 5 });
    check('Ekuitas Saldo Awal tidak bisa jadi akun penerimaan', !badRec.ok);

    // ---- pemindahan dana
    await must(admin, 'saveTransfer', { date: today, from: wallet.code, to: created.bankCode, amount: 500000, fee: 2500 });
    created.transfer = (await prisma.transfer.findFirstOrThrow({ where: { toAccount: { code: created.bankCode } } })).id;
    const badX = await act(admin, 'saveTransfer', { date: today, from: created.bankCode, to: wallet.code, amount: 5 });
    check('pemindahan ke saldo toko ditolak', !badX.ok);

    // ---- laporan: beban bertambah tepat, buku besar seimbang
    const after = await summary();
    check('laba rugi: beban operasional + gaji 1jt + iklan 250rb + lakban 10rb', near(after.expense - base.expense, 1260000), `${after.expense - base.expense}`);
    check('buku besar tetap seimbang', after.trialBalance.balanced);
    const gl = await page(admin, `/finance/buku-besar?acc=${encodeURIComponent(created.bankCode)}&from=${month0}&to=${today}`);
    check('detail buku besar rekening', gl.html.includes(p1.number) && gl.html.includes('Seimbang'));
    const lr = await page(admin, `/finance/laba-rugi?from=${month0}&to=${today}`);
    check('laba rugi menampilkan Beban Iklan TikTok', lr.html.includes('Beban Iklan TikTok'));
    const cf = await page(admin, `/finance/arus-kas?from=${month0}&to=${today}`);
    check('arus kas: penerimaan marketplace & top up iklan', cf.html.includes('Penerimaan penjualan marketplace') && cf.html.includes('Top up saldo iklan'));

    // ---- bukti pembayaran
    const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64'));
    const up = (cookie: string, name: string) => {
      const fd = new FormData();
      fd.append('file', new Blob([png]), name);
      return fetch(`${BASE}/api/finance/proof?id=${top.data!.id}`, { method: 'POST', body: fd, headers: { cookie } });
    };
    check('upload bukti .exe ditolak', (await up(admin, 'x.exe')).status === 400);
    check('upload bukti PNG', (await up(admin, 'bukti.png')).ok);
    const dl = await fetch(`${BASE}/api/finance/proof?id=${top.data!.id}`, { headers: { cookie: admin } });
    check('buka bukti (image/png, nosniff)', dl.ok && dl.headers.get('content-type') === 'image/png' && dl.headers.get('x-content-type-options') === 'nosniff' && (await dl.arrayBuffer()).byteLength === png.length);

    // ---- export Excel
    for (const k of ['laba-rugi', 'arus-kas', 'buku-besar']) {
      const r = await fetch(`${BASE}/api/export/${k}?from=${month0}&to=${today}`, { headers: { cookie: admin } });
      const buf = new Uint8Array(await r.arrayBuffer());
      check(`export ${k}.xlsx`, r.ok && buf[0] === 0x50 && buf[1] === 0x4b, `status ${r.status}`);
    }

    // ---- izin: staff tanpa Finance
    await prisma.user.deleteMany({ where: { username: 'e2e-ops7' } });
    await prisma.user.create({ data: { name: 'Gudang', username: 'e2e-ops7', passwordHash: await bcrypt.hash('gudang-12345', 12), permissions: { create: [{ menu: 'OPS' }] } } });
    const staff = await login('e2e-ops7', 'gudang-12345');
    const sp = await page(staff, '/finance/laba-rugi');
    check('isi laba rugi tidak terkirim ke staff tanpa izin', !sp.html.includes('LABA BERSIH') && !sp.html.includes('Beban Iklan'));
    const sa = await act(staff, 'saveTransfer', { date: today, from: wallet.code, to: created.bankCode, amount: 5 });
    check('staff tanpa izin Finance ditolak di server action', !sa.ok);
    check('staff tanpa izin: bukti 403', (await fetch(`${BASE}/api/finance/proof?id=${top.data!.id}`, { headers: { cookie: staff } })).status === 403);
    check('staff tanpa izin: export 403', (await fetch(`${BASE}/api/export/laba-rugi`, { headers: { cookie: staff } })).status === 403);
    check('createdBy terisi', (await prisma.payment.findUniqueOrThrow({ where: { id: top.data!.id }, include: { createdBy: true } })).createdBy?.username === process.env.SEED_ADMIN_USERNAME);
  } finally {
    // ---- bersihkan: kembalikan pengaturan dulu, lalu hapus lewat action (cache ikut dibuang)
    await prisma.appConfig.update({ where: { id: 1 }, data: { financeStartDate: cfg0.financeStartDate } });
    const ok: boolean[] = [];
    ok.push((await act(admin, 'setOpening', { code: '1-140', amount: inv0 ? Number(inv0.amount) : null })).ok);
    for (const id of [...created.payments].reverse()) ok.push((await act(admin, 'deletePayment', { id })).ok);
    if (created.transfer) ok.push((await act(admin, 'deleteTransfer', { id: created.transfer })).ok);
    if (created.inv) ok.push((await act(admin, 'deleteDoc', { type: 'INV', id: created.inv })).ok);
    if (created.po) ok.push((await act(admin, 'deleteDoc', { type: 'PO', id: created.po })).ok);
    if (created.bankId) ok.push((await act(admin, 'bankRemove', { id: created.bankId })).ok);
    await prisma.account.deleteMany({ where: { code: '6-9E2E' } });
    await prisma.supplier.deleteMany({ where: { name: 'E2E Supplier' } });
    await prisma.user.deleteMany({ where: { username: 'e2e-ops7' } });
    await prisma.loginAttempt.deleteMany();
    const left = (await prisma.stockMovement.count({ where: { createdAt: { gte: t0 } } })) + (await prisma.payment.count({ where: { createdAt: { gte: t0 } } }));
    check('data uji dibersihkan', ok.every(Boolean) && left === 0, `${ok.filter((x) => !x).length} gagal, ${left} tersisa`);
  }
  console.log(results.join('\n'));
  console.log(`\n${results.filter((x) => x.startsWith('OK')).length}/${results.length} lolos`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
