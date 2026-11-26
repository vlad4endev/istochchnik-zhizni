import 'dart:async';

import 'package:audio_session/audio_session.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:livekit_client/livekit_client.dart';

import '../../core/church_api.dart';
import '../../core/json.dart';
import '../../core/session.dart';
import 'logic/call_access.dart';
import 'logic/call_retry.dart';
import 'logic/call_layout.dart';
import 'logic/call_status.dart';
import 'logic/meeting_logic.dart';
import 'widgets/call_widgets.dart';

/// Что за звонок: исходящий, входящий, конференция или вход по приглашению.
class CallSpec {
  const CallSpec({
    this.callId,
    this.conversationId,
    this.recipientId,
    this.incoming = false,
    this.autoAccept = false,
    this.video = false,
    this.title = 'Звонок',
    this.meeting,
    this.inviteToken,
    this.inviteMedia,
    this.micOn = true,
    this.camOn = true,
  });

  final String? callId;
  final String? conversationId;
  final int? recipientId;
  final bool incoming;

  /// Звонок уже принят на системной звонилке — соединяем без второго «Ответить».
  final bool autoAccept;
  final bool video;
  final String title;

  /// Новая конференция по ссылке (из чата или отдельная встреча).
  final MeetingLaunch? meeting;

  /// Вход в чужую встречу по приглашению (`/call/join/<токен>`).
  final String? inviteToken;
  final MeetingMedia? inviteMedia;
  final bool micOn;
  final bool camOn;

  bool get isMeeting => meeting != null || inviteToken != null;

  /// Конференцию создали мы: можем завершить её для всех.
  bool get isHost => meeting != null;

  bool get videoCall => video || (meeting?.media.isVideo ?? false) || (inviteMedia?.isVideo ?? false);

  MeetingMedia get media => meeting?.media ?? inviteMedia ?? (video ? MeetingMedia.video : MeetingMedia.audio);

  /// Звонок, который мы начинаем сами (а не принимаем и не входим по ссылке).
  bool get startedByUs => !incoming && inviteToken == null && callId == null;
}

/// Один звонок. Живёт отдельно от экрана: экран можно свернуть, а звонок продолжится,
/// пока человек сам не нажмёт «Выйти» (или звонок не завершит другая сторона).
class CallController extends ChangeNotifier {
  CallController({required this.spec, required this.session, this.permissions = const DeviceCallPermissionGate(), Room? room}) : _room = room {
    _callId = spec.callId;
    _muted = !(spec.meeting?.micOn ?? spec.micOn);
    _camOn = spec.meeting != null
        ? (spec.meeting!.media.isVideo && spec.meeting!.camOn)
        : spec.inviteToken != null
            ? ((spec.inviteMedia?.isVideo ?? false) && spec.camOn)
            : spec.video;
    if (room != null) _hookRoom(room);
    _callEvents = session.realtime.callEvents.listen(_onCallEvent);
  }

  final CallSpec spec;
  final SessionController session;
  final CallPermissionGate permissions;
  Room? _room;

  /// Комната LiveKit создаётся только когда она нужна (подключение), а не при каждом открытии экрана звонка.
  Room get room => _room ??= _hookRoom(Room());

  Room _hookRoom(Room value) {
    _room = value;
    value.addListener(_onRoomChanged);
    // Подписки на треки, смена камеры/микрофона и «говорит» приходят событиями комнаты.
    _events = value.createListener()..listen(_onRoomEvent);
    return value;
  }

  String? _callId;
  String? error;
  bool connecting = false;
  bool joined = false;
  bool _muted = false;
  late bool _camOn;
  String? inviteUrl;
  String? _meetingTitle;
  bool linkCopied = false;
  bool inviteOpen = true;
  CallLayoutMode layout = CallLayoutMode.grid;
  bool needSettings = false;
  bool declined = false;

  /// Что сейчас делает подключение — видно на экране, если оно долгое.
  String stage = '';

  /// Сообщение для человека (например, «Нет доступа к камере — вы без видео»); экран показывает и забирает.
  String? notice;

  DateTime? peerSince;
  DateTime? joinedAt;

  bool _started = false;
  bool _leaving = false; // мы сами завершаем звонок
  bool _closing = false; // звонок закончился по сообщению (отклонён, завершён…)
  bool _ended = false;
  bool _released = false;

  /// К комнате уже подключались (или начали). Отключаться от комнаты, к которой не подключались, не нужно —
  /// и опасно: LiveKit в этом случае ждёт десять секунд.
  bool _roomUsed = false;
  int _views = 0;
  Timer? _ticker;
  Timer? _poll;
  EventsListener<RoomEvent>? _events;
  StreamSubscription<Map<String, dynamic>>? _callEvents;

  bool get muted => _muted;
  bool get camOn => _camOn;
  String? get callId => _callId;

  /// Звонок закончился (мы вышли, отменили или его завершили): объект больше не нужен.
  bool get ended => _ended;

  /// Экран звонка открыт прямо сейчас.
  bool get viewVisible => _views > 0;

  /// Звонок идёт, а экран свёрнут — показываем плашку «вернуться».
  bool get minimized => !_ended && !_closing && (joined || connecting) && (_views == 0 || _minimizing);

  bool _minimizing = false;

  /// Экран начал закрываться, но звонок продолжается: плашка появляется сразу, не дожидаясь конца анимации.
  void markMinimizing() {
    if (_ended || _minimizing) return;
    _minimizing = true;
    notifyListeners();
  }

  String get displayTitle =>
      _meetingTitle ?? (spec.meeting?.title?.trim().isNotEmpty == true ? spec.meeting!.title!.trim() : (spec.meeting?.media.defaultTitle ?? spec.title));

  /// Заголовок для экрана: у встречи — название встречи, у личного звонка — имя собеседника.
  String get screenTitle => spec.meeting != null ? displayTitle : spec.title;

  /// Текст приглашения: название и ссылка (null — ссылки нет, например у личного звонка).
  String? get inviteText => inviteUrl == null ? null : inviteShareText(displayTitle, inviteUrl!, media: spec.media);

  // ——— экран ———

  void attach() {
    _views++;
    _minimizing = false;
    _notifyLater();
  }

  /// Экран закрыт. Если звонок так и не начался (звонит, ошибка, подключение) — отменяем его; если идёт — он продолжается.
  void detach() {
    if (_views > 0) _views--;
    _minimizing = false;
    if (_ended) {
      _maybeRelease();
    } else if (!joined) {
      abandon();
    } else {
      _notifyLater();
    }
  }

  // ——— события ———

  /// Уведомляет экраны, если объект ещё жив: после освобождения слушать уже некому.
  void _notify() {
    if (!_released) notifyListeners();
  }

  void _onRoomChanged() => _notify();

  /// Экран открывается и закрывается посреди построения дерева виджетов — слушателей уведомляем чуть позже,
  /// иначе они (плашка, другие экраны) пытались бы перестроиться прямо во время построения.
  void _notifyLater() {
    scheduleMicrotask(_notify);
  }

  void _onRoomEvent(RoomEvent event) {
    // Комнату закрыл сервер (собеседник отклонил или завершил) — не ждём сокет, закрываем сразу.
    if (event is RoomDisconnectedEvent && joined && !_leaving && !_closing) {
      finish(event.reason == DisconnectReason.clientInitiated ? null : _disconnectMessage(event.reason));
    }
    _onRoomChanged();
  }

  void _onCallEvent(Map<String, dynamic> event) {
    final id = '${event['callId'] ?? ''}';
    if (id.isEmpty || id != _callId) return;
    final message = endMessageForEvent('${event['type'] ?? ''}', reason: event['reason'] == null ? null : '${event['reason']}');
    if (message != null) finish(message);
  }

  String _disconnectMessage(DisconnectReason? reason) => switch (reason) {
        DisconnectReason.roomDeleted || DisconnectReason.participantRemoved || DisconnectReason.serverShutdown => 'Звонок завершён',
        _ => 'Связь со звонком потеряна',
      };

  /// Звонок закончился без нашего участия (отклонён, завершён): показываем причину и закрываем.
  /// Повторные сигналы (сокет, комната, опрос) игнорируются.
  void finish(String? message) {
    if (_closing || _leaving || _ended) return;
    _closing = true;
    _poll?.cancel();
    _ticker?.cancel();
    error = message ?? 'Звонок завершён';
    connecting = false;
    _end(notify: message ?? 'Звонок завершён');
  }

  /// Запасной путь: если событие сокета потерялось, состояние звонка узнаём у сервера.
  void _startPolling() {
    _poll?.cancel();
    // Для встреч звонок живёт, пока есть люди, — опрос не нужен.
    if (spec.isMeeting) return;
    _poll = Timer.periodic(const Duration(seconds: 3), (_) async {
      final id = _callId;
      if (id == null || _closing || _leaving || _ended) return;
      try {
        final status = await ChurchApi(session).callStatus(id);
        final message = endMessageForStatus(status);
        if (message != null) finish(message);
      } catch (_) {
        /* нет сети — попробуем в следующий раз */
      }
    });
  }

  // ——— подключение ———

  /// Запускает звонок: исходящий и вход по ссылке — сразу, входящий — после «Ответить».
  void start() {
    if (_started || _ended) return;
    _started = true;
    unawaited(connect());
  }

  Future<void> connect() async {
    if (connecting || joined || _ended) return;
    // Звонок становится «текущим» только когда его начали или приняли: входящий, который ещё звонит,
    // не обрывает идущий разговор.
    CallCenter.instance.claim(this);
    connecting = true;
    error = null;
    _notify();
    final api = ChurchApi(session);
    try {
      final wantCamera = _camOn;
      _setStage('Проверяем микрофон…');
      final access = await permissions.request(camera: wantCamera);
      if (_ended) return;
      final decision = decideCallAccess(mic: access.mic, cam: access.cam, wantCamera: wantCamera);
      if (!decision.canJoin) {
        connecting = false;
        needSettings = decision.offerSettings;
        error = decision.error;
        _notify();
        return;
      }
      if (wantCamera && !decision.useCamera) {
        _camOn = false;
        notice = decision.notice;
      }
      needSettings = false;
      // Аудиосессия настраивается параллельно с запросом к серверу — так подключение идёт быстрее.
      final audioReady = _prepareAudio();
      if (spec.incoming && _callId != null) {
        _setStage('Принимаем звонок…');
        await Future.wait<void>([api.acceptCall(_callId!), audioReady]);
      } else if (_callId == null && spec.inviteToken == null) {
        _setStage(spec.recipientId != null ? 'Вызываем…' : 'Создаём встречу…');
        final meeting = spec.meeting;
        // Единичный сбой сети или медленный ответ не заставляет жать «Повторить»: запрос повторяется сам,
        // а сервер закрывает брошенную первую попытку.
        final created = await retryOnceOnTransient(
          () => meeting != null
            ? api.createCall(
                type: 'group',
                mediaType: meeting.media.apiValue,
                conversationId: meeting.conversationId ?? '',
                accessMode: 'link',
                standalone: meeting.standalone,
                title: cleanMeetingTitle(meeting.title),
              )
            : api.createCall(
                type: spec.recipientId != null ? 'direct' : 'group',
                mediaType: spec.video ? 'video' : 'audio',
                conversationId: spec.conversationId ?? '',
                recipientId: spec.recipientId,
              ),
          onRetry: () => _setStage('Сеть отвечает медленно — повторяем…'),
          isCancelled: () => _ended,
        );
        await audioReady;
        final call = asMap(created['call']);
        _callId = str(call['id']);
        if (_callId == null || _callId!.isEmpty) {
          throw StateError('Сервер не вернул звонок');
        }
        final invite = str(call['inviteUrl']);
        if (invite.isNotEmpty) {
          inviteUrl = absoluteInviteUrl(invite, session.apiOrigin);
          final title = str(call['title']);
          _meetingTitle = title.isNotEmpty ? title : null;
        }
        // Отменили, пока сервер создавал звонок, — не оставляем его висеть.
        if (_ended) {
          unawaited(api.endCall(_callId!, endForAll: !spec.isMeeting).then<void>((_) {}, onError: (Object _) {}));
          return;
        }
      }
      if (spec.inviteToken != null) await audioReady;
      if (_ended) return;
      _setStage('Получаем доступ к комнате…');
      final Map<String, dynamic> tokenBody;
      if (spec.inviteToken != null && _callId == null) {
        tokenBody = await api.joinInvitation(spec.inviteToken!);
        _callId = str(asMap(tokenBody['call'])['id']);
      } else {
        tokenBody = await retryOnceOnTransient(
          () => api.callToken(_callId!),
          onRetry: () => _setStage('Сеть отвечает медленно — повторяем…'),
          isCancelled: () => _ended,
        );
      }
      final url = str(tokenBody['url']);
      final token = str(tokenBody['token']);
      if (url.isEmpty || token.isEmpty) {
        throw StateError('Сервер не выдал доступ в комнату звонка');
      }
      if (_ended) return;
      _setStage('Подключаемся к серверу звонков…');
      _roomUsed = true;
      // Микрофон и камера включаются сразу при входе в комнату, а не отдельным шагом после неё;
      // долгое подключение не висит бесконечно — через полминуты предлагаем повторить.
      await room
          .connect(
            url,
            token,
            fastConnectOptions: FastConnectOptions(microphone: TrackOption(enabled: !_muted), camera: TrackOption(enabled: _camOn)),
          )
          .timeout(
            const Duration(seconds: 30),
            onTimeout: () {
              unawaited(room.disconnect());
              throw StateError('Не удалось подключиться к звонку вовремя. Проверьте интернет и нажмите «Повторить».');
            },
          );
      if (_ended) {
        // Отменили, пока шло подключение: комнату не оставляем открытой.
        unawaited(room.disconnect().catchError((Object _) {}));
        return;
      }
      _setStage('Включаем звук…');
      await room.localParticipant?.setMicrophoneEnabled(!_muted);
      if (_camOn) await room.localParticipant?.setCameraEnabled(true);
      if (_ended) return;
      joined = true;
      connecting = false;
      joinedAt = DateTime.now();
      _ticker = Timer.periodic(const Duration(seconds: 1), (_) => _onRoomChanged());
      _startPolling();
      _notify();
    } catch (e) {
      if (_ended) return;
      connecting = false;
      error = e is StateError ? e.message : describeDio(e);
      _notify();
    }
  }

  Future<void> _prepareAudio() async {
    try {
      final audio = await AudioSession.instance;
      await audio.configure(const AudioSessionConfiguration.speech());
    } catch (_) {
      /* без аудиосессии звонок всё равно можно попробовать */
    }
  }

  void _setStage(String value) {
    if (_released || stage == value) return;
    stage = value;
    _notify();
  }

  /// Для тестов: считать, что подключение прошло, без настоящей комнаты.
  @visibleForTesting
  void debugJoin({String? inviteUrlValue, DateTime? at}) {
    joined = true;
    connecting = false;
    joinedAt = at ?? DateTime.now();
    if (inviteUrlValue != null) inviteUrl = inviteUrlValue;
    notifyListeners();
  }

  // ——— действия ———

  Future<void> toggleMic() async {
    final next = !_muted;
    await _room?.localParticipant?.setMicrophoneEnabled(!next);
    _muted = next;
    _notify();
  }

  Future<void> toggleCamera() async {
    final next = !_camOn;
    await _room?.localParticipant?.setCameraEnabled(next);
    _camOn = next;
    _notify();
  }

  /// Копирует название и ссылку. false — ссылки нет.
  Future<bool> copyInvite() async {
    final text = inviteText;
    if (text == null) return false;
    await Clipboard.setData(ClipboardData(text: text));
    linkCopied = true;
    _notify();
    return true;
  }

  void setLayout(CallLayoutMode mode) {
    layout = mode;
    notifyListeners();
  }

  void closeInviteBar() {
    inviteOpen = false;
    notifyListeners();
  }

  String? takeNotice() {
    final value = notice;
    notice = null;
    return value;
  }

  /// Выйти из звонка (для встречи — при желании завершить её для всех) и закончить объект.
  Future<void> hangUp({bool endForAll = false}) async {
    if (_ended) return;
    _leaving = true;
    _poll?.cancel();
    final id = _callId;
    await _disconnectRoom();
    if (id != null && id.isNotEmpty) {
      try {
        await ChurchApi(session).endCall(id, endForAll: endForAll);
      } catch (_) {}
    }
    _end();
  }

  /// Выход из комнаты: не ждём дольше нескольких секунд, чтобы «Выйти» не подвисало.
  Future<void> _disconnectRoom() async {
    final created = _room;
    if (!_roomUsed || created == null) return;
    try {
      await created.disconnect().timeout(const Duration(seconds: 3), onTimeout: () {});
    } catch (_) {}
  }

  Future<void> decline() async {
    if (_ended) return;
    declined = true;
    _leaving = true;
    final id = _callId;
    if (id != null) {
      try {
        await ChurchApi(session).declineCall(id);
      } catch (_) {}
    }
    _end();
  }

  /// Закрыли экран, не дождавшись звонка (отменили вызов, ушли с экрана «звонит вам» или с ошибки).
  void abandon() {
    if (_ended) return;
    _leaving = true;
    _poll?.cancel();
    final id = _callId;
    // Мы уже создали исходящий звонок, а человек передумал: собеседник не должен звонить в пустоту.
    if (id != null && id.isNotEmpty && spec.startedByUs && !joined) {
      unawaited(ChurchApi(session).endCall(id, endForAll: !spec.isMeeting).then<void>((_) {}, onError: (Object _) {}));
    }
    _end();
  }

  // ——— завершение ———

  void _end({String? notify}) {
    if (_ended) return;
    _ended = true;
    _poll?.cancel();
    _ticker?.cancel();
    endedNotice = notify;
    notifyListeners();
    _maybeRelease();
  }

  /// Сообщение о том, почему звонок закончился не по нашей воле (для плашки, если экран был свёрнут).
  String? endedNotice;

  void _maybeRelease() {
    if (_released || !_ended || _views > 0) return;
    dispose();
  }

  /// Освобождает комнату и подписки. Вызывается, когда звонок закончился и экрана уже нет.
  @override
  void dispose() {
    if (_released) return;
    _released = true;
    _callEvents?.cancel();
    _ticker?.cancel();
    _poll?.cancel();
    _events?.dispose();
    final created = _room;
    if (created != null) {
      created.removeListener(_onRoomChanged);
      // Комната освобождается после отключения: иначе её таймеры живут до закрытия приложения.
      if (_roomUsed) {
        unawaited(created.disconnect().catchError((Object _) {}).whenComplete(created.dispose));
      } else {
        unawaited(created.dispose());
      }
    }
    super.dispose();
  }

  // ——— что показывать ———

  CallPerson _person(Participant p) {
    final pub = p.getTrackPublicationBySource(TrackSource.camera);
    final track = pub?.track;
    final cam = pub != null && !pub.muted && track is VideoTrack;
    final mic = p.getTrackPublicationBySource(TrackSource.microphone);
    final local = p is LocalParticipant;
    final me = session.user;
    final remoteName = !spec.isMeeting && spec.recipientId != null ? spec.title : '';
    final name = local ? (me?.displayName ?? 'Вы') : (p.name.trim().isNotEmpty ? p.name.trim() : (remoteName.isNotEmpty ? remoteName : 'Участник'));
    return CallPerson(
      identity: p.identity.isEmpty ? (local ? 'local' : p.sid.toString()) : p.identity,
      name: name,
      isLocal: local,
      micOn: mic != null && !mic.muted,
      camOn: cam,
      speaking: p.isSpeaking,
      video: cam ? track : null,
      quality: p.connectionQuality,
    );
  }

  List<CallPerson> people() {
    final created = _room;
    if (created == null) return const [];
    return [
      if (created.localParticipant != null) _person(created.localParticipant!),
      for (final p in created.remoteParticipants.values) _person(p),
    ];
  }

  int get othersCount => _room?.remoteParticipants.length ?? 0;

  /// Подпись под названием: ожидание или время разговора.
  String statusText() {
    if (othersCount == 0) {
      peerSince = null;
      return waitingStatus(direct: !spec.isMeeting, outgoing: !spec.incoming && spec.recipientId != null);
    }
    // Время разговора идёт с момента, когда ответил собеседник, а не когда мы вошли в комнату.
    peerSince ??= DateTime.now();
    return callTimer(DateTime.now().difference(peerSince!));
  }
}

/// Единственный текущий звонок приложения: по нему плашка «Идёт звонок» знает, что показывать.
class CallCenter extends ChangeNotifier {
  CallCenter();

  static final CallCenter instance = CallCenter();

  CallController? _current;

  CallController? get current => _current;

  /// Экраны и плашка обновляются чуть позже: звонок может закончиться посреди построения дерева виджетов.
  void _notifyLater() => scheduleMicrotask(notifyListeners);

  /// Сообщение, почему закончился звонок, пока экран был свёрнут (показывается один раз).
  String? takeEndedNotice() {
    final value = _notice;
    _notice = null;
    return value;
  }

  String? _notice;

  /// Готовит звонок для экрана. Если открывают тот, что уже идёт (например, входящий, принятый на звонилке), возвращается он же.
  /// Текущим звонок становится в [claim] — когда его начали или приняли.
  CallController begin({required CallSpec spec, required SessionController session, CallPermissionGate? permissions}) {
    final active = _current;
    final id = spec.callId;
    if (active != null && !active.ended && id != null && id.isNotEmpty && id == active.callId) return active;
    return CallController(spec: spec, session: session, permissions: permissions ?? const DeviceCallPermissionGate());
  }

  /// Делает [controller] текущим звонком. Если уже идёт другой — тот завершается: два звонка одновременно не ведём.
  void claim(CallController controller) {
    if (_current == controller) return;
    final active = _current;
    if (active != null && !active.ended) unawaited(active.hangUp());
    _adopt(controller);
  }

  /// Для тестов: забыть текущий звонок.
  @visibleForTesting
  void debugReset() {
    _current?.removeListener(_forward);
    _current = null;
    _notice = null;
    _notifyLater();
  }

  /// Идёт ли сейчас звонок (свёрнутый или на экране).
  bool get hasActiveCall => _current != null && !_current!.ended;

  /// Для тестов и для случая, когда контроллер создан снаружи.
  void adopt(CallController controller) => _adopt(controller);

  void _adopt(CallController controller) {
    _current?.removeListener(_forward);
    _current = controller;
    controller.addListener(_forward);
    _notifyLater();
  }

  void _forward() {
    final c = _current;
    if (c == null) return;
    if (c.ended) {
      c.removeListener(_forward);
      _current = null;
      // Свёрнутый звонок закончился сам (его завершили другие) — человеку скажем почему.
      if (!c.viewVisible && c.endedNotice != null) _notice = c.endedNotice;
    }
    _notifyLater();
  }
}
