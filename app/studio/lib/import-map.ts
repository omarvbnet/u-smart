'use client';

/** Imports a floor-plan / villa map from an image or PDF file into a raster. */
export async function importMapFile(file: File): Promise<{ src: string; width: number; height: number }> {
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    return renderPdfFirstPage(file);
  }
  return readImage(file);
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
  // Worker copied into /public (version-matched to the installed pdfjs-dist).
  pdfjs.GlobalWorkerOptions.workerSrc = '/studio/pdf.worker.min.mjs';

  const buffer = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buffer }).promise;
  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d')!;
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  return { src: canvas.toDataURL('image/png'), width: viewport.width / 2, height: viewport.height / 2 };
}
