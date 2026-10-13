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

  it('резервирует место под кнопки и safe-area на мобиле', () => {
    const css = readFileSync(join(root, 'src/features/calls/calls.css'), 'utf8');
    expect(css).toMatch(/--call-controls-reserve/);
    expect(css).toMatch(/html\[data-call-active='1'\]\s*\.app-bottom-nav/);
    expect(css).toMatch(/-webkit-line-clamp:\s*2/);
  });
});
