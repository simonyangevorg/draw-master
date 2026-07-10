export type Role = 'ORGANISER' | 'MEMBER' | 'GUEST';

export interface JwtPayload {
  sub: string;
  email: string;
  name: string;
  role: Role;
}
