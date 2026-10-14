export function NoAccess({ title = 'Kamu tidak punya akses ke menu ini' }: { title?: string }) {
  return (
    <div className="panel mx-auto mt-6 max-w-xl text-center">
      <h2 className="text-lg">{title}</h2>
      <p className="note">Minta admin mencentang menu ini di Data → Akun & akses.</p>
    </div>
  );
}
