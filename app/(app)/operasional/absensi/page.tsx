import type { Metadata } from 'next';
import { requireArea } from '@/lib/auth/guard';
import { ActBtn } from '@/components/ActBtn';
import { AutoForm } from '@/components/AutoForm';
import { one, type SP } from '@/components/qs';
import { daysInMonth, todayKey, weekdaySun0 } from '@/lib/date';
import { attendanceMonth } from '@/lib/repo/ops';
import { attendanceSet, employeeAdd, employeeRemove } from '../actions';
import { AddForm, SaveField } from '../inputs';
import { NoteForm } from './NoteForm';

export const metadata: Metadata = { title: 'Absensi · Cuan Lens' };

const WD = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

export default async function Page({ searchParams }: { searchParams: Promise<SP> }) {
  await requireArea('OPS');
  const sp = await searchParams;
  const today = todayKey();
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(one(sp, 'month')) ? one(sp, 'month') : today.slice(0, 7);
  const [y, mo] = month.split('-').map(Number);
  const nd = daysInMonth(y, mo);
  const { employees, days } = await attendanceMonth(month, nd);
  const dayKeys = Array.from({ length: nd }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
  const monthShort = new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString('id-ID', { month: 'short', timeZone: 'UTC' });
  const notes = employees
    .flatMap((e) =>
      Object.entries(days[e.id] ?? {})
        .filter(([, c]) => c.note)
        .map(([d, c]) => ({ e, d: Number(d), note: c.note })),
    )
    .sort((a, b) => a.d - b.d || a.e.name.localeCompare(b.e.name));

  return (
    <div className="panel">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg">Absensi</h2>
          <p className="sub">Centang kalau hadir. Titik kecil = ada catatan (mis. jam masuk, lembur, izin). Tiap centang tersimpan sendiri, jadi bisa diisi bersamaan.</p>
        </div>
        <AutoForm className="flex items-end gap-2">
          <label className="field">
            <span>Bulan</span>
            <input type="month" name="month" defaultValue={month} />
          </label>
        </AutoForm>
      </div>

      {employees.length ? (
        <div className="tbl-wrap mt-4">
          <table className="tbl absen">
            <thead>
              <tr>
                <th className="l sticky-col">Karyawan</th>
                {dayKeys.map((k, i) => {
                  const w = weekdaySun0(k);
                  return (
                    <th key={k} className={`dcol ${w === 0 ? 'sun' : ''} ${k === today ? 'today' : ''}`}>
                      <div>{i + 1}</div>
                      <small>{WD[w]}</small>
                    </th>
                  );
                })}
                <th>Hadir</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((e) => {
                const ed = days[e.id] ?? {};
                const tot = Object.values(ed).filter((c) => c.present).length;
                return (
                  <tr key={e.id}>
                    <td className="l sticky-col">
                      <b>{e.name}</b>
                    </td>
                    {dayKeys.map((k, i) => {
                      const c = ed[i + 1];
                      return (
                        <td key={k} className={`dcol ${weekdaySun0(k) === 0 ? 'sun' : ''}`}>
                          <label className="cell" title={`${e.name} ${i + 1}/${mo}${c?.note ? ' · ' + c.note : ''}`}>
                            <SaveField
                              key={String(!!c?.present)}
                              action={attendanceSet}
                              input={{ employeeId: e.id, date: k }}
                              field="present"
                              type="checkbox"
                              value={!!c?.present}
                              label={`${e.name} tanggal ${i + 1}`}
                            />
                            {c?.note && <i className="ndot" />}
                          </label>
                        </td>
                      );
                    })}
                    <td className="r">
                      <b>{tot}</b>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="note mt-4">Belum ada karyawan. Tambahkan di bawah.</p>
      )}

      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="dh !mt-0">Catatan harian</h3>
          {employees.length > 0 && <NoteForm month={month} lastDay={nd} employees={employees} defaultDay={today.startsWith(month) ? Number(today.slice(8)) : 1} />}
          <ul className="rank mt-3">
            {notes.map(({ e, d, note }) => (
              <li key={`${e.id}-${d}`}>
                <div>
                  <div className="nm">
                    {e.name} · {d} {monthShort}
                  </div>
                  <div className="sk">{note}</div>
                </div>
                <div className="val">
                  <ActBtn action={attendanceSet} input={{ employeeId: e.id, date: `${month}-${String(d).padStart(2, '0')}`, note: '' }} confirm="Hapus catatan ini?">
                    Hapus
                  </ActBtn>
                </div>
              </li>
            ))}
            {!notes.length && (
              <li>
                <span className="sk">Belum ada catatan bulan ini.</span>
              </li>
            )}
          </ul>
        </div>
        <div>
          <h3 className="dh !mt-0">Karyawan</h3>
          <AddForm action={employeeAdd} fields={[{ name: 'name', label: 'Nama', placeholder: 'Nama karyawan', grow: true, required: true }]} />
          <ul className="rank mt-3">
            {employees.map((e) => (
              <li key={e.id}>
                <div className="nm">{e.name}</div>
                <div className="val">
                  <ActBtn action={employeeRemove} input={{ id: e.id }} confirm={`Hapus ${e.name} dari daftar? Riwayat absensinya tetap tersimpan.`}>
                    Hapus
                  </ActBtn>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
