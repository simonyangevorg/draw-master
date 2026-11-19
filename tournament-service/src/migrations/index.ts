// Every migration, in order. Registered explicitly (not by glob) so the same
// list works under ts-node, jest and the compiled dist build.
import { Baseline1763600000000 } from './1763600000000-Baseline';
import { MatchNextSlot1763600000100 } from './1763600000100-MatchNextSlot';
import { ClubAccess1763600000200 } from './1763600000200-ClubAccess';
import { Events1763600000300 } from './1763600000300-Events';
import { MatchRules1763600000400 } from './1763600000400-MatchRules';
import { MatchOutcome1763600000500 } from './1763600000500-MatchOutcome';

export const MIGRATIONS = [
  Baseline1763600000000,
  MatchNextSlot1763600000100,
  ClubAccess1763600000200,
  Events1763600000300,
  MatchRules1763600000400,
  MatchOutcome1763600000500,
];
