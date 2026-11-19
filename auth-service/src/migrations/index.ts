// Every migration, in order. Registered explicitly (not by glob) so the same
// list works under ts-node, jest and the compiled dist build.
import { Baseline1763600000000 } from './1763600000000-Baseline';

export const MIGRATIONS = [Baseline1763600000000];
