/**
 * Score validation against a match's rules (F-06): a line-for-line mirror of
 * tournament-service/src/tournaments/score.ts, so the score dialog checks
 * exactly what the API will. Both are tested against the same fixture file
 * (scripts/check-score-rules.mjs). Change them together.
 */

export const OUTCOMES = ['COMPLETED', 'RETIRED', 'WALKOVER', 'DEFAULT'];

const fail = (error) => ({ ok: false, error, winner: null, sets: [] });

/** Is this a complete, legal set under the rules? Returns why not, or null. */
export function setProblem(rules, s, n) {
  const N = rules.gamesPerSet;
  const T = rules.tiebreakAt;
  const hi = Math.max(s.p1, s.p2);
  const lo = Math.min(s.p1, s.p2);
  const label = `Set ${n} (${s.p1}-${s.p2})`;
  if (s.p1 === s.p2) return `${label} can't end level`;
  const tiebreakSet = hi === T + 1 && lo === T;
  const normal = (hi === N && lo <= N - 2 && lo < T) || (T === N && hi === N + 1 && lo === N - 1);
  if (!tiebreakSet && !normal) {
    return `${label} isn't a finished set: sets go to ${N} with a 2-game lead, with a tiebreak at ${T}-${T} (${T + 1}-${T})`;
  }
  if (s.tb != null) {
    if (!tiebreakSet) return `${label} had no tiebreak, so it can't have tiebreak points`;
    if (!Number.isInteger(s.tb) || s.tb < 0 || s.tb > 99) return `${label}: tiebreak points must be a whole number`;
  }
  return null;
}

/** A match tiebreak to 10: at least 10 points and a 2-point lead (exactly 2 past 10). */
export function matchTiebreakProblem(s, n) {
  const hi = Math.max(s.p1, s.p2);
  const lo = Math.min(s.p1, s.p2);
  const label = `Match tiebreak [${s.p1}-${s.p2}]`;
  if (hi < 10) return `${label} is played to 10`;
  if (hi - lo < 2) return `${label} needs a 2-point lead`;
  if (hi > 10 && hi - lo !== 2) return `${label}: past 10 it ends as soon as someone leads by 2`;
  return null;
}

/** A set that was cut short (retirement or default): plausible numbers, not necessarily finished. */
function partialSetProblem(rules, s, n, matchTiebreak) {
  const max = matchTiebreak ? 99 : rules.gamesPerSet + 1;
  if (s.p1 > max || s.p2 > max) return `Set ${n} (${s.p1}-${s.p2}) has more games than a set can`;
  return null;
}

/**
 * Check a result under the match's rules.
 * - COMPLETED: every set legal; the winner reaches ceil(bestOf/2) sets with the last set; no set after that.
 * - RETIRED / DEFAULT: the sets so far are legal, the last may be unfinished, and nobody has won yet.
 *   RETIRED needs at least one set (else it's a walkover).
 * - WALKOVER: no sets at all.
 */
export function validateScore(rules, rawSets, outcome = "COMPLETED") {
  if (!OUTCOMES.includes(outcome)) return fail(`Unknown outcome ${outcome}`);
  const sets = (rawSets ?? []).map((s) => ({ ...s }));
  for (const s of sets) {
    if (![s.p1, s.p2].every((v) => Number.isInteger(v) && v >= 0 && v <= 99)) return fail('Scores must be whole numbers from 0 to 99');
  }
  if (outcome === 'WALKOVER') {
    return sets.length ? fail('A walkover has no score') : { ok: true, winner: null, sets: [] };
  }
  if (outcome === 'RETIRED' && !sets.length) return fail('A retirement happens during play: enter the score so far (or use walkover)');

  const need = Math.ceil(rules.bestOf / 2);
  if (sets.length > rules.bestOf) return fail(`Best of ${rules.bestOf}: at most ${rules.bestOf} sets`);
  const won = [0, 0];
  for (let i = 0; i < sets.length; i++) {
    const s = sets[i];
    const last = i === sets.length - 1;
    if (won[0] === need || won[1] === need) return fail(`The match was already over after set ${i}`);
    // The deciding set is a match tiebreak when the rules say so and the sets are level.
    const deciding = won[0] === need - 1 && won[1] === need - 1;
    const isMTB = rules.decidingSet === 'MATCH_TIEBREAK_10' && rules.bestOf > 1 && deciding;
    s.isMatchTiebreak = isMTB || undefined;
    if (isMTB && s.tb != null) return fail('A match tiebreak has no separate tiebreak points');
    const cutShort = last && outcome !== 'COMPLETED';
    const problem = cutShort
      ? partialSetProblem(rules, s, i + 1, isMTB)
      : isMTB ? matchTiebreakProblem(s, i + 1) : setProblem(rules, s, i + 1);
    if (problem) return fail(problem);
    if (!cutShort) won[s.p1 > s.p2 ? 0 : 1]++;
  }
  if (outcome === 'COMPLETED') {
    if (won[0] < need && won[1] < need) return fail(`The winner needs ${need} set${need > 1 ? 's' : ''}: the score isn't finished (or mark it retired)`);
    return { ok: true, winner: won[0] === need ? 1 : 2, sets };
  }
  // RETIRED / DEFAULT: nobody may already have won, counting a last set that is
  // in fact complete (6-3 6-4 "retired" is just a finished match).
  if (sets.length) {
    const s = sets[sets.length - 1];
    const lastComplete = s.isMatchTiebreak ? !matchTiebreakProblem(s, sets.length) : !setProblem(rules, s, sets.length);
    if (lastComplete) won[s.p1 > s.p2 ? 0 : 1]++;
  }
  if (won[0] >= need || won[1] >= need) return fail('That score is already a finished match: record it as completed');
  return { ok: true, winner: null, sets };
}

/** "7-6(5) 4-6 [10-8]", plus "ret." / "def." / "w/o". */
export function formatScore(sets, outcome = "COMPLETED") {
  if (outcome === 'WALKOVER') return 'w/o';
  const body = (sets ?? []).map((s) =>
    s.isMatchTiebreak ? `[${s.p1}-${s.p2}]` : `${s.p1}-${s.p2}${s.tb != null ? `(${s.tb})` : ''}`).join(' ');
  return outcome === 'RETIRED' ? `${body} ret.` : outcome === 'DEFAULT' ? `${body} def.`.trim() : body;
}
