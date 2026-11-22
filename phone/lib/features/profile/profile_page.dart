import 'package:image_picker/image_picker.dart';
import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/church_api.dart';
import '../../core/json.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../ui/kit/kit.dart';
import '../../ui/widgets.dart';
import 'logic/profile_form.dart';
import '../../core/push_status.dart';
import 'notifications_card.dart';

class ProfilePage extends StatefulWidget {
  const ProfilePage({super.key, this.focusNeed = false, this.api, this.pushStatus});

  /// Открыть сразу с курсором в поле молитвенной нужды.
  final bool focusNeed;

  /// Для тестов; в приложении создаётся из сессии.
  final ChurchApi? api;
  final PushStatus? pushStatus;

  @override
  State<ProfilePage> createState() => _ProfilePageState();
}

class _ProfilePageState extends State<ProfilePage> {
  late final TextEditingController _first;
  late final TextEditingController _last;
  late final TextEditingController _email;
  late final TextEditingController _need;
  final _currentPassword = TextEditingController();
  final _newPassword = TextEditingController();
  late ProfileForm _saved;
  late String _birth;
  bool _busy = false;
  bool _passwordOpen = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final user = context.read<SessionController>().user;
    _saved = ProfileForm.of(user);
    _first = TextEditingController(text: _saved.first);
    _last = TextEditingController(text: _saved.last);
    _email = TextEditingController(text: _saved.email);
    _need = TextEditingController(text: _saved.need);
    _birth = _saved.birth;
    for (final c in [_first, _last, _email, _need]) {
      c.addListener(_changed);
    }
  }

  @override
  void dispose() {
    for (final c in [_first, _last, _email, _need, _currentPassword, _newPassword]) {
      c.dispose();
    }
    super.dispose();
  }

  ChurchApi get _api => widget.api ?? ChurchApi(context.read<SessionController>());

  ProfileForm get _form => ProfileForm(first: _first.text, last: _last.text, email: _email.text, birth: _birth, need: _need.text);
  bool get _dirty => _form.changedFrom(_saved);

  void _changed() => setState(() => _error = null);

  Future<void> _save() async {
    final form = _form;
    final problem = form.validate();
    if (problem != null) {
      setState(() => _error = problem);
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final user = await _api.patchMe(form.diff(_saved));
      if (!mounted) return;
      setState(() => _saved = ProfileForm.of(user));
      showMessage(context, 'Профиль сохранён');
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = describeDio(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _pickBirth() async {
    final now = DateTime.now();
    final initial = DateTime.tryParse(_birth) ?? DateTime(now.year - 30, now.month, now.day);
    final picked = await showDatePicker(context: context, initialDate: initial, firstDate: DateTime(1900), lastDate: now, locale: const Locale('ru'), helpText: 'День рождения');
    if (picked != null) {
      setState(() {
        _birth = '${picked.year.toString().padLeft(4, '0')}-${picked.month.toString().padLeft(2, '0')}-${picked.day.toString().padLeft(2, '0')}';
        _error = null;
      });
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
      setState(() => _passwordOpen = false);
      showMessage(context, 'Пароль изменён');
    } catch (error) {
      if (!mounted) return;
      showMessage(context, describeDio(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<bool> _confirmLeave() async {
    final leave = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Выйти без сохранения?'),
        content: const Text('Изменения в профиле пропадут.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Остаться')),
          TextButton(style: TextButton.styleFrom(foregroundColor: ChurchColors.danger), onPressed: () => Navigator.pop(context, true), child: const Text('Выйти')),
        ],
      ),
    );
    return leave == true;
  }

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionController>();
    final user = session.user;
    final palette = context.palette;
    final dirty = _dirty;
    final ministries = splitMinistry(user?.ministryRole ?? '');
    final directions = splitMinistry(user?.ministryDirection ?? '');
    return PopScope(
      canPop: !dirty,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        if (await _confirmLeave() && context.mounted) Navigator.of(context).pop();
      },
      child: ChurchPage(
        title: 'Мой профиль',
        subtitle: user == null ? null : roleLabel(user.role),
        bottom: dirty
            ? SafeArea(
                top: false,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(Space.lg, 8, Space.lg, 10),
                  child: Row(
                    children: [
                      Expanded(
                        child: SecondaryButton(
                          key: const ValueKey('profile-discard'),
                          label: 'Отменить',
                          onPressed: _busy
                              ? null
                              : () => setState(() {
                                    _first.text = _saved.first;
                                    _last.text = _saved.last;
                                    _email.text = _saved.email;
                                    _need.text = _saved.need;
                                    _birth = _saved.birth;
                                    _error = null;
                                  }),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(flex: 2, child: PrimaryButton(key: const ValueKey('profile-save'), label: 'Сохранить', icon: Icons.check_rounded, busy: _busy, onPressed: _busy ? null : _save)),
                    ],
                  ),
                ),
              )
            : null,
        body: SheetList(
          children: [
            _Hero(user: user, avatarUrl: resolveUrl(session.apiOrigin, user?.avatarUrl), busy: _busy, onAvatar: _avatar),
            if (_error != null) Semantics(liveRegion: true, child: InfoBanner(_error!, error: true)),
            const SectionLabel('О себе'),
            ChurchCard(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  LabeledField(key: const ValueKey('profile-first'), label: 'Имя', controller: _first, textCapitalization: TextCapitalization.words, textInputAction: TextInputAction.next),
                  const SizedBox(height: Space.md),
                  LabeledField(key: const ValueKey('profile-last'), label: 'Фамилия', controller: _last, textCapitalization: TextCapitalization.words, textInputAction: TextInputAction.next),
                  const SizedBox(height: Space.md),
                  LabeledField(key: const ValueKey('profile-email'), label: 'Почта', note: '— необязательно', controller: _email, keyboardType: TextInputType.emailAddress, textInputAction: TextInputAction.next),
                  const SizedBox(height: Space.md),
                  _BirthRow(value: _birth, onPick: _pickBirth, onClear: () => setState(() => _birth = '')),
                ],
              ),
            ),
            const SectionLabel('Моя молитвенная нужда'),
            ChurchCard(
              padding: const EdgeInsets.all(14),
              child: LabeledField(
                key: const ValueKey('profile-need'),
                label: 'О чём молиться за вас',
                note: '— видна в молитвенном цикле',
                controller: _need,
                autofocus: widget.focusNeed,
                hint: 'Напишите коротко и по делу',
                minLines: 3,
                maxLines: 8,
                textCapitalization: TextCapitalization.sentences,
              ),
            ),
            if (user != null) ...[
              const SectionLabel('Служение в церкви'),
              ListGroup(
                dividerIndent: 70,
                children: [
                  ListRow(key: const ValueKey('profile-role'), leading: const IconTile(Icons.verified_user_outlined, tone: Tone.wine), title: 'Роль в приложении', subtitle: user.roles.map(roleLabel).toSet().join(', '), chevron: false),
                  ListRow(
                    key: const ValueKey('profile-ministry'),
                    leading: const IconTile(Icons.volunteer_activism_outlined, tone: Tone.green),
                    title: 'Служебная роль',
                    subtitle: ministries.isEmpty ? 'Не назначена' : ministries.join(', '),
                    subtitleMaxLines: 3,
                    chevron: false,
                  ),
                  ListRow(
                    key: const ValueKey('profile-direction'),
                    leading: const IconTile(Icons.groups_2_outlined, tone: Tone.violet),
                    title: 'Направление',
                    subtitle: directions.isEmpty ? 'Не назначено' : directions.join(', '),
                    subtitleMaxLines: 3,
                    chevron: false,
                  ),
                ],
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(6, 0, 6, 0),
                child: Text('Роли и направления назначает администратор. Если что-то указано неверно — напишите ему.', style: TextStyle(fontSize: 12.5, color: palette.inkMuted)),
              ),
            ],
            NotificationsCard(status: widget.pushStatus),
            if (user?.username != null)
              ListGroup(
                children: [
                  ListRow(
                    key: const ValueKey('profile-public'),
                    leading: const IconTile(Icons.public_rounded, tone: Tone.teal),
                    title: 'Моя страница на сайте',
                    subtitle: 'Как вас видят другие',
                    trailing: Icon(Icons.open_in_new_rounded, size: 18, color: palette.chevron),
                    onTap: () => launchUrl(Uri.parse('${session.apiOrigin}/profile/${user!.username}'), mode: LaunchMode.externalApplication),
                  ),
                ],
              ),
            const SectionLabel('Безопасность'),
            ChurchCard(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  ListTile(
                    key: const ValueKey('profile-password-toggle'),
                    contentPadding: EdgeInsets.zero,
                    minTileHeight: 48,
                    leading: const IconTile(Icons.lock_outline_rounded, tone: Tone.amber, size: 38),
                    title: const Text('Сменить пароль', style: TextStyle(fontWeight: FontWeight.w700)),
                    trailing: Icon(_passwordOpen ? Icons.expand_less_rounded : Icons.expand_more_rounded),
                    onTap: () => setState(() => _passwordOpen = !_passwordOpen),
                  ),
                  if (_passwordOpen) ...[
                    const SizedBox(height: Space.sm),
                    LabeledField(label: 'Текущий пароль', controller: _currentPassword, obscureText: true),
                    const SizedBox(height: Space.md),
                    LabeledField(label: 'Новый пароль', note: '— от 6 символов', controller: _newPassword, obscureText: true),
                    const SizedBox(height: Space.lg),
                    SecondaryButton(key: const ValueKey('profile-password-save'), label: 'Сохранить пароль', icon: Icons.lock_reset_rounded, onPressed: _busy ? null : _password),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Hero extends StatelessWidget {
  const _Hero({required this.user, required this.avatarUrl, required this.busy, required this.onAvatar});

  final AppUser? user;
  final String? avatarUrl;
  final bool busy;
  final VoidCallback onAvatar;

  @override
  Widget build(BuildContext context) {
    final u = user;
    final ministries = splitMinistry(u?.ministryRole ?? '');
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 18, 16, 18),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(Radii.xl),
        gradient: const LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [ChurchColors.wine, ChurchColors.wineDeep]),
      ),
      child: Row(
        children: [
          Semantics(
            button: true,
            label: 'Сменить фото',
            child: GestureDetector(
              onTap: busy ? null : onAvatar,
              child: Stack(
                clipBehavior: Clip.none,
                children: [
                  ChurchAvatar(name: u?.displayName ?? '?', imageUrl: avatarUrl, size: 84, ring: true),
                  Positioned(
                    right: -2,
                    bottom: -2,
                    child: Container(
                      width: 30,
                      height: 30,
                      decoration: BoxDecoration(shape: BoxShape.circle, color: ChurchColors.amberBlob, border: Border.all(color: ChurchColors.wineDeep, width: 2)),
                      child: const Icon(Icons.photo_camera_outlined, size: 16, color: Colors.white),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(u?.displayName ?? 'Участник', maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800, letterSpacing: -0.3, color: Colors.white)),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    if (u != null) _HeroChip(roleLabel(u.role)),
                    for (final m in ministries.take(2)) _HeroChip(m),
                  ],
                ),
                if (u?.phone != null) ...[
                  const SizedBox(height: 8),
                  Text(u!.phone!, style: const TextStyle(fontSize: 13.5, color: Color(0xCCFFFFFF))),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _HeroChip extends StatelessWidget {
  const _HeroChip(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(color: const Color(0x2EFFFFFF), borderRadius: BorderRadius.circular(20)),
        child: Text(text, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Colors.white)),
      );
}

class _BirthRow extends StatelessWidget {
  const _BirthRow({required this.value, required this.onPick, required this.onClear});

  final String value;
  final VoidCallback onPick;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(padding: const EdgeInsets.only(left: 2, bottom: 6), child: Text('День рождения', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: palette.inkMuted))),
        Semantics(
          button: true,
          label: 'День рождения: ${birthLabel(value)}',
          excludeSemantics: true,
          child: InkWell(
            key: const ValueKey('profile-birth'),
            borderRadius: BorderRadius.circular(Radii.lg),
            onTap: onPick,
            child: Container(
              constraints: const BoxConstraints(minHeight: 52),
              padding: const EdgeInsets.symmetric(horizontal: 14),
              decoration: BoxDecoration(color: palette.field, borderRadius: BorderRadius.circular(Radii.lg), border: Border.all(color: palette.hairline)),
              child: Row(
                children: [
                  Icon(Icons.cake_outlined, size: 20, color: palette.inkMuted),
                  const SizedBox(width: 10),
                  Expanded(child: Text(birthLabel(value), style: TextStyle(fontSize: 15.5, color: value.isEmpty ? palette.inkFaint : palette.ink))),
                  if (value.isNotEmpty) IconButton(tooltip: 'Убрать дату', constraints: const BoxConstraints(minWidth: 44, minHeight: 44), onPressed: onClear, icon: Icon(Icons.close_rounded, size: 20, color: palette.inkMuted)),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}
