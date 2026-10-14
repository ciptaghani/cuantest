import { requireUser } from '@/lib/auth/guard';
import { canAccess, type Area } from '@/lib/auth/permissions';
import { NoAccess } from './NoAccess';

/** Dipakai di layout tiap menu: cek izin di server, bukan sekadar menyembunyikan menu. */
export async function AreaGate({ area, children }: { area: Area; children: React.ReactNode }) {
  const user = await requireUser();
  if (!canAccess(user, area)) return <NoAccess />;
  return <>{children}</>;
}
