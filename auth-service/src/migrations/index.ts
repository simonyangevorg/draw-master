// Every migration, in order. Registered explicitly (not by glob) so the same
// list works under ts-node, jest and the compiled dist build.
import { Baseline1763600000000 } from './1763600000000-Baseline';
import { EmailLowercase1763600000100 } from './1763600000100-EmailLowercase';
import { RolesAndClubs1763600000200 } from './1763600000200-RolesAndClubs';
import { RefreshTokens1763600000300 } from './1763600000300-RefreshTokens';

export const MIGRATIONS = [
  Baseline1763600000000,
  EmailLowercase1763600000100,
  RolesAndClubs1763600000200,
  RefreshTokens1763600000300,
];
