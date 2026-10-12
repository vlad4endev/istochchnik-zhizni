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

  const denied = await run('member', 'POST', '/api/admin/something');
  assert.equal(denied.status, 403);

  console.log('roleAccess.calls ok');
}

void main();
