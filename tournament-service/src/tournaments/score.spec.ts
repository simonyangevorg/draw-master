import { validateScore, formatScore, SetScore, Outcome } from './score';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fixtures = require('./score-fixtures.json');

// F-06: every case in the shared fixture file (the frontend runs the same file).
const toSets = (rows: any[]): SetScore[] =>
  rows.map(([p1, p2, tb, isMatchTiebreak]) => ({ p1, p2, ...(tb != null ? { tb } : {}), ...(isMatchTiebreak ? { isMatchTiebreak } : {}) }));

describe('validateScore (shared fixtures)', () => {
  it('has at least 40 cases', () => expect(fixtures.cases.length).toBeGreaterThanOrEqual(40));

  it.each(fixtures.cases.map((c, i) => [i, c] as const))('case %i', (_, c: any) => {
    const result = validateScore((fixtures.rules as any)[c.rules], toSets(c.sets), (c.outcome ?? 'COMPLETED') as Outcome);
    expect(result.ok).toBe(c.ok);
    if (c.ok) expect(result.winner).toBe(c.winner);
    else expect(result.error).toContain(c.error);
  });
});

describe('formatScore', () => {
  it.each(fixtures.formats.map((f) => [f.text, f] as const))('%s', (text, f: any) => {
    expect(formatScore(toSets(f.sets), f.outcome)).toBe(text);
  });
});

describe('match tiebreak flag', () => {
  it('is set on the deciding set only', () => {
    const r = validateScore(fixtures.rules.MTB as any, toSets([[6, 4], [3, 6], [10, 8]]));
    expect(r.sets.map((s) => !!s.isMatchTiebreak)).toEqual([false, false, true]);
  });
});
