'use client';

import type { CVData, CVLabels, CVTemplateId } from '@/lib/cv-types';
import CVTemplateModern from './CVTemplateModern';
import CVTemplateClassic from './CVTemplateClassic';
import CVTemplateMinimal from './CVTemplateMinimal';

export type CVTemplateProps = { data: CVData; locale: string; labels: CVLabels };

const templates: Record<CVTemplateId, React.ComponentType<CVTemplateProps>> = {
  modern: CVTemplateModern,
  classic: CVTemplateClassic,
  minimal: CVTemplateMinimal,
};

export default function CVTemplateRenderer({
  templateId,
  data,
  locale = 'en',
  labels,
}: {
  templateId: CVTemplateId;
  data: CVData;
  locale?: string;
  labels: CVLabels;
}) {
  const Template = templates[templateId] ?? CVTemplateModern;
  return <Template data={data} locale={locale} labels={labels} />;
}

export { CVTemplateModern, CVTemplateClassic, CVTemplateMinimal };
