'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  Loader2,
  HardHat,
  Wrench,
  UploadCloud,
  FileText,
  X,
  CheckCircle2,
  ShieldCheck,
} from 'lucide-react';

const IRAQ_PROVINCES = [
  'Baghdad',
  'Basra',
  'Nineveh',
  'Erbil',
  'Sulaymaniyah',
  'Duhok',
  'Kirkuk',
  'Diyala',
  'Anbar',
  'Babylon',
  'Karbala',
  'Najaf',
  'Wasit',
  'Maysan',
  'Dhi Qar',
  'Muthanna',
  'Qadisiyyah',
  'Saladin',
  'Halabja',
];

const SPECIALIZATIONS = [
  { value: 'ELECTRICAL', label: 'Electrical' },
  { value: 'MECHANICAL', label: 'Mechanical' },
  { value: 'CIVIL', label: 'Civil' },
  { value: 'TELECOM', label: 'Telecom' },
  { value: 'PROGRAMMER', label: 'Programmer' },
];

const UPLOAD_URL = '/api/upload/registration-evidence';
const MAX_CERTIFICATES = 6;

type UploadedFile = { name: string; url: string };

async function uploadOne(file: File): Promise<string> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(UPLOAD_URL, { method: 'POST', body: fd });
  const data = await res.json();
  if (!res.ok || !data.success || !data.url) {
    throw new Error(data.message || 'Upload failed');
  }
  return data.url as string;
}

export default function StaffRegistrationPage() {
  const [role, setRole] = useState<'ENGINEER' | 'TECHNICIAN'>('ENGINEER');
  const [legalName, setLegalName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [specialization, setSpecialization] = useState('');
  const [province, setProvince] = useState('');

  const [idDoc, setIdDoc] = useState<UploadedFile | null>(null);
  const [idUploading, setIdUploading] = useState(false);
  const [certificates, setCertificates] = useState<UploadedFile[]>([]);
  const [certUploading, setCertUploading] = useState(false);

  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const idInputRef = useRef<HTMLInputElement>(null);
  const certInputRef = useRef<HTMLInputElement>(null);

  const handleIdUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setIdUploading(true);
    try {
      const url = await uploadOne(file);
      setIdDoc({ name: file.name, url });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload the ID document.');
    } finally {
      setIdUploading(false);
      if (idInputRef.current) idInputRef.current.value = '';
    }
  };

  const handleCertUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setError('');
    setCertUploading(true);
    try {
      const room = MAX_CERTIFICATES - certificates.length;
      const toUpload = files.slice(0, Math.max(0, room));
      const uploaded: UploadedFile[] = [];
      for (const file of toUpload) {
        const url = await uploadOne(file);
        uploaded.push({ name: file.name, url });
      }
      setCertificates((prev) => [...prev, ...uploaded]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload a certificate.');
    } finally {
      setCertUploading(false);
      if (certInputRef.current) certInputRef.current.value = '';
    }
  };

  const removeCertificate = (idx: number) => {
    setCertificates((prev) => prev.filter((_, i) => i !== idx));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!legalName.trim() || !dateOfBirth || !email.trim() || !phone.trim() || !province) {
      setError('Please fill in all required fields.');
      return;
    }
    if (!specialization) {
      setError('Please select your specialization.');
      return;
    }
    if (!idDoc) {
      setError('Please attach your ID document.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/staff-registrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          legalName: legalName.trim(),
          dateOfBirth,
          email: email.trim(),
          phone: phone.trim(),
          role,
          specialization,
          province,
          idDocumentUrl: idDoc.url,
          certificateUrls: certificates.map((c) => c.url),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setDone(true);
      } else {
        setError(data.message || 'Failed to submit your request.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    'w-full rounded-xl bg-black/40 border border-white/10 px-4 py-3 text-white placeholder-gray-500 focus:border-amber-500/50 focus:outline-none focus:ring-1 focus:ring-amber-500/30 transition';
  const labelClass = 'block text-sm font-medium text-gray-300 mb-2';

  if (done) {
    return (
      <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
            <CheckCircle2 className="h-9 w-9" />
          </div>
          <h1 className="text-2xl font-bold text-white">Request submitted</h1>
          <p className="mt-3 text-gray-400">
            Thank you. Our team will review your application and email you at{' '}
            <span className="text-amber-300">{email}</span> once a decision is made. If approved,
            you&apos;ll receive a username and password to sign in to the Provisor app.
          </p>
          <Link
            href="/proviser/login"
            className="mt-8 inline-block rounded-xl bg-amber-500 px-6 py-3 font-semibold text-black hover:bg-amber-400"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0A0A0F] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/2 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-amber-500/15 blur-[120px]" />
      </div>

      <div className="relative mx-auto max-w-2xl px-5 py-12 sm:py-16">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="relative mb-5">
            <div className="absolute inset-0 -z-10 rounded-[24px] bg-amber-400/30 blur-2xl" />
            <Image
              src="/app/provisor-logo.png"
              alt="Provisor"
              width={88}
              height={88}
              className="h-20 w-20 rounded-[22px] border border-white/10 shadow-2xl"
              priority
            />
          </div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Join <span className="text-amber-400">Provisor</span> as staff
          </h1>
          <p className="mt-3 max-w-lg text-gray-400">
            Apply to register as a field engineer or technician. After our team reviews and
            approves your application, you&apos;ll receive sign-in credentials by email for the
            Provisor app.
          </p>
        </div>

        <form
          onSubmit={submit}
          className="rounded-2xl border border-white/10 bg-[#0f1419] p-6 shadow-xl sm:p-8"
        >
          {error && (
            <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/15 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          {/* Education / role */}
          <div className="mb-6">
            <span className={labelClass}>Education / role</span>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setRole('ENGINEER')}
                className={`flex items-center justify-center gap-2 rounded-xl border py-3 text-sm font-medium transition ${
                  role === 'ENGINEER'
                    ? 'border-amber-500/50 bg-amber-500/10 text-amber-300'
                    : 'border-white/10 text-gray-400 hover:border-white/25'
                }`}
              >
                <HardHat className="h-4 w-4" />
                Engineer
              </button>
              <button
                type="button"
                onClick={() => setRole('TECHNICIAN')}
                className={`flex items-center justify-center gap-2 rounded-xl border py-3 text-sm font-medium transition ${
                  role === 'TECHNICIAN'
                    ? 'border-amber-500/50 bg-amber-500/10 text-amber-300'
                    : 'border-white/10 text-gray-400 hover:border-white/25'
                }`}
              >
                <Wrench className="h-4 w-4" />
                Technician
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={labelClass} htmlFor="legalName">
                Legal full name <span className="text-amber-400">*</span>
              </label>
              <input
                id="legalName"
                type="text"
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
                placeholder="As written on your ID"
                className={inputClass}
                required
              />
            </div>

            <div>
              <label className={labelClass} htmlFor="dob">
                Date of birth <span className="text-amber-400">*</span>
              </label>
              <input
                id="dob"
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                max={new Date().toISOString().slice(0, 10)}
                className={`${inputClass} [color-scheme:dark]`}
                required
              />
            </div>

            <div>
              <label className={labelClass} htmlFor="specialization">
                Specialization <span className="text-amber-400">*</span>
              </label>
              <select
                id="specialization"
                value={specialization}
                onChange={(e) => setSpecialization(e.target.value)}
                className={inputClass}
                required
              >
                <option value="" disabled>
                  Select specialization
                </option>
                {SPECIALIZATIONS.map((s) => (
                  <option key={s.value} value={s.value} className="bg-[#0f1419]">
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass} htmlFor="email">
                Email <span className="text-amber-400">*</span>
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className={inputClass}
                required
              />
            </div>

            <div>
              <label className={labelClass} htmlFor="phone">
                Phone number <span className="text-amber-400">*</span>
              </label>
              <input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+964..."
                className={inputClass}
                required
              />
            </div>

            <div className="sm:col-span-2">
              <label className={labelClass} htmlFor="province">
                Province <span className="text-amber-400">*</span>
              </label>
              <select
                id="province"
                value={province}
                onChange={(e) => setProvince(e.target.value)}
                className={inputClass}
                required
              >
                <option value="" disabled>
                  Select province
                </option>
                {IRAQ_PROVINCES.map((p) => (
                  <option key={p} value={p} className="bg-[#0f1419]">
                    {p}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* ID document */}
          <div className="mt-6">
            <span className={labelClass}>
              ID document <span className="text-amber-400">*</span>
            </span>
            <input
              ref={idInputRef}
              type="file"
              accept=".pdf,image/jpeg,image/png,image/webp"
              onChange={handleIdUpload}
              className="hidden"
            />
            {idDoc ? (
              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/30 px-4 py-3">
                <span className="flex items-center gap-2 truncate text-sm text-gray-200">
                  <FileText className="h-4 w-4 shrink-0 text-amber-400" />
                  <span className="truncate">{idDoc.name}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setIdDoc(null)}
                  className="ml-3 shrink-0 text-gray-400 hover:text-red-400"
                  aria-label="Remove ID document"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => idInputRef.current?.click()}
                disabled={idUploading}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 bg-black/20 px-4 py-4 text-sm text-gray-400 transition hover:border-amber-500/40 hover:text-amber-300 disabled:opacity-50"
              >
                {idUploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <UploadCloud className="h-4 w-4" />
                )}
                {idUploading ? 'Uploading...' : 'Upload ID (PDF or image, max 5MB)'}
              </button>
            )}
          </div>

          {/* Certificates */}
          <div className="mt-6">
            <span className={labelClass}>
              Certificates{' '}
              <span className="text-gray-500">(optional, up to {MAX_CERTIFICATES})</span>
            </span>
            <input
              ref={certInputRef}
              type="file"
              accept=".pdf,image/jpeg,image/png,image/webp"
              multiple
              onChange={handleCertUpload}
              className="hidden"
            />
            {certificates.length > 0 && (
              <ul className="mb-3 space-y-2">
                {certificates.map((c, i) => (
                  <li
                    key={`${c.url}-${i}`}
                    className="flex items-center justify-between rounded-xl border border-white/10 bg-black/30 px-4 py-2.5"
                  >
                    <span className="flex items-center gap-2 truncate text-sm text-gray-200">
                      <FileText className="h-4 w-4 shrink-0 text-amber-400" />
                      <span className="truncate">{c.name}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => removeCertificate(i)}
                      className="ml-3 shrink-0 text-gray-400 hover:text-red-400"
                      aria-label="Remove certificate"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {certificates.length < MAX_CERTIFICATES && (
              <button
                type="button"
                onClick={() => certInputRef.current?.click()}
                disabled={certUploading}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 bg-black/20 px-4 py-4 text-sm text-gray-400 transition hover:border-amber-500/40 hover:text-amber-300 disabled:opacity-50"
              >
                {certUploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <UploadCloud className="h-4 w-4" />
                )}
                {certUploading ? 'Uploading...' : 'Add certificates (PDF or images)'}
              </button>
            )}
          </div>

          <button
            type="submit"
            disabled={submitting || idUploading || certUploading}
            className="mt-8 flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 py-3.5 font-semibold text-black transition hover:bg-amber-400 disabled:opacity-50"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitting ? 'Submitting...' : 'Submit registration request'}
          </button>

          <p className="mt-4 flex items-center justify-center gap-2 text-center text-xs text-gray-500">
            <ShieldCheck className="h-3.5 w-3.5 text-amber-400/70" />
            Your documents are used only to verify your application.
          </p>
        </form>

        <p className="mt-6 text-center text-xs text-gray-600">
          Already have an account?{' '}
          <Link href="/proviser/login" className="text-amber-400 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
