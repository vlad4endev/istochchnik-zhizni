import { NextFunction, Request, Response } from 'express';
import { resolveSessionByToken } from '../services/authService';

type AuthRequest = Request & {
  authUserId?: number;
  authUserRole?: 'member' | 'admin';
  authToken?: string;
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

export async function resolveAuthSession(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authReq = req as AuthRequest;
  const token = readBearerToken(req);
  if (!token || !process.env.DATABASE_URL) {
    next();
    return;
  }

  try {
    const principal = await resolveSessionByToken(token);
    if (principal) {
      authReq.authUserId = principal.userId;
      authReq.authUserRole = principal.role;
      authReq.authToken = token;
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
