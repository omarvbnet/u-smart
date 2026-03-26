import { NextResponse } from 'next/server';
import { access } from 'node:fs/promises';
import path from 'node:path';

const CANDIDATE_APK_NAMES = [
  'usmart_qc.apk',
  'proviser.apk',
  'provisor.apk',
  'app-release.apk',
];

function normalizeUrl(raw: string): string {
  const v = raw.trim();
  if (!v) return '';
  if (v.startsWith('http://') || v.startsWith('https://')) return v;
  return v.startsWith('/') ? v : `/${v}`;
}

export async function GET() {
  const configured =
    normalizeUrl(process.env.QC_APP_ANDROID_URL || '') ||
    normalizeUrl(process.env.NEXT_PUBLIC_QC_APP_ANDROID_URL || '');

  if (configured) {
    return NextResponse.redirect(configured, { status: 302 });
  }

  const publicAppDir = path.join(process.cwd(), 'public', 'app');
  for (const fileName of CANDIDATE_APK_NAMES) {
    try {
      await access(path.join(publicAppDir, fileName));
      return NextResponse.redirect(`/app/${fileName}`, { status: 302 });
    } catch {
      // try next file candidate
    }
  }

  return NextResponse.json(
    {
      success: false,
      message:
        'Android app package not found. Upload an APK to public/app or set QC_APP_ANDROID_URL.',
    },
    { status: 404 }
  );
}
