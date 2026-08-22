export interface JwtPayload {
  sub: string; // userId
  username: string;
}

export interface AuthenticatedUser {
  id: string;
  username: string;
}
