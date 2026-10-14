'use client';

import { useState } from 'react';
import { Msg, useAction } from '@/components/useAction';
import { attendanceSet } from '../actions';

/** Catatan harian absensi (jam masuk, lembur, izin, …) untuk satu karyawan & tanggal. */
export function NoteForm({ month, lastDay, employees, defaultDay }: { month: string; lastDay: number; employees: { id: string; name: string }[]; defaultDay: number }) {
  const [emp, setEmp] = useState(employees[0]?.id ?? '');
  const [day, setDay] = useState(String(defaultDay));
  const [text, setText] = useState('');
  const { pending, msg, setMsg, run } = useAction();
  return (
    <form
      className="flex flex-wrap items-end gap-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        const d = Number(day);
        if (!Number.isInteger(d) || d < 1 || d > lastDay) return setMsg({ ok: false, text: `Isi tanggal 1–${lastDay}` });
        if (!text.trim()) return setMsg({ ok: false, text: 'Isi catatan' });
        run(
          () => attendanceSet({ employeeId: emp, date: `${month}-${String(d).padStart(2, '0')}`, note: text }),
          () => setText(''),
        );
      }}
    >
      <label className="field">
        <span>Karyawan</span>
        <select value={emp} onChange={(e) => setEmp(e.target.value)}>
          {employees.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Tanggal</span>
        <input type="number" inputMode="numeric" min={1} max={lastDay} value={day} onChange={(e) => setDay(e.target.value)} style={{ width: 80 }} />
      </label>
      <label className="field min-w-[140px] flex-1">
        <span>Catatan</span>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="mis. jam 10, izin sakit" />
      </label>
      <button className="btn-ghost" disabled={pending || !emp}>
        Simpan
      </button>
      <Msg msg={msg} />
    </form>
  );
}
