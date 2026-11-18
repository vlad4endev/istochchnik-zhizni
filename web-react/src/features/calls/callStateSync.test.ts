import { describe, expect, it } from 'vitest';

import {
  callEndedMessage,
  isTerminalCallStatus,
  markCallAcceptedLocally,
  resolveCallSync,
  wasCallAcceptedLocally,
} from './callStateSync';

describe('resolveCallSync — звонящий (гудки)', () => {
  it('собеседник ответил, а call:accepted потерялся → подключаемся', () => {
    expect(resolveCallSync('calling', 'active')).toEqual({ kind: 'activate' });
  });

  it('пока звонит — ничего не делаем', () => {
    expect(resolveCallSync('calling', 'ringing')).toEqual({ kind: 'none' });
  });

  it('отклонён / нет ответа → закрыть с понятным текстом', () => {
    expect(resolveCallSync('calling', 'declined')).toEqual({ kind: 'close', message: 'Звонок отклонён' });
    expect(resolveCallSync('calling', 'missed')).toEqual({ kind: 'close', message: 'Абонент не ответил' });
  });

  it('свою отмену не озвучиваем', () => {
    expect(resolveCallSync('calling', 'cancelled')).toEqual({ kind: 'close', message: null });
  });
});

describe('resolveCallSync — входящий', () => {
  it('звонящий отменил, а call:cancelled потерялся → перестать звонить', () => {
    expect(resolveCallSync('ringing_in', 'cancelled')).toEqual({ kind: 'close', message: 'Звонок отменён' });
  });

  it('звонок уже идёт и принят не здесь → «принят на другом устройстве»', () => {
    expect(resolveCallSync('ringing_in', 'active', false)).toEqual({
      kind: 'close',
      message: 'Звонок принят на другом устройстве',
    });
  });

  it('только что приняли на этом устройстве → не закрывать', () => {
    expect(resolveCallSync('ringing_in', 'active', true)).toEqual({ kind: 'none' });
  });

  it('таймаут → пропущенный', () => {
    expect(resolveCallSync('ringing_in', 'missed')).toEqual({ kind: 'close', message: 'Пропущенный вызов' });
  });
});

describe('вспомогательные', () => {
  it('терминальные статусы', () => {
    for (const s of ['ended', 'declined', 'missed', 'cancelled', 'failed'] as const) {
      expect(isTerminalCallStatus(s)).toBe(true);
    }
    for (const s of ['ringing', 'waiting', 'active'] as const) {
      expect(isTerminalCallStatus(s)).toBe(false);
    }
  });

  it('отметка «принято здесь» работает по callId', () => {
    markCallAcceptedLocally('call-a');
    expect(wasCallAcceptedLocally('call-a')).toBe(true);
    expect(wasCallAcceptedLocally('call-b')).toBe(false);
  });

  it('тексты причин завершения', () => {
    expect(callEndedMessage('peer_lost')).toMatch(/Связь с собеседником потеряна/);
    expect(callEndedMessage('no_answer')).toBe('Абонент не ответил');
    expect(callEndedMessage('ended_by_moderator')).toBe('Организатор завершил встречу');
    expect(callEndedMessage('ended')).toBeNull();
    expect(callEndedMessage(undefined)).toBeNull();
  });
});
