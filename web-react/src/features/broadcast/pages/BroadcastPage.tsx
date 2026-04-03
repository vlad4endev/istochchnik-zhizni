import { useState, useEffect } from 'react';
import { LuTv, LuSettings, LuCheck, LuX } from 'react-icons/lu';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router-dom';
import { fetchBroadcastEmbed, patchBroadcastEmbed } from '../../../api/broadcast';
import { useAuthStore } from '../../auth/authStore';
import { grantBroadcastAccess, hasBroadcastAccess } from '../liveAccess';

function btnPrimary(c = '') { return `flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-bold text-white shadow hover:border-transparent hover:!bg-[#e34254] disabled:pointer-events-none disabled:opacity-50 transition-colors ${c}`; }
function btnSecondary(c = '') { return `flex h-10 items-center justify-center rounded-xl border border-stone-200 bg-white px-4 text-sm font-bold text-stone-700 hover:bg-stone-50 disabled:pointer-events-none disabled:opacity-50 transition-colors ${c}`; }
function btnDangerOutline(c = '') { return `flex h-10 items-center justify-center rounded-xl border border-red-200 bg-white px-4 text-sm font-bold text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors ${c}`; }
function fieldClass() { return 'w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-900 outline-none focus:border-primary focus:bg-white transition-colors'; }

export function BroadcastPage() {
  const qc = useQueryClient();
  const location = useLocation();
  const role = useAuthStore((s) => s.role);
  const isAdmin = role === 'admin';
  const [canViewPage, setCanViewPage] = useState(() => hasBroadcastAccess());

  const { data, isLoading: broadcastLoading, error } = useQuery({
    queryKey: ['broadcast'],
    queryFn: fetchBroadcastEmbed,
    enabled: canViewPage,
  });

  const [isEditing, setIsEditing] = useState(false);
  const [rutubeCode, setRutubeCode] = useState('');

  const embedCode = data?.rutube_embed_code;

  useEffect(() => {
    if ((location.state as { fromDashboard?: boolean } | null)?.fromDashboard) {
      grantBroadcastAccess();
      setCanViewPage(true);
    } else {
      setCanViewPage(hasBroadcastAccess());
    }
  }, [location.state]);

  useEffect(() => {
    if (data) {
      setRutubeCode(data.rutube_embed_code || '');
    }
  }, [data]);

  const patchBroadcast = useMutation({
    mutationFn: (code: string) => patchBroadcastEmbed(code || null),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['broadcast'] });
      setIsEditing(false);
      alert('Код трансляции сохранён.');
    },
    onError: () => {
      alert('Ошибка при сохранении кода трансляции.');
    }
  });

  if (!canViewPage) {
    return (
      <div className="min-h-full bg-[var(--surface)] px-4 py-8">
        <div className="mx-auto max-w-lg rounded-3xl border border-stone-200/80 bg-white/90 p-6 text-center shadow-[var(--shadow)]">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
            <LuTv className="h-7 w-7" strokeWidth={2} aria-hidden />
          </div>
          <h1 className="mt-4 text-xl font-extrabold text-stone-900">Трансляция доступна с дашборда</h1>
          <p className="mt-2 text-sm font-medium text-stone-600">
            Откройте блок «Трансляция» на главной странице, чтобы перейти к эфиру.
          </p>
          <Link
            to="/dashboard"
            className="mt-5 inline-flex h-11 items-center justify-center rounded-2xl bg-primary px-5 text-sm font-extrabold text-white hover:bg-primary-dark"
          >
            Перейти на главную
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[var(--surface)] pb-6 shell:pb-8">
      <header className="bg-primary px-4 py-4 text-white shadow-[0_4px_24px_rgba(125,54,64,0.3)] sm:px-5 sm:py-5 md:rounded-none md:shadow-sm md:px-6 max-md:rounded-b-[1.75rem]">
        <h1 className="text-xl font-extrabold tracking-tight sm:text-2xl md:text-3xl">Трансляции</h1>
        <p className="mt-1 max-w-3xl text-sm text-white/85 md:text-base">
          Смотрите наши богослужения и мероприятия в прямом эфире
        </p>
      </header>

      <div className="px-3 py-6 sm:px-4 sm:py-8 md:px-6 lg:px-8 xl:px-10">
        <div className="mx-auto flex w-full max-w-lg flex-col gap-6 sm:gap-8 md:max-w-xl lg:max-w-4xl xl:max-w-6xl">
          <section
            className="rounded-[1.35rem] border border-stone-200/70 bg-[var(--surface-elevated)] p-4 shadow-[var(--shadow-card)] sm:rounded-3xl sm:p-6 sm:shadow-[var(--shadow)] lg:p-8 shell:p-8"
            aria-labelledby="broadcast-heading"
          >
            <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h2
                id="broadcast-heading"
                className="flex items-center gap-3 text-base font-extrabold text-stone-900 sm:text-lg md:text-xl"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/[0.08] text-primary/80 shrink-0">
                  <LuTv className="h-6 w-6" strokeWidth={2} aria-hidden />
                </div>
                <span className="leading-tight">Прямой эфир</span>
              </h2>

              {isAdmin && !isEditing && (
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="flex items-center gap-2 rounded-xl bg-stone-100 px-4 py-2 text-sm font-bold text-stone-700 hover:bg-stone-200 hover:text-stone-900 active:scale-95 transition-all self-start sm:self-auto"
                >
                  <LuSettings className="h-4 w-4" />
                  Настроить
                </button>
              )}
            </div>

            {isAdmin && isEditing ? (
              <div className="mb-6 rounded-2xl border-2 border-primary/20 bg-primary/5 p-5">
                <h3 className="mb-2 text-sm font-bold text-stone-900">Настройка трансляции</h3>
                <p className="mb-4 text-xs text-stone-600">
                  Вставьте код (iframe) с Rutube в поле ниже. Чтобы убрать трансляцию, оставьте поле пустым.
                </p>
                <textarea
                  className={`${fieldClass()} mb-4 resize-y`}
                  rows={4}
                  placeholder='<iframe width="720" height="405" src="..." ...></iframe>'
                  value={rutubeCode}
                  onChange={(e) => setRutubeCode(e.target.value)}
                  disabled={patchBroadcast.isPending || broadcastLoading}
                />
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    className={`${btnPrimary()} flex items-center gap-2`}
                    disabled={patchBroadcast.isPending || broadcastLoading}
                    onClick={() => patchBroadcast.mutate(rutubeCode)}
                  >
                    <LuCheck className="h-4 w-4" />
                    {patchBroadcast.isPending ? 'Сохранение...' : 'Сохранить'}
                  </button>
                  <button
                    type="button"
                    className={`${btnSecondary()} flex items-center gap-2`}
                    onClick={() => {
                      setRutubeCode(data?.rutube_embed_code || '');
                      setIsEditing(false);
                    }}
                    disabled={patchBroadcast.isPending}
                  >
                    <LuX className="h-4 w-4" />
                    Отмена
                  </button>
                  {rutubeCode && (
                    <button
                      type="button"
                      className={`${btnDangerOutline()} ml-auto flex items-center gap-2`}
                      onClick={() => setRutubeCode('')}
                      disabled={patchBroadcast.isPending}
                    >
                      Очистить поле
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <p className="mb-6 text-sm text-stone-500 max-w-2xl leading-relaxed">
                Трансляция богослужения доступна онлайн. Подключайтесь к нам из любой точки мира.
              </p>
            )}

            {/* Rutube Player or Placeholder */}
            <div className={`relative w-full overflow-hidden rounded-2xl bg-stone-900 shadow-xl border ${isEditing ? 'border-primary/30 ring-4 ring-primary/10' : 'border-stone-800'}`} style={{ paddingTop: '56.25%' }}>
              {broadcastLoading ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-stone-400 p-6 text-center bg-stone-950/50">
                  <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent mb-4" />
                  <p className="text-sm font-medium">Загрузка эфира...</p>
                </div>
              ) : error ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-red-400 p-6 text-center bg-stone-950/50">
                  <p className="text-sm font-medium">Не удалось загрузить данные трансляции</p>
                </div>
              ) : embedCode ? (
                <div 
                  className="absolute inset-0 w-full h-full [&>iframe]:w-full [&>iframe]:h-full" 
                  dangerouslySetInnerHTML={{ __html: embedCode }} 
                />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-stone-400 p-6 text-center bg-stone-950/50">
                  <LuTv className="h-12 w-12 mb-4 opacity-50" strokeWidth={1} />
                  <p className="text-sm font-medium">Трансляция не запущена</p>
                  <p className="text-xs opacity-70 mt-1 max-w-xs">{isEditing ? 'Плеер появится здесь после того, как вы вставите код и нажмете Сохранить.' : 'Эфир временно недоступен или ещё не начался'}</p>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
