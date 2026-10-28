'use client';

import { Suspense } from 'react';
import { LoadState, useApi } from '@/components/useApi';
import type { CurrentUser } from '@/lib/auth/guard';
import { MENUS } from '@/lib/auth/permissions';
import { DataTabs } from '../DataTabs';
import { NewUserForm, UserRow, type UserView } from './UserForms';

export default function AkunPage() {
  return (
    <Suspense fallback={<p className="note mt-4">Memuat…</p>}>
      <Content />
    </Suspense>
  );
}

function Content() {
  const me = useApi<{ user: CurrentUser }>('/api/auth/me');
  const users = useApi<UserView[]>('/api/accounts/users');
  const loading = me.loading || users.loading;
  const error = me.error || users.error;

  if (loading || error || !me.data || !users.data) return <LoadState loading={loading} error={error} what="daftar akun" />;

  const rows: UserView[] = users.data.map((u) => ({ ...u, isMe: u.id === me.data!.user.id }));
  const menus = MENUS.map((m) => ({ key: m.key, label: m.label }));
  return (
    <>
      <DataTabs />
      <div className="panel">
        <h2 className="text-xl">Akun & akses</h2>
        <p className="note !mt-0.5">Buat ID dan password untuk tim, lalu atur menu mana yang boleh dibuka tiap orang. Admin bisa membuka semua menu termasuk halaman ini.</p>
        <div className="tbl-wrap mt-4">
          <table className="tbl">
            <thead>
              <tr>
                <th>Nama</th>
                <th>ID login</th>
                <th>Peran</th>
                <th>Akses menu</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <UserRow key={u.id} user={u} menus={menus} />
              ))}
            </tbody>
          </table>
        </div>
        <h3 className="mt-6 text-base">Tambah user</h3>
        <NewUserForm menus={menus} />
        <p className="note mt-6">
          Login dicek di server pada setiap permintaan. Password disimpan sebagai hash bcrypt. Menonaktifkan user atau mengganti password langsung mengeluarkan user itu dari semua
          perangkat.
        </p>
      </div>
    </>
  );
}
