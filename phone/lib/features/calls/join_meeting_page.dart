import 'package:flutter/services.dart';
import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../../core/church_api.dart';
import '../../core/session.dart';
import '../../ui/kit/kit.dart';
import '../../ui/widgets.dart';
import '../prayer/widgets/sheet_frame.dart';
import 'call_page.dart';
import 'logic/invite_logic.dart';
import 'logic/meeting_logic.dart';

typedef InvitePreviewLoader = Future<InvitePreview> Function(String token);

Future<InvitePreview> _loadPreview(
  SessionController session,
  String token,
) async =>
    InvitePreview.fromJson(await ChurchApi(session).invitationPreview(token));

/// Вход во встречу по ссылке-приглашению: что за встреча, микрофон/камера, «Войти».
class JoinMeetingPage extends StatefulWidget {
  const JoinMeetingPage({super.key, required this.token, this.loader});

  final String token;

  /// Подмена загрузки превью в тестах.
  final InvitePreviewLoader? loader;

  @override
  State<JoinMeetingPage> createState() => _JoinMeetingPageState();
}

class _JoinMeetingPageState extends State<JoinMeetingPage> {
  InvitePreview? _preview;
  String? _error;
  bool _loading = true;
  bool _mic = true;
  bool _cam = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final loader =
          widget.loader ??
          (token) => _loadPreview(context.read<SessionController>(), token);
      final preview = await loader(widget.token);
      if (!mounted) return;
      setState(() {
        _preview = preview;
        _cam = preview.media.isVideo;
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = describeDio(error);
        _loading = false;
      });
    }
  }

  void _join(InvitePreview preview) {
    Navigator.of(context).pushReplacement(
      MaterialPageRoute<void>(
        builder: (_) => CallPage(
          inviteToken: widget.token,
          inviteMedia: preview.media,
          micOn: _mic,
          camOn: preview.media.isVideo && _cam,
          video: preview.media.isVideo,
          title: preview.displayTitle,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final preview = _preview;
    final blocked = preview?.blockReason;
    return ChurchPage(
      title: preview == null ? 'Вход во встречу' : preview.displayTitle,
      subtitle: preview == null
          ? 'Приглашение по ссылке'
          : (preview.media.isVideo ? 'Видеовстреча' : 'Аудиовстреча'),
      body: AsyncBody(
        loading: _loading,
        error: _error,
        onRetry: _load,
        child: preview == null
            ? const SizedBox.shrink()
            : SheetList(
                children: [
                  if (blocked != null) ...[
                    InfoBanner(blocked, error: true),
                    const SizedBox(height: 12),
                    SecondaryButton(
                      label: 'Назад',
                      icon: Icons.arrow_back_rounded,
                      onPressed: () => Navigator.of(context).maybePop(),
                    ),
                  ] else ...[
                    if (preview.participants != null)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Text(
                          'Участников: ${preview.participants}',
                          style: TextStyle(color: context.palette.inkMuted),
                        ),
                      ),
                    Material(
                      type: MaterialType.transparency,
                      child: Column(
                        children: [
                          SwitchListTile(
                            key: const ValueKey('join-mic'),
                            contentPadding: EdgeInsets.zero,
                            secondary: Icon(
                              _mic
                                  ? Icons.mic_none_rounded
                                  : Icons.mic_off_rounded,
                            ),
                            title: const Text('Микрофон включён'),
                            value: _mic,
                            onChanged: (v) => setState(() => _mic = v),
                          ),
                          if (preview.media.isVideo)
                            SwitchListTile(
                              key: const ValueKey('join-cam'),
                              contentPadding: EdgeInsets.zero,
                              secondary: Icon(
                                _cam
                                    ? Icons.videocam_outlined
                                    : Icons.videocam_off_outlined,
                              ),
                              title: const Text('Камера включена'),
                              value: _cam,
                              onChanged: (v) => setState(() => _cam = v),
                            ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                    PrimaryButton(
                      key: const ValueKey('join-go'),
                      label: 'Войти во встречу',
                      icon: preview.media.isVideo
                          ? Icons.videocam_rounded
                          : Icons.mic_rounded,
                      onPressed: () => _join(preview),
                    ),
                  ],
                ],
              ),
      ),
    );
  }
}

/// Открыть встречу по ссылке из сообщения; возвращает false, если это не ссылка-приглашение.
bool openInviteIfAny(BuildContext context, String url) {
  final token = inviteTokenFromUrl(url);
  if (token == null) return false;
  pushPage(context, JoinMeetingPage(token: token));
  return true;
}

/// Лист «Войти по ссылке»: вставить ссылку (или «название + ссылка»), перейти к входу.
Future<void> showJoinByLinkSheet(BuildContext context) async {
  final token = await showPrayerSheet<String>(
    context,
    title: 'Войти по ссылке',
    subtitle: 'Вставьте ссылку-приглашение на встречу',
    builder: (_) => const JoinByLinkForm(),
  );
  if (token == null || !context.mounted) return;
  await pushPage(context, JoinMeetingPage(token: token));
}

class JoinByLinkForm extends StatefulWidget {
  const JoinByLinkForm({super.key});

  @override
  State<JoinByLinkForm> createState() => _JoinByLinkFormState();
}

class _JoinByLinkFormState extends State<JoinByLinkForm> {
  final _link = TextEditingController();
  String? _error;

  @override
  void initState() {
    super.initState();
    _prefillFromClipboard();
  }

  Future<void> _prefillFromClipboard() async {
    try {
      final data = await Clipboard.getData(Clipboard.kTextPlain);
      if (!mounted || _link.text.isNotEmpty || parseInviteToken(data?.text) == null) {
        return;
      }
      setState(() => _link.text = data!.text!.trim());
    } catch (_) {
      // Буфер недоступен — просто пустое поле.
    }
  }

  @override
  void dispose() {
    _link.dispose();
    super.dispose();
  }

  void _submit() {
    final token = parseInviteToken(_link.text);
    if (token == null) {
      setState(
        () => _error =
            'Не нашли ссылку на встречу. Скопируйте её целиком из сообщения.',
      );
      return;
    }
    Navigator.of(context).pop(token);
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        LabeledField(
          label: 'Ссылка на встречу',
          controller: _link,
          hint: 'https://…/call/join/…',
          keyboardType: TextInputType.url,
          textInputAction: TextInputAction.go,
          onChanged: (_) => setState(() => _error = null),
          onSubmitted: (_) => _submit(),
          autofocus: true,
        ),
        if (_error != null) ...[
          const SizedBox(height: 8),
          InfoBanner(_error!, error: true),
        ],
        const SizedBox(height: 8),
        SecondaryButton(
          label: 'Вставить из буфера',
          icon: Icons.content_paste_rounded,
          onPressed: () async {
            final data = await Clipboard.getData(Clipboard.kTextPlain);
            if (!mounted) return;
            setState(() {
              _link.text = (data?.text ?? '').trim();
              _error = null;
            });
          },
        ),
        const SizedBox(height: 12),
        PrimaryButton(
          label: 'Продолжить',
          icon: Icons.login_rounded,
          onPressed: _submit,
        ),
      ],
    );
  }
}
