import 'package:flutter_test/flutter_test.dart';
import 'package:molitva/core/phone_format.dart';

void main() {
  test('форматирует российский номер', () {
    expect(formatRuPhoneInput('89991234567'), '+7 (999) 123-45-67');
    expect(phoneToApiFormat('+7 (999) 123-45-67'), '+79991234567');
  });

  String typeByChar(String input) {
    var value = '';
    for (final ch in input.split('')) {
      value = formatRuPhoneInput(value + ch);
    }
    return value;
  }

  test('номер, набранный по цифре с 8, не теряет первую цифру', () {
    expect(typeByChar('89001234567'), '+7 (900) 123-45-67');
    expect(phoneToApiFormat(typeByChar('89001234567')), '+79001234567');
    expect(formatRuPhoneInput('8'), '+7');
  });

  test('номер, набранный по цифре с +7 или без кода', () {
    expect(typeByChar('+79001234567'), '+7 (900) 123-45-67');
    expect(typeByChar('9001234567'), '+7 (900) 123-45-67');
    expect(phoneToApiFormat(typeByChar('9001234567')), '+79001234567');
  });
}
