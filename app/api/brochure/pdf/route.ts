import { NextRequest, NextResponse } from 'next/server';
import { generateBrochurePdf, type BrochureMessages } from '@/lib/brochure-pdf';
import en from '@/messages/en.json';
import ar from '@/messages/ar.json';
import ku from '@/messages/ku.json';
import tr from '@/messages/tr.json';

const LOCALES = ['ar', 'en', 'ku', 'tr'] as const;
const MESSAGES: Record<(typeof LOCALES)[number], { Brochure?: BrochureMessages }> = {
  en: en as { Brochure?: BrochureMessages },
  ar: ar as { Brochure?: BrochureMessages },
  ku: ku as { Brochure?: BrochureMessages },
  tr: tr as { Brochure?: BrochureMessages },
};

function getLocale(locale: string | null): (typeof LOCALES)[number] {
  if (locale && LOCALES.includes(locale as (typeof LOCALES)[number])) {
    return locale as (typeof LOCALES)[number];
  }
  return 'en';
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const locale = getLocale(searchParams.get('locale'));
    const serviceSlug = searchParams.get('service') || undefined;
    const baseUrl = searchParams.get('baseUrl') || req.nextUrl.origin;

    const messages = MESSAGES[locale]?.Brochure;

    if (!messages || typeof messages !== 'object') {
      return NextResponse.json(
        { success: false, message: 'Brochure messages not found for locale' },
        { status: 400 }
      );
    }

    const pdfBuffer = await generateBrochurePdf(messages, {
      locale,
      baseUrl,
      serviceSlug: serviceSlug || null,
    });

    const filename = `U-Smart-Profile-${locale}${serviceSlug ? `-${serviceSlug}` : ''}.pdf`;

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    console.error('Brochure PDF generation failed:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to generate brochure PDF' },
      { status: 500 }
    );
  }
}
