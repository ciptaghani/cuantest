'use client';

import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto max-w-[640px] px-4 py-16 text-center">
      <h1 className="text-xl">Halaman tidak ditemukan</h1>
      <p className="note mt-2">
        <Link href="/" className="linkbtn">
          Kembali ke awal
        </Link>
      </p>
    </main>
  );
}
