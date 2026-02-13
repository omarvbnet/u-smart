/**
 * Server-side PDF brochure generator for U Smart.
 * 5-page layout: Cover, About, Services, Why Choose Us, Contact & QR.
 */

import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import path from 'path';
import fs from 'fs';

export type BrochureMessages = {
  title: string;
  tagline: string;
  headline: string;
  description: string;
  description2: string;
  mission: string;
  strengths: string[];
  valueProposition: string;
  cta: string;
  contactUs: string;
  visit: string;
  email: string;
  websiteUrl: string;
  pageAboutTitle: string;
  pageServicesTitle: string;
  pageWhyTitle: string;
  pageContactTitle: string;
  serviceQuality: string;
  serviceSmartHome: string;
  serviceTelecom: string;
  serviceCleanEnergy: string;
  qrScan: string;
  downloadPdf?: string;
};

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 20;
const CONTENT_W = PAGE_W - MARGIN * 2;

// Dark blue gradient-like colors for cover
const COVER_BG = '#0a0f2e';
const COVER_ACCENT = '#1e3a5f';
const TEXT_LIGHT = '#f1f5f9';
const TEXT_MUTED = '#94a3b8';
const ACCENT_BLUE = '#3b82f6';

function getLogoPath(): string | null {
  const base = process.cwd();
  const candidates = [
    path.join(base, 'public', 'logo', 'usmart.PNG'),
    path.join(base, 'public', 'logo', 'usmFFart.PNG'),
    path.join(base, 'public', 'logo', 'logo.png'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function wrapText(doc: jsPDF, text: string, maxWidth: number, fontSize: number): string[] {
  const lines = doc.splitTextToSize(text, maxWidth);
  return lines;
}

export async function generateBrochurePdf(
  messages: BrochureMessages,
  options: { locale: string; baseUrl?: string; serviceSlug?: string | null }
): Promise<Buffer> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const baseUrl = options.baseUrl || 'https://www.usmart-iot.com';

  // QR data URL for page 5
  const qrDataUrl = await QRCode.toDataURL(baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`, {
    width: 400,
    margin: 1,
    color: { dark: '#0a0f2e', light: '#ffffff' },
  });

  // —— Page 1: Cover ——
  doc.setFillColor(10, 15, 46); // #0a0f2e
  doc.rect(0, 0, PAGE_W, PAGE_H, 'F');
  // Accent bar
  doc.setFillColor(30, 58, 95);
  doc.rect(0, PAGE_H - 25, PAGE_W, 25, 'F');

  const logoPath = getLogoPath();
  if (logoPath) {
    try {
      const logoBase64 = fs.readFileSync(logoPath).toString('base64');
      const ext = path.extname(logoPath).toLowerCase();
      const mime = ext === '.png' ? 'PNG' : 'JPEG';
      doc.addImage(`data:image/${mime.toLowerCase()};base64,${logoBase64}`, mime, PAGE_W / 2 - 25, 45, 50, 50);
    } catch {
      // skip logo on error
    }
  }

  doc.setTextColor(TEXT_LIGHT);
  doc.setFontSize(26);
  doc.setFont('helvetica', 'bold');
  doc.text(messages.title, PAGE_W / 2, 115, { align: 'center' });

  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(TEXT_MUTED);
  doc.text(messages.tagline, PAGE_W / 2, 128, { align: 'center' });

  doc.setFontSize(11);
  doc.setTextColor(180, 203, 233);
  const headlineLines = wrapText(doc, messages.headline, CONTENT_W - 10, 11);
  let y = 155;
  headlineLines.forEach((line) => {
    doc.text(line, PAGE_W / 2, y, { align: 'center' });
    y += 6;
  });

  doc.setTextColor(148, 163, 184);
  doc.setFontSize(9);
  doc.text('—', PAGE_W / 2, PAGE_H - 35, { align: 'center' });

  // —— Page 2: About Us ——
  doc.addPage();
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, PAGE_W, PAGE_H, 'F');

  doc.setTextColor(10, 15, 46);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(messages.pageAboutTitle, MARGIN, 25);

  doc.setDrawColor(59, 130, 246);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, 30, MARGIN + 40, 30);

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 65, 85);
  let aboutY = 42;
  const aboutParas = [messages.description, messages.description2, messages.mission];
  aboutParas.forEach((p) => {
    const lines = wrapText(doc, p, CONTENT_W, 11);
    lines.forEach((line) => {
      doc.text(line, MARGIN, aboutY);
      aboutY += 5.5;
    });
    aboutY += 6;
  });

  // —— Page 3: Services Overview ——
  doc.addPage();
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, PAGE_W, PAGE_H, 'F');

  doc.setTextColor(10, 15, 46);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(messages.pageServicesTitle, MARGIN, 25);
  doc.setDrawColor(59, 130, 246);
  doc.line(MARGIN, 30, MARGIN + 50, 30);

  const services = [
    messages.serviceQuality,
    messages.serviceSmartHome,
    messages.serviceTelecom,
    messages.serviceCleanEnergy,
  ];
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(51, 65, 85);
  let svcY = 48;
  services.forEach((name, i) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(30, 58, 95);
    doc.text(`• ${name}`, MARGIN, svcY);
    svcY += 10;
  });

  // —— Page 4: Why Choose U Smart ——
  doc.addPage();
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, PAGE_W, PAGE_H, 'F');

  doc.setTextColor(10, 15, 46);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(messages.pageWhyTitle, MARGIN, 25);
  doc.setDrawColor(59, 130, 246);
  doc.line(MARGIN, 30, MARGIN + 45, 30);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(51, 65, 85);
  const valueLines = wrapText(doc, messages.valueProposition, CONTENT_W, 10);
  let whyY = 42;
  valueLines.forEach((line) => {
    doc.text(line, MARGIN, whyY);
    whyY += 5.5;
  });
  whyY += 8;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(30, 58, 95);
  (messages.strengths || []).forEach((s) => {
    const lines = wrapText(doc, `✔ ${s}`, CONTENT_W - 5, 10);
    lines.forEach((line) => {
      doc.text(line, MARGIN + 3, whyY);
      whyY += 5.5;
    });
    whyY += 2;
  });

  // —— Page 5: Contact & QR ——
  doc.addPage();
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, PAGE_W, PAGE_H, 'F');

  doc.setTextColor(10, 15, 46);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(messages.pageContactTitle, MARGIN, 25);
  doc.setDrawColor(59, 130, 246);
  doc.line(MARGIN, 30, MARGIN + 45, 30);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(51, 65, 85);
  doc.text(messages.cta, MARGIN, 48);
  doc.text(`${messages.contactUs}`, MARGIN, 72);
  doc.text(`${messages.visit}: ${messages.websiteUrl}`, MARGIN, 82);
  doc.text(`📧 ${messages.email}`, MARGIN, 92);

  const qrSize = 45;
  const qrX = PAGE_W - MARGIN - qrSize;
  const qrY = 55;
  doc.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);

  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(messages.qrScan, PAGE_W / 2, 108, { align: 'center' });

  const pdfOutput = doc.output('arraybuffer');
  return Buffer.from(pdfOutput);
}
