import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('mobile call layout', () => {
  it('порталит CallWindow и IncomingCallOverlay в document.body', () => {
    const callWindow = readFileSync(join(root, 'src/features/calls/CallWindow.tsx'), 'utf8');
    const incoming = readFileSync(join(root, 'src/features/calls/IncomingCallOverlay.tsx'), 'utf8');
    expect(callWindow).toMatch(/BodyPortal/);
    expect(callWindow).toMatch(/<BodyPortal>[\s\S]*CallWindowInner/);
    expect(incoming).toMatch(/BodyPortal/);
    expect(incoming).toMatch(/return\s*\(\s*<BodyPortal>/);
  });

  it('скрывает нижний таббар во время звонка', () => {
    const layout = readFileSync(join(root, 'src/app/Layout.tsx'), 'utf8');
    expect(layout).toMatch(/useCallStore/);
    expect(layout).toMatch(/showMobileBottomNav/);
    expect(layout).toMatch(/data-call-active/);
    expect(layout).toMatch(/!callUiOpen/);
  });

  it('свёрнутый звонок оставляет таббар и показывает панель возврата', () => {
    const layout = readFileSync(join(root, 'src/app/Layout.tsx'), 'utf8');
    const callWindow = readFileSync(join(root, 'src/features/calls/CallWindow.tsx'), 'utf8');
    const store = readFileSync(join(root, 'src/features/calls/callStore.ts'), 'utf8');
    const css = readFileSync(join(root, 'src/features/calls/calls.css'), 'utf8');
    const bar = readFileSync(join(root, 'src/features/calls/ActiveCallMinimizedBar.tsx'), 'utf8');
    expect(store).toMatch(/uiMinimized/);
    expect(store).toMatch(/minimizeCall/);
    expect(store).toMatch(/expandCall/);
    expect(layout).toMatch(/uiMinimized/);
    expect(layout).toMatch(/data-call-minimized/);
    expect(callWindow).toMatch(/MinimizeCallButton/);
    expect(callWindow).toMatch(/call-window--minimized/);
    expect(callWindow).toMatch(/ActiveCallMinimizedBar/);
    expect(bar).toMatch(/Вернуться/);
    expect(css).toMatch(/\.active-call-bar\b/);
    expect(css).toMatch(/call-window--minimized/);
  });

  it('в чатах есть Stories-кольцо для возврата в свёрнутый звонок', () => {
    const chip = readFileSync(join(root, 'src/features/calls/ActiveCallStoryChip.tsx'), 'utf8');
    const chipCss = readFileSync(
      join(root, 'src/features/calls/ActiveCallStoryChip.module.css'),
      'utf8',
    );
    const chatList = readFileSync(
      join(root, 'src/features/messenger/components/ChatList.tsx'),
      'utf8',
    );
    const chatWindow = readFileSync(
      join(root, 'src/features/messenger/components/ChatWindow.tsx'),
      'utf8',
    );
    const callWindow = readFileSync(join(root, 'src/features/calls/CallWindow.tsx'), 'utf8');
    expect(chip).toMatch(/uiMinimized/);
    expect(chip).toMatch(/expandCall/);
    expect(chip).toMatch(/\/call\/\$\{/);
    expect(chip).toMatch(/Вернуться в звонок/);
    expect(chipCss).toMatch(/\.ring\b/);
    expect(chipCss).toMatch(/call-ring-pulse/);
    expect(chatList).toMatch(/ActiveCallStoryChip/);
    expect(chatWindow).toMatch(/ActiveCallStoryChip/);
    expect(callWindow).toMatch(/navigate\('\/messenger'\)/);
  });

  it('резервирует место под кнопки и safe-area на мобиле', () => {
    const css = readFileSync(join(root, 'src/features/calls/calls.css'), 'utf8');
    expect(css).toMatch(/--call-controls-reserve/);
    expect(css).toMatch(/html\[data-call-active='1'\]\s*\.app-bottom-nav/);
    expect(css).toMatch(/-webkit-line-clamp:\s*2/);
  });

  it('учитывает Telegram Mini App safe-area и fullscreen звонка', () => {
    const css = readFileSync(join(root, 'src/features/calls/calls.css'), 'utf8');
    const tg = readFileSync(join(root, 'src/lib/telegramWebApp.ts'), 'utf8');
    const callWindow = readFileSync(join(root, 'src/features/calls/CallWindow.tsx'), 'utf8');
    expect(css).toMatch(/--tg-safe-area-inset-top/);
    expect(css).toMatch(/--call-inset-top/);
    expect(css).toMatch(/data-telegram-webapp/);
    expect(tg).toMatch(/requestFullscreen/);
    expect(tg).toMatch(/initTelegramWebApp/);
    expect(callWindow).toMatch(/setTelegramCallPresentation/);
  });

  it('Safari: видео заполняет плитку, окно по visualViewport', () => {
    const css = readFileSync(join(root, 'src/features/calls/calls.css'), 'utf8');
    expect(css).toMatch(/--viewport-height,\s*100dvh/);
    expect(css).toMatch(/call-participant-tile__media > video/);
    expect(css).toMatch(
      /\.call-participant-tile__media\s*\{[\s\S]*?display:\s*block/,
    );
    expect(css).toMatch(
      /\.call-participant-tile__video,\s*\n\s*\.call-participant-tile--video \.call-participant-tile__media > video/,
    );
  });

  it('кроссбраузер: классы filled/solo + каскад высоты vh/dvh/viewport', () => {
    const css = readFileSync(join(root, 'src/features/calls/calls.css'), 'utf8');
    const callWindow = readFileSync(join(root, 'src/features/calls/CallWindow.tsx'), 'utf8');
    expect(callWindow).toMatch(/call-stage__main--filled/);
    expect(callWindow).toMatch(/call-speaker-layout__strip--solo/);
    expect(css).toMatch(/call-stage__main--filled/);
    expect(css).toMatch(/call-speaker-layout__strip--solo/);
    expect(css).toMatch(/height:\s*100vh/);
    expect(css).toMatch(/height:\s*100dvh/);
    expect(css).toMatch(/constant\(safe-area-inset-top\)/);
    expect(css).toMatch(/translate3d\(-50%/);
  });

  it('лобби входа по ссылке компактное: один экран без прокрутки', () => {
    const css = readFileSync(join(root, 'src/features/calls/calls.css'), 'utf8');
    const joinPage = readFileSync(join(root, 'src/features/calls/CallJoinPage.tsx'), 'utf8');
    expect(joinPage).toMatch(/telemost-join--compact/);
    expect(joinPage).toMatch(/size="md"/);
    expect(joinPage).toMatch(/Safari: откройте/);
    expect(css).toMatch(/\.telemost-join--compact/);
    expect(css).toMatch(/telemost-join__devices\s*\{[\s\S]*?flex-wrap:\s*nowrap/);
    expect(css).toMatch(/@media \(max-height:\s*700px\)/);
  });
});
