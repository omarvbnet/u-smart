import 'dart:typed_data';

import 'package:archive/archive.dart';
import 'package:xml/xml.dart';

/// Reads the first worksheet of a simple `.xlsx` (Office Open XML) file into a
/// dense grid of string values. Supports shared strings and plain numeric cells.
List<List<String>> xlsxFirstSheetToGrid(Uint8List bytes) {
  final arch = ZipDecoder().decodeBytes(bytes);
  final sheetFile = arch.findFile('xl/worksheets/sheet1.xml');
  if (sheetFile == null) {
    throw const FormatException(
      'Missing xl/worksheets/sheet1.xml — save as .xlsx with data on Sheet1.',
    );
  }
  final sheetXml = String.fromCharCodes(sheetFile.content as List<int>);
  final shared = _readSharedStrings(arch);

  final doc = XmlDocument.parse(sheetXml);
  final grid = <int, Map<int, String>>{};

  var maxRow = 0;
  var maxCol = 0;

  for (final c in doc.descendantElements.where((e) => e.name.local == 'c')) {
    final ref = c.getAttribute('r');
    if (ref == null || ref.isEmpty) continue;
    final pos = _parseCellRef(ref);
    if (pos == null) continue;
    final text = _cellText(c, shared);
    if (text == null || text.isEmpty) continue;
    final row = grid.putIfAbsent(pos.row, () => {});
    row[pos.col] = text;
    if (pos.row > maxRow) maxRow = pos.row;
    if (pos.col > maxCol) maxCol = pos.col;
  }

  if (maxRow < 0 || maxCol < 0) {
    throw const FormatException('No cells found in Sheet1.');
  }

  final rows = <List<String>>[];
  for (var r = 0; r <= maxRow; r++) {
    final rowMap = grid[r];
    final row = <String>[];
    for (var c = 0; c <= maxCol; c++) {
      row.add((rowMap?[c] ?? '').trim());
    }
    rows.add(row);
  }
  return rows;
}

List<String> _readSharedStrings(Archive arch) {
  final f = arch.findFile('xl/sharedStrings.xml');
  if (f == null) return [];
  final xml = String.fromCharCodes(f.content as List<int>);
  final doc = XmlDocument.parse(xml);
  final out = <String>[];
  for (final si in doc.descendantElements.where((e) => e.name.local == 'si')) {
    final plain = si.getElement('t');
    if (plain != null) {
      out.add(plain.innerText);
      continue;
    }
    final buf = StringBuffer();
    for (final r in si.descendantElements.where((e) => e.name.local == 'r')) {
      final t = r.getElement('t');
      if (t != null) buf.write(t.innerText);
    }
    out.add(buf.toString());
  }
  return out;
}

String? _cellText(XmlElement c, List<String> shared) {
  final type = c.getAttribute('t');
  final v = c.getElement('v');
  if (type == 's' && v != null) {
    final i = int.tryParse(v.innerText.trim());
    if (i != null && i >= 0 && i < shared.length) return shared[i];
    return null;
  }
  if (type == 'inlineStr') {
    final inlineRoot = c.getElement('is');
    final t = inlineRoot
        ?.descendantElements
        .where((e) => e.name.local == 't')
        .map((e) => e.innerText)
        .join('');
    return t;
  }
  return v?.innerText;
}

({int row, int col})? _parseCellRef(String ref) {
  final m = RegExp(r'^([A-Z]+)(\d+)$').firstMatch(ref.toUpperCase());
  if (m == null) return null;
  final letters = m.group(1)!;
  final rowNum = int.tryParse(m.group(2)!);
  if (rowNum == null || rowNum < 1) return null;
  var col = 0;
  for (final code in letters.codeUnits) {
    col = col * 26 + (code - 64);
  }
  return (row: rowNum - 1, col: col - 1);
}
