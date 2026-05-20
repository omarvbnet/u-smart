import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:path_provider/path_provider.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';
import 'package:share_plus/share_plus.dart';

import '../l10n/app_localizations.dart';
import '../models/private_company.dart';
import '../utils/share_position_origin.dart';

/// Localized labels for checklist PDF export.
class ChecklistPdfLabels {
  const ChecklistPdfLabels({
    required this.itemColumn,
    required this.severityColumn,
    required this.category,
    required this.department,
    required this.createdBy,
    required this.itemsCount,
    required this.major,
    required this.minor,
    required this.page,
    required this.categoryLabel,
  });

  final String itemColumn;
  final String severityColumn;
  final String category;
  final String department;
  final String createdBy;
  final String itemsCount;
  final String major;
  final String minor;
  final String Function(int current, int total) page;
  final String Function(String? raw) categoryLabel;

  factory ChecklistPdfLabels.fromL10n(AppLocalizations l10n) {
    return ChecklistPdfLabels(
      itemColumn: l10n.t('pc_checklist_pdf_item'),
      severityColumn: l10n.t('pc_checklist_pdf_severity'),
      category: l10n.t('pc_ws_techniques_category'),
      department: l10n.t('pc_expenses_filter_department'),
      createdBy: l10n.t('pc_checklist_created_by'),
      itemsCount: l10n.t('pc_checklist_items'),
      major: l10n.t('checklist_weight_major'),
      minor: l10n.t('checklist_weight_minor'),
      page: (current, total) => l10n.t('pc_checklist_pdf_page', {
            'current': '$current',
            'total': '$total',
          }),
      categoryLabel: (raw) {
        if (raw == null || raw.trim().isEmpty) return '';
        switch (raw.trim().toUpperCase()) {
          case 'MAINTENANCE':
            return l10n.t('pc_ws_techniques_category_maint');
          case 'QUALITY':
            return l10n.t('pc_ws_techniques_category_qc');
          case 'SUPERVISION':
            return l10n.t('pc_ws_techniques_category_supervision');
          default:
            return raw.trim();
        }
      },
    );
  }
}

bool _hasArabicScript(String s) =>
    RegExp(r'[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]').hasMatch(s);

pw.TextDirection _textDir(String s) =>
    _hasArabicScript(s) ? pw.TextDirection.rtl : pw.TextDirection.ltr;

pw.Alignment _alignForText(String text, {required bool localeRtl}) {
  if (_hasArabicScript(text)) return pw.Alignment.centerRight;
  if (localeRtl) return pw.Alignment.centerRight;
  return pw.Alignment.centerLeft;
}

late pw.Font _latinFont;
late pw.Font _arabicFont;
var _fontsReady = false;

Future<void> _ensurePdfFonts() async {
  if (_fontsReady) return;
  try {
    final latinData = await rootBundle.load('assets/fonts/NotoSans-Regular.ttf');
    _latinFont = pw.Font.ttf(latinData);
  } catch (_) {
    _latinFont = pw.Font.helvetica();
  }
  try {
    final arabicData = await rootBundle.load('assets/fonts/NotoSansArabic-Regular.ttf');
    _arabicFont = pw.Font.ttf(arabicData);
  } catch (_) {
    _arabicFont = _latinFont;
  }
  _fontsReady = true;
}

pw.Font _fontFor(String text) => _hasArabicScript(text) ? _arabicFont : _latinFont;

/// Builds a printable PDF for a workspace checklist (Provisor branding + multilingual).
Future<Uint8List> buildWorkspaceChecklistPdf({
  required PrivateCompanyChecklist checklist,
  required String workspaceName,
  required ChecklistPdfLabels labels,
  required String localeCode,
  String? departmentName,
}) async {
  await _ensurePdfFonts();

  final localeRtl = AppLocalizations.isRtl(localeCode);
  final logoBytes = (await rootBundle.load('assets/provisor_icon.png')).buffer.asUint8List();
  final logo = pw.MemoryImage(logoBytes);

  pw.TextStyle style(String text, {double size = 10, bool bold = false, PdfColor? color}) {
    return pw.TextStyle(
      fontSize: size,
      font: _fontFor(text),
      fontWeight: bold ? pw.FontWeight.bold : pw.FontWeight.normal,
      color: color,
    );
  }

  pw.Widget txt(
    String text, {
    double size = 10,
    bool bold = false,
    PdfColor? color,
    pw.TextAlign? textAlign,
  }) {
    final dir = _textDir(text);
    return pw.Text(
      text,
      style: style(text, size: size, bold: bold, color: color),
      textDirection: dir,
      textAlign: textAlign ??
          (dir == pw.TextDirection.rtl ? pw.TextAlign.right : pw.TextAlign.left),
    );
  }

  pw.Widget checkboxBox() {
    return pw.Container(
      width: 16,
      height: 16,
      decoration: pw.BoxDecoration(
        border: pw.Border.all(color: PdfColors.grey700, width: 1.2),
        borderRadius: pw.BorderRadius.circular(3),
        color: PdfColors.white,
      ),
    );
  }

  pw.Widget severityBadge(PrivateCompanyChecklistItem item) {
    final isMajor = item.isMajor;
    final label = isMajor ? labels.major : labels.minor;
    final bg = isMajor ? PdfColors.red50 : PdfColors.indigo50;
    final fg = isMajor ? PdfColors.red800 : PdfColors.indigo800;
    final border = isMajor ? PdfColors.red300 : PdfColors.indigo300;
    return pw.Container(
      padding: const pw.EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: pw.BoxDecoration(
        color: bg,
        borderRadius: pw.BorderRadius.circular(6),
        border: pw.Border.all(color: border, width: 0.6),
      ),
      child: pw.Text(
        label.toUpperCase(),
        style: style(label, size: 8, bold: true, color: fg),
        textDirection: _textDir(label),
      ),
    );
  }

  final doc = pw.Document(
    theme: pw.ThemeData.withFont(base: _latinFont, bold: _latinFont),
  );

  doc.addPage(
    pw.MultiPage(
      pageFormat: PdfPageFormat.a4,
      margin: const pw.EdgeInsets.fromLTRB(36, 28, 36, 40),
      header: (context) => pw.Column(
        children: [
          pw.Container(
            width: double.infinity,
            padding: const pw.EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            decoration: const pw.BoxDecoration(
              color: PdfColors.indigo900,
              borderRadius: pw.BorderRadius.all(pw.Radius.circular(10)),
            ),
            child: pw.Row(
              crossAxisAlignment: pw.CrossAxisAlignment.center,
              children: localeRtl
                  ? [
                      pw.Expanded(
                        child: pw.Column(
                          crossAxisAlignment: pw.CrossAxisAlignment.end,
                          children: [
                            txt('Provisor', size: 18, bold: true, color: PdfColors.white),
                            pw.SizedBox(height: 3),
                            txt(workspaceName, size: 11, color: PdfColors.grey300),
                          ],
                        ),
                      ),
                      pw.SizedBox(width: 14),
                      pw.ClipRRect(
                        horizontalRadius: 8,
                        verticalRadius: 8,
                        child: pw.Image(logo, width: 44, height: 44),
                      ),
                    ]
                  : [
                      pw.ClipRRect(
                        horizontalRadius: 8,
                        verticalRadius: 8,
                        child: pw.Image(logo, width: 44, height: 44),
                      ),
                      pw.SizedBox(width: 14),
                      pw.Expanded(
                        child: pw.Column(
                          crossAxisAlignment: pw.CrossAxisAlignment.start,
                          children: [
                            txt('Provisor', size: 18, bold: true, color: PdfColors.white),
                            pw.SizedBox(height: 3),
                            txt(workspaceName, size: 11, color: PdfColors.grey300),
                          ],
                        ),
                      ),
                    ],
            ),
          ),
          pw.SizedBox(height: 18),
        ],
      ),
      footer: (context) => pw.Padding(
        padding: const pw.EdgeInsets.only(top: 8),
        child: pw.Row(
          mainAxisAlignment:
              localeRtl ? pw.MainAxisAlignment.start : pw.MainAxisAlignment.end,
          children: [
            txt(
              labels.page(context.pageNumber, context.pagesCount),
              size: 9,
              color: PdfColors.grey600,
            ),
          ],
        ),
      ),
      build: (context) => [
        pw.Align(
          alignment: localeRtl ? pw.Alignment.centerRight : pw.Alignment.centerLeft,
          child: txt(checklist.name, size: 22, bold: true, color: PdfColors.grey900),
        ),
        if (checklist.description != null && checklist.description!.trim().isNotEmpty) ...[
          pw.SizedBox(height: 10),
          pw.Align(
            alignment: localeRtl ? pw.Alignment.centerRight : pw.Alignment.centerLeft,
            child: txt(checklist.description!.trim(), size: 11, color: PdfColors.grey800),
          ),
        ],
        pw.SizedBox(height: 16),
        pw.Wrap(
          spacing: 8,
          runSpacing: 6,
          alignment: localeRtl ? pw.WrapAlignment.end : pw.WrapAlignment.start,
          children: [
            if (checklist.category != null && checklist.category!.trim().isNotEmpty)
              _metaField(
                labels.category,
                labels.categoryLabel(checklist.category),
                style,
                localeRtl,
              ),
            _metaField(
              labels.itemsCount,
              '${checklist.items.length}',
              style,
              localeRtl,
            ),
            if (departmentName != null && departmentName.isNotEmpty)
              _metaField(labels.department, departmentName, style, localeRtl),
            if (checklist.createdByName != null)
              _metaField(labels.createdBy, checklist.createdByName!, style, localeRtl),
          ],
        ),
        pw.SizedBox(height: 20),
        pw.Container(
          decoration: pw.BoxDecoration(
            border: pw.Border.all(color: PdfColors.grey400, width: 0.6),
            borderRadius: const pw.BorderRadius.all(pw.Radius.circular(8)),
          ),
          child: pw.Column(
            children: [
              pw.Container(
                width: double.infinity,
                padding: const pw.EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                decoration: const pw.BoxDecoration(
                  color: PdfColors.indigo100,
                  borderRadius: pw.BorderRadius.only(
                    topLeft: pw.Radius.circular(7),
                    topRight: pw.Radius.circular(7),
                  ),
                ),
                child: pw.Row(
                  children: localeRtl
                      ? [
                          pw.SizedBox(
                            width: 64,
                            child: pw.Align(
                              alignment: pw.Alignment.center,
                              child: txt(labels.severityColumn, size: 9, bold: true),
                            ),
                          ),
                          pw.Expanded(
                            child: pw.Align(
                              alignment: pw.Alignment.centerRight,
                              child: txt(labels.itemColumn, size: 9, bold: true),
                            ),
                          ),
                          pw.SizedBox(width: 8),
                          pw.SizedBox(width: 16),
                          pw.SizedBox(width: 28),
                        ]
                      : [
                          pw.SizedBox(width: 28),
                          pw.SizedBox(width: 16),
                          pw.SizedBox(width: 8),
                          pw.Expanded(
                            child: txt(labels.itemColumn, size: 9, bold: true),
                          ),
                          pw.SizedBox(
                            width: 64,
                            child: pw.Align(
                              alignment: pw.Alignment.center,
                              child: txt(labels.severityColumn, size: 9, bold: true),
                            ),
                          ),
                        ],
                ),
              ),
              for (var i = 0; i < checklist.items.length; i++)
                pw.Container(
                  width: double.infinity,
                  padding: const pw.EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  decoration: pw.BoxDecoration(
                    color: i.isEven ? PdfColors.white : PdfColors.grey100,
                    border: i < checklist.items.length - 1
                        ? const pw.Border(
                            bottom: pw.BorderSide(color: PdfColors.grey300, width: 0.4),
                          )
                        : null,
                  ),
                  child: pw.Row(
                    crossAxisAlignment: pw.CrossAxisAlignment.center,
                    children: localeRtl
                        ? [
                            severityBadge(checklist.items[i]),
                            pw.SizedBox(width: 10),
                            pw.Expanded(
                              child: pw.Align(
                                alignment: _alignForText(
                                  checklist.items[i].label,
                                  localeRtl: localeRtl,
                                ),
                                child: txt(
                                  checklist.items[i].label,
                                  size: 11,
                                  color: PdfColors.grey900,
                                ),
                              ),
                            ),
                            pw.SizedBox(width: 8),
                            checkboxBox(),
                            pw.SizedBox(width: 8),
                            pw.SizedBox(
                              width: 28,
                              child: pw.Align(
                                alignment: pw.Alignment.center,
                                child: txt(
                                  '${i + 1}',
                                  size: 10,
                                  bold: true,
                                  color: PdfColors.indigo800,
                                ),
                              ),
                            ),
                          ]
                        : [
                            pw.SizedBox(
                              width: 28,
                              child: pw.Align(
                                alignment: pw.Alignment.center,
                                child: txt(
                                  '${i + 1}',
                                  size: 10,
                                  bold: true,
                                  color: PdfColors.indigo800,
                                ),
                              ),
                            ),
                            pw.SizedBox(width: 8),
                            checkboxBox(),
                            pw.SizedBox(width: 8),
                            pw.Expanded(
                              child: pw.Align(
                                alignment: _alignForText(
                                  checklist.items[i].label,
                                  localeRtl: localeRtl,
                                ),
                                child: txt(
                                  checklist.items[i].label,
                                  size: 11,
                                  color: PdfColors.grey900,
                                ),
                              ),
                            ),
                            pw.SizedBox(width: 10),
                            severityBadge(checklist.items[i]),
                          ],
                  ),
                ),
            ],
          ),
        ),
      ],
    ),
  );

  return doc.save();
}

pw.Widget _metaField(
  String label,
  String value,
  pw.TextStyle Function(String text, {double size, bool bold, PdfColor? color}) style,
  bool localeRtl,
) {
  final labelStyle = style(label, size: 9, bold: true, color: PdfColors.grey700);
  final valueStyle = style(value, size: 9, color: PdfColors.grey900);
  final labelWidget = pw.Text(
    localeRtl ? '$label:' : '$label: ',
    style: labelStyle,
    textDirection: localeRtl ? pw.TextDirection.rtl : pw.TextDirection.ltr,
  );
  final valueWidget = pw.Text(
    value,
    style: valueStyle,
    textDirection: _textDir(value),
  );
  return pw.Container(
    padding: const pw.EdgeInsets.symmetric(horizontal: 10, vertical: 5),
    decoration: pw.BoxDecoration(
      color: PdfColors.grey200,
      borderRadius: pw.BorderRadius.circular(20),
      border: pw.Border.all(color: PdfColors.grey400, width: 0.4),
    ),
    child: pw.Row(
      mainAxisSize: pw.MainAxisSize.min,
      children: localeRtl
          ? [valueWidget, pw.SizedBox(width: 4), labelWidget]
          : [labelWidget, valueWidget],
    ),
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
  required ChecklistPdfLabels labels,
  required String localeCode,
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
            labels: labels,
            localeCode: localeCode,
          ),
        ),
      ),
    ),
  );
}
