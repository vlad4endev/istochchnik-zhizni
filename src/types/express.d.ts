import 'express-serve-static-core';

declare module 'express-serve-static-core' {
  interface Request {
    userRole?:
      | 'parishioner'
      | 'member'
      | 'minister'
      | 'pastor'
      | 'musician'
      | 'editor'
      | 'admin';
    authUserId?: number;
    authUserRole?:
      | 'parishioner'
      | 'member'
      | 'minister'
      | 'pastor'
      | 'musician'
      | 'editor'
      | 'admin';
    authUserRoles?: Array<
      'parishioner' | 'member' | 'minister' | 'pastor' | 'musician' | 'editor' | 'admin'
    >;
    authToken?: string;
  }
}
