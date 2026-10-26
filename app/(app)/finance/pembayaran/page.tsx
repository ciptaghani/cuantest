'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { LoadState, useApi } from '@/components/useApi';
import { ActBtn } from '@/components/ActBtn';
import { Kpi } from '@/components/Kpi';
import { one, qs, type SP } from '@/components/qs';
import { accountName, bebanRest, chartOfAccounts, invPaid, invTotals, type PaymentKind } from '@/lib/finance';
import { rp, rpS } from '@/lib/format';
import type { FinanceInput } from '@/lib/repo/finance';
import { deletePayment } from '../actions';
import { isExpenseAccount, isReceiptAccount } from '../logic';
import { accOptions, fdate, PeriodBar, periodOf } from '../ui';
import { PAY_LABEL } from './constants';
import { PayForm } from './PayForm';

const KINDS = Object.keys(PAY_LABEL) as PaymentKind[];

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
  const { today, from, to } = periodOf(sp);
  const { data: fin, error, loading } = useApi<FinanceInput>('/api/finance/input');
  if (loading || error || !fin) return <LoadState loading={loading} error={error} what="pembayaran" />;
  return <Pembayaran sp={sp} today={today} from={from} to={to} fin={fin} />;
}

function Pembayaran({ sp, today, from, to, fin }: { sp: SP; today: string; from: string; to: string; fin: FinanceInput }) {
  const { map } = chartOfAccounts(fin.accounts);
  const noBank = !fin.accounts.some((a) => a.isBank);
  const bankWarn = noBank && (
    <p className="alert mid mb-3">
      Belum ada rekening bank. <Link href="/finance/pengaturan">Daftarkan rekening</Link> di Pengaturan akun supaya pembayaran & pemindahan dana bisa dipilih.
    </p>
  );

  const newKind = KINDS.find((k) => k === one(sp, 'new'));
  if (newKind) {
    const ref = newKind === 'EXPENSE_REMAINDER' ? fin.payments.find((p) => p.id === one(sp, 'ref') && p.kind === 'EXPENSE') : undefined;
    if (newKind === 'EXPENSE_REMAINDER' && !ref) return <p className="panel">Pembayaran beban asal tidak ditemukan.</p>;
    const invoices = fin.invoices
      .map((v) => ({ id: v.id, label: `${v.number} · ${v.supplier}`, total: invTotals(v).total, paid: invPaid(fin.payments, v.id), date: v.date }))
      .filter((x) => x.total - x.paid > 0.5)
      .sort((a, b) => a.date.localeCompare(b.date));
    return (
      <>
        {bankWarn}
        <PayForm
          init={{ kind: newKind, invoiceId: one(sp, 'inv'), refPaymentId: ref?.id ?? '', bank: ref?.bank ?? '' }}
          today={today}
          banks={accOptions(fin.accounts, (a) => a.isCash)}
          expenseAccounts={accOptions(fin.accounts, isExpenseAccount)}
          receiptAccounts={accOptions(fin.accounts, isReceiptAccount)}
          invoices={invoices}
          remainder={ref ? { number: ref.number, rest: bebanRest(fin.payments, ref).rest } : null}
        />
      </>
    );
  }

  const kind = KINDS.find((k) => k === one(sp, 'kind')) ?? '';
  const invs = new Map(fin.invoices.map((v) => [v.id, v]));
  const byId = new Map(fin.payments.map((p) => [p.id, p]));
  const all = fin.payments.filter((p) => p.date >= from && p.date <= to && (!kind || p.kind === kind)).sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number));
  const out = all.filter((p) => p.kind !== 'RECEIPT').reduce((a, p) => a + p.amount, 0);
  const inn = all.filter((p) => p.kind === 'RECEIPT').reduce((a, p) => a + p.amount, 0);
  const utang = fin.payments.filter((p) => p.kind === 'EXPENSE').reduce((a, p) => a + bebanRest(fin.payments, p).rest, 0);
  const desc = (p: (typeof all)[number]) => {
    if (p.kind === 'EXPENSE') return p.lines.map((l) => l.note || accountName(map, l.account)).join(', ');
    if (p.kind === 'INVOICE') {
      const v = p.invoiceId ? invs.get(p.invoiceId) : undefined;
      return v ? `${v.number} · ${v.supplier}` : 'Faktur terhapus';
    }
    if (p.kind === 'ADS_TOPUP') return `Saldo iklan ${p.channel ?? 'lainnya'}`;
    if (p.kind === 'RECEIPT') return accountName(map, p.account ?? '');
    return `Sisa ${byId.get(p.refPaymentId ?? '')?.number ?? ''}`;
  };

  return (
    <div className="panel">
      {bankWarn}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg">Pembayaran</h2>
          <p className="sub">Bayar beban (gaji, listrik, air, dll), faktur pembelian, top up saldo iklan, atau catat penerimaan lain. Bisa lunas atau DP.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="btn" href="?new=EXPENSE">
            Pembayaran baru
          </Link>
          <Link className="btn-ghost" href="?new=RECEIPT">
            Penerimaan lain
          </Link>
        </div>
      </div>
      <div className="kps">
        <Kpi label="Uang keluar periode ini" value={rpS(out)} />
        <Kpi label="Penerimaan lain" value={rpS(inn)} />
        <Kpi label="Sisa utang beban" value={rpS(utang)} cls={utang ? 'mid' : ''} />
      </div>
      <PeriodBar sp={sp} from={from} to={to}>
        <label className="field">
          <span>Jenis</span>
          <select name="kind" defaultValue={kind}>
            <option value="">Semua</option>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {PAY_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
      </PeriodBar>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Tanggal</th>
              <th>No. bukti</th>
              <th>Jenis</th>
              <th>Keterangan</th>
              <th>Kas/Bank</th>
              <th className="r">Nilai</th>
              <th className="r">Sisa</th>
              <th>Bukti</th>
              <th>Oleh</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {all.map((p) => {
              const r = p.kind === 'EXPENSE' ? bebanRest(fin.payments, p) : null;
              return (
                <tr key={p.id} className="align-top">
                  <td>{fdate(p.date)}</td>
                  <td>
                    <b>{p.number}</b>
                  </td>
                  <td>
                    <span className={`chip ${p.kind === 'RECEIPT' ? 'chip-ok' : 'chip-ch'}`}>{PAY_LABEL[p.kind]}</span>
                  </td>
                  <td className="max-w-[280px] !whitespace-normal">
                    {desc(p)}
                    {p.note && <div className="ps">{p.note}</div>}
                  </td>
                  <td>{accountName(map, p.bank ?? '1-100')}</td>
                  <td className={`r ${p.kind === 'RECEIPT' ? 'text-profit' : ''}`}>{rp(p.amount)}</td>
                  <td className="r">{r && r.rest > 0.5 && <span className="neg">{rp(r.rest)}</span>}</td>
                  <td>
                    –
                  </td>
                  <td>{p.by}</td>
                  <td className="space-x-2">
                    {r && r.rest > 0.5 && (
                      <Link className="btn-ghost btn-sm" href={qs({}, { new: 'EXPENSE_REMAINDER', ref: p.id })}>
                        Bayar sisa
                      </Link>
                    )}
                    <ActBtn action={deletePayment} input={{ id: p.id }} confirm={`Hapus ${p.number}?`}>
                      Hapus
                    </ActBtn>
                  </td>
                </tr>
              );
            })}
            {!all.length && (
              <tr>
                <td colSpan={10} className="text-muted">
                  Belum ada pembayaran di periode ini.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
