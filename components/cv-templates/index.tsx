'use client';

import type { CVData } from '@/lib/cv-types';
import type { CVTemplateId } from '@/lib/cv-types';
import CVTemplateModern from './CVTemplateModern';
import CVTemplateClassic from './CVTemplateClassic';
import CVTemplateMinimal from './CVTemplateMinimal';

const templates: Record<CVTemplateId, React.ComponentType<{ data: CVData }>> = {
  modern: CVTemplateModern,
  classic: CVTemplateClassic,
  minimal: CVTemplateMinimal,
};

export default function CVTemplateRenderer({
  templateId,
  data,
}: {
  templateId: CVTemplateId;
  data: CVData;
}) {
  const Template = templates[templateId] ?? CVTemplateModern;
  return <Template data={data} />;
}

export { CVTemplateModern, CVTemplateClassic, CVTemplateMinimal };
