import 'package:image_picker/image_picker.dart';
import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../../core/church_api.dart';
import '../../core/json.dart';
import '../../core/session.dart';
import '../../core/theme.dart';

class ProfilePage extends StatefulWidget {
  const ProfilePage({super.key});

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
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Профиль сохранён')));
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(describeDio(error))));
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
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Фото обновлено')));
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(describeDio(error))));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _password() async {
    if (_currentPassword.text.isEmpty || _newPassword.text.length < 6) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Новый пароль — не короче 6 символов')));
      return;
    }
    setState(() => _busy = true);
    try {
      await _api.changePassword(_currentPassword.text, _newPassword.text);
      _currentPassword.clear();
      _newPassword.clear();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Пароль изменён')));
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(describeDio(error))));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<SessionController>().user;
    final origin = context.watch<SessionController>().apiOrigin;
    final avatar = resolveUrl(origin, user?.avatarUrl);
    return Scaffold(
      appBar: AppBar(title: const Text('Профиль')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Center(
            child: InkWell(
              onTap: _busy ? null : _avatar,
              child: CircleAvatar(
                radius: 40,
                backgroundColor: churchBurgundy,
                backgroundImage: avatar.isEmpty ? null : NetworkImage(avatar),
                child: avatar.isEmpty
                    ? Text(
                        (user?.displayName.isEmpty ?? true) ? '?' : user!.displayName.substring(0, 1).toUpperCase(),
                        style: const TextStyle(color: Colors.white, fontSize: 28),
                      )
                    : null,
              ),
            ),
          ),
          const SizedBox(height: 8),
          const Center(child: Text('Нажмите на фото, чтобы заменить')),
          const SizedBox(height: 16),
          TextField(controller: _first, decoration: const InputDecoration(labelText: 'Имя')),
          const SizedBox(height: 12),
          TextField(controller: _last, decoration: const InputDecoration(labelText: 'Фамилия')),
          const SizedBox(height: 12),
          TextField(
            controller: _need,
            minLines: 3,
            maxLines: 6,
            decoration: const InputDecoration(labelText: 'Молитвенная нужда'),
          ),
          const SizedBox(height: 12),
          FilledButton(onPressed: _busy ? null : _save, child: const Text('Сохранить')),
          const SizedBox(height: 24),
          Text('Пароль', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          TextField(controller: _currentPassword, obscureText: true, decoration: const InputDecoration(labelText: 'Текущий пароль')),
          const SizedBox(height: 12),
          TextField(controller: _newPassword, obscureText: true, decoration: const InputDecoration(labelText: 'Новый пароль')),
          const SizedBox(height: 12),
          OutlinedButton(onPressed: _busy ? null : _password, child: const Text('Сменить пароль')),
        ],
      ),
    );
  }
}
