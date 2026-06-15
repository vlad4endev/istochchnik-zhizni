import { NextFunction, Request, Response } from 'express';
import { readAuthTokenFromCookies } from '../config/authCookie';
import { resolveSessionByToken } from '../services/authService';
import { resolveImpersonationPrincipal } from '../services/impersonationService';
import type { AppRole } from '../types/appRole';

type AuthRequest = Request & {
  authUserId?: number;
  authUserRole?: AppRole;
  authUserRoles?: AppRole[];
  authToken?: string;
  realAdminId?: number;
  isImpersonating?: boolean;
  impersonationExpiresAt?: string;
};

function readBearerToken(req: Request): string | null {
  const authHeader = req.header('authorization');
  if (!authHeader) {
    return null;
  }

  const [scheme, value] = authHeader.split(' ');
  if (!scheme || !value || scheme.toLowerCase() !== 'bearer') {
    return null;
  }

  return value.trim() || null;
}

function readSessionToken(req: Request): string | null {
  const bearer = readBearerToken(req);
  if (bearer) {
    return bearer;
  }
  return readAuthTokenFromCookies(req);
}

export async function resolveAuthSession(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authReq = req as AuthRequest;
  const token = readSessionToken(req);
  if (!token || !process.env.DATABASE_URL) {
    next();
    return;
  }

  try {
    const resolution = await resolveSessionByToken(token);
    if (resolution.principal) {
      authReq.authUserId = resolution.principal.userId;
      authReq.authUserRole = resolution.principal.role;
      authReq.authUserRoles = resolution.principal.roles;
      authReq.authToken = token;

      const impersonation = await resolveImpersonationPrincipal(
        token,
        resolution.principal.userId,
        resolution.principal.role,
        resolution.principal.roles,
      );
      if (impersonation?.isImpersonating) {
        authReq.authUserId = impersonation.userId;
        authReq.authUserRole = impersonation.role;
        authReq.authUserRoles = impersonation.roles;
        authReq.realAdminId = impersonation.realAdminId;
        authReq.isImpersonating = true;
      }
    }
  } catch (error) {
    console.error('Failed to resolve auth session', error);
    res.status(500).json({ error: 'Failed to resolve auth session' });
    return;
  }

  next();
}

export function requireAuthSession(req: Request, res: Response, next: NextFunction): void {
  const authReq = req as AuthRequest;
  if (!authReq.authUserId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  next();
}
