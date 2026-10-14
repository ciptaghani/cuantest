export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true" className="flex-none">
      <rect x="2" y="16" width="5" height="10" rx="1.5" fill="var(--c-hpp)" />
      <rect x="9" y="10" width="5" height="16" rx="1.5" fill="var(--c-fee)" />
      <rect x="16" y="4" width="5" height="22" rx="1.5" fill="var(--profit)" />
      <circle cx="24" cy="6" r="3" fill="var(--ink)" />
    </svg>
  );
}
