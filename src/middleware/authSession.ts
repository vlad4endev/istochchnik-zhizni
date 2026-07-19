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

/**
 * Кандидаты сессии: сначала Bearer из localStorage, затем HttpOnly cookie.
 * Как в realtime WS — устаревший Bearer не должен перекрывать ещё живую cookie
 * (частый случай после ротации refresh в другой вкладке / сбое обновления LS).
 */
function collectSessionTokenCandidates(req: Request): string[] {
  const candidates: string[] = [];
  const bearer = readBearerToken(req);
  if (bearer) {
    candidates.push(bearer);
  }
  const cookie = readAuthTokenFromCookies(req);
  if (cookie && !candidates.includes(cookie)) {
    candidates.push(cookie);
  }
  return candidates;
}

export async function resolveAuthSession(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authReq = req as AuthRequest;
  if (!process.env.DATABASE_URL) {
    next();
    return;
  }

  const candidates = collectSessionTokenCandidates(req);
  if (candidates.length === 0) {
    next();
    return;
  }

  try {
    for (const token of candidates) {
      const resolution = await resolveSessionByToken(token);
      if (!resolution.principal) {
        continue;
      }

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
      break;
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
