/**
 * Who may do what with a tournament (L-06). Pure functions over the caller
 * (from the gateway's X-User-* headers) and the tournament, so every
 * controller path asks the same questions and the rules are unit-testable
 * as a matrix.
 */

export type ClubRole = 'ADMIN' | 'MEMBER';

export interface Actor {
  sub: string;
  role?: string;                       // 'SUPER_ADMIN' | 'PLAYER'
  clubs: { id: string; role: ClubRole }[];
}

/** Anything with the fields the rules look at. */
export interface Governed {
  clubId: string | null;
  createdBy: string;
  visibility: string;                  // 'CLUB' | 'PUBLIC'
  status?: string;
}

/** Parses X-User-Clubs, "id:A,id:M". Unknown or malformed parts are ignored. */
export function parseClubs(header?: string | null): Actor['clubs'] {
  if (!header) return [];
  return header.split(',').map((part) => part.trim().split(':')).flatMap(([id, r]) =>
    id && (r === 'A' || r === 'M') ? [{ id, role: (r === 'A' ? 'ADMIN' : 'MEMBER') as ClubRole }] : []);
}

export const isSuperAdmin = (a?: Actor | null) => a?.role === 'SUPER_ADMIN';

export const isClubAdmin = (a: Actor | null | undefined, clubId: string | null) =>
  !!a && !!clubId && a.clubs.some((c) => c.id === clubId && c.role === 'ADMIN');

export const isClubMember = (a: Actor | null | undefined, clubId: string | null) =>
  !!a && !!clubId && a.clubs.some((c) => c.id === clubId);

/** Clubs where the caller can create tournaments. */
export const adminClubIds = (a?: Actor | null) =>
  (a?.clubs ?? []).filter((c) => c.role === 'ADMIN').map((c) => c.id);

/**
 * Manage = edit, open, draw, score, approve. The super-admin, or any admin
 * of the tournament's club. Every admin of a club manages every club
 * tournament (A14). A tournament from before clubs existed (no clubId) is
 * managed by whoever created it until L-07 assigns it to a club.
 */
export function canManage(a: Actor | null | undefined, t: Governed): boolean {
  if (!a) return false;
  if (isSuperAdmin(a)) return true;
  if (t.clubId) return isClubAdmin(a, t.clubId);
  return t.createdBy === a.sub;
}

/**
 * Read = see the tournament at all. Managers always can. Otherwise the club
 * must be active, and the tournament PUBLIC, or the caller a member of its
 * club, or already entered in it (stands in for F-13 invites until then).
 * Nobody but managers sees a DRAFT.
 */
export function canRead(a: Actor | null | undefined, t: Governed, opts: { entered?: boolean; clubActive?: boolean } = {}): boolean {
  if (canManage(a, t)) return true;
  if (opts.clubActive === false) return false;
  if (t.status === 'DRAFT') return false;
  return t.visibility === 'PUBLIC' || isClubMember(a, t.clubId) || !!opts.entered;
}

/**
 * Enter = apply to play. Club members may enter their club's tournaments.
 * INTERIM until club membership applications ship (L-05, Sprint 4): players
 * can't join clubs yet, so a PUBLIC tournament also takes entries from any
 * signed-in player. Once L-05 lands this narrows to members and invitees
 * (A17) by deleting the PUBLIC clause.
 */
export function canEnter(a: Actor | null | undefined, t: Governed, opts: { clubActive?: boolean } = {}): boolean {
  if (!a || opts.clubActive === false) return false;
  if (isClubMember(a, t.clubId)) return true;
  return t.visibility === 'PUBLIC';
}
