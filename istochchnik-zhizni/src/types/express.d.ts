import 'express-serve-static-core';

declare module 'express-serve-static-core' {
  interface Request {
    userRole?: 'member' | 'admin';
    authUserId?: number;
    authUserRole?: 'member' | 'admin';
    authToken?: string;
  }
}
