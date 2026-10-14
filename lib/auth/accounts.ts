import type { Role } from './permissions';

export interface UserLite {
  id: string;
  role: Role;
  active: boolean;
}

export type UserChange = { userId: string } & ({ kind: 'role'; role: Role } | { kind: 'active'; active: boolean } | { kind: 'delete' });

/** True kalau perubahan ini membuat tidak ada lagi admin aktif. */
export function removesLastAdmin(users: UserLite[], change: UserChange): boolean {
  const after = users
    .map((u) => {
      if (u.id !== change.userId) return u;
      if (change.kind === 'delete') return null;
      if (change.kind === 'role') return { ...u, role: change.role };
      return { ...u, active: change.active };
    })
    .filter((u): u is UserLite => !!u);
  const before = users.filter((u) => u.role === 'ADMIN' && u.active).length;
  const remain = after.filter((u) => u.role === 'ADMIN' && u.active).length;
  return before > 0 && remain === 0;
}
