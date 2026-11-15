import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../../core/phone_format.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import 'register_page.dart';

class LoginPage extends StatefulWidget {
  const LoginPage({super.key});

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final _phone = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false;
  bool _obscure = true;
  String? _error;

  @override
  void dispose() {
    _phone.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    final message = await context.read<SessionController>().login(
          phoneToApiFormat(_phone.text),
          _password.text,
        );
    if (!mounted) return;
    setState(() {
      _busy = false;
      _error = message;
    });
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(24, 48, 24, 24),
          children: [
            CircleAvatar(
              radius: 32,
              backgroundColor: churchBurgundy,
              child: Icon(Icons.church, color: scheme.onPrimary, size: 32),
            ),
            const SizedBox(height: 16),
            Text('Источник жизни', style: Theme.of(context).textTheme.headlineMedium),
            const SizedBox(height: 6),
            Text(
              'Молитва, служение и общение церкви — в отдельном приложении',
              style: TextStyle(color: scheme.onSurfaceVariant),
            ),
            const SizedBox(height: 28),
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
              obscureText: _obscure,
              decoration: InputDecoration(
                labelText: 'Пароль',
                suffixIcon: IconButton(
                  onPressed: () => setState(() => _obscure = !_obscure),
                  icon: Icon(_obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                ),
              ),
              onSubmitted: (_) => _busy ? null : _submit(),
            ),
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(_error!, style: TextStyle(color: scheme.error)),
            ],
            const SizedBox(height: 20),
            FilledButton(
              onPressed: _busy ? null : _submit,
              child: _busy
                  ? const SizedBox(
                      height: 18,
                      width: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Войти'),
            ),
            TextButton(
              onPressed: () {
                Navigator.of(context).push(MaterialPageRoute(builder: (_) => const RegisterPage()));
              },
              child: const Text('Нет аккаунта — подать заявку'),
            ),
          ],
        ),
      ),
    );
  }
}
