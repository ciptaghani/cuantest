import type { Metadata } from 'next';
import { prisma } from '@/lib/db';
import { requireArea } from '@/lib/auth/guard';
import { MENUS } from '@/lib/auth/permissions';
import { DataTabs } from '../DataTabs';
import { NewUserForm, UserRow, type UserView } from './UserForms';

export const metadata: Metadata = { title: 'Akun & akses · Cuan Lens' };

export default async function AkunPage() {
  const me = await requireArea('ACCOUNTS');
  const users = await prisma.user.findMany({ include: { permissions: true }, orderBy: [{ role: 'asc' }, { name: 'asc' }] });
  const rows: UserView[] = users.map((u) => ({
    id: u.id,
    name: u.name,
    username: u.username,
    role: u.role,
    active: u.active,
    permissions: u.permissions.map((p) => p.menu),
    isMe: u.id === me.id,
  }));
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
