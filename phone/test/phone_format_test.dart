import 'package:flutter_test/flutter_test.dart';
import 'package:molitva/core/phone_format.dart';

void main() {
  test('форматирует российский номер', () {
    expect(formatRuPhoneInput('89991234567'), '+7 (999) 123-45-67');
    expect(phoneToApiFormat('+7 (999) 123-45-67'), '+79991234567');
  });
}
