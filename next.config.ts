import { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
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
