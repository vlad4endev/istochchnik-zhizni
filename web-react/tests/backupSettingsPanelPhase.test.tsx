import { describe, expect, it } from 'vitest';

/**
 * Mirrors BackupSettingsSection render gating.
 * Regression: when the settings query fails, draft stays null — if we check !draft
 * before isError, the UI stays on «Загрузка…» forever and restore is unreachable.
 */
function backupSettingsPanelPhase(args: {
  isError: boolean;
  isLoading: boolean;
  hasSettings: boolean;
}): 'error' | 'loading' | 'ready' {
  if (args.isError) return 'error';
  if (args.isLoading || !args.hasSettings) return 'loading';
  return 'ready';
}

describe('backupSettingsPanelPhase', () => {
  it('shows error when query failed even if draft/settings are missing', () => {
    expect(
      backupSettingsPanelPhase({ isError: true, isLoading: false, hasSettings: false }),
    ).toBe('error');
  });

  it('shows loading while fetching without settings yet', () => {
    expect(
      backupSettingsPanelPhase({ isError: false, isLoading: true, hasSettings: false }),
    ).toBe('loading');
  });

  it('is ready when settings are available', () => {
    expect(
      backupSettingsPanelPhase({ isError: false, isLoading: false, hasSettings: true }),
    ).toBe('ready');
  });
});
