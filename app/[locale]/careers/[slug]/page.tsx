'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/routing';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Briefcase,
  MapPin,
  Building,
  Clock,
  DollarSign,
  CheckCircle2,
  Upload,
  Loader2,
} from 'lucide-react';
import { uploadWithProgress } from '@/lib/upload-with-progress';

type Career = {
  id: string;
  title: string;
  slug: string;
  description: string;
  department: string;
  location: string;
  jobType: string;
  experience: string;
  salaryRange: string | null;
  remote: boolean;
  requirements: string[];
  benefits: string[];
};

const JOB_TYPE_LABELS: Record<string, string> = {
  FULL_TIME: 'Full-time',
  PART_TIME: 'Part-time',
  CONTRACT: 'Contract',
  INTERNSHIP: 'Internship',
  REMOTE: 'Remote',
};

const ALLOWED_RESUME_TYPES = ['.pdf', '.jpg', '.jpeg', '.png'];
const MAX_RESUME_SIZE = 5 * 1024 * 1024; // 5MB

export default function CareerDetailPage() {
  const t = useTranslations('Index');
  const locale = useLocale();
  const params = useParams();
  const slug = typeof params?.slug === 'string' ? params.slug : Array.isArray(params?.slug) ? params.slug[0] : '';
  const [career, setCareer] = useState<Career | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({ name: '', email: '', phone: '', coverLetter: '' });
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumeUrl, setResumeUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    fetch(`/api/careers/${slug}?locale=${encodeURIComponent(locale)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.career) setCareer(data.career);
        else setError('Job not found');
      })
      .catch(() => setError('Failed to load job'))
      .finally(() => setLoading(false));
  }, [slug, locale]);

  const handleResumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = '.' + (file.name.split('.').pop() ?? '').toLowerCase();
    if (!ALLOWED_RESUME_TYPES.includes(ext)) {
      setSubmitError('Please upload PDF, JPEG, or PNG (max 5MB)');
      return;
    }
    if (file.size > MAX_RESUME_SIZE) {
      setSubmitError('File too large (max 5MB)');
      return;
    }
    setSubmitError(null);
    setResumeFile(file);
    setResumeUrl(null);
  };

  const uploadResume = async () => {
    if (!resumeFile) return null;
    setUploading(true);
    setUploadProgress(0);
    try {
      const data = await uploadWithProgress('/api/upload/resume', resumeFile, {
        onProgress: (p) => setUploadProgress(p),
      });
      if (data.success && data.url) {
        setResumeUrl(data.url);
        return data.url;
      }
      throw new Error(data.message ?? 'Upload failed');
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Upload failed');
      return null;
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    if (!career) return;
    let url = resumeUrl;
    if (resumeFile && !url) {
      url = await uploadResume();
      if (!url) return;
    }
    if (!url) {
      setSubmitError('Please upload your resume');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          coverLetter: form.coverLetter.trim() || null,
          resumeUrl: url,
          careerId: career.id,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSubmitSuccess(true);
        setForm({ name: '', email: '', phone: '', coverLetter: '' });
        setResumeFile(null);
        setResumeUrl(null);
      } else {
        setSubmitError(data.message ?? 'Failed to submit');
      }
    } catch {
      setSubmitError('Failed to submit application');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !career) {
    return (
      <div className="min-h-screen bg-[#0A0A0F] text-white flex items-center justify-center">
        {loading ? (
          <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        ) : (
          <div className="text-center">
            <p className="text-gray-400 mb-6">{error ?? 'Job not found'}</p>
            <Link href="/careers" className="text-blue-400 hover:text-blue-300">
              ← Back to Careers
            </Link>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-20">
        <Link
          href="/careers"
          className="inline-flex items-center gap-2 text-gray-400 hover:text-white mb-8 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('careers.backToHome') || 'Back to Careers'}
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-12"
        >
          <h1 className="text-3xl md:text-4xl font-bold mb-4">{career.title}</h1>
          <div className="flex flex-wrap gap-4 text-sm text-gray-400">
            <span className="flex items-center gap-1.5">
              <Building className="w-4 h-4" />
              {career.department}
            </span>
            <span className="flex items-center gap-1.5">
              <MapPin className="w-4 h-4" />
              {career.location}
              {career.remote && ' (Remote)'}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="w-4 h-4" />
              {JOB_TYPE_LABELS[career.jobType] ?? career.jobType}
            </span>
            {career.salaryRange && (
              <span className="flex items-center gap-1.5">
                <DollarSign className="w-4 h-4" />
                {career.salaryRange}
              </span>
            )}
          </div>
          {career.experience && (
            <p className="text-gray-400 mt-2">Experience: {career.experience}</p>
          )}
        </motion.div>

        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <section>
              <h2 className="text-xl font-semibold mb-4">About the Role</h2>
              <p className="text-gray-400 leading-relaxed whitespace-pre-wrap">{career.description}</p>
            </section>

            {career.requirements && career.requirements.length > 0 && (
              <section>
                <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                  <Briefcase className="w-5 h-5 text-blue-400" />
                  Requirements
                </h2>
                <ul className="space-y-2">
                  {career.requirements.map((req, i) => (
                    <li key={i} className="flex items-start gap-2 text-gray-400">
                      <CheckCircle2 className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                      {req}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {career.benefits && career.benefits.length > 0 && (
              <section>
                <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                  Benefits
                </h2>
                <ul className="space-y-2">
                  {career.benefits.map((ben, i) => (
                    <li key={i} className="flex items-start gap-2 text-gray-400">
                      <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                      {ben}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          <div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 sticky top-8">
              <h2 className="text-xl font-semibold mb-6">Apply for this position</h2>
              {submitSuccess ? (
                <div className="py-8 text-center">
                  <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
                  <p className="text-green-400 font-medium mb-2">Application submitted!</p>
                  <p className="text-gray-400 text-sm mb-6">We will review your application and get back to you.</p>
                  <button
                    type="button"
                    onClick={() => setSubmitSuccess(false)}
                    className="text-blue-400 hover:text-blue-300 text-sm"
                  >
                    Submit another application
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1.5">Name *</label>
                    <input
                      type="text"
                      required
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      className="w-full px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                      placeholder="Your full name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1.5">Email *</label>
                    <input
                      type="email"
                      required
                      value={form.email}
                      onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                      className="w-full px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                      placeholder="your@email.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1.5">Phone *</label>
                    <input
                      type="tel"
                      required
                      value={form.phone}
                      onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                      className="w-full px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                      placeholder="+964 xxx xxx xxxx"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1.5">Resume * (PDF, JPEG, PNG, max 5MB)</label>
                    <label className={`flex items-center justify-center gap-2 w-full px-4 py-3 rounded-lg border border-dashed transition-colors ${uploading ? 'bg-white/5 border-white/20 cursor-not-allowed opacity-80' : 'bg-white/5 border-white/20 hover:border-blue-500/50 cursor-pointer'}`}>
                      <Upload className="w-4 h-4 text-gray-500 shrink-0" />
                      <span className="text-sm text-gray-400">
                        {uploading ? `Uploading${uploadProgress != null ? ` ${uploadProgress}%` : '…'}` : resumeFile ? resumeFile.name : resumeUrl ? 'Uploaded ✓' : 'Choose file'}
                      </span>
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={handleResumeChange}
                        className="hidden"
                        disabled={uploading}
                      />
                    </label>
                    {uploading && uploadProgress != null && (
                      <div className="mt-1.5 h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full transition-all duration-200" style={{ width: `${uploadProgress}%` }} />
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1.5">Cover letter (optional)</label>
                    <textarea
                      rows={4}
                      value={form.coverLetter}
                      onChange={(e) => setForm((f) => ({ ...f, coverLetter: e.target.value }))}
                      className="w-full px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none resize-none"
                      placeholder="Tell us why you're a great fit..."
                    />
                  </div>
                  {submitError && (
                    <p className="text-sm text-red-400">{submitError}</p>
                  )}
                  <button
                    type="submit"
                    disabled={submitting || uploading}
                    className="w-full px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg font-medium text-white hover:shadow-lg hover:shadow-blue-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {(submitting || uploading) ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                        {uploading ? `Uploading${uploadProgress != null ? ` ${uploadProgress}%` : '…'}` : 'Submitting...'}
                      </>
                    ) : (
                      t('careers.apply')
                    )}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
