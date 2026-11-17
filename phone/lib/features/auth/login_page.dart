import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../../core/phone_format.dart';
import '../../core/session.dart';
import '../../ui/kit/kit.dart';
import 'auth_scaffold.dart';
import 'register_page.dart';

/// Приветствие: фото общины на весь экран, снизу — тёмная панель с кнопками.
class LoginPage extends StatelessWidget {
  const LoginPage({super.key});

  @override
  Widget build(BuildContext context) {
    return DarkPage(
      extraGlow: false,
      child: Column(
        children: [
          Expanded(
            child: Stack(
              fit: StackFit.expand,
              children: [
                Image.asset(
                  'assets/images/welcome-hero.webp',
                  fit: BoxFit.cover,
                  alignment: const Alignment(0, 0.45),
                  semanticLabel: 'Община верующих перед крестом на закате',
                ),
                // Сверху затемнение под название, снизу фото растворяется в панели.
                const IgnorePointer(
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [Color(0xB33A0F20), Color(0x003A0F20), Color(0x001E0710), ChurchColors.nightDeep],
                        stops: [0, 0.28, 0.62, 1],
                      ),
                    ),
                  ),
                ),
                SafeArea(
                  bottom: false,
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(24, 20, 24, 0),
                    child: Align(
                      alignment: Alignment.topLeft,
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const ChurchLogo(size: 40),
                          const SizedBox(width: 12),
                          const Text(
                            'Источник жизни',
                            style: TextStyle(
                              fontSize: 19,
                              fontWeight: FontWeight.w800,
                              letterSpacing: -0.2,
                              shadows: [Shadow(color: Color(0x66000000), blurRadius: 12)],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
          const ColoredBox(color: ChurchColors.nightDeep, child: _WelcomePanel()),
        ],
      ),
    );
  }
}

class _WelcomePanel extends StatelessWidget {
  const _WelcomePanel();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      color: Colors.transparent,
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 4, 24, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Semantics(
                header: true,
                child: const Text.rich(
                  TextSpan(
                    text: 'Будьте на связи\n',
                    children: [
                      TextSpan(
                        text: 'со своей общиной',
                        style: TextStyle(
                          fontFamily: ChurchType.serif,
                          fontStyle: FontStyle.italic,
                          fontWeight: FontWeight.w500,
                          fontSize: 34,
                          letterSpacing: -0.34,
                          color: ChurchColors.amber,
                        ),
                      ),
                    ],
                  ),
                  style: TextStyle(fontSize: 31, height: 1.12, fontWeight: FontWeight.w800, letterSpacing: -0.78),
                ),
              ),
              const SizedBox(height: 12),
              const Text(
                'Молитва, чаты, звонки и служения вашей церкви — в одном приложении',
                style: TextStyle(fontSize: 15, height: 1.5, color: Color(0xC7FFFFFF)),
              ),
              const SizedBox(height: 22),
              _CreamButton(
                label: 'Войти',
                onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const SignInPage())),
              ),
              const SizedBox(height: 10),
              _GhostButton(
                label: 'Зарегистрироваться',
                onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const RegisterPage())),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _CreamButton extends StatelessWidget {
  const _CreamButton({required this.label, required this.onPressed});

  final String label;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: label,
      excludeSemantics: true,
      child: Material(
        color: ChurchColors.creamButton,
        borderRadius: BorderRadius.circular(Radii.card),
        elevation: 0,
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onPressed,
          child: SizedBox(
            height: 58,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(24, 9, 9, 9),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      label,
                      style: const TextStyle(fontSize: 16.5, fontWeight: FontWeight.w700, color: ChurchColors.amberInk),
                    ),
                  ),
                  Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(color: const Color(0xFF6C2431), borderRadius: BorderRadius.circular(Radii.md)),
                    child: const Icon(Icons.arrow_forward_rounded, color: ChurchColors.amber, size: 20),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _GhostButton extends StatelessWidget {
  const _GhostButton({required this.label, required this.onPressed});

  final String label;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: label,
      excludeSemantics: true,
      child: Material(
        color: Colors.white.withValues(alpha: 0.06),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(Radii.card),
          side: BorderSide(color: Colors.white.withValues(alpha: 0.3), width: 1.5),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onPressed,
          child: SizedBox(
            height: 54,
            child: Center(
              child: Text(label, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: Colors.white)),
            ),
          ),
        ),
      ),
    );
  }
}

/// Форма входа по телефону и паролю.
class SignInPage extends StatefulWidget {
  const SignInPage({super.key});

  @override
  State<SignInPage> createState() => _SignInPageState();
}

class _SignInPageState extends State<SignInPage> {
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
    if (_busy) return;
    if (_phone.text.replaceAll(RegExp(r'\D'), '').length < 11) {
      setState(() => _error = 'Введите номер телефона полностью');
      return;
    }
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
    if (message == null) Navigator.of(context).popUntil((route) => route.isFirst);
  }

  void _formatPhone(String value) {
    final formatted = formatRuPhoneInput(value);
    if (formatted == value) return;
    _phone.value = TextEditingValue(text: formatted, selection: TextSelection.collapsed(offset: formatted.length));
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return AuthScaffold(
      title: 'Вход в систему',
      description: 'Укажите телефон и пароль, которые использовали при регистрации.',
      children: [
        SegmentedPills<int>(
          segments: const [(0, 'Вход'), (1, 'Регистрация')],
          selected: 0,
          onChanged: (value) {
            if (value == 1) {
              Navigator.of(context).pushReplacement(MaterialPageRoute<void>(builder: (_) => const RegisterPage()));
            }
          },
        ),
        const SizedBox(height: Space.lg),
        LabeledField(
          label: 'Номер телефона',
          controller: _phone,
          hint: '+7 (900) 000-00-00',
          keyboardType: TextInputType.phone,
          textInputAction: TextInputAction.next,
          autofillHints: const [AutofillHints.telephoneNumber],
          onChanged: _formatPhone,
        ),
        const SizedBox(height: Space.md),
        LabeledField(
          label: 'Пароль',
          controller: _password,
          hint: 'Пароль',
          obscureText: _obscure,
          textInputAction: TextInputAction.done,
          autofillHints: const [AutofillHints.password],
          onSubmitted: (_) => _submit(),
          suffix: IconButton(
            tooltip: _obscure ? 'Показать пароль' : 'Скрыть пароль',
            onPressed: () => setState(() => _obscure = !_obscure),
            icon: Icon(_obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined, color: palette.inkFaint),
          ),
        ),
        if (_error != null) ...[
          const SizedBox(height: Space.md),
          InfoBanner(_error!, error: true),
        ],
        const SizedBox(height: Space.xl),
        PrimaryButton(label: 'Войти', icon: Icons.arrow_forward_rounded, busy: _busy, height: 58, onPressed: _submit),
      ],
    );
  }
}
