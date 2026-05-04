import 'package:flutter_test/flutter_test.dart';
import 'package:usmart_qc/models/user.dart';

void main() {
  test('User.fromJson normalizes role casing', () {
    final u = User.fromJson({
      'id': '1',
      'username': 'a',
      'role': 'company_owner',
    });
    expect(u.role, 'COMPANY_OWNER');
    expect(u.isCompanyOwner, isTrue);
  });
}
