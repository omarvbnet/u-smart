import 'package:flutter_test/flutter_test.dart';
import 'package:usmart_qc/app.dart';

void main() {
  testWidgets('App loads', (WidgetTester tester) async {
    await tester.pumpWidget(const ProvisrApp());
    expect(find.text('PROVISOR'), findsOneWidget);
  });
}
