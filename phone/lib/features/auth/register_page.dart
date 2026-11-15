import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../../core/dates.dart';
import '../../core/phone_format.dart';
import '../../core/session.dart';
import '../../ui/kit/kit.dart';
import 'auth_scaffold.dart';
import 'login_page.dart';

/// Заявка на регистрацию в три шага: о себе, телефон, пароль.
class RegisterPage extends StatefulWidget {
  const RegisterPage({super.key});

  @override
  State<RegisterPage> createState() => _RegisterPageState();
}

class _RegisterPageState extends State<RegisterPage> {
  static const _stepTitles = ['О вас', 'Телефон', 'Пароль'];

  final _first = TextEditingController();
  final _last = TextEditingController();
  final _phone = TextEditingController();
  final _password = TextEditingController();
  DateTime? _birth;
  int _step = 0;
  bool _busy = false;
  bool _obscure = true;
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
      initialDate: _birth ?? DateTime(now.year - 25),
      firstDate: DateTime(1920),
      lastDate: now,
      helpText: 'Дата рождения',
    );
    if (picked != null) setState(() => _birth = picked);
  }

  String? _validateStep() {
    switch (_step) {
      case 0:
        if (_first.text.trim().isEmpty || _last.text.trim().isEmpty) return 'Укажите имя и фамилию';
        if (_birth == null) return 'Укажите дату рождения';
      case 1:
        if (_phone.text.replaceAll(RegExp(r'\D'), '').length < 11) return 'Введите номер телефона полностью';
      case 2:
        if (_password.text.isEmpty) return 'Придумайте пароль';
    }
    return null;
  }

  Future<void> _next() async {
    final problem = _validateStep();
    if (problem != null) {
      setState(() => _error = problem);
      return;
    }
    if (_step < 2) {
      setState(() {
        _step++;
        _error = null;
      });
      return;
    }
    await _submit();
  }

  Future<void> _submit() async {
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
    if (message == null) Navigator.of(context).popUntil((route) => route.isFirst);
  }

  void _formatPhone(String value) {
    final formatted = formatRuPhoneInput(value);
    if (formatted == value) return;
    _phone.value = TextEditingValue(text: formatted, selection: TextSelection.collapsed(offset: formatted.length));
  }

  @override
  Widget build(BuildContext context) {
    return AuthScaffold(
      title: 'Регистрация',
      description: 'Имя, телефон и пароль. Заявку подтвердит администратор церкви.',
      children: [
        SegmentedPills<int>(
          segments: const [(0, 'Вход'), (1, 'Регистрация')],
          selected: 1,
          onChanged: (value) {
            if (value == 0) {
              Navigator.of(context).pushReplacement(MaterialPageRoute<void>(builder: (_) => const SignInPage()));
            }
          },
        ),
        const SizedBox(height: Space.lg),
        _StepIndicator(step: _step, total: _stepTitles.length),
        const SizedBox(height: Space.lg),
        Text(
          'ШАГ ${_step + 1} ИЗ ${_stepTitles.length} · ${_stepTitles[_step].toUpperCase()}',
          style: ChurchType.sectionLabel.copyWith(color: context.palette.accent),
        ),
        const SizedBox(height: Space.md),
        AnimatedSwitcher(
          duration: Motion.normal,
          child: KeyedSubtree(key: ValueKey(_step), child: _stepBody(context)),
        ),
        if (_error != null) ...[
          const SizedBox(height: Space.md),
          InfoBanner(_error!, error: true),
        ],
        const SizedBox(height: Space.xl),
        Row(
          children: [
            if (_step > 0) ...[
              SizedBox(
                width: 112,
                child: SecondaryButton(
                  label: 'Назад',
                  height: 58,
                  onPressed: _busy ? null : () => setState(() {
                        _step--;
                        _error = null;
                      }),
                ),
              ),
              const SizedBox(width: Space.md),
            ],
            Expanded(
              child: PrimaryButton(
                label: _step < 2 ? 'Далее' : 'Отправить заявку',
                icon: _step < 2 ? Icons.arrow_forward_rounded : Icons.send_rounded,
                height: 58,
                busy: _busy,
                onPressed: _next,
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _stepBody(BuildContext context) {
    final palette = context.palette;
    switch (_step) {
      case 0:
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            LabeledField(
              label: 'Имя',
              controller: _first,
              hint: 'Иван',
              textInputAction: TextInputAction.next,
              textCapitalization: TextCapitalization.words,
              autofillHints: const [AutofillHints.givenName],
            ),
            const SizedBox(height: Space.md),
            LabeledField(
              label: 'Фамилия',
              controller: _last,
              hint: 'Иванов',
              textInputAction: TextInputAction.next,
              textCapitalization: TextCapitalization.words,
              autofillHints: const [AutofillHints.familyName],
            ),
            const SizedBox(height: Space.md),
            Text('Дата рождения', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: palette.ink)),
            const SizedBox(height: 6),
            Material(
              color: palette.field,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(Radii.lg),
                side: BorderSide(color: palette.outline),
              ),
              clipBehavior: Clip.antiAlias,
              child: InkWell(
                onTap: _pickBirth,
                child: SizedBox(
                  height: 52,
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(
                            _birth == null ? 'Выберите дату' : longDate(_birth!),
                            style: TextStyle(
                              fontSize: 15.5,
                              fontWeight: FontWeight.w500,
                              color: _birth == null ? palette.inkFaint : palette.ink,
                            ),
                          ),
                        ),
                        Icon(Icons.calendar_today_outlined, size: 19, color: palette.inkFaint),
                      ],
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(height: Space.md),
            const InfoBanner(
              'Укажите ФИО как в карточке участника церкви. Если данные не совпадут, заявка уйдёт администратору на проверку.',
            ),
          ],
        );
      case 1:
        return LabeledField(
          label: 'Номер телефона',
          controller: _phone,
          hint: '+7 (900) 000-00-00',
          keyboardType: TextInputType.phone,
          autofillHints: const [AutofillHints.telephoneNumber],
          onChanged: _formatPhone,
          onSubmitted: (_) => _next(),
        );
      default:
        return LabeledField(
          label: 'Пароль',
          controller: _password,
          hint: 'Придумайте пароль',
          obscureText: _obscure,
          autofillHints: const [AutofillHints.newPassword],
          onSubmitted: (_) => _next(),
          suffix: IconButton(
            tooltip: _obscure ? 'Показать пароль' : 'Скрыть пароль',
            onPressed: () => setState(() => _obscure = !_obscure),
            icon: Icon(_obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined, color: palette.inkFaint),
          ),
        );
    }
  }
}

class _StepIndicator extends StatelessWidget {
  const _StepIndicator({required this.step, required this.total});

  final int step;
  final int total;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final children = <Widget>[];
    for (var i = 0; i < total; i++) {
      if (i > 0) {
        children.add(Expanded(
          child: AnimatedContainer(
            duration: Motion.normal,
            height: 2,
            margin: const EdgeInsets.symmetric(horizontal: 8),
            color: i <= step ? palette.accent : palette.outline,
          ),
        ));
      }
      final done = i <= step;
      children.add(AnimatedContainer(
        duration: Motion.normal,
        width: 30,
        height: 30,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          gradient: done ? wineGradient : null,
          color: done ? null : palette.accentSoft,
        ),
        child: Text(
          '${i + 1}',
          style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: done ? Colors.white : palette.inkFaint),
        ),
      ));
    }
    return Semantics(label: 'Шаг ${step + 1} из $total', child: Row(children: children));
  }
}
