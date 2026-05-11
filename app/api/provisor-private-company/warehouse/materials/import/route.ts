import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { prisma as _prisma } from '@/lib/prisma';
import {
  logMovement,
  normalizeProvince,
  warehouseGuard,
} from '@/lib/private-company-warehouse';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

const VALID_TRACKING = new Set(['SERIAL', 'BULK']);

function normHeader(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

function cell(row: Record<string, unknown>, ...aliases: string[]): string {
  for (const a of aliases) {
    const v = row[a];
    if (typeof v === 'number' && !Number.isNaN(v)) return String(Math.floor(v));
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  for (const [k, v] of Object.entries(row)) {
    const nk = normHeader(k);
    for (const a of aliases) {
      if (nk === normHeader(a) || nk === a) {
        if (typeof v === 'number' && !Number.isNaN(v)) return String(Math.floor(v));
        if (typeof v === 'string' && v.trim()) return v.trim();
      }
    }
  }
  return '';
}

/**
 * POST /api/provisor-private-company/warehouse/materials/import
 *
 * multipart/form-data with field `file` — .xlsx, .xls, or .csv (Excel "Save As").
 *
 * First row = headers. Required columns (flexible names):
 *   material_name | name | material  — catalog name (created if missing)
 *   serial_number | serial | sn       — unit serial / lot code
 *   province       — Iraq governorate
 *
 * Optional: tracking (SERIAL|BULK), quantity, category, unit, description, notes
 */
export async function POST(req: NextRequest) {
  const guard = await warehouseGuard(req, { requireMutate: true });
  if (!guard.ok) return guard.response;

  let buffer: Buffer;
  try {
    const ct = req.headers.get('content-type') ?? '';
    if (ct.includes('multipart/form-data')) {
      const form = await req.formData();
      const file = form.get('file');
      if (!file || typeof file === 'string') {
        return NextResponse.json(
          { success: false, message: 'Upload a file under the field name "file".' },
          { status: 400 }
        );
      }
      const ab = await (file as Blob).arrayBuffer();
      buffer = Buffer.from(ab);
    } else {
      return NextResponse.json(
        {
          success: false,
          message: 'Send multipart/form-data with a spreadsheet file in field "file".',
        },
        { status: 400 }
      );
    }
  } catch {
    return NextResponse.json({ success: false, message: 'Could not read upload.' }, { status: 400 });
  }

  let workbook: ReturnType<typeof XLSX.read>;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer' });
  } catch (e) {
    console.error('xlsx read:', e);
    return NextResponse.json(
      { success: false, message: 'Could not parse the spreadsheet. Use .xlsx or .csv from Excel.' },
      { status: 400 }
    );
  }
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return NextResponse.json({ success: false, message: 'The workbook has no sheets.' }, { status: 400 });
  }
  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  if (!rawRows.length) {
    return NextResponse.json({ success: false, message: 'No data rows found.' }, { status: 400 });
  }

  let createdItems = 0;
  let createdMaterials = 0;
  const errors: string[] = [];
  const duplicates: string[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i];
    const materialName = cell(
      row,
      'material_name',
      'materialname',
      'material',
      'name',
      'item',
      'sku',
      'product'
    );
    const serialNumber = cell(row, 'serial_number', 'serialnumber', 'serial', 'sn', 'lot', 'barcode');
    const provinceRaw = cell(row, 'province', 'governorate', 'city');
    const province = normalizeProvince(provinceRaw);
    const trackingRaw = cell(row, 'tracking', 'track', 'type').toUpperCase();
    const tracking = VALID_TRACKING.has(trackingRaw) ? trackingRaw : 'SERIAL';
    const qtyCell = cell(row, 'quantity', 'qty', 'count');
    const quantity = qtyCell ? Math.max(1, Math.floor(Number(qtyCell) || 1)) : 1;
    const category = cell(row, 'category', 'cat') || null;
    const unit = cell(row, 'unit', 'uom') || null;
    const description = cell(row, 'description', 'desc') || null;
    const notes = cell(row, 'notes', 'note', 'remarks') || null;

    if (!materialName || !serialNumber || !province) {
      errors.push(`Row ${i + 2}: missing material name, serial, or province.`);
      continue;
    }

    let material = await prisma.privateCompanyMaterial.findFirst({
      where: { companyId: guard.companyId, name: materialName },
      select: { id: true, tracking: true, name: true },
    });
    if (!material) {
      try {
        material = await prisma.privateCompanyMaterial.create({
          data: {
            companyId: guard.companyId,
            name: materialName,
            description,
            category,
            unit,
            tracking,
            createdById: guard.requesterId,
          },
          select: { id: true, tracking: true, name: true },
        });
        createdMaterials += 1;
      } catch (e: unknown) {
        if (typeof e === 'object' && e && (e as { code?: string }).code === 'P2002') {
          material = await prisma.privateCompanyMaterial.findFirst({
            where: { companyId: guard.companyId, name: materialName },
            select: { id: true, tracking: true, name: true },
          });
        }
        if (!material) {
          errors.push(`Row ${i + 2}: could not create material "${materialName}".`);
          continue;
        }
      }
    }

    const effTracking = String(material!.tracking).toUpperCase();
    const effQty = effTracking === 'BULK' ? quantity : 1;
    const serials = effTracking === 'BULK' ? [serialNumber] : [serialNumber];

    for (const sn of serials) {
      try {
        const rowItem = await prisma.privateCompanyMaterialItem.create({
          data: {
            companyId: guard.companyId,
            materialId: material!.id,
            serialNumber: sn,
            province,
            status: 'IN_WAREHOUSE',
            quantity: effQty,
            notes: notes || description,
            createdById: guard.requesterId,
          },
          select: { id: true },
        });
        await logMovement({
          companyId: guard.companyId,
          itemId: rowItem.id,
          type: 'STOCKED',
          actorId: guard.requesterId,
          quantity: effQty,
          note: `Excel import — ${material!.name} (${sn})`,
        });
        createdItems += 1;
      } catch (e: unknown) {
        if (typeof e === 'object' && e && (e as { code?: string }).code === 'P2002') {
          duplicates.push(sn);
        } else {
          errors.push(`Row ${i + 2}: ${String((e as Error)?.message ?? e)}`);
        }
      }
    }
  }

  return NextResponse.json({
    success: createdItems > 0 || createdMaterials > 0,
    createdItems,
    createdMaterials,
    duplicateSerials: duplicates.length,
    errors: errors.slice(0, 50),
    message:
      createdItems > 0
        ? `Imported ${createdItems} item(s)${createdMaterials ? `, ${createdMaterials} new material(s)` : ''}.`
        : 'No items were imported. Check row errors and duplicate serials.',
  });
}
