'use client';

import { useState } from 'react';
import type { CatalogEntry } from '../lib/catalog';
import { imageForEntry } from '../lib/catalog/images';
import { Icon } from './lucide-icon';

/** Renders the device PNG, falling back to a tinted Lucide icon if unavailable. */
export function EntryImage({ entry, className = 'h-8 w-8' }: { entry: CatalogEntry; className?: string }) {
  const src = imageForEntry(entry);
  const [failed, setFailed] = useState(false);

  if (src && !failed) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={src}
        alt={entry.name.en}
        draggable={false}
        onError={() => setFailed(true)}
        className={`${className} object-contain select-none`}
      />
    );
  }
  return <Icon name={entry.icon} className={className} style={{ color: entry.color }} />;
}
