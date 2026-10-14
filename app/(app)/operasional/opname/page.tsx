import type { Metadata } from 'next';
import { requireArea } from '@/lib/auth/guard';
import Link from 'next/link';
import { ActBtn } from '@/components/ActBtn';
import { AutoForm } from '@/components/AutoForm';
import { Empty, Kpi } from '@/components/Kpi';
import { one, qs, type SP } from '@/components/qs';
import { todayKey } from '@/lib/date';
import { n0, rp } from '@/lib/format';
import { brandsOf, bySkuOrder, opnameRows, type OpsModel } from '@/lib/ops';
import { getOpsModel, listOpnames, opnameCounts, type OpnameSession } from '@/lib/repo/ops';
import { Importer } from '../../data/import-export/Importer';
import { opnameDelete, opnameFinalize, opnameReopen, opnameSetCount } from '../actions';
import { SaveField } from '../inputs';
import { BrandField, CatField, CATS, fdate, limitOf, matchQ, MoreLink, NoMaster, SearchField, SkuCell, WhOptions } from '../ui';
import { OpnameNew } from './OpnameNew';

export const metadata: Metadata = { title: 'Stock opname · Cuan Lens' };

const ONLY: [string, string][] = [
  ['', 'Semua'],
  ['blank', 'Belum diisi'],
  ['diff', 'Ada selisih'],
];

export default async function Page({ searchParams }: { searchParams: Promise<SP> }) {
  await requireArea('OPS');
  const sp = await searchParams;
  const [m, sessions] = await Promise.all([getOpsModel(), listOpnames()]);
  if (!Object.keys(m.skuMap).length) return <NoMaster />;
  const nSku = Object.keys(m.skuMap).length;
  const whF = m.warehouses.some((w) => w.id === one(sp, 'whF')) ? one(sp, 'whF') : '';
  const cur = sessions.find((o) => o.id === one(sp, 'id')) ?? sessions.find((o) => !o.final) ?? sessions[0];

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
      <div className="panel self-start">
        <h2 className="text-lg">Sesi opname</h2>
        <OpnameNew warehouses={m.warehouses} mainWarehouseId={m.config.mainWarehouseId} today={todayKey()} />
        <AutoForm className="mt-3 flex flex-wrap items-end gap-2.5">
          <label className="field">
            <span>Tampilkan sesi</span>
            <select name="whF" defaultValue={whF}>
              <WhOptions m={m} all="Semua gudang" />
            </select>
          </label>
        </AutoForm>
        <ul className="rank mt-3">
          {sessions
            .filter((o) => !whF || o.warehouseId === whF)
            .map((o) => (
              <li key={o.id} className={o.id === cur?.id ? 'sel' : ''}>
                <Link href={qs({ whF: whF || undefined }, { id: o.id })} scroll={false} className="flex w-full items-center justify-between gap-3">
                  <div>
                    <div className="nm">{fdate(o.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</div>
                    <div className="sk">
                      <b>{m.whName(o.warehouseId)}</b> · {o.filled} dari {nSku} SKU terisi
                    </div>
                  </div>
                  <div className="val">{o.final ? <span className="chip chip-ok">Final · baseline</span> : <span className="chip chip-mid">Berjalan</span>}</div>
                </Link>
              </li>
            ))}
          {!sessions.length && (
            <li>
              <span className="sk">Belum ada sesi opname.</span>
            </li>
          )}
        </ul>
        <p className="note">Tiap gudang punya baseline sendiri: stok real-time memakai sesi final terbaru gudang itu. Transaksi di tanggal opname dianggap sudah termasuk hitungan fisik.</p>
      </div>
      {cur ? (
        <Session m={m} sp={sp} cur={cur} nSku={nSku} />
      ) : (
        <div className="panel">
          <Empty title="Pilih atau mulai sesi opname" />
        </div>
      )}
    </div>
  );
}

async function Session({ m, sp, cur, nSku }: { m: OpsModel; sp: SP; cur: OpnameSession; nSku: number }) {
  const counts = await opnameCounts(cur.id);
  const all = opnameRows(m, { date: cur.date, warehouseId: cur.warehouseId, counts });
  const filled = all.filter((r) => r.v !== null);
  const diffN = filled.filter((r) => r.diff).length;
  const diffVal = filled.reduce((a, r) => a + (r.diff ?? 0) * r.cogs, 0);

  const cat = (CATS as readonly string[]).includes(one(sp, 'cat')) ? one(sp, 'cat') : '';
  const brand = one(sp, 'brand');
  const only = ONLY.some(([k]) => k === one(sp, 'only')) ? one(sp, 'only') : '';
  const q = one(sp, 'q');
  const rows = all
    .filter((r) => (!cat || r.category === cat) && (!brand || r.brand === brand) && matchQ(q, r.code, r.product, r.brand) && (only !== 'blank' || r.v === null) && (only !== 'diff' || !!r.diff))
    .sort(bySkuOrder);
  const lim = limitOf(sp);
  const ro = cur.final;
  const tpl = new URLSearchParams({ warehouseId: cur.warehouseId, date: cur.date, ...(brand ? { brand } : {}) }).toString();
  const keep = { id: cur.id };

  return (
    <div className="panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg">
            Opname {m.whName(cur.warehouseId)} · {fdate(cur.date, { day: 'numeric', month: 'long', year: 'numeric' })}
          </h2>
          <p className="sub">{ro ? 'Sesi ini sudah final dan dipakai sebagai baseline.' : 'Isi qty fisik hasil hitung gudang. Bisa dikerjakan beberapa orang sekaligus; tiap baris tersimpan sendiri.'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {ro ? (
            <ActBtn action={opnameReopen} input={{ opnameId: cur.id }} className="btn-ghost" confirm="Buka lagi sesi ini? Selama dibuka, stok memakai baseline sebelumnya.">
              Buka lagi
            </ActBtn>
          ) : (
            <>
              <ActBtn
                action={opnameFinalize}
                input={{ opnameId: cur.id }}
                className="btn"
                confirm={`Selesaikan opname dan jadikan baseline stok ${m.whName(cur.warehouseId)}? ${nSku - filled.length ? `${nSku - filled.length} SKU yang belum diisi akan memakai stok sistem.` : ''}`}
              >
                Selesaikan & jadikan baseline
              </ActBtn>
              <ActBtn action={opnameDelete} input={{ opnameId: cur.id }} className="btn-ghost text-loss" confirm="Hapus sesi opname ini beserta semua isiannya?">
                Hapus sesi
              </ActBtn>
            </>
          )}
        </div>
      </div>

      <div className="toolbar">
        <div>
          <b>Template stock opname</b>
          <div className="text-[13px] text-muted">
            Kolom: No, Nama Brand, Kode SKU, Qty Tercatat (stok sistem {fdate(cur.date, { day: 'numeric', month: 'short' })}), Qty Stock Opname. Ikut filter brand di bawah.
          </div>
        </div>
        <a className="btn-ghost" href={`/api/export/opname-template?${tpl}`}>
          Download template
        </a>
      </div>
      {!ro && (
        <Importer
          kind="opname"
          params={{ warehouseId: cur.warehouseId, date: cur.date }}
          buttonLabel="Upload hasil opname"
          note={<p className="note">Qty di file mengisi sesi ini. Sel kosong di file tidak menghapus isian yang sudah ada.</p>}
        />
      )}

      <div className="kps">
        <Kpi label="Terisi" value={`${filled.length}/${nSku}`} />
        <Kpi label="SKU selisih" value={diffN} cls={diffN ? 'mid' : ''} href={qs(sp, { ...keep, only: 'diff', lim: null })} on={only === 'diff'} />
        <Kpi label="Nilai selisih (HPP)" value={rp(diffVal)} cls={diffVal < 0 ? 'bad' : ''} />
        <Kpi label="Belum diisi" value={nSku - filled.length} href={qs(sp, { ...keep, only: 'blank', lim: null })} on={only === 'blank'} />
      </div>
      <AutoForm reset={['lim']}>
        <CatField value={cat} />
        <BrandField value={brand} brands={brandsOf(m)} />
        <label className="field">
          <span>Tampilkan</span>
          <select name="only" defaultValue={only}>
            {ONLY.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <SearchField value={q} />
      </AutoForm>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Produk</th>
              <th>Kategori</th>
              <th className="r">Stok sistem</th>
              <th className="r">Qty fisik</th>
              <th className="r">Selisih</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, lim).map((r) => (
              <tr key={r.code}>
                <td>
                  <SkuCell s={r} />
                </td>
                <td>{r.category}</td>
                <td className="r">{n0(r.sys)}</td>
                <td className="r">
                  {ro ? (
                    r.v === null ? '–' : n0(r.v)
                  ) : (
                    <SaveField key={`${r.code}:${r.v}`} action={opnameSetCount} input={{ opnameId: cur.id, sku: r.code }} field="qty" value={r.v} emptyNull step="1" min={0} label={`Qty fisik ${r.code}`} />
                  )}
                </td>
                <td className={`r ${(r.diff ?? 0) < 0 ? 'neg' : (r.diff ?? 0) > 0 ? 'pos' : ''}`}>{r.diff === null ? '' : r.diff > 0 ? `+${n0(r.diff)}` : n0(r.diff)}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={5} className="text-muted">
                  Tidak ada SKU di filter ini.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <MoreLink total={rows.length} limit={lim} href={qs(sp, { ...keep, lim: 'all' })} />
    </div>
  );
}
