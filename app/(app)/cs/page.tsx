import { ComingSoon } from '@/components/ComingSoon';
import { requireArea } from '@/lib/auth/guard';

export default async function Page() {
  await requireArea('CS');
  return <ComingSoon title="CS" phase="Fase 8" items={['Info stock', 'Info barang', 'Input info barang']} />;
}
