import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter/services.dart';

import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/app_logo.dart';
import '../providers/auth_provider.dart';

const _authLogoHeroTag = 'auth_logo_hero';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key, this.initialMode = AuthMode.signIn});

  final AuthMode initialMode;

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  late bool _isRegisterMode;
  final _firstNameController = TextEditingController();
  final _lastNameController = TextEditingController();
  final _phoneController = TextEditingController();
  final _passwordController = TextEditingController();
  final _confirmPasswordController = TextEditingController();
  final _firstNameFocusNode = FocusNode();
  final _lastNameFocusNode = FocusNode();
  final _phoneFocusNode = FocusNode();
  final _passwordFocusNode = FocusNode();
  final _confirmPasswordFocusNode = FocusNode();
  String? _statusText;
  bool _isErrorStatus = false;
  bool _isSubmitting = false;
  bool _isPasswordObscured = true;
  bool _isConfirmPasswordObscured = true;

  @override
  void initState() {
    super.initState();
    _isRegisterMode = widget.initialMode == AuthMode.signUp;
  }

  @override
  void dispose() {
    _firstNameController.dispose();
    _lastNameController.dispose();
    _phoneController.dispose();
    _passwordController.dispose();
    _confirmPasswordController.dispose();
    _firstNameFocusNode.dispose();
    _lastNameFocusNode.dispose();
    _phoneFocusNode.dispose();
    _passwordFocusNode.dispose();
    _confirmPasswordFocusNode.dispose();
    super.dispose();
  }

  void _setStatus(String? text, {required bool isError}) {
    setState(() {
      _statusText = text;
      _isErrorStatus = isError;
    });
  }

  Future<void> _submitSignIn() async {
    final phone = _phoneController.text.trim();
    final password = _passwordController.text;

    if (phone.isEmpty || password.isEmpty) {
      _setStatus('Введите номер телефона и пароль', isError: true);
      if (phone.isEmpty) {
        _phoneFocusNode.requestFocus();
      } else {
        _passwordFocusNode.requestFocus();
      }
      return;
    }

    setState(() {
      _isSubmitting = true;
      _statusText = null;
    });

    final ok = await ref
        .read(authControllerProvider.notifier)
        .signIn(phoneNumber: phone, password: password);

    if (!mounted) {
      return;
    }

    setState(() {
      _isSubmitting = false;
      _statusText = ok ? null : 'Не удалось войти. Проверьте телефон и пароль.';
      _isErrorStatus = !ok;
    });
  }

  Future<void> _submitSignUp() async {
    final firstName = _firstNameController.text.trim();
    final lastName = _lastNameController.text.trim();
    final phone = _phoneController.text.trim();
    final password = _passwordController.text;
    final confirmPassword = _confirmPasswordController.text;

    if (firstName.isEmpty ||
        lastName.isEmpty ||
        phone.isEmpty ||
        password.isEmpty) {
      _setStatus('Заполните все поля регистрации', isError: true);
      if (firstName.isEmpty) {
        _firstNameFocusNode.requestFocus();
      } else if (lastName.isEmpty) {
        _lastNameFocusNode.requestFocus();
      } else if (phone.isEmpty) {
        _phoneFocusNode.requestFocus();
      } else {
        _passwordFocusNode.requestFocus();
      }
      return;
    }
    if (password.length < 8) {
      _setStatus('Пароль должен быть не менее 8 символов', isError: true);
      _passwordFocusNode.requestFocus();
      return;
    }
    if (password != confirmPassword) {
      _setStatus('Пароли не совпадают', isError: true);
      _confirmPasswordFocusNode.requestFocus();
      return;
    }

    setState(() {
      _isSubmitting = true;
      _statusText = null;
    });

    final result = await ref
        .read(authControllerProvider.notifier)
        .signUp(
          firstName: firstName,
          lastName: lastName,
          phoneNumber: phone,
          password: password,
        );

    if (!mounted) {
      return;
    }

    String dialogTitle = 'Регистрация';
    String dialogMessage = '';
    var shouldSwitchToLogin = true;

    switch (result.type) {
      case SignUpOutcomeType.approved:
        // Session will be opened by AuthGate automatically.
        shouldSwitchToLogin = false;
        dialogTitle = 'Готово';
        dialogMessage = 'Регистрация подтверждена. Выполняется вход...';
        break;
      case SignUpOutcomeType.pending:
        dialogTitle = 'Заявка отправлена';
        dialogMessage =
            result.message ??
            'Заявка отправлена администратору. Доступ будет открыт после подтверждения.';
        break;
      case SignUpOutcomeType.failed:
        dialogTitle = 'Не удалось зарегистрироваться';
        dialogMessage =
            result.message ?? 'Проверьте данные и попробуйте снова.';
        break;
    }

    setState(() {
      _isSubmitting = false;
      _statusText = null;
      _isErrorStatus = false;
      if (shouldSwitchToLogin) {
        _isRegisterMode = false;
      }
    });

    if (dialogMessage.isNotEmpty && mounted) {
      await showDialog<void>(
        context: context,
        builder: (context) => AlertDialog(
          title: Text(dialogTitle),
          content: Text(dialogMessage),
          actions: [
            FilledButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Понятно'),
            ),
          ],
        ),
      );
    }
  }

  Widget _modeToggle() {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(AppRadius.full),
      ),
      padding: const EdgeInsets.all(4),
      child: Row(
        children: [
          Expanded(
            child: _ModeChip(
              title: 'Вход',
              selected: !_isRegisterMode,
              onTap: () => setState(() {
                _isRegisterMode = false;
                _statusText = null;
              }),
            ),
          ),
          Expanded(
            child: _ModeChip(
              title: 'Регистрация',
              selected: _isRegisterMode,
              onTap: () => setState(() {
                _isRegisterMode = true;
                _statusText = null;
              }),
            ),
          ),
        ],
      ),
    );
  }

  Widget _authField({
    required TextEditingController controller,
    FocusNode? focusNode,
    required String label,
    TextInputType keyboardType = TextInputType.text,
    bool obscureText = false,
    VoidCallback? onToggleObscure,
    String? hintText,
    List<TextInputFormatter>? inputFormatters,
    TextInputAction? textInputAction,
    VoidCallback? onSubmitted,
  }) {
    return TextField(
      controller: controller,
      focusNode: focusNode,
      keyboardType: keyboardType,
      obscureText: obscureText,
      inputFormatters: inputFormatters,
      textInputAction: textInputAction,
      onSubmitted: (_) => onSubmitted?.call(),
      decoration: InputDecoration(
        labelText: label,
        hintText: hintText,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadius.md),
        ),
        filled: true,
        fillColor: AppColors.surfaceElevated,
        suffixIcon: onToggleObscure == null
            ? null
            : IconButton(
                onPressed: onToggleObscure,
                icon: Icon(
                  obscureText
                      ? Icons.visibility_rounded
                      : Icons.visibility_off_rounded,
                ),
              ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    ref.listen<AsyncValue<AuthSession?>>(authControllerProvider, (_, next) {
      final session = next.valueOrNull;
      if (session == null || !mounted) {
        return;
      }
      final navigator = Navigator.of(context);
      if (navigator.canPop()) {
        navigator.popUntil((route) => route.isFirst);
      }
    });

    final title = _isRegisterMode ? 'Создание аккаунта' : 'Вход в систему';

    return Scaffold(
      backgroundColor: AppColors.surface,
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) => SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
            child: ConstrainedBox(
              constraints: BoxConstraints(
                minHeight: constraints.maxHeight - 32,
              ),
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 480),
                  child: Container(
                    decoration: BoxDecoration(
                      color: AppColors.cardBg,
                      borderRadius: BorderRadius.circular(AppRadius.xl),
                      boxShadow: AppShadows.card,
                    ),
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(24, 24, 24, 20),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Hero(
                            tag: _authLogoHeroTag,
                            child: Material(
                              color: Colors.transparent,
                              child: Container(
                                width: 72,
                                height: 72,
                                decoration: BoxDecoration(
                                  color: AppColors.primary.withValues(
                                    alpha: 0.12,
                                  ),
                                  borderRadius: BorderRadius.circular(
                                    AppRadius.lg,
                                  ),
                                ),
                                alignment: Alignment.center,
                                child: const AppLogo(size: 44),
                              ),
                            ),
                          ),
                          const SizedBox(height: 14),
                          Text(
                            title,
                            style: Theme.of(context).textTheme.headlineMedium
                                ?.copyWith(
                                  color: AppColors.textPrimary,
                                  fontWeight: FontWeight.w800,
                                ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            _isRegisterMode
                                ? 'Заполните данные для регистрации'
                                : 'Введите номер телефона и пароль',
                            style: const TextStyle(
                              color: AppColors.textSecondary,
                              fontSize: 14,
                            ),
                          ),
                          const SizedBox(height: 18),
                          _modeToggle(),
                          const SizedBox(height: 16),
                          if (_isRegisterMode) ...[
                            _authField(
                              controller: _firstNameController,
                              focusNode: _firstNameFocusNode,
                              label: 'Имя',
                              hintText: 'Например, Влад',
                              textInputAction: TextInputAction.next,
                              onSubmitted: () =>
                                  _lastNameFocusNode.requestFocus(),
                            ),
                            const SizedBox(height: 12),
                            _authField(
                              controller: _lastNameController,
                              focusNode: _lastNameFocusNode,
                              label: 'Фамилия',
                              hintText: 'Например, Чендев',
                              textInputAction: TextInputAction.next,
                              onSubmitted: () => _phoneFocusNode.requestFocus(),
                            ),
                            const SizedBox(height: 12),
                          ],
                          _authField(
                            controller: _phoneController,
                            focusNode: _phoneFocusNode,
                            keyboardType: TextInputType.phone,
                            label: 'Номер телефона',
                            hintText: '+7...',
                            inputFormatters: [
                              FilteringTextInputFormatter.allow(
                                RegExp(r'[0-9+]'),
                              ),
                              _PhoneNumberFormatter(),
                            ],
                            textInputAction: TextInputAction.next,
                            onSubmitted: () =>
                                _passwordFocusNode.requestFocus(),
                          ),
                          const SizedBox(height: 12),
                          _authField(
                            controller: _passwordController,
                            focusNode: _passwordFocusNode,
                            obscureText: _isPasswordObscured,
                            label: 'Пароль',
                            onToggleObscure: () => setState(
                              () => _isPasswordObscured = !_isPasswordObscured,
                            ),
                            textInputAction: _isRegisterMode
                                ? TextInputAction.next
                                : TextInputAction.done,
                            onSubmitted: _isRegisterMode
                                ? () => _confirmPasswordFocusNode.requestFocus()
                                : _submitSignIn,
                          ),
                          if (_isRegisterMode) ...[
                            const SizedBox(height: 12),
                            _authField(
                              controller: _confirmPasswordController,
                              focusNode: _confirmPasswordFocusNode,
                              obscureText: _isConfirmPasswordObscured,
                              label: 'Повторите пароль',
                              onToggleObscure: () => setState(
                                () => _isConfirmPasswordObscured =
                                    !_isConfirmPasswordObscured,
                              ),
                              textInputAction: TextInputAction.done,
                              onSubmitted: _submitSignUp,
                            ),
                          ],
                          if (_statusText != null) ...[
                            const SizedBox(height: 12),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 12,
                                vertical: 10,
                              ),
                              decoration: BoxDecoration(
                                color: _isErrorStatus
                                    ? Colors.red.withValues(alpha: 0.08)
                                    : Colors.green.withValues(alpha: 0.1),
                                borderRadius: BorderRadius.circular(
                                  AppRadius.sm,
                                ),
                              ),
                              child: Text(
                                _statusText!,
                                style: TextStyle(
                                  color: _isErrorStatus
                                      ? Colors.red.shade700
                                      : Colors.green.shade800,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                          ],
                          const SizedBox(height: 16),
                          FilledButton.icon(
                            onPressed: _isSubmitting
                                ? null
                                : _isRegisterMode
                                ? _submitSignUp
                                : _submitSignIn,
                            icon: Icon(
                              _isRegisterMode
                                  ? Icons.how_to_reg_rounded
                                  : Icons.login_rounded,
                            ),
                            label: Text(
                              _isSubmitting
                                  ? (_isRegisterMode
                                        ? 'Создаем...'
                                        : 'Входим...')
                                  : (_isRegisterMode
                                        ? 'Зарегистрироваться'
                                        : 'Войти'),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

enum AuthMode { signIn, signUp }

class _ModeChip extends StatelessWidget {
  const _ModeChip({
    required this.title,
    required this.selected,
    required this.onTap,
  });

  final String title;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        padding: const EdgeInsets.symmetric(vertical: 10),
        decoration: BoxDecoration(
          color: selected ? AppColors.primary : Colors.transparent,
          borderRadius: BorderRadius.circular(AppRadius.full),
        ),
        alignment: Alignment.center,
        child: Text(
          title,
          style: TextStyle(
            color: selected ? AppColors.textOnPrimary : AppColors.textSecondary,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
    );
  }
}

class _PhoneNumberFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    final digitsOnly = newValue.text.replaceAll(RegExp(r'\D'), '');
    if (digitsOnly.isEmpty) {
      return const TextEditingValue(text: '');
    }

    var digits = digitsOnly;
    if (digits.startsWith('8')) {
      digits = '7${digits.substring(1)}';
    }
    if (!digits.startsWith('7')) {
      digits = '7$digits';
    }
    if (digits.length > 11) {
      digits = digits.substring(0, 11);
    }

    final buffer = StringBuffer('+${digits[0]}');
    if (digits.length > 1) {
      final area = digits.substring(1, digits.length >= 4 ? 4 : digits.length);
      buffer.write(' ($area');
      if (area.length == 3) {
        buffer.write(')');
      }
    }
    if (digits.length > 4) {
      final firstPart = digits.substring(
        4,
        digits.length >= 7 ? 7 : digits.length,
      );
      buffer.write(' $firstPart');
    }
    if (digits.length > 7) {
      final secondPart = digits.substring(
        7,
        digits.length >= 9 ? 9 : digits.length,
      );
      buffer.write('-$secondPart');
    }
    if (digits.length > 9) {
      final thirdPart = digits.substring(
        9,
        digits.length >= 11 ? 11 : digits.length,
      );
      buffer.write('-$thirdPart');
    }

    final formatted = buffer.toString();
    return TextEditingValue(
      text: formatted,
      selection: TextSelection.collapsed(offset: formatted.length),
    );
  }
}
