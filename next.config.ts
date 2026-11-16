import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: [
    'playwright-core',
    '@browserbasehq/stagehand',
    'unpdf',
  ],
};

export default nextConfig;
