import Link from 'next/link';

/** Kotak angka ringkas (kpi() di HTML). Dengan `href` jadi tombol filter. */
export function Kpi({ label, value, cls = '', href, on }: { label: React.ReactNode; value: React.ReactNode; cls?: '' | 'ok' | 'mid' | 'bad'; href?: string; on?: boolean }) {
  const body = (
    <>
      <span className="k">{label}</span>
      <span className="v">{value}</span>
    </>
  );
  const c = `kp ${cls} ${on ? 'on' : ''}`;
  return href ? (
    <Link href={href} scroll={false} className={c} aria-current={on ? 'true' : undefined}>
      {body}
    </Link>
  ) : (
    <div className={c}>{body}</div>
  );
}

export function Chip({ cls, children }: { cls: 'ok' | 'mid' | 'bad' | 'ch'; children: React.ReactNode }) {
  return <span className={`chip chip-${cls} mr-0.5`}>{children}</span>;
}

/** Panel kosong dengan judul & penjelasan. */
export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="px-5 py-10 text-center text-muted">
      <h3 className="mb-1.5 text-lg text-ink">{title}</h3>
      {children}
    </div>
  );
}
