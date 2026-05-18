import { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  // GeoPackage preview: keep Node-native parsers external (WASM loaded from disk).
  serverExternalPackages: ['sql.js', 'wkx', 'proj4'],
  // sql.js loads sql-wasm.wasm at runtime; ensure it is copied into the serverless bundle (Vercel).
  outputFileTracingIncludes: {
    '/api/tickets/[id]/qfield-map-preview': [
      './node_modules/sql.js/dist/sql-wasm.wasm',
      './public/vendor/sql-wasm.wasm',
    ],
  },
  async headers() {
    return [
      {
        source: '/app/proviser.ipa',
        headers: [
          { key: 'Content-Type', value: 'application/octet-stream' },
          { key: 'Access-Control-Allow-Origin', value: '*' },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
