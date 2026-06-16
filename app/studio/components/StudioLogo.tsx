'use client';

import React from 'react';

/**
 * U Smart Studio logo — the "U" mark from U Smart with an added node-graph
 * "Studio" glyph, signalling the Digital Twin design surface.
 */
export default function StudioLogo({
  className = '',
  showName = true,
  size = 'default',
}: {
  className?: string;
  showName?: boolean;
  size?: 'default' | 'compact' | 'large';
}) {
  const box =
    size === 'large' ? 'h-14 w-14' : size === 'compact' ? 'h-9 w-9' : 'h-11 w-11';
  const nameSize = size === 'large' ? '1.6rem' : size === 'compact' ? '1.05rem' : '1.3rem';

  return (
    <div className={`flex items-center gap-3 shrink-0 ${className}`}>
      <div className={`relative ${box} flex-shrink-0`}>
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-blue-500 via-cyan-400 to-blue-600 p-[2px]">
          <div className="h-full w-full rounded-2xl bg-[#0A0A0F]" />
        </div>
        <div className="absolute inset-[5px] flex items-center justify-center">
          <svg viewBox="0 0 56 56" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
            <defs>
              <linearGradient id="studio-lg" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#60a5fa" />
                <stop offset="100%" stopColor="#22d3ee" />
              </linearGradient>
            </defs>
            {/* U mark */}
            <path
              d="M13 16 L13 33 Q13 45 28 45 Q43 45 43 33 L43 16"
              stroke="url(#studio-lg)"
              strokeWidth="5.5"
              strokeLinecap="round"
              fill="none"
            />
            {/* node-graph glyph (digital twin) */}
            <circle cx="20" cy="22" r="3" fill="url(#studio-lg)" />
            <circle cx="36" cy="22" r="3" fill="url(#studio-lg)" />
            <circle cx="28" cy="33" r="3" fill="#22d3ee" />
            <path d="M20 22 L28 33 L36 22" stroke="url(#studio-lg)" strokeWidth="2" fill="none" strokeLinecap="round" />
          </svg>
        </div>
      </div>
      {showName && (
        <div className="flex flex-col justify-center leading-none">
          <span className="font-bold tracking-tight" style={{ fontSize: nameSize, letterSpacing: '-0.02em' }}>
            U<span className="text-cyan-400">Smart</span>
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.32em] text-cyan-400/80 mt-1">
            Studio
          </span>
        </div>
      )}
    </div>
  );
}
