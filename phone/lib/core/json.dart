Map<String, dynamic> asMap(Object? value) {
  if (value is Map) {
    return Map<String, dynamic>.from(value);
  }
  return {};
}

List<dynamic> asList(Object? value) => value is List ? value : const [];

String str(Object? value) => value == null ? '' : value.toString();

int asInt(Object? value) {
  if (value is num) return value.toInt();
  return int.tryParse(str(value)) ?? 0;
}

bool asBool(Object? value) => value == true || value == 'true' || value == 1;

String resolveUrl(String origin, String? raw) {
  final value = (raw ?? '').trim();
  if (value.isEmpty) return '';
  if (value.startsWith('http://') || value.startsWith('https://')) return value;
  final base = origin.replaceAll(RegExp(r'/+$'), '');
  if (value.startsWith('/')) return '$base$value';
  return '$base/$value';
}
