import assert from 'node:assert/strict';
import { isSectionVisibleForRole, normalizeSectionVisibilitySettings } from './sectionVisibilitySettings';

function run(): void {
  // Раздел разрешён только member/admin — прихожанин не должен автоматически
  // наследовать доступ member (баг с «тем же доступом, что и у члена церкви»).
  const restricted = normalizeSectionVisibilitySettings({
    sections: {
      feed: { enabled: true, roles: ['member', 'admin'] },
    },
  });
  assert.equal(isSectionVisibleForRole(restricted, 'feed', 'member'), true);
  assert.equal(isSectionVisibleForRole(restricted, 'feed', 'admin'), true);
  assert.equal(isSectionVisibleForRole(restricted, 'feed', 'parishioner'), false);

  // Если администратор явно добавил parishioner — доступ есть.
  const explicit = normalizeSectionVisibilitySettings({
    sections: {
      feed: { enabled: true, roles: ['member', 'parishioner', 'admin'] },
    },
  });
  assert.equal(isSectionVisibleForRole(explicit, 'feed', 'parishioner'), true);

  // Отключённый раздел — недоступен никому, даже если роль в списке.
  const disabled = normalizeSectionVisibilitySettings({
    sections: {
      feed: { enabled: false, roles: ['member', 'parishioner', 'admin'] },
    },
  });
  assert.equal(isSectionVisibleForRole(disabled, 'feed', 'parishioner'), false);
  assert.equal(isSectionVisibleForRole(disabled, 'feed', 'member'), false);

  console.log('sectionVisibilitySettings.test.ts: OK');
}

run();
