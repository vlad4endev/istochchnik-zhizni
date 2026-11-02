import assert from 'node:assert/strict';
import {
  isMessengerDirectoryVisibleToViewer,
  isParishionerDirectoryViewer,
  isParishionerOnly,
} from './appRole';

function run(): void {
  assert.equal(isParishionerOnly(['parishioner']), true);
  assert.equal(isParishionerOnly('parishioner'), true);
  assert.equal(isParishionerOnly(['parishioner', 'parishioner']), true);
  assert.equal(isParishionerOnly(['parishioner', 'member']), false);
  assert.equal(isParishionerOnly(['member']), false);
  assert.equal(isParishionerOnly(['admin']), false);
  assert.equal(isParishionerOnly([]), false);
  assert.equal(isParishionerOnly(null), false);

  assert.equal(
    isMessengerDirectoryVisibleToViewer(['parishioner'], ['parishioner']),
    true,
  );
  assert.equal(
    isMessengerDirectoryVisibleToViewer(['parishioner'], ['member']),
    false,
  );
  assert.equal(
    isMessengerDirectoryVisibleToViewer(['parishioner'], ['minister']),
    false,
  );
  assert.equal(
    isMessengerDirectoryVisibleToViewer(['parishioner'], ['pastor']),
    false,
  );
  assert.equal(
    isMessengerDirectoryVisibleToViewer(['parishioner'], ['admin']),
    false,
  );
  assert.equal(
    isMessengerDirectoryVisibleToViewer(['parishioner'], ['parishioner', 'member']),
    false,
  );
  assert.equal(
    isMessengerDirectoryVisibleToViewer(['member'], ['admin']),
    true,
  );
  assert.equal(
    isMessengerDirectoryVisibleToViewer(['admin'], ['parishioner']),
    true,
  );
  assert.equal(
    isMessengerDirectoryVisibleToViewer(['minister'], ['member']),
    true,
  );

  // app_role=parishioner, но app_roles ещё {member} — ограничение всё равно включено.
  assert.equal(isParishionerDirectoryViewer('parishioner', ['member']), true);
  assert.equal(isParishionerDirectoryViewer('member', ['member']), false);
  assert.equal(isParishionerDirectoryViewer('member', ['parishioner']), true);
  assert.equal(isParishionerDirectoryViewer(undefined, ['parishioner']), true);
  assert.equal(
    isMessengerDirectoryVisibleToViewer(['member'], ['member'], 'parishioner'),
    false,
  );
  assert.equal(
    isMessengerDirectoryVisibleToViewer(['member'], ['parishioner'], 'parishioner'),
    true,
  );

  console.log('appRole.parishionerVisibility.test.ts: OK');
}

run();
