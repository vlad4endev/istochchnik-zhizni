import '../../../core/session.dart';

final RegExp _emailRe = RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]{2,}$');

/// Поля формы «О себе» и «Молитвенная нужда».
class ProfileForm {
  const ProfileForm({required this.first, required this.last, required this.email, required this.birth, required this.need});

  final String first;
  final String last;
  final String email;

  /// `ГГГГ-ММ-ДД` или пусто.
  final String birth;
  final String need;

  factory ProfileForm.of(AppUser? user) => ProfileForm(
        first: user?.firstName ?? '',
        last: user?.lastName ?? '',
        email: user?.email ?? '',
        birth: user?.birthDate ?? '',
        need: user?.prayerRequest ?? '',
      );

  /// Первая ошибка в форме или null.
  String? validate({DateTime? today}) {
    if (first.trim().isEmpty) return 'Укажите имя';
    if (email.trim().isNotEmpty && !_emailRe.hasMatch(email.trim())) return 'Проверьте адрес почты';
    if (birth.isNotEmpty) {
      final d = DateTime.tryParse(birth);
      final now = today ?? DateTime.now();
      if (d == null) return 'Проверьте дату рождения';
      if (d.isAfter(DateTime(now.year, now.month, now.day))) return 'Дата рождения не может быть в будущем';
    }
    return null;
  }

  /// Только изменённые поля — для PATCH. Пустая дата отправляется как null.
  Map<String, dynamic> diff(ProfileForm saved) => {
        if (first.trim() != saved.first.trim()) 'first_name': first.trim(),
        if (last.trim() != saved.last.trim()) 'last_name': last.trim(),
        if (email.trim() != saved.email.trim()) 'email': email.trim(),
        if (birth != saved.birth) 'birth_date': birth.isEmpty ? null : birth,
        if (need != saved.need) 'prayer_request': need,
      };

  bool changedFrom(ProfileForm saved) => diff(saved).isNotEmpty;

  ProfileForm copyWith({String? first, String? last, String? email, String? birth, String? need}) =>
      ProfileForm(first: first ?? this.first, last: last ?? this.last, email: email ?? this.email, birth: birth ?? this.birth, need: need ?? this.need);
}

const List<String> _months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

/// «5 марта 1990» или «Не указана».
String birthLabel(String ymd) {
  final d = DateTime.tryParse(ymd);
  if (d == null) return 'Не указана';
  return '${d.day} ${_months[d.month - 1]} ${d.year}';
}

/// Из списка служебных ролей/направлений («Ведущий; Музыкант») — отдельные пункты.
List<String> splitMinistry(String raw) => [
      for (final part in raw.split(RegExp(r'[;,]')))
        if (part.trim().isNotEmpty) part.trim(),
    ];
