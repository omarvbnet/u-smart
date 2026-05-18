import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:path_provider/path_provider.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';
import 'package:share_plus/share_plus.dart';

import '../models/private_company.dart';
import '../utils/share_position_origin.dart';

bool _hasArabic(String s) => RegExp(r'[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]').hasMatch(s);

pw.TextDirection _textDir(String s) => _hasArabic(s) ? pw.TextDirection.rtl : pw.TextDirection.ltr;

Future<pw.Font> _loadPdfFont() async {
  try {
    final data = await rootBundle.load('assets/fonts/NotoSansArabic-Regular.ttf');
    return pw.Font.ttf(data);
  } catch (_) {
    return pw.Font.helvetica();
  }
}

/// Builds a printable PDF for a workspace checklist (Provisor branding + Arabic support).
Future<Uint8List> buildWorkspaceChecklistPdf({
  required PrivateCompanyChecklist checklist,
  required String workspaceName,
  String? departmentName,
}) async {
  final logoBytes = (await rootBundle.load('assets/provisor_icon.png')).buffer.asUint8List();
  final logo = pw.MemoryImage(logoBytes);
  final font = await _loadPdfFont();

  pw.TextStyle style(String text, {double size = 10, bool bold = false, PdfColor? color}) {
    return pw.TextStyle(
      fontSize: size,
      font: font,
      fontWeight: bold ? pw.FontWeight.bold : pw.FontWeight.normal,
      color: color,
    );
  }

  pw.Widget txt(String text, {double size = 10, bool bold = false, PdfColor? color}) {
    return pw.Text(text, style: style(text, size: size, bold: bold, color: color), textDirection: _textDir(text));
  }

  final doc = pw.Document(theme: pw.ThemeData.withFont(base: font, bold: font));

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
                txt('Provisor', size: 20, bold: true, color: PdfColors.indigo800),
                pw.SizedBox(height: 4),
                txt(workspaceName, size: 12, color: PdfColors.grey700),
              ],
            ),
          ),
        ],
      ),
      footer: (context) => pw.Align(
        alignment: pw.Alignment.centerRight,
        child: pw.Text(
          'Page ${context.pageNumber} / ${context.pagesCount}',
          style: style('', size: 9, color: PdfColors.grey600),
        ),
      ),
      build: (context) => [
        txt(checklist.name, size: 22, bold: true),
        if (checklist.description != null && checklist.description!.trim().isNotEmpty) ...[
          pw.SizedBox(height: 8),
          txt(checklist.description!.trim(), size: 11, color: PdfColors.grey800),
        ],
        pw.SizedBox(height: 16),
        pw.Wrap(
          spacing: 8,
          runSpacing: 6,
          children: [
            if (checklist.category != null) _chip('Category: ${checklist.category}', style),
            _chip('${checklist.items.length} items', style),
            if (departmentName != null && departmentName.isNotEmpty)
              _chip('Department: $departmentName', style),
            if (checklist.createdByName != null)
              _chip('Created by: ${checklist.createdByName!}', style),
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
                _cell('#', style, bold: true, align: pw.Alignment.center),
                _cell('Item', style, bold: true),
                _cell('Severity', style, bold: true, align: pw.Alignment.center),
              ],
            ),
            for (var i = 0; i < checklist.items.length; i++)
              pw.TableRow(
                children: [
                  _cell('${i + 1}', style, align: pw.Alignment.center),
                  _cell(checklist.items[i].label, style),
                  _cell(
                    checklist.items[i].isMajor ? 'MAJOR' : 'MINOR',
                    style,
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

pw.Widget _cell(
  String text,
  pw.TextStyle Function(String text, {double size, bool bold, PdfColor? color}) style, {
  bool bold = false,
  pw.Alignment align = pw.Alignment.centerLeft,
}) {
  return pw.Padding(
    padding: const pw.EdgeInsets.symmetric(horizontal: 6, vertical: 6),
    child: pw.Align(
      alignment: align,
      child: pw.Text(text, style: style(text, size: 10, bold: bold), textDirection: _textDir(text)),
    ),
  );
}

pw.Widget _chip(String label, pw.TextStyle Function(String text, {double size, bool bold, PdfColor? color}) style) {
  return pw.Container(
    padding: const pw.EdgeInsets.symmetric(horizontal: 8, vertical: 4),
    decoration: pw.BoxDecoration(
      color: PdfColors.grey200,
      borderRadius: pw.BorderRadius.circular(4),
    ),
    child: pw.Text(label, style: style(label, size: 9), textDirection: _textDir(label)),
  );
}

String _safePdfFileName(String name) {
  final cleaned = name.replaceAll(RegExp(r'[<>:"/\\|?*\x00-\x1f]'), '_').trim();
  return cleaned.isEmpty ? 'checklist' : cleaned;
}

/// Share checklist PDF via system sheet (reliable on iOS/Android).
Future<void> shareWorkspaceChecklistPdf({
  required Uint8List bytes,
  required String fileName,
  required BuildContext context,
}) async {
  final safe = _safePdfFileName(fileName);
  if (kIsWeb) {
    await Printing.sharePdf(bytes: bytes, filename: '$safe.pdf');
    return;
  }
  final dir = await getTemporaryDirectory();
  final file = File('${dir.path}/$safe.pdf');
  await file.writeAsBytes(bytes, flush: true);
  if (!context.mounted) return;
  await Share.shareXFiles(
    [XFile(file.path, mimeType: 'application/pdf', name: '$safe.pdf')],
    subject: safe,
    sharePositionOrigin: sharePositionOriginForShareSheet(context),
  );
}

/// Open native print / PDF preview (works when direct layoutPdf fails on device).
Future<void> previewWorkspaceChecklistPdf({
  required BuildContext context,
  required PrivateCompanyChecklist checklist,
  required String workspaceName,
  String? departmentName,
}) async {
  await Navigator.of(context).push<void>(
    MaterialPageRoute(
      builder: (ctx) => Scaffold(
        backgroundColor: const Color(0xFF05051A),
        appBar: AppBar(
          backgroundColor: const Color(0xFF12122A),
          title: Text(
            checklist.name,
            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
          ),
          iconTheme: const IconThemeData(color: Colors.white),
        ),
        body: PdfPreview(
          maxPageWidth: 700,
          canChangeOrientation: false,
          canDebug: false,
          pdfFileName: '${_safePdfFileName(checklist.name)}.pdf',
          build: (_) => buildWorkspaceChecklistPdf(
            checklist: checklist,
            workspaceName: workspaceName,
            departmentName: departmentName,
          ),
        ),
      ),
    ),
  );
}
