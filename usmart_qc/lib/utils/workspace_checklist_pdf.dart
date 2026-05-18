import 'package:flutter/services.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;

import '../models/private_company.dart';

bool _hasArabic(String s) => RegExp(r'[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]').hasMatch(s);

pw.TextDirection _textDir(String s) => _hasArabic(s) ? pw.TextDirection.rtl : pw.TextDirection.ltr;

/// Builds a printable PDF for a workspace checklist (Provisor branding + Arabic support).
Future<Uint8List> buildWorkspaceChecklistPdf({
  required PrivateCompanyChecklist checklist,
  required String workspaceName,
  String? departmentName,
}) async {
  final logoBytes = (await rootBundle.load('assets/provisor_icon.png')).buffer.asUint8List();
  final logo = pw.MemoryImage(logoBytes);

  final arabicFontData =
      await rootBundle.load('assets/fonts/NotoSansArabic-Regular.ttf');
  final arabicFont = pw.Font.ttf(arabicFontData);
  final latinFont = pw.Font.helvetica();
  final latinBold = pw.Font.helveticaBold();

  pw.TextStyle bodyStyle(String text, {double size = 10, bool bold = false, PdfColor? color}) {
    final useArabic = _hasArabic(text);
    return pw.TextStyle(
      fontSize: size,
      font: useArabic ? arabicFont : (bold ? latinBold : latinFont),
      fontWeight: bold ? pw.FontWeight.bold : pw.FontWeight.normal,
      color: color,
    );
  }

  pw.Widget textWidget(
    String text, {
    double size = 10,
    bool bold = false,
    PdfColor? color,
  }) {
    return pw.Text(
      text,
      style: bodyStyle(text, size: size, bold: bold, color: color),
      textDirection: _textDir(text),
    );
  }

  final doc = pw.Document(
    theme: pw.ThemeData.withFont(
      base: latinFont,
      bold: latinBold,
    ),
  );

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
                textWidget('Provisor', size: 20, bold: true, color: PdfColors.indigo800),
                pw.SizedBox(height: 4),
                textWidget(workspaceName, size: 12, color: PdfColors.grey700),
              ],
            ),
          ),
        ],
      ),
      footer: (context) => pw.Align(
        alignment: pw.Alignment.centerRight,
        child: pw.Text(
          'Page ${context.pageNumber} / ${context.pagesCount}',
          style: pw.TextStyle(fontSize: 9, color: PdfColors.grey600, font: latinFont),
        ),
      ),
      build: (context) => [
        textWidget(checklist.name, size: 22, bold: true),
        if (checklist.description != null && checklist.description!.trim().isNotEmpty) ...[
          pw.SizedBox(height: 8),
          textWidget(
            checklist.description!.trim(),
            size: 11,
            color: PdfColors.grey800,
          ),
        ],
        pw.SizedBox(height: 16),
        pw.Wrap(
          spacing: 8,
          runSpacing: 6,
          children: [
            if (checklist.category != null)
              _metaChip('Category: ${checklist.category}', bodyStyle),
            _metaChip(
              '${checklist.items.length} item${checklist.items.length == 1 ? '' : 's'}',
              bodyStyle,
            ),
            if (departmentName != null && departmentName.isNotEmpty)
              _metaChip('Department: $departmentName', bodyStyle),
            if (checklist.createdByName != null)
              _metaChip('Created by: ${checklist.createdByName!}', bodyStyle),
          ],
        ),
        pw.SizedBox(height: 20),
        pw.Table(
          border: pw.TableBorder.all(color: PdfColors.grey400, width: 0.5),
          columnWidths: {
            0: const pw.FixedColumnWidth(28),
            1: const pw.FlexColumnWidth(),
            2: const pw.FixedColumnWidth(52),
          },
          children: [
            pw.TableRow(
              decoration: const pw.BoxDecoration(color: PdfColors.grey300),
              children: [
                _tableCell('#', bodyStyle, bold: true, align: pw.Alignment.center),
                _tableCell('Item', bodyStyle, bold: true),
                _tableCell('Severity', bodyStyle, bold: true, align: pw.Alignment.center),
              ],
            ),
            for (var i = 0; i < checklist.items.length; i++)
              pw.TableRow(
                children: [
                  _tableCell('${i + 1}', bodyStyle, align: pw.Alignment.center),
                  _tableCell(checklist.items[i].label, bodyStyle),
                  _tableCell(
                    checklist.items[i].isMajor ? 'MAJOR' : 'MINOR',
                    bodyStyle,
                    align: pw.Alignment.center,
                  ),
                ],
              ),
          ],
        ),
      ],
    ),
  );

  return doc.save();
}

pw.Widget _tableCell(
  String text,
  pw.TextStyle Function(String text, {double size, bool bold, PdfColor? color}) bodyStyle, {
  bool bold = false,
  pw.Alignment align = pw.Alignment.centerLeft,
}) {
  return pw.Padding(
    padding: const pw.EdgeInsets.symmetric(horizontal: 6, vertical: 6),
    child: pw.Align(
      alignment: align,
      child: pw.Text(
        text,
        style: bodyStyle(text, size: 10, bold: bold),
        textDirection: _textDir(text),
      ),
    ),
  );
}

pw.Widget _metaChip(
  String label,
  pw.TextStyle Function(String text, {double size, bool bold, PdfColor? color}) bodyStyle,
) {
  return pw.Container(
    padding: const pw.EdgeInsets.symmetric(horizontal: 8, vertical: 4),
    decoration: pw.BoxDecoration(
      color: PdfColors.grey200,
      borderRadius: pw.BorderRadius.circular(4),
    ),
    child: pw.Text(
      label,
      style: bodyStyle(label, size: 9),
      textDirection: _textDir(label),
    ),
  );
}
