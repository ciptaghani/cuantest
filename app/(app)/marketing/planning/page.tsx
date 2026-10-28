'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { LoadState, useApi, useLoader } from '@/components/useApi';
import Link from 'next/link';
import { ActBtn } from '@/components/ActBtn';
import { AutoForm } from '@/components/AutoForm';
import { one, qs, type SP } from '@/components/qs';
import { daysInMonth, todayKey, weekdayMon0 } from '@/lib/date';
import { planSuggest, scaleCandidates } from '@/lib/marketing';
import { addPlan, deletePlan } from '../actions';
import { loadMkBase, mkPair, short, type MkBase } from '../view';
import { DoneToggle, PlanForm } from './PlanForms';

const WD = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

export default function Page() {
  return (
    <Suspense fallback={<p className="note mt-4">Memuat…</p>}>
      <Content />
    </Suspense>
  );
}

interface Plan {
  id: string;
  date: string;
  title: string;
  category: string;
  store: string;
  note: string | null;
  done: boolean;
}

function Content() {
  const usp = useSearchParams();
  const sp: SP = Object.fromEntries(usp.entries());
  const t = todayKey();
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(one(sp, 'month')) ? one(sp, 'month') : t.slice(0, 7);
  const [y, mo] = month.split('-').map(Number);
  const nd = daysInMonth(y, mo);
  const key = (d: number) => `${month}-${String(d).padStart(2, '0')}`;
  const { data: b, error: bErr, loading: bLoad } = useLoader<MkBase>(() => loadMkBase(), `plan-base-${month}`);
  const plans = useApi<Plan[]>(`/api/marketing/plans?from=${key(1)}&to=${key(nd)}`);
  const loading = bLoad || plans.loading;
  const error = bErr || plans.error;
  if (loading || error || !b || !plans.data) return <LoadState loading={loading} error={error} what="rencana marketing" />;
  return <Planning sp={sp} b={b} plans={plans.data} month={month} nd={nd} t={t} />;
}

function Planning({ sp, b, plans, month, nd, t }: { sp: SP; b: MkBase; plans: Plan[]; month: string; nd: number; t: string }) {
  const dayP = +one(sp, 'day');
  const day = dayP >= 1 && dayP <= nd ? dayP : month === t.slice(0, 7) ? +t.slice(8) : 1;
  const key = (d: number) => `${month}-${String(d).padStart(2, '0')}`;
  let scale: string[] = [];
  if (b.data.ads.length) {
    const { R, P } = mkPair(b, 30, '');
    scale = scaleCandidates(R, P, 30);
  }
  const sug = planSuggest(month, scale);
  const byDay: Record<number, typeof plans> = {};
  for (const p of plans) (byDay[+p.date.slice(8)] ||= []).push(p);
  const first = weekdayMon0(key(1));
  const dl = new Date(key(day) + 'T00:00:00Z').toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const di = byDay[day] || [];
  const ds = sug[day] || [];

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <div className="panel">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-lg">Schedule & planning</h2>
            <p className="sub">Rencana marketing harian. Kotak putus-putus = saran otomatis dari kalender event dan saran ads.</p>
          </div>
          <AutoForm className="flex items-end gap-2" reset={['day']}>
            <label className="field">
              <span>Bulan</span>
              <input type="month" name="month" defaultValue={month} />
            </label>
          </AutoForm>
        </div>
        <div className="cal mt-4">
          {WD.map((d) => (
            <div key={d} className="cal-h">
              {d}
            </div>
          ))}
          {Array.from({ length: first }, (_, i) => (
            <div key={'e' + i} className="cal-c empty" />
          ))}
          {Array.from({ length: nd }, (_, i) => {
            const d = i + 1;
            const it = byDay[d] || [];
            const sg = sug[d] || [];
            return (
              <Link key={d} href={qs(sp, { month, day: d })} scroll={false} className={`cal-c ${d === day ? 'sel' : ''} ${key(d) === t ? 'today' : ''}`} aria-current={d === day ? 'date' : undefined}>
                <span className="cal-d">{d}</span>
                {it.slice(0, 3).map((x) => (
                  <span key={x.id} className={`cal-i ${x.done ? 'done' : ''}`}>
                    {short(x.title, 22)}
                  </span>
                ))}
                {it.length > 3 && <span className="text-[11px] text-muted">+{it.length - 3}</span>}
                {sg.map((s, j) => (
                  <span key={j} className="cal-s">
                    {short(s.t, 22)}
                  </span>
                ))}
              </Link>
            );
          })}
        </div>
      </div>
      <div className="panel">
        <h2 className="text-lg">{dl}</h2>
        <h3 className="dh">Rencana</h3>
        {di.length ? (
          di.map((x) => (
            <div key={x.id} className="plan-i">
              <DoneToggle id={x.id} done={x.done} title={x.title} />
              <span className="chip chip-ch">{x.category}</span>
              {x.store && <span className="chip chip-ch">{x.store}</span>}
              {x.note && <div className="ps">{x.note}</div>}
              <ActBtn action={deletePlan} input={{ id: x.id }} confirm="Hapus rencana ini?">
                Hapus
              </ActBtn>
            </div>
          ))
        ) : (
          <p className="note">Belum ada rencana.</p>
        )}
        {ds.length > 0 && (
          <>
            <h3 className="dh">Saran</h3>
            {ds.map((s, i) => (
              <div key={i} className="plan-i sug">
                <b className="font-semibold">{s.t}</b>
                <div className="ps">{s.n}</div>
                <ActBtn action={addPlan} input={{ date: key(day), title: s.t, category: /iklan|budget|ROAS/i.test(s.n) ? 'Iklan' : 'Promo / event', storeId: '', note: s.n }} className="btn-ghost btn-sm">
                  Tambahkan ke rencana
                </ActBtn>
              </div>
            ))}
          </>
        )}
        <h3 className="dh">Tambah rencana</h3>
        <PlanForm key={key(day)} date={key(day)} stores={b.stores} />
      </div>
    </div>
  );
}
