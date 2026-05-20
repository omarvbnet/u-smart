'use client';

import { Image as ImageIcon } from 'lucide-react';

function resolveImageSrc(url: string): string {
  if (url.startsWith('http')) return url;
  if (url.startsWith('/')) return url;
  return `/${url}`;
}

function resolveImageHref(url: string, origin: string): string {
  if (url.startsWith('http')) return url;
  if (url.startsWith('/')) return `${origin}${url}`;
  return `${origin}/${url}`;
}

type Props = {
  beforeImageUrls?: string[];
  finishingImageUrls?: string[];
  beforeTitle?: string;
  afterTitle?: string;
  emptyHint?: string;
};

export function MaintenanceEvidenceGallery({
  beforeImageUrls = [],
  finishingImageUrls = [],
  beforeTitle = 'Before images',
  afterTitle = 'After images',
  emptyHint = 'No maintenance photos uploaded yet.',
}: Props) {
  const before = beforeImageUrls.filter((u) => u?.trim());
  const after = finishingImageUrls.filter((u) => u?.trim());
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  if (before.length === 0 && after.length === 0) {
    return (
      <section>
        <h2 className="text-sm font-semibold text-cyan-400 uppercase tracking-wider mb-3 flex items-center gap-2">
          <ImageIcon className="w-4 h-4" />
          Maintenance evidence
        </h2>
        <EmptyState hint={emptyHint} />
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <h2 className="text-sm font-semibold text-cyan-400 uppercase tracking-wider flex items-center gap-2">
        <ImageIcon className="w-4 h-4" />
        Maintenance evidence
      </h2>
      {before.length > 0 && (
        <ImageGrid title={beforeTitle} urls={before} origin={origin} altPrefix="Before" />
      )}
      {after.length > 0 && (
        <ImageGrid title={afterTitle} urls={after} origin={origin} altPrefix="After" />
      )}
    </section>
  );
}

function ImageGrid({
  title,
  urls,
  origin,
  altPrefix,
}: {
  title: string;
  urls: string[];
  origin: string;
  altPrefix: string;
}) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">{title}</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {urls.map((url, idx) => (
          <a
            key={`${altPrefix}-${idx}-${url}`}
            href={resolveImageHref(url, origin)}
            target="_blank"
            rel="noopener noreferrer"
            className="block aspect-video rounded-xl border border-white/10 bg-white/5 overflow-hidden hover:border-cyan-500/30 transition-colors"
          >
            <img
              src={resolveImageSrc(url)}
              alt={`${altPrefix} ${idx + 1}`}
              className="w-full h-full object-cover"
            />
          </a>
        ))}
      </div>
    </div>
  );
}

function EmptyState({ hint }: { hint: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center">
      <ImageIcon className="w-10 h-10 text-gray-500 mx-auto mb-2" />
      <p className="text-sm text-gray-500">{hint}</p>
    </div>
  );
}
