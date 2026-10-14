/**
 * Uji Fase 4 ujung-ke-ujung (manual, tidak ikut `npm test`):
 * file Excel → upload HTTP → database → lib/repo → buku besar, dibandingkan dengan lib/ langsung.
 *
 * Syarat: database di .env KOSONG dari toko/pesanan/SKU (hanya hasil seed), dan server jalan:
 *   npm run build && npx next start -p 3100
 * Jalankan dari root repo:
 *   npx tsx --env-file=.env --tsconfig tsconfig.json tests/e2e/import.e2e.ts
 */
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import * as XLSX from 'xlsx';
import { buildFixture } from '../parity/fixture';

const ROOT = process.cwd();
const BASE = process.env.E2E_BASE_URL || 'http://localhost:3100';
const prisma = new PrismaClient();
const results: string[] = [];
const check = (name: string, ok: boolean, extra = '') => results.push(`${ok ? 'OK  ' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);

const lib = async () => ({
  ...(await import('@/lib/marketplace/index')),
  ...(await import('@/lib/finance/index')),
  ...(await import('@/lib/migrate/fromHtml')),
  ...(await import('@/lib/ops/dailySales')),
  ...(await import('@/lib/parse/index')),
});

const manifest = JSON.parse(readFileSync(`${ROOT}/.next/server/server-reference-manifest.json`, 'utf8')).node as Record<string, { exportedName: string; filename: string }>;
const actionId = (name: string, file: string) => Object.entries(manifest).find(([, v]) => v.exportedName === name && v.filename.includes(file))![0];

async function login(username: string, password: string) {
  const html = await (await fetch(`${BASE}/login`)).text();
  const fd = new FormData();
  for (const [, n, v] of html.matchAll(/<input type="hidden" name="([^"]+)"(?: value="([^"]*)")?\/>/g)) fd.append(n, (v || '').replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
  fd.append('username', username);
  fd.append('password', password);
  const res = await fetch(`${BASE}/login`, { method: 'POST', body: fd, redirect: 'manual', headers: { 'x-forwarded-for': '10.7.0.' + Math.floor(Math.random() * 200) } });
  return 'cl_session=' + (res.headers.get('set-cookie') || '').match(/cl_session=([^;]+)/)![1];
}

async function action(cookie: string, page: string, name: string, file: string, arg: unknown) {
  const res = await fetch(`${BASE}${page}`, { method: 'POST', headers: { 'Next-Action': actionId(name, file), cookie, 'Content-Type': 'text/plain;charset=UTF-8', Accept: 'text/x-component' }, body: JSON.stringify([arg]) });
  const line = (await res.text()).split('\n').find((l) => /"ok":/.test(l))!;
  return JSON.parse(line.slice(line.indexOf(':') + 1));
}

function xlsx(aoa: unknown[][], extra?: unknown[][]): Uint8Array<ArrayBuffer> {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Sheet1');
  if (extra) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(extra), 'Catatan');
  return new Uint8Array(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }));
}

type Kind = 'sku' | 'orders' | 'fees' | 'ads' | 'opname' | 'productInfo';

async function upload(cookie: string, kind: Kind, bytes: Uint8Array<ArrayBuffer>, name: string, params: Record<string, string> = {}, mappingOverride: Record<string, string> = {}) {
  const L = await lib();
  const fd = new FormData();
  fd.append('file', new Blob([bytes]), name);
  const p = await fetch(`${BASE}/api/import/parse`, { method: 'POST', body: fd, headers: { cookie } });
  const pj = await p.json();
  if (!p.ok) return { status: p.status, ...pj };
  const fields = { sku: L.SKU_FIELDS, orders: L.ORDER_FIELDS, fees: L.FEE_FIELDS, ads: L.AD_FIELDS, opname: L.OPNAME_FIELDS, productInfo: L.PRODUCT_INFO_FIELDS }[kind];
  const mapping = { ...L.autoMap(pj.headers, fields), ...mappingOverride };
  const r = await fetch(`${BASE}/api/import/${kind}`, { method: 'POST', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ token: pj.token, mapping, params }) });
  return { status: r.status, mapping, ...(await r.json()) };
}

async function main() {
  const L = await lib();
  if ((await prisma.store.count()) || (await prisma.order.count()) || (await prisma.sku.count())) throw new Error('Database lokal sudah berisi toko/pesanan/SKU. Kosongkan dulu sebelum menjalankan uji ini.');
  const fx = buildFixture();
  const mpFx = L.marketplaceFromHtml(fx.S);
  await prisma.appConfig.update({ where: { id: 1 }, data: { financeStartDate: new Date('2026-01-01T00:00:00Z') } });
  await prisma.loginAttempt.deleteMany();
  const admin = await login(process.env.SEED_ADMIN_USERNAME as string, process.env.SEED_ADMIN_PASSWORD as string);

  // ---- toko
  const ids: Record<string, string> = {};
  for (const s of mpFx.stores) {
    const r = await action(admin, '/data/import-export', 'createStore', 'import-export', { name: s.name, channel: s.channel.toUpperCase(), brand: s.brand });
    check(`buat toko ${s.name}`, r.ok, JSON.stringify(r));
    const db = await prisma.store.findFirstOrThrow({ where: { name: s.name } });
    ids[s.id] = db.id;
    const u = await action(admin, '/data/import-export', 'updateStore', 'import-export', {
      storeId: db.id, name: s.name, brand: s.brand, feeAdmin: s.fees.admin, feeFreeShip: s.fees.freeShip, feeService: s.fees.service, feeTax: s.fees.tax, feeAms: s.fees.ams, feeProcess: s.fees.process,
    });
    check(`tarif cadangan ${s.name}`, u.ok, JSON.stringify(u));
    if (s.isDemo) await prisma.store.update({ where: { id: db.id }, data: { isDemo: true } });
  }
  const wallets = await prisma.account.findMany({ where: { code: { startsWith: '1-12' } } });
  check('akun saldo toko otomatis dibuat', wallets.length === 3, wallets.map((w) => `${w.code} ${w.name}`).join(', '));

  // ---- master SKU (format template, dengan sheet petunjuk yang barisnya lebih banyak)
  const master = (fx.docs['ops/master'] as { skus: Record<string, { b: string; p: string; v: string; ml: number; price: number; cogs: number }> }).skus;
  const skuRows = [['Master SKU', 'Brand', 'Nama Produk (Key)', 'Varian / Ukuran (asli)', 'Ukuran (ml)', 'Harga Jual (Rp)', 'HPP (Rp)'], ...Object.entries(master).map(([k, v]) => [k, v.b, v.p, v.v, v.ml, v.price, v.cogs])];
  let r = await upload(admin, 'sku', xlsx(skuRows, Array.from({ length: 30 }, (_, i) => [`catatan ${i}`])), 'master.xlsx');
  check('impor master SKU', r.ok && r.imported === Object.keys(master).length, JSON.stringify({ imported: r.imported, notes: r.notes, error: r.error }));

  // ---- pesanan per toko (format kolom Shopee), + 1 pesanan batal
  const H = ['No. Pesanan', 'Status Pesanan', 'Waktu Pesanan Dibuat', 'Nama Produk', 'SKU Induk', 'Nomor Referensi SKU', 'Nama Variasi', 'Jumlah', 'Total Harga Produk'];
  for (const s of mpFx.stores) {
    const lines = mpFx.orders.filter((o) => o.storeId === s.id);
    const aoa: unknown[][] = [H, ...lines.map((o) => [o.orderNo, 'Selesai', o.ts.replace('T', ' '), o.name, o.catalogKey, o.sku, '', o.qty, o.subtotal])];
    aoa.push(['BATAL-1', 'Batal', '2026-02-02 10:00', 'X', 'C1', 'HMNS-ORV-2', '', 1, 18000]);
    r = await upload(admin, 'orders', xlsx(aoa), `pesanan-${s.id}.xlsx`, { storeId: ids[s.id] });
    check(`impor pesanan ${s.name}`, r.ok && r.imported === lines.length && r.skipped === 1, JSON.stringify({ imported: r.imported, expected: lines.length, skipped: r.skipped, errors: r.errors?.length, notes: r.notes, error: r.error }));
  }
  // impor ulang file yang sama → tidak dobel
  const before = await prisma.orderLine.count();
  const s1 = mpFx.stores[0];
  const s1lines = mpFx.orders.filter((o) => o.storeId === s1.id);
  r = await upload(admin, 'orders', xlsx([H, ...s1lines.map((o) => [o.orderNo, 'Selesai', o.ts.replace('T', ' '), o.name, o.catalogKey, o.sku, '', o.qty, o.subtotal])]), 'ulang.xlsx', { storeId: ids[s1.id] });
  check('impor ulang pesanan tidak membuat data dobel', r.ok && (await prisma.orderLine.count()) === before, `${before} → ${await prisma.orderLine.count()}`);

  // ---- laporan penghasilan
  const FH = ['No. Pesanan', 'Biaya Administrasi', 'Biaya Proses Pesanan', 'Biaya Program Gratis Ongkir XTRA', 'Biaya Layanan Promo XTRA', 'Biaya Komisi AMS', 'PPh 22', 'Biaya Lainnya', 'Biaya Isi Saldo Otomatis', 'Total Penghasilan', 'Tanggal Dana Dilepaskan'];
  for (const s of mpFx.stores.filter((x) => !x.isDemo)) {
    const fees = Object.entries(mpFx.fees).filter(([k]) => k.startsWith(s.id + '|'));
    const aoa: unknown[][] = [FH, ...fees.map(([k, f]) => [k.split('|')[1], -f.admin, -f.process, -f.freeShip, -f.service, -f.ams, -f.tax, -f.other, -99999, f.total, f.settledAt ?? ''])];
    r = await upload(admin, 'fees', xlsx(aoa), `penghasilan-${s.id}.xlsx`, { storeId: ids[s.id] });
    check(`impor penghasilan ${s.name}`, r.ok && r.imported === fees.length && !Object.values(r.mapping).includes('Biaya Isi Saldo Otomatis'), JSON.stringify({ imported: r.imported, expected: fees.length, error: r.error }));
  }

  // ---- iklan s1 per hari (kolom tanggal) dan s2 per periode
  const ads1 = mpFx.ads.filter((a) => a.storeId === s1.id);
  r = await upload(admin, 'ads', xlsx([['Tanggal', 'Nama Iklan', 'Biaya', 'Penjualan'], ...ads1.map((a) => [a.from, a.adName, a.amount, a.sales])]), 'iklan-s1.xlsx', { storeId: ids[s1.id] });
  check('impor iklan harian', r.ok && r.imported === ads1.length, JSON.stringify({ imported: r.imported, expected: ads1.length, notes: r.notes, error: r.error }));
  r = await upload(admin, 'ads', xlsx([['Nama Iklan', 'Biaya', 'Penjualan', 'Klik'], ['Decant Mykonos Utopia Vanilla', 120000, 400000, 5]]), 'iklan-s2.xlsx', { storeId: ids['s2'] });
  check('iklan tanpa tanggal & tanpa periode ditolak', !r.ok && /periode/.test(r.error), r.error);
  r = await upload(admin, 'ads', xlsx([['Nama Iklan', 'Biaya', 'Penjualan', 'Klik'], ['Decant Mykonos Utopia Vanilla', 120000, 400000, 5]]), 'iklan-s2.xlsx', { storeId: ids['s2'], from: '2026-03-01', to: '2026-03-07' });
  check('impor iklan per periode', r.ok && r.imported === 1, JSON.stringify(r));
  const maps = await prisma.adCatalogMap.findMany({ where: { storeId: ids[s1.id] }, include: { catalog: true } });
  const exp = L.autoMatchAll(ads1, mpFx.catalogs, {});
  const ok = maps.every((m) => (m.catalog?.externalKey ?? '') === (exp[`${s1.id}|${m.adName}`]?.catalogKey ?? ''));
  check('pencocokan iklan otomatis sama dengan lib', ok && maps.length > 0, maps.map((m) => `${m.adName.slice(0, 25)}→${m.catalog?.externalKey ?? '-'}`).join('; '));

  // ---- penjualan harian vs lib
  const ds = await prisma.dailySale.findMany({ include: { sku: true } });
  const want = L.buildDailySales(mpFx.orders, mpFx.stores);
  let wantTotal = 0;
  for (const rows of Object.values(want) as Record<string, number>[]) for (const [k, q] of Object.entries(rows)) if (master[k]) wantTotal += q;
  const got = ds.reduce((a, d) => a + d.qty, 0);
  check('penjualan harian (DailySale) = buildDailySales, tanpa toko demo', got === wantTotal && ds.length > 0, `${got} vs ${wantTotal}`);

  // ---- buku besar dari DB vs lib langsung
  const sum = await (await fetch(`${BASE}/api/finance/summary?from=2026-01-01&to=2026-03-31`, { headers: { cookie: admin } })).json();
  const fin = L.financeFromHtml({ 'fin/main/cfg/main': { start: '2026-01-01' } }, mpFx, fx.today);
  const Lg = L.buildLedger({ ...fin, marketplace: mpFx, rates: L.learnRates(mpFx) });
  const pl = L.profitLoss(Lg, fin.accounts, '2026-01-01', '2026-03-31');
  const near = (a: number, b: number) => Math.abs(a - b) <= 1;
  check('laba rugi dari data impor = lib (≤ Rp1)', near(sum.revenue, pl.revenue.total) && near(sum.cogs, pl.cogs.total) && near(sum.expense, pl.expense.total) && near(sum.netProfit, pl.netProfit) && sum.trialBalance.balanced,
    `omzet ${sum.revenue} vs ${pl.revenue.total}, hpp ${sum.cogs} vs ${pl.cogs.total}, beban ${sum.expense} vs ${pl.expense.total}, laba ${sum.netProfit} vs ${pl.netProfit}`);

  // ---- opname
  const jogja = await prisma.warehouse.findUniqueOrThrow({ where: { code: 'jogja' } });
  const t = await fetch(`${BASE}/api/export/opname-template?warehouseId=${jogja.id}&date=2026-03-31&brand=HMNS`, { headers: { cookie: admin } });
  const twb = XLSX.read(new Uint8Array(await t.arrayBuffer()));
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(twb.Sheets[twb.SheetNames[0]], { header: 1 });
  check('download template opname per gudang', t.ok && JSON.stringify(aoa[0]) === JSON.stringify(['No', 'Nama Brand', 'Kode SKU', 'Qty Tercatat', 'Qty Stock Opname']) && aoa.length > 5 && aoa.slice(1).every((x) => x[1] === 'HMNS'), `${aoa.length - 1} baris; ${decodeURIComponent((t.headers.get('content-disposition') || '').split("''")[1] || '')}`);
  const filled = aoa.map((x, i) => (i === 0 ? x : [x[0], x[1], x[2], x[3], i % 3 === 0 ? '' : i * 2]));
  filled.push([99, 'X', 'TIDAK-ADA', 0, 4]);
  r = await upload(admin, 'opname', xlsx(filled), 'opname.xlsx', { warehouseId: jogja.id, date: '2026-03-31' });
  const op = await prisma.opname.findUnique({ where: { warehouseId_date: { warehouseId: jogja.id, date: new Date('2026-03-31T00:00:00Z') } }, include: { counts: true } });
  check('impor hasil opname → draft + hitungan per SKU', r.ok && !!op && !op.final && op.counts.length === r.imported && r.errors.length === 1, JSON.stringify({ imported: r.imported, errors: r.errors, notes: r.notes }));
  await prisma.opname.update({ where: { id: op!.id }, data: { final: true } });
  r = await upload(admin, 'opname', xlsx(filled), 'opname.xlsx', { warehouseId: jogja.id, date: '2026-03-31' });
  check('opname final tidak bisa diubah lewat upload', !r.ok && /sudah diselesaikan/.test(r.error), r.error);

  // ---- info barang
  const ct = await fetch(`${BASE}/api/export/product-info-template`, { headers: { cookie: admin } });
  const cwb = XLSX.read(new Uint8Array(await ct.arrayBuffer()));
  const caoa = XLSX.utils.sheet_to_json<unknown[]>(cwb.Sheets['Info Barang'], { header: 1 });
  const cfill = caoa.map((x, i) => (i === 0 ? x : [x[0], x[1], i === 1 ? '2027-06-30' : '', i <= 2 ? 'Top: bergamot' : '', i === 1 ? 'https://drive.google.com/x' : '']));
  r = await upload(admin, 'productInfo', xlsx(cfill), 'info.xlsx');
  const infos = await prisma.productInfo.findMany();
  check('impor info barang (sel kosong dilewati)', r.ok && r.imported === 2 && infos.length === 2 && infos.some((i) => i.lookUrl?.startsWith('https://')), JSON.stringify({ imported: r.imported, skipped: r.skipped, n: infos.length }));
  await prisma.productInfo.update({ where: { id: infos[0].id }, data: { notes: 'catatan lama' } });
  r = await upload(admin, 'productInfo', xlsx([caoa[0], [infos[0] ? (await prisma.brand.findUniqueOrThrow({ where: { id: infos[0].brandId } })).name : '', infos[0].productKey, '2028-01-01', '', '']]), 'info2.xlsx');
  const after = await prisma.productInfo.findUniqueOrThrow({ where: { id: infos[0].id } });
  check('sel kosong tidak menimpa data lama', r.ok && after.notes === 'catatan lama' && after.expiredAt?.toISOString().slice(0, 10) === '2028-01-01', `${after.notes} ${after.expiredAt?.toISOString().slice(0, 10)}`);

  // ---- download master SKU
  const mt = await fetch(`${BASE}/api/export/sku-master`, { headers: { cookie: admin } });
  const mwb = XLSX.read(new Uint8Array(await mt.arrayBuffer()));
  const maoa = XLSX.utils.sheet_to_json<unknown[]>(mwb.Sheets[mwb.SheetNames[0]], { header: 1 });
  check('download master SKU sekarang', mt.ok && maoa.length - 1 === Object.keys(master).length && JSON.stringify(maoa[0]) === JSON.stringify(skuRows[0]), `${maoa.length - 1} SKU`);

  // ---- izin
  await prisma.user.deleteMany({ where: { username: 'e2e-ops' } });
  await prisma.user.create({ data: { name: 'Gudang', username: 'e2e-ops', passwordHash: await bcrypt.hash('gudang-12345', 12), permissions: { create: [{ menu: 'OPS' }] } } });
  const ops = await login('e2e-ops', 'gudang-12345');
  r = await upload(ops, 'orders', xlsx([H, ['Z1', 'Selesai', '2026-03-01 10:00', 'X', 'C', 'S', '', 1, 1000]]), 'x.xlsx', { storeId: ids[s1.id] });
  check('staff Operasional tidak bisa impor pesanan (403)', r.status === 403, `${r.status} ${r.error}`);
  const exp403 = await fetch(`${BASE}/api/export/sku-master`, { headers: { cookie: ops } });
  check('staff Operasional tidak bisa download master SKU (403)', exp403.status === 403, String(exp403.status));
  const exOk = await fetch(`${BASE}/api/export/opname-template?warehouseId=${jogja.id}&date=2026-04-01`, { headers: { cookie: ops } });
  check('staff Operasional boleh download template opname', exOk.ok, String(exOk.status));
  const fd = new FormData();
  fd.append('file', new Blob([new Uint8Array(10)]), 'virus.exe');
  const bad = await fetch(`${BASE}/api/import/parse`, { method: 'POST', body: fd, headers: { cookie: admin } });
  check('file selain xlsx/xls/csv ditolak', bad.status === 400, `${bad.status} ${(await bad.json()).error}`);
  const big = new FormData();
  big.append('file', new Blob([new Uint8Array(21 * 1024 * 1024)]), 'besar.xlsx');
  const tooBig = await fetch(`${BASE}/api/import/parse`, { method: 'POST', body: big, headers: { cookie: admin } });
  check('file > 20 MB ditolak', tooBig.status === 413, String(tooBig.status));
  const page = await fetch(`${BASE}/data/import-export`, { headers: { cookie: admin } });
  check('halaman Import / export tampil', page.ok && /Laporan iklan/.test(await page.text()), String(page.status));
  const ik = await fetch(`${BASE}/data/import-export/iklan?store=${ids[s1.id]}`, { headers: { cookie: admin } });
  check('halaman Pencocokan iklan tampil', ik.ok && /Pencocokan iklan/.test(await ik.text()), String(ik.status));

  await prisma.user.deleteMany({ where: { username: 'e2e-ops' } });
  await prisma.loginAttempt.deleteMany();
  console.log(results.join('\n'));
  console.log(`\n${results.filter((x) => x.startsWith('OK')).length}/${results.length} lolos`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
