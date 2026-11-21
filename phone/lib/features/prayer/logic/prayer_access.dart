import '../../../core/session.dart';

/// Кто что видит в «Молитве» и на главной. Совпадает с проверками сервера
/// (`assertAdminPastorOrCollectionCoordinator` и др.): сервер всё равно откажет,
/// но лишних кнопок человек видеть не должен.
class PrayerAccess {
  const PrayerAccess(this.user);

  final AppUser? user;

  bool get _admin => user?.isAdmin ?? false;
  bool get _pastor => user?.isPastor ?? false;
  bool get _coordinator => user?.isCollectionCoordinator ?? false;

  /// Очередь сбора нужд: админ, пастор или ответственный за сбор.
  bool get canViewCollection => _admin || _pastor || _coordinator;

  /// Срочная нужда и объявления: админ и координатор сбора.
  bool get canManageNotes => _admin || _coordinator;

  /// Админ и пастор видят обзор «где не заполнены нужды», остальные кураторы — только своих участников.
  bool get seesWholeQueue => _admin || _pastor;

  /// Сколько человек открывало раздел: пастор и админ.
  bool get canViewViewers => _admin || _pastor;

  /// Рассылка молитвы в Telegram — только администратор.
  bool get canTelegramDispatch => _admin;
}
