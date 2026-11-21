import 'dart:async';

import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/church_api.dart';
import '../../core/json.dart';
import '../../core/session.dart';
import '../../ui/kit/kit.dart';
import '../../ui/widgets.dart';
import '../calls/call_page.dart';
import '../prayer/widgets/sheet_frame.dart';
import 'data/chat_source.dart';
import 'logic/chat_logic.dart';
import 'models/chat_models.dart';
import 'widgets/message_content.dart';
import 'thread_page.dart';

/// Профиль чата — по образцу Telegram и сайта: личный (собеседник, сведения, общие медиа)
/// или групповой (участники, роли, «в сети»).
class ChatProfilePage extends StatefulWidget {
  const ChatProfilePage({
    super.key,
    required this.conversationId,
    required this.title,
    required this.isGroup,
    this.channel = false,
    this.otherMemberId,
    this.avatarUrl,
    this.muted = false,
    this.source,
  });

  final String conversationId;
  final String title;
  final bool isGroup;
  final bool channel;
  final int? otherMemberId;
  final String? avatarUrl;
  final bool muted;

  /// Для тестов; в приложении берётся из сессии.
  final ChatSource? source;

  @override
  State<ChatProfilePage> createState() => _ChatProfilePageState();
}

class _ChatProfilePageState extends State<ChatProfilePage> {
  late final ChatSource _source;
  late bool _muted = widget.muted;
  PrivateProfile? _profile;
  List<ChatMember>? _members;
  ChatMeta? _meta;
  SharedMedia? _media;
  String? _error;
  bool _mediaFailed = false;

  @override
  void initState() {
    super.initState();
    _source = widget.source ?? ChatApi(context.read<SessionController>());
    _load();
  }

  String _url(String raw) => resolveUrl(context.read<SessionController>().apiOrigin, raw);

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      if (widget.isGroup) {
        final results = await Future.wait<Object>([_source.members(widget.conversationId), _source.meta(widget.conversationId)]);
        if (!mounted) return;
        setState(() {
          _members = results[0] as List<ChatMember>;
          _meta = results[1] as ChatMeta;
        });
      } else {
        final profile = await _source.privateProfile(widget.conversationId);
        if (!mounted) return;
        setState(() => _profile = profile);
      }
    } catch (_) {
      if (mounted) setState(() => _error = 'Не удалось загрузить сведения. Проверьте интернет и попробуйте снова.');
    }
    unawaited(_loadMedia());
  }

  /// Общие медиа — из последних сообщений (до 8 страниц по 50, как на сайте).
  Future<void> _loadMedia() async {
    try {
      final all = <ChatMessage>[];
      String? before;
      for (var page = 0; page < 8; page++) {
        final part = await _source.messages(widget.conversationId, before: before, limit: 50);
        if (part.isEmpty) break;
        all.insertAll(0, part);
        if (part.length < 50) break;
        before = part.first.id;
      }
      if (!mounted) return;
      setState(() => _media = collectSharedMedia(all, _url));
    } catch (_) {
      if (mounted) setState(() => _mediaFailed = true);
    }
  }

  Future<void> _toggleMute() async {
    final next = !_muted;
    setState(() => _muted = next);
    try {
      await _source.setMuted(widget.conversationId, next);
    } catch (_) {
      if (!mounted) return;
      setState(() => _muted = !next);
      showMessage(context, 'Не удалось изменить уведомления. Попробуйте ещё раз.');
    }
  }

  Future<void> _open(String url) async {
    final uri = Uri.tryParse(url);
    if (uri != null) await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  void _call() {
    pushPage(context, CallPage(conversationId: widget.conversationId, recipientId: widget.otherMemberId, title: widget.title));
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final subtitle = widget.isGroup
        ? (_members == null ? '' : _groupCaption(_members!))
        : presenceLabel(online: false, lastSeen: _profile?.lastSeen, now: DateTime.now());
    final name = widget.isGroup ? (_meta?.title.isNotEmpty == true ? _meta!.title : widget.title) : (_profile?.name.isNotEmpty == true ? _profile!.name : widget.title);
    final avatar = widget.isGroup ? (_meta?.avatarUrl ?? widget.avatarUrl) : (_profile?.avatarUrl ?? widget.avatarUrl);
    return Scaffold(
      backgroundColor: palette.sheet,
      body: RefreshIndicator(
        color: palette.accent,
        onRefresh: _load,
        child: ListView(
          padding: EdgeInsets.zero,
          physics: const AlwaysScrollableScrollPhysics(),
          children: [
            _Hero(
              name: name,
              subtitle: subtitle,
              avatarUrl: avatar == null || avatar.isEmpty ? null : _url(avatar),
              group: widget.isGroup,
              actions: [
                _ActionTile(icon: Icons.chat_bubble_outline_rounded, label: 'Чат', onTap: () => Navigator.of(context).maybePop()),
                if (!widget.isGroup && widget.otherMemberId != null) _ActionTile(icon: Icons.call_outlined, label: 'Звонок', onTap: _call),
                _ActionTile(
                  icon: _muted ? Icons.notifications_off_outlined : Icons.notifications_none_rounded,
                  label: _muted ? 'Включить' : 'Звук',
                  pressed: _muted,
                  onTap: _toggleMute,
                ),
              ],
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(Space.lg, Space.lg, Space.lg, 32),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (_error != null) ...[
                    InfoBanner(_error!, error: true),
                    const SizedBox(height: 8),
                    SecondaryButton(label: 'Повторить', icon: Icons.refresh_rounded, onPressed: _load),
                    const SizedBox(height: Space.lg),
                  ],
                  if (widget.isGroup) ..._group(palette) else ..._private(palette),
                  const SizedBox(height: Space.lg),
                  _SharedMediaCard(media: _media, failed: _mediaFailed, onOpen: _open),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _groupCaption(List<ChatMember> members) {
    final online = members.where((m) => m.online).length;
    return '${membersCaption(members.length, channel: widget.channel)}${online > 0 ? ', $online в сети' : ''}';
  }

  // ───────────── личный чат ─────────────

  List<Widget> _private(ChurchPalette palette) {
    final p = _profile;
    if (p == null) {
      return [if (_error == null) const Padding(padding: EdgeInsets.symmetric(vertical: 24), child: Center(child: CircularProgressIndicator()))];
    }
    if (!p.hasInfo) {
      return [ChurchCard(child: Text('Собеседник пока не заполнил данные.', style: TextStyle(color: palette.inkMuted)))];
    }
    final birthIn = daysUntilBirthday(p.birthDate, DateTime.now());
    return [
      ListGroup(
        dividerIndent: 60,
        children: [
          if (p.phone.isNotEmpty)
            _InfoRow(
              icon: Icons.phone_outlined,
              tone: Tone.green,
              label: 'Телефон',
              value: p.phone,
              onTap: () => _open('tel:${p.phone.replaceAll(RegExp(r'[^\d+]'), '')}'),
              trailing: IconButton(
                tooltip: 'Скопировать номер',
                constraints: const BoxConstraints(minWidth: 44, minHeight: 44),
                icon: Icon(Icons.copy_rounded, size: 20, color: palette.inkMuted),
                onPressed: () async {
                  await Clipboard.setData(ClipboardData(text: p.phone));
                  if (mounted) showMessage(context, 'Номер скопирован');
                },
              ),
            ),
          if (p.birthDate != null)
            _InfoRow(
              icon: Icons.cake_outlined,
              tone: Tone.rose,
              label: 'День рождения',
              value: DateFormat('d MMMM yyyy', 'ru').format(p.birthDate!),
              trailing: birthIn != null && birthIn <= 30
                  ? StatusPill(birthIn == 0 ? 'СЕГОДНЯ' : 'ЧЕРЕЗ $birthIn ${pluralDays(birthIn).toUpperCase()}', tone: Tone.rose)
                  : null,
            ),
          if (p.ministryRoles.isNotEmpty) _ChipsRow(icon: Icons.church_outlined, tone: Tone.wine, label: 'Служение', items: p.ministryRoles),
          if (p.directions.isNotEmpty) _ChipsRow(icon: Icons.layers_outlined, tone: Tone.violet, label: 'Направление', items: p.directions),
          if (p.appRoles.isNotEmpty) _ChipsRow(icon: Icons.shield_outlined, tone: Tone.neutral, label: 'Роль в приложении', items: [for (final r in p.appRoles) appRoleLabel(r)]),
        ],
      ),
    ];
  }

  // ───────────── группа ─────────────

  List<Widget> _group(ChurchPalette palette) {
    final meta = _meta;
    final members = _members;
    if (members == null) {
      return [if (_error == null) const Padding(padding: EdgeInsets.symmetric(vertical: 24), child: Center(child: CircularProgressIndicator()))];
    }
    final me = context.read<SessionController>().user?.id ?? 0;
    int rank(ChatMember m) => m.role == 'owner' ? 0 : (m.role == 'admin' ? 1 : (m.online ? 2 : 3));
    final sorted = [...members]..sort((a, b) => rank(a).compareTo(rank(b)));
    return [
      if ((meta?.description ?? '').isNotEmpty) ...[
        ChurchCard(child: Text(meta!.description, style: TextStyle(fontSize: 14.5, height: 1.45, color: palette.ink))),
        const SizedBox(height: Space.lg),
      ],
      SectionLabel(widget.channel ? 'Подписчики' : 'Участники'),
      const SizedBox(height: 8),
      if (sorted.isEmpty)
        ChurchCard(child: Text('Список участников пуст.', style: TextStyle(color: palette.inkMuted)))
      else
        ListGroup(
          dividerIndent: 70,
          children: [
            for (final m in sorted)
              ListRow(
                leading: Stack(
                  clipBehavior: Clip.none,
                  children: [
                    ChurchAvatar(name: m.name.isEmpty ? '?' : m.name, imageUrl: m.avatarUrl == null ? null : _url(m.avatarUrl!), size: 44),
                    if (m.online)
                      Positioned(
                        right: -1,
                        bottom: -1,
                        child: Container(
                          width: 13,
                          height: 13,
                          decoration: BoxDecoration(color: ChurchColors.successBright, shape: BoxShape.circle, border: Border.all(color: palette.card, width: 2)),
                        ),
                      ),
                  ],
                ),
                title: m.id == me ? '${m.name} (вы)' : m.name,
                subtitle: presenceLabel(online: m.online, lastSeen: m.lastSeen, now: DateTime.now()),
                trailing: switch (m.role) {
                  'owner' => const StatusPill('ВЛАДЕЛЕЦ', tone: Tone.amber),
                  'admin' => const StatusPill('АДМИН', tone: Tone.violet),
                  _ => null,
                },
                onTap: m.id == me ? null : () => _member(m),
              ),
          ],
        ),
    ];
  }

  /// Лист участника: статус и «Написать».
  void _member(ChatMember m) {
    showPrayerSheet<void>(
      context,
      title: m.name,
      subtitle: presenceLabel(online: m.online, lastSeen: m.lastSeen, now: DateTime.now()),
      builder: (sheet) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          PrimaryButton(
            label: 'Написать',
            icon: Icons.chat_bubble_outline_rounded,
            onPressed: () async {
              Navigator.pop(sheet);
              await _writeTo(m);
            },
          ),
        ],
      ),
    );
  }

  Future<void> _writeTo(ChatMember m) async {
    try {
      final id = await ChurchApi(context.read<SessionController>()).openPersonal(m.id);
      if (!mounted || id.isEmpty) return;
      await pushPage(context, ThreadPage(conversationId: id, title: m.name, otherMemberId: m.id, avatarUrl: m.avatarUrl == null ? null : _url(m.avatarUrl!)));
    } catch (error) {
      if (mounted) showMessage(context, describeDio(error));
    }
  }
}

String pluralDays(int n) {
  final a = n % 100;
  final b = n % 10;
  if (a > 10 && a < 20) return 'дней';
  if (b == 1) return 'день';
  if (b >= 2 && b <= 4) return 'дня';
  return 'дней';
}

/// Роль в приложении по-русски.
String appRoleLabel(String role) => switch (role.trim().toLowerCase()) {
      'admin' => 'Администратор',
      'pastor' => 'Пастор',
      'minister' => 'Служитель',
      'editor' => 'Редактор',
      'musician' => 'Музыкант',
      'parishioner' => 'Прихожанин',
      'member' => 'Участник',
      final other => other,
    };

class _Hero extends StatelessWidget {
  const _Hero({required this.name, required this.subtitle, required this.avatarUrl, required this.group, required this.actions});

  final String name;
  final String subtitle;
  final String? avatarUrl;
  final bool group;
  final List<Widget> actions;

  @override
  Widget build(BuildContext context) {
    final avatar = ClipOval(
      child: SizedBox(
        width: 104,
        height: 104,
        child: avatarUrl == null
            ? Container(
                color: Colors.white.withValues(alpha: 0.18),
                alignment: Alignment.center,
                child: group ? const Icon(Icons.groups_rounded, size: 48, color: Colors.white) : Text(initialsOf(name), style: const TextStyle(fontSize: 38, fontWeight: FontWeight.w800, color: Colors.white)),
              )
            : Image.network(
                avatarUrl!,
                fit: BoxFit.cover,
                errorBuilder: (_, _, _) => Container(color: Colors.white.withValues(alpha: 0.18), alignment: Alignment.center, child: Text(initialsOf(name), style: const TextStyle(fontSize: 38, fontWeight: FontWeight.w800, color: Colors.white))),
              ),
      ),
    );
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Color(0xFF7D3640), Color(0xFF5A1826)]),
      ),
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(Space.lg, Space.sm, Space.lg, Space.lg),
          child: Column(
            children: [
              Align(
                alignment: Alignment.centerLeft,
                child: HeaderButton(icon: Icons.chevron_left_rounded, tooltip: 'Назад к чату', onPressed: () => Navigator.of(context).maybePop()),
              ),
              const SizedBox(height: 4),
              ExcludeSemantics(child: avatar),
              const SizedBox(height: 12),
              Semantics(
                header: true,
                child: Text(name, textAlign: TextAlign.center, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800, height: 1.2, color: Colors.white)),
              ),
              if (subtitle.isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(subtitle, textAlign: TextAlign.center, style: const TextStyle(fontSize: 14, color: Color(0xCCFFFFFF))),
              ],
              const SizedBox(height: 18),
              Row(mainAxisAlignment: MainAxisAlignment.center, children: [for (final a in actions) Padding(padding: const EdgeInsets.symmetric(horizontal: 5), child: a)]),
            ],
          ),
        ),
      ),
    );
  }
}

class _ActionTile extends StatelessWidget {
  const _ActionTile({required this.icon, required this.label, required this.onTap, this.pressed = false});
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool pressed;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      selected: pressed,
      label: label,
      excludeSemantics: true,
      child: Material(
        color: Colors.white.withValues(alpha: pressed ? 0.28 : 0.16),
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: onTap,
          child: SizedBox(
            width: 84,
            height: 68,
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(icon, color: Colors.white, size: 24),
                const SizedBox(height: 4),
                Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Colors.white)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.icon, required this.tone, required this.label, required this.value, this.onTap, this.trailing});
  final IconData icon;
  final Tone tone;
  final String label;
  final String value;
  final VoidCallback? onTap;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return ListRow(
      leading: IconTile(icon, tone: tone, size: 38),
      title: value,
      subtitle: label,
      titleColor: onTap != null ? palette.accent : null,
      trailing: trailing,
      chevron: false,
      onTap: onTap,
    );
  }
}

class _ChipsRow extends StatelessWidget {
  const _ChipsRow({required this.icon, required this.tone, required this.label, required this.items});
  final IconData icon;
  final Tone tone;
  final String label;
  final List<String> items;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          IconTile(icon, tone: tone, size: 38),
          const SizedBox(width: Space.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: TextStyle(fontSize: 13, color: palette.inkMuted)),
                const SizedBox(height: 6),
                Wrap(spacing: 6, runSpacing: 6, children: [for (final item in items) StatusPill(item, tone: tone)]),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _SharedMediaCard extends StatelessWidget {
  const _SharedMediaCard({required this.media, required this.failed, required this.onOpen});
  final SharedMedia? media;
  final bool failed;
  final void Function(String url) onOpen;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final m = media;
    Widget body;
    if (failed) {
      body = Text('Не удалось загрузить медиа.', style: TextStyle(color: palette.inkMuted));
    } else if (m == null) {
      body = const Padding(padding: EdgeInsets.symmetric(vertical: 12), child: Center(child: CircularProgressIndicator()));
    } else if (m.isEmpty) {
      body = Text('Фото, файлов и ссылок пока нет.', style: TextStyle(color: palette.inkMuted));
    } else {
      body = Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (m.images.isNotEmpty) ...[
            _Caption('Фото · ${m.images.length}'),
            const SizedBox(height: 8),
            GridView.count(
              crossAxisCount: 3,
              mainAxisSpacing: 4,
              crossAxisSpacing: 4,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              children: [
                for (final image in m.images.take(9))
                  Semantics(
                    button: true,
                    label: 'Открыть фото',
                    child: GestureDetector(
                      onTap: () => pushPage(context, ImageViewerPage(url: image.url)),
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(8),
                        child: Image.network(image.url, fit: BoxFit.cover, errorBuilder: (_, _, _) => Container(color: palette.outline)),
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 14),
          ],
          if (m.files.isNotEmpty) ...[
            _Caption('Файлы · ${m.files.length}'),
            for (final f in m.files.take(6))
              ListRow(
                leading: const IconTile(Icons.insert_drive_file_outlined, tone: Tone.amber, size: 38),
                title: f.name,
                chevron: false,
                padding: const EdgeInsets.symmetric(vertical: 8),
                onTap: () => onOpen(f.url),
              ),
            const SizedBox(height: 8),
          ],
          if (m.links.isNotEmpty) ...[
            _Caption('Ссылки · ${m.links.length}'),
            for (final l in m.links.take(6))
              ListRow(
                leading: const IconTile(Icons.link_rounded, tone: Tone.teal, size: 38),
                title: l.url,
                chevron: false,
                padding: const EdgeInsets.symmetric(vertical: 8),
                onTap: () => onOpen(l.url),
              ),
          ],
        ],
      );
    }
    return ChurchCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Semantics(header: true, child: Text('Общие медиа', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: palette.ink))),
          const SizedBox(height: 10),
          body,
        ],
      ),
    );
  }
}

class _Caption extends StatelessWidget {
  const _Caption(this.text);
  final String text;

  @override
  Widget build(BuildContext context) =>
      Text(text.toUpperCase(), style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800, letterSpacing: 0.8, color: context.palette.inkMuted));
}
