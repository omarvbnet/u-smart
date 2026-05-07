'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { Loader2, MapPin } from 'lucide-react';

type ApiSite = {
  siteId?: string | null;
  location?: string | null;
  province?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

export default function PublicSiteVisitPage() {
  const params = useParams();
  const t = useTranslations('SiteVisit');
  const token = typeof params?.token === 'string' ? params.token : '';
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [site, setSite] = useState<ApiSite | null>(null);
  const [validUntil, setValidUntil] = useState<string | null>(null);
  const [accessNote, setAccessNote] = useState('');

  useEffect(() => {
    if (!token) {
      setError('invalid');
      setLoading(false);
      return;
    }
    let cancelled = false;
    fetch(`/api/public/site-visit/${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.success && data.site) {
          setSite(data.site);
          setValidUntil(typeof data.validUntil === 'string' ? data.validUntil : null);
          const d =
            data.access?.disclaimer && typeof data.access.disclaimer === 'string'
              ? data.access.disclaimer
              : '';
          setAccessNote(d);
        } else {
          setError(data.message || 'invalid');
        }
      })
      .catch(() => {
        if (!cancelled) setError('invalid');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center text-white">
        <Loader2 className="w-10 h-10 text-indigo-400 animate-spin" />
      </div>
    );
  }

  if (error || !site) {
    return (
      <div className="min-h-screen bg-[#0A0A0F] text-white flex flex-col items-center justify-center px-4">
        <p className="text-gray-300 text-center max-w-md">{t('invalid')}</p>
        <Link href="/" className="mt-6 text-indigo-400 hover:text-indigo-300 underline">
          {t('home')}
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white py-10 px-4 sm:px-6">
      <div className="max-w-lg mx-auto w-full">
        <p className="text-xs uppercase tracking-widest text-indigo-300/90 mb-1">{t('subtitle')}</p>
        <h1 className="text-2xl sm:text-3xl font-bold mb-6 flex items-center gap-2">
          <MapPin className="w-7 h-7 text-indigo-400 shrink-0" />
          {t('title')}
        </h1>

        <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.07] to-transparent p-4 sm:p-5 space-y-4 shadow-lg shadow-black/30">
          <div>
            <p className="text-xs text-gray-500 mb-0.5">{t('siteIdLabel')}</p>
            <p className="text-lg font-semibold">{site.siteId ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-0.5">{t('location')}</p>
            <p className="text-gray-200">{site.location ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-0.5">{t('province')}</p>
            <p className="text-gray-200">{site.province ?? '—'}</p>
          </div>
          {site.latitude != null && site.longitude != null && (
            <div>
              <p className="text-xs text-gray-500 mb-0.5">{t('coordinates')}</p>
              <p className="text-gray-400 text-sm font-mono">
                {Number(site.latitude).toFixed(5)}, {Number(site.longitude).toFixed(5)}
              </p>
            </div>
          )}
          {validUntil && (
            <div className="pt-2 border-t border-white/10">
              <p className="text-xs text-gray-500 mb-0.5">{t('validUntil')}</p>
              <p className="text-amber-200/90 text-sm">
                {new Date(validUntil).toLocaleString()}
              </p>
            </div>
          )}
        </div>

        <p className="mt-5 text-sm text-gray-500 leading-relaxed">{accessNote || t('previewOnly')}</p>

        <Link href="/" className="inline-block mt-8 text-indigo-400 hover:text-indigo-300 font-medium">
          ← {t('home')}
        </Link>
      </div>
    </div>
  );
}
