import { Role } from '../entities/user.entity';
import { ClubRole } from '../entities/club-membership.entity';

export type { Role };

/** One club the user is an ACTIVE member of. */
export interface ClubClaim {
  id: string;
  role: ClubRole;
}

/** Access-token claims (L-02, dev plan §1.2). */
export interface JwtPayload {
  sub: string;
  email: string;
  name: string;
  role: Role;
  clubs: ClubClaim[];
}

/** At most this many clubs ride in the token; beyond it the claim is cut (rare). */
export const MAX_CLUB_CLAIMS = 20;

/** The X-User-Clubs header form of the claim: "id:A,id:M". */
export const encodeClubs = (clubs: ClubClaim[]) =>
  clubs.map((c) => `${c.id}:${c.role === 'ADMIN' ? 'A' : 'M'}`).join(',');
