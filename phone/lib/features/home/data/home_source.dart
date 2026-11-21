import '../../../core/church_api.dart';
import '../../../core/json.dart';
import '../../../core/session.dart';
import '../../schedule/data/schedule_repository.dart' show ymd;
import '../../service/models/plan_models.dart';
import '../models/home_models.dart';

/// Всё, что главная берёт с сервера (кроме расписания «моих» служений и заметок координаторов —
/// у них свои источники). Интерфейс нужен тестам: контроллер не знает про Dio.
abstract class HomeSource {
  Future<Map<String, dynamic>> day(String iso);
  Future<List<dynamic>> events();
  Future<List<Episode>> episodes();
  Future<BroadcastInfo?> broadcast();
  Future<List<PlanSummary>> plans(DateTime from);
  Future<List<PlanBlock>> planBlocks(int planId);
  Future<ServicePerson?> person(int memberId);
}

class HomeApi implements HomeSource {
  HomeApi(this.session) : _api = ChurchApi(session);

  final SessionController session;
  final ChurchApi _api;

  @override
  Future<Map<String, dynamic>> day(String iso) => _api.day(iso);

  @override
  Future<List<dynamic>> events() => _api.events();

  @override
  Future<List<Episode>> episodes() async => Episode.parseList(await _api.podcasts());

  @override
  Future<BroadcastInfo?> broadcast() async => BroadcastInfo.tryParse(asMap(await _api.broadcast())['broadcast']);

  @override
  Future<List<PlanSummary>> plans(DateTime from) async {
    final response = await session.dio.get<Object?>('/api/service-plans', queryParameters: {'from': ymd(from)});
    return [for (final raw in asList(response.data)) ?PlanSummary.fromJson(asMap(raw))];
  }

  @override
  Future<List<PlanBlock>> planBlocks(int planId) async {
    final response = await session.dio.get<Object?>('/api/service-plans/$planId');
    return [for (final raw in asList(asMap(response.data)['blocks'])) blockFromJson(asMap(raw))];
  }

  @override
  Future<ServicePerson?> person(int memberId) async {
    final response = await session.dio.get<Object?>('/api/profile/$memberId');
    final profile = asMap(asMap(response.data)['profile']);
    if (profile.isEmpty) return null;
    final full = '${str(profile['first_name'])} ${str(profile['last_name'])}'.trim();
    final name = full.isNotEmpty ? full : str(profile['display_name']).trim();
    final avatar = resolveUrl(session.apiOrigin, str(profile['avatar_url']));
    return ServicePerson(id: memberId, name: name, avatarUrl: avatar.isEmpty ? null : avatar);
  }
}
