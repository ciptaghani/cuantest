'use client';

import { useState, useTransition } from 'react';
import type { ActionResult } from '@/lib/auth/guard';
import type { Menu, Role } from '@/lib/auth/permissions';
import { createUser, deleteUser, resetPassword, setActive, updateAccess } from './actions';

export interface UserView {
  id: string;
  name: string;
  username: string;
  role: Role;
  active: boolean;
  permissions: Menu[];
  isMe: boolean;
}

type MenuOpt = { key: Menu; label: string };

function useRun() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (fn: () => Promise<ActionResult>, onOk?: () => void) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? { ok: true, text: r.message || 'Tersimpan' } : { ok: false, text: r.error });
      if (r.ok) onOk?.();
    });
  return { pending, msg, run };
}

function Msg({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null;
  return (
    <span role="status" className={`text-[13px] ${msg.ok ? 'text-profit' : 'text-loss'}`}>
      {msg.text}
    </span>
  );
}

function PermChecks({ menus, value, onChange, disabled }: { menus: MenuOpt[]; value: Menu[]; onChange: (v: Menu[]) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      {menus.map((m) => (
        <label key={m.key} className="inline-flex items-center gap-1.5 text-[13.5px]">
          <input
            type="checkbox"
            disabled={disabled}
            checked={value.includes(m.key)}
            onChange={(e) => onChange(e.target.checked ? [...value, m.key] : value.filter((x) => x !== m.key))}
          />
          {m.label}
        </label>
      ))}
    </div>
  );
}

export function UserRow({ user, menus }: { user: UserView; menus: MenuOpt[] }) {
  const [role, setRole] = useState<Role>(user.role);
  const [perms, setPerms] = useState<Menu[]>(user.permissions);
  const [resetting, setResetting] = useState(false);
  const [pw, setPw] = useState('');
  const { pending, msg, run } = useRun();
  const dirty = role !== user.role || (role === 'STAFF' && [...perms].sort().join() !== [...user.permissions].sort().join());

  return (
    <tr className="align-top">
      <td>
        <b>{user.name}</b>
        {user.isMe && <span className="chip chip-ch ml-1">Kamu</span>}
      </td>
      <td>{user.username}</td>
      <td>
        <select className="rounded-md border border-line bg-surf px-2 py-1" value={role} onChange={(e) => setRole(e.target.value as Role)} aria-label={`Peran ${user.name}`}>
          <option value="ADMIN">Admin</option>
          <option value="STAFF">Staff</option>
        </select>
      </td>
      <td className="!whitespace-normal">
        {role === 'ADMIN' ? <span className="chip chip-ok">Semua menu</span> : <PermChecks menus={menus} value={perms} onChange={setPerms} />}
        {dirty && (
          <button className="btn btn-sm mt-1.5" disabled={pending} onClick={() => run(() => updateAccess({ userId: user.id, role, permissions: perms }))}>
            Simpan akses
          </button>
        )}
      </td>
      <td>
        <button
          className={`chip cursor-pointer ${user.active ? 'chip-ok' : 'chip-ch'}`}
          disabled={pending}
          title={user.active ? 'Klik untuk menonaktifkan' : 'Klik untuk mengaktifkan'}
          onClick={() => run(() => setActive({ userId: user.id, active: !user.active }))}
        >
          {user.active ? 'Aktif' : 'Nonaktif'}
        </button>
      </td>
      <td className="!whitespace-normal">
        {resetting ? (
          <span className="flex flex-wrap items-center gap-1.5">
            <input
              type="password"
              className="w-40 rounded-md border border-line bg-surf px-2 py-1"
              placeholder="Password baru"
              autoComplete="new-password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              autoFocus
            />
            <button
              className="btn btn-sm"
              disabled={pending}
              onClick={() =>
                run(
                  () => resetPassword({ userId: user.id, password: pw }),
                  () => {
                    setResetting(false);
                    setPw('');
                  },
                )
              }
            >
              Simpan
            </button>
            <button className="linkbtn" onClick={() => setResetting(false)}>
              Batal
            </button>
          </span>
        ) : (
          <span className="flex flex-wrap items-center gap-2">
            <button className="linkbtn" onClick={() => setResetting(true)}>
              Ganti password
            </button>
            {!user.isMe && (
              <button
                className="linkbtn !text-loss"
                disabled={pending}
                onClick={() => {
                  if (confirm(`Hapus user ${user.name}?`)) run(() => deleteUser({ userId: user.id }));
                }}
              >
                Hapus
              </button>
            )}
          </span>
        )}
        <Msg msg={msg} />
      </td>
    </tr>
  );
}

export function NewUserForm({ menus }: { menus: MenuOpt[] }) {
  const empty = { name: '', username: '', password: '', confirm: '' };
  const [f, setF] = useState(empty);
  const [role, setRole] = useState<Role>('STAFF');
  const [perms, setPerms] = useState<Menu[]>(['OPS', 'CS']);
  const { pending, msg, run } = useRun();
  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <form
      className="mt-2 flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () => createUser({ ...f, role, permissions: perms }),
          () => setF(empty),
        );
      }}
    >
      <div className="grid max-w-[860px] grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="field">
          <span>Nama</span>
          <input value={f.name} onChange={set('name')} placeholder="mis. Mbak Aris" required />
        </label>
        <label className="field">
          <span>ID login</span>
          <input value={f.username} onChange={set('username')} placeholder="mis. aris" autoComplete="off" autoCapitalize="none" required />
        </label>
        <label className="field">
          <span>Password</span>
          <input type="password" value={f.password} onChange={set('password')} autoComplete="new-password" placeholder="minimal 8 karakter" required />
        </label>
        <label className="field">
          <span>Ulangi password</span>
          <input type="password" value={f.confirm} onChange={set('confirm')} autoComplete="new-password" required />
        </label>
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <label className="field">
          <span>Peran</span>
          <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="STAFF">Staff</option>
            <option value="ADMIN">Admin</option>
          </select>
        </label>
        {role === 'STAFF' && (
          <div className="field">
            <span>Akses menu</span>
            <PermChecks menus={menus} value={perms} onChange={setPerms} />
          </div>
        )}
        <button className="btn" type="submit" disabled={pending}>
          Tambah user
        </button>
        <Msg msg={msg} />
      </div>
    </form>
  );
}
