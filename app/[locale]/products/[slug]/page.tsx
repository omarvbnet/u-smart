import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/prisma';
import ProductDetailClient from './ProductDetailClient';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://usmart-iot.com';

type Props = {
  params: Promise<{ slug: string; locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, locale } = await params;
  const normalizedSlug = slug?.toLowerCase().trim() || '';
  const product = await prisma.product.findUnique({
    where: { slug: normalizedSlug },
  });

  if (!product) return { title: 'Product Not Found' };

  const imageUrl = Array.isArray(product.imageUrls) && product.imageUrls.length > 0 ? product.imageUrls[0] : null;
  const ogImage = imageUrl ? (imageUrl.startsWith('http') ? imageUrl : `${SITE_URL}${imageUrl}`) : `${SITE_URL}/logo/usmart.PNG`;

  type TranslationsMap = Record<string, { title?: string; description?: string }>;
  const translations = (product.translations as TranslationsMap | null) ?? {};
  const loc = translations[locale];
  const metaTitle = (loc?.title?.trim() || product.title) as string;
  const metaDesc = (loc?.description?.trim() || product.description || '').slice(0, 160);
  const title = `${metaTitle} | U Smart Products`;
  const description = metaDesc;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [{ url: ogImage, width: 1200, height: 630, alt: metaTitle }],
      type: 'website',
      siteName: 'U Smart',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage],
    },
  };
}

export default async function ProductDetailPage({ params }: Props) {
  const { slug, locale } = await params;
  const normalizedSlug = slug?.toLowerCase().trim() || '';

  const product = await prisma.product.findUnique({
    where: { slug: normalizedSlug },
  });

  if (!product) notFound();

  const t = await getTranslations('Products');

  // Resolve localized content from translations
  type TranslationsMap = Record<string, { title?: string; description?: string; specifications?: unknown }>;
  const translations = (product.translations as TranslationsMap | null) ?? {};
  const loc = translations[locale];
  const title = (loc?.title?.trim() || product.title) as string;
  const description = (loc?.description?.trim() || product.description) as string;
  const specifications = (loc?.specifications ?? product.specifications) as unknown;

  const serialized = {
    ...product,
    title,
    description,
    specifications,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };

  return (
    <ProductDetailClient
      product={serialized}
      locale={locale}
      orderLabel={t('orderNow')}
      orderSuccess={t('orderSuccess')}
      orderError={t('orderError')}
      specLabel={t('specifications')}
      manualLabel={t('userManual')}
      nameLabel={t('nameLabel')}
      emailLabel={t('emailLabel')}
      phoneLabel={t('phoneLabel')}
      messageLabel={t('messageLabel')}
      submitLabel={t('submitOrder')}
      loadingLabel={t('sending')}
    />
  );
}
