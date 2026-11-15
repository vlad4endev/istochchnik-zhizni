import 'package:flutter_test/flutter_test.dart';
import 'package:molitva/core/phone_format.dart';
import 'package:molitva/ui/chord_sheet.dart';

void main() {
  test('форматирует российский номер', () {
    expect(formatRuPhoneInput('89991234567'), '+7 (999) 123-45-67');
    expect(phoneToApiFormat('+7 (999) 123-45-67'), '+79991234567');
  });

  test('разбирает аккорды над текстом и ChordPro', () {
    expect(lineIsChordsOnly('C Am G'), isTrue);
    expect(lineIsChordsOnly('Славь Господа'), isFalse);
    final bits = parseChordPro('Славь [C]Господа');
    expect(bits.map((bit) => bit.chord).where((chord) => chord.isNotEmpty).toList(), ['C']);
    expect(plainSongText('А<br>Б'), 'А\nБ');
  });
}
