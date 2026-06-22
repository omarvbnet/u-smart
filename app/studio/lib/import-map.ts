'use client';

/** Imports a floor-plan from image, PDF, DXF, or DWG (via conversion service). */
import { importDwgViaApi, importDxfFile, isDwgFile, isDxfFile, type CadImportResult } from './import-cad';
import type { BimModel } from './model';

export type MapImportResult = {
  src: string;
  width: number;
  height: number;
  bim?: BimModel;
  sourceFormat?: 'dxf' | 'dwg' | 'pdf' | 'image';
};

export async function importMapFile(file: File): Promise<MapImportResult> {
  if (isDwgFile(file)) {
    const d = await importDwgViaApi(file);
    return { src: d.src, width: d.width, height: d.height, bim: d.bim, sourceFormat: 'dwg' };
  }
  if (isDxfFile(file)) {
    const d = await importDxfFile(file);
    return { src: d.src, width: d.width, height: d.height, bim: d.bim, sourceFormat: 'dxf' };
  }
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    const r = await renderPdfFirstPage(file);
    return { ...r, sourceFormat: 'pdf' };
  }
  const r = await readImage(file);
  return { ...r, sourceFormat: 'image' };
}

function readImage(file: File): Promise<{ src: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const raw = reader.result as string;
      const img = new Image();
      img.onload = () => {
        const maxDim = 1400;
        const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
        if (scale >= 1) {
          resolve({ src: raw, width: img.naturalWidth, height: img.naturalHeight });
          return;
        }
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve({ src: canvas.toDataURL('image/jpeg', 0.82), width: w, height: h });
      };
      img.onerror = reject;
      img.src = raw;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function renderPdfFirstPage(file: File): Promise<{ src: string; width: number; height: number }> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = '/studio/pdf.worker.min.mjs';

  const buffer = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buffer }).promise;
  const page = await doc.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const maxDim = 1400;
  const scale = Math.min(1.5, maxDim / Math.max(base.width, base.height));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  const src = canvas.toDataURL('image/jpeg', 0.82);
  return { src, width: viewport.width / scale, height: viewport.height / scale };
}
