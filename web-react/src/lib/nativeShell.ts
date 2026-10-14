import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Keyboard } from '@capacitor/keyboard';
import { Network } from '@capacitor/network';
import { StatusBar, Style } from '@capacitor/status-bar';

import { isNativePlatform } from './platform';

export type NetworkStatus = { connected: boolean; connectionType: string };

type ShellHandlers = {
  onAppUrlOpen?: (url: string) => void;
  onResume?: () => void;
  onPause?: () => void;
  onNetworkChange?: (status: NetworkStatus) => void;
  onBackButton?: () => boolean;
};

let started = false;
const unsubs: Array<() => void> = [];

function pathFromAppUrl(url: string): string | null {
  try {
    const u = new URL(url);
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    // custom scheme: com.istochnikzhizni.molitva://call/join/xxx
    const m = url.match(/^[a-z][a-z0-9+.-]*:\/\/(.*)$/i);
    if (!m) return null;
    const rest = m[1]!.replace(/^\/+/, '');
    return `/${rest}`;
  }
}

export async function startNativeShell(handlers: ShellHandlers = {}): Promise<() => void> {
  if (!isNativePlatform() || started) {
    return () => undefined;
  }
  started = true;

  try {
    await StatusBar.setStyle({ style: Style.Light });
    if (Capacitor.getPlatform() === 'android') {
      await StatusBar.setBackgroundColor({ color: '#f4f1ed' });
    }
  } catch {
    /* plugin missing on web preview */
  }

  try {
    await Keyboard.setResizeMode({ mode: 'body' as never });
    await Keyboard.setScroll({ isDisabled: true });
  } catch {
    /* optional */
  }

  const appState = await CapApp.addListener('appStateChange', ({ isActive }) => {
    if (isActive) handlers.onResume?.();
    else handlers.onPause?.();
  });
  unsubs.push(() => void appState.remove());

  const urlOpen = await CapApp.addListener('appUrlOpen', ({ url }) => {
    handlers.onAppUrlOpen?.(url);
    const path = pathFromAppUrl(url);
    if (path && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('app:deep-link', { detail: { url, path } }));
    }
  });
  unsubs.push(() => void urlOpen.remove());

  const back = await CapApp.addListener('backButton', ({ canGoBack }) => {
    const handled = handlers.onBackButton?.() ?? false;
    if (handled) return;
    if (canGoBack && typeof window !== 'undefined') {
      window.history.back();
      return;
    }
    void CapApp.exitApp();
  });
  unsubs.push(() => void back.remove());

  try {
    const status = await Network.getStatus();
    handlers.onNetworkChange?.({
      connected: status.connected,
      connectionType: status.connectionType,
    });
    const net = await Network.addListener('networkStatusChange', (s) => {
      handlers.onNetworkChange?.({
        connected: s.connected,
        connectionType: s.connectionType,
      });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('app:network-change', {
            detail: { connected: s.connected, connectionType: s.connectionType },
          }),
        );
      }
    });
    unsubs.push(() => void net.remove());
  } catch {
    /* optional */
  }

  return () => {
    for (const u of unsubs.splice(0)) u();
    started = false;
  };
}

export async function getNetworkStatus(): Promise<NetworkStatus> {
  if (!isNativePlatform()) {
    return {
      connected: typeof navigator === 'undefined' ? true : navigator.onLine,
      connectionType: 'unknown',
    };
  }
  try {
    const s = await Network.getStatus();
    return { connected: s.connected, connectionType: s.connectionType };
  } catch {
    return { connected: true, connectionType: 'unknown' };
  }
}

export async function hapticLight(): Promise<void> {
  if (!isNativePlatform()) return;
  try {
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {
    /* optional */
  }
}
