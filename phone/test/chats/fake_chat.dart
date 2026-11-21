import 'dart:async';

import 'package:molitva/features/chats/data/attachment_picker.dart';
import 'package:molitva/features/chats/data/chat_source.dart';
import 'package:molitva/features/chats/logic/attachment_logic.dart';
import 'package:molitva/features/chats/models/chat_models.dart';

ChatMessage msg(
  String id, {
  int? sender = 2,
  String name = 'Анна Орлова',
  String text = 'Привет',
  String type = 'text',
  DateTime? at,
  List<Reaction> reactions = const [],
  ReplyPreview? reply,
  bool deleted = false,
  Map<String, dynamic> payload = const {},
  bool pending = false,
}) =>
    ChatMessage(
      id: id,
      conversationId: 'c1',
      senderId: sender,
      senderName: name,
      content: text,
      payloadType: type,
      payload: payload,
      createdAt: at ?? DateTime(2026, 11, 21, 10, int.tryParse(id) ?? 0),
      reactions: reactions,
      replyTo: reply,
      isDeleted: deleted,
      pending: pending,
    );

/// Чат без сети: ответы из полей, сбои включаются по отдельности.
class FakeChat implements ChatSource {
  final calls = <String>[];
  List<ChatMessage> all = [];
  ChatMeta metaNow = const ChatMeta(type: 'group', title: 'Молодёжь');
  List<ChatMember> membersNow = const [
    ChatMember(id: 2, name: 'Анна Орлова', avatarUrl: 'https://x/a.jpg'),
    ChatMember(id: 9, name: 'Мария Лис', role: 'owner'),
  ];
  PrivateProfile profile = const PrivateProfile(id: 2, name: 'Анна Орлова');
  Map<String, LinkPreview?> previews = {};
  Readers readersNow = const Readers(readers: [], otherCount: 0);

  bool failMessages = false;
  bool failSend = false;
  bool failReact = false;
  bool failDelete = false;
  bool failMeta = false;
  int nextId = 100;

  @override
  Future<List<ChatMessage>> messages(String conversationId, {String? before, int limit = 50}) async {
    calls.add('messages:${before ?? ''}:$limit');
    if (failMessages) throw StateError('net');
    final sorted = [...all]..sort((a, b) => int.parse(a.id).compareTo(int.parse(b.id)));
    final upTo = before == null ? sorted : sorted.where((m) => int.parse(m.id) < int.parse(before)).toList();
    return upTo.length <= limit ? upTo : upTo.sublist(upTo.length - limit);
  }

  @override
  Future<ChatMessage?> send(String conversationId, String text, {String? replyTo, String payloadType = 'text', Map<String, dynamic>? payload}) async {
    calls.add('send:$text:${replyTo ?? ''}:$payloadType');
    if (failSend) throw StateError('net');
    final sent = msg('${nextId++}', sender: 9, name: 'Мария Лис', text: text, type: payloadType, payload: payload ?? const {});
    all.add(sent);
    return sent;
  }

  @override
  Future<void> edit(String messageId, String content) async {
    calls.add('edit:$messageId:$content');
    if (failSend) throw StateError('net');
  }

  @override
  Future<void> delete(String messageId) async {
    calls.add('delete:$messageId');
    if (failDelete) throw StateError('net');
  }

  @override
  Future<void> react(String messageId, String emoji, {required bool add}) async {
    calls.add('react:$messageId:$emoji:${add ? 'add' : 'remove'}');
    if (failReact) throw StateError('net');
  }

  @override
  Future<void> vote(String messageId, List<int> options) async => calls.add('vote:$messageId:${options.join(',')}');

  @override
  Future<void> forward(String messageId, List<String> conversationIds) async => calls.add('forward:$messageId:${conversationIds.join(',')}');

  @override
  Future<List<ChatMember>> members(String conversationId) async {
    calls.add('members');
    return membersNow;
  }

  @override
  Future<ChatMeta> meta(String conversationId) async {
    calls.add('meta');
    if (failMeta) throw StateError('net');
    return metaNow;
  }

  @override
  Future<PrivateProfile> privateProfile(String conversationId) async => profile;

  @override
  Future<LinkPreview?> linkPreview(String url) async {
    calls.add('preview:$url');
    return previews[url];
  }

  @override
  Future<Readers> readers(String messageId) async => readersNow;

  @override
  Future<void> setMuted(String conversationId, bool muted) async => calls.add('mute:$muted');

  @override
  Future<void> pin(String conversationId, String messageId, {required bool pinned}) async => calls.add('pin:$messageId:$pinned');

  List<Map<String, dynamic>> conversationsNow = [];

  @override
  Future<List<Map<String, dynamic>>> conversations() async => conversationsNow;

  /// Файлы, загрузка которых «не удалась» (по названию), и текст причины.
  final failUpload = <String, String>{};
  final uploads = <String>[];

  /// Пока не завершён, загрузка «идёт» — проверяем полосу прогресса.
  Completer<void>? uploadGate;

  @override
  Future<Map<String, dynamic>> upload({required String path, required String name, required String conversationId, void Function(double fraction)? onProgress}) async {
    uploads.add(name);
    onProgress?.call(0.5);
    if (uploadGate != null) await uploadGate!.future;
    final reason = failUpload[name];
    if (reason != null) throw ChatException(reason);
    onProgress?.call(1);
    final ext = name.contains('.') ? name.split('.').last.toLowerCase() : '';
    final mime = switch (ext) {
      'jpg' || 'jpeg' => 'image/jpeg',
      'png' => 'image/png',
      'mp4' => 'video/mp4',
      'pdf' => 'application/pdf',
      'm4a' => 'audio/mp4',
      _ => 'application/octet-stream',
    };
    return {'url': 'https://cdn/$name', 'name': name, 'objectPath': 'c1/$name', 'mimeType': mime, 'size': 1234};
  }
}

/// Выбор вложений без телефона: что «выбрал» человек, задаётся в полях.
class FakePicker implements AttachmentPicker {
  List<PickedAttachment> photosNow = const [];
  PickedAttachment? videoNow;
  PickedAttachment? cameraNow;
  List<PickedAttachment> filesNow = const [];
  PickerException? error;
  final calls = <String>[];

  void _maybeFail() {
    if (error != null) throw error!;
  }

  @override
  Future<List<PickedAttachment>> photos() async {
    calls.add('photos');
    _maybeFail();
    return photosNow;
  }

  @override
  Future<PickedAttachment?> video() async {
    calls.add('video');
    _maybeFail();
    return videoNow;
  }

  @override
  Future<PickedAttachment?> camera() async {
    calls.add('camera');
    _maybeFail();
    return cameraNow;
  }

  @override
  Future<List<PickedAttachment>> files() async {
    calls.add('files');
    _maybeFail();
    return filesNow;
  }
}
