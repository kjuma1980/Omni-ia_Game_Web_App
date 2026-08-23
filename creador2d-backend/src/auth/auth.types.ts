import { Role } from '../enums';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  username: string;
  role: Role;
}

export interface RefreshTokenPayload {
  sub: string;
  familyId: string;
  jti: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  username: string;
  role: Role;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthenticatedUser;
  }
}
