"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useDebounceValue } from "usehooks-ts";
import { LoadState, useApi } from "@/components/useApi";
import { n0, rp } from "@/lib/format";
import { ExpChip, SearchBox, sizeLabel } from "../ui";

const MAX = 15;
type StockResponse = {
  results: Array<{
    key: string;
    brand: string;
    product: string;
    skus: Array<any>;
  }>;
  info: Record<string, { expiredAt: string }>;
  today: string | null;
  warehouses: Array<{ id: string; name: string }>;
};

export default function Page() {
  return (
    <Suspense fallback={<p className="note mt-4">Memuat…</p>}>
      <Content />
    </Suspense>
  );
}

function Content() {
  const initialQuery = useSearchParams().get("q") ?? "";
  const [query, setQuery] = useState(initialQuery);
  const [debouncedQuery] = useDebounceValue(query, 700);
  const stock = useApi<StockResponse>(
    `/api/cs/stock?q=${encodeURIComponent(debouncedQuery)}`,
  );
  const data = stock.data;
  const loading = stock.loading;
  const error = stock.error;

  if (loading || error || !data)
    return <LoadState loading={loading} error={error} what="data stok" />;
  const res = data.results;

  return (
    <div className="panel">
      <h2 className="text-lg">Info stock</h2>
      <p className="sub">
        Cari nama varian atau brand. Stok yang tampil adalah jumlah semua gudang
        (sentuh / arahkan kursor ke angka untuk lihat per gudang).
      </p>
      <SearchBox
        value={query}
        onChange={setQuery}
        placeholder="Ketik varian atau brand, mis. alpha hmns"
      />
      <div className="mt-4 flex flex-col gap-3.5">
        {!query.trim() && (
          <p className="note">Hasil pencarian muncul di sini.</p>
        )}
        {query.trim() && !res.length && (
          <p className="note">Varian tidak ditemukan. Coba kata kunci lain.</p>
        )}
        {res.slice(0, MAX).map((v) => (
          <div key={v.key} className="cscard">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3>
                  {v.brand} · {v.product}
                </h3>
                <span className="ps">
                  {v.skus.length} size · total stok{" "}
                  {n0(v.skus.reduce((a, s) => a + Math.max(0, s.stock), 0))} pcs
                </span>
              </div>
              <ExpChip
                exp={data.info[v.key]?.expiredAt ?? ""}
                today={data.today ?? ""}
              />
            </div>
            <div className="tbl-wrap mt-3">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Size</th>
                    <th>SKU</th>
                    <th className="r">Stok semua gudang</th>
                    <th className="r">Harga jual</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {v.skus.map((s) => {
                    const qty = s.stock;
                    const tip = data.warehouses
                      .map(
                        (w) => `${w.name}: ${n0(s.perWarehouse?.[w.id] ?? 0)}`,
                      )
                      .join(" · ");
                    return (
                      <tr key={s.code}>
                        <td>
                          <b>{sizeLabel(s)}</b>{" "}
                          {s.category === "Fullsize" && (
                            <span className="chip chip-ch">Fullsize</span>
                          )}
                        </td>
                        <td>{s.code}</td>
                        <td className="r" title={tip}>
                          <b className={qty > 0 ? "text-profit" : "neg"}>
                            {n0(Math.max(0, qty))}
                          </b>
                          <div className="ps sm:hidden">{tip}</div>
                        </td>
                        <td className="r">{s.price ? rp(s.price) : "–"}</td>
                        <td>
                          {qty > 0 ? (
                            <span className="chip chip-ok">Ready</span>
                          ) : (
                            <span className="chip chip-bad">Habis</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
        {res.length > MAX && (
          <p className="note">
            Menampilkan {MAX} dari {res.length} varian. Perjelas kata kunci.
          </p>
        )}
      </div>
    </div>
  );
}
