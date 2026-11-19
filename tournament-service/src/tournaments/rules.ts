/**
 * Match rules (F-05). A rule set describes how one match is played; an event
 * holds one per stage: group (round robin and group stage), knockout, and an
 * optional override for the final.
 */
export type DecidingSet = 'FULL' | 'MATCH_TIEBREAK_10';

export interface RuleSet {
  bestOf: 1 | 3 | 5;
  gamesPerSet: 4 | 6 | 8;          // 8 = pro set
  tiebreakAt: number;              // games-all at which a set is decided by a tiebreak
  decidingSet: DecidingSet;        // the last set: a full set, or a match tiebreak to 10
  noAd: boolean;
}

export const DEFAULT_RULES: RuleSet = { bestOf: 3, gamesPerSet: 6, tiebreakAt: 6, decidingSet: 'FULL', noAd: false };

/** The built-in presets every club can pick (seeded by the MatchRules migration). */
export const BUILT_IN_PRESETS: { name: string; rules: RuleSet }[] = [
  { name: 'Best of 3, full sets', rules: { bestOf: 3, gamesPerSet: 6, tiebreakAt: 6, decidingSet: 'FULL', noAd: false } },
  { name: 'Best of 3, match tiebreak to 10', rules: { bestOf: 3, gamesPerSet: 6, tiebreakAt: 6, decidingSet: 'MATCH_TIEBREAK_10', noAd: false } },
  { name: '1 set to 6', rules: { bestOf: 1, gamesPerSet: 6, tiebreakAt: 6, decidingSet: 'FULL', noAd: false } },
  { name: '2 short sets to 4, match tiebreak', rules: { bestOf: 3, gamesPerSet: 4, tiebreakAt: 4, decidingSet: 'MATCH_TIEBREAK_10', noAd: true } },
  { name: '8-game pro set', rules: { bestOf: 1, gamesPerSet: 8, tiebreakAt: 8, decidingSet: 'FULL', noAd: false } },
];

/** Sets needed to win a match under these rules. */
export const setsToWin = (r: RuleSet) => Math.ceil(r.bestOf / 2);

/** Problems with a rule set, in words; empty when it's playable. */
export function ruleProblems(r: RuleSet): string[] {
  const problems: string[] = [];
  if (r.tiebreakAt < 1 || r.tiebreakAt > r.gamesPerSet) problems.push(`tiebreakAt must be between 1 and ${r.gamesPerSet}`);
  if (r.bestOf === 1 && r.decidingSet === 'MATCH_TIEBREAK_10') problems.push('a one-set match has no deciding set to replace with a match tiebreak');
  return problems;
}

/** Fills in what a client left out (tiebreakAt follows gamesPerSet). */
export function normaliseRules(r: Partial<RuleSet> | null | undefined, fallback: RuleSet = DEFAULT_RULES): RuleSet {
  const gamesPerSet = (r?.gamesPerSet ?? fallback.gamesPerSet) as RuleSet['gamesPerSet'];
  return {
    bestOf: (r?.bestOf ?? fallback.bestOf) as RuleSet['bestOf'],
    gamesPerSet,
    tiebreakAt: r?.tiebreakAt ?? (r?.gamesPerSet ? gamesPerSet : fallback.tiebreakAt),
    decidingSet: r?.decidingSet ?? fallback.decidingSet,
    noAd: r?.noAd ?? fallback.noAd,
  };
}

/** The pre-F-05 rule fields (setsToWin ...) as a rule set. */
export function legacyRules(f: { setsToWin?: number; gamesPerSet?: number; tiebreakAt?: number; finalSetTiebreak?: boolean; noAd?: boolean }): RuleSet | null {
  if ([f.setsToWin, f.gamesPerSet, f.tiebreakAt, f.finalSetTiebreak, f.noAd].every((v) => v === undefined)) return null;
  const bestOf = (f.setsToWin ? f.setsToWin * 2 - 1 : 3) as RuleSet['bestOf'];
  return normaliseRules({
    bestOf,
    gamesPerSet: f.gamesPerSet as RuleSet['gamesPerSet'],
    tiebreakAt: f.tiebreakAt,
    decidingSet: f.finalSetTiebreak && bestOf > 1 ? 'MATCH_TIEBREAK_10' : 'FULL',
    noAd: f.noAd,
  });
}

/** Which of an event's rule sets a match is played under. */
export type RulesStage = 'GROUP' | 'KNOCKOUT' | 'FINAL';

export function rulesStageOf(
  event: { drawFormat: string },
  match: { stage: string; nextMatchId?: string | null },
): RulesStage {
  if (event.drawFormat === 'ROUND_ROBIN' || match.stage === 'GROUP') return 'GROUP';
  return match.nextMatchId ? 'KNOCKOUT' : 'FINAL';
}

/** The rules for one match: the final uses its override when there is one. */
export function rulesFor(
  event: { drawFormat: string; groupRules: RuleSet; knockoutRules: RuleSet; finalRules?: RuleSet | null },
  match: { stage: string; nextMatchId?: string | null },
): RuleSet {
  const stage = rulesStageOf(event, match);
  if (stage === 'GROUP') return event.groupRules;
  if (stage === 'FINAL') return event.finalRules ?? event.knockoutRules;
  return event.knockoutRules;
}
