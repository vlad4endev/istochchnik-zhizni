import { useEffect, useRef } from 'react';
import { Linking } from 'react-native';

import { extractInviteTokenFromUrl } from '../lib/inviteLink';
import { setPendingInviteToken, takePendingInviteToken } from '../lib/storage';
import { navigateRoot, navigationRef } from '../navigation/navigationRef';

/**
 * Открывает JoinInvite по deep link / App Link.
 * Если пользователь ещё не в основном стеке — сохраняет токен до логина.
 */
export function useInviteDeepLink(canOpenJoin: boolean): void {
  const canOpenRef = useRef(canOpenJoin);
  canOpenRef.current = canOpenJoin;

  useEffect(() => {
    const handleUrl = (url: string | null) => {
      if (!url) return;
      const token = extractInviteTokenFromUrl(url);
      if (!token) return;
      if (canOpenRef.current && navigationRef.isReady()) {
        navigateRoot('JoinInvite', { token });
        return;
      }
      setPendingInviteToken(token);
    };

    void Linking.getInitialURL().then(handleUrl);
    const sub = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!canOpenJoin) return;

    let cancelled = false;
    const flush = () => {
      if (cancelled || !navigationRef.isReady()) return false;
      const pending = takePendingInviteToken();
      if (pending) navigateRoot('JoinInvite', { token: pending });
      return true;
    };

    if (flush()) return undefined;
    const id = setInterval(() => {
      if (flush()) clearInterval(id);
    }, 250);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [canOpenJoin]);
}
