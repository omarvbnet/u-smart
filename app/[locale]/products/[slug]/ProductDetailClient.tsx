'use client';

import { useState } from 'react';
import { Link } from '@/i18n/routing';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Package,
  FileText,
  Loader2,
  X,
  CheckCircle,
  ExternalLink,
} from 'lucide-react';

type Product = {
  id: string;
  title: string;
  slug: string;
  description: string;
  specifications: unknown;
  userManualUrl: string | null;
  imageUrls: string[];
  productType: string;
};

type ProductDetailClientProps = {
  product: Product;
  locale: string;
  orderLabel: string;
  orderSuccess: string;
  orderError: string;
  specLabel: string;
  manualLabel: string;
  nameLabel: string;
  emailLabel: string;
  phoneLabel: string;
  messageLabel: string;
  submitLabel: string;
  loadingLabel: string;
};

export default function ProductDetailClient({
  product,
  locale,
  orderLabel,
  orderSuccess,
  orderError,
  specLabel,
  manualLabel,
  nameLabel,
  emailLabel,
  phoneLabel,
  messageLabel,
  submitLabel,
  loadingLabel,
}: ProductDetailClientProps) {
  const isRTL = locale === 'ar' || locale === 'ku';
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [form, setForm] = useState({ name: '', email: '', phone: '', message: '' });

  const specs =
    product.specifications != null
      ? typeof product.specifications === 'object' && !Array.isArray(product.specifications)
        ? Object.entries(product.specifications as Record<string, unknown>)
        : Array.isArray(product.specifications)
          ? (product.specifications as Array<{ key?: string; label?: string; value?: string }>).map((s) =>
              [s.key ?? s.label ?? '—', s.value ?? '']
            )
          : []
      : [];

  const images = Array.isArray(product.imageUrls) ? product.imageUrls : [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitStatus('loading');
    try {
      const res = await fetch('/api/product-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: product.id,
          productSlug: product.slug,
          productTitle: product.title,
          productType: product.productType,
          name: form.name,
          email: form.email,
          phone: form.phone,
          message: form.message || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSubmitStatus('success');
        setForm({ name: '', email: '', phone: '', message: '' });
      } else {
        setSubmitStatus('error');
      }
    } catch {
      setSubmitStatus('error');
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-24">
        <Link
          href="/products"
          className="inline-flex items-center gap-2 text-gray-400 hover:text-white mb-8 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {isRTL ? 'المنتجات' : 'Products'}
        </Link>

        {/* Hero: main image + CTA */}
        <div className="grid md:grid-cols-2 gap-8 mb-12">
          <motion.div
            initial={{ opacity: 0, x: isRTL ? 20 : -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="relative rounded-2xl overflow-hidden bg-white/5 border border-white/10 aspect-[4/3] md:aspect-square"
          >
            {images.length > 0 ? (
              <img
                src={images[0]}
                alt={product.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Package className="w-24 h-24 text-gray-600" />
              </div>
            )}
            <div className="absolute top-4 left-4">
              <span className="px-3 py-1.5 text-sm font-semibold bg-blue-600/90 text-white rounded-xl">
                {product.productType}
              </span>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: isRTL ? -20 : 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex flex-col justify-center"
          >
            <h1 className="text-3xl md:text-4xl font-bold mb-4">{product.title}</h1>
            <p className="text-gray-400 text-lg leading-relaxed mb-8">{product.description}</p>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setShowOrderModal(true)}
              className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-lg font-semibold text-white shadow-lg shadow-blue-500/30 transition-all"
            >
              <Package className="w-5 h-5" />
              {orderLabel}
            </motion.button>
            <p className="text-sm text-gray-500 mt-3">
              {isRTL ? 'بدون سعر – اطلب عرض أسعار' : 'No price – request a quote'}
            </p>
          </motion.div>
        </div>

        {/* Gallery */}
        {images.length > 1 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-12">
            {images.slice(1, 7).map((url, i) => (
              <div
                key={i}
                className="aspect-square rounded-xl overflow-hidden bg-white/5 border border-white/10"
              >
                <img src={url} alt="" className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
        )}

        {/* Specifications */}
        {specs.length > 0 && (
          <div className="rounded-2xl bg-white/5 border border-white/10 p-6 md:p-8 mb-12">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-400" />
              {specLabel}
            </h2>
            <dl className="grid sm:grid-cols-2 gap-4">
              {specs.map(([key, val]) => (
                <div key={String(key)} className="flex justify-between gap-4 py-2 border-b border-white/5">
                  <dt className="text-gray-400">{String(key)}</dt>
                  <dd className="text-white font-medium">{String(val)}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        {/* User manual */}
        {product.userManualUrl && (
          <div className="rounded-2xl bg-white/5 border border-white/10 p-6 md:p-8">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-400" />
              {manualLabel}
            </h2>
            <a
              href={product.userManualUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-blue-400 hover:text-blue-300 font-medium"
            >
              {manualLabel} <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        )}
      </div>

      {/* Order modal */}
      <AnimatePresence>
        {showOrderModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => submitStatus !== 'loading' && setShowOrderModal(false)}
              className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
            >
              <div
                className="w-full max-w-md rounded-2xl bg-[#0A0A0F] border border-white/10 shadow-2xl p-6 md:p-8 pointer-events-auto"
                onClick={(e) => e.stopPropagation()}
                dir={isRTL ? 'rtl' : 'ltr'}
              >
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold">{orderLabel} – {product.title}</h3>
                  {submitStatus !== 'loading' && (
                    <button
                      type="button"
                      onClick={() => setShowOrderModal(false)}
                      className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  )}
                </div>

                {submitStatus === 'success' ? (
                  <div className="text-center py-8">
                    <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                    <p className="text-lg text-gray-300 mb-6">{orderSuccess}</p>
                    <button
                      type="button"
                      onClick={() => setShowOrderModal(false)}
                      className="px-6 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium"
                    >
                      {isRTL ? 'إغلاق' : 'Close'}
                    </button>
                  </div>
                ) : submitStatus === 'error' ? (
                  <div className="text-center py-8">
                    <p className="text-red-400 mb-6">{orderError}</p>
                    <button
                      type="button"
                      onClick={() => setSubmitStatus('idle')}
                      className="px-6 py-2 rounded-xl bg-gray-700 hover:bg-gray-600 text-white font-medium"
                    >
                      {isRTL ? 'إعادة المحاولة' : 'Try again'}
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-1">{nameLabel} *</label>
                      <input
                        type="text"
                        value={form.name}
                        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                        className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                        required
                        placeholder={nameLabel}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-1">{emailLabel} *</label>
                      <input
                        type="email"
                        value={form.email}
                        onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                        className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                        required
                        placeholder="email@example.com"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-1">{phoneLabel} *</label>
                      <input
                        type="tel"
                        value={form.phone}
                        onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                        className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                        required
                        placeholder="+964 ..."
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-1">{messageLabel}</label>
                      <textarea
                        value={form.message}
                        onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                        className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none"
                        rows={3}
                        placeholder={messageLabel}
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={submitStatus === 'loading'}
                      className="w-full py-4 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-semibold disabled:opacity-70 flex items-center justify-center gap-2"
                    >
                      {submitStatus === 'loading' ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          {loadingLabel}
                        </>
                      ) : (
                        submitLabel
                      )}
                    </button>
                  </form>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
