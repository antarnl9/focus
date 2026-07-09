/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Worker deps (pg-boss, pg) must not be bundled into serverless functions.
  serverExternalPackages: ['pg', 'pg-boss'],
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        source: '/manifest.webmanifest',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=3600' }],
      },
    ];
  },
};

export default nextConfig;
