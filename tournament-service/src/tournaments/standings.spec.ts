import { circleRounds, computeStandings, StandingMatch } from './standings';

const win = (a: string, b: string, sets: [number, number][], winner = a, extra: Partial<StandingMatch> = {}): StandingMatch => ({
  participant1Id: a, participant2Id: b, winnerId: winner, status: 'COMPLETED', outcome: 'COMPLETED',
  sets: sets.map(([p1, p2]) => ({ p1, p2 })), ...extra,
});

describe('circleRounds (F-08)', () => {
  it('5 players: 5 rounds, 10 matches, nobody twice in a round, each pair once', () => {
    const rounds = circleRounds(5);
    expect(rounds).toHaveLength(5);
    const all = rounds.flat();
    expect(all).toHaveLength(10);
    for (const r of rounds) {
      const seen = r.flat();
      expect(new Set(seen).size).toBe(seen.length);
      expect(r).toHaveLength(2); // one player sits out each round
    }
    expect(new Set(all.map(([a, b]) => [a, b].sort().join('-'))).size).toBe(10);
  });

  it('4 players: 3 rounds of 2', () => {
    expect(circleRounds(4).map((r) => r.length)).toEqual([2, 2, 2]);
  });
});

describe('computeStandings (F-08)', () => {
  it('orders by wins', () => {
    const rows = computeStandings(['a', 'b', 'c'], [
      win('a', 'b', [[6, 1], [6, 1]]), win('a', 'c', [[6, 1], [6, 1]]), win('b', 'c', [[6, 4], [6, 4]]),
    ]);
    expect(rows.map((r) => [r.participantId, r.wins, r.rank])).toEqual([['a', 2, 1], ['b', 1, 2], ['c', 0, 3]]);
  });

  it('two level on wins: head-to-head decides, even against better percentages', () => {
    // b beat a; a has far better set and game percentages overall.
    const rows = computeStandings(['a', 'b', 'c', 'd'], [
      win('b', 'a', [[7, 6], [7, 6]]),
      win('a', 'c', [[6, 0], [6, 0]]), win('a', 'd', [[6, 0], [6, 0]]),
      win('b', 'c', [[6, 4], [3, 6], [7, 5]]), win('d', 'b', [[6, 4], [6, 4]]),
      win('c', 'd', [[6, 4], [6, 4]]),
    ]);
    expect(rows.slice(0, 2).map((r) => r.participantId)).toEqual(['b', 'a']);
  });

  it('three level on wins in a circle: % sets, then % games', () => {
    // a beats b, b beats c, c beats a: mini-league 1-1 each.
    const rows = computeStandings(['a', 'b', 'c'], [
      win('a', 'b', [[6, 0], [6, 0]]),           // a: 2-0 sets
      win('b', 'c', [[6, 4], [4, 6], [6, 4]]),   // b: 2-1
      win('c', 'a', [[6, 4], [6, 4]]),           // c: 2-0
    ]);
    // sets: a 2-2 (50%), b 2-3 (40%), c 3-2 (60%)
    expect(rows.map((r) => r.participantId)).toEqual(['c', 'a', 'b']);
    expect(rows.every((r) => !r.tied)).toBe(true);
  });

  it('a mini-league among three tied players outranks percentages', () => {
    // a, b, c all on 2 wins; among themselves a has 2, b 1, c 0, though c has the best percentages.
    const rows = computeStandings(['a', 'b', 'c', 'd', 'e'], [
      win('a', 'b', [[7, 6], [7, 6]]), win('a', 'c', [[7, 6], [7, 6]]), win('b', 'c', [[7, 6], [7, 6]]),
      win('d', 'a', [[6, 0], [6, 0]]), win('e', 'a', [[6, 0], [6, 0]]),
      win('c', 'd', [[6, 0], [6, 0]]), win('c', 'e', [[6, 0], [6, 0]]),
      win('b', 'd', [[6, 0], [6, 0]]), win('e', 'b', [[6, 0], [6, 0]]),
      win('e', 'd', [[6, 0], [6, 0]]),
    ]);
    // wins: e 3, a/b/c 2 each (c with the best percentages), d 1
    expect(rows[0].participantId).toBe('e');
    const top3 = rows.filter((r) => ['a', 'b', 'c'].includes(r.participantId)).map((r) => r.participantId);
    expect(top3).toEqual(['a', 'b', 'c']);
  });

  it('completely level players are marked tied for the organiser', () => {
    const rows = computeStandings(['a', 'b'], []);
    expect(rows.map((r) => r.tied)).toEqual([true, true]);
  });

  it('a walkover counts as a win to love (2-0 sets, 12-0 games)', () => {
    const rows = computeStandings(['a', 'b'], [
      { participant1Id: 'a', participant2Id: 'b', winnerId: 'a', status: 'WALKOVER', outcome: 'WALKOVER', sets: [],
        rules: { bestOf: 3, gamesPerSet: 6, tiebreakAt: 6, decidingSet: 'FULL', noAd: false } },
    ]);
    expect(rows[0]).toMatchObject({ participantId: 'a', wins: 1, setsWon: 2, setsLost: 0, gamesWon: 12, gamesLost: 0 });
  });

  it("a retirement's unfinished set isn't a set won", () => {
    const rows = computeStandings(['a', 'b'], [win('b', 'a', [[6, 3], [2, 1]], 'a', { outcome: 'RETIRED' })]);
    const a = rows.find((r) => r.participantId === 'a');
    expect(a).toMatchObject({ wins: 1, setsWon: 0, setsLost: 1, gamesWon: 4, gamesLost: 8 });
  });

  it('unfinished matches are ignored', () => {
    const rows = computeStandings(['a', 'b'], [{ participant1Id: 'a', participant2Id: 'b', winnerId: null, status: 'SCHEDULED' }]);
    expect(rows.map((r) => r.played)).toEqual([0, 0]);
  });
});
