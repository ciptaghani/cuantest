import type { Metadata } from 'next';
import Link from 'next/link';
import { ActBtn } from '@/components/ActBtn';
import { AutoForm } from '@/components/AutoForm';
import { one, qs, type SP } from '@/components/qs';
import { requireArea } from '@/lib/auth/guard';
import { invPaid, invTotals } from '@/lib/finance';
import { rp } from '@/lib/format';
import { hppCalc, skuLabel } from '@/lib/ops';
import { norm } from '@/lib/parse';
import { getFinanceInput, type DocRow } from '@/lib/repo/finance';
import { getOpsModel } from '@/lib/repo/ops';
import { SearchField } from '../../operasional/ui';
import { deleteDoc } from '../actions';
import { isItemAccount } from '../logic';
import { restockRows } from '../restock/rows';
import { accOptions, fdate } from '../ui';
import { DocForm, type Draft } from './DocForm';

export const metadata: Metadata = { title: 'Pembelian barang · Cuan Lens' };

const s = (v: number) => (v ? String(v) : '');

function draftOf(v: DocRow, asNew = false): Draft {
  return {
    id: asNew ? '' : v.id,
    number: asNew ? '' : v.number,
    poId: '',
    supplier: v.supplier,
    date: v.date,
    dueDate: v.dueDate,
    lines: v.lines.map((l) => ({ kind: l.kind, sku: l.sku ?? '', name: l.name, account: l.account ?? '6-300', qty: s(l.qty), unit: l.unit, price: s(l.price), disc: s(l.disc) })),
    discIsPct: v.discIsPct,
    discValue: s(v.discValue),
    extra: s(v.extra),
    received: v.received,
    warehouseId: v.warehouseId ?? '',
    note: v.note,
  };
}

export default async function Page({ searchParams }: { searchParams: Promise<SP> }) {
  await requireArea('FINANCE');
  const sp = await searchParams;
  const tab = one(sp, 'tab') === 'inv' ? 'inv' : 'po';
  const edit = one(sp, 'edit');
  const [fin, m] = await Promise.all([getFinanceInput(), getOpsModel()]);

  if (edit) {
    const H = hppCalc(m);
    const docs = tab === 'inv' ? fin.invoices : fin.purchaseOrders;
    const empty: Draft = {
      id: '',
      number: '',
      poId: '',
      supplier: '',
      date: m.today,
      dueDate: '',
      lines: [],
      discIsPct: false,
      discValue: '',
      extra: '',
      received: true,
      warehouseId: m.config.mainWarehouseId,
      note: '',
    };
    let init = empty;
    const po = fin.purchaseOrders.find((x) => x.id === one(sp, 'po'));
    if (edit !== 'new') {
      const v = docs.find((x) => x.id === edit);
      if (!v) return <p className="panel">Dokumen tidak ditemukan. Mungkin sudah dihapus.</p>;
      init = draftOf(v);
      if (!init.warehouseId) init.warehouseId = m.config.mainWarehouseId;
    } else if (tab === 'inv' && po) {
      init = { ...draftOf(po, true), date: m.today, poId: po.id, received: true, warehouseId: m.config.mainWarehouseId };
    } else if (tab === 'po' && one(sp, 'restock')) {
      const { rows, f } = await restockRows(sp);
      const lines = rows.filter((r) => r.supplier === f.sup && r.need > 0);
      init = {
        ...empty,
        supplier: f.sup,
        note: `Dari schedule restock ${m.today}`,
        lines: lines.map((r) => ({ kind: 'SKU', sku: r.code, name: '', account: '', qty: String(r.need), unit: 'pcs', price: String(Math.round(r.price)), disc: '' })),
      };
    }
    return (
      <DocForm
        key={edit + one(sp, 'po')}
        type={tab === 'inv' ? 'INV' : 'PO'}
        init={init}
        skus={Object.values(m.skuMap).map((x) => ({ code: x.code, label: skuLabel(x), price: H[x.code]?.now ?? x.cogs }))}
        suppliers={fin.suppliers}
        accounts={accOptions(fin.accounts, isItemAccount)}
        warehouses={m.warehouses}
      />
    );
  }

  const q = one(sp, 'q');
  const list = (tab === 'po' ? fin.purchaseOrders : fin.invoices)
    .filter((x) => !q || norm(x.number + ' ' + x.supplier).includes(norm(q)))
    .sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number));
  const invByPo = new Map(fin.invoices.filter((v) => v.poId).map((v) => [v.poId as string, v]));

  return (
    <div className="panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg">Pembelian barang</h2>
          <p className="sub">
            PO untuk pesan ke pemasok, faktur untuk mencatat tagihan. Faktur SKU otomatis jadi barang masuk di Operasional; barang lain dicatat ke akun perlengkapan, peralatan, atau
            beban.
          </p>
        </div>
        <Link className="btn" href={qs(sp, { edit: 'new', tab })}>
          {tab === 'po' ? 'Buat PO' : 'Buat faktur'}
        </Link>
      </div>
      <div className="seg mt-3">
        <Link href="?tab=po" aria-current={tab === 'po' ? 'page' : undefined}>
          Pesanan pembelian (PO)
        </Link>
        <Link href="?tab=inv" aria-current={tab === 'inv' ? 'page' : undefined}>
          Faktur pembelian
        </Link>
      </div>
      <AutoForm>
        <SearchField value={q} placeholder="No. atau pemasok" />
      </AutoForm>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            {tab === 'po' ? (
              <tr>
                <th>Tanggal</th>
                <th>No. PO</th>
                <th>Pemasok</th>
                <th className="r">Item</th>
                <th className="r">Total</th>
                <th>Status</th>
                <th />
              </tr>
            ) : (
              <tr>
                <th>Tanggal</th>
                <th>No. faktur</th>
                <th>Pemasok</th>
                <th className="r">Total</th>
                <th className="r">Dibayar</th>
                <th className="r">Sisa</th>
                <th>Status</th>
                <th />
              </tr>
            )}
          </thead>
          <tbody>
            {list.map((x) => {
              const t = invTotals(x);
              const actions = (
                <>
                  <Link className="linkbtn" href={qs(sp, { edit: x.id })}>
                    Ubah
                  </Link>{' '}
                  <ActBtn
                    action={deleteDoc}
                    input={{ type: tab === 'po' ? 'PO' : 'INV', id: x.id }}
                    confirm={`Hapus ${x.number}?${tab === 'inv' && x.received && x.lines.some((l) => l.kind === 'SKU') ? ' Barang masuk di Operasional juga ikut dihapus.' : ''}`}
                  >
                    Hapus
                  </ActBtn>
                </>
              );
              if (tab === 'po') {
                const iv = invByPo.get(x.id);
                return (
                  <tr key={x.id}>
                    <td>{fdate(x.date)}</td>
                    <td>
                      <b>{x.number}</b>
                    </td>
                    <td>{x.supplier}</td>
                    <td className="r">{x.lines.length}</td>
                    <td className="r">{rp(t.total)}</td>
                    <td>{iv ? <span className="chip chip-ok">Difakturkan · {iv.number}</span> : <span className="chip chip-mid">Terbuka</span>}</td>
                    <td className="space-x-2">
                      {!iv && (
                        <Link className="btn-ghost btn-sm" href={`?tab=inv&edit=new&po=${x.id}`}>
                          Buat faktur
                        </Link>
                      )}
                      {actions}
                    </td>
                  </tr>
                );
              }
              const paid = invPaid(fin.payments, x.id);
              const rest = Math.max(0, t.total - paid);
              return (
                <tr key={x.id}>
                  <td>{fdate(x.date)}</td>
                  <td>
                    <b>{x.number}</b>
                  </td>
                  <td>{x.supplier}</td>
                  <td className="r">{rp(t.total)}</td>
                  <td className="r">{rp(paid)}</td>
                  <td className={`r ${rest > 0.5 ? 'neg' : ''}`}>{rp(rest)}</td>
                  <td>
                    {rest <= 0.5 ? <span className="chip chip-ok">Lunas</span> : paid ? <span className="chip chip-mid">Sebagian</span> : <span className="chip chip-bad">Belum dibayar</span>}
                    {x.dueDate && rest > 0.5 && x.dueDate < m.today && <span className="chip chip-bad ml-1">Lewat jatuh tempo</span>}
                  </td>
                  <td className="space-x-2">
                    {rest > 0.5 && (
                      <Link className="btn-ghost btn-sm" href={`/finance/pembayaran?new=INVOICE&inv=${x.id}`}>
                        Bayar
                      </Link>
                    )}
                    {actions}
                  </td>
                </tr>
              );
            })}
            {!list.length && (
              <tr>
                <td colSpan={8} className="text-muted">
                  Belum ada data.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
