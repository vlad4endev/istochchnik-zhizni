import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/nativeApp', () => ({
  isCapacitorNative: () => false,
  queryNativePushPermission: async () => 'unknown',
  requestNativePushPermission: async () => 'unknown',
}));

import { NotificationPermissionWidgetView } from '../src/features/dashboard/components/NotificationPermissionWidget';
import {
  NOTIFICATION_PERMISSION_WIDGET_COPY,
  clearNotificationPromptSessionDismiss,
  isMissingDeviceNotificationPermission,
  markNotificationPromptDismissedThisSession,
  normalizeDeviceNotificationPermission,
  shouldShowNotificationPermissionWidget,
  wasNotificationPromptDismissedThisSession,
} from '../src/lib/deviceNotificationPermission';

function installMemoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => {
      store.clear();
    },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  };
}

describe('device notification permission', () => {
  beforeEach(() => {
    vi.stubGlobal('sessionStorage', installMemoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('treats prompt/default as missing and granted as present', () => {
    expect(normalizeDeviceNotificationPermission('granted')).toBe('granted');
    expect(normalizeDeviceNotificationPermission('denied')).toBe('denied');
    expect(normalizeDeviceNotificationPermission('default')).toBe('default');
    expect(normalizeDeviceNotificationPermission('prompt')).toBe('default');
    expect(isMissingDeviceNotificationPermission('granted')).toBe(false);
    expect(isMissingDeviceNotificationPermission('denied')).toBe(true);
    expect(isMissingDeviceNotificationPermission('default')).toBe(true);
  });

  it('shows the home widget only when permission is not granted', () => {
    expect(shouldShowNotificationPermissionWidget('loading')).toBe(false);
    expect(shouldShowNotificationPermissionWidget('granted')).toBe(false);
    expect(shouldShowNotificationPermissionWidget('default')).toBe(true);
    expect(shouldShowNotificationPermissionWidget('denied')).toBe(true);
    expect(shouldShowNotificationPermissionWidget('unsupported')).toBe(true);
  });

  it('stores overlay dismiss only for the current session', () => {
    expect(wasNotificationPromptDismissedThisSession()).toBe(false);
    markNotificationPromptDismissedThisSession();
    expect(wasNotificationPromptDismissedThisSession()).toBe(true);
    clearNotificationPromptSessionDismiss();
    expect(wasNotificationPromptDismissedThisSession()).toBe(false);
  });

  it('explains that chat messages will not notify without device permission', () => {
    const html = renderToStaticMarkup(
      <NotificationPermissionWidgetView permission="default" busy={false} onAllow={() => undefined} />,
    );
    expect(html).toContain(NOTIFICATION_PERMISSION_WIDGET_COPY.title);
    expect(html).toContain('когда вам пишут в чате');
    expect(html).toContain(NOTIFICATION_PERMISSION_WIDGET_COPY.allowLabel);
    expect(html).not.toContain(NOTIFICATION_PERMISSION_WIDGET_COPY.settingsHintWeb);
  });

  it('adds settings instructions when the device already denied notifications', () => {
    const html = renderToStaticMarkup(
      <NotificationPermissionWidgetView permission="denied" busy={false} onAllow={() => undefined} />,
    );
    expect(html).toContain('когда вам пишут в чате');
    expect(html).toContain(NOTIFICATION_PERMISSION_WIDGET_COPY.settingsHintWeb);
    expect(html).toContain(NOTIFICATION_PERMISSION_WIDGET_COPY.allowLabel);
  });
});
