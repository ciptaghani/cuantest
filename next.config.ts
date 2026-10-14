import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  // reference/cuan-lens.html hanya acuan; jangan sampai ikut ter-trace ke bundle standalone.
  outputFileTracingExcludes: { '*': ['reference/**', 'tests/**'] },
  experimental: {
    serverActions: { bodySizeLimit: '2mb' },
  },
};

export default nextConfig;
