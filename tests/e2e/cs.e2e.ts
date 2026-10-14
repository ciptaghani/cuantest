/**
 * Uji Fase 8 ujung-ke-ujung (manual, tidak ikut `npm test`): halaman & server action CS lewat HTTP.
 *
 * Syarat: database di .env berisi master SKU hasil e2e impor, dan server jalan:  npm run build && npx next start -p 3311
 * Jalankan dari root repo:
 *   npx tsx --env-file=.env --tsconfig tsconfig.json tests/e2e/cs.e2e.ts
 * Info barang yang diubah tes ini dikembalikan seperti semula.
 */
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const ROOT = process.cwd();
const BASE = process.env.E2E_BASE_URL || 'http://localhost:3311';
const prisma = new PrismaClient();
const results: string[] = [];
const check = (name: string, ok: boolean, extra = '') => results.push(`${ok ? 'OK  ' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);

const manifest = JSON.parse(readFileSync(`${ROOT}/.next/server/server-reference-manifest.json`, 'utf8')).node as Record<string, { exportedName: string; filename: string }>;
const actionId = (name: string) => {
  const hit = Object.entries(manifest).find(([, v]) => v.exportedName === name && /cs[\\/]actions/.test(v.filename));
  if (!hit) throw new Error(`action ${name} tidak ditemukan di manifest`);
  return hit[0];
};

async function login(username: string, password: string) {
  const html = await (await fetch(`${BASE}/login`)).text();
  const fd = new FormData();
  for (const [, n, v] of html.matchAll(/<input type="hidden" name="([^"]+)"(?: value="([^"]*)")?\/>/g)) fd.append(n, (v || '').replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
  fd.append('username', username);
  fd.append('password', password);
  const res = await fetch(`${BASE}/login`, { method: 'POST', body: fd, redirect: 'manual', headers: { 'x-forwarded-for': '10.10.0.' + Math.floor(Math.random() * 200) } });
  return 'cl_session=' + (res.headers.get('set-cookie') || '').match(/cl_session=([^;]+)/)![1];
}

type R = { ok: true; message?: string } | { ok: false; error: string };
async function act(cookie: string, name: string, arg: unknown): Promise<R> {
  const res = await fetch(`${BASE}/cs/input`, { method: 'POST', headers: { 'Next-Action': actionId(name), cookie, 'Content-Type': 'text/plain;charset=UTF-8', Accept: 'text/x-component' }, body: JSON.stringify([arg]) });
  const line = (await res.text()).split('\n').find((l) => /"ok":/.test(l));
  if (!line) throw new Error(`${name}: respons tanpa hasil (${res.status})`);
  return JSON.parse(line.slice(line.indexOf(':') + 1));
}

async function page(cookie: string, path: string) {
  const res = await fetch(`${BASE}${path}`, { headers: { cookie } });
  return { status: res.status, html: (await res.text()).replace(/<!-- -->/g, '') };
}

async function main() {
  await prisma.loginAttempt.deleteMany();
  const admin = await login(process.env.SEED_ADMIN_USERNAME as string, process.env.SEED_ADMIN_PASSWORD as string);
  const sku = await prisma.sku.findFirstOrThrow({ where: { active: true }, include: { brand: true }, orderBy: { code: 'asc' } });
  const brand = sku.brand.name;
  const product = sku.productKey;
  const before = await prisma.productInfo.findUnique({ where: { brandId_productKey: { brandId: sku.brandId, productKey: product } } });
  const q = encodeURIComponent(`${brand} ${product}`);

  try {
    for (const [p, txt] of [
      ['/cs', 'Info stock'],
      [`/cs/stock?q=${q}`, sku.code],
      ['/cs/stock?q=zzzz-tidak-ada', 'Varian tidak ditemukan'],
      [`/cs/info?q=${q}`, 'Size ready'],
      ['/cs/input', 'Kelengkapan info'],
    ]) {
      const r = await page(admin, p);
      check(`halaman ${p}`, r.status === 200 && r.html.includes(txt), `status ${r.status}`);
    }

    const bad = await act(admin, 'saveInfo', { brand, product, lookUrl: 'javascript:alert(1)' });
    check('link look visual non-http ditolak', !bad.ok);
    const unknown = await act(admin, 'saveInfo', { brand, product: 'Varian Tidak Ada' });
    check('varian di luar master ditolak', !unknown.ok);
    const ok = await act(admin, 'saveInfo', { brand, product, expiredAt: '2020-01-31', notes: 'Top: uji e2e', lookUrl: 'https://example.com/look' });
    check('simpan info varian', ok.ok, ok.ok ? ok.message : ok.error);
    const info = await page(admin, `/cs/info?q=${q}`);
    check('info barang: expired lewat (merah), notes & link tampil', info.html.includes('chip chip-bad">Expired') && info.html.includes('Top: uji e2e') && info.html.includes('href="https://example.com/look"'));
    const st = await page(admin, `/cs/stock?q=${q}`);
    check('info stock menampilkan chip expired', st.html.includes('Expired'));
    const inp = await page(admin, '/cs/input?lf=exp');
    check('filter expired ≤ 90 hari memuat varian', inp.html.includes(product));
    const tpl = await fetch(`${BASE}/api/export/product-info-template`, { headers: { cookie: admin } });
    check('template info barang bisa didownload', tpl.ok);

    // izin: staff tanpa CS
    await prisma.user.deleteMany({ where: { username: 'e2e-ops8' } });
    await prisma.user.create({ data: { name: 'Gudang', username: 'e2e-ops8', passwordHash: await bcrypt.hash('gudang-12345', 12), permissions: { create: [{ menu: 'OPS' }] } } });
    const staff = await login('e2e-ops8', 'gudang-12345');
    const sp = await page(staff, `/cs/stock?q=${q}`);
    check('isi info stock tidak terkirim ke staff tanpa izin', !sp.html.includes(sku.code));
    const sa = await act(staff, 'saveInfo', { brand, product, notes: 'x' });
    check('staff tanpa izin CS ditolak di server action', !sa.ok);
  } finally {
    if (before) await prisma.productInfo.update({ where: { id: before.id }, data: { expiredAt: before.expiredAt, notes: before.notes, lookUrl: before.lookUrl } });
    else await prisma.productInfo.deleteMany({ where: { brandId: sku.brandId, productKey: product } });
    await prisma.user.deleteMany({ where: { username: 'e2e-ops8' } });
    await prisma.loginAttempt.deleteMany();
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
