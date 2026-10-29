import assert from 'node:assert/strict';
import {
  isMessengerDirectoryVisibleToViewer,
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

  console.log('appRole.parishionerVisibility.test.ts: OK');
}

run();
