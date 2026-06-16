'use client';

import { icons, HelpCircle, type LucideProps } from 'lucide-react';

/** Render a Lucide icon by its catalog name with a safe fallback. */
export function Icon({ name, ...props }: { name: string } & LucideProps) {
  const Cmp = (icons as Record<string, React.ComponentType<LucideProps>>)[name] ?? HelpCircle;
  return <Cmp {...props} />;
}
