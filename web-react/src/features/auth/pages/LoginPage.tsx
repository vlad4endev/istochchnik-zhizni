import axios from 'axios';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LuArrowRight, LuEye, LuEyeOff, LuPenLine, LuTriangleAlert } from 'react-icons/lu';

import { useAuthSessionReady } from '../../../hooks/useAuthSessionReady';
import { apiClient } from '../../../lib/apiClient';
import { isApiUrlProbablyWrongForWeb } from '../../../lib/config';
import { defaultPostLoginPath, pendingRegistrationLandingPath } from '../../../lib/appVariant';
import { humanizeServerError, mapAxiosAuthError } from '../authErrors';
import { normalizeRegistrationStatus, useAuthStore } from '../authStore';
import { formatRuPhoneInput, phoneInputAllowedKeys } from '../utils/formatRuPhone';

type LocationState = { mode?: 'signIn' | 'signUp' };

type LoginResponse = {
  token?: string;
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

type ForgotPasswordResponse = {
  status?: string;
  request_id?: number;
  message?: string;
  error?: string;
};

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? {}) as LocationState;

  const sessionReady = useAuthSessionReady();
  const token = useAuthStore((s) => s.token);
  const setSession = useAuthStore((s) => s.setSession);

  const [isRegisterMode, setIsRegisterMode] = useState(state.mode === 'signUp');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [statusText, setStatusText] = useState<string | null>(null);
  const [statusIsError, setStatusIsError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(true);
  const [showConfirm, setShowConfirm] = useState(true);
  const [showResetForm, setShowResetForm] = useState(false);
  const [resetFirstName, setResetFirstName] = useState('');
  const [resetLastName, setResetLastName] = useState('');
  const [resetPhone, setResetPhone] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(true);
  const [showResetConfirm, setShowResetConfirm] = useState(true);

  const apiMismatch = isApiUrlProbablyWrongForWeb();

  useEffect(() => {
    if (!sessionReady) return;
    if (token) {
      navigate(defaultPostLoginPath(), { replace: true });
    }
  }, [sessionReady, token, navigate]);

  if (!sessionReady) {
    return (
      <div className="flex min-h-[100dvh] min-h-screen items-center justify-center bg-[var(--surface)] text-stone-500">
        <p className="text-sm font-medium">Загрузка…</p>
      </div>
    );
  }

  function clearStatus() {
    setStatusText(null);
    setStatusIsError(false);
  }

  async function submitLogin() {
    const p = phone.trim();
    const pw = password;
    if (!p || !pw) {
      setStatusText('Введите номер телефона и пароль');
      setStatusIsError(true);
      return;
    }

    setSubmitting(true);
    clearStatus();

    try {
      const response = await apiClient.post<LoginResponse>(
        '/api/auth/login',
        { phone_number: p, password: pw },
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
        setStatusText('Неверный телефон или пароль.');
        setStatusIsError(true);
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
        registrationStatus: normalizeRegistrationStatus(user.registration_status),
        username: ((user as { username?: string }).username ?? '').trim(),
        memberId: typeof (user as { id?: number }).id === 'number' ? (user as { id: number }).id : null,
      });
      navigate(defaultPostLoginPath(), { replace: true });
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

    if (!fn || !ln || !p || !pw) {
      setStatusText('Заполните все поля регистрации');
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
          registrationStatus: normalizeRegistrationStatus(user.registration_status),
          username: ((user as { username?: string }).username ?? '').trim(),
          memberId: typeof (user as { id?: number }).id === 'number' ? (user as { id: number }).id : null,
        });
        navigate(defaultPostLoginPath(), { replace: true });
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

  async function submitForgotPassword() {
    const fn = resetFirstName.trim();
    const ln = resetLastName.trim();
    const p = resetPhone.trim();
    const pw = resetPassword;
    const cpw = resetConfirmPassword;

    if (!fn || !ln || !p || !pw) {
      setStatusText('Для сброса пароля заполните ФИО, телефон и новый пароль.');
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
      const response = await apiClient.post<ForgotPasswordResponse>(
        '/api/auth/forgot-password-request',
        {
          first_name: fn,
          last_name: ln,
          phone_number: p,
          password: pw,
        },
        { validateStatus: (s) => s != null && s < 600 },
      );

      const data = response.data ?? {};
      if (response.status === 202 && data.status === 'pending') {
        setShowResetForm(false);
        setResetFirstName('');
        setResetLastName('');
        setResetPhone('');
        setResetPassword('');
        setResetConfirmPassword('');
        setStatusText(
          data.message ??
            'Заявка на сброс отправлена. После подтверждения администратором войдите с новым паролем.',
        );
        setStatusIsError(false);
        return;
      }

      if (response.status === 400 || response.status === 409) {
        const raw = typeof data.error === 'string' ? data.error : 'Не удалось отправить заявку.';
        setStatusText(humanizeServerError(raw.trim()));
        setStatusIsError(true);
        return;
      }

      const fallback =
        typeof data.error === 'string'
          ? data.error
          : 'Не удалось отправить заявку на сброс пароля. Попробуйте позже.';
      setStatusText(humanizeServerError(fallback));
      setStatusIsError(true);
    } catch (e) {
      setStatusText(mapAxiosAuthError(e));
      setStatusIsError(true);
    } finally {
      setSubmitting(false);
    }
  }

  const title = isRegisterMode ? 'Создание аккаунта' : 'Вход в систему';
  const subtitle = isRegisterMode
    ? 'Заполните данные для регистрации'
    : 'Введите номер телефона и пароль';

  const inputClass =
    'min-h-[48px] w-full rounded-xl border border-stone-200 bg-[var(--surface-elevated)] px-3.5 py-3 text-base text-stone-900 outline-none ring-primary/30 placeholder:text-stone-400 focus:border-primary focus:ring-2 sm:min-h-0 sm:py-2.5 sm:text-[15px]';

  return (
    <div className="min-h-[100dvh] min-h-screen w-full max-w-[100vw] bg-[var(--surface)]">
      <div className="flex min-h-[100dvh] min-h-screen flex-col py-5 [padding-left:max(1rem,env(safe-area-inset-left,0px))] [padding-right:max(1rem,env(safe-area-inset-right,0px))] sm:py-6">
        <Link
          to="/login"
          className="mb-3 inline-flex min-h-[44px] items-center gap-1.5 text-sm font-semibold text-stone-500 transition active:text-primary hover:text-primary"
        >
          <span aria-hidden>←</span> Назад
        </Link>

        <div className="flex flex-1 flex-col justify-center pb-4">
          <div className="mx-auto w-full max-w-[min(100%,480px)] rounded-[1.25rem] bg-[var(--surface-elevated)] p-5 shadow-[var(--shadow-card)] ring-1 ring-stone-900/[0.06] sm:rounded-2xl sm:p-6 md:shadow-[var(--shadow)]">
            <div className="flex justify-center">
              <div className="flex h-[72px] w-[72px] items-center justify-center rounded-[1rem] bg-stone-50 p-3 shadow-inner ring-1 ring-stone-900/5">
                <img src="/assets/logo.svg" alt="" className="h-full w-full object-contain" />
              </div>
            </div>

            <h1 className="mt-3.5 text-[1.35rem] font-extrabold leading-snug text-stone-900 sm:text-2xl">
              {title}
            </h1>
            <p className="mt-1.5 text-sm leading-relaxed text-stone-600 sm:text-[15px]">{subtitle}</p>
            {isRegisterMode && (
              <p className="mt-2 rounded-lg bg-stone-50 px-3 py-2 text-xs leading-snug text-stone-600">
                Учётная запись привязывается к участнику в базе церкви: ФИО и телефон должны совпадать с
                карточкой. Иначе заявка уйдёт администратору — до одобрения войти нельзя.
              </p>
            )}

            {apiMismatch && (
              <div
                className="mt-4 flex gap-2.5 rounded-xl bg-red-50 p-3 text-sm leading-snug text-red-900"
                role="alert"
              >
                <LuTriangleAlert className="h-5 w-5 shrink-0 text-amber-600" strokeWidth={2} aria-hidden />
                <p>
                  Сайт собран без адреса API (в билде остался localhost). В Vercel: Environment
                  Variables → VITE_API_BASE_URL = ваш публичный HTTPS API → пересборка.
                </p>
              </div>
            )}

            <div className="mt-4 rounded-full bg-stone-100/95 p-1 ring-1 ring-stone-200/60">
              <div className="flex gap-0.5">
                <button
                  type="button"
                  className={`touch-manipulation flex-1 rounded-full py-3 text-sm font-bold transition-all active:scale-[0.98] sm:py-2.5 ${
                    !isRegisterMode
                      ? 'bg-primary text-white shadow-sm shadow-primary/20'
                      : 'bg-transparent text-stone-600'
                  }`}
                  onClick={() => {
                    setIsRegisterMode(false);
                    setShowResetForm(false);
                    clearStatus();
                  }}
                >
                  Вход
                </button>
                <button
                  type="button"
                  className={`touch-manipulation flex-1 rounded-full py-3 text-sm font-bold transition-all active:scale-[0.98] sm:py-2.5 ${
                    isRegisterMode
                      ? 'bg-primary text-white shadow-sm shadow-primary/20'
                      : 'bg-transparent text-stone-600'
                  }`}
                  onClick={() => {
                    setIsRegisterMode(true);
                    setShowResetForm(false);
                    clearStatus();
                  }}
                >
                  Регистрация
                </button>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-3">
              {isRegisterMode && (
                <>
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-stone-600">Имя</span>
                    <input
                      className={inputClass}
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="Например, Влад"
                      autoComplete="given-name"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-stone-600">Фамилия</span>
                    <input
                      className={inputClass}
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Например, Чендев"
                      autoComplete="family-name"
                    />
                  </label>
                </>
              )}

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-stone-600">Номер телефона</span>
                <input
                  className={inputClass}
                  value={phone}
                  onChange={(e) => setPhone(formatRuPhoneInput(e.target.value))}
                  onKeyDown={(e) => {
                    if (!phoneInputAllowedKeys(e)) e.preventDefault();
                  }}
                  placeholder="+7..."
                  inputMode="tel"
                  autoComplete="tel"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-stone-600">Пароль</span>
                <div className="relative">
                  <input
                    className={`${inputClass} pr-11`}
                    type={showPassword ? 'password' : 'text'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={isRegisterMode ? 'new-password' : 'current-password'}
                  />
                  <button
                    type="button"
                    className="absolute right-1.5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg text-stone-500 transition-colors hover:bg-stone-100 hover:text-primary"
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

              {!isRegisterMode && (
                <div className="mt-1 flex justify-start">
                  <button
                    type="button"
                    className="text-xs font-semibold text-primary hover:underline"
                    onClick={() => {
                      setShowResetForm((v) => !v);
                      clearStatus();
                    }}
                  >
                    {showResetForm ? 'Скрыть форму сброса' : 'Забыли пароль?'}
                  </button>
                </div>
              )}

              {isRegisterMode && (
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-stone-600">
                    Повторите пароль
                  </span>
                  <div className="relative">
                    <input
                      className={`${inputClass} pr-11`}
                      type={showConfirm ? 'password' : 'text'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      className="absolute right-1.5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg text-stone-500 transition-colors hover:bg-stone-100 hover:text-primary"
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
                </label>
              )}

              {!isRegisterMode && showResetForm && (
                <div className="rounded-xl border border-primary/20 bg-primary/[0.04] p-3">
                  <p className="text-xs font-semibold text-stone-700">
                    Сброс через администратора: заполните данные и задайте новый пароль.
                  </p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold text-stone-600">Имя</span>
                      <input
                        className={inputClass}
                        value={resetFirstName}
                        onChange={(e) => setResetFirstName(e.target.value)}
                        placeholder="Имя из карточки"
                        autoComplete="given-name"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold text-stone-600">Фамилия</span>
                      <input
                        className={inputClass}
                        value={resetLastName}
                        onChange={(e) => setResetLastName(e.target.value)}
                        placeholder="Фамилия из карточки"
                        autoComplete="family-name"
                      />
                    </label>
                  </div>
                  <label className="mt-3 block">
                    <span className="mb-1 block text-xs font-semibold text-stone-600">Телефон</span>
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
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold text-stone-600">Новый пароль</span>
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
                          className="absolute right-1.5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg text-stone-500 transition-colors hover:bg-stone-100 hover:text-primary"
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
                      <span className="mb-1 block text-xs font-semibold text-stone-600">
                        Повторите пароль
                      </span>
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
                          className="absolute right-1.5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg text-stone-500 transition-colors hover:bg-stone-100 hover:text-primary"
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
                      Отправить заявку на сброс
                    </button>
                  </div>
                </div>
              )}
            </div>

            {statusText && (
              <div
                className={`mt-3 rounded-lg px-3 py-2.5 text-sm font-semibold ${
                  statusIsError
                    ? 'bg-red-500/10 text-red-700'
                    : 'bg-emerald-500/10 text-emerald-800'
                }`}
                role={statusIsError ? 'alert' : 'status'}
              >
                {statusText}
              </div>
            )}

            <button
              type="button"
              disabled={submitting}
              className="touch-manipulation mt-5 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-primary text-base font-bold text-white shadow-md shadow-primary/25 transition-[opacity,transform] hover:opacity-95 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100"
              onClick={() => void (isRegisterMode ? submitRegister() : submitLogin())}
            >
              {submitting ? (
                <span>{isRegisterMode ? 'Создаем...' : 'Входим...'}</span>
              ) : (
                <>
                  {isRegisterMode ? (
                    <LuPenLine className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden />
                  ) : (
                    <LuArrowRight className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden />
                  )}
                  <span>{isRegisterMode ? 'Зарегистрироваться' : 'Войти'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
