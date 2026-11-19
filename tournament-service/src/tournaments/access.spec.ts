import { Actor, canEnter, canManage, canRead, parseClubs } from './access';

// L-06 policy matrix: who can manage / read / enter, by role and visibility.
const CLUB = 'club-a';
const actors: Record<string, Actor | null> = {
  anonymous: null,
  outsider: { sub: 'u-out', role: 'PLAYER', clubs: [] },
  member: { sub: 'u-mem', role: 'PLAYER', clubs: [{ id: CLUB, role: 'MEMBER' }] },
  admin: { sub: 'u-adm', role: 'PLAYER', clubs: [{ id: CLUB, role: 'ADMIN' }] },
  otherClubAdmin: { sub: 'u-oth', role: 'PLAYER', clubs: [{ id: 'club-b', role: 'ADMIN' }] },
  superAdmin: { sub: 'u-sup', role: 'SUPER_ADMIN', clubs: [] },
};
const t = (visibility: string, status = 'OPEN') => ({ clubId: CLUB, createdBy: 'u-adm', visibility, status });

describe('access policy (L-06)', () => {
  it.each([
    //  actor              manage  read CLUB  read PUBLIC  enter CLUB  enter PUBLIC
    ['anonymous',          false,  false,     true,        false,      false],
    ['outsider',           false,  false,     true,        false,      true],
    ['member',             false,  true,      true,        true,       true],
    ['admin',              true,   true,      true,        true,       true],
    ['otherClubAdmin',     false,  false,     true,        false,      true],
    ['superAdmin',         true,   true,      true,        false,      true],
  ])('%s', (who, manage, readClub, readPublic, enterClub, enterPublic) => {
    const a = actors[who as string];
    expect(canManage(a, t('CLUB'))).toBe(manage);
    expect(canRead(a, t('CLUB'))).toBe(readClub);
    expect(canRead(a, t('PUBLIC'))).toBe(readPublic);
    expect(canEnter(a, t('CLUB'))).toBe(enterClub);
    expect(canEnter(a, t('PUBLIC'))).toBe(enterPublic);
  });

  it('an admin of club A cannot manage club B', () => {
    expect(canManage(actors.admin, { ...t('PUBLIC'), clubId: 'club-b' })).toBe(false);
  });

  it('only managers see a DRAFT, whatever its visibility', () => {
    for (const who of ['anonymous', 'outsider', 'member']) expect(canRead(actors[who], t('PUBLIC', 'DRAFT'))).toBe(false);
    expect(canRead(actors.admin, t('CLUB', 'DRAFT'))).toBe(true);
  });

  it('an entrant still sees a CLUB tournament they entered', () => {
    expect(canRead(actors.outsider, t('CLUB'), { entered: true })).toBe(true);
  });

  it("an inactive club's tournaments are hidden from everyone but managers, and take no entries", () => {
    expect(canRead(actors.member, t('PUBLIC'), { clubActive: false })).toBe(false);
    expect(canEnter(actors.member, t('PUBLIC'), { clubActive: false })).toBe(false);
    expect(canRead(actors.superAdmin, t('PUBLIC'), { clubActive: false })).toBe(true);
  });

  it('a tournament from before clubs is managed by its creator only', () => {
    const legacy = { clubId: null, createdBy: 'u-out', visibility: 'PUBLIC', status: 'OPEN' };
    expect(canManage(actors.outsider, legacy)).toBe(true);
    expect(canManage(actors.admin, legacy)).toBe(false);
  });

  it('parses X-User-Clubs and ignores junk', () => {
    expect(parseClubs('a:A, b:M,c,d:X,:A')).toEqual([{ id: 'a', role: 'ADMIN' }, { id: 'b', role: 'MEMBER' }]);
    expect(parseClubs(undefined)).toEqual([]);
  });
});
