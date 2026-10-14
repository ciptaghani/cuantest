import { AreaGate } from '@/components/AreaGate';

export default function Layout({ children }: { children: React.ReactNode }) {
  return <AreaGate area="DATA">{children}</AreaGate>;
}
