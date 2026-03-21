'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/routing';
import { ArrowLeft, Boxes, FolderOpen, Cpu, CheckCircle2, XCircle, Send, X, Code, Smartphone, Terminal, Database, Server, Layers, Cable, LayoutGrid, Package, GitMerge, Map, FileCheck, Wrench, LayoutDashboard, ClipboardCheck, Eye, ShieldCheck, FileSearch, Activity, Loader2, Apple, Zap, Ruler } from 'lucide-react';
import { uploadWithProgress } from '@/lib/upload-with-progress';


const LOCALES = ['ar', 'en', 'ku', 'tr'];
const SMART_HOME_SLUG = 'smart-home-automation';
const ENTERPRISE_NETWORKING_SLUG = 'enterprise-networking';
const QUALITY_CONTROL_SLUG = 'quality-control-supervision';
const CLEAN_ENERGY_SLUG = 'clean-energy';
const PROGRAMMING_SLUGS = ['custom-software', 'programming'] as const;
const TECH_KEYS = ['knx', 'buspro', 'zigbee'] as const;
const PROGRAMMING_TECH_KEYS = ['nodejs', 'flutter', 'python', 'mysql', 'postgresql', 'nosql'] as const;
const BUILDING_TYPES = ['home', 'villa', 'hotel', 'complex', 'other'] as const;

const PROGRAMMING_ICONS: Record<string, typeof Code> = {
  nodejs: Code,
  flutter: Smartphone,
  python: Terminal,
  mysql: Database,
  postgresql: Server,
  nosql: Layers,
};

const ENTERPRISE_NETWORKING_TECH_KEYS = ['maintenance', 'fiber', 'cable_systemization', 'closures', 'splice', 'qgis', 'asbuilt_design'] as const;
const ENTERPRISE_NETWORKING_ICONS: Record<string, typeof Cable> = {
  fiber: Cable,
  cable_systemization: LayoutGrid,
  closures: Package,
  splice: GitMerge,
  qgis: Map,
  asbuilt_design: FileCheck,
  maintenance: Wrench,
};

const QUALITY_CONTROL_KEYS = ['inspection', 'supervision', 'hse', 'investigation', 'tracking'] as const;
const QUALITY_CONTROL_ICONS: Record<string, typeof ClipboardCheck> = {
  inspection: ClipboardCheck,
  supervision: Eye,
  hse: ShieldCheck,
  investigation: FileSearch,
  tracking: Activity,
};

const ANDROID_APP_URL = process.env.NEXT_PUBLIC_QC_APP_ANDROID_URL || '/app/usmart_qc.apk';
// iOS OTA install: itms-services link points to our manifest, which references the IPA. Override with NEXT_PUBLIC_QC_APP_IOS_URL for custom install link.
function getIosInstallLink(): string {
  const custom = process.env.NEXT_PUBLIC_QC_APP_IOS_URL;
  if (custom) return custom;
  let siteUrl = '';
  if (typeof window !== 'undefined') {
    siteUrl = window.location.origin;
  } else {
    const base = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || 'usmart-iot.com';
    siteUrl = base.startsWith('http') ? base : `https://${base}`.replace(/\/$/, '');
  }
  if (siteUrl) {
    return `itms-services://?action=download-manifest&url=${encodeURIComponent(`${siteUrl}/api/app/ios-manifest`)}`;
  }
  return '';
}

function QcAppDownloadSection({ t }: { t: (key: string) => string }) {
  const [platform, setPlatform] = useState<'ios' | 'android' | 'desktop'>('desktop');
  const [iosLink, setIosLink] = useState<string>(() => getIosInstallLink());
  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    const ua = navigator.userAgent;
    if (/iPhone|iPad|iPod/.test(ua)) setPlatform('ios');
    else if (/Android/.test(ua)) setPlatform('android');
    else setPlatform('desktop');
    setIosLink(getIosInstallLink());
  }, []);
  const showAndroid = platform === 'android' || platform === 'desktop';
  const showIOS = platform === 'ios' || platform === 'desktop';
  const hasAndroid = Boolean(ANDROID_APP_URL);
  const hasIOS = true; // iOS OTA always available via manifest
  if (!hasAndroid && !hasIOS) return null;
  return (
    <div className="mt-8 pt-8 border-t border-amber-500/20">
      <p className="text-sm text-gray-400 mb-4">{t('qualityControlTechnologies.appDownloadDescription')}</p>
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
        {showAndroid && hasAndroid && (
          <a
            href={ANDROID_APP_URL}
            download
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600/80 hover:bg-emerald-500 text-white font-medium rounded-xl transition-colors"
          >
            <Smartphone className="w-5 h-5" />
            {t('qualityControlTechnologies.downloadAndroid')}
          </a>
        )}
        {showIOS && hasIOS && (
          <a
            href={iosLink || '#'}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-800/80 hover:bg-gray-700 text-white font-medium rounded-xl border border-white/20 transition-colors"
          >
            <Apple className="w-5 h-5" />
            {t('qualityControlTechnologies.downloadIOS')}
          </a>
        )}
      </div>
    </div>
  );
}

type Service = {
  id: string;
  title: string;
  slug: string;
  description: string;
  content: string | null;
  category: string;
  icon: string;
  priceRange: string | null;
  duration: string | null;
  features: string[];
  imageUrl: string | null;
};

type Project = {
  id: string;
  title: string;
  slug: string;
  description: string;
  category: string;
  imageUrl: string | null;
  status: string;
  year: number;
  client?: string | null;
  user?: { name: string | null } | null;
};

export default function ServiceDetailPage() {
  const params = useParams();
  const t = useTranslations('Index');
  const locale = useLocale();
  const slug = typeof params.slug === 'string' ? params.slug : '';
  const isRtl = locale === 'ar' || locale === 'ku';
  const showTechnologies = slug === SMART_HOME_SLUG;
  const showProgrammingTechnologies = (PROGRAMMING_SLUGS as readonly string[]).includes(slug);
  const showEnterpriseNetworkingTechnologies = slug === ENTERPRISE_NETWORKING_SLUG;
  const showQualityControlTechnologies = slug === QUALITY_CONTROL_SLUG;
  const showCleanEnergyTechnologies = slug === CLEAN_ENERGY_SLUG;
  const showDashboardButtons = showEnterpriseNetworkingTechnologies || showQualityControlTechnologies;
  const showRequestButton = showTechnologies || showProgrammingTechnologies || showEnterpriseNetworkingTechnologies || showQualityControlTechnologies || showCleanEnergyTechnologies;
  const [service, setService] = useState<Service | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [requestForm, setRequestForm] = useState({ buildingType: 'home', phone: '', province: '', technique: 'knx', name: '', company: '' });
  const [programmingForm, setProgrammingForm] = useState({ phone: '', province: '', technique: 'nodejs' as string, name: '', company: '' });
  const [enterpriseForm, setEnterpriseForm] = useState({
    siteName: '',
    siteCoordinator: '',
    slaHours: 24,
    technique: 'maintenance',
    name: '',
    company: '',
    phone: '',
    province: '',
  });
  const [cleanEnergyForm, setCleanEnergyForm] = useState({ phone: '', email: '', currentAmps: '', kwh: '' });
  const [designForm, setDesignForm] = useState({ currentAmps: '', kwh: '' });
  const [pricePerWattCents, setPricePerWattCents] = useState<number>(50);
  const [createDashboardForm, setCreateDashboardForm] = useState({
    companyName: '',
    pocName: '',
    pocEmail: '',
    pocPhone: '',
    certificateUrl: '',
  });
  const [createDashboardSubmitting, setCreateDashboardSubmitting] = useState(false);
  const [certificateUploading, setCertificateUploading] = useState(false);
  const [certificateUploadProgress, setCertificateUploadProgress] = useState<number | null>(null);
  const [createDashboardSuccess, setCreateDashboardSuccess] = useState(false);
  const [ticketCredentials, setTicketCredentials] = useState<{ username: string; password: string } | null>(null);
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [requestMessage, setRequestMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [requesterLoggedIn, setRequesterLoggedIn] = useState(false);
  const [otpStep, setOtpStep] = useState<'request' | 'phone' | 'code' | 'form' | 'email'>('request');
  const [otpPhone, setOtpPhone] = useState('');
  const [otpEmail, setOtpEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [emailOtpSending, setEmailOtpSending] = useState(false);
  const [emailOtpVerifying, setEmailOtpVerifying] = useState(false);
  const requestModalOpenRef = useRef(false);

  useEffect(() => {
    const justOpened = requestModalOpen && !requestModalOpenRef.current;
    requestModalOpenRef.current = requestModalOpen;
    if (justOpened && showDashboardButtons && !requesterLoggedIn && !ticketCredentials) {
      setCreateDashboardSuccess(false);
      setCreateDashboardForm({ companyName: '', pocName: '', pocEmail: '', pocPhone: '', certificateUrl: '' });
      setRequestMessage(null);
      setOtpStep('email');
      setOtpPhone('');
      setOtpEmail('');
      setOtpCode('');
    }
  }, [requestModalOpen, showDashboardButtons, requesterLoggedIn, ticketCredentials]);

  useEffect(() => {
    if (slug !== ENTERPRISE_NETWORKING_SLUG && slug !== QUALITY_CONTROL_SLUG) return;
    fetch('/api/auth/requester-me', { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => setRequesterLoggedIn(Boolean(data.success && data.user)))
      .catch(() => setRequesterLoggedIn(false));
  }, [slug]);

  const dashboardHref = showQualityControlTechnologies ? '/dashboard/quality-control' : '/dashboard';

  useEffect(() => {
    if (slug === CLEAN_ENERGY_SLUG) {
      fetch('/api/clean-energy-config')
        .then((r) => r.json())
        .then((data) => {
          if (data.success && typeof data.pricePerWattCents === 'number') setPricePerWattCents(data.pricePerWattCents);
        })
        .catch(() => {});
    }
  }, [slug]);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    setError('');
    Promise.all([
      fetch(`/api/services/slug/${encodeURIComponent(slug)}?locale=${encodeURIComponent(locale)}`).then((r) => r.json()),
      fetch(`/api/projects?category=${encodeURIComponent(slug)}&locale=${encodeURIComponent(locale)}`).then((r) => r.json()),
    ])
      .then(([serviceRes, projectsRes]) => {
        if (serviceRes.success && serviceRes.service) {
          setService(serviceRes.service);
        } else {
          setError('serviceNotFound');
        }
        if (projectsRes.success && projectsRes.projects) {
          setProjects(projectsRes.projects);
        }
      })
      .catch(() => setError('failedToLoad'))
      .finally(() => setLoading(false));
  }, [slug, locale]);

  useEffect(() => {
    if (!loading && service) window.scrollTo(0, 0);
  }, [slug, loading, service]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center">
        <div className="animate-spin w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error || !service) {
    const errorMsg = error === 'serviceNotFound' ? t('serviceDetail.serviceNotFound') : error === 'failedToLoad' ? t('serviceDetail.failedToLoad') : error;
    return (
      <div className="min-h-screen bg-[#0A0A0F] text-white flex flex-col items-center justify-center px-4">
        <p className="text-gray-400 mb-6">{errorMsg}</p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 border border-white/20 hover:bg-white/15"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('serviceDetail.backToHome')}
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white">
      <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-20">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <Link
            href="/#services"
            className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            {t('serviceDetail.backToServices')}
          </Link>
        </div>

        {/* Service brief - description first */}
        <section className="mb-16">
          <div className="flex items-start gap-4 mb-6">
            <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
              <Boxes className="w-10 h-10 text-blue-400" />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-bold mb-2">{service.title}</h1>
              {(service.priceRange || service.duration) && (
                <div className="flex flex-wrap gap-4 text-sm text-gray-400">
                  {service.priceRange && (
                    <span>
                      {service.priceRange === 'Custom' ? t('serviceDetail.priceRange.Custom') : service.priceRange}
                    </span>
                  )}
                  {service.duration && (
                    <span>
                      {service.duration === 'Ongoing' ? t('serviceDetail.duration.Ongoing') : service.duration}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
          <p className="text-lg text-gray-300 leading-relaxed max-w-3xl mb-6">
            {service.description}
          </p>
          {service.content && (
            <div className="prose prose-invert prose-lg max-w-none text-gray-400">
              {service.content}
            </div>
          )}
          {service.features && service.features.length > 0 && (
            <div className="mt-8">
              <h2 className="text-lg font-semibold text-gray-200 mb-3">{t('serviceDetail.features')}</h2>
              <ul className="space-y-2">
                {service.features.map((f, i) => (
                  <li key={i} className="flex items-center gap-2 text-gray-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* Enterprise Networking Technologies */}
        {showEnterpriseNetworkingTechnologies && (
          <section className="mb-16">
            <h2 className="text-2xl md:text-3xl font-bold mb-3 flex items-center gap-2">
              <Cable className="w-8 h-8 text-cyan-400" />
              {t('enterpriseNetworkingTechnologies.title')}
            </h2>
            <p className="text-gray-400 mb-8 max-w-3xl leading-relaxed">
              {t('enterpriseNetworkingTechnologies.intro')}
            </p>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {ENTERPRISE_NETWORKING_TECH_KEYS.map((key) => {
                const IconComp = ENTERPRISE_NETWORKING_ICONS[key] || Cable;
                return (
                  <div
                    key={key}
                    className="group rounded-2xl border border-white/10 bg-gradient-to-br from-white/5 to-transparent p-6 hover:border-cyan-500/30 hover:from-cyan-500/5 transition-all duration-300"
                  >
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20 group-hover:bg-cyan-500/20 group-hover:border-cyan-500/40 transition-colors">
                        <IconComp className="w-7 h-7 text-cyan-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-bold text-cyan-400 mb-2">
                          {t(`enterpriseNetworkingTechnologies.${key}.name`)}
                        </h3>
                        <p className="text-sm text-gray-400 leading-relaxed">
                          {t(`enterpriseNetworkingTechnologies.${key}.description`)}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Quality Control & Supervision Features */}
        {showQualityControlTechnologies && (
          <section className="mb-16">
            <h2 className="text-2xl md:text-3xl font-bold mb-3 flex items-center gap-2">
              <ShieldCheck className="w-8 h-8 text-amber-400" />
              {t('qualityControlTechnologies.title')}
            </h2>
            <p className="text-gray-400 mb-8 max-w-3xl leading-relaxed">
              {t('qualityControlTechnologies.intro')}
            </p>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
              {QUALITY_CONTROL_KEYS.map((key) => {
                const IconComp = QUALITY_CONTROL_ICONS[key] || ShieldCheck;
                const highlights = t.raw(`qualityControlTechnologies.${key}.highlights`) as string[] | undefined;
                return (
                  <div
                    key={key}
                    className="group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-amber-500/5 via-white/5 to-transparent p-6 hover:border-amber-500/40 hover:shadow-lg hover:shadow-amber-500/10 transition-all duration-300"
                  >
                    <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-bl-full opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="relative">
                      <div className="flex items-start gap-4 mb-3">
                        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 group-hover:bg-amber-500/20 group-hover:border-amber-500/40 group-hover:scale-105 transition-all duration-300 shrink-0">
                          <IconComp className="w-8 h-8 text-amber-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-lg font-bold text-amber-400 mb-1">
                            {t(`qualityControlTechnologies.${key}.name`)}
                          </h3>
                          <p className="text-sm text-gray-400 leading-relaxed">
                            {t(`qualityControlTechnologies.${key}.description`)}
                          </p>
                        </div>
                      </div>
                      {Array.isArray(highlights) && highlights.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-white/5">
                          <ul className="space-y-2">
                            {highlights.map((item, i) => (
                              <li key={i} className="flex items-center gap-2 text-xs text-gray-500">
                                <CheckCircle2 className="w-4 h-4 text-amber-500/70 shrink-0" />
                                {item}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* CTA: Create Dashboard & Dashboard buttons */}
            <div className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/10 to-transparent p-8 text-center">
              <p className="text-gray-300 mb-6 max-w-2xl mx-auto">
                {t('qualityControlTechnologies.ctaDescription')}
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <button
                  type="button"
                  onClick={() => setRequestModalOpen(true)}
                  className="inline-flex items-center gap-2 px-6 py-3.5 bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded-xl shadow-lg shadow-amber-500/25 hover:shadow-amber-500/40 transition-all"
                >
                  <Send className="w-5 h-5" />
                  {t('companyRequest.createDashboard')}
                </button>
                <Link
                  href={dashboardHref}
                  className="inline-flex items-center gap-2 px-6 py-3.5 bg-white/10 hover:bg-white/20 border border-amber-500/40 text-amber-400 font-semibold rounded-xl transition-all"
                >
                  <LayoutDashboard className="w-5 h-5" />
                  {t('ticketForm.dashboardButton')}
                </Link>
              </div>
              <QcAppDownloadSection t={t} />
            </div>
          </section>
        )}

        {/* Clean Energy - Features & Design Calculator */}
        {showCleanEnergyTechnologies && (
          <section className="mb-16">
            <h2 className="text-2xl md:text-3xl font-bold mb-3 flex items-center gap-2">
              <Zap className="w-8 h-8 text-amber-400" />
              {t('cleanEnergyTechnologies.title')}
            </h2>
            <p className="text-gray-400 mb-8 max-w-3xl leading-relaxed">
              {t('cleanEnergyTechnologies.intro')}
            </p>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
              {(['homes', 'industrial', 'farms', 'maintenance', 'deployment', 'purchase'] as const).map((key) => (
                <div
                  key={key}
                  className="group rounded-2xl border border-white/10 bg-gradient-to-br from-amber-500/5 to-transparent p-6 hover:border-amber-500/30 transition-all"
                >
                  <h3 className="text-lg font-bold text-amber-400 mb-2">{t(`cleanEnergyTechnologies.${key}.name`)}</h3>
                  <p className="text-sm text-gray-400 leading-relaxed">{t(`cleanEnergyTechnologies.${key}.description`)}</p>
                </div>
              ))}
            </div>

            {/* Design your system - Calculator */}
            <div className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/10 to-transparent p-8 mb-8">
              <h3 className="text-xl font-bold text-amber-400 mb-2 flex items-center gap-2">
                <Ruler className="w-6 h-6" />
                {t('cleanEnergyTechnologies.designTitle')}
              </h3>
              <p className="text-gray-400 mb-6">{t('cleanEnergyTechnologies.designIntro')}</p>
              <div className="grid md:grid-cols-2 gap-6 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">{t('cleanEnergyTechnologies.currentLabel')} (A)</label>
                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={designForm.currentAmps}
                    onChange={(e) => setDesignForm((f) => ({ ...f, currentAmps: e.target.value }))}
                    placeholder="e.g. 10"
                    className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:border-amber-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">{t('cleanEnergyTechnologies.kwhLabel')} (kWh)</label>
                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={designForm.kwh}
                    onChange={(e) => setDesignForm((f) => ({ ...f, kwh: e.target.value }))}
                    placeholder="e.g. 5"
                    className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:border-amber-500 outline-none"
                  />
                </div>
              </div>
              {(() => {
                const current = parseFloat(designForm.currentAmps);
                const kwh = parseFloat(designForm.kwh);
                const valid = !isNaN(current) && current > 0 && !isNaN(kwh) && kwh > 0;
                const VOLTAGE = 24; // Standard 24V system
                const PANEL_WATTS = 600; // 600W per panel
                const SUN_HOURS_PER_DAY = 5; // Effective peak sun hours for charging
                const powerWatts = valid ? VOLTAGE * current : 0;
                const chargingHours = valid ? (kwh * 1000) / (VOLTAGE * current) : 0;
                const usageAt = (amps: number) => (kwh * 1000) / (VOLTAGE * amps);
                const photocellsQty = valid ? Math.ceil((kwh * 1000) / (SUN_HOURS_PER_DAY * PANEL_WATTS)) : 0;
                const priceUsd = valid ? (powerWatts * (pricePerWattCents / 100)) : 0;
                const USAGE_CURRENTS = [10, 20, 30, 40, 60, 80];
                return valid ? (
                  <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-6 space-y-4">
                    <h4 className="font-semibold text-amber-400">{t('cleanEnergyTechnologies.resultsTitle')}</h4>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div>
                        <p className="text-xs text-gray-500">{t('cleanEnergyTechnologies.resultCurrent')}</p>
                        <p className="text-lg font-bold text-white">{current} A</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">{t('cleanEnergyTechnologies.resultPhotocells')}</p>
                        <p className="text-lg font-bold text-white">{photocellsQty} {t('cleanEnergyTechnologies.photocellsUnit')}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">{t('cleanEnergyTechnologies.resultCharging')}</p>
                        <p className="text-lg font-bold text-white">{chargingHours.toFixed(1)} h</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">{t('cleanEnergyTechnologies.resultPrice')}</p>
                        <p className="text-lg font-bold text-amber-400">${priceUsd.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
                      </div>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-amber-400/90 mb-2">{t('cleanEnergyTechnologies.usageByCurrent')}</p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                        {USAGE_CURRENTS.map((amps) => (
                          <div key={amps} className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-center">
                            <p className="text-xs text-gray-500">{amps} A</p>
                            <p className="text-base font-bold text-white">{usageAt(amps).toFixed(1)} h</p>
                          </div>
                        ))}
                      </div>
                    </div>
                    <p className="text-sm text-gray-400">{t('cleanEnergyTechnologies.priceNote')}</p>
                    <button
                      type="button"
                      onClick={() => {
                        setCleanEnergyForm((f) => ({ ...f, currentAmps: designForm.currentAmps, kwh: designForm.kwh }));
                        setRequestModalOpen(true);
                      }}
                      className="px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded-xl"
                    >
                      {t('cleanEnergyTechnologies.requestQuote')}
                    </button>
                  </div>
                ) : null;
              })()}
            </div>
          </section>
        )}

        {/* Programming Technologies (Custom Software / Programming) */}
        {showProgrammingTechnologies && (
          <section className="mb-16">
            <h2 className="text-2xl md:text-3xl font-bold mb-3 flex items-center gap-2">
              <Code className="w-8 h-8 text-emerald-400" />
              {t('programmingTechnologies.title')}
            </h2>
            <p className="text-gray-400 mb-8 max-w-3xl leading-relaxed">
              {t('programmingTechnologies.intro')}
            </p>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {PROGRAMMING_TECH_KEYS.map((key) => {
                const IconComp = PROGRAMMING_ICONS[key] || Code;
                return (
                  <div
                    key={key}
                    className="group rounded-2xl border border-white/10 bg-gradient-to-br from-white/5 to-transparent p-6 hover:border-emerald-500/30 hover:from-emerald-500/5 transition-all duration-300"
                  >
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 group-hover:bg-emerald-500/20 group-hover:border-emerald-500/40 transition-colors">
                        <IconComp className="w-7 h-7 text-emerald-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-bold text-emerald-400 mb-2">
                          {t(`programmingTechnologies.${key}.name`)}
                        </h3>
                        <p className="text-sm text-gray-400 leading-relaxed">
                          {t(`programmingTechnologies.${key}.description`)}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Systems & Technologies (Smart Home Automation only) - after description */}
        {showTechnologies && (
          <section className="mb-16">
            <h2 className="text-2xl md:text-3xl font-bold mb-3 flex items-center gap-2">
              <Cpu className="w-8 h-8 text-blue-400" />
              {t('serviceTechnologies.title')}
            </h2>
            <p className="text-gray-400 mb-8 max-w-3xl leading-relaxed">
              {t('serviceTechnologies.intro')}
            </p>
            <div className="grid md:grid-cols-3 gap-6">
              {TECH_KEYS.map((key) => (
                <div
                  key={key}
                  className="rounded-xl border border-white/10 bg-white/5 p-6 hover:border-white/20 transition-colors"
                >
                  <h3 className="text-lg font-bold text-blue-400 mb-3">
                    {t(`serviceTechnologies.${key}.name`)}
                  </h3>
                  <p className="text-sm text-gray-400 leading-relaxed mb-4">
                    {t(`serviceTechnologies.${key}.description`)}
                  </p>
                  <div className="space-y-3">
                    <div>
                      <h4 className={`text-xs font-semibold text-emerald-400/90 mb-2 flex items-center gap-1.5 ${!isRtl ? 'uppercase tracking-wider' : ''}`}>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {t('serviceTechnologies.advantagesLabel')}
                      </h4>
                      <ul className="space-y-1.5">
                        {(t.raw(`serviceTechnologies.${key}.advantages`) as string[]).map((item, i) => (
                          <li key={i} className="text-xs text-gray-500 flex gap-2">
                            <span className="text-emerald-500 mt-0.5">•</span>
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <h4 className={`text-xs font-semibold text-amber-400/90 mb-2 flex items-center gap-1.5 ${!isRtl ? 'uppercase tracking-wider' : ''}`}>
                        <XCircle className="w-3.5 h-3.5" />
                        {t('serviceTechnologies.disadvantagesLabel')}
                      </h4>
                      <ul className="space-y-1.5">
                        {(t.raw(`serviceTechnologies.${key}.disadvantages`) as string[]).map((item, i) => (
                          <li key={i} className="text-xs text-gray-500 flex gap-2">
                            <span className="text-amber-500 mt-0.5">•</span>
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Request modal (Smart Home Automation or Programming) */}
        {showRequestButton && requestModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/70 backdrop-blur-sm overflow-y-auto min-h-0" onClick={() => setRequestModalOpen(false)}>
            <div className="my-2 sm:my-6 bg-[#0f1419] border border-white/10 rounded-xl sm:rounded-2xl max-w-md w-full max-h-[calc(100vh-1rem)] sm:max-h-[calc(100vh-2rem)] overflow-y-auto overflow-x-hidden p-3 sm:p-5 shadow-2xl flex-shrink-0" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between gap-2 mb-3 sm:mb-4">
                <h3 className="text-base sm:text-lg font-bold text-white truncate">
                  {showDashboardButtons
                    ? (requesterLoggedIn ? t('ticketForm.title') : t('companyRequest.createDashboard'))
                    : t('visitorRequestForm.title')}
                </h3>
                <button type="button" onClick={() => setRequestModalOpen(false)} className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors shrink-0" aria-label="Close">
                  <X className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
              </div>
              {requestMessage && (
                <div className={`mb-3 px-3 py-2 sm:py-2.5 rounded-lg text-xs sm:text-sm ${requestMessage.type === 'success' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/15 text-red-400 border border-red-500/30'}`}>
                  {requestMessage.text}
                </div>
              )}
              {showTechnologies && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setRequestMessage(null);
                  setRequestSubmitting(true);
                  try {
                    const res = await fetch('/api/visitor-requests', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        buildingType: requestForm.buildingType,
                        phone: requestForm.phone.trim(),
                        province: requestForm.province.trim(),
                        technique: requestForm.technique,
                        name: requestForm.name.trim() || undefined,
                        company: requestForm.company.trim() || undefined,
                        serviceSlug: SMART_HOME_SLUG,
                      }),
                    });
                    let data: { success?: boolean; message?: string } = {};
                    try {
                      data = await res.json();
                    } catch {
                      setRequestMessage({ type: 'error', text: t('visitorRequestForm.errorMessage') });
                      setRequestSubmitting(false);
                      return;
                    }
                    if (res.ok && data.success) {
                      setRequestMessage({ type: 'success', text: t('visitorRequestForm.successMessage') });
                      setRequestForm({ buildingType: 'home', phone: '', province: '', technique: 'knx', name: '', company: '' });
                      setTimeout(() => { setRequestModalOpen(false); setRequestMessage(null); }, 2000);
                    } else {
                      const msg = typeof data.message === 'string' && data.message.trim() ? data.message : t('visitorRequestForm.errorMessage');
                      setRequestMessage({ type: 'error', text: msg });
                    }
                  } catch {
                    setRequestMessage({ type: 'error', text: t('visitorRequestForm.errorMessage') });
                  } finally {
                    setRequestSubmitting(false);
                  }
                }}
                className="space-y-2.5 sm:space-y-3"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-gray-300 mb-0.5 sm:mb-1">{t('visitorRequestForm.nameLabel')}</label>
                    <input
                      type="text"
                      value={requestForm.name}
                      onChange={(e) => setRequestForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder={t('visitorRequestForm.namePlaceholder')}
                      className="w-full px-3 py-2 sm:py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm sm:text-base text-white placeholder-gray-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-gray-300 mb-0.5 sm:mb-1">{t('visitorRequestForm.companyLabel')}</label>
                    <input
                      type="text"
                      value={requestForm.company}
                      onChange={(e) => setRequestForm((f) => ({ ...f, company: e.target.value }))}
                      placeholder={t('visitorRequestForm.companyPlaceholder')}
                      className="w-full px-3 py-2 sm:py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm sm:text-base text-white placeholder-gray-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 outline-none transition-all"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-gray-300 mb-0.5 sm:mb-1">{t('visitorRequestForm.buildingTypeLabel')}</label>
                    <select
                      value={requestForm.buildingType}
                      onChange={(e) => setRequestForm((f) => ({ ...f, buildingType: e.target.value }))}
                      className="w-full px-3 py-2 sm:py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm sm:text-base text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 outline-none transition-all"
                      required
                    >
                      {BUILDING_TYPES.map((key) => (
                        <option key={key} value={key} className="bg-[#0f1419] text-white">
                          {t(`visitorRequestForm.buildingTypes.${key}`)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-gray-300 mb-0.5 sm:mb-1">{t('visitorRequestForm.techniqueLabel')}</label>
                    <select
                      value={requestForm.technique}
                      onChange={(e) => setRequestForm((f) => ({ ...f, technique: e.target.value }))}
                      className="w-full px-3 py-2 sm:py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm sm:text-base text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 outline-none transition-all"
                      required
                    >
                      {TECH_KEYS.map((key) => (
                        <option key={key} value={key} className="bg-[#0f1419] text-white">
                          {t(`visitorRequestForm.techniques.${key}`)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-gray-300 mb-0.5 sm:mb-1">{t('visitorRequestForm.phoneLabel')}</label>
                    <input
                      type="tel"
                      value={requestForm.phone}
                      onChange={(e) => setRequestForm((f) => ({ ...f, phone: e.target.value }))}
                      placeholder="+964..."
                      className="w-full px-3 py-2 sm:py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm sm:text-base text-white placeholder-gray-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 outline-none transition-all"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-gray-300 mb-0.5 sm:mb-1">{t('visitorRequestForm.provinceLabel')}</label>
                    <input
                      type="text"
                      value={requestForm.province}
                      onChange={(e) => setRequestForm((f) => ({ ...f, province: e.target.value }))}
                      className="w-full px-3 py-2 sm:py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm sm:text-base text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 outline-none transition-all"
                      required
                    />
                  </div>
                </div>
                <div className="flex gap-2 pt-2 sm:pt-3">
                  <button
                    type="submit"
                    disabled={requestSubmitting}
                    className="flex-1 py-2.5 sm:py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold rounded-lg sm:rounded-xl transition-all flex items-center justify-center gap-2 focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-[#0f1419]"
                  >
                    {requestSubmitting ? '...' : t('visitorRequestForm.submitButton')}
                  </button>
                  <button type="button" onClick={() => setRequestModalOpen(false)} className="px-4 py-2.5 sm:px-5 sm:py-3 border border-white/20 rounded-lg sm:rounded-xl text-sm text-gray-400 hover:text-white hover:border-white/30 transition-colors">
                    {t('visitorRequestForm.close')}
                  </button>
                </div>
              </form>
              )}
              {showDashboardButtons && <>
              {(() => {
                if (ticketCredentials) return (
                <div className="space-y-2.5 sm:space-y-3">
                  <div className="px-3 py-2 sm:px-4 sm:py-2.5 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs sm:text-sm">
                    {t('ticketForm.successMessage')}
                  </div>
                  <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-2.5 sm:p-3 space-y-2">
                    <p className="text-xs sm:text-sm font-medium text-cyan-400">{t('ticketForm.saveCredentials')}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                      <div>
                        <span className="text-xs text-gray-500">{t('ticketForm.username')}</span>
                        <p className="font-mono text-sm sm:text-base text-white font-semibold break-all">{ticketCredentials.username}</p>
                      </div>
                      <div>
                        <span className="text-xs text-gray-500">{t('ticketForm.password')}</span>
                        <p className="font-mono text-sm sm:text-base text-white font-semibold break-all">{ticketCredentials.password}</p>
                      </div>
                    </div>
                    <Link
                      href={dashboardHref}
                      className="inline-flex items-center gap-2 px-3 py-2 sm:px-4 sm:py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium rounded-lg sm:rounded-xl transition-colors"
                    >
                      {t('ticketForm.goToDashboard')}
                    </Link>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setTicketCredentials(null); setRequestModalOpen(false); }}
                    className="w-full px-4 py-2.5 sm:px-5 sm:py-3 border border-white/20 rounded-lg sm:rounded-xl text-sm text-gray-400 hover:text-white hover:border-white/30 transition-colors"
                  >
                    {t('visitorRequestForm.close')}
                  </button>
                </div>
              ); if (requesterLoggedIn) return (
                <div className="space-y-3">
                  <p className="text-xs sm:text-sm text-gray-300">
                    {t('ticketForm.alreadyLoggedInMessage')}
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Link
                      href={dashboardHref}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2.5 sm:py-3 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      <LayoutDashboard className="w-4 h-4 sm:w-5 sm:h-5" />
                      {t('ticketForm.dashboardButton')}
                    </Link>
                    <button
                      type="button"
                      onClick={() => setRequestModalOpen(false)}
                      className="px-4 py-2.5 sm:py-3 border border-white/20 rounded-lg text-sm text-gray-400 hover:text-white hover:border-white/30 transition-colors"
                    >
                      {t('visitorRequestForm.close')}
                    </button>
                  </div>
                </div>
              ); if (createDashboardSuccess) return (
                <div className="space-y-4">
                  <div className="px-4 py-3 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-sm">
                    {t('companyRequest.submitSuccess')}
                  </div>
                  <button
                    type="button"
                    onClick={() => setRequestModalOpen(false)}
                    className="w-full px-4 py-2.5 sm:py-3 border border-white/20 rounded-lg text-sm text-gray-400 hover:text-white hover:border-white/30 transition-colors"
                  >
                    {t('visitorRequestForm.close')}
                  </button>
                </div>
              ); if (otpStep === 'email') return (
                <div className="space-y-3">
                  <p className="text-xs sm:text-sm text-gray-400">{t('companyRequest.emailVerifyTitle')}</p>
                  {requestMessage && (
                    <div className={`px-3 py-2 rounded-lg text-xs sm:text-sm ${requestMessage.type === 'success' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                      {requestMessage.text}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={otpEmail}
                      onChange={(e) => setOtpEmail(e.target.value)}
                      placeholder={t('companyRequest.pocEmailPlaceholder')}
                      className="flex-1 min-w-0 px-3 py-2 sm:py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-gray-500 focus:border-cyan-500 outline-none"
                    />
                    <button
                      type="button"
                      disabled={emailOtpSending || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(otpEmail.trim())}
                      onClick={async () => {
                        setRequestMessage(null);
                        setEmailOtpSending(true);
                        try {
                          const res = await fetch('/api/otp/email/send', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ email: otpEmail.trim().toLowerCase() }),
                          });
                          const data = await res.json();
                          if (res.ok && data.success) {
                            setOtpStep('code');
                            setRequestMessage({ type: 'success', text: t('companyRequest.emailCodeSent') });
                          } else {
                            setRequestMessage({ type: 'error', text: (data.message || t('visitorRequestForm.errorMessage')) as string });
                          }
                        } catch {
                          setRequestMessage({ type: 'error', text: t('visitorRequestForm.errorMessage') });
                        } finally {
                          setEmailOtpSending(false);
                        }
                      }}
                      className="px-4 py-2.5 sm:py-3 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors shrink-0"
                    >
                      {emailOtpSending ? '...' : t('companyRequest.sendCode')}
                    </button>
                  </div>
                </div>
              ); if (otpStep === 'code' && otpEmail) return (
                <div className="space-y-3">
                  <p className="text-xs sm:text-sm text-gray-400">{t('companyRequest.emailCodeTitle')} — {otpEmail}</p>
                  {requestMessage && (
                    <div className={`px-3 py-2 rounded-lg text-xs sm:text-sm ${requestMessage.type === 'success' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                      {requestMessage.text}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="000000"
                      className="flex-1 min-w-0 px-3 py-2 sm:py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-gray-500 focus:border-cyan-500 outline-none font-mono text-center"
                    />
                    <button
                      type="button"
                      disabled={emailOtpVerifying || otpCode.length < 4}
                      onClick={async () => {
                        setRequestMessage(null);
                        setEmailOtpVerifying(true);
                        try {
                          const res = await fetch('/api/otp/email/verify', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ email: otpEmail.trim().toLowerCase(), code: otpCode }),
                          });
                          const data = await res.json();
                          if (res.ok && data.success) {
                            setCreateDashboardForm((f) => ({ ...f, pocEmail: otpEmail.trim().toLowerCase() }));
                            setOtpStep('form');
                            setRequestMessage(null);
                          } else {
                            setRequestMessage({ type: 'error', text: (data.message || t('visitorRequestForm.errorMessage')) as string });
                          }
                        } catch {
                          setRequestMessage({ type: 'error', text: t('visitorRequestForm.errorMessage') });
                        } finally {
                          setEmailOtpVerifying(false);
                        }
                      }}
                      className="px-4 py-2.5 sm:py-3 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors shrink-0"
                    >
                      {emailOtpVerifying ? '...' : t('companyRequest.verifyCode')}
                    </button>
                  </div>
                </div>
              ); if (otpStep === 'form') return (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setRequestMessage(null);
                    if (!createDashboardForm.companyName.trim() || !createDashboardForm.pocName.trim() || !createDashboardForm.pocPhone.trim() || !createDashboardForm.pocEmail.trim()) {
                      setRequestMessage({ type: 'error', text: t('companyRequest.requiredFields') });
                      return;
                    }
                    setCreateDashboardSubmitting(true);
                    try {
                      const res = await fetch('/api/company-requests', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          companyName: createDashboardForm.companyName.trim(),
                          pocName: createDashboardForm.pocName.trim(),
                          pocEmail: createDashboardForm.pocEmail.trim().toLowerCase(),
                          pocPhone: createDashboardForm.pocPhone.trim(),
                          certificateUrl: createDashboardForm.certificateUrl.trim() || undefined,
                          serviceSlug: slug,
                        }),
                      });
                      const data = await res.json();
                      if (res.ok && data.success) {
                        setCreateDashboardSuccess(true);
                      } else {
                        setRequestMessage({ type: 'error', text: (data.message || t('visitorRequestForm.errorMessage')) as string });
                      }
                    } catch {
                      setRequestMessage({ type: 'error', text: t('visitorRequestForm.errorMessage') });
                    } finally {
                      setCreateDashboardSubmitting(false);
                    }
                  }}
                  className="space-y-2.5 sm:space-y-3"
                >
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-gray-300 mb-0.5 sm:mb-1">{t('companyRequest.companyName')}</label>
                    <input
                      type="text"
                      value={createDashboardForm.companyName}
                      onChange={(e) => setCreateDashboardForm((f) => ({ ...f, companyName: e.target.value }))}
                      placeholder={t('companyRequest.companyNamePlaceholder')}
                      className="w-full px-3 py-2 sm:py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm sm:text-base text-white placeholder-gray-500 focus:border-cyan-500 outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-gray-300 mb-0.5 sm:mb-1">{t('companyRequest.pocName')}</label>
                    <input
                      type="text"
                      value={createDashboardForm.pocName}
                      onChange={(e) => setCreateDashboardForm((f) => ({ ...f, pocName: e.target.value }))}
                      placeholder={t('companyRequest.pocNamePlaceholder')}
                      className="w-full px-3 py-2 sm:py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm sm:text-base text-white placeholder-gray-500 focus:border-cyan-500 outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-gray-300 mb-0.5 sm:mb-1">{t('companyRequest.pocEmail')}</label>
                    <input
                      type="email"
                      value={createDashboardForm.pocEmail}
                      readOnly
                      className="w-full px-3 py-2 sm:py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm sm:text-base text-gray-400 cursor-not-allowed"
                    />
                  </div>
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-gray-300 mb-0.5 sm:mb-1">{t('companyRequest.pocPhone')}</label>
                    <input
                      type="tel"
                      value={createDashboardForm.pocPhone}
                      onChange={(e) => setCreateDashboardForm((f) => ({ ...f, pocPhone: e.target.value }))}
                      placeholder="+964..."
                      className="w-full px-3 py-2 sm:py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm sm:text-base text-white placeholder-gray-500 focus:border-cyan-500 outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-gray-300 mb-0.5 sm:mb-1">{t('companyRequest.certificateOptional')}</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={createDashboardForm.certificateUrl}
                        onChange={(e) => setCreateDashboardForm((f) => ({ ...f, certificateUrl: e.target.value }))}
                        placeholder={t('companyRequest.certificatePlaceholder')}
                        className="flex-1 min-w-0 px-3 py-2 sm:py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-gray-500 focus:border-cyan-500 outline-none"
                      />
                      <label className={`inline-flex shrink-0 items-center gap-2 px-3 py-2 sm:py-2.5 rounded-lg text-xs sm:text-sm font-medium border border-white/10 ${certificateUploading ? 'bg-white/10 cursor-not-allowed opacity-80' : 'bg-white/10 hover:bg-white/15 cursor-pointer'}`}>
                        <input
                          type="file"
                          accept=".pdf,image/jpeg,image/png,image/webp"
                          className="hidden"
                          disabled={certificateUploading}
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            setCertificateUploading(true);
                            setCertificateUploadProgress(0);
                            try {
                              const d = await uploadWithProgress('/api/upload/company-certificate', file, {
                                onProgress: (p) => setCertificateUploadProgress(p),
                              });
                              if (d.success && d.url) setCreateDashboardForm((f) => ({ ...f, certificateUrl: d.url ?? '' }));
                            } finally {
                              setCertificateUploading(false);
                              setCertificateUploadProgress(null);
                              e.target.value = '';
                            }
                          }}
                        />
                        {certificateUploading ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : null}
                        <span>{certificateUploading && certificateUploadProgress != null ? `Uploading ${certificateUploadProgress}%` : 'Upload'}</span>
                      </label>
                      {certificateUploading && certificateUploadProgress != null && (
                        <div className="w-full max-w-[160px] h-1.5 rounded-full bg-white/10 overflow-hidden">
                          <div className="h-full bg-cyan-500 rounded-full transition-all duration-200" style={{ width: `${certificateUploadProgress}%` }} />
                        </div>
                      )}
                    </div>
                  </div>
                  {requestMessage && (
                    <div className={`px-3 py-2 rounded-lg text-sm ${requestMessage.type === 'success' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                      {requestMessage.text}
                    </div>
                  )}
                  <div className="flex gap-2 pt-2">
                    <button
                      type="submit"
                      disabled={createDashboardSubmitting || certificateUploading}
                      className="flex-1 py-2.5 sm:py-3 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-all"
                    >
                      {createDashboardSubmitting ? '...' : certificateUploading ? 'Uploading...' : t('companyRequest.submit')}
                    </button>
                    <button type="button" onClick={() => setRequestModalOpen(false)} disabled={certificateUploading} className="px-4 py-2.5 sm:py-3 border border-white/20 rounded-lg text-sm text-gray-400 hover:text-white hover:border-white/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                      {t('visitorRequestForm.close')}
                    </button>
                  </div>
                </form>
              ); if (otpStep === 'phone') return (
                <div className="space-y-3">
                  <p className="text-xs sm:text-sm text-gray-400">{t('ticketForm.otpStepTitle')}</p>
                  {requestMessage && (
                    <div className={`px-3 py-2 rounded-lg text-xs sm:text-sm ${requestMessage.type === 'success' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                      {requestMessage.text}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input
                      type="tel"
                      value={otpPhone}
                      onChange={(e) => setOtpPhone(e.target.value)}
                      placeholder="+964..."
                      className="flex-1 min-w-0 px-3 py-2 sm:py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-gray-500 focus:border-cyan-500 outline-none"
                    />
                    <button
                      type="button"
                      disabled={otpSending || (otpPhone || '').trim().length < 8}
                      onClick={async () => {
                        setRequestMessage(null);
                        setOtpSending(true);
                        try {
                          const res = await fetch('/api/otp/send', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ phone: otpPhone.trim() }),
                          });
                          const data = await res.json();
                          if (data.success) {
                            setOtpStep('code');
                            setRequestMessage({ type: 'success', text: t('ticketForm.otpSent') });
                            if (data.devCode) setRequestMessage((m) => m ? { ...m, text: `${m.text} (Dev: ${data.devCode})` } : null);
                          } else {
                            setRequestMessage({ type: 'error', text: data.message || t('visitorRequestForm.errorMessage') });
                          }
                        } catch {
                          setRequestMessage({ type: 'error', text: t('visitorRequestForm.errorMessage') });
                        } finally {
                          setOtpSending(false);
                        }
                      }}
                      className="px-3 py-2 sm:py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg shrink-0"
                    >
                      {otpSending ? '...' : t('ticketForm.otpSendButton')}
                    </button>
                  </div>
                  <button type="button" onClick={() => setRequestModalOpen(false)} className="w-full py-2 sm:py-2.5 border border-white/20 rounded-lg text-sm text-gray-400 hover:text-white">
                    {t('visitorRequestForm.close')}
                  </button>
                </div>
              ); if (otpStep === 'code' && otpPhone) return (
                <div className="space-y-3">
                  <p className="text-xs sm:text-sm text-gray-400">{t('ticketForm.otpStepTitle')} — {otpPhone}</p>
                  {requestMessage && (
                    <div className={`px-3 py-2 rounded-lg text-sm ${requestMessage.type === 'success' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                      {requestMessage.text}
                    </div>
                  )}
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                    placeholder={t('ticketForm.otpCodePlaceholder')}
                    className="w-full px-3 py-2 sm:py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:border-cyan-500 outline-none text-center text-base sm:text-lg tracking-widest"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        setRequestMessage(null);
                        setOtpVerifying(true);
                        try {
                          const res = await fetch('/api/otp/verify', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ phone: otpPhone.trim(), code: otpCode }),
                          });
                          const data = await res.json();
                          if (data.success) {
                            setEnterpriseForm((f) => ({ ...f, phone: otpPhone.trim() }));
                            setOtpStep('request');
                            setRequestMessage(null);
                          } else {
                            setRequestMessage({ type: 'error', text: t('ticketForm.otpInvalid') });
                          }
                        } catch {
                          setRequestMessage({ type: 'error', text: t('visitorRequestForm.errorMessage') });
                        } finally {
                          setOtpVerifying(false);
                        }
                      }}
                      disabled={otpVerifying || otpCode.length !== 6}
                      className="flex-1 py-2 sm:py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg"
                    >
                      {otpVerifying ? '...' : t('ticketForm.otpVerifyButton')}
                    </button>
                    <button type="button" onClick={() => { setOtpStep('phone'); setOtpCode(''); setRequestMessage(null); }} className="px-3 py-2 sm:py-2.5 border border-white/20 rounded-lg text-sm text-gray-400 hover:text-white shrink-0">
                      Back
                    </button>
                  </div>
                </div>
              ); if (otpStep === 'request') return (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setRequestMessage(null);
                  setRequestSubmitting(true);
                  try {
                    const res = await fetch('/api/tickets', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      credentials: 'include',
                      body: JSON.stringify({
                        siteName: enterpriseForm.siteName.trim(),
                        siteCoordinator: enterpriseForm.siteCoordinator.trim(),
                        slaHours: Number(enterpriseForm.slaHours) || 24,
                        technique: enterpriseForm.technique,
                        name: enterpriseForm.name.trim() || undefined,
                        company: enterpriseForm.company.trim() || undefined,
                        phone: enterpriseForm.phone.trim(),
                        province: enterpriseForm.province.trim(),
                      }),
                    });
                    let data: { success?: boolean; message?: string; credentials?: { username: string; password: string } } = {};
                    try {
                      data = await res.json();
                    } catch {
                      setRequestMessage({ type: 'error', text: t('visitorRequestForm.errorMessage') });
                      setRequestSubmitting(false);
                      return;
                    }
                    if (res.ok && data.success) {
                      if (data.credentials) setTicketCredentials(data.credentials);
                      setRequestMessage({ type: 'success', text: t('visitorRequestForm.successMessage') });
                      setEnterpriseForm({
                        siteName: '',
                        siteCoordinator: '',
                        slaHours: 24,
                        technique: 'maintenance',
                        name: '',
                        company: '',
                        phone: '',
                        province: '',
                      });
                    } else {
                      const msg = typeof data.message === 'string' && data.message.trim() ? data.message : t('visitorRequestForm.errorMessage');
                      setRequestMessage({ type: 'error', text: msg });
                    }
                  } catch {
                    setRequestMessage({ type: 'error', text: t('visitorRequestForm.errorMessage') });
                  } finally {
                    setRequestSubmitting(false);
                  }
                }}
                className="space-y-2 sm:space-y-3"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-gray-300 mb-0.5 sm:mb-1">{t('ticketForm.siteName')}</label>
                    <input
                      type="text"
                      value={enterpriseForm.siteName}
                      onChange={(e) => setEnterpriseForm((f) => ({ ...f, siteName: e.target.value }))}
                      placeholder={t('ticketForm.siteNamePlaceholder')}
                      className="w-full px-3 py-2 sm:py-2.5 bg-white/5 border border-white/10 rounded-lg sm:rounded-xl text-sm sm:text-base text-white placeholder-gray-500 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/30 outline-none transition-all"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-gray-300 mb-1">{t('ticketForm.siteCoordinator')}</label>
                    <input
                      type="text"
                      value={enterpriseForm.siteCoordinator}
                      onChange={(e) => setEnterpriseForm((f) => ({ ...f, siteCoordinator: e.target.value }))}
                      placeholder={t('ticketForm.siteCoordinatorPlaceholder')}
                      className="w-full px-3 py-2 sm:py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm sm:text-base text-white placeholder-gray-500 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/30 outline-none transition-all"
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-gray-300 mb-0.5 sm:mb-1">{t('ticketForm.slaHours')}</label>
                    <input
                      type="number"
                      min={1}
                      max={8760}
                      value={enterpriseForm.slaHours}
                      onChange={(e) => setEnterpriseForm((f) => ({ ...f, slaHours: parseInt(e.target.value, 10) || 24 }))}
                      className="w-full px-3 py-2 sm:py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm sm:text-base text-white placeholder-gray-500 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/30 outline-none transition-all"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-gray-300 mb-0.5 sm:mb-1">{t('ticketForm.techniqueLabel')}</label>
                    <select
                      value={enterpriseForm.technique}
                      onChange={(e) => setEnterpriseForm((f) => ({ ...f, technique: e.target.value }))}
                      className="w-full px-3 py-2 sm:py-2.5 bg-white/5 border border-white/10 rounded-lg sm:rounded-xl text-sm sm:text-base text-white focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/30 outline-none transition-all"
                      required
                    >
                      {ENTERPRISE_NETWORKING_TECH_KEYS.map((key) => (
                        <option key={key} value={key} className="bg-[#0f1419] text-white">
                          {t(`visitorRequestForm.enterpriseTechniques.${key}`)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-gray-300 mb-0.5 sm:mb-1">{t('visitorRequestForm.nameLabel')}</label>
                    <input
                      type="text"
                      value={enterpriseForm.name}
                      onChange={(e) => setEnterpriseForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder={t('visitorRequestForm.namePlaceholder')}
                      className="w-full px-3 py-2 sm:py-2.5 bg-white/5 border border-white/10 rounded-lg sm:rounded-xl text-sm sm:text-base text-white placeholder-gray-500 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/30 outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-gray-300 mb-1">{t('visitorRequestForm.companyLabel')}</label>
                    <input
                      type="text"
                      value={enterpriseForm.company}
                      onChange={(e) => setEnterpriseForm((f) => ({ ...f, company: e.target.value }))}
                      placeholder={t('visitorRequestForm.companyPlaceholder')}
                      className="w-full px-3 py-2 sm:py-2.5 bg-white/5 border border-white/10 rounded-lg sm:rounded-xl text-sm sm:text-base text-white placeholder-gray-500 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/30 outline-none transition-all"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-gray-300 mb-0.5 sm:mb-1">{t('visitorRequestForm.phoneLabel')}</label>
                    <input
                      type="tel"
                      value={enterpriseForm.phone}
                      onChange={(e) => setEnterpriseForm((f) => ({ ...f, phone: e.target.value }))}
                      placeholder="+964..."
                      className="w-full px-3 py-2 sm:py-2.5 bg-white/5 border border-white/10 rounded-lg sm:rounded-xl text-sm sm:text-base text-white placeholder-gray-500 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/30 outline-none transition-all"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-gray-300 mb-0.5 sm:mb-1">{t('visitorRequestForm.provinceLabel')}</label>
                    <input
                      type="text"
                      value={enterpriseForm.province}
                      onChange={(e) => setEnterpriseForm((f) => ({ ...f, province: e.target.value }))}
                      className="w-full px-3 py-2 sm:py-2.5 bg-white/5 border border-white/10 rounded-lg sm:rounded-xl text-sm sm:text-base text-white placeholder-gray-500 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/30 outline-none transition-all"
                      required
                    />
                  </div>
                </div>
                <div className="flex gap-2 pt-2 sm:pt-3">
                  <button
                    type="submit"
                    disabled={requestSubmitting}
                    className="flex-1 py-2.5 sm:py-3 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-all flex items-center justify-center gap-2 focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2 focus:ring-offset-[#0f1419]"
                  >
                    {requestSubmitting ? '...' : t('ticketForm.submitButton')}
                  </button>
                  <button type="button" onClick={() => setRequestModalOpen(false)} className="px-4 py-2.5 sm:px-5 sm:py-3 border border-white/20 rounded-lg text-sm text-gray-400 hover:text-white hover:border-white/30 transition-colors">
                    {t('visitorRequestForm.close')}
                  </button>
                </div>
              </form>
              );
              })()}
              </>}
              {showProgrammingTechnologies && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setRequestMessage(null);
                  setRequestSubmitting(true);
                  try {
                    const res = await fetch('/api/visitor-requests', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        phone: programmingForm.phone.trim(),
                        province: programmingForm.province.trim(),
                        technique: programmingForm.technique,
                        name: programmingForm.name.trim() || undefined,
                        company: programmingForm.company.trim() || undefined,
                        serviceSlug: slug,
                      }),
                    });
                    let data: { success?: boolean; message?: string } = {};
                    try {
                      data = await res.json();
                    } catch {
                      setRequestMessage({ type: 'error', text: t('visitorRequestForm.errorMessage') });
                      setRequestSubmitting(false);
                      return;
                    }
                    if (res.ok && data.success) {
                      setRequestMessage({ type: 'success', text: t('visitorRequestForm.successMessage') });
                      setProgrammingForm({ phone: '', province: '', technique: 'nodejs', name: '', company: '' });
                      setTimeout(() => { setRequestModalOpen(false); setRequestMessage(null); }, 2000);
                    } else {
                      const msg = typeof data.message === 'string' && data.message.trim() ? data.message : t('visitorRequestForm.errorMessage');
                      setRequestMessage({ type: 'error', text: msg });
                    }
                  } catch {
                    setRequestMessage({ type: 'error', text: t('visitorRequestForm.errorMessage') });
                  } finally {
                    setRequestSubmitting(false);
                  }
                }}
                className="space-y-2.5 sm:space-y-3"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-gray-300 mb-0.5 sm:mb-1">{t('visitorRequestForm.nameLabel')}</label>
                    <input
                      type="text"
                      value={programmingForm.name}
                      onChange={(e) => setProgrammingForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder={t('visitorRequestForm.namePlaceholder')}
                      className="w-full px-3 py-2 sm:py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm sm:text-base text-white placeholder-gray-500 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-gray-300 mb-0.5 sm:mb-1">{t('visitorRequestForm.companyLabel')}</label>
                    <input
                      type="text"
                      value={programmingForm.company}
                      onChange={(e) => setProgrammingForm((f) => ({ ...f, company: e.target.value }))}
                      placeholder={t('visitorRequestForm.companyPlaceholder')}
                      className="w-full px-3 py-2 sm:py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm sm:text-base text-white placeholder-gray-500 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 outline-none transition-all"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-300 mb-0.5 sm:mb-1">{t('visitorRequestForm.techniqueLabel')}</label>
                  <select
                    value={programmingForm.technique}
                    onChange={(e) => setProgrammingForm((f) => ({ ...f, technique: e.target.value }))}
                    className="w-full px-3 py-2 sm:py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm sm:text-base text-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 outline-none transition-all"
                    required
                  >
                    {PROGRAMMING_TECH_KEYS.map((key) => (
                      <option key={key} value={key} className="bg-[#0f1419] text-white">
                        {t(`visitorRequestForm.programmingTechniques.${key}`)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-gray-300 mb-0.5 sm:mb-1">{t('visitorRequestForm.phoneLabel')}</label>
                    <input
                      type="tel"
                      value={programmingForm.phone}
                      onChange={(e) => setProgrammingForm((f) => ({ ...f, phone: e.target.value }))}
                      placeholder="+964..."
                      className="w-full px-3 py-2 sm:py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm sm:text-base text-white placeholder-gray-500 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 outline-none transition-all"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-gray-300 mb-0.5 sm:mb-1">{t('visitorRequestForm.provinceLabel')}</label>
                    <input
                      type="text"
                      value={programmingForm.province}
                      onChange={(e) => setProgrammingForm((f) => ({ ...f, province: e.target.value }))}
                      className="w-full px-3 py-2 sm:py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm sm:text-base text-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 outline-none transition-all"
                      required
                    />
                  </div>
                </div>
                <div className="flex gap-2 pt-2 sm:pt-3">
                  <button
                    type="submit"
                    disabled={requestSubmitting}
                    className="flex-1 py-2.5 sm:py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-all flex items-center justify-center gap-2 focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 focus:ring-offset-[#0f1419]"
                  >
                    {requestSubmitting ? '...' : t('visitorRequestForm.submitButton')}
                  </button>
                  <button type="button" onClick={() => setRequestModalOpen(false)} className="px-4 py-2.5 sm:px-5 sm:py-3 border border-white/20 rounded-lg text-sm text-gray-400 hover:text-white hover:border-white/30 transition-colors">
                    {t('visitorRequestForm.close')}
                  </button>
                </div>
              </form>
              )}
              {showCleanEnergyTechnologies && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setRequestMessage(null);
                  setRequestSubmitting(true);
                  try {
                    const res = await fetch('/api/visitor-requests', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        phone: cleanEnergyForm.phone.trim(),
                        email: cleanEnergyForm.email.trim(),
                        currentAmps: parseFloat(cleanEnergyForm.currentAmps) || 0,
                        kwh: parseFloat(cleanEnergyForm.kwh) || 0,
                        serviceSlug: CLEAN_ENERGY_SLUG,
                      }),
                    });
                    let data: { success?: boolean; message?: string } = {};
                    try {
                      data = await res.json();
                    } catch {
                      setRequestMessage({ type: 'error', text: t('visitorRequestForm.errorMessage') });
                      setRequestSubmitting(false);
                      return;
                    }
                    if (res.ok && data.success) {
                      setRequestMessage({ type: 'success', text: t('visitorRequestForm.successMessage') });
                      setCleanEnergyForm({ phone: '', email: '', currentAmps: '', kwh: '' });
                      setTimeout(() => { setRequestModalOpen(false); setRequestMessage(null); }, 2000);
                    } else {
                      const msg = typeof data.message === 'string' && data.message.trim() ? data.message : t('visitorRequestForm.errorMessage');
                      setRequestMessage({ type: 'error', text: msg });
                    }
                  } catch {
                    setRequestMessage({ type: 'error', text: t('visitorRequestForm.errorMessage') });
                  } finally {
                    setRequestSubmitting(false);
                  }
                }}
                className="space-y-2.5 sm:space-y-3"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-gray-300 mb-0.5 sm:mb-1">{t('cleanEnergyTechnologies.phoneLabel')}</label>
                    <input
                      type="tel"
                      value={cleanEnergyForm.phone}
                      onChange={(e) => setCleanEnergyForm((f) => ({ ...f, phone: e.target.value }))}
                      placeholder="+964..."
                      className="w-full px-3 py-2 sm:py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-gray-500 focus:border-amber-500 outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-gray-300 mb-0.5 sm:mb-1">{t('cleanEnergyTechnologies.emailLabel')}</label>
                    <input
                      type="email"
                      value={cleanEnergyForm.email}
                      onChange={(e) => setCleanEnergyForm((f) => ({ ...f, email: e.target.value }))}
                      placeholder="you@example.com"
                      className="w-full px-3 py-2 sm:py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-gray-500 focus:border-amber-500 outline-none"
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-gray-300 mb-0.5 sm:mb-1">{t('cleanEnergyTechnologies.currentLabel')} (A)</label>
                    <input
                      type="number"
                      min="0.1"
                      step="0.1"
                      value={cleanEnergyForm.currentAmps}
                      onChange={(e) => setCleanEnergyForm((f) => ({ ...f, currentAmps: e.target.value }))}
                      placeholder="e.g. 10"
                      className="w-full px-3 py-2 sm:py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-gray-500 focus:border-amber-500 outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-gray-300 mb-0.5 sm:mb-1">{t('cleanEnergyTechnologies.kwhLabel')} (kWh)</label>
                    <input
                      type="number"
                      min="0.1"
                      step="0.1"
                      value={cleanEnergyForm.kwh}
                      onChange={(e) => setCleanEnergyForm((f) => ({ ...f, kwh: e.target.value }))}
                      placeholder="e.g. 5"
                      className="w-full px-3 py-2 sm:py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-gray-500 focus:border-amber-500 outline-none"
                      required
                    />
                  </div>
                </div>
                <div className="flex gap-2 pt-2 sm:pt-3">
                  <button
                    type="submit"
                    disabled={requestSubmitting}
                    className="flex-1 py-2.5 sm:py-3 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-sm font-semibold rounded-lg"
                  >
                    {requestSubmitting ? '...' : t('visitorRequestForm.submitButton')}
                  </button>
                  <button type="button" onClick={() => setRequestModalOpen(false)} className="px-4 py-2.5 sm:px-5 sm:py-3 border border-white/20 rounded-lg text-sm text-gray-400 hover:text-white hover:border-white/30">
                    {t('visitorRequestForm.close')}
                  </button>
                </div>
              </form>
              )}
            </div>
          </div>
        )}

        {/* Related projects */}
        <section>
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
            <FolderOpen className="w-7 h-7 text-blue-400" />
            {t('serviceDetail.relatedProjects', { count: projects.length })}
          </h2>
          {projects.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-white/5 p-12 text-center text-gray-500">
              {t('serviceDetail.noProjectsInCategory')}
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {projects.map((p) => (
                <div
                  key={p.id}
                  className="rounded-xl border border-white/10 bg-white/5 p-6 hover:border-white/20 transition-colors"
                >
                  {p.imageUrl && (
                    <div className="aspect-video rounded-lg overflow-hidden mb-4 bg-white/5">
                      <img src={p.imageUrl} alt="" className="w-full h-full object-cover" />
                    </div>
                  )}
                  <div className="flex items-center gap-2 mb-2">
                    <span className="px-2 py-0.5 text-xs font-medium bg-blue-500/20 text-blue-400 rounded">
                      {['PLANNING', 'IN_PROGRESS', 'COMPLETED', 'ON_HOLD'].includes(p.status)
                        ? t(`serviceDetail.projectStatus.${p.status}` as 'PLANNING' | 'IN_PROGRESS' | 'COMPLETED' | 'ON_HOLD')
                        : p.status}
                    </span>
                    {p.year && <span className="text-xs text-gray-500">{p.year}</span>}
                  </div>
                  <h3 className="text-lg font-semibold mb-2">{p.title}</h3>
                  <p className="text-sm text-gray-400 line-clamp-2">{p.description}</p>
                  {(p.client || p.user?.name) && (
                    <p className="text-xs text-gray-500 mt-2">{t('serviceDetail.clientLabel')}: {p.client || p.user?.name}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Sticky floating buttons - right bottom */}
        {showRequestButton && (
          <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-3">
            {showDashboardButtons && (
              <Link
                href={dashboardHref}
                className={`flex items-center gap-2 px-4 py-3 sm:px-5 text-sm sm:text-base font-semibold rounded-full shadow-lg transition-all min-h-[48px] ${
                  showQualityControlTechnologies
                    ? 'bg-white/10 hover:bg-white/20 border border-amber-500/40 text-amber-400 shadow-amber-500/20'
                    : 'bg-white/10 hover:bg-white/20 border border-cyan-500/40 text-cyan-400 shadow-cyan-500/20'
                }`}
                aria-label={t('ticketForm.dashboardButton')}
              >
                <LayoutDashboard className="w-5 h-5 shrink-0" />
                <span>{t('ticketForm.dashboardButton')}</span>
              </Link>
            )}
            <button
              type="button"
              onClick={() => setRequestModalOpen(true)}
              className={`flex items-center gap-2 px-4 py-3 sm:px-5 text-sm sm:text-base font-semibold rounded-full shadow-lg transition-all min-h-[48px] ${
                showQualityControlTechnologies || showCleanEnergyTechnologies
                  ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-500/30 hover:shadow-amber-500/40'
                  : showEnterpriseNetworkingTechnologies
                    ? 'bg-cyan-600 hover:bg-cyan-500 shadow-cyan-500/30 hover:shadow-cyan-500/40'
                    : showProgrammingTechnologies
                      ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-500/30 hover:shadow-emerald-500/40'
                      : 'bg-blue-600 hover:bg-blue-500 shadow-blue-500/30 hover:shadow-blue-500/40'
              } text-white`}
              aria-label={showDashboardButtons ? t('companyRequest.createDashboard') : t('visitorRequestForm.title')}
            >
              <Send className="w-5 h-5 shrink-0" />
              <span>
                {showDashboardButtons ? t('companyRequest.createDashboard') : t('visitorRequestForm.submitButton')}
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
