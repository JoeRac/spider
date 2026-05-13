import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  experimental: {
    // Server actions get generous body limits for inline image paste in the editor.
    serverActions: { bodySizeLimit: '10mb' },
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.public.blob.vercel-storage.com' },
      { protocol: 'https', hostname: '**.googleusercontent.com' },
    ],
  },
};

export default config;
