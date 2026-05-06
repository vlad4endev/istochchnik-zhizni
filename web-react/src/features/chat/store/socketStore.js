import { create } from 'zustand';

import {
  isRealtimeWsOpen,
  openRealtimeWs,
  sendRealtimeJson,
  subscribeRealtimeOpen,
} from '../../../lib/realtimeWsClient';

/**
 * Виртуальный «сокет» поверх общего WebSocket (см. realtimeWsClient).
 * Не вызывает closeRealtimeWs в disconnect — соединение общее для приложения.
 */
export const useSocketStore = create((set, get) => ({
  /** @type {null | { transport: 'realtime' }} */
  socket: null,
  isConnected: false,

  /** @type {null | (() => void)} */
  _unsubOpen: null,

  /**
   * @param {string} [_url] зарезервировано (URL берётся из конфигурации realtime)
   * @param {string} token
   */
  connect: (_url, token) => {
    const t = typeof token === 'string' ? token.trim() : '';
    if (!t) return;

    const prevUnsub = get()._unsubOpen;
    if (typeof prevUnsub === 'function') prevUnsub();

    openRealtimeWs(t);

    const unsub = subscribeRealtimeOpen(() => {
      set({
        isConnected: isRealtimeWsOpen(),
        socket: { transport: 'realtime' },
      });
    });

    set({
      _unsubOpen: unsub,
      isConnected: isRealtimeWsOpen(),
      socket: { transport: 'realtime' },
    });

    queueMicrotask(() => {
      set({ isConnected: isRealtimeWsOpen() });
    });
  },

  disconnect: () => {
    const prevUnsub = get()._unsubOpen;
    if (typeof prevUnsub === 'function') prevUnsub();
    set({ socket: null, isConnected: false, _unsubOpen: null });
  },

  /**
   * @param {string} event
   * @param {Record<string, unknown>} [data]
   */
  emit: (event, data) => {
    const payload =
      data && typeof data === 'object' && !Array.isArray(data)
        ? { type: event, ...data }
        : { type: event };
    return sendRealtimeJson(payload);
  },
}));
