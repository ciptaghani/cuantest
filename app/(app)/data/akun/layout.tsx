'use client';

import { ClientGate } from '@/components/ClientGate';

export default function Layout({ children }: { children: React.ReactNode }) {
  return <ClientGate area="ACCOUNTS">{children}</ClientGate>;
}
