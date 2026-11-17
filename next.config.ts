import fs from 'node:fs';
import path from 'node:path';
import type { NextConfig } from 'next';

function hydrateDevEnvFromDotEnvLocal() {
  const envLocalPath = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envLocalPath)) return;

  const content = fs.readFileSync(envLocalPath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const eqIndex = line.indexOf('=');
    if (eqIndex <= 0) continue;

    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    } else {
      const commentIdx = value.search(/\s+#/);
      if (commentIdx !== -1) {
        value = value.slice(0, commentIdx).trim();
      }
    }

    const existing = process.env[key];
    const isPlaceholder =
      !existing || existing.includes('your-deployment');

    if (isPlaceholder && value) {
      process.env[key] = value;
    }
  }
}

hydrateDevEnvFromDotEnvLocal();

const nextConfig: NextConfig = {
  env: {
    ...(process.env.NEXT_PUBLIC_CONVEX_URL
      ? { NEXT_PUBLIC_CONVEX_URL: process.env.NEXT_PUBLIC_CONVEX_URL }
      : {}),
    ...(process.env.NEXT_PUBLIC_CONVEX_SITE_URL
      ? { NEXT_PUBLIC_CONVEX_SITE_URL: process.env.NEXT_PUBLIC_CONVEX_SITE_URL }
      : {}),
  },
  serverExternalPackages: [
    'playwright-core',
    '@browserbasehq/stagehand',
    'unpdf',
  ],
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        ignored: ['**/node_modules/**', '**/.git/**', '**/.playwright-cli/**'],
      };
    }
    return config;
  },
};

export default nextConfig;
