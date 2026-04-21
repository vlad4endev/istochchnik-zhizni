import 'express-serve-static-core';

declare module 'express-serve-static-core' {
  interface Request {
    userRole?: 'member' | 'minister' | 'pastor' | 'musician' | 'editor' | 'admin';
    authUserId?: number;
    authUserRole?: 'member' | 'minister' | 'pastor' | 'musician' | 'editor' | 'admin';
    authToken?: string;
  }
}
