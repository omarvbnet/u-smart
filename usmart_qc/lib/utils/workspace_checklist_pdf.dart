import 'package:flutter/services.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;

import '../models/private_company.dart';

/// Builds a printable PDF for a workspace checklist (Provisor branding).
Future<Uint8List> buildWorkspaceChecklistPdf({
  required PrivateCompanyChecklist checklist,
  required String workspaceName,
  String? departmentName,
}) async {
  final logoBytes = (await rootBundle.load('assets/provisor_icon.png')).buffer.asUint8List();
  final logo = pw.MemoryImage(logoBytes);

  final doc = pw.Document();
  doc.addPage(
    pw.MultiPage(
      pageFormat: PdfPageFormat.a4,
      margin: const pw.EdgeInsets.all(40),
      header: (context) => pw.Row(
        crossAxisAlignment: pw.CrossAxisAlignment.start,
        children: [
          pw.Image(logo, width: 48, height: 48),
          pw.SizedBox(width: 16),
          pw.Expanded(
            child: pw.Column(
              crossAxisAlignment: pw.CrossAxisAlignment.start,
              children: [
                pw.Text(
                  'Provisor',
                  style: pw.TextStyle(
                    fontSize: 20,
                    fontWeight: pw.FontWeight.bold,
                    color: PdfColors.indigo800,
                  ),
                ),
                pw.SizedBox(height: 4),
                pw.Text(
                  workspaceName,
                  style: const pw.TextStyle(fontSize: 12, color: PdfColors.grey700),
                ),
              ],
            ),
          ),
        ],
      ),
      footer: (context) => pw.Align(
        alignment: pw.Alignment.centerRight,
        child: pw.Text(
          'Page ${context.pageNumber} / ${context.pagesCount}',
          style: const pw.TextStyle(fontSize: 9, color: PdfColors.grey600),
        ),
      ),
      build: (context) => [
        pw.Text(
          checklist.name,
          style: pw.TextStyle(fontSize: 22, fontWeight: pw.FontWeight.bold),
        ),
        if (checklist.description != null && checklist.description!.trim().isNotEmpty) ...[
          pw.SizedBox(height: 8),
          pw.Text(
            checklist.description!.trim(),
            style: const pw.TextStyle(fontSize: 11, color: PdfColors.grey800),
          ),
        ],
        pw.SizedBox(height: 16),
        pw.Wrap(
          spacing: 8,
          runSpacing: 6,
          children: [
            if (checklist.category != null)
              _metaChip('Category: ${checklist.category}'),
            _metaChip('${checklist.items.length} item${checklist.items.length == 1 ? '' : 's'}'),
            if (departmentName != null && departmentName.isNotEmpty)
              _metaChip('Department: $departmentName'),
            if (checklist.createdByName != null)
              _metaChip('Created by: ${checklist.createdByName}'),
          ],
        ),
        pw.SizedBox(height: 20),
        pw.TableHelper.fromTextArray(
          headerStyle: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 10),
          headerDecoration: const pw.BoxDecoration(color: PdfColors.grey300),
          cellStyle: const pw.TextStyle(fontSize: 10),
          cellAlignments: {
            0: pw.Alignment.center,
            1: pw.Alignment.centerLeft,
            2: pw.Alignment.center,
          },
          headers: ['#', 'Item', 'Severity'],
          data: [
            for (var i = 0; i < checklist.items.length; i++)
              [
                '${i + 1}',
                checklist.items[i].label,
                checklist.items[i].isMajor ? 'MAJOR' : 'MINOR',
              ],
          ],
        ),
      ],
    ),
  );

  return doc.save();
}

pw.Widget _metaChip(String label) {
  return pw.Container(
    padding: const pw.EdgeInsets.symmetric(horizontal: 8, vertical: 4),
    decoration: pw.BoxDecoration(
      color: PdfColors.grey200,
      borderRadius: pw.BorderRadius.circular(4),
    ),
    child: pw.Text(label, style: const pw.TextStyle(fontSize: 9)),
  );
}
