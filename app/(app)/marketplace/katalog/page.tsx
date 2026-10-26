'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import type { SP } from '@/components/qs';
import { ProfitPage } from '../ProfitPage';

export default function Page() {
  return (
    <Suspense fallback={<p className="note mt-4">Memuat…</p>}>
      <Content />
    </Suspense>
  );
}

function Content() {
  const usp = useSearchParams();
  const sp: SP = Object.fromEntries(usp.entries());
  return <ProfitPage kind="kat" sp={sp} />;
}
