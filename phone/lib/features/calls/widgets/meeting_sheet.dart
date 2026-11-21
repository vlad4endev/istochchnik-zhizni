import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../../../core/session.dart';
import '../../../ui/kit/kit.dart';
import '../../../ui/widgets.dart';
import '../../prayer/widgets/sheet_frame.dart';
import '../call_page.dart';
import '../join_meeting_page.dart';
import '../logic/meeting_logic.dart';

/// Диалог создания конференции по ссылке: название, микрофон/камера, шаблоны стражи.
/// Создаёт встречу и открывает окно звонка. [conversationId] == null — отдельная встреча без чата.
Future<void> showMeetingSheet(BuildContext context, {required MeetingMedia media, String? conversationId, AppUser? user}) async {
  final launch = await showPrayerSheet<MeetingLaunch>(
    context,
    title: media.isVideo ? 'Создать видеовстречу' : 'Создать аудиовстречу',
    subtitle: conversationId == null ? 'Звонок по ссылке, без группы в чатах' : 'Конференция по ссылке в этом чате',
    builder: (_) => MeetingForm(media: media, conversationId: conversationId, user: user ?? context.read<SessionController>().user),
  );
  if (launch == null || !context.mounted) return;
  await pushPage(context, CallPage(video: launch.media.isVideo, title: launch.title ?? launch.media.defaultTitle, meeting: launch));
}

class MeetingForm extends StatefulWidget {
  const MeetingForm({super.key, required this.media, required this.conversationId, required this.user});

  final MeetingMedia media;
  final String? conversationId;
  final AppUser? user;

  @override
  State<MeetingForm> createState() => _MeetingFormState();
}

class _MeetingFormState extends State<MeetingForm> {
  final _title = TextEditingController();
  late bool _cam = widget.media.isVideo;
  bool _mic = true;

  @override
  void dispose() {
    _title.dispose();
    super.dispose();
  }

  void _submit([String? templateTitle]) {
    Navigator.of(context).pop(MeetingLaunch(
      media: widget.media,
      conversationId: widget.conversationId,
      title: cleanMeetingTitle(templateTitle ?? _title.text),
      micOn: _mic,
      camOn: widget.media.isVideo && _cam,
    ));
  }

  @override
  Widget build(BuildContext context) {
    final templates = canUseMeetingTemplates(widget.user);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        if (templates) ...[
          for (final tpl in prayerWatchTemplates)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: ListRow(
                key: ValueKey('meeting-template-${tpl.id}'),
                leading: IconTile(tpl.id == 'morning' ? Icons.wb_sunny_outlined : Icons.nights_stay_outlined, tone: tpl.id == 'morning' ? Tone.amber : Tone.violet),
                title: tpl.title,
                subtitle: tpl.hint,
                onTap: () => _submit(tpl.title),
              ),
            ),
          const SizedBox(height: 4),
        ],
        LabeledField(
          label: templates ? 'Своё название' : 'Название встречи',
          controller: _title,
          hint: templates ? 'Например: Молитва за семью' : widget.media.defaultTitle,
          textInputAction: TextInputAction.done,
          onSubmitted: (_) => _submit(),
        ),
        const SizedBox(height: 8),
        SwitchListTile(
          key: const ValueKey('meeting-mic'),
          contentPadding: EdgeInsets.zero,
          secondary: Icon(_mic ? Icons.mic_none_rounded : Icons.mic_off_rounded),
          title: const Text('Микрофон включён'),
          value: _mic,
          onChanged: (v) => setState(() => _mic = v),
        ),
        if (widget.media.isVideo)
          SwitchListTile(
            key: const ValueKey('meeting-cam'),
            contentPadding: EdgeInsets.zero,
            secondary: Icon(_cam ? Icons.videocam_outlined : Icons.videocam_off_outlined),
            title: const Text('Камера включена'),
            value: _cam,
            onChanged: (v) => setState(() => _cam = v),
          ),
        const SizedBox(height: 8),
        PrimaryButton(
          label: widget.media.isVideo ? 'Создать видеовстречу' : 'Создать аудиовстречу',
          icon: widget.media.isVideo ? Icons.videocam_rounded : Icons.mic_rounded,
          onPressed: _submit,
        ),
        const SizedBox(height: 8),
        Text(
          'Название и ссылка скопируются — отправьте их участникам. После завершения встреча закрывается.',
          style: TextStyle(fontSize: 12.5, color: context.palette.inkMuted),
        ),
      ],
    );
  }
}

/// Выбор вида конференции (видео / аудио) и переход к форме создания.
Future<void> showMeetingKindSheet(BuildContext context, {String? conversationId}) async {
  final choice = await showPrayerSheet<String>(
    context,
    title: 'Конференция по ссылке',
    subtitle: conversationId == null ? 'Отдельная встреча — участники подключаются по ссылке' : 'Ссылка-приглашение для участников',
    builder: (sheetContext) => Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        ListRow(
          key: const ValueKey('meeting-kind-video'),
          leading: const IconTile(Icons.videocam_outlined, tone: Tone.red),
          title: 'Видеоконференция',
          subtitle: 'С камерой и голосом',
          onTap: () => Navigator.pop(sheetContext, 'video'),
        ),
        const SizedBox(height: 8),
        ListRow(
          key: const ValueKey('meeting-kind-audio'),
          leading: const IconTile(Icons.mic_none_rounded, tone: Tone.violet),
          title: 'Аудиоконференция',
          subtitle: 'Только голос',
          onTap: () => Navigator.pop(sheetContext, 'audio'),
        ),
        const SizedBox(height: 8),
        ListRow(
          key: const ValueKey('meeting-kind-join'),
          leading: const IconTile(Icons.link_rounded, tone: Tone.amber),
          title: 'Войти по ссылке',
          subtitle: 'Есть приглашение на чужую встречу',
          onTap: () => Navigator.pop(sheetContext, 'join'),
        ),
      ],
    ),
  );
  if (choice == null || !context.mounted) return;
  if (choice == 'join') {
    await showJoinByLinkSheet(context);
    return;
  }
  await showMeetingSheet(context, media: choice == 'audio' ? MeetingMedia.audio : MeetingMedia.video, conversationId: conversationId);
}
