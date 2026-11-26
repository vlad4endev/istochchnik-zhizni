import { describe, expect, it } from 'vitest';

import { describePushEnableError } from '../src/features/messenger/push/webPush';

function domError(name: string, message = ''): Error {
  const e = new Error(message);
  e.name = name;
  return e;
}

describe('describePushEnableError', () => {
  it('service worker не поднялся — советует обновить страницу', () => {
    expect(describePushEnableError(new Error('Service worker not ready'))).toMatch(/Ctrl\+Shift\+R/);
  });

  it('AbortError — связь с push-сервисом браузера не установилась', () => {
    expect(describePushEnableError(domError('AbortError', 'Registration failed - push service error'))).toMatch(
      /серверы Google/,
    );
  });

  it('NotAllowedError — советует включить уведомления через адресную строку', () => {
    expect(describePushEnableError(domError('NotAllowedError'))).toMatch(/адресной строке/);
  });

  it('повреждённый VAPID-ключ', () => {
    expect(describePushEnableError(domError('InvalidCharacterError'))).toMatch(/VAPID/);
  });

  it('неизвестная ошибка — общий текст с именем исключения', () => {
    expect(describePushEnableError(domError('WeirdError'))).toContain('(WeirdError)');
    expect(describePushEnableError('строка')).toMatch(/Не удалось включить push/);
  });
});
