'use client';

/** Cetak laporan / simpan sebagai PDF lewat dialog cetak browser (navigasi & filter disembunyikan saat cetak). */
export function PrintBtn() {
  return (
    <button type="button" className="btn-ghost btn-sm" onClick={() => window.print()}>
      Cetak / PDF
    </button>
  );
}
