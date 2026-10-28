'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { LoadState, useApi, useOpsModel } from '@/components/useApi';
import Link from 'next/link';
import { ActBtn } from '@/components/ActBtn';
import { AutoForm } from '@/components/AutoForm';
import { Kpi } from '@/components/Kpi';
import { one, qs, type SP } from '@/components/qs';
import { rp } from '@/lib/format';
import { avgDaily, brandsOf, bySkuOrder, hppCalc, qaList, sourceRuleRows, type HppRow, type OpsModel } from '@/lib/ops';
import type { RuleRow } from '@/lib/repo/ops';
import { Importer } from '../../data/import-export/Importer';
import { hppApply, leadTimeSet, packDelete, packSave, ruleDelete, ruleSave, setOpsConfig, skuAdd, skuRemove, skuUpdate, sourceSet, warehouseAdd, warehouseRemove, warehouseRename } from '../actions';
import { AddForm, SaveField } from '../inputs';
import { BrandField, CatField, CATS, limitOf, matchQ, MoreLink, SearchField } from '../ui';
import { backendUrl } from '@/lib/api';

const VIEWS: [string, string][] = [
  ['sku', 'Master & HPP'],
  ['wh', 'Gudang'],
  ['conv', 'Aturan konversi'],
  ['src', 'Aturan sumber fullsize'],
  ['pack', 'Botol & kemasan'],
  ['lead', 'Lead time'],
  ['avg', 'Rata-rata & target'],
  ['qa', 'Cek data'],
];

export default function Page() {
  return (
    <Suspense fallback={<p className="note mt-4">Memuat…</p>}>
      <Content />
    </Suspense>
  );
}

function Content() {
  const usp = useSearchParams();
  const sp: SP = Object.fromEntries(usp.entries());
  const view = VIEWS.some(([k]) => k === one(sp, 'view')) ? one(sp, 'view') : 'sku';
  const { m, error, loading } = useOpsModel();
  if (loading || error || !m) return <LoadState loading={loading} error={error} what="master SKU" />;
  const brands = brandsOf(m);
  return <MasterMain sp={sp} view={view} m={m} brands={brands} />;
}

function MasterMain({ sp, view, m, brands }: { sp: SP; view: string; m: OpsModel; brands: string[] }) {
  return (
    <div className="panel">
      <h2 className="text-lg">Master SKU & aturan</h2>
      <div className="seg mt-3 flex-wrap">
        {VIEWS.map(([k, l]) => (
          <Link key={k} href={k === 'sku' ? '?' : `?view=${k}`} aria-pressed={view === k} scroll={false}>
            {l}
          </Link>
        ))}
      </div>
      <datalist id="dl-brand">
        {brands.map((b) => (
          <option key={b} value={b} />
        ))}
      </datalist>
      <div className="mt-4">
        {view === 'sku' && <SkuView m={m} sp={sp} />}
        {view === 'wh' && <WhView m={m} />}
        {view === 'conv' && <ConvView m={m} />}
        {view === 'src' && <SrcView m={m} sp={sp} />}
        {view === 'pack' && <PackView m={m} />}
        {view === 'lead' && <LeadView m={m} />}
        {view === 'avg' && <AvgView m={m} />}
        {view === 'qa' && <QaView m={m} />}
      </div>
    </div>
  );
}

const basisLabel = (h: HppRow) =>
  h.basis === 'produksi' ? `Produksi ${h.n}× dari ${h.from}` : h.basis === 'geser' ? `Geser ${h.n}× dari ${h.from}` : h.basis === 'restock' ? `Restock ${h.n}×` : 'Belum ada transaksi';

function SkuView({ m, sp }: { m: OpsModel; sp: SP }) {
  const H = hppCalc(m);
  const brand = one(sp, 'brand');
  const cat = (CATS as readonly string[]).includes(one(sp, 'cat')) ? one(sp, 'cat') : '';
  const hppF = one(sp, 'hppF');
  const q = one(sp, 'q');
  const rows = Object.values(m.skuMap)
    .map((s) => ({ ...s, h: H[s.code] ?? ({ now: s.cogs, n: 0, basis: 'master', from: '', theo: null, pack: null } satisfies HppRow) }))
    .filter(
      (s) =>
        (!brand || s.brand === brand) &&
        (!cat || s.category === cat) &&
        matchQ(q, s.code, s.product, s.brand, s.variant) &&
        (!hppF || (hppF === 'beda' ? s.h.n > 0 && Math.abs(s.h.now - s.cogs) >= 1 : !s.cogs)),
    )
    .sort(bySkuOrder);
  const lim = limitOf(sp);
  const y = m.config.shrinkPct;
  return (
    <>
      <div className="toolbar !mt-0">
        <div>
          <b>Upload master SKU & HPP ada di menu Data</b>
          <div className="text-[13px] text-muted">Satu kali upload di Data langsung memperbarui master ini dan HPP di menu Marketplace.</div>
        </div>
        <Link className="btn-ghost" href="/data/import-export">
          Buka Data
        </Link>
      </div>
      <AutoForm reset={['lim']}>
        <BrandField value={brand} brands={brandsOf(m)} />
        <CatField value={cat} />
        <label className="field">
          <span>Tampilkan</span>
          <select name="hppF" defaultValue={hppF}>
            <option value="">Semua</option>
            <option value="beda">HPP sekarang ≠ master</option>
            <option value="kosong">HPP master kosong</option>
          </select>
        </label>
        <SearchField value={q} placeholder="SKU, produk, atau varian" />
      </AutoForm>
      <div className="tablebar">
        <label className="field" title="Isi yang terpakai dari botol fullsize. 95 = 5% hilang saat decant">
          <span>Susut decant (%)</span>
          <SaveField key={y} action={setOpsConfig} input={{}} field="shrinkPct" value={y} step="0.5" min={50} />
        </label>
        <ActBtn action={hppApply} input={{}} className="btn" confirm="Ganti HPP master dengan HPP sekarang untuk semua SKU yang berbeda?">
          Terapkan HPP sekarang ke master
        </ActBtn>
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Produk</th>
              <th className="r">ml</th>
              <th>Kategori</th>
              <th className="r">Harga jual</th>
              <th className="r">HPP master</th>
              <th className="r">HPP sekarang</th>
              <th className="r">Selisih</th>
              <th className="r">HPP rumus</th>
              <th>Dasar HPP sekarang</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, lim).map((s) => {
              const d = s.h.now - s.cogs;
              return (
                <tr key={s.code}>
                  <td>{s.code}</td>
                  <td className="min-w-[220px] !whitespace-normal">
                    {s.brand} · {s.product}
                    {s.variant && <div className="ps">{s.variant}</div>}
                  </td>
                  <td className="r">{s.ml}</td>
                  <td>{s.category}</td>
                  <td className="r">
                    <SaveField key={s.price} action={skuUpdate} input={{ code: s.code, field: 'price' }} field="value" value={s.price} min={0} className="qin w-[110px]" label={`Harga jual ${s.code}`} />
                  </td>
                  <td className="r">
                    <SaveField key={s.cogs} action={skuUpdate} input={{ code: s.code, field: 'cogs' }} field="value" value={s.cogs} min={0} className="qin w-[110px]" label={`HPP master ${s.code}`} />
                  </td>
                  <td className="r">
                    <b>{rp(s.h.now)}</b>
                  </td>
                  <td className={`r ${Math.abs(d) < 1 ? '' : d > 0 ? 'neg' : 'pos'}`}>{Math.abs(d) < 1 ? '–' : (d > 0 ? '+' : '') + rp(d)}</td>
                  <td className="r">{s.h.theo !== null ? rp(s.h.theo) : '–'}</td>
                  <td>
                    <span className="text-[12.5px] text-muted">{basisLabel(s.h)}</span>
                  </td>
                  <td>
                    <ActBtn action={skuRemove} input={{ code: s.code }} confirm={`Hapus ${s.code} dari master? Riwayat stoknya tetap tersimpan.`}>
                      Hapus
                    </ActBtn>
                  </td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <td colSpan={11} className="text-muted">
                  {Object.keys(m.skuMap).length ? 'Tidak ada SKU di filter ini.' : 'Master SKU masih kosong. Upload di menu Data atau tambah satu per satu di bawah.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <MoreLink total={rows.length} limit={lim} href={qs(sp, { lim: 'all' })} />
      <div className="formula mt-4">
        <b>Cara hitung HPP sekarang</b>
        <br />
        Fullsize: rata-rata bergerak dari stok opname (pakai HPP master) dan setiap barang masuk yang diisi harga belinya.
        <br />
        Decant: setiap produksi menghitung HPP fullsize sumber ÷ (ml botol × {y}%) × ml decant + biaya botol & kemasan dari aturan konversi, lalu dirata-rata dengan stok decant yang ada.
        <br />
        HPP rumus = hitungan yang sama memakai HPP fullsize sumber hari ini, sebagai pembanding.
      </div>
      <h3 className="dh">Tambah SKU</h3>
      <AddForm
        action={skuAdd}
        fields={[
          { name: 'code', label: 'SKU', width: 150, required: true },
          { name: 'brand', label: 'Brand', list: 'dl-brand', width: 130 },
          { name: 'product', label: 'Nama produk', grow: true },
          { name: 'ml', label: 'ml', type: 'number', width: 80 },
          { name: 'price', label: 'Harga jual', type: 'number', width: 110 },
          { name: 'cogs', label: 'HPP', type: 'number', width: 110 },
        ]}
      />
      <p className="note">Kategori dihitung otomatis dari aturan konversi: ukuran sumber = Fullsize, ukuran tujuan = Decant.</p>
    </>
  );
}

function WhView({ m }: { m: OpsModel }) {
  const whOpts = m.warehouses.map((w) => [w.id, w.name] as [string, string]);
  return (
    <>
      <div className="tbl-wrap max-w-[640px]">
        <table className="tbl">
          <thead>
            <tr>
              <th>Nama gudang</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {m.warehouses.map((w) => (
              <tr key={w.id}>
                <td>
                  <SaveField key={w.name} action={warehouseRename} input={{ id: w.id }} field="name" type="text" value={w.name} label="Nama gudang" style={{ width: '100%' }} />
                </td>
                <td>
                  {m.warehouses.length > 1 && (
                    <ActBtn action={warehouseRemove} input={{ id: w.id }} confirm={`Hapus gudang ${w.name}? Stoknya tidak dihitung lagi, riwayat transaksinya tetap ada.`}>
                      Hapus
                    </ActBtn>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <AddForm action={warehouseAdd} fields={[{ name: 'name', label: 'Nama gudang baru', width: 220, required: true }]} submit="Tambah gudang" />
      <div className="mt-4 grid max-w-[640px] gap-3 sm:grid-cols-2">
        <label className="field">
          <span>Gudang utama</span>
          <SaveField key={m.config.mainWarehouseId} action={setOpsConfig} input={{}} field="mainWarehouseId" type="select" options={whOpts} value={m.config.mainWarehouseId} />
        </label>
        <label className="field">
          <span>Penjualan marketplace mengurangi stok</span>
          <SaveField key={m.config.salesWarehouseId} action={setOpsConfig} input={{}} field="salesWarehouseId" type="select" options={whOpts} value={m.config.salesWarehouseId} />
        </label>
      </div>
      <p className="note">Gudang utama jadi pilihan awal di Produksi, Barang keluar masuk, dan Stock opname.</p>
    </>
  );
}

function ConvView({ m }: { m: OpsModel }) {
  const { data: rules, error, loading } = useApi<RuleRow[]>('/api/ops/rules');
  if (loading || error || !rules) return <LoadState loading={loading} error={error} what="aturan konversi" />;
  return <ConvTable m={m} rules={rules} />;
}

function ConvTable({ m, rules }: { m: OpsModel; rules: RuleRow[] }) {
  const packOpts: [string, string][] = [['', 'Belum dipilih'], ...m.packs.map((p) => [p.id, p.name] as [string, string])];
  return (
    <>
      <div className="tbl-wrap max-w-[960px]">
        <table className="tbl">
          <thead>
            <tr>
              <th>Brand</th>
              <th className="r">Dari (ml)</th>
              <th className="r">Ke (ml)</th>
              <th className="r">Qty per botol</th>
              <th>Botol & kemasan dipakai</th>
              <th className="r">Biaya kemasan</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => {
              const k = `${r.id}:${r.brand}:${r.fromMl}:${r.toMl}:${r.qtyPerBottle}:${r.packId}`;
              return (
                <tr key={r.id}>
                  <td>
                    <SaveField key={k} action={ruleSave} input={r} field="brand" type="text" value={r.brand} label="Brand" />
                  </td>
                  <td className="r">
                    <SaveField key={k} action={ruleSave} input={r} field="fromMl" value={r.fromMl} min={0} label="Dari ml" />
                  </td>
                  <td className="r">
                    <SaveField key={k} action={ruleSave} input={r} field="toMl" value={r.toMl} min={0} label="Ke ml" />
                  </td>
                  <td className="r">
                    <SaveField key={k} action={ruleSave} input={r} field="qtyPerBottle" value={r.qtyPerBottle} min={0} label="Qty per botol" />
                  </td>
                  <td>
                    <SaveField key={k} action={ruleSave} input={r} field="packId" type="select" options={packOpts} value={r.packId} label="Kemasan" style={r.packId ? undefined : { borderColor: 'var(--warn)' }} />
                  </td>
                  <td className="r">{r.packId ? rp(m.packCost(r.packId)) : '–'}</td>
                  <td>
                    <ActBtn action={ruleDelete} input={{ id: r.id }} confirm={`Hapus aturan ${r.brand} ${r.fromMl}ml → ${r.toMl}ml?`}>
                      Hapus
                    </ActBtn>
                  </td>
                </tr>
              );
            })}
            {!rules.length && (
              <tr>
                <td colSpan={7} className="text-muted">
                  Belum ada aturan konversi.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <h3 className="dh">Tambah aturan</h3>
      <AddForm
        action={ruleSave}
        fields={[
          { name: 'brand', label: 'Brand', list: 'dl-brand', width: 140, required: true },
          { name: 'fromMl', label: 'Dari (ml)', type: 'number', width: 90, required: true },
          { name: 'toMl', label: 'Ke (ml)', type: 'number', width: 90, required: true },
          { name: 'qtyPerBottle', label: 'Qty per botol', type: 'number', width: 100 },
          { name: 'packId', label: 'Botol & kemasan', type: 'select', options: packOpts },
        ]}
      />
      <p className="note">Kolom botol & kemasan jadi acuan biaya botol + stiker di HPP decant. Daftar harganya diatur di Botol & kemasan.</p>
    </>
  );
}

function PackView({ m }: { m: OpsModel }) {
  return (
    <>
      <div className="tbl-wrap max-w-[900px]">
        <table className="tbl">
          <thead>
            <tr>
              <th>Nama kemasan</th>
              <th className="r">Botol (Rp)</th>
              <th className="r">Stiker (Rp)</th>
              <th className="r">Lainnya (Rp)</th>
              <th className="r">Total</th>
              <th className="r">Dipakai di</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {m.packs.map((p) => {
              const k = `${p.name}:${p.bottle}:${p.sticker}:${p.other}`;
              return (
                <tr key={p.id}>
                  <td>
                    <SaveField key={k} action={packSave} input={p} field="name" type="text" value={p.name} label="Nama kemasan" />
                  </td>
                  {(['bottle', 'sticker', 'other'] as const).map((f) => (
                    <td key={f} className="r">
                      <SaveField key={k} action={packSave} input={p} field={f} value={p[f]} min={0} className="qin w-[100px]" label={`${f} ${p.name}`} />
                    </td>
                  ))}
                  <td className="r">
                    <b>{rp(m.packCost(p.id))}</b>
                  </td>
                  <td className="r">{m.rules.filter((c) => c.packId === p.id).length} aturan</td>
                  <td>
                    <ActBtn action={packDelete} input={{ id: p.id }} confirm={`Hapus kemasan ${p.name}? Aturan yang memakainya jadi tanpa kemasan.`}>
                      Hapus
                    </ActBtn>
                  </td>
                </tr>
              );
            })}
            {!m.packs.length && (
              <tr>
                <td colSpan={7} className="text-muted">
                  Belum ada kemasan.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <h3 className="dh">Tambah kemasan</h3>
      <AddForm
        action={packSave}
        fields={[
          { name: 'name', label: 'Nama kemasan', width: 200, required: true },
          { name: 'bottle', label: 'Botol (Rp)', type: 'number', width: 110, defaultValue: '0' },
          { name: 'sticker', label: 'Stiker (Rp)', type: 'number', width: 110, defaultValue: '0' },
          { name: 'other', label: 'Lainnya (Rp)', type: 'number', width: 110, defaultValue: '0' },
        ]}
      />
      <p className="note">Ubah harga di sini kalau supplier botol atau stiker naik harga. HPP decant berikutnya otomatis memakai harga baru.</p>
    </>
  );
}

function SrcView({ m, sp }: { m: OpsModel; sp: SP }) {
  const all = sourceRuleRows(m);
  const fsBy: Record<string, { code: string; label: string }[]> = {};
  for (const s of Object.values(m.skuMap).sort(bySkuOrder)) if (s.category === 'Fullsize') (fsBy[s.brand] ||= []).push({ code: s.code, label: `${s.code} · ${s.product} ${s.ml}ml` });
  const cnt = { none: all.filter((p) => !p.current).length, manual: all.filter((p) => p.manual).length, rule: all.filter((p) => p.current && p.missing.length).length };
  const brand = one(sp, 'brand');
  const srcF = one(sp, 'srcF');
  const q = one(sp, 'q');
  const L = all.filter(
    (p) => (!brand || p.brand === brand) && matchQ(q, p.brand, p.product, p.current) && (!srcF || (srcF === 'none' ? !p.current : srcF === 'manual' ? p.manual : !!p.current && p.missing.length > 0)),
  );
  const lim = limitOf(sp);
  return (
    <>
      <p className="sub">
        Tiap produk decant mengambil isi dari satu botol fullsize. Otomatis = ukuran fullsize terbesar dengan nama produk yang sama. Ganti di sini kalau nama produk berbeda (mis. Elea 250ml untuk decant Elea Hair & Body) atau kalau belum ada sumbernya.
      </p>
      <div className="kps">
        <Kpi label="Tanpa sumber" value={cnt.none} cls={cnt.none ? 'bad' : ''} href={qs(sp, { srcF: 'none', lim: null })} on={srcF === 'none'} />
        <Kpi label="Diatur manual" value={cnt.manual} href={qs(sp, { srcF: 'manual', lim: null })} on={srcF === 'manual'} />
        <Kpi label="Rasio konversi belum ada" value={cnt.rule} cls={cnt.rule ? 'mid' : ''} href={qs(sp, { srcF: 'rule', lim: null })} on={srcF === 'rule'} />
      </div>
      <AutoForm reset={['lim']}>
        <BrandField value={brand} brands={brandsOf(m)} />
        <label className="field">
          <span>Tampilkan</span>
          <select name="srcF" defaultValue={srcF}>
            <option value="">Semua</option>
            <option value="none">Tanpa sumber</option>
            <option value="manual">Diatur manual</option>
            <option value="rule">Rasio belum ada</option>
          </select>
        </label>
        <SearchField value={q} placeholder="Brand, produk, atau SKU sumber" />
      </AutoForm>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Produk decant</th>
              <th>Ukuran</th>
              <th>Sumber fullsize</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {L.slice(0, lim).map((p) => {
              const sel = p.manual ? p.current : '';
              return (
                <tr key={p.key}>
                  <td>
                    <div className="pn">
                      {p.brand} · {p.product}
                    </div>
                  </td>
                  <td>{p.sizes.map((x) => x + 'ml').join(', ')}</td>
                  <td>
                    <SaveField
                      key={sel}
                      action={sourceSet}
                      input={{ brand: p.brand, product: p.product }}
                      field="sku"
                      type="select"
                      value={sel}
                      options={[['', p.auto ? `Otomatis: ${p.auto}` : 'Otomatis: tidak ada'], ...(fsBy[p.brand] ?? []).map((f) => [f.code, f.label] as [string, string])]}
                      style={{ maxWidth: 360 }}
                      label={`Sumber fullsize ${p.product}`}
                    />
                  </td>
                  <td className="!whitespace-normal">
                    {!p.current ? (
                      <span className="chip chip-bad">Tanpa sumber</span>
                    ) : p.missing.length ? (
                      <span className="chip chip-mid">
                        Rasio {m.skuMap[p.current]?.ml}ml → {p.missing.join(', ')}ml belum ada
                      </span>
                    ) : (
                      <span className="chip chip-ok">Siap</span>
                    )}
                    {p.manual && <span className="chip chip-ch ml-1">Manual</span>}
                  </td>
                </tr>
              );
            })}
            {!L.length && (
              <tr>
                <td colSpan={4} className="text-muted">
                  Tidak ada produk decant di filter ini.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <MoreLink total={L.length} limit={lim} href={qs(sp, { lim: 'all' })} />
      <p className="note">Pilihan sumber hanya fullsize dari brand yang sama. Kalau sumbernya belum ada di daftar, tambahkan dulu SKU fullsize di Master & HPP.</p>
    </>
  );
}

function LeadView({ m }: { m: OpsModel }) {
  const L = Object.entries(m.leadTimes)
    .filter((e): e is [string, number] => e[1] !== null)
    .sort((a, b) => a[0].localeCompare(b[0]));
  return (
    <>
      <div className="tbl-wrap max-w-[520px]">
        <table className="tbl">
          <thead>
            <tr>
              <th>Brand</th>
              <th className="r">Lead time (hari)</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {L.map(([b, v]) => (
              <tr key={b}>
                <td>{b}</td>
                <td className="r">
                  <SaveField key={v} action={leadTimeSet} input={{ brand: b }} field="days" value={v} emptyNull step="1" min={0} label={`Lead time ${b}`} />
                </td>
                <td>
                  <ActBtn action={leadTimeSet} input={{ brand: b, days: null }} confirm={`Hapus lead time ${b}?`}>
                    Hapus
                  </ActBtn>
                </td>
              </tr>
            ))}
            {!L.length && (
              <tr>
                <td colSpan={3} className="text-muted">
                  Belum ada lead time.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <AddForm
        action={leadTimeSet}
        fields={[
          { name: 'brand', label: 'Brand', list: 'dl-brand', width: 160, required: true },
          { name: 'days', label: 'Hari', type: 'number', width: 90, required: true },
        ]}
      />
      <p className="note">99 = kebijakan brand, tidak bisa dipastikan. Brand ini tidak diberi buffer lead time.</p>
    </>
  );
}

function AvgView({ m }: { m: OpsModel }) {
  const { span } = avgDaily(m);
  const c = m.config;
  return (
    <>
      <div className="grid max-w-[720px] gap-3 sm:grid-cols-2">
        <label className="field sm:col-span-2">
          <span>Dasar rata-rata jual harian</span>
          <SaveField
            key={c.avgMode}
            action={setOpsConfig}
            input={{}}
            field="avgMode"
            type="select"
            value={c.avgMode}
            options={[
              ['HISTORY', 'Histori penjualan (dari Excel)'],
              ['LOG', 'Penjualan terbaru dari export pesanan'],
              ['MAX', 'Ambil yang lebih tinggi (paling aman)'],
            ]}
          />
        </label>
        <label className="field">
          <span>Hari penjualan terbaru</span>
          <SaveField key={c.avgDays} action={setOpsConfig} input={{}} field="avgDays" value={c.avgDays} step="1" min={7} className="txtin" />
        </label>
        <label className="field">
          <span>Target stok (hari)</span>
          <SaveField key={c.targetDays} action={setOpsConfig} input={{}} field="targetDays" value={c.targetDays} step="1" min={1} className="txtin" />
        </label>
      </div>
      <p className="note">
        Histori: {m.historyLabel || 'belum ada'} ({Object.keys(m.history).length} SKU). Data penjualan dari export pesanan saat ini mencakup {span} hari terakhir. Mode penjualan terbaru butuh minimal 7 hari data.
      </p>
      <h3 className="dh">Upload histori rata-rata jual harian</h3>
      <div className="toolbar !mt-0">
        <div className="text-[13px] text-muted">Template berisi semua SKU master dengan rata-rata yang tersimpan sekarang. Upload baru menggantikan histori lama seluruhnya.</div>
        <a className="btn-ghost" href={backendUrl('/api/export/history-template')}>
          Download template
        </a>
      </div>
      <Importer kind="history" buttonLabel="Upload histori" />
    </>
  );
}

function QaView({ m }: { m: OpsModel }) {
  const g: Record<string, ReturnType<typeof qaList>> = {};
  for (const x of qaList(m)) (g[x[0]] ||= []).push(x);
  const keys = Object.keys(g);
  if (!keys.length) return <p className="note">Tidak ada temuan.</p>;
  return (
    <>
      {keys.map((k) => (
        <details key={k} className="qa">
          <summary>
            <b>{k}</b> <span className="chip chip-ch">{g[k].length}</span>
          </summary>
          <div className="qa-list">
            {g[k].slice(0, 200).map((x, i) => (
              <div key={i}>
                <b>{x[1]}</b> <span className="text-muted">{x[2]}</span>
              </div>
            ))}
          </div>
        </details>
      ))}
    </>
  );
}
