'use client';

import { gzipSync, gunzipSync, strToU8, strFromU8 } from 'fflate';
import type { DesignFile } from './store';

/** Compress a design to a URL-safe base64 string. */
export function encodeDesign(file: DesignFile): string {
  const json = JSON.stringify(file);
  const gz = gzipSync(strToU8(json), { level: 9 });
  return toBase64Url(gz);
}

export function decodeDesign(encoded: string): DesignFile | null {
  try {
    const bytes = fromBase64Url(encoded);
    const json = strFromU8(gunzipSync(bytes));
    const file = JSON.parse(json) as DesignFile;
    return file && file.version === 1 ? file : null;
  } catch {
    return null;
  }
}

export function buildShareUrl(file: DesignFile): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://studio.usmart-iot.com';
  return `${origin}/studio/design#d=${encodeDesign(file)}`;
}

/** Read a shared design from the current URL hash (#d=...). */
export function readShareFromHash(): DesignFile | null {
  if (typeof window === 'undefined') return null;
  const m = window.location.hash.match(/[#&]d=([^&]+)/);
  if (!m) return null;
  return decodeDesign(decodeURIComponent(m[1]!));
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
