// F-06: run the frontend score validator against the API's fixture file.
// node frontend/scripts/check-score-rules.mjs  (CI runs it)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { validateScore, formatScore } from '../src/scoreRules.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = JSON.parse(readFileSync(path.join(here, '../../tournament-service/src/tournaments/score-fixtures.json'), 'utf8'));
const toSets = (rows) => rows.map(([p1, p2, tb, mtb]) => ({ p1, p2, ...(tb != null ? { tb } : {}), ...(mtb ? { isMatchTiebreak: mtb } : {}) }));

let failed = 0;
fixtures.cases.forEach((c, i) => {
  const r = validateScore(fixtures.rules[c.rules], toSets(c.sets), c.outcome ?? 'COMPLETED');
  const good = r.ok === c.ok && (c.ok ? r.winner === c.winner : (r.error ?? '').includes(c.error));
  if (!good) { failed++; console.error(`case ${i} failed:`, JSON.stringify(c), '->', JSON.stringify(r)); }
});
for (const f of fixtures.formats) {
  const text = formatScore(toSets(f.sets), f.outcome);
  if (text !== f.text) { failed++; console.error(`format failed: got "${text}", want "${f.text}"`); }
}
console.log(`${fixtures.cases.length + fixtures.formats.length - failed}/${fixtures.cases.length + fixtures.formats.length} score fixtures agree with the API`);
process.exit(failed ? 1 : 0);
