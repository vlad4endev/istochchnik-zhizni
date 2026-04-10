import 'express-serve-static-core';

declare module 'express-serve-static-core' {
  interface Request {
    userRole?: 'member' | 'musician' | 'editor' | 'admin';
    authUserId?: number;
    authUserRole?: 'member' | 'musician' | 'editor' | 'admin';
    authToken?: string;
  }
}
