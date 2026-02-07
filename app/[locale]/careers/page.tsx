'use client';

import { useState, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/routing';
import { motion } from 'framer-motion';
import { ArrowLeft, Briefcase, MapPin, Building, Clock, ArrowRight } from 'lucide-react';

type Career = {
  id: string;
  title: string;
  slug: string;
  description: string;
  department: string;
  location: string;
  jobType: string;
};

const JOB_TYPE_LABELS: Record<string, string> = {
  FULL_TIME: 'Full-time',
  PART_TIME: 'Part-time',
  CONTRACT: 'Contract',
  INTERNSHIP: 'Internship',
  REMOTE: 'Remote',
};

export default function CareersPage() {
  const t = useTranslations('Index');
  const locale = useLocale();
  const [careers, setCareers] = useState<Career[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/careers?locale=${encodeURIComponent(locale)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.careers) setCareers(data.careers);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [locale]);

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-20">
        <Link
          href="/#careers"
          className="inline-flex items-center gap-2 text-gray-400 hover:text-white mb-8 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('careers.backToHome') || 'Back to Home'}
        </Link>

        <div className="mb-12">
          <h1 className="text-4xl font-bold mb-4">{t('careers.title')}</h1>
          <p className="text-gray-400 text-lg">{t('careers.tagline')}</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-24">
            <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : careers.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-16 text-center">
            <Briefcase className="w-16 h-16 text-gray-500 mx-auto mb-4" />
            <p className="text-gray-400">{t('careers.noJobs') || 'No open positions at the moment.'}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {careers.map((job, i) => (
              <motion.div
                key={job.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <Link
                  href={`/careers/${job.slug}`}
                  className="block rounded-2xl border border-white/10 bg-white/5 p-6 hover:border-blue-500/30 hover:bg-white/10 transition-all"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="flex-1">
                      <h2 className="text-xl font-semibold text-white mb-2">{job.title}</h2>
                      <p className="text-gray-400 text-sm line-clamp-2 mb-4">{job.description}</p>
                      <div className="flex flex-wrap gap-4 text-sm text-gray-500">
                        <span className="flex items-center gap-1.5">
                          <Building className="w-4 h-4" />
                          {job.department}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <MapPin className="w-4 h-4" />
                          {job.location}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Clock className="w-4 h-4" />
                          {JOB_TYPE_LABELS[job.jobType] ?? job.jobType}
                        </span>
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-2 text-blue-400 font-medium shrink-0">
                      {t('careers.apply')}
                      <ArrowRight className="w-4 h-4" />
                    </span>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
