'use client';

import { useState, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/routing';
import { motion } from 'framer-motion';
import { ArrowRight, Package, Loader2 } from 'lucide-react';

const PRODUCT_TYPES = ['KNX', 'Buspro', 'Zigbee'] as const;

type Product = {
  id: string;
  title: string;
  slug: string;
  description: string;
  imageUrls: string[];
  productType: string;
  featured: boolean;
};

export default function ProductsPage() {
  const t = useTranslations('Products');
  const locale = useLocale();
  const isRTL = locale === 'ar' || locale === 'ku';
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<string>('');

  useEffect(() => {
    const params = new URLSearchParams();
    if (typeFilter) params.set('type', typeFilter);
    const qs = params.toString();
    fetch(`/api/products${qs ? `?${qs}` : ''}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.products) setProducts(data.products);
      })
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  }, [typeFilter]);

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-24">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-12"
        >
          <h1 className="text-3xl md:text-4xl font-bold mb-4">{t('title')}</h1>
          <p className="text-gray-400 text-lg max-w-2xl">{t('subtitle')}</p>
        </motion.div>

        <div className="flex flex-wrap gap-2 mb-8">
          <button
            type="button"
            onClick={() => setTypeFilter('')}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              !typeFilter
                ? 'bg-blue-600 text-white'
                : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
            }`}
          >
            {t('all')}
          </button>
          {PRODUCT_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setTypeFilter(type)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                typeFilter === type
                  ? 'bg-blue-600 text-white'
                  : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
              }`}
            >
              {type}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
            {products.map((p, i) => {
              const img = Array.isArray(p.imageUrls) && p.imageUrls.length > 0 ? p.imageUrls[0] : null;
              return (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08 }}
                >
                  <Link href={`/products/${p.slug}`} className="block group h-full">
                    <div className="rounded-2xl overflow-hidden bg-white/5 border border-white/10 hover:border-blue-500/30 transition-all duration-300 h-full flex flex-col">
                      <div className="aspect-[4/3] overflow-hidden bg-white/5 relative">
                        {img ? (
                          <img
                            src={img}
                            alt={p.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Package className="w-16 h-16 text-gray-600" />
                          </div>
                        )}
                        <div className="absolute top-3 left-3">
                          <span className="px-3 py-1 text-xs font-semibold bg-blue-600/90 text-white rounded-lg">
                            {p.productType}
                          </span>
                        </div>
                      </div>
                      <div className="p-5 flex-1 flex flex-col">
                        <h2 className="text-lg font-bold text-white mb-2 group-hover:text-blue-400 transition-colors line-clamp-2">
                          {p.title}
                        </h2>
                        <p className="text-gray-400 text-sm line-clamp-2 flex-1 mb-4">{p.description}</p>
                        <span className="inline-flex items-center gap-2 text-blue-400 font-medium text-sm group-hover:gap-3 transition-all">
                          {t('viewProduct')} <ArrowRight className="w-4 h-4" />
                        </span>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        )}

        {!loading && products.length === 0 && (
          <div className="text-center py-24 text-gray-500">
            <Package className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <p>{t('noProducts')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
