import axios from 'axios';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LuArrowLeft,
  LuArrowRight,
  LuCheck,
  LuEye,
  LuEyeOff,
  LuInfo,
  LuTriangleAlert,
  LuUserPlus,
} from 'react-icons/lu';

import { useAuthSessionReady } from '../../../hooks/useAuthSessionReady';
import { useScrollInputIntoView } from '../../../hooks/useScrollInputIntoView';
import { apiClient } from '../../../lib/apiClient';
import { isApiUrlProbablyWrongForWeb } from '../../../lib/config';
import { defaultPostLoginPath, pendingRegistrationLandingPath } from '../../../lib/appVariant';
import { humanizeServerError, mapAxiosAuthError } from '../authErrors';
import { normalizeRegistrationStatus, useAuthStore } from '../authStore';
import { formatRuPhoneInput, phoneInputAllowedKeys } from '../utils/formatRuPhone';
import { AppSplash } from '@/components/AppSplash';
import { BirthDayMonthFields } from '@/components/BirthDayMonthFields';
import { birthDayMonthToApiYmd, parseBirthDayMonthFromApi } from '@/lib/birthDate';

const REGISTER_STEPS = [
  { id: 'profile', title: 'О вас', hint: 'Имя, фамилия и день рождения' },
  { id: 'phone', title: 'Телефон', hint: 'Номер для входа в приложение' },
  { id: 'password', title: 'Пароль', hint: 'Придумайте надёжный пароль' },
] as const;

function passwordStrength(pw: string): { score: number; label: string; tone: string } {
  if (!pw) return { score: 0, label: '', tone: 'bg-stone-200' };
  let score = 0;
  if (pw.length >= 8) score += 1;
  if (pw.length >= 12) score += 1;
  if (/[A-Za-zА-Яа-я]/.test(pw) && /\d/.test(pw)) score += 1;
  if (/[^A-Za-zА-Яа-я0-9]/.test(pw)) score += 1;
  if (score <= 1) return { score, label: 'Слабый', tone: 'bg-amber-400' };
  if (score === 2) return { score, label: 'Нормальный', tone: 'bg-sky-500' };
  return { score, label: 'Надёжный', tone: 'bg-emerald-500' };
}

type LocationState = { mode?: 'signIn' | 'signUp'; from?: string };

type LoginResponse = {
  token?: string;
  code?: string;
  phone_number?: string;
  user?: {
    first_name?: string;
    last_name?: string;
    app_role?: string;
    registration_status?: string;
  };
  error?: string;
};

type RegisterResponse = {
  status?: string;
  token?: string;
  user?: {
    first_name?: string;
    last_name?: string;
    app_role?: string;
    registration_status?: string;
  };
  message?: string;
  error?: string;
};

type PasswordResetSmsRequestResponse = {
  status?: 'code_sent';
  expires_in_sec?: number;
  retry_after_sec?: number;
  error?: string;
};

function formatRetryWait(seconds: number): string {
  const s = Math.max(1, Math.ceil(seconds));
  if (s >= 60) {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return r > 0 ? `${m} мин ${r} с` : `${m} мин`;
  }
  return `${s} с`;
}

/** Same value as backend `PASSWORD_RESET_RESEND_INTERVAL_SEC` — normal cooldown after a fresh send. */
const PASSWORD_RESET_RESEND_HINT_SEC = 60;

type PasswordResetSmsVerifyResponse = {
  status?: 'verified';
  reset_token?: string;
  expires_in_sec?: number;
  error?: string;
};

export function LoginPage() {
  useScrollInputIntoView();
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? {}) as LocationState;
  const fromState = typeof state.from === 'string' ? state.from.trim() : '';
  const fromQuery = new URLSearchParams(location.search).get('from')?.trim() ?? '';
  const returnPathRaw = fromState || fromQuery;
  const postLoginPath =
    returnPathRaw.startsWith('/') && !returnPathRaw.startsWith('/login')
      ? returnPathRaw
      : defaultPostLoginPath();

  const sessionReady = useAuthSessionReady();
  const token = useAuthStore((s) => s.token);
  const setSession = useAuthStore((s) => s.setSession);

  const [isRegisterMode, setIsRegisterMode] = useState(state.mode === 'signUp');
  const [registerStep, setRegisterStep] = useState(0);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [statusText, setStatusText] = useState<string | null>(null);
  const [statusIsError, setStatusIsError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(true);
  const [showConfirm, setShowConfirm] = useState(true);
  const [showResetForm, setShowResetForm] = useState(false);
  const [resetPhone, setResetPhone] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [resetCodeVerified, setResetCodeVerified] = useState(false);
  const [resetPassword, setResetPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(true);
  const [showResetConfirm, setShowResetConfirm] = useState(true);
  const [adminForcedResetMode, setAdminForcedResetMode] = useState(false);

  const apiMismatch = isApiUrlProbablyWrongForWeb();

  useEffect(() => {
    if (!sessionReady) return;
    if (token) {
      navigate(postLoginPath, { replace: true });
    }
  }, [sessionReady, token, navigate, postLoginPath]);

  if (!sessionReady) {
    return <AppSplash variant="auth" />;
  }

  function clearStatus() {
    setStatusText(null);
    setStatusIsError(false);
  }

  async function submitLogin() {
    const p = phone.trim();
    const pw = password;
    if (!p) {
      setStatusText('Введите номер телефона');
      setStatusIsError(true);
      return;
    }

    setSubmitting(true);
    clearStatus();

    try {
      const response = await apiClient.post<LoginResponse>(
        '/api/auth/login',
        { phone_number: p, password: pw, remember_me: true },
        { validateStatus: (s) => s != null && s < 600 },
      );

      if (response.status === 400) {
        const raw = response.data?.error;
        setStatusText(
          typeof raw === 'string' && raw.trim()
            ? humanizeServerError(raw.trim())
            : 'Проверьте формат телефона (7–20 цифр) и длину пароля (от 8 символов).',
        );
        setStatusIsError(true);
        return;
      }

      if (response.status === 401) {
        setStatusText(
          !pw.trim()
            ? 'Введите пароль для входа или проверьте номер. Только номер подходит, если администратор сбросил пароль — тогда откроется форма нового пароля.'
            : 'Неверный телефон или пароль.',
        );
        setStatusIsError(true);
        return;
      }
      if (response.status === 429) {
        const retryRaw = response.headers['retry-after'];
        const retrySec =
          typeof retryRaw === 'string' ? parseInt(retryRaw, 10) : Number(retryRaw);
        const wait =
          Number.isFinite(retrySec) && retrySec > 0 ? formatRetryWait(retrySec) : '15 мин';
        setStatusText(
          `Слишком много попыток входа. Подождите ${wait} и попробуйте снова (не нажимайте «Войти» много раз подряд).`,
        );
        setStatusIsError(true);
        return;
      }
      if (response.status === 428 && response.data?.code === 'password_reset_required') {
        setShowResetForm(true);
        setAdminForcedResetMode(true);
        setResetPhone(formatRuPhoneInput(response.data.phone_number ?? p));
        setResetCode('');
        setResetToken('');
        setResetCodeVerified(true);
        setStatusText('Для этого номера администратор сбросил пароль. Придумайте и подтвердите новый пароль.');
        setStatusIsError(false);
        return;
      }

      if (response.status !== 200 || !response.data) {
        const raw = response.data?.error;
        setStatusText(
          typeof raw === 'string' ? humanizeServerError(raw) : 'Не удалось войти. Попробуйте позже.',
        );
        setStatusIsError(true);
        return;
      }

      const { token: t, user } = response.data;
      if (!t || !user) {
        setStatusText('Неверный телефон или пароль.');
        setStatusIsError(true);
        return;
      }

      setSession({
        token: t,
        firstName: (user.first_name ?? '').trim(),
        lastName: (user.last_name ?? '').trim(),
        role: (user.app_role ?? 'member').trim() || 'member',
        roles: Array.isArray((user as { app_roles?: string[] }).app_roles)
          ? (user as { app_roles: string[] }).app_roles
          : undefined,
        registrationStatus: normalizeRegistrationStatus(user.registration_status),
        username: ((user as { username?: string }).username ?? '').trim(),
        memberId: typeof (user as { id?: number }).id === 'number' ? (user as { id: number }).id : null,
      });
      navigate(postLoginPath, { replace: true });
    } catch (e) {
      if (axios.isAxiosError(e) && (e.response?.status === 401 || e.response?.status === 403)) {
        setStatusText('Неверный телефон или пароль.');
      } else {
        setStatusText(mapAxiosAuthError(e));
      }
      setStatusIsError(true);
    } finally {
      setSubmitting(false);
    }
  }

  async function submitRegister() {
    const fn = firstName.trim();
    const ln = lastName.trim();
    const p = phone.trim();
    const pw = password;
    const cpw = confirmPassword;
    const birthParsed = parseBirthDayMonthFromApi(birthDate);

    if (!fn || !ln || !p || !pw) {
      setStatusText('Заполните все поля регистрации');
      setStatusIsError(true);
      return;
    }
    if (!birthParsed.day || !birthParsed.month) {
      setStatusText('Укажите день и месяц рождения');
      setStatusIsError(true);
      return;
    }
    const birthDay = Number(birthParsed.day);
    const birthMonth = Number(birthParsed.month);
    const birthYmd = birthDayMonthToApiYmd(birthDay, birthMonth);
    if (!birthYmd) {
      setStatusText('Укажите корректный день и месяц рождения');
      setStatusIsError(true);
      return;
    }
    if (pw.length < 8) {
      setStatusText('Пароль должен быть не менее 8 символов');
      setStatusIsError(true);
      return;
    }
    if (pw !== cpw) {
      setStatusText('Пароли не совпадают');
      setStatusIsError(true);
      return;
    }

    setSubmitting(true);
    clearStatus();

    try {
      const response = await apiClient.post<RegisterResponse>(
        '/api/auth/register',
        {
          first_name: fn,
          last_name: ln,
          phone_number: p,
          password: pw,
          birth_day: birthDay,
          birth_month: birthMonth,
        },
        { validateStatus: (s) => s != null && s < 600 },
      );

      const data = response.data ?? {};

      if (response.status === 500) {
        const raw = typeof data.error === 'string' ? data.error : null;
        setStatusText(raw ? humanizeServerError(raw) : 'Сервер вернул ошибку. Попробуйте позже.');
        setStatusIsError(true);
        return;
      }

      if (response.status === 400) {
        const raw = typeof data.error === 'string' ? data.error : 'Проверьте введённые данные.';
        setStatusText(humanizeServerError(raw.trim()));
        setStatusIsError(true);
        return;
      }

      if (response.status === 409) {
        const raw = typeof data.error === 'string' ? data.error : 'Запрос отклонён.';
        setStatusText(humanizeServerError(raw.trim()));
        setStatusIsError(true);
        return;
      }

      if (response.status === 201 && data.status === 'approved') {
        const t = data.token;
        const user = data.user;
        if (!t || !user) {
          setStatusText('Ошибка получения сессии после регистрации.');
          setStatusIsError(true);
          return;
        }
        setSession({
          token: t,
          firstName: (user.first_name ?? '').trim(),
          lastName: (user.last_name ?? '').trim(),
          role: (user.app_role ?? 'member').trim() || 'member',
          roles: Array.isArray((user as { app_roles?: string[] }).app_roles)
            ? (user as { app_roles: string[] }).app_roles
            : undefined,
          registrationStatus: normalizeRegistrationStatus(user.registration_status),
          username: ((user as { username?: string }).username ?? '').trim(),
          memberId: typeof (user as { id?: number }).id === 'number' ? (user as { id: number }).id : null,
        });
        navigate(postLoginPath, { replace: true });
        return;
      }

      if (response.status === 202 && data.status === 'pending') {
        const t = data.token;
        const user = data.user;
        if (t && user) {
          setSession({
            token: t,
            firstName: (user.first_name ?? '').trim(),
            lastName: (user.last_name ?? '').trim(),
            role: (user.app_role ?? 'member').trim() || 'member',
            roles: Array.isArray((user as { app_roles?: string[] }).app_roles)
              ? (user as { app_roles: string[] }).app_roles
              : undefined,
            registrationStatus: normalizeRegistrationStatus(
              user.registration_status ?? 'pending_review',
            ),
            username: ((user as { username?: string }).username ?? '').trim(),
            memberId: typeof (user as { id?: number }).id === 'number' ? (user as { id: number }).id : null,
          });
          navigate(pendingRegistrationLandingPath(), { replace: true });
          return;
        }
        setIsRegisterMode(false);
        const msg =
          data.message ??
          'Заявка отправлена администратору. Вход будет возможен после подтверждения.';
        setStatusText(msg);
        setStatusIsError(false);
        window.alert(`Заявка отправлена\n${msg}`);
        return;
      }

      const errMsg = typeof data.error === 'string' ? data.error : 'Регистрация не удалась.';
      setStatusText(humanizeServerError(errMsg.trim()));
      setStatusIsError(true);
    } catch (e) {
      setStatusText(mapAxiosAuthError(e));
      setStatusIsError(true);
    } finally {
      setSubmitting(false);
    }
  }

  async function requestResetCode() {
    const p = resetPhone.trim();
    if (!p) {
      setStatusText('Введите номер телефона, привязанный к аккаунту.');
      setStatusIsError(true);
      return;
    }
    setSubmitting(true);
    clearStatus();
    try {
      const response = await apiClient.post<PasswordResetSmsRequestResponse>(
        '/api/auth/password-reset/sms/request',
        { phone_number: p },
        { validateStatus: (s) => s != null && s < 600 },
      );
      if (response.status === 200 && response.data?.status === 'code_sent') {
        const retry = response.data.retry_after_sec;
        if (typeof retry === 'number' && retry > PASSWORD_RESET_RESEND_HINT_SEC) {
          setStatusText(
            `Новый код пока недоступен. Подождите ${formatRetryWait(retry)} (лимит запросов или блокировка после неверных попыток).`,
          );
          setStatusIsError(true);
          return;
        }
        setStatusText(
          'Код отправлен в Telegram (ботом на ваш привязанный аккаунт). Введите 6 цифр для продолжения.',
        );
        setStatusIsError(false);
        return;
      }
      const raw =
        typeof response.data?.error === 'string'
          ? response.data.error
          : 'Не удалось отправить код подтверждения.';
      setStatusText(humanizeServerError(raw));
      setStatusIsError(true);
    } catch (e) {
      setStatusText(mapAxiosAuthError(e));
      setStatusIsError(true);
    } finally {
      setSubmitting(false);
    }
  }

  async function verifyResetCode() {
    const p = resetPhone.trim();
    const code = resetCode.trim();
    if (!p || !code) {
      setStatusText('Введите номер телефона и код из Telegram.');
      setStatusIsError(true);
      return;
    }
    setSubmitting(true);
    clearStatus();
    try {
      const response = await apiClient.post<PasswordResetSmsVerifyResponse>(
        '/api/auth/password-reset/sms/verify',
        { phone_number: p, code },
        { validateStatus: (s) => s != null && s < 600 },
      );
      if (response.status === 429) {
        const data = response.data as { error?: string; retry_after_sec?: number };
        const retry = typeof data.retry_after_sec === 'number' ? data.retry_after_sec : null;
        const base =
          typeof data.error === 'string'
            ? humanizeServerError(data.error)
            : 'Превышено число попыток или действует блокировка.';
        setStatusText(
          retry ? `${base} Осталось ждать: ${formatRetryWait(retry)}.` : base,
        );
        setStatusIsError(true);
        return;
      }
      if (response.status === 200 && response.data?.status === 'verified' && response.data.reset_token) {
        setResetToken(response.data.reset_token);
        setResetCodeVerified(true);
        setStatusText('Код подтверждён. Теперь задайте новый пароль.');
        setStatusIsError(false);
        return;
      }
      const raw =
        typeof response.data?.error === 'string' ? response.data.error : 'Не удалось подтвердить код.';
      setStatusText(humanizeServerError(raw));
      setStatusIsError(true);
    } catch (e) {
      setStatusText(mapAxiosAuthError(e));
      setStatusIsError(true);
    } finally {
      setSubmitting(false);
    }
  }

  async function submitForgotPassword() {
    const p = resetPhone.trim();
    const pw = resetPassword;
    const cpw = resetConfirmPassword;
    if (!adminForcedResetMode && (!resetCodeVerified || !resetToken)) {
      setStatusText('Сначала подтвердите код из Telegram.');
      setStatusIsError(true);
      return;
    }
    if (!pw) {
      setStatusText('Введите новый пароль.');
      setStatusIsError(true);
      return;
    }
    if (pw.length < 8) {
      setStatusText('Новый пароль должен быть не менее 8 символов.');
      setStatusIsError(true);
      return;
    }
    if (pw !== cpw) {
      setStatusText('Пароли не совпадают.');
      setStatusIsError(true);
      return;
    }
    setSubmitting(true);
    clearStatus();
    try {
      const response = await apiClient.post(
        adminForcedResetMode ? '/api/auth/password-reset/admin-complete' : '/api/auth/password-reset/sms/complete',
        adminForcedResetMode
          ? { phone_number: p, new_password: pw }
          : { phone_number: p, reset_token: resetToken, new_password: pw },
        { validateStatus: (s) => s != null && s < 600 },
      );
      if (response.status === 204) {
        setShowResetForm(false);
        setResetPhone('');
        setResetCode('');
        setResetToken('');
        setResetCodeVerified(false);
        setResetPassword('');
        setResetConfirmPassword('');
        setAdminForcedResetMode(false);
        setStatusText('Пароль успешно обновлён. Теперь войдите с новым паролем.');
        setStatusIsError(false);
        return;
      }
      const raw =
        typeof (response.data as { error?: string } | undefined)?.error === 'string'
          ? (response.data as { error: string }).error
          : 'Не удалось обновить пароль.';
      setStatusText(humanizeServerError(raw));
      setStatusIsError(true);
    } catch (e) {
      setStatusText(mapAxiosAuthError(e));
      setStatusIsError(true);
    } finally {
      setSubmitting(false);
    }
  }

  const registerPwStrength = passwordStrength(password);
  const activeRegisterStep = REGISTER_STEPS[Math.min(registerStep, REGISTER_STEPS.length - 1)]!;

  const title = isRegisterMode ? 'Регистрация' : 'Вход в систему';
  const subtitle = isRegisterMode
    ? activeRegisterStep.hint
    : 'Укажите телефон и пароль. Если администратор сбросил пароль — достаточно номера.';

  function switchMode(register: boolean) {
    setIsRegisterMode(register);
    setRegisterStep(0);
    setShowResetForm(false);
    setAdminForcedResetMode(false);
    setResetCodeVerified(false);
    setResetToken('');
    clearStatus();
  }

  function validateRegisterStep(step: number): boolean {
    if (step === 0) {
      if (!firstName.trim() || !lastName.trim()) {
        setStatusText('Укажите имя и фамилию');
        setStatusIsError(true);
        return false;
      }
      const birthParsed = parseBirthDayMonthFromApi(birthDate);
      if (!birthParsed.day || !birthParsed.month || !birthDayMonthToApiYmd(Number(birthParsed.day), Number(birthParsed.month))) {
        setStatusText('Укажите день и месяц рождения');
        setStatusIsError(true);
        return false;
      }
      return true;
    }
    if (step === 1) {
      if (!phone.trim()) {
        setStatusText('Введите номер телефона');
        setStatusIsError(true);
        return false;
      }
      return true;
    }
    if (step === 2) {
      if (password.length < 8) {
        setStatusText('Пароль должен быть не менее 8 символов');
        setStatusIsError(true);
        return false;
      }
      if (password !== confirmPassword) {
        setStatusText('Пароли не совпадают');
        setStatusIsError(true);
        return false;
      }
      return true;
    }
    return true;
  }

  function goRegisterNext() {
    if (submitting) return;
    clearStatus();
    if (!validateRegisterStep(registerStep)) return;
    if (registerStep < REGISTER_STEPS.length - 1) {
      setRegisterStep((s) => s + 1);
      return;
    }
    void submitRegister();
  }

  function goRegisterBack() {
    clearStatus();
    if (registerStep > 0) setRegisterStep((s) => s - 1);
  }

  const handlePrimarySubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting) return;
    if (isRegisterMode) {
      goRegisterNext();
      return;
    }
    void submitLogin();
  };

  const inputClass =
    'min-h-[52px] w-full rounded-2xl border border-stone-200/90 bg-stone-50/80 px-4 py-3 text-base text-stone-900 outline-none transition-[border-color,box-shadow,background-color] placeholder:text-stone-400 focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20 sm:min-h-[48px] sm:text-[15px]';
  const labelClass = 'mb-1.5 block text-[13px] font-semibold tracking-wide text-stone-600';
  const eyeBtnClass =
    'absolute right-1.5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-xl text-stone-500 transition-colors hover:bg-stone-100 hover:text-primary';

  return (
    <div className="relative min-h-dvh w-full max-w-[100vw] overflow-y-auto bg-[var(--surface)] [padding-bottom:max(0.75rem,env(safe-area-inset-bottom,0px))]">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[42vh] bg-gradient-to-b from-primary/[0.12] via-primary/[0.04] to-transparent"
        aria-hidden
      />
      <div className="relative flex min-h-dvh flex-col py-5 [padding-left:max(1rem,env(safe-area-inset-left,0px))] [padding-right:max(1rem,env(safe-area-inset-right,0px))] sm:py-6">
        <Link
          to="/login"
          className="mb-3 inline-flex min-h-[44px] items-center gap-1.5 self-start rounded-full px-1 text-sm font-semibold text-stone-500 transition hover:text-primary active:text-primary"
        >
          <LuArrowLeft className="h-4 w-4" strokeWidth={2.25} aria-hidden />
          Назад
        </Link>

        <div className="flex flex-1 flex-col justify-start pb-4 sm:justify-center">
          <div className="mx-auto w-full max-w-[min(100%,480px)] overflow-hidden rounded-[1.5rem] bg-[var(--surface-elevated)]/95 p-5 shadow-[0_18px_50px_rgba(28,25,23,0.08)] ring-1 ring-stone-900/[0.06] backdrop-blur-sm sm:rounded-[1.75rem] sm:p-7">
            <div className="flex items-center gap-3.5">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 p-2.5 ring-1 ring-primary/15">
                <img src="/assets/logo.svg" alt="" className="h-full w-full object-contain" />
              </div>
              <div className="min-w-0">
                <h1 className="text-[1.4rem] font-extrabold leading-tight tracking-tight text-stone-900 sm:text-2xl">
                  {title}
                </h1>
                <p className="mt-0.5 text-sm leading-snug text-stone-500 sm:text-[15px]">{subtitle}</p>
              </div>
            </div>

            {apiMismatch && (
              <div
                className="mt-4 flex gap-2.5 rounded-2xl bg-red-50 p-3 text-sm leading-snug text-red-900"
                role="alert"
              >
                <LuTriangleAlert className="h-5 w-5 shrink-0 text-amber-600" strokeWidth={2} aria-hidden />
                <p>
                  Сайт собран без адреса API (в билде остался localhost). В Vercel: Environment
                  Variables → VITE_API_BASE_URL = ваш публичный HTTPS API → пересборка.
                </p>
              </div>
            )}

            <div className="mt-5 rounded-2xl bg-stone-100/90 p-1 ring-1 ring-stone-200/70">
              <div className="grid grid-cols-2 gap-0.5">
                <button
                  type="button"
                  className={`touch-manipulation rounded-[0.9rem] py-3 text-sm font-bold transition-all active:scale-[0.98] sm:py-2.5 ${
                    !isRegisterMode
                      ? 'bg-white text-stone-900 shadow-sm ring-1 ring-stone-200/80'
                      : 'bg-transparent text-stone-500'
                  }`}
                  onClick={() => switchMode(false)}
                >
                  Вход
                </button>
                <button
                  type="button"
                  className={`touch-manipulation rounded-[0.9rem] py-3 text-sm font-bold transition-all active:scale-[0.98] sm:py-2.5 ${
                    isRegisterMode
                      ? 'bg-primary text-white shadow-sm shadow-primary/25'
                      : 'bg-transparent text-stone-500'
                  }`}
                  onClick={() => switchMode(true)}
                >
                  Регистрация
                </button>
              </div>
            </div>

            {isRegisterMode && (
              <div className="mt-5" aria-label="Шаги регистрации">
                <div className="flex items-center gap-2">
                  {REGISTER_STEPS.map((step, index) => {
                    const done = index < registerStep;
                    const current = index === registerStep;
                    return (
                      <div key={step.id} className="flex min-w-0 flex-1 items-center gap-2">
                        <div
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                            done
                              ? 'bg-primary text-white'
                              : current
                                ? 'bg-primary/15 text-primary ring-2 ring-primary/30'
                                : 'bg-stone-100 text-stone-400'
                          }`}
                        >
                          {done ? <LuCheck className="h-4 w-4" strokeWidth={2.5} aria-hidden /> : index + 1}
                        </div>
                        {index < REGISTER_STEPS.length - 1 ? (
                          <div
                            className={`h-0.5 flex-1 rounded-full ${done ? 'bg-primary/70' : 'bg-stone-200'}`}
                            aria-hidden
                          />
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                <p className="mt-2.5 text-xs font-semibold uppercase tracking-[0.08em] text-primary/80">
                  Шаг {registerStep + 1} из {REGISTER_STEPS.length} · {activeRegisterStep.title}
                </p>
              </div>
            )}

            <form className="mt-4 flex flex-col gap-3.5" onSubmit={handlePrimarySubmit}>
              {isRegisterMode && registerStep === 0 && (
                <div className="auth-step-enter flex flex-col gap-3.5">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className={labelClass}>Имя</span>
                      <input
                        className={inputClass}
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        placeholder="Влад"
                        autoComplete="given-name"
                        autoFocus
                      />
                    </label>
                    <label className="block">
                      <span className={labelClass}>Фамилия</span>
                      <input
                        className={inputClass}
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        placeholder="Чендев"
                        autoComplete="family-name"
                      />
                    </label>
                  </div>
                  <BirthDayMonthFields
                    value={birthDate}
                    onChange={setBirthDate}
                    selectClassName={inputClass}
                    labelClassName={labelClass}
                    required
                  />
                  <div className="flex gap-2.5 rounded-2xl bg-primary/[0.06] px-3.5 py-3 text-xs leading-relaxed text-stone-600">
                    <LuInfo className="mt-0.5 h-4 w-4 shrink-0 text-primary" strokeWidth={2} aria-hidden />
                    <p>
                      Укажите ФИО как в карточке участника церкви. Если данные не совпадут, заявка уйдёт
                      администратору на проверку.
                    </p>
                  </div>
                </div>
              )}

              {isRegisterMode && registerStep === 1 && (
                <div className="auth-step-enter flex flex-col gap-3.5">
                  <label className="block">
                    <span className={labelClass}>Номер телефона</span>
                    <input
                      className={inputClass}
                      value={phone}
                      onChange={(e) => setPhone(formatRuPhoneInput(e.target.value))}
                      onKeyDown={(e) => {
                        if (!phoneInputAllowedKeys(e)) e.preventDefault();
                      }}
                      placeholder="+7 900 000-00-00"
                      inputMode="tel"
                      autoComplete="tel"
                      autoFocus
                    />
                  </label>
                  <p className="text-xs leading-relaxed text-stone-500">
                    На этот номер вы будете входить в приложение. Формат: +7…
                  </p>
                </div>
              )}

              {isRegisterMode && registerStep === 2 && (
                <div className="auth-step-enter flex flex-col gap-3.5">
                  <label className="block">
                    <span className={labelClass}>Пароль</span>
                    <div className="relative">
                      <input
                        className={`${inputClass} pr-11`}
                        type={showPassword ? 'password' : 'text'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="new-password"
                        placeholder="Минимум 8 символов"
                        autoFocus
                      />
                      <button
                        type="button"
                        className={eyeBtnClass}
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? 'Показать пароль' : 'Скрыть пароль'}
                      >
                        {showPassword ? (
                          <LuEye className="h-5 w-5" strokeWidth={2} aria-hidden />
                        ) : (
                          <LuEyeOff className="h-5 w-5" strokeWidth={2} aria-hidden />
                        )}
                      </button>
                    </div>
                    {password ? (
                      <div className="mt-2">
                        <div className="flex gap-1">
                          {[0, 1, 2, 3].map((i) => (
                            <div
                              key={i}
                              className={`h-1.5 flex-1 rounded-full transition-colors ${
                                i < registerPwStrength.score ? registerPwStrength.tone : 'bg-stone-200'
                              }`}
                            />
                          ))}
                        </div>
                        <p className="mt-1.5 text-xs font-medium text-stone-500">
                          Надёжность: {registerPwStrength.label}
                        </p>
                      </div>
                    ) : null}
                  </label>
                  <label className="block">
                    <span className={labelClass}>Повторите пароль</span>
                    <div className="relative">
                      <input
                        className={`${inputClass} pr-11`}
                        type={showConfirm ? 'password' : 'text'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        autoComplete="new-password"
                        placeholder="Ещё раз"
                      />
                      <button
                        type="button"
                        className={eyeBtnClass}
                        onClick={() => setShowConfirm((v) => !v)}
                        aria-label={showConfirm ? 'Показать пароль' : 'Скрыть пароль'}
                      >
                        {showConfirm ? (
                          <LuEye className="h-5 w-5" strokeWidth={2} aria-hidden />
                        ) : (
                          <LuEyeOff className="h-5 w-5" strokeWidth={2} aria-hidden />
                        )}
                      </button>
                    </div>
                    {confirmPassword && password === confirmPassword ? (
                      <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-emerald-700">
                        <LuCheck className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                        Пароли совпадают
                      </p>
                    ) : null}
                  </label>
                </div>
              )}

              {!isRegisterMode && (
                <>
                  <label className="block">
                    <span className={labelClass}>Номер телефона</span>
                    <input
                      className={inputClass}
                      value={phone}
                      onChange={(e) => setPhone(formatRuPhoneInput(e.target.value))}
                      onKeyDown={(e) => {
                        if (!phoneInputAllowedKeys(e)) e.preventDefault();
                      }}
                      placeholder="+7 900 000-00-00"
                      inputMode="tel"
                      autoComplete="tel"
                    />
                  </label>

                  <label className="block">
                    <span className={labelClass}>
                      Пароль
                      <span className="ml-1 font-normal text-stone-400">
                        (необязательно при сбросе админом)
                      </span>
                    </span>
                    <div className="relative">
                      <input
                        className={`${inputClass} pr-11`}
                        type={showPassword ? 'password' : 'text'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="current-password"
                      />
                      <button
                        type="button"
                        className={eyeBtnClass}
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? 'Показать пароль' : 'Скрыть пароль'}
                      >
                        {showPassword ? (
                          <LuEye className="h-5 w-5" strokeWidth={2} aria-hidden />
                        ) : (
                          <LuEyeOff className="h-5 w-5" strokeWidth={2} aria-hidden />
                        )}
                      </button>
                    </div>
                  </label>

                  <div className="flex justify-start">
                    <button
                      type="button"
                      className="text-xs font-semibold text-primary hover:underline"
                      onClick={() => {
                        setShowResetForm((v) => !v);
                        setAdminForcedResetMode(false);
                        setResetCodeVerified(false);
                        setResetToken('');
                        setResetCode('');
                        clearStatus();
                      }}
                    >
                      {showResetForm ? 'Скрыть восстановление' : 'Забыли пароль?'}
                    </button>
                  </div>
                </>
              )}

              {!isRegisterMode && showResetForm && (
                <div className="rounded-2xl border border-primary/20 bg-primary/[0.04] p-3.5">
                  <p className="text-xs font-semibold text-stone-700">
                    {adminForcedResetMode
                      ? 'Администратор запросил смену пароля. Укажите новый пароль и подтвердите его.'
                      : 'Восстановление через Telegram: введите телефон, получите код в боте на привязанный аккаунт, затем задайте новый пароль.'}
                  </p>
                  <label className="mt-3 block">
                    <span className={labelClass}>Телефон</span>
                    <input
                      className={inputClass}
                      value={resetPhone}
                      onChange={(e) => setResetPhone(formatRuPhoneInput(e.target.value))}
                      onKeyDown={(e) => {
                        if (!phoneInputAllowedKeys(e)) e.preventDefault();
                      }}
                      placeholder="+7..."
                      inputMode="tel"
                      autoComplete="tel"
                    />
                  </label>
                  {!adminForcedResetMode && (
                    <>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={() => void requestResetCode()}
                          className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-primary/20 disabled:opacity-50"
                        >
                          Получить код
                        </button>
                      </div>
                      <label className="mt-3 block">
                        <span className={labelClass}>Код из Telegram</span>
                        <input
                          className={inputClass}
                          value={resetCode}
                          onChange={(e) => setResetCode(e.target.value.replace(/\D+/g, '').slice(0, 6))}
                          placeholder="6 цифр"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                        />
                      </label>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={() => void verifyResetCode()}
                          className="rounded-xl border border-primary/40 bg-white px-4 py-2.5 text-sm font-bold text-primary disabled:opacity-50"
                        >
                          Подтвердить код
                        </button>
                      </div>
                    </>
                  )}
                  {resetCodeVerified && (
                    <>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <label className="block">
                          <span className={labelClass}>Новый пароль</span>
                          <div className="relative">
                            <input
                              className={`${inputClass} pr-11`}
                              type={showResetPassword ? 'password' : 'text'}
                              value={resetPassword}
                              onChange={(e) => setResetPassword(e.target.value)}
                              autoComplete="new-password"
                            />
                            <button
                              type="button"
                              className={eyeBtnClass}
                              onClick={() => setShowResetPassword((v) => !v)}
                              aria-label={showResetPassword ? 'Показать пароль' : 'Скрыть пароль'}
                            >
                              {showResetPassword ? (
                                <LuEye className="h-5 w-5" strokeWidth={2} aria-hidden />
                              ) : (
                                <LuEyeOff className="h-5 w-5" strokeWidth={2} aria-hidden />
                              )}
                            </button>
                          </div>
                        </label>
                        <label className="block">
                          <span className={labelClass}>Повторите пароль</span>
                          <div className="relative">
                            <input
                              className={`${inputClass} pr-11`}
                              type={showResetConfirm ? 'password' : 'text'}
                              value={resetConfirmPassword}
                              onChange={(e) => setResetConfirmPassword(e.target.value)}
                              autoComplete="new-password"
                            />
                            <button
                              type="button"
                              className={eyeBtnClass}
                              onClick={() => setShowResetConfirm((v) => !v)}
                              aria-label={showResetConfirm ? 'Показать пароль' : 'Скрыть пароль'}
                            >
                              {showResetConfirm ? (
                                <LuEye className="h-5 w-5" strokeWidth={2} aria-hidden />
                              ) : (
                                <LuEyeOff className="h-5 w-5" strokeWidth={2} aria-hidden />
                              )}
                            </button>
                          </div>
                        </label>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={() => void submitForgotPassword()}
                          className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-primary/20 disabled:opacity-50"
                        >
                          Сохранить новый пароль
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </form>

            {statusText && (
              <div
                className={`mt-3.5 rounded-2xl px-3.5 py-2.5 text-sm font-semibold ${
                  statusIsError
                    ? 'bg-red-500/10 text-red-700'
                    : 'bg-emerald-500/10 text-emerald-800'
                }`}
                role={statusIsError ? 'alert' : 'status'}
              >
                {statusText}
              </div>
            )}

            <div className="mt-5 flex gap-2.5">
              {isRegisterMode && registerStep > 0 ? (
                <button
                  type="button"
                  disabled={submitting}
                  className="touch-manipulation flex min-h-[52px] w-[7.5rem] shrink-0 items-center justify-center gap-1.5 rounded-2xl border border-stone-200 bg-white text-sm font-bold text-stone-700 transition active:scale-[0.99] disabled:opacity-60"
                  onClick={goRegisterBack}
                >
                  <LuArrowLeft className="h-4 w-4" strokeWidth={2.25} aria-hidden />
                  Назад
                </button>
              ) : null}
              <button
                type="button"
                disabled={submitting}
                className="touch-manipulation flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-bold text-white shadow-lg shadow-primary/25 transition-[opacity,transform] hover:opacity-95 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100"
                onClick={() => {
                  if (isRegisterMode) goRegisterNext();
                  else void submitLogin();
                }}
              >
                {submitting ? (
                  <span>{isRegisterMode ? 'Создаём…' : 'Входим…'}</span>
                ) : isRegisterMode ? (
                  registerStep < REGISTER_STEPS.length - 1 ? (
                    <>
                      <span>Далее</span>
                      <LuArrowRight className="h-5 w-5 shrink-0" strokeWidth={2.25} aria-hidden />
                    </>
                  ) : (
                    <>
                      <LuUserPlus className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden />
                      <span>Создать аккаунт</span>
                    </>
                  )
                ) : (
                  <>
                    <LuArrowRight className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden />
                    <span>Войти</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
      <style>{`
        @keyframes authStepEnter {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .auth-step-enter {
          animation: authStepEnter 220ms ease-out;
        }
        @media (prefers-reduced-motion: reduce) {
          .auth-step-enter { animation: none; }
        }
      `}</style>
    </div>
  );
}
