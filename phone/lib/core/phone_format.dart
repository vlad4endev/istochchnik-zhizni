String formatRuPhoneInput(String raw) {
  var digits = raw.replaceAll(RegExp(r'\D'), '');
  if (digits.startsWith('8') && digits.length > 1) {
    digits = '7${digits.substring(1)}';
  }
  if (digits.isNotEmpty && !digits.startsWith('7')) {
    digits = '7$digits';
  }
  if (digits.length > 11) digits = digits.substring(0, 11);
  if (digits.isEmpty) return '';
  if (digits.length <= 1) return '+7';
  final rest = digits.substring(1);
  final buffer = StringBuffer('+7');
  if (rest.isNotEmpty) buffer.write(' (${rest.substring(0, rest.length.clamp(0, 3))}');
  if (rest.length >= 3) buffer.write(')');
  if (rest.length > 3) {
    buffer.write(' ${rest.substring(3, rest.length.clamp(3, 6))}');
  }
  if (rest.length > 6) {
    buffer.write('-${rest.substring(6, rest.length.clamp(6, 8))}');
  }
  if (rest.length > 8) {
    buffer.write('-${rest.substring(8, rest.length.clamp(8, 10))}');
  }
  return buffer.toString();
}

String phoneToApiFormat(String display) {
  final digits = display.replaceAll(RegExp(r'\D'), '');
  if (digits.length == 11 && digits.startsWith('7')) return '+$digits';
  if (digits.length == 10) return '+7$digits';
  return display.trim();
}
