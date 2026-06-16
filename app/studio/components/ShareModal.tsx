'use client';

import { useMemo, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { useStudio } from '../lib/store';
import { useT } from './hooks';
import { buildShareUrl } from '../lib/share';
import { X, Copy, Check, Share2 } from 'lucide-react';

export function ShareModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const serialize = useStudio((s) => s.serialize);
  const [copied, setCopied] = useState(false);

  const url = useMemo(() => buildShareUrl(serialize()), [serialize]);
  const tooLong = url.length > 8000;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl border border-[var(--studio-border)] bg-[var(--studio-panel)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-[var(--studio-border)] px-4 py-3">
          <Share2 className="h-5 w-5 text-cyan-400" />
          <h2 className="text-sm font-bold text-[var(--studio-text)]">{t('share')}</h2>
          <button onClick={onClose} className="ms-auto rounded-lg p-1.5 text-[var(--studio-muted)] hover:bg-[var(--studio-hover)]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col items-center gap-4 p-5">
          <div className="rounded-xl bg-white p-3">
            <QRCodeCanvas value={tooLong ? url.slice(0, 8000) : url} size={196} bgColor="#ffffff" fgColor="#0a0a0f" level="L" />
          </div>
          <p className="text-xs text-[var(--studio-muted)]">{t('scanQr')}</p>

          <div className="w-full">
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[var(--studio-muted)]">{t('shareLink')}</label>
            <div className="flex gap-2">
              <input
                readOnly
                value={url}
                className="min-w-0 flex-1 truncate rounded-lg border border-[var(--studio-border)] bg-[var(--studio-bg)] px-3 py-2 text-xs text-[var(--studio-text)]"
              />
              <button
                onClick={copy}
                className="flex items-center gap-1.5 rounded-lg bg-cyan-500 px-3 py-2 text-xs font-semibold text-white hover:bg-cyan-400"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? t('copied') : t('copy')}
              </button>
            </div>
          </div>
          {tooLong && (
            <p className="text-[10px] text-orange-400">⚠ {t('shareLink')} &gt; 8KB — use Export JSON for large designs.</p>
          )}
        </div>
      </div>
    </div>
  );
}
