/**
 * Uji Fase 6 ujung-ke-ujung (manual, tidak ikut `npm test`): halaman & server action Operasional lewat HTTP.
 *
 * Syarat: database di .env berisi master SKU hasil e2e impor (HMNS Orevall/Alpha, …) tanpa aturan konversi,
 * dan server jalan:  npm run build && npx next start -p 3311
 * Jalankan dari root repo:
 *   npx tsx --env-file=.env --tsconfig tsconfig.json tests/e2e/ops.e2e.ts
 * Semua data yang dibuat tes ini dihapus lagi lewat server action (supaya cache ikut dibuang).
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
const actionId = (name: string) => {
  const hit = Object.entries(manifest).find(([, v]) => v.exportedName === name && /operasional[\\/]actions/.test(v.filename));
  if (!hit) throw new Error(`action ${name} tidak ditemukan di manifest`);
  return hit[0];
};

async function login(username: string, password: string) {
  const html = await (await fetch(`${BASE}/login`)).text();
  const fd = new FormData();
  for (const [, n, v] of html.matchAll(/<input type="hidden" name="([^"]+)"(?: value="([^"]*)")?\/>/g)) fd.append(n, (v || '').replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
  fd.append('username', username);
  fd.append('password', password);
  const res = await fetch(`${BASE}/login`, { method: 'POST', body: fd, redirect: 'manual', headers: { 'x-forwarded-for': '10.8.0.' + Math.floor(Math.random() * 200) } });
  return 'cl_session=' + (res.headers.get('set-cookie') || '').match(/cl_session=([^;]+)/)![1];
}

type R<T = unknown> = { ok: true; data?: T; message?: string } | { ok: false; error: string };
async function act<T = unknown>(cookie: string, name: string, arg: unknown): Promise<R<T>> {
  const res = await fetch(`${BASE}/operasional/stok`, { method: 'POST', headers: { 'Next-Action': actionId(name), cookie, 'Content-Type': 'text/plain;charset=UTF-8', Accept: 'text/x-component' }, body: JSON.stringify([arg]) });
  const line = (await res.text()).split('\n').find((l) => /"ok":/.test(l));
  if (!line) throw new Error(`${name}: respons tanpa hasil (${res.status})`);
  return JSON.parse(line.slice(line.indexOf(':') + 1));
}

async function page(cookie: string, path: string) {
  const res = await fetch(`${BASE}${path}`, { headers: { cookie } });
  const html = (await res.text()).replace(/<!-- -->/g, '');
  return { status: res.status, html };
}

interface Snap {
  code: string;
  category: string;
  ml: number;
  hpp: number;
  stock: { id: string; name: string; now: number }[];
  targets: { code: string; ml: number; ratio: number; stock: number }[];
}

async function main() {
  const t0 = new Date();
  await prisma.loginAttempt.deleteMany();
  const admin = await login(process.env.SEED_ADMIN_USERNAME as string, process.env.SEED_ADMIN_PASSWORD as string);
  const whs = await prisma.warehouse.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } });
  const jogja = whs.find((w) => w.code === 'jogja')!;
  const rembang = whs.find((w) => w.code === 'rembang')!;
  const cfg0 = (await prisma.appConfig.findUnique({ where: { id: 1 } }))!;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const ORV2 = await prisma.sku.findUniqueOrThrow({ where: { code: 'HMNS-ORV-2' } });
  const created = { rules: [] as string[], pack: '', movements: [] as string[], opname: '', returns: [] as string[], employee: '' };

  const snap = async (sku: string, mode: 'io' | 'PRODUCTION' | 'SHIFT' = 'io', warehouseId = jogja.id) => {
    const r = await act<Snap>(admin, 'skuSnapshot', { sku, mode, warehouseId });
    if (!r.ok || !r.data) throw new Error(`snapshot ${sku}: ${r.ok ? 'kosong' : r.error}`);
    return r.data;
  };
  const at = (s: Snap, wh: string) => s.stock.find((x) => x.id === wh)!.now;
  const total = (s: Snap) => s.stock.reduce((a, x) => a + x.now, 0);
  const newMovement = async () => (await prisma.stockMovement.findFirstOrThrow({ orderBy: { createdAt: 'desc' } })).id;

  try {
    // ---- halaman tampil
    for (const [p, txt] of [
      ['/operasional/task', 'Task produksi decant'],
      ['/operasional/produksi', 'Riwayat produksi'],
      ['/operasional/keluar-masuk', 'Riwayat keluar masuk'],
      ['/operasional/stok', 'Stok real-time'],
      ['/operasional/umur-stok', 'Umur stock'],
      ['/operasional/opname', 'Sesi opname'],
      ['/operasional/retur', 'Retur masuk'],
      ['/operasional/absensi', 'Absensi'],
      ['/operasional/master', 'Master SKU &amp; aturan'],
      ['/operasional/master?view=qa', 'Master SKU &amp; aturan'],
      ['/operasional/master?view=avg', 'Upload histori'],
    ]) {
      const r = await page(admin, p);
      check(`halaman ${p} tampil`, r.status === 200 && r.html.includes(txt) && !r.html.includes('Application error'), String(r.status));
    }

    // ---- master: kemasan + aturan konversi → kategori Fullsize/Decant
    let r: R = await act(admin, 'packSave', { name: 'E2E botol 10ml', bottle: 1500, sticker: 300, other: 200 });
    created.pack = (await prisma.pack.findFirstOrThrow({ where: { name: 'E2E botol 10ml' } })).id;
    check('tambah kemasan', r.ok);
    for (const [to, q, pack] of [
      [2, 47, ''],
      [5, 19, ''],
      [10, 9, created.pack],
    ] as const) {
      r = await act(admin, 'ruleSave', { brand: 'HMNS', fromMl: 100, toMl: to, qtyPerBottle: q, packId: pack });
      check(`tambah aturan HMNS 100ml → ${to}ml`, r.ok, r.ok ? '' : r.error);
    }
    created.rules = (await prisma.conversionRule.findMany({ where: { brand: { name: 'HMNS' } } })).map((x) => x.id);
    r = await act(admin, 'ruleSave', { brand: 'HMNS', fromMl: 100, toMl: 10, qtyPerBottle: 9 });
    check('aturan dobel ditolak', !r.ok);
    const conv = await page(admin, '/operasional/master?view=conv');
    check('halaman aturan konversi menampilkan aturan & biaya kemasan', conv.html.includes('E2E botol 10ml') && conv.html.includes('Rp2.000'));

    // ---- produksi decant
    const p0 = await snap('HMNS-ORV-100', 'PRODUCTION');
    check('ORV-100 jadi Fullsize & decant-nya terdeteksi', p0.category === 'Fullsize' && ['HMNS-ORV-2', 'HMNS-ORV-5', 'HMNS-ORV-10'].every((c) => p0.targets.some((t) => t.code === c)), p0.targets.map((t) => `${t.code}:${t.ratio}`).join(' '));
    check('rasio dari aturan konversi', p0.targets.find((t) => t.code === 'HMNS-ORV-10')?.ratio === 9);
    const d0 = await snap('HMNS-ORV-10');
    r = await act(admin, 'saveProduction', { type: 'PRODUCTION', date: today, warehouseId: jogja.id, src: 'HMNS-ORV-100', bottles: 1, outs: [{ sku: 'HMNS-ORV-10', qty: 9 }], note: 'e2e' });
    check('simpan produksi', r.ok, r.ok ? '' : r.error);
    created.movements.push(await newMovement());
    const p1 = await snap('HMNS-ORV-100');
    const d1 = await snap('HMNS-ORV-10');
    check('produksi: botol sumber −1 di Gudang Jogja', at(p1, jogja.id) === at(p0, jogja.id) - 1, `${at(p0, jogja.id)} → ${at(p1, jogja.id)}`);
    check('produksi: decant +9 di Gudang Jogja', at(d1, jogja.id) === at(d0, jogja.id) + 9, `${at(d0, jogja.id)} → ${at(d1, jogja.id)}`);
    const expDecant = (p0.hpp / (100 * 0.95)) * 10 + 2000;
    if (total(d0) <= 0) check('HPP decant = HPP sumber ÷ (ml × 95%) × ml + kemasan', near(d1.hpp, expDecant), `${d1.hpp.toFixed(2)} vs ${expDecant.toFixed(2)}`);
    else check('HPP decant berubah setelah produksi', d1.hpp !== d0.hpp);

    // Produksi dari SKU non-fullsize hanya diberi peringatan di form (sama dengan HTML); geser dari kategori Lainnya ditolak server.
    r = await act(admin, 'saveProduction', { type: 'SHIFT', date: today, warehouseId: jogja.id, src: 'HMNS-ORV-50', bottles: 1, outs: [{ sku: 'HMNS-ORV-2', qty: 1 }] });
    check('geser dari SKU kategori Lainnya ditolak', !r.ok, r.ok ? '' : r.error);

    // ---- geser decant 10ml → 2ml
    const g0 = await snap('HMNS-ORV-10', 'SHIFT');
    check('geser: tujuan 2ml rasio 4 (10 × 95% ÷ 2)', g0.targets.find((t) => t.code === 'HMNS-ORV-2')?.ratio === 4, JSON.stringify(g0.targets.map((t) => [t.code, t.ratio])));
    const s0 = await snap('HMNS-ORV-2');
    r = await act(admin, 'saveProduction', { type: 'SHIFT', date: today, warehouseId: jogja.id, src: 'HMNS-ORV-10', bottles: 1, outs: [{ sku: 'HMNS-ORV-2', qty: 4 }] });
    check('simpan geser decant', r.ok, r.ok ? '' : r.error);
    created.movements.push(await newMovement());
    const g1 = await snap('HMNS-ORV-10');
    const s1 = await snap('HMNS-ORV-2');
    check('geser: sumber −1, hasil +4', at(g1, jogja.id) === at(d1, jogja.id) - 1 && at(s1, jogja.id) === at(s0, jogja.id) + 4);

    // ---- barang masuk / keluar / pindah
    const a0 = await snap('HMNS-ALP-100');
    r = await act(admin, 'saveIO', { type: 'IN', date: today, warehouseId: jogja.id, sku: 'HMNS-ALP-100', qty: 2, price: 250000, note: 'e2e' });
    check('barang masuk', r.ok, r.ok ? '' : r.error);
    created.movements.push(await newMovement());
    const a1 = await snap('HMNS-ALP-100');
    check('barang masuk: stok +2', at(a1, jogja.id) === at(a0, jogja.id) + 2);
    if (total(a0) <= 0) check('barang masuk berharga: HPP = harga beli (stok sebelumnya ≤ 0)', near(a1.hpp, 250000), String(a1.hpp));
    else check('barang masuk berharga: HPP rata-rata bergerak', a1.hpp !== a0.hpp, `${a0.hpp} → ${a1.hpp}`);

    r = await act(admin, 'saveIO', { type: 'OUT', date: today, warehouseId: jogja.id, sku: 'HMNS-ORV-10', qty: 1, reason: 'Rusak / pecah', note: 'e2e pecah' });
    check('barang keluar', r.ok, r.ok ? '' : r.error);
    created.movements.push(await newMovement());
    r = await act(admin, 'saveIO', { type: 'TRANSFER', date: today, warehouseId: jogja.id, toWarehouseId: rembang.id, sku: 'HMNS-ORV-10', qty: 3 });
    check('pindah gudang', r.ok, r.ok ? '' : r.error);
    created.movements.push(await newMovement());
    const k1 = await snap('HMNS-ORV-10');
    check('keluar −1 & pindah −3 di Jogja, +3 di Rembang', at(k1, jogja.id) === at(g1, jogja.id) - 4 && at(k1, rembang.id) === at(g1, rembang.id) + 3, `jogja ${at(g1, jogja.id)}→${at(k1, jogja.id)}, rembang ${at(g1, rembang.id)}→${at(k1, rembang.id)}`);
    check('pindah gudang tidak mengubah total stok', total(k1) === total(g1) - 1);

    r = await act(admin, 'saveIO', { type: 'OUT', date: today, warehouseId: jogja.id, sku: 'HMNS-ORV-10', qty: 1, reason: 'asal' });
    check('barang keluar tanpa alasan valid ditolak', !r.ok);
    r = await act(admin, 'saveIO', { type: 'TRANSFER', date: today, warehouseId: jogja.id, toWarehouseId: jogja.id, sku: 'HMNS-ORV-10', qty: 1 });
    check('pindah ke gudang yang sama ditolak', !r.ok);
    r = await act(admin, 'saveIO', { type: 'IN', date: today, warehouseId: jogja.id, sku: 'TIDAK-ADA', qty: 1 });
    check('SKU di luar master ditolak', !r.ok);

    const km = await page(admin, '/operasional/keluar-masuk');
    check('riwayat keluar masuk menampilkan catatan', km.html.includes('e2e pecah') && km.html.includes('Pindah gudang'));
    const pr = await page(admin, '/operasional/produksi');
    check('riwayat produksi menampilkan produksi & geser', pr.html.includes('HMNS-ORV-100') && pr.html.includes('Geser'));
    const hist = await page(admin, '/operasional/stok?hist=HMNS-ORV-10');
    check(
      'modal Riwayat (kartu stok) berisi semua jenis mutasi',
      ['Mutasi per barang', 'Produksi dari HMNS-ORV-100', 'Digeser ke', 'Barang keluar · Rusak / pecah', `Pindah ke ${rembang.name}`, `Pindah dari ${jogja.name}`].every((s) => hist.html.includes(s)),
    );
    const one = await page(admin, `/operasional/stok?wh=${rembang.id}`);
    check('stok: filter satu gudang', one.status === 200 && one.html.includes('Stok real-time'));
    const task = await page(admin, '/operasional/task?prio=all');
    check('task produksi menampilkan decant HMNS', task.html.includes('HMNS-ORV-10') && task.html.includes('HMNS-ORV-2'));

    // ---- stock opname (Rembang, hari ini): input per baris → final → baseline
    const o0 = await snap('HMNS-ORV-2');
    const oc = await act<{ id: string }>(admin, 'opnameCreate', { date: today, warehouseId: rembang.id });
    check('mulai sesi opname', oc.ok && !!oc.data?.id);
    created.opname = oc.ok && oc.data ? oc.data.id : '';
    r = await act(admin, 'opnameSetCount', { opnameId: created.opname, sku: 'HMNS-ORV-10', qty: 7 });
    check('isi qty fisik per baris', r.ok);
    const op = await page(admin, `/operasional/opname?id=${created.opname}`);
    check('halaman sesi opname tampil', op.html.includes(`Opname ${rembang.name}`) && op.html.includes('Selesaikan &amp; jadikan baseline'));
    r = await act(admin, 'opnameFinalize', { opnameId: created.opname });
    check('selesaikan opname', r.ok, r.ok ? '' : r.error);
    const o1 = await snap('HMNS-ORV-10');
    const o2 = await snap('HMNS-ORV-2');
    check('opname final jadi baseline (transaksi di tanggal opname sudah termasuk)', at(o1, rembang.id) === 7, String(at(o1, rembang.id)));
    check('SKU yang tidak diisi memakai stok sistem', at(o2, rembang.id) === at(o0, rembang.id));
    r = await act(admin, 'opnameSetCount', { opnameId: created.opname, sku: 'HMNS-ORV-10', qty: 8 });
    check('opname final tidak bisa diubah', !r.ok);
    r = await act(admin, 'opnameReopen', { opnameId: created.opname });
    check('buka lagi opname', r.ok);
    r = await act(admin, 'opnameDelete', { opnameId: created.opname });
    check('hapus sesi opname draft', r.ok);
    if (r.ok) created.opname = '';
    const o3 = await snap('HMNS-ORV-10');
    check('setelah sesi dihapus, stok kembali ke perhitungan lama', at(o3, rembang.id) === at(k1, rembang.id));

    // ---- retur (catatan saja)
    const code = `E2E-RESI-${Date.now()}`;
    const rr = await act<{ duplicate: string }>(admin, 'returCreate', { date: today, code, matches: false });
    check('scan retur tersimpan', rr.ok && rr.data?.duplicate === '');
    const dup = await act<{ duplicate: string }>(admin, 'returCreate', { date: today, code, matches: true });
    check('scan ulang terdeteksi duplikat', dup.ok && dup.data?.duplicate === today);
    const forced = await act(admin, 'returCreate', { date: today, code, matches: true, force: true });
    check('duplikat tetap bisa disimpan setelah konfirmasi', forced.ok);
    created.returns = (await prisma.returnNote.findMany({ where: { code } })).map((x) => x.id);
    r = await act(admin, 'returUpdate', { id: created.returns[0], processed: true, note: 'dus penyok' });
    const ret = await page(admin, '/operasional/retur?filter=tidak');
    check('halaman retur: filter tidak sesuai + catatan', ret.html.includes(code) && ret.html.includes('dus penyok'));
    const r1 = await snap('HMNS-ORV-10');
    check('retur tidak mengubah stok', total(r1) === total(o3));

    // ---- absensi
    r = await act(admin, 'employeeAdd', { name: 'E2E Karyawan' });
    created.employee = (await prisma.employee.findFirstOrThrow({ where: { name: 'E2E Karyawan' }, orderBy: { id: 'desc' } })).id;
    r = await act(admin, 'attendanceSet', { employeeId: created.employee, date: today, present: true });
    const r2 = await act(admin, 'attendanceSet', { employeeId: created.employee, date: today, note: 'masuk jam 10' });
    const att = await prisma.attendance.findFirst({ where: { employeeId: created.employee } });
    check('absensi: centang & catatan tersimpan di baris yang sama', r.ok && r2.ok && att?.present === true && att.note === 'masuk jam 10');
    const ab = await page(admin, `/operasional/absensi?month=${today.slice(0, 7)}`);
    check('halaman absensi menampilkan karyawan & catatan', ab.html.includes('E2E Karyawan') && ab.html.includes('masuk jam 10'));

    // ---- master: pengaturan, harga, lead time, sumber, gudang
    r = await act(admin, 'setOpsConfig', { targetDays: 21 });
    const t21 = await page(admin, '/operasional/task');
    check('target stok dari pengaturan dipakai di Task produksi', r.ok && t21.html.includes('× 21 hari'));
    r = await act(admin, 'skuUpdate', { code: 'HMNS-ORV-2', field: 'price', value: 9999 });
    check('ubah harga jual di master', r.ok && Number((await prisma.sku.findUniqueOrThrow({ where: { code: 'HMNS-ORV-2' } })).price) === 9999);
    await act(admin, 'skuUpdate', { code: 'HMNS-ORV-2', field: 'price', value: Number(ORV2.price) });
    r = await act(admin, 'skuUpdate', { code: 'HMNS-ORV-2', field: 'price', value: -5 });
    check('harga minus ditolak', !r.ok);
    r = await act(admin, 'leadTimeSet', { brand: 'HMNS', days: 10 });
    const lead = await page(admin, '/operasional/master?view=lead');
    check('lead time tersimpan', r.ok && lead.html.includes('Lead time HMNS'));
    await act(admin, 'leadTimeSet', { brand: 'HMNS', days: null });
    r = await act(admin, 'sourceSet', { brand: 'HMNS', product: 'Alpha', sku: 'HMNS-ORV-100' });
    const src = await page(admin, '/operasional/master?view=src&srcF=manual');
    check('sumber fullsize manual', r.ok && src.html.includes('Manual'));
    r = await act(admin, 'sourceSet', { brand: 'HMNS', product: 'Alpha', sku: '' });
    check('sumber kembali otomatis', r.ok && !(await prisma.sourceOverride.count({ where: { productKey: 'Alpha' } })));
    r = await act(admin, 'warehouseRemove', { id: jogja.id });
    check('gudang utama tidak bisa dihapus', !r.ok);

    // ---- izin
    await prisma.user.deleteMany({ where: { username: { in: ['e2e-ops6', 'e2e-cs6'] } } });
    await prisma.user.create({ data: { name: 'Gudang', username: 'e2e-ops6', passwordHash: await bcrypt.hash('gudang-12345', 12), permissions: { create: [{ menu: 'OPS' }] } } });
    await prisma.user.create({ data: { name: 'CS', username: 'e2e-cs6', passwordHash: await bcrypt.hash('cs-12345678', 12), permissions: { create: [{ menu: 'CS' }] } } });
    const ops = await login('e2e-ops6', 'gudang-12345');
    const cs = await login('e2e-cs6', 'cs-12345678');
    const po = await page(ops, '/operasional/stok');
    check('staff Operasional bisa buka Stok real-time', po.html.includes('Stok real-time') && !po.html.includes('tidak punya akses'));
    const pc = await page(cs, '/operasional/stok');
    check('staff tanpa izin Operasional diblok di halaman (isi tidak ikut terkirim)', pc.html.includes('tidak punya akses') && !pc.html.includes('Nilai stok (HPP)'));
    const mk = await page(cs, '/marketing/ads');
    check('isi halaman Marketing tidak terkirim ke staff tanpa izin', mk.html.includes('tidak punya akses') && !mk.html.includes('Penjualan dari iklan'));
    const ak = await page(ops, '/data/akun');
    check('daftar user (Akun & akses) tidak terkirim ke non-admin', ak.html.includes('tidak punya akses') && !ak.html.includes('e2e-cs6'));
    r = await act(cs, 'saveIO', { type: 'IN', date: today, warehouseId: jogja.id, sku: 'HMNS-ALP-100', qty: 1 });
    check('staff tanpa izin Operasional ditolak di server action', !r.ok, r.ok ? '' : r.error);
    const r3 = await act(ops, 'returCreate', { date: today, code: code + '-OPS', matches: true });
    check('staff Operasional bisa input retur (createdBy terisi)', r3.ok && (await prisma.returnNote.findFirst({ where: { code: code + '-OPS' }, include: { createdBy: true } }))?.createdBy?.username === 'e2e-ops6');
    created.returns.push(...(await prisma.returnNote.findMany({ where: { code: code + '-OPS' } })).map((x) => x.id));
  } finally {
    // ---- bersihkan lewat action (cache ikut dibuang)
    const ok: boolean[] = [];
    for (const id of created.movements) ok.push((await act(admin, 'deleteMovement', { id })).ok);
    if (created.opname) {
      await act(admin, 'opnameReopen', { opnameId: created.opname });
      ok.push((await act(admin, 'opnameDelete', { opnameId: created.opname })).ok);
    }
    for (const id of created.returns) ok.push((await act(admin, 'returDelete', { id })).ok);
    for (const id of created.rules) ok.push((await act(admin, 'ruleDelete', { id })).ok);
    if (created.pack) ok.push((await act(admin, 'packDelete', { id: created.pack })).ok);
    if (created.employee) await prisma.employee.delete({ where: { id: created.employee } });
    await prisma.sourceOverride.deleteMany({ where: { productKey: 'Alpha' } });
    await prisma.brand.updateMany({ where: { name: 'HMNS' }, data: { leadTimeDays: null } });
    await prisma.sku.update({ where: { code: 'HMNS-ORV-2' }, data: { price: ORV2.price } });
    ok.push((await act(admin, 'setOpsConfig', { targetDays: cfg0.targetDays, shrinkPct: Number(cfg0.shrinkPct), avgMode: cfg0.avgMode, avgDays: cfg0.avgDays })).ok);
    await prisma.user.deleteMany({ where: { username: { in: ['e2e-ops6', 'e2e-cs6'] } } });
    await prisma.loginAttempt.deleteMany();
    const left = await prisma.stockMovement.count({ where: { createdAt: { gte: t0 } } });
    check('data uji dibersihkan', ok.every(Boolean) && left === 0 && !(await prisma.conversionRule.count()), `${ok.filter((x) => !x).length} gagal, ${left} pergerakan tersisa`);
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
