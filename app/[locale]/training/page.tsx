'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  GraduationCap,
  Server,
  Send,
  X,
  Loader2,
  CheckCircle2,
  Boxes,
  Users,
} from 'lucide-react';

type Service = {
  id: string;
  title: string;
  slug: string;
  description: string;
  content: string | null;
  category: string;
  icon: string;
  features: string[];
  trainingRequestCount: number;
};

const LOCALES = ['ar', 'en', 'ku', 'tr'] as const;

export default function TrainingPage() {
  const t = useTranslations('Index');
  const params = useParams();
  const localeFromRoute = typeof params?.locale === 'string' && LOCALES.includes(params.locale as (typeof LOCALES)[number])
    ? params.locale
    : 'en';
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [form, setForm] = useState({
    requesterName: '',
    requesterEmail: '',
    requesterPhone: '',
    company: '',
    message: '',
    budget: '',
  });

  const loadServices = () => {
    setLoading(true);
    fetch(`/api/training/services?locale=${encodeURIComponent(localeFromRoute)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.services) setServices(data.services);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadServices();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- effectiveLocale is the only reactive dep; loadServices reads it from closure
  }, [localeFromRoute]);

  const openRequestModal = (service: Service) => {
    setSelectedService(service);
    setForm({ requesterName: '', requesterEmail: '', requesterPhone: '', company: '', message: '', budget: '' });
    setMessage(null);
    setSuccess(false);
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedService) return;
    setMessage(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/training-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceSlug: selectedService.slug,
          serviceTitle: selectedService.title,
          serviceDesc: selectedService.description?.slice(0, 300) || null,
          requesterName: form.requesterName.trim(),
          requesterEmail: form.requesterEmail.trim(),
          requesterPhone: form.requesterPhone.trim(),
          company: form.company.trim() || null,
          message: form.message.trim() || null,
          budget: form.budget.trim() || null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess(true);
        setForm({ requesterName: '', requesterEmail: '', requesterPhone: '', company: '', message: '', budget: '' });
        loadServices();
      } else {
        setMessage({ type: 'error', text: data.message || t('training.submitError') });
      }
    } catch {
      setMessage({ type: 'error', text: t('training.submitError') });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white">
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-blue-500/5 via-transparent to-transparent pointer-events-none" />
        <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />
      </div>

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-20">
        <Link
          href="/#training"
          className="inline-flex items-center gap-2 text-gray-400 hover:text-white mb-8 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('training.backToHome') || 'Back to Home'}
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-16"
        >
          <div className="inline-flex items-center gap-2 mb-4 px-4 py-2 bg-blue-500/10 backdrop-blur-sm rounded-lg border border-blue-500/20">
            <GraduationCap className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-semibold uppercase tracking-wider text-blue-300">
              {t('training.subtitle')}
            </span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-white via-gray-100 to-gray-300 bg-clip-text text-transparent">
            {t('training.title')}
          </h1>
          <p className="text-lg text-gray-400 max-w-2xl">
            {t('training.desc')}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="mb-8 flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-4"
        >
          <Server className="w-6 h-6 text-cyan-400 shrink-0" />
          <p className="text-sm text-gray-300">
            {t('training.browseIntro')}
          </p>
        </motion.div>

        {loading ? (
          <div className="flex justify-center py-24">
            <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
          </div>
        ) : services.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-16 text-center">
            <Boxes className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400">{t('training.noServices')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {services.map((service, idx) => (
              <motion.div
                key={service.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="group rounded-2xl border border-white/10 bg-gradient-to-br from-white/5 to-transparent p-6 hover:border-blue-500/30 hover:shadow-lg hover:shadow-blue-500/10 transition-all duration-300"
              >
                <div className="mb-4 p-3 w-fit rounded-xl bg-blue-500/10 border border-blue-500/20">
                  <GraduationCap className="w-8 h-8 text-blue-400" />
                </div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="text-xl font-semibold text-white group-hover:text-blue-300 transition-colors flex-1">
                    {service.title}
                  </h3>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-cyan-500/20 text-cyan-400 text-xs font-medium shrink-0">
                    <Users className="w-3.5 h-3.5" />
                    {service.trainingRequestCount} {t('training.requestsCount')}
                  </span>
                </div>
                <p className="text-sm text-gray-400 line-clamp-3 mb-6 min-h-[3.75rem]">
                  {service.description || t('training.defaultBrief')}
                </p>
                <button
                  type="button"
                  onClick={() => openRequestModal(service)}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 rounded-xl font-medium text-sm uppercase tracking-wider transition-all hover:shadow-lg hover:shadow-blue-500/25"
                >
                  <Send className="w-4 h-4" />
                  {t('training.requestButton')}
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {modalOpen && selectedService && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
            onClick={() => !submitting && setModalOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-[#0f1419] border border-white/10 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl"
            >
              <div className="p-6 border-b border-white/10 flex items-center justify-between">
                <h2 className="text-xl font-semibold text-white">
                  {t('training.requestModalTitle')} — {selectedService.title}
                </h2>
                <button
                  type="button"
                  onClick={() => !submitting && setModalOpen(false)}
                  className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-white/10"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {success ? (
                <div className="p-8 text-center">
                  <CheckCircle2 className="w-16 h-16 text-emerald-400 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-white mb-2">{t('training.requestSubmitted')}</h3>
                  <p className="text-gray-400 mb-6">
                    {t('training.requestSubmittedDesc')}
                  </p>
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="px-6 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium"
                  >
                    {t('training.close')}
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                  {message && (
                    <div
                      className={`p-3 rounded-lg text-sm ${
                        message.type === 'error' ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'
                      }`}
                    >
                      {message.text}
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">{t('training.formName')}</label>
                    <input
                      type="text"
                      required
                      value={form.requesterName}
                      onChange={(e) => setForm((f) => ({ ...f, requesterName: e.target.value }))}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                      placeholder={t('training.formNamePlaceholder')}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">{t('training.formEmail')}</label>
                    <input
                      type="email"
                      required
                      value={form.requesterEmail}
                      onChange={(e) => setForm((f) => ({ ...f, requesterEmail: e.target.value }))}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                      placeholder={t('training.formEmailPlaceholder')}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">{t('training.formPhone')}</label>
                    <input
                      type="tel"
                      required
                      value={form.requesterPhone}
                      onChange={(e) => setForm((f) => ({ ...f, requesterPhone: e.target.value }))}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                      placeholder={t('training.formPhonePlaceholder')}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">{t('training.formCompany')}</label>
                    <input
                      type="text"
                      value={form.company}
                      onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                      placeholder={t('training.formCompanyPlaceholder')}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">{t('training.formBudget')}</label>
                    <input
                      type="text"
                      value={form.budget}
                      onChange={(e) => setForm((f) => ({ ...f, budget: e.target.value }))}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                      placeholder={t('training.formBudgetPlaceholder')}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">{t('training.formMessage')}</label>
                    <textarea
                      rows={3}
                      value={form.message}
                      onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none resize-none"
                      placeholder={t('training.formMessagePlaceholder')}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 disabled:opacity-60 rounded-xl font-medium text-sm uppercase tracking-wider transition-all"
                  >
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    {submitting ? t('training.submitting') : t('training.submitRequest')}
                  </button>
                </form>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
