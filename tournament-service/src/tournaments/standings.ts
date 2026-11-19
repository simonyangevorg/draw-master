/**
 * Round robin and group standings (F-08), shared by round robin events, the
 * group stage (F-09) and GET .../events/:eid/standings.
 *
 * Order: wins; then, among players level on wins, head-to-head (two
 * players) or a mini-league of wins among them (three or more); then % sets
 * won; then % games won. Anything still level is marked `tied` for the
 * organiser to settle (drawing lots), keeping entry order meanwhile.
 *
 * Walkovers (ASSUMPTION A7): a win for the player who turned up, counted as
 * if won to love: ceil(bestOf/2) sets to 0 and gamesPerSet games per set.
 */
import { RuleSet, setsToWin } from './rules';

export interface StandingMatch {
  participant1Id: string | null;
  participant2Id: string | null;
  winnerId: string | null;
  status: string;
  outcome?: string | null;
  sets?: { p1: number; p2: number; isMatchTiebreak?: boolean }[] | null;
  rules?: RuleSet;
}

export interface StandingRow {
  participantId: string;
  rank: number;
  played: number;
  wins: number;
  losses: number;
  setsWon: number;
  setsLost: number;
  gamesWon: number;
  gamesLost: number;
  /** Level with a neighbour on every criterion: the organiser decides. */
  tied: boolean;
}

const finished = (m: StandingMatch) =>
  !!m.winnerId && !!m.participant1Id && !!m.participant2Id && (m.status === 'COMPLETED' || m.status === 'WALKOVER');

const pct = (won: number, lost: number) => (won + lost === 0 ? 0 : won / (won + lost));

export function computeStandings(participantIds: string[], matches: StandingMatch[]): StandingRow[] {
  const rows = new Map<string, StandingRow>(participantIds.map((id) => [id, {
    participantId: id, rank: 0, played: 0, wins: 0, losses: 0,
    setsWon: 0, setsLost: 0, gamesWon: 0, gamesLost: 0, tied: false,
  }]));
  const done = matches.filter(finished).filter((m) => rows.has(m.participant1Id) && rows.has(m.participant2Id));

  for (const m of done) {
    const a = rows.get(m.participant1Id);
    const b = rows.get(m.participant2Id);
    const aWon = m.winnerId === m.participant1Id;
    a.played++; b.played++;
    (aWon ? a : b).wins++;
    (aWon ? b : a).losses++;
    if (m.outcome === 'WALKOVER' || m.status === 'WALKOVER') {
      const sets = m.rules ? setsToWin(m.rules) : 2;
      const games = sets * (m.rules?.gamesPerSet ?? 6);
      const w = aWon ? a : b;
      const l = aWon ? b : a;
      w.setsWon += sets; l.setsLost += sets; w.gamesWon += games; l.gamesLost += games;
      continue;
    }
    const sets = m.sets ?? [];
    const cutShort = m.outcome === 'RETIRED' || m.outcome === 'DEFAULT';
    sets.forEach((s, i) => {
      // A 10-point match tiebreak counts as a set, and as one game to the winner.
      const g1 = s.isMatchTiebreak ? (s.p1 > s.p2 ? 1 : 0) : s.p1;
      const g2 = s.isMatchTiebreak ? (s.p2 > s.p1 ? 1 : 0) : s.p2;
      a.gamesWon += g1; a.gamesLost += g2; b.gamesWon += g2; b.gamesLost += g1;
      // The set a retirement or default cut short was never won.
      if ((cutShort && i === sets.length - 1) || s.p1 === s.p2) return;
      if (s.p1 > s.p2) { a.setsWon++; b.setsLost++; } else { b.setsWon++; a.setsLost++; }
    });
  }

  // Wins among a set of players only (head-to-head / mini-league).
  const miniWins = (ids: Set<string>) => {
    const w = new Map<string, number>([...ids].map((id) => [id, 0]));
    for (const m of done) {
      if (ids.has(m.participant1Id) && ids.has(m.participant2Id)) w.set(m.winnerId, (w.get(m.winnerId) ?? 0) + 1);
    }
    return w;
  };

  const order = [...rows.values()];
  const byWins = new Map<number, StandingRow[]>();
  for (const r of order) byWins.set(r.wins, [...(byWins.get(r.wins) ?? []), r]);
  const ranked: StandingRow[] = [];
  for (const wins of [...byWins.keys()].sort((x, y) => y - x)) {
    const block = byWins.get(wins);
    if (block.length === 1) { ranked.push(block[0]); continue; }
    const mw = miniWins(new Set(block.map((r) => r.participantId)));
    const key = (r: StandingRow) => [mw.get(r.participantId), pct(r.setsWon, r.setsLost), pct(r.gamesWon, r.gamesLost)];
    const sorted = block
      .map((r, i) => ({ r, i, k: key(r) }))
      .sort((x, y) => (y.k[0] - x.k[0]) || (y.k[1] - x.k[1]) || (y.k[2] - x.k[2]) || (x.i - y.i));
    for (let i = 0; i < sorted.length; i++) {
      const same = (j: number) => j >= 0 && j < sorted.length && sorted[j].k.every((v, n) => v === sorted[i].k[n]);
      sorted[i].r.tied = same(i - 1) || same(i + 1);
      ranked.push(sorted[i].r);
    }
  }
  ranked.forEach((r, i) => (r.rank = i + 1));
  return ranked;
}

/**
 * Round robin schedule by the circle method: n-1 rounds (n rounded up to
 * even), nobody plays twice in a round; with an odd number one player sits
 * out each round. Returns rounds of [a, b] index pairs.
 */
export function circleRounds(n: number): [number, number][][] {
  const ids = Array.from({ length: n % 2 ? n + 1 : n }, (_, i) => i); // index n = the bye
  const rounds: [number, number][][] = [];
  const m = ids.length;
  for (let r = 0; r < m - 1; r++) {
    const pairs: [number, number][] = [];
    for (let i = 0; i < m / 2; i++) {
      const a = ids[i];
      const b = ids[m - 1 - i];
      if (a < n && b < n) pairs.push(r % 2 ? [b, a] : [a, b]);
    }
    rounds.push(pairs);
    ids.splice(1, 0, ids.pop()); // keep ids[0] fixed, rotate the rest
  }
  return rounds;
}
