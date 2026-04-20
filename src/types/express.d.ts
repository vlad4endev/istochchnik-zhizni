import 'express-serve-static-core';

declare module 'express-serve-static-core' {
  interface Request {
    userRole?: 'member' | 'pastor' | 'musician' | 'editor' | 'admin';
    authUserId?: number;
    authUserRole?: 'member' | 'pastor' | 'musician' | 'editor' | 'admin';
    authToken?: string;
  }
}
