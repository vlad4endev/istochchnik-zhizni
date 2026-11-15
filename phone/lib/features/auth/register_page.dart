import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../../core/phone_format.dart';
import '../../core/session.dart';

class RegisterPage extends StatefulWidget {
  const RegisterPage({super.key});

  @override
  State<RegisterPage> createState() => _RegisterPageState();
}

class _RegisterPageState extends State<RegisterPage> {
  final _first = TextEditingController();
  final _last = TextEditingController();
  final _phone = TextEditingController();
  final _password = TextEditingController();
  DateTime? _birth;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _first.dispose();
    _last.dispose();
    _phone.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _pickBirth() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: DateTime(now.year - 25),
      firstDate: DateTime(1920),
      lastDate: now,
      helpText: 'Дата рождения',
    );
    if (picked != null) setState(() => _birth = picked);
  }

  Future<void> _submit() async {
    if (_birth == null) {
      setState(() => _error = 'Укажите дату рождения');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    final birth =
        '${_birth!.year.toString().padLeft(4, '0')}-${_birth!.month.toString().padLeft(2, '0')}-${_birth!.day.toString().padLeft(2, '0')}';
    final message = await context.read<SessionController>().register(
          firstName: _first.text.trim(),
          lastName: _last.text.trim(),
          phone: phoneToApiFormat(_phone.text),
          password: _password.text,
          birthDate: birth,
        );
    if (!mounted) return;
    setState(() {
      _busy = false;
      _error = message;
    });
    if (message == null) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final birthLabel = _birth == null
        ? 'Дата рождения'
        : '${_birth!.day.toString().padLeft(2, '0')}.${_birth!.month.toString().padLeft(2, '0')}.${_birth!.year}';
    return Scaffold(
      appBar: AppBar(title: const Text('Заявка')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          TextField(controller: _first, decoration: const InputDecoration(labelText: 'Имя')),
          const SizedBox(height: 12),
          TextField(controller: _last, decoration: const InputDecoration(labelText: 'Фамилия')),
          const SizedBox(height: 12),
          TextField(
            controller: _phone,
            keyboardType: TextInputType.phone,
            decoration: const InputDecoration(labelText: 'Телефон'),
            onChanged: (value) {
              final formatted = formatRuPhoneInput(value);
              if (formatted != value) {
                _phone.value = TextEditingValue(
                  text: formatted,
                  selection: TextSelection.collapsed(offset: formatted.length),
                );
              }
            },
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _password,
            obscureText: true,
            decoration: const InputDecoration(labelText: 'Пароль'),
          ),
          const SizedBox(height: 12),
          OutlinedButton(onPressed: _pickBirth, child: Text(birthLabel)),
          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
          ],
          const SizedBox(height: 20),
          FilledButton(
            onPressed: _busy ? null : _submit,
            child: Text(_busy ? 'Отправка…' : 'Отправить заявку'),
          ),
        ],
      ),
    );
  }
}
