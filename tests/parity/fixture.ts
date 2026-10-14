/**
 * Data uji deterministik dalam format versi HTML (state Marketplace `S` + dokumen database artifact).
 * Format ini sama dengan hasil "Export semua data (JSON)" yang direncanakan di Fase 9.
 * Dirancang supaya menyentuh semua cabang logika: tarif efektif vs cadangan, pesanan tanpa potongan,
 * potongan hanya total, iklan cocok/tidak cocok/manual, override sumber fullsize, opname final & draft,
 * transaksi di tanggal opname, pindah gudang, faktur dengan diskon %, DP beban, top up iklan, dll.
 */

type Json = Record<string, unknown>;

function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pad = (n: number) => String(n).padStart(2, '0');
function addDays(k: string, n: number) {
  const [y, m, d] = k.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export const TODAY = '2026-03-31';
const START = '2026-01-01';

export interface HtmlFixture {
  S: Json & { stores: Json[]; orders: Json[]; ads: Json[]; ofee: Json; cats: Json; skus: Json; adMap: Json; target: number };
  docs: Record<string, Json>;
  today: string;
}

export function buildFixture(seed = 7): HtmlFixture {
  const r = rng(seed);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const between = (a: number, b: number) => Math.round(a + r() * (b - a));

  // ---------- master SKU (Operasional) ----------
  const master: Record<string, Json> = {
    'HMNS-ORV-100': { b: 'HMNS', p: 'Orevall', v: '100ml', ml: 100, price: 450000, cogs: 300000 },
    'HMNS-ORV-50': { b: 'HMNS', p: 'Orevall', v: '50ml', ml: 50, price: 260000, cogs: 170000 },
    'HMNS-ORV-2': { b: 'HMNS', p: 'Orevall', v: '2ml', ml: 2, price: 18000, cogs: 9000 },
    'HMNS-ORV-5': { b: 'HMNS', p: 'Orevall', v: '5ml', ml: 5, price: 39000, cogs: 19000 },
    'HMNS-ORV-10': { b: 'HMNS', p: 'Orevall', v: '10ml', ml: 10, price: 69000, cogs: 36000 },
    'HMNS-ALP-100': { b: 'HMNS', p: 'Alpha', v: '100ml', ml: 100, price: 420000, cogs: 280000 },
    'HMNS-ALP-2': { b: 'HMNS', p: 'Alpha', v: '2ml', ml: 2, price: 16000, cogs: 7600 },
    'HMNS-ALP-5': { b: 'HMNS', p: 'Alpha', v: '5ml', ml: 5, price: 36000, cogs: 17500 },
    'HMNS-ALP-10': { b: 'HMNS', p: 'Alpha', v: '10ml', ml: 10, price: 64000, cogs: 33000 },
    'KONOS-UTO-50': { b: 'Mykonos', p: 'Utopia', v: '50ml', ml: 50, price: 150000, cogs: 90000 },
    'KONOS-UTO-2': { b: 'Mykonos', p: 'Utopia', v: '2ml', ml: 2, price: 12000, cogs: 5200 },
    'KONOS-VAN-2': { b: 'Mykonos', p: 'Vanilla Cloud', v: '2ml', ml: 2, price: 12000, cogs: 5400 },
    'P45-SL-30': { b: 'Project 1945', p: 'Sunset Limau', v: '30ml', ml: 30, price: 180000, cogs: 110000 },
    'P45-SL-2': { b: 'Project 1945', p: 'Sunset Limau', v: '2ml', ml: 2, price: 16000, cogs: 8800 },
    'BKT-MINI': { b: 'Buket', p: 'Buket mini satin', v: '', ml: 0, price: 75000, cogs: 42000 },
  };
  const codes = Object.keys(master);
  const decants = ['HMNS-ORV-2', 'HMNS-ORV-5', 'HMNS-ORV-10', 'HMNS-ALP-2', 'HMNS-ALP-5', 'HMNS-ALP-10', 'KONOS-UTO-2', 'KONOS-VAN-2', 'P45-SL-2'];

  const config: Json = {
    mainWh: 'jogja',
    salesWh: 'jogja',
    yieldPct: 95,
    minDays: 14,
    avgMode: 'max',
    avgDays: 30,
    conv: [
      { brand: 'HMNS', from: 100, to: 2, qty: 47, botol: 'p2' },
      { brand: 'HMNS', from: 100, to: 5, qty: 19, botol: 'p5' },
      { brand: 'HMNS', from: 100, to: 10, qty: 9, botol: 'p10' },
      { brand: 'HMNS', from: 50, to: 5, qty: 9, botol: '' },
      { brand: 'Mykonos', from: 50, to: 2, qty: 23, botol: 'p2' },
      { brand: 'Project 1945', from: 30, to: 2, qty: 14, botol: 'p2' },
    ],
    pack: [
      { id: 'p2', name: 'Botol 2ml', botol: 1500, stiker: 300, lain: 200 },
      { id: 'p5', name: 'Botol 5ml', botol: 2000, stiker: 300, lain: 200 },
      { id: 'p10', name: 'Botol 10ml', botol: 3000, stiker: 400, lain: 300 },
    ],
    lead: { HMNS: 14, Mykonos: 7, 'Project 1945': 99 },
    srcMap: { 'HMNS||Orevall': 'HMNS-ORV-50' },
  };

  // ---------- Marketplace ----------
  const fees = (ch: string) =>
    ch === 'shopee' ? { admin: 8, ongkir: 4.5, layanan: 4.5, pajak: 0.5, ams: 0, proses: 1250 } : { admin: 8, ongkir: 0, layanan: 4, pajak: 0.5, ams: 2, proses: 1250 };
  const stores = [
    { id: 's1', name: 'ngado.kado Shopee', channel: 'shopee', brand: 'ngado.kado', fees: fees('shopee') },
    { id: 's2', name: 'giveme.id TikTok', channel: 'tiktok', brand: 'giveme.id', fees: fees('tiktok') },
    { id: 'd1', name: 'Contoh Shopee', channel: 'shopee', brand: 'smolify.id', demo: 1, fees: fees('shopee') },
  ];
  const catDefs: Record<string, [string, string, string[]][]> = {
    s1: [
      ['C1', 'Decant HMNS Orevall 2ml 5ml 10ml Parfum EDP Share in Jar Travel Size', ['HMNS-ORV-2', 'HMNS-ORV-5', 'HMNS-ORV-10']],
      ['C2', 'HMNS Alpha Decant Parfume 5ml 10ml Share In Jar Tester', ['HMNS-ALP-5', 'HMNS-ALP-10', 'UNKNOWN-1']],
      ['C3', 'Parfum HMNS Original Fullsize 100ml Orevall Alpha', ['HMNS-ORV-100', 'HMNS-ALP-100']],
    ],
    s2: [
      ['T1', 'Decant Mykonos Utopia Vanilla Cloud 2ml Tester', ['KONOS-UTO-2', 'KONOS-VAN-2']],
      ['T2', 'Project 1945 Sunset Limau Decant 2ml', ['P45-SL-2', 'P45-SL-30']],
    ],
    d1: [['D1', 'Buket bunga mini satin', ['BKT-MINI']]],
  };
  const cats: Json = {};
  for (const st in catDefs) for (const [k, n] of catDefs[st]) cats[`${st}|${k}`] = n;

  const orders: Json[] = [];
  const ofee: Json = {};
  let oid = 1000;
  for (let day = 0; day < 90; day++) {
    const date = addDays(START, day);
    for (const st of stores) {
      const nOrders = st.demo ? (day % 7 === 0 ? 1 : 0) : between(0, st.id === 's1' ? 4 : 2);
      for (let i = 0; i < nOrders; i++) {
        const orderId = `${st.id.toUpperCase()}${oid++}`;
        const ts = `${date}T${pad(between(0, 23))}:${pad(between(0, 59))}`;
        const nLines = r() < 0.3 ? 2 : 1;
        for (let j = 0; j < nLines; j++) {
          const [cat, name, skus] = pick(catDefs[st.id]);
          const sku = pick(skus);
          const m = master[sku] as { price: number; cogs: number } | undefined;
          const qty = between(1, 3);
          const unit = m ? (r() < 0.08 ? Math.round(m.cogs * 0.9) : Math.round(m.price * (0.85 + r() * 0.2))) : 50000;
          orders.push({ store: st.id, orderId, ts, cat, sku, name, qty, sub: unit * qty });
        }
        if (st.demo) continue;
        const sub = orders.filter((o) => o.orderId === orderId).reduce((a, o) => a + (o.sub as number), 0);
        const fr = r();
        const hasFee = st.id === 's1' ? day < 75 && fr < 0.7 : day < 30 && fr < 0.08;
        if (hasFee) {
          const onlyTotal = r() < 0.1;
          const settledDay = addDays(date, between(3, 12));
          const f: Json = onlyTotal
            ? { admin: 0, proses: 0, ongkir: 0, layanan: 0, pajak: 0, lain: 0, ams: 0, total: Math.round(sub * 0.8) }
            : {
                admin: Math.round(sub * 0.08),
                proses: 1250,
                ongkir: Math.round(sub * 0.045),
                layanan: Math.round(sub * (r() < 0.5 ? 0.045 : 0.03)),
                pajak: Math.round(sub * 0.005),
                lain: r() < 0.1 ? 500 : 0,
                ams: r() < 0.2 ? Math.round(sub * 0.05) : 0,
                total: 0,
              };
          if (!onlyTotal) {
            const cut = ['admin', 'proses', 'ongkir', 'layanan', 'pajak', 'lain', 'ams'].reduce((a, k) => a + (f[k] as number), 0);
            f.total = r() < 0.15 ? 0 : sub - cut;
          }
          if (r() < 0.85) f.settled = settledDay;
          ofee[`${st.id}|${orderId}`] = f;
        }
      }
    }
  }

  const ads: Json[] = [];
  for (let day = 0; day < 90; day++) {
    const date = addDays(START, day);
    ads.push({ store: 's1', from: date, to: date, adName: (cats['s1|C1'] as string).slice(0, 48), cat: '', amount: between(20, 60) * 1000, sales: between(100, 600) * 1000 });
    if (day % 2 === 0) ads.push({ store: 's1', from: date, to: date, adName: 'HMNS Alpha Decant Parfume 5ml', cat: '', amount: between(10, 30) * 1000, sales: between(30, 200) * 1000 });
    if (day % 3 === 0) ads.push({ store: 's1', from: date, to: date, adName: 'Iklan toko umum ramadhan', cat: '', amount: between(5, 15) * 1000, sales: 0 });
    if (day % 5 === 0) ads.push({ store: 'd1', from: date, to: date, adName: 'Buket bunga mini', cat: '', amount: 10000, sales: 30000 });
  }
  for (let w = 0; w < 12; w++) {
    const from = addDays(START, w * 7 + 2);
    ads.push({ store: 's2', from, to: addDays(from, 6), adName: 'Decant Mykonos Utopia Vanilla', cat: '', amount: between(70, 150) * 1000, sales: between(150, 900) * 1000 });
  }
  ads.push({ store: 's2', from: '2026-03-10', to: '2026-03-20', adName: cats['s2|T2'], cat: 'T2', amount: 125000, sales: 0 });
  ads.push({ store: 's2', from: '2026-02-01', to: '2026-02-28', adName: 'Live TikTok bundling', cat: '', amount: 300000, sales: 450000 });
  const adMap: Json = { 's2|live tiktok bundling': '', '_ms2|live tiktok bundling': 1 };

  const S = {
    stores,
    skus: Object.fromEntries(codes.map((k) => [k, { sku: k, name: [master[k].b, master[k].p, master[k].ml ? master[k].ml + 'ml' : ''].filter(Boolean).join(' '), cogs: master[k].cogs }])),
    cats,
    orders,
    ofee,
    ads,
    adMap,
    target: 12,
  };

  // ---------- Operasional ----------
  const docs: Record<string, Json> = {};
  docs['ops/config'] = config;
  docs['ops/master'] = { skus: master };
  // HMNS-ALP-2: tidak ada histori, tidak terjual, tidak ada stok → prioritas "Belum ada histori"
  const idle = 'HMNS-ALP-2';
  docs['ops/history'] = {
    label: 'Okt–Des 2025',
    avg: Object.fromEntries(codes.map((k) => [k, k === idle ? 0 : decants.includes(k) ? Math.round(r() * 300) / 100 : Math.round(r() * 60) / 100])),
  };

  const movable = codes.filter((k) => k !== idle);
  const opn = (date: string, wh: string, final: boolean, fill: number) => {
    const counts: Json = {};
    for (const k of movable) if (r() < fill) counts[k] = decants.includes(k) ? between(6, 40) : between(0, 6);
    counts['BKT-MINI'] = r() < 0.5 ? '' : null;
    docs[`opname/${date}_${wh}`] = { date, wh, final, counts };
  };
  opn('2026-01-31', 'jogja', true, 0.95);
  opn('2026-02-15', 'sini', true, 0.6);
  opn('2026-01-10', 'rembang', true, 0.5);
  opn('2026-03-01', 'rembang', false, 0.7);
  opn('2026-03-20', 'jogja', false, 0.9);
  opn('2026-04-05', 'jogja', true, 0.9); // setelah "hari ini": belum jadi baseline

  const prodDays: Record<string, Json> = {};
  let at = Date.UTC(2026, 0, 1);
  const addEntry = (date: string, e: Json) => {
    const d = (prodDays[date] ||= { date, entries: {} as Json });
    at += between(60_000, 3_600_000);
    (d.entries as Json)[`e${Object.keys(d.entries as Json).length}_${date}`] = { ...e, at, by: 'u1', note: '' };
  };
  for (let day = 0; day < 90; day += between(1, 4)) {
    const date = addDays(START, day);
    const wh = pick(['jogja', 'jogja', 'sini', 'rembang']);
    const t = r();
    if (t < 0.3) {
      const src = pick(['HMNS-ORV-50', 'HMNS-ORV-100', 'HMNS-ALP-100', 'KONOS-UTO-50', 'P45-SL-30']);
      const ds = decants.filter((x) => x !== idle && master[x].b === master[src].b && master[x].p === master[src].p);
      addEntry(date, { type: 'produksi', src, bottles: between(1, 2), wh, outs: ds.map((sku) => ({ sku, qty: between(1, 6) })) });
    } else if (t < 0.4) {
      addEntry(date, { type: 'geser', src: 'HMNS-ORV-10', bottles: 1, wh, outs: [{ sku: 'HMNS-ORV-2', qty: 4 }] });
    } else if (t < 0.6) {
      const sku = pick(movable);
      addEntry(date, { type: 'masuk', src: '', bottles: 0, wh, outs: [r() < 0.6 ? { sku, qty: between(1, 6), price: Math.round((master[sku].cogs as number) * (0.9 + r() * 0.2)) } : { sku, qty: between(1, 6) }] });
    } else if (t < 0.75) {
      addEntry(date, { type: 'keluar', src: '', bottles: 0, wh, reason: pick(['Rusak', 'Sampel', 'Kesalahan pengiriman']), outs: [{ sku: pick(movable), qty: between(1, 3) }] });
    } else {
      const to = pick(['jogja', 'sini', 'rembang'].filter((x) => x !== wh));
      addEntry(date, { type: 'pindah', src: '', bottles: 0, wh, toWh: to, outs: [{ sku: pick(movable), qty: between(1, 5) }] });
    }
  }
  // transaksi tepat di tanggal opname (harus diabaikan untuk gudang itu)
  addEntry('2026-01-31', { type: 'masuk', src: '', bottles: 0, wh: 'jogja', outs: [{ sku: 'HMNS-ORV-5', qty: 50, price: 15000 }] });
  addEntry('2026-02-15', { type: 'keluar', src: '', bottles: 0, wh: 'sini', reason: 'Rusak', outs: [{ sku: 'HMNS-ALP-5', qty: 2 }] });
  // geser decant paling akhir supaya basis HPP "geser" ikut teruji
  addEntry(TODAY, { type: 'geser', src: 'HMNS-ALP-10', bottles: 1, wh: 'jogja', outs: [{ sku: 'HMNS-ALP-5', qty: 1 }] });
  for (const d in prodDays) docs[`prod/${d}`] = prodDays[d];

  // ---------- Finance ----------
  docs['fin/main/cfg/main'] = {
    start: START,
    banks: [
      { id: 'bca', name: 'BCA', no: '1234567' },
      { id: 'mdr', name: 'Mandiri', no: '' },
    ],
    open: { '1-100': 5_000_000, 'B-bca': 20_000_000, '1-140': 15_000_000, '2-100': 3_000_000, '3-100': 10_000_000 },
    accs: [{ id: 'c-sewa-gudang', code: '6-635', name: 'Beban Sewa Gudang Rembang', type: 'beban' }],
  };
  docs['fin/main/inv/i1'] = {
    no: 'PI/202601/001',
    date: '2026-01-12',
    due: '',
    supplier: 'PT Wangi Nusantara',
    discPct: true,
    discVal: 5,
    extra: 50000,
    received: true,
    wh: 'jogja',
    lines: [
      { kind: 'sku', sku: 'HMNS-ORV-100', name: '', acc: '1-140', qty: 2, unit: 'pcs', price: 290000, disc: 10000 },
      { kind: 'sku', sku: 'KONOS-UTO-50', name: '', acc: '1-140', qty: 3, unit: 'pcs', price: 88000, disc: 0 },
      { kind: 'lain', sku: '', name: 'Timbangan digital', acc: '1-200', qty: 1, unit: 'pcs', price: 450000, disc: 0 },
    ],
  };
  docs['fin/main/inv/i2'] = {
    no: 'PI/202602/001',
    date: '2026-02-03',
    supplier: 'Toko Botol Jaya',
    discPct: false,
    discVal: 20000,
    extra: 0,
    lines: [
      { kind: 'lain', sku: '', name: 'Botol 2ml', acc: '6-300', qty: 500, price: 1400, disc: 0 },
      { kind: 'lain', sku: '', name: 'Sewa gudang', acc: 'c-sewa-gudang', qty: 1, price: 1500000, disc: 0 },
    ],
  };
  docs['fin/main/inv/i3'] = { no: 'PI/202512/009', date: '2025-12-20', supplier: 'Lama', discPct: false, discVal: 0, extra: 0, lines: [{ kind: 'sku', sku: 'HMNS-ALP-100', name: '', acc: '1-140', qty: 1, price: 275000, disc: 0 }] };
  docs['fin/main/po/o1'] = {
    no: 'PO/202603/001',
    date: '2026-03-05',
    supplier: 'PT Wangi Nusantara',
    discPct: false,
    discVal: 0,
    extra: 0,
    lines: [
      { kind: 'sku', sku: 'HMNS-ALP-100', name: '', acc: '1-140', qty: 4, price: 285000, disc: 0 },
      { kind: 'sku', sku: 'P45-SL-30', name: '', acc: '1-140', qty: 2, price: 105000, disc: 5000 },
    ],
  };
  docs['fin/main/pay/p1'] = { no: 'BY/202601/001', kind: 'beban', date: '2026-01-25', bank: 'B-bca', amount: 2_500_000, note: 'Gaji Januari (DP)', lines: [{ acc: '6-200', amount: 4_000_000 }, { acc: '6-600', amount: 350_000 }] };
  docs['fin/main/pay/p2'] = { no: 'BY/202602/001', kind: 'sisa', date: '2026-02-05', bank: 'B-bca', amount: 1_850_000, refId: 'p1', lines: [] };
  docs['fin/main/pay/p3'] = { no: 'BY/202601/002', kind: 'faktur', date: '2026-01-20', bank: 'B-mdr', amount: 600_000, invId: 'i1', lines: [] };
  docs['fin/main/pay/p4'] = { no: 'BY/202601/003', kind: 'topup', date: '2026-01-05', bank: 'B-bca', amount: 1_000_000, ch: 'shopee', lines: [] };
  docs['fin/main/pay/p5'] = { no: 'BY/202602/002', kind: 'topup', date: '2026-02-10', bank: '', amount: 750_000, ch: 'tiktok', lines: [] };
  docs['fin/main/pay/p6'] = { no: 'BY/202602/003', kind: 'terima', date: '2026-02-11', bank: 'B-bca', amount: 5_000_000, acc: '3-100', note: 'Setoran modal', lines: [] };
  docs['fin/main/pay/p7'] = { no: 'BY/202603/001', kind: 'terima', date: '2026-03-02', bank: 'B-mdr', amount: 12_345.67, acc: '7-200', lines: [] };
  docs['fin/main/pay/p8'] = { no: 'BY/202603/002', kind: 'beban', date: '2026-03-15', bank: '', amount: 1_200_000, lines: [{ acc: '1-200', amount: 1_200_000 }] };
  docs['fin/main/pay/p9'] = { no: 'BY/202512/001', kind: 'topup', date: '2025-12-30', bank: 'B-bca', amount: 999_000, ch: 'shopee', lines: [] };
  docs['fin/main/xfer/x1'] = { no: 'TR/202602/001', date: '2026-02-20', from: 'W-s1', to: 'B-bca', amount: 3_000_000, fee: 2500 };
  docs['fin/main/xfer/x2'] = { no: 'TR/202603/001', date: '2026-03-03', from: 'B-bca', to: '1-100', amount: 1_000_000, fee: 0 };
  docs['fin/main/xfer/x3'] = { no: 'TR/202603/002', date: '2026-03-25', from: 'W-s2', to: 'B-mdr', amount: 400_000, fee: 1000 };

  return { S, docs, today: TODAY };
}
