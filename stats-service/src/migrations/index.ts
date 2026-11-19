// Every migration, in order. Registered explicitly (not by glob) so the same
// list works under ts-node, jest and the compiled dist build.
import { Baseline1763600000000 } from './1763600000000-Baseline';
import { ProcessedEventPayload1763600000100 } from './1763600000100-ProcessedEventPayload';

export const MIGRATIONS = [
  Baseline1763600000000,
  ProcessedEventPayload1763600000100,
];
