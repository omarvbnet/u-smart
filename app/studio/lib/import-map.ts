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
      const src = reader.result as string;
      const img = new Image();
      img.onload = () => resolve({ src, width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = reject;
      img.src = src;
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
  const maxDim = 2200;
  const scale = Math.min(2, maxDim / Math.max(base.width, base.height));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d')!;
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  return { src: canvas.toDataURL('image/png'), width: viewport.width / scale, height: viewport.height / scale };
}
