import type { Metadata } from 'next';
import { requireArea } from '@/lib/auth/guard';
import { ActBtn } from '@/components/ActBtn';
import { AutoForm } from '@/components/AutoForm';
import { one, type SP } from '@/components/qs';
import { n0, rpS } from '@/lib/format';
import type { MovementType } from '@/lib/ops';
import { getOpsModel, listMovements } from '@/lib/repo/ops';
import { deleteMovement } from '../actions';
import { IO_LABEL } from '../constants';
import { fdate, matchQ, NoMaster, RangeFields, rangeOf, SearchField, SkuDatalist, skuOptions, WhOptions } from '../ui';
import { IOForm } from './IOForm';

export const metadata: Metadata = { title: 'Barang keluar masuk · Cuan Lens' };

const IO_TYPES = Object.keys(IO_LABEL) as (keyof typeof IO_LABEL)[];
const CHIP = { IN: 'ok', OUT: 'bad', TRANSFER: 'ch' } as const;

export default async function Page({ searchParams }: { searchParams: Promise<SP> }) {
  await requireArea('OPS');
  const sp = await searchParams;
  const m = await getOpsModel();
  if (!Object.keys(m.skuMap).length) return <NoMaster />;
  const { today, from, to } = rangeOf(sp, 30);
  const f = IO_TYPES.find((t) => t === one(sp, 'f')) ?? '';
  const whF = m.warehouses.some((w) => w.id === one(sp, 'wh')) ? one(sp, 'wh') : '';
  const q = one(sp, 'q');
  const hist = (await listMovements(f ? [f as MovementType] : IO_TYPES, from, to)).filter(
    (e) => (!whF || e.warehouseId === whF || e.toWarehouseId === whF) && matchQ(q, ...e.lines.map((o) => o.sku), e.note, e.reason),
  );

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <SkuDatalist id="dl-io" opts={skuOptions(m)} />
      <div className="panel self-start">
        <h2 className="text-lg">Barang keluar masuk</h2>
        <IOForm warehouses={m.warehouses} mainWarehouseId={m.config.mainWarehouseId} today={today} />
      </div>
      <div className="panel">
        <h2 className="text-lg">Riwayat keluar masuk</h2>
        <AutoForm>
          <RangeFields from={from} to={to} />
          <label className="field">
            <span>Jenis</span>
            <select name="f" defaultValue={f}>
              <option value="">Semua</option>
              {IO_TYPES.map((t) => (
                <option key={t} value={t}>
                  {IO_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Gudang</span>
            <select name="wh" defaultValue={whF}>
              <WhOptions m={m} all="Semua" />
            </select>
          </label>
          <SearchField value={q} placeholder="SKU atau catatan" />
        </AutoForm>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>Jenis</th>
                <th>Gudang</th>
                <th>Barang</th>
                <th>Catatan</th>
                <th>Oleh</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {hist.map((e) => {
                const t = e.type as keyof typeof IO_LABEL;
                return (
                  <tr key={e.id} className="align-top">
                    <td>{fdate(e.date)}</td>
                    <td>
                      <span className={`chip chip-${CHIP[t]}`}>{IO_LABEL[t]}</span>
                    </td>
                    <td>
                      {m.whName(e.warehouseId)}
                      {t === 'TRANSFER' && ` → ${m.whName(e.toWarehouseId)}`}
                    </td>
                    <td className="min-w-[160px] !whitespace-normal">
                      {e.lines.map((o) => (
                        <span key={o.sku} className="chip chip-ch mr-0.5">
                          {o.sku} ×{n0(o.qty)}
                          {o.unitPrice !== null && ` @${rpS(o.unitPrice)}`}
                        </span>
                      ))}
                    </td>
                    <td className="max-w-[220px] !whitespace-normal">{[e.reason, e.note].filter(Boolean).join(' · ')}</td>
                    <td>{e.by}</td>
                    <td>
                      {e.fromInvoice ? (
                        <span className="text-[12.5px] text-muted">dari faktur</span>
                      ) : (
                        <ActBtn action={deleteMovement} input={{ id: e.id }} confirm="Hapus catatan ini? Stok akan dihitung ulang.">
                          Hapus
                        </ActBtn>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!hist.length && (
                <tr>
                  <td colSpan={7} className="text-muted">
                    Belum ada catatan di periode ini.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
