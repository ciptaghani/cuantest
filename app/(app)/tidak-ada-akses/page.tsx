import { NoAccess } from '@/components/NoAccess';
import { requireUser } from '@/lib/auth/guard';
import { firstAllowedPath } from '@/lib/auth/permissions';

export default async function Page() {
  const user = await requireUser();
  return firstAllowedPath(user) === '/tidak-ada-akses' ? <NoAccess title="Akun kamu belum diberi akses ke menu apa pun" /> : <NoAccess />;
}
