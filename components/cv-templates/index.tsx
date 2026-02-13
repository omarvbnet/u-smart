'use client';

import type { CVData } from '@/lib/cv-types';
import type { CVTemplateId } from '@/lib/cv-types';
import CVTemplateModern from './CVTemplateModern';
import CVTemplateClassic from './CVTemplateClassic';
import CVTemplateMinimal from './CVTemplateMinimal';

export type CVTemplateProps = { data: CVData; locale: string };

const templates: Record<CVTemplateId, React.ComponentType<CVTemplateProps>> = {
  modern: CVTemplateModern,
  classic: CVTemplateClassic,
  minimal: CVTemplateMinimal,
};

export default function CVTemplateRenderer({
  templateId,
  data,
  locale = 'en',
}: {
  templateId: CVTemplateId;
  data: CVData;
  locale?: string;
}) {
  const Template = templates[templateId] ?? CVTemplateModern;
  return <Template data={data} locale={locale} />;
}

export { CVTemplateModern, CVTemplateClassic, CVTemplateMinimal };
