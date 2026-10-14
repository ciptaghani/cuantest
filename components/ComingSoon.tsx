export function ComingSoon({ title, phase, items }: { title: string; phase: string; items: string[] }) {
  return (
    <div className="panel">
      <h2 className="text-xl">{title}</h2>
      <p className="note">Halaman ini dibangun di {phase}. Logika perhitungannya sudah tersedia di server.</p>
      <ul className="mt-3 list-disc pl-5 text-sm text-muted">
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </div>
  );
}
