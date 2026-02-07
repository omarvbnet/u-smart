'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeftIcon,
  UserCircleIcon,
  EnvelopeIcon,
  PhoneIcon,
  DocumentTextIcon,
  BriefcaseIcon,
  CalendarIcon,
  ArrowDownTrayIcon,
} from '@heroicons/react/24/outline';

type Application = {
  id: string;
  name: string;
  email: string;
  phone: string;
  coverLetter: string | null;
  resumeUrl: string;
  status: string;
  careerId: string;
  createdAt: string;
  career: {
    id: string;
    title: string;
    slug: string;
    department: string;
    location: string;
  };
};

export default function AdminApplicationDetailPage() {
  const params = useParams();
  const id = typeof params?.id === 'string' ? params.id : '';
  const [application, setApplication] = useState<Application | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/admin/applications/${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.application) setApplication(data.application);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  if (loading || !application) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30 flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const formatDate = (s: string) => {
    try {
      return new Date(s).toLocaleString();
    } catch {
      return s;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30">
      <div className="p-6 lg:p-8 max-w-4xl mx-auto">
        <Link
          href="/admin/applications"
          className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-8"
        >
          <ArrowLeftIcon className="w-5 h-5" />
          Back to Applications
        </Link>

        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 to-cyan-600 px-6 py-8 text-white">
            <h1 className="text-2xl font-bold">Applicant Details</h1>
            <p className="text-blue-100 mt-1">{application.name}</p>
            <span
              className={`inline-block mt-3 px-3 py-1 rounded-full text-sm font-medium ${
                application.status === 'PENDING'
                  ? 'bg-amber-500/30'
                  : application.status === 'ACCEPTED'
                    ? 'bg-emerald-500/30'
                    : application.status === 'REJECTED'
                      ? 'bg-red-500/30'
                      : 'bg-white/20'
              }`}
            >
              {application.status}
            </span>
          </div>

          <div className="p-6 space-y-8">
            <section>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                <UserCircleIcon className="w-4 h-4" />
                Applicant Information
              </h2>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Full Name</p>
                  <p className="font-medium text-gray-900">{application.name}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Email</p>
                  <a
                    href={`mailto:${application.email}`}
                    className="font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1"
                  >
                    <EnvelopeIcon className="w-4 h-4" />
                    {application.email}
                  </a>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Phone</p>
                  <a
                    href={`tel:${application.phone}`}
                    className="font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1"
                  >
                    <PhoneIcon className="w-4 h-4" />
                    {application.phone}
                  </a>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                <BriefcaseIcon className="w-4 h-4" />
                Applied Position
              </h2>
              <div className="flex flex-wrap gap-2">
                <span className="px-3 py-1.5 bg-blue-100 text-blue-800 rounded-lg font-medium">
                  {application.career?.title ?? '—'}
                </span>
                <span className="text-sm text-gray-600">
                  {application.career?.department} • {application.career?.location}
                </span>
              </div>
            </section>

            <section>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                <CalendarIcon className="w-4 h-4" />
                Applied At
              </h2>
              <p className="text-gray-900">{formatDate(application.createdAt)}</p>
            </section>

            {application.resumeUrl && (
              <section>
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <DocumentTextIcon className="w-4 h-4" />
                  Resume
                </h2>
                <a
                  href={application.resumeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                >
                  <ArrowDownTrayIcon className="w-5 h-5" />
                  View / Download Resume
                </a>
              </section>
            )}

            {application.coverLetter && (
              <section>
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <DocumentTextIcon className="w-4 h-4" />
                  Cover Letter
                </h2>
                <div className="p-4 bg-gray-50 rounded-xl">
                  <p className="text-gray-700 whitespace-pre-wrap">{application.coverLetter}</p>
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
