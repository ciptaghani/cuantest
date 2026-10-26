import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'export',
  poweredByHeader: false,
  // reference/cuan-lens.html hanya acuan; jangan sampai ikut ter-trace.
  outputFileTracingExcludes: { '*': ['reference/**', 'tests/**'] },
};

export default nextConfig;
