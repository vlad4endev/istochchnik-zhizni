import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { AppAvatar } from '../../../components/AppAvatar';
import { SkeletonBox } from '@/components/ui/SkeletonBox';
import { emitAppToast } from '../../../lib/uiFeedback';
import { resolvePublicUrl } from '../../../lib/resolvePublicUrl';
import { getAvatarInitial } from '../avatarUtils';
import * as api from '../api/messengerApi';
import { useChatStore } from '../chatStore';

function apiErrorText(e: unknown): string {
  if (typeof e === 'object' && e !== null && 'response' in e) {
    const data = (e as { response?: { data?: { error?: unknown } } }).response?.data;
    if (typeof data?.error === 'string' && data.error.trim()) return data.error.trim();
  }
  if (e instanceof Error && e.message.trim()) return e.message;
  return 'Не удалось обработать приглашение';
}

export function JoinInvitePage() {
  const { token = '' } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const loadConversations = useChatStore((s) => s.loadConversations);

  const clean = token.trim();

  const previewQuery = useQuery({
    queryKey: ['messenger', 'join-preview', clean],
    queryFn: () => api.previewInviteJoin(clean),
    enabled: clean.length >= 4,
    retry: false,
  });

  const joinMut = useMutation({
    mutationFn: () => api.joinByInviteToken(clean),
    onSuccess: async (res) => {
      await loadConversations({ force: true });
      await qc.invalidateQueries({ queryKey: ['messenger'] });
      emitAppToast(
        res.alreadyMember ? 'Вы уже в этом чате' : 'Вы вступили в чат',
        'success',
      );
      navigate(`/messenger?conversationId=${encodeURIComponent(res.conversationId)}`, {
        replace: true,
      });
    },
    onError: (e) => {
      emitAppToast(apiErrorText(e), 'error');
    },
  });

  if (clean.length < 4) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-xl font-semibold text-stone-900">Некорректная ссылка</h1>
        <p className="mt-2 text-sm text-stone-600">Проверьте приглашение и попробуйте снова.</p>
        <Link to="/messenger" className="mt-6 inline-block text-sm font-semibold text-[var(--brand)]">
          К чатам
        </Link>
      </div>
    );
  }

  if (previewQuery.isLoading) {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <SkeletonBox className="mx-auto h-20 w-20 rounded-full" />
        <SkeletonBox className="mx-auto mt-4 h-6 w-48" />
        <SkeletonBox className="mx-auto mt-3 h-4 w-32" />
      </div>
    );
  }

  if (previewQuery.isError || !previewQuery.data) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-xl font-semibold text-stone-900">Ссылка недействительна</h1>
        <p className="mt-2 text-sm text-stone-600">{apiErrorText(previewQuery.error)}</p>
        <Link to="/messenger" className="mt-6 inline-block text-sm font-semibold text-[var(--brand)]">
          К чатам
        </Link>
      </div>
    );
  }

  const preview = previewQuery.data;
  const title =
    preview.title?.trim() || (preview.type === 'channel' ? 'Канал' : 'Группа');
  const typeLabel = preview.type === 'channel' ? 'Канал' : 'Группа';
  const avatar = resolvePublicUrl(preview.avatar_url);

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-4 py-12 text-center">
      <div className="relative h-20 w-20 overflow-hidden rounded-full bg-primary/10 ring-2 ring-white shadow-sm">
        <AppAvatar
          src={avatar}
          className="h-full w-full"
          imgClassName="h-full w-full object-cover"
          fallback={
            <div className="grid h-full w-full place-items-center text-2xl font-semibold text-primary">
              {getAvatarInitial(title, 'G')}
            </div>
          }
          initialsFallbackText={title}
        />
      </div>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-stone-900">{title}</h1>
      <p className="mt-1 text-sm text-stone-600">{typeLabel}</p>
      <p className="mt-3 text-sm text-stone-500">
        {preview.alreadyMember ? 'Вы уже участник этого чата' : 'Вас пригласили в этот чат'}
      </p>
      <button
        type="button"
        disabled={joinMut.isPending}
        onClick={() => joinMut.mutate()}
        className="mt-8 rounded-xl bg-[var(--brand)] px-6 py-3 text-sm font-bold text-white disabled:opacity-60"
      >
        {joinMut.isPending
          ? '…'
          : preview.alreadyMember
            ? 'Открыть чат'
            : 'Вступить'}
      </button>
      <Link to="/messenger" className="mt-4 text-sm font-medium text-stone-500 hover:text-stone-800">
        Отмена
      </Link>
    </div>
  );
}
