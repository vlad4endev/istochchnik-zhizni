import 'package:image_picker/image_picker.dart';
import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../../core/church_api.dart';
import '../../core/json.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../ui/kit/kit.dart';
import '../../ui/widgets.dart';
import 'notifications_card.dart';

class ProfilePage extends StatefulWidget {
  const ProfilePage({super.key, this.focusNeed = false});

  /// Открыть сразу с курсором в поле молитвенной нужды.
  final bool focusNeed;

  @override
  State<ProfilePage> createState() => _ProfilePageState();
}

class _ProfilePageState extends State<ProfilePage> {
  late final TextEditingController _first;
  late final TextEditingController _last;
  late final TextEditingController _need;
  final _currentPassword = TextEditingController();
  final _newPassword = TextEditingController();
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    final user = context.read<SessionController>().user;
    _first = TextEditingController(text: user?.firstName ?? '');
    _last = TextEditingController(text: user?.lastName ?? '');
    _need = TextEditingController(text: user?.prayerRequest ?? '');
  }

  @override
  void dispose() {
    _first.dispose();
    _last.dispose();
    _need.dispose();
    _currentPassword.dispose();
    _newPassword.dispose();
    super.dispose();
  }

  ChurchApi get _api => ChurchApi(context.read<SessionController>());

  Future<void> _save() async {
    setState(() => _busy = true);
    try {
      await _api.patchMe({
        'first_name': _first.text.trim(),
        'last_name': _last.text.trim(),
        'prayer_request': _need.text,
      });
      if (!mounted) return;
      showMessage(context, 'Профиль сохранён');
    } catch (error) {
      if (!mounted) return;
      showMessage(context, describeDio(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _avatar() async {
    final file = await ImagePicker().pickImage(source: ImageSource.gallery, imageQuality: 85);
    if (file == null) return;
    setState(() => _busy = true);
    try {
      await _api.uploadAvatar(file.path, file.name);
      if (!mounted) return;
      showMessage(context, 'Фото обновлено');
    } catch (error) {
      if (!mounted) return;
      showMessage(context, describeDio(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _password() async {
    if (_currentPassword.text.isEmpty || _newPassword.text.length < 6) {
      showMessage(context, 'Введите текущий пароль и новый — не короче 6 символов');
      return;
    }
    setState(() => _busy = true);
    try {
      await _api.changePassword(_currentPassword.text, _newPassword.text);
      _currentPassword.clear();
      _newPassword.clear();
      if (!mounted) return;
      showMessage(context, 'Пароль изменён');
    } catch (error) {
      if (!mounted) return;
      showMessage(context, describeDio(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionController>();
    final user = session.user;
    final avatar = resolveUrl(session.apiOrigin, user?.avatarUrl);
    final palette = context.palette;
    return ChurchPage(
      title: 'Профиль',
      body: SheetList(
        children: [
          ChurchCard(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Semantics(
                  button: true,
                  label: 'Сменить фото',
                  child: GestureDetector(
                    onTap: _busy ? null : _avatar,
                    child: Stack(
                      clipBehavior: Clip.none,
                      children: [
                        ChurchAvatar(name: user?.displayName ?? '?', imageUrl: avatar, size: 64, ring: true),
                        Positioned(
                          right: -2,
                          bottom: -2,
                          child: Container(
                            width: 26,
                            height: 26,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: ChurchColors.amberBlob,
                              border: Border.all(color: palette.card, width: 2),
                            ),
                            child: const Icon(Icons.photo_camera_outlined, size: 14, color: Colors.white),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        user?.displayName ?? 'Участник',
                        style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, letterSpacing: -0.2, color: palette.ink),
                      ),
                      const SizedBox(height: 6),
                      Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        children: [
                          if (user != null) StatusPill(roleLabel(user.role)),
                          if ((user?.ministryRole ?? '').isNotEmpty) StatusPill(user!.ministryRole, tone: Tone.green),
                        ],
                      ),
                      if (user?.phone != null) ...[
                        const SizedBox(height: 6),
                        Text(user!.phone!, style: TextStyle(fontSize: 13, color: palette.inkMuted)),
                      ],
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SectionLabel('Личные данные'),
          ChurchCard(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                LabeledField(label: 'Имя', controller: _first, textCapitalization: TextCapitalization.words),
                const SizedBox(height: Space.md),
                LabeledField(label: 'Фамилия', controller: _last, textCapitalization: TextCapitalization.words),
                const SizedBox(height: Space.md),
                LabeledField(
                  label: 'Молитвенная нужда',
                  note: '— видна в молитвенном цикле',
                  controller: _need,
                  autofocus: widget.focusNeed,
                  hint: 'О чём молиться за вас',
                  minLines: 3,
                  maxLines: 6,
                  textCapitalization: TextCapitalization.sentences,
                ),
                const SizedBox(height: Space.lg),
                PrimaryButton(label: 'Сохранить', busy: _busy, height: 50, onPressed: _save),
              ],
            ),
          ),
          const NotificationsCard(),
          const SectionLabel('Безопасность'),
          ChurchCard(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                LabeledField(label: 'Текущий пароль', controller: _currentPassword, obscureText: true),
                const SizedBox(height: Space.md),
                LabeledField(label: 'Новый пароль', note: '— от 6 символов', controller: _newPassword, obscureText: true),
                const SizedBox(height: Space.lg),
                SecondaryButton(label: 'Сменить пароль', icon: Icons.lock_outline_rounded, onPressed: _busy ? null : _password),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
