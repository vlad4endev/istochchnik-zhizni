import axios from 'axios';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LuArrowRight,
  LuCross,
  LuEye,
  LuEyeOff,
  LuPenLine,
  LuTriangleAlert,
} from 'react-icons/lu';

import { useAuthHydrated } from '../../../hooks/useAuthHydrated';
import { apiClient } from '../../../lib/apiClient';
import { isApiUrlProbablyWrongForWeb } from '../../../lib/config';
import { humanizeServerError, mapAxiosAuthError } from '../authErrors';
import { useAuthStore } from '../authStore';
import { formatRuPhoneInput, phoneInputAllowedKeys } from '../utils/formatRuPhone';

type LocationState = { mode?: 'signIn' | 'signUp' };

type LoginResponse = {
  token?: string;
  user?: { first_name?: string; last_name?: string; app_role?: string };
  error?: string;
};

type RegisterResponse = {
  status?: string;
  token?: string;
  user?: { first_name?: string; last_name?: string; app_role?: string };
  message?: string;
  error?: string;
};

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? {}) as LocationState;

  const hydrated = useAuthHydrated();
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

  const apiMismatch = isApiUrlProbablyWrongForWeb();

  useEffect(() => {
    if (!hydrated) return;
    if (token) {
      navigate('/', { replace: true });
    }
  }, [hydrated, token, navigate]);

  if (!hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--surface)] text-stone-500">
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
      });
      navigate('/', { replace: true });
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
        });
        navigate('/', { replace: true });
        return;
      }

      if (response.status === 202 && data.status === 'pending') {
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

  const title = isRegisterMode ? 'Создание аккаунта' : 'Вход в систему';
  const subtitle = isRegisterMode
    ? 'Заполните данные для регистрации'
    : 'Введите номер телефона и пароль';

  const inputClass =
    'w-full rounded-xl border border-stone-200 bg-[var(--surface-elevated)] px-3 py-2.5 text-stone-900 outline-none ring-primary/30 placeholder:text-stone-400 focus:border-primary focus:ring-2';

  return (
    <div className="min-h-screen bg-[var(--surface)]">
      <div className="safe-area-pad flex min-h-screen flex-col px-5 py-4">
        <Link
          to="/login"
          className="mb-2 inline-flex text-sm font-semibold text-stone-500 hover:text-primary"
        >
          ← Назад
        </Link>

        <div className="flex flex-1 flex-col justify-center">
          <div className="mx-auto w-full max-w-[480px] rounded-2xl bg-[var(--surface-elevated)] p-6 shadow-[var(--shadow)] ring-1 ring-stone-900/5">
            <div className="flex justify-center">
              <div className="flex h-[72px] w-[72px] items-center justify-center rounded-xl bg-primary/10 text-primary">
                <LuCross className="h-9 w-9" strokeWidth={1.75} aria-hidden />
              </div>
            </div>

            <h1 className="mt-3.5 text-2xl font-extrabold text-stone-900">{title}</h1>
            <p className="mt-1 text-sm text-stone-600">{subtitle}</p>
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

            <div className="mt-4 rounded-full bg-stone-100 p-1">
              <div className="flex">
                <button
                  type="button"
                  className={`flex-1 rounded-full py-2.5 text-sm font-bold transition-colors ${
                    !isRegisterMode
                      ? 'bg-primary text-white shadow-sm'
                      : 'bg-transparent text-stone-600'
                  }`}
                  onClick={() => {
                    setIsRegisterMode(false);
                    clearStatus();
                  }}
                >
                  Вход
                </button>
                <button
                  type="button"
                  className={`flex-1 rounded-full py-2.5 text-sm font-bold transition-colors ${
                    isRegisterMode
                      ? 'bg-primary text-white shadow-sm'
                      : 'bg-transparent text-stone-600'
                  }`}
                  onClick={() => {
                    setIsRegisterMode(true);
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
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-stone-500 transition-colors hover:bg-stone-100 hover:text-primary"
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
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-stone-500 transition-colors hover:bg-stone-100 hover:text-primary"
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
              className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-base font-bold text-white shadow-sm transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
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
