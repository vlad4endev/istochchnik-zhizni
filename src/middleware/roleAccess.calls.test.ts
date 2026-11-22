import assert from 'node:assert/strict';
import type { NextFunction, Request, Response } from 'express';

import { enforceRoleAccess } from './roleAccess';

type RoleReq = Request & {
  userRole?: string;
  authUserRoles?: string[];
  authUserId?: number;
};

function run(
  role: string,
  method: string,
  path: string,
): Promise<{ status: number | null; body: unknown }> {
  return new Promise((resolve) => {
    const req = {
      method,
      originalUrl: path,
      url: path,
      path,
      userRole: role,
      authUserRoles: [role],
      authUserId: 10,
    } as RoleReq;
    let status: number | null = null;
    let body: unknown = null;
    const res = {
      status(code: number) {
        status = code;
        return this;
      },
      json(payload: unknown) {
        body = payload;
        resolve({ status, body });
        return this;
      },
    } as unknown as Response;
    const next: NextFunction = () => resolve({ status: null, body: 'next' });
    enforceRoleAccess(req as Request, res, next);
  });
}

async function main(): Promise<void> {
  const okMember = await run('member', 'POST', '/api/calls');
  assert.equal(okMember.body, 'next', 'member can POST /api/calls');

  const okAccept = await run('member', 'POST', '/api/calls/abc/accept');
  assert.equal(okAccept.body, 'next');

  const okInvite = await run('member', 'POST', '/api/call-invitations/tok/join');
  assert.equal(okInvite.body, 'next');

  const okParish = await run('parishioner', 'POST', '/api/calls');
  assert.equal(okParish.body, 'next', 'parishioner can POST /api/calls');

  for (const role of ['member', 'parishioner']) {
    for (const path of ['/api/notifications/test', '/api/notifications/test-sample', '/api/notifications/remove-token']) {
      const r = await run(role, 'POST', path);
      assert.equal(r.body, 'next', `${role} can POST ${path}`);
    }
  }

  // Лента: участник и прихожанин отмечают прочитанное и лайкают комментарии.
  for (const role of ['member', 'parishioner']) {
    for (const [method, path] of [
      ['POST', '/api/feed/mark-seen'],
      ['POST', '/api/posts/5/comments/9/like'],
      ['DELETE', '/api/posts/5/comments/9/like'],
      ['POST', '/api/posts/5/like'],
      ['POST', '/api/posts/5/repost'],
      ['POST', '/api/stories/5/reply'],
    ]) {
      const r = await run(role, method, path);
      assert.equal(r.body, 'next', `${role} can ${method} ${path}`);
    }
  }

  const denied = await run('member', 'POST', '/api/admin/something');
  assert.equal(denied.status, 403);

  console.log('roleAccess.calls ok');
}

void main();
