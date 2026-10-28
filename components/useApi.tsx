'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { todayKey } from '@/lib/date';
import { buildOpsModel, type OpsInput, type OpsModel } from '@/lib/ops';
import { learnRates, type MarketplaceData, type StoreRate } from '@/lib/marketplace';

/** GET ke backend Express dari browser (cookie JWT `cl_token` terkirim otomatis). */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => {
    setData(null);
    setError('');
    setTick((t) => t + 1);
  }, []);
  useEffect(() => {
    if (!path) return;
    let live = true;
    apiFetch<T>(path).then(
      (d) => {
        if (live) setData(d);
      },
      (e) => {
        if (live) setError(e instanceof Error ? e.message : 'Gagal memuat data.');
      },
    );
    return () => {
      live = false;
    };
  }, [path, tick]);
  return { data, error, loading: !data && !error, refresh };
}

/** Loader generik untuk komputasi klien di atas data backend (mis. loadMpView). */
export function useLoader<T>(load: () => Promise<T>, key: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    setData(null);
    setError('');
    load().then(
      (d) => {
        if (live) setData(d);
      },
      (e) => {
        if (live) setError(e instanceof Error ? e.message : 'Gagal memuat data.');
      },
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { data, error, loading: !data && !error };
}

/** Model operasional (dibangun lokal karena berisi fungsi). */
export function useOpsModel() {
  const { data: raw, error, loading } = useApi<OpsInput>('/api/ops/model');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const m = useMemo(() => (raw ? buildOpsModel({ ...raw, today: todayKey() }) : null), [JSON.stringify(raw)]);
  return { m, error, loading };
}

/** Data marketplace + tarif hasil belajar + target margin. */
export function useMarketplace() {
  const data = useApi<MarketplaceData>('/api/marketplace/data');
  const target = useApi<{ targetMargin: number }>('/api/marketplace/target-margin');
  const loading = data.loading || target.loading;
  const error = data.error || target.error;
  if (loading || error || !data.data || !target.data) return { data: null, rates: null as Record<string, StoreRate> | null, target: 0, error, loading };
  return { data: data.data, rates: learnRates(data.data), target: target.data.targetMargin, error, loading };
}

/** Status muat halaman klien. */
export function LoadState({ loading, error, what = 'data' }: { loading: boolean; error: string; what?: string }) {
  if (loading) return <p className="note mt-4">Memuat {what}…</p>;
  if (error)
    return (
      <p className="note mt-4 !text-loss" role="alert">
        {error}
      </p>
    );
  return null;
}
