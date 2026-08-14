'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, X, Expand } from 'lucide-react';

type Props = {
  images: string[];
  title?: string;
  className?: string;
};

export function ProjectGallery({ images, title = 'Gallery', className = '' }: Props) {
  const [lightbox, setLightbox] = useState<number | null>(null);

  const filtered = images.filter(Boolean);
  if (!filtered.length) return null;

  const prev = () => setLightbox((i) => (i === null ? null : (i - 1 + filtered.length) % filtered.length));
  const next = () => setLightbox((i) => (i === null ? null : (i + 1) % filtered.length));

  return (
    <>
      <section className={className}>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">{title}</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {filtered.map((src, i) => (
            <button
              key={src + i}
              type="button"
              onClick={() => setLightbox(i)}
              className="group relative aspect-[4/3] rounded-xl overflow-hidden bg-white/5 border border-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            >
              <img src={src} alt="" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                <Expand className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
              </div>
            </button>
          ))}
        </div>
      </section>

      {lightbox !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20"
            onClick={() => setLightbox(null)}
            aria-label="Close"
          >
            <X className="w-6 h-6" />
          </button>
          {filtered.length > 1 && (
            <>
              <button
                type="button"
                className="absolute left-4 p-3 rounded-full bg-white/10 text-white hover:bg-white/20"
                onClick={(e) => {
                  e.stopPropagation();
                  prev();
                }}
                aria-label="Previous"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <button
                type="button"
                className="absolute right-4 p-3 rounded-full bg-white/10 text-white hover:bg-white/20"
                onClick={(e) => {
                  e.stopPropagation();
                  next();
                }}
                aria-label="Next"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </>
          )}
          <img
            src={filtered[lightbox]}
            alt=""
            className="max-h-[85vh] max-w-[90vw] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <p className="absolute bottom-6 text-sm text-gray-400">
            {lightbox + 1} / {filtered.length}
          </p>
        </div>
      )}
    </>
  );
}

/** Placeholder when no cover image is set. */
export function ProjectImagePlaceholder({ title, className = '' }: { title: string; className?: string }) {
  return (
    <div
      className={`aspect-video rounded-2xl overflow-hidden bg-gradient-to-br from-blue-600/20 via-indigo-600/10 to-purple-600/20 border border-white/10 flex items-center justify-center ${className}`}
    >
      <div className="text-center px-6">
        <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-white/10 flex items-center justify-center text-2xl font-bold text-blue-300">
          {title.charAt(0).toUpperCase()}
        </div>
        <p className="text-sm text-gray-400 font-medium truncate max-w-[200px]">{title}</p>
      </div>
    </div>
  );
}
