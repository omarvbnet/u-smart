import { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  /* خيارات الإعداد الأخرى هنا إذا وجدت */
};

export default withNextIntl(nextConfig);
