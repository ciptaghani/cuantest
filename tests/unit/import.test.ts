import { describe, expect, it } from 'vitest';
import { missingRequired, sanitizeMapping } from '@/lib/import/common';
import { planAds, planFees, planOrders } from '@/lib/import/marketplace';
import { planOpname, planProductInfo, planSkus } from '@/lib/import/ops';
import { opnameTemplate, productInfoTemplate, skuTemplate, SKU_TEMPLATE_HEADERS } from '@/lib/import/templates';
import { autoMap, FEE_FIELDS, OPNAME_FIELDS, ORDER_FIELDS, PRODUCT_INFO_FIELDS, SKU_FIELDS } from '@/lib/parse';
import { readWorkbook, writeWorkbook, type SheetRow } from '@/lib/parse/workbook';

const rows = (objs: Record<string, unknown>[]): SheetRow[] => objs.map((cells, i) => ({ row: i + 2, cells }));

describe('workbook', () => {
  it('menemukan baris header setelah baris judul, dan membaca tanggal serial Excel', () => {
    const buf = writeWorkbook([
      { name: 'Kosong', rows: [['x']] },
      {
        name: 'Pesanan',
        rows: [
          ['Laporan Pesanan Toko'],
          [],
          ['No. Pesanan', 'Waktu Pesanan Dibuat', 'Nama Produk', 'Jumlah'],
          ['A1', 46027.5, 'Parfum', 2],
          ['', '', '', ''],
          ['A2', '2026-01-06 09:15', 'Parfum', 1],
        ],
      },
    ]);
    const s = readWorkbook(buf);
    expect(s.sheet).toBe('Pesanan');
    expect(s.headers).toEqual(['No. Pesanan', 'Waktu Pesanan Dibuat', 'Nama Produk', 'Jumlah']);
    expect(s.rows.map((r) => r.row)).toEqual([4, 6]);
    const m = autoMap(s.headers, ORDER_FIELDS);
    const p = planOrders(s.rows, { ...m, subtotal: '', unit: '' });
    expect(p.lines.map((l) => l.ts)).toEqual(['2026-0105T12:00'.replace('01', '-01-').replace('--', '-'), '2026-01-06T09:15']);
  });

  it('template punya nama kolom persis seperti versi HTML', () => {
    expect(skuTemplate(null)[0].rows[0]).toEqual(SKU_TEMPLATE_HEADERS);
    expect(SKU_TEMPLATE_HEADERS).toEqual(['Master SKU', 'Brand', 'Nama Produk (Key)', 'Varian / Ukuran (asli)', 'Ukuran (ml)', 'Harga Jual (Rp)', 'HPP (Rp)']);
    expect(opnameTemplate([])[0].rows[0]).toEqual(['No', 'Nama Brand', 'Kode SKU', 'Qty Tercatat', 'Qty Stock Opname']);
    expect(productInfoTemplate([])[0].rows[0]).toEqual(['Brand', 'Nama Variant', 'Tanggal Expired (YYYY-MM-DD)', 'Notes / Deskripsi', 'Link Look Visual']);
  });

  it('template yang didownload bisa langsung diupload ulang (kolom ditebak otomatis)', () => {
    const s = readWorkbook(writeWorkbook(skuTemplate([{ code: 'A-5', brand: 'HMNS', product: 'Alpha', variant: '5ml', ml: 5, price: 30000, cogs: 17600 }])));
    const m = autoMap(s.headers, SKU_FIELDS);
    expect(m).toMatchObject({ sku: 'Master SKU', cogs: 'HPP (Rp)', brand: 'Brand', name: 'Nama Produk (Key)', ml: 'Ukuran (ml)', price: 'Harga Jual (Rp)', variant: 'Varian / Ukuran (asli)' });
    expect(planSkus(s.rows, m).skus[0]).toMatchObject({ code: 'A-5', cogs: 17600, brand: 'HMNS', product: 'Alpha', ml: 5 });
    const o = readWorkbook(writeWorkbook(opnameTemplate([{ brand: 'HMNS', code: 'A-5', recorded: 3, counted: null }])));
    expect(autoMap(o.headers, OPNAME_FIELDS)).toEqual({ sku: 'Kode SKU', qty: 'Qty Stock Opname' });
    const c = readWorkbook(writeWorkbook(productInfoTemplate([{ brand: 'HMNS', product: 'Alpha', expiredAt: '', notes: '', lookUrl: '' }])));
    expect(missingRequired(PRODUCT_INFO_FIELDS, autoMap(c.headers, PRODUCT_INFO_FIELDS))).toBeNull();
  });
});

describe('export pesanan', () => {
  const m = { orderId: 'no', date: 'tgl', name: 'nama', cat: 'induk', sku: 'sku', variation: 'var', qty: 'qty', subtotal: '', unit: 'harga', status: 'status' };

  it('lewati batal/retur, SKU kosong → nama + variasi, katalog tanpa ID → "N:" + nama', () => {
    const p = planOrders(
      rows([
        { no: 'X1', tgl: '2026-02-01 10:00', nama: 'Parfum Alpha', induk: '', sku: '', var: '5ml', qty: 2, harga: '30.000', status: 'Selesai' },
        { no: 'X2', tgl: '2026-02-01 11:00', nama: 'Parfum Alpha', induk: 'P9', sku: 'A-5', var: '', qty: '', harga: 30000, status: 'Dibatalkan' },
        { no: 'X3', tgl: '2026-02-02 11:00', nama: 'Parfum Alpha', induk: 'P9', sku: 'A-5', var: '', qty: 1, harga: 30000, status: 'Pengembalian Dana' },
        { no: 'X4', tgl: 'kemarin', nama: 'Parfum Alpha', induk: 'P9', sku: 'A-5', var: '', qty: 1, harga: 30000, status: '' },
        { no: '', tgl: '2026-02-02', nama: 'Parfum', induk: '', sku: 'A', var: '', qty: 1, harga: 1, status: '' },
      ]),
      m,
    );
    expect(p.lines).toHaveLength(1);
    expect(p.lines[0]).toMatchObject({ sku: 'Parfum Alpha - 5ml', catalogKey: 'N:parfum alpha', subtotal: 60000, qty: 2 });
    expect(p.summary.skipped).toBe(2);
    expect(p.summary.errors.map((e) => e.row)).toEqual([5, 6]);
    expect(p.dates).toEqual(['2026-02-01']);
  });

  it('subtotal dari kolom subtotal kalau dipilih; qty kosong dianggap 1', () => {
    const p = planOrders(rows([{ no: 'A', tgl: '2026-02-01', nama: 'N', sub: '45.500', qty: '' }]), { orderId: 'no', date: 'tgl', name: 'nama', qty: 'qty', subtotal: 'sub' });
    expect(p.lines[0]).toMatchObject({ subtotal: 45500, qty: 1 });
  });
});

describe('laporan penghasilan', () => {
  it('menjumlah baris per pesanan (nilai absolut), tanggal dana dilepas, dan mengabaikan Biaya Isi Saldo Otomatis', () => {
    const headers = ['No. Pesanan', 'Biaya Administrasi', 'Biaya Proses Pesanan', 'Biaya Isi Saldo Otomatis', 'Total Penghasilan', 'Tanggal Dana Dilepaskan'];
    const m = autoMap(headers, FEE_FIELDS);
    expect(Object.values(m)).not.toContain('Biaya Isi Saldo Otomatis');
    const p = planFees(
      rows([
        { 'No. Pesanan': 'A', 'Biaya Administrasi': '-2.400', 'Biaya Proses Pesanan': -1250, 'Biaya Isi Saldo Otomatis': -50000, 'Total Penghasilan': 26350, 'Tanggal Dana Dilepaskan': '2026-02-10' },
        { 'No. Pesanan': 'A', 'Biaya Administrasi': -100, 'Biaya Proses Pesanan': 0, 'Biaya Isi Saldo Otomatis': 0, 'Total Penghasilan': 0, 'Tanggal Dana Dilepaskan': '' },
        { 'No. Pesanan': '', 'Biaya Administrasi': -1, 'Biaya Proses Pesanan': 0, 'Biaya Isi Saldo Otomatis': 0, 'Total Penghasilan': 0, 'Tanggal Dana Dilepaskan': '' },
      ]),
      m,
    );
    expect(p.fees.A).toMatchObject({ admin: 2500, process: 1250, total: 26350, settledAt: '2026-02-10', other: 0 });
    expect(p.summary.imported).toBe(1);
    expect(p.summary.skipped).toBe(1);
  });
});

describe('laporan iklan', () => {
  const m = { adName: 'nama', amount: 'biaya', sales: 'jual', date: '' };
  it('tanpa kolom tanggal wajib isi periode', () => {
    expect(planAds(rows([{ nama: 'X', biaya: 1000 }]), m, {}).summary.errors[0].row).toBe(0);
  });
  it('periode dari form; baris tanpa biaya dilewati; periode terbalik ditukar', () => {
    const p = planAds(rows([{ nama: 'Iklan A', biaya: '15.000', jual: '60.000' }, { nama: 'Iklan B', biaya: 0, jual: 0 }]), m, { from: '2026-03-07', to: '2026-03-01' });
    expect(p.ads).toEqual([{ row: 2, from: '2026-03-01', to: '2026-03-07', adName: 'Iklan A', amount: 15000, sales: 60000 }]);
    expect(p.summary.skipped).toBe(1);
  });
  it('per tanggal kalau kolom tanggal dipilih', () => {
    const p = planAds(rows([{ nama: 'A', biaya: 5000, tgl: '05/03/2026' }]), { ...m, date: 'tgl' }, {});
    expect(p.ads[0]).toMatchObject({ from: '2026-03-05', to: '2026-03-05' });
  });
});

describe('master SKU, opname, info barang', () => {
  it('kolom yang tidak dipilih tidak menimpa (undefined); SKU dobel → baris terakhir', () => {
    const p = planSkus(rows([{ s: 'A', h: '10.000' }, { s: '', h: 1 }, { s: 'A', h: 12000 }]), { sku: 's', cogs: 'h' });
    expect(p.skus).toEqual([{ row: 4, code: 'A', cogs: 12000 }]);
    expect(p.summary.skipped).toBe(1);
  });

  it('opname: qty kosong dilewati, SKU tidak dikenal jadi error', () => {
    const p = planOpname(rows([{ k: 'A', q: 5 }, { k: 'B', q: '' }, { k: 'Z', q: 1 }, { k: 'A2', q: '0' }]), { sku: 'k', qty: 'q' }, new Set(['A', 'B', 'A2']));
    expect(p.counts).toEqual({ A: 5, A2: 0 });
    expect(p.summary.skipped).toBe(1);
    expect(p.summary.errors).toEqual([{ row: 4, message: 'Kode SKU tidak dikenal: Z' }]);
  });

  it('info barang: cocok per brand + varian (tidak peka huruf besar), sel kosong tidak ikut', () => {
    const variants = new Map([['hmns|alpha', { brand: 'HMNS', product: 'Alpha' }]]);
    const m = sanitizeMapping({ brand: 'B', product: 'P', expired: 'E', notes: 'N', look: 'L', x: 'zzz' }, ['B', 'P', 'E', 'N', 'L'], PRODUCT_INFO_FIELDS);
    const p = planProductInfo(
      rows([
        { B: 'hmns', P: 'ALPHA', E: '2027-06-30', N: '', L: 'drive.google.com/x' },
        { B: 'HMNS', P: 'Beta', E: '', N: 'wangi', L: '' },
        { B: 'HMNS', P: 'Alpha', E: '', N: '', L: '' },
        { B: 'HMNS', P: 'Alpha', E: '31-31-2027', N: '', L: '' },
      ]),
      m,
      variants,
    );
    expect(p.items).toEqual([{ row: 2, brand: 'HMNS', product: 'Alpha', expiredAt: '2027-06-30' }]);
    expect(p.summary.errors.map((e) => e.row)).toEqual([3, 5]);
    expect(p.summary.skipped).toBe(1);
    expect(p.summary.notes[0]).toMatch(/link look visual diabaikan/);
  });
});
