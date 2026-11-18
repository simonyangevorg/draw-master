# Draw Master (FPTC): Consolidated Change List

_Date: 2026-11-18 · Baseline: `main` @ `fb0e83e` · Sources: `docs/product/gap-analysis-and-launch-plan.md` (G-/S-/O-/U-/M- IDs) and `docs/product/qa-real-life-test-report.md` (QA-n IDs). Both source docs are unchanged._

**PM code verification for this merge:**
- **Coordinator-confirmed:** QA-1 and QA-2.
- **Confirmed in code by PM:**
  - QA-4: `tournaments.service.ts:148-158` trusts the `isOrganiser` role flag and never checks `t.organiserId`.
  - QA-5: `seededSlots(6)` recurses through 3 → 1.5 and never reaches its base case (`:212-217`); KO match counts are also fractional (`:315-318`).
  - QA-6 and QA-7: `updateMatch` (`:383-401`) never checks `winnerId`, the match participants, or the match status, and advances into the "first empty slot".
  - QA-8: `generateRoundRobin` stores every match as `stage:'KNOCKOUT', round:1` (`:270-276`); `TournamentDetailPage.jsx:284-302` renders everything except Groups as a bracket.
  - QA-9: the false claim is at `frontend/src/components/GroupStageView.jsx:307` (the QA report cites it under `pages/`; it's actually in `components/`).
  - QA-10: games are added up as sets (`stats.service.ts:71-76`), and `tournamentWins` is never incremented.
- **Extra PM finding (folded into C-08):** tournament-service's `JwtGuard` (`tournament-service/src/auth/`) verifies the raw `Authorization` header itself, contrary to CLAUDE.md. Neither it nor the auth-service guard rejects `type:'refresh'` tokens.
  - Through the gateway, a refresh token is currently stopped only by accident. `/auth/validate` calls `res.setHeader('X-User-Email', undefined)`, which throws and falls into the 401 branch (`auth.controller.ts:69-77`).

---

## 1. Executive summary

**Verdict: not launchable, and the live Hostinger site is currently unsafe.** The two source docs together list 60 distinct changes after deduplication. Of those, 22 block launch at some phase (6 now, 8 for the pilot, 3 for the public launch, 5 for Play), 13 are High, 15 Medium and 10 Low.

What blocks it, in order:
1. **The live site can be abused without logging in.**
   - Anyone can create, change or delete player records, fake match results and stats, send phishing notifications to any user, and read anyone's notifications (C-03).
   - Any organiser can withdraw players from tournaments they don't own (C-05).
   - Tournament owners can overwrite status and ownership (C-06).
   - None of this needs anything beyond `curl`.
2. **The core loop breaks after the first match.**
   - Stats and notifications process only one event per service restart (C-01).
   - On a phone the app is unusable, because the sidebar covers every page (C-02). That also blocks the Android app.
3. **A club can't run a real tournament.**
   - No names are shown (C-14), and tournaments never finish (C-15).
   - Scoring can corrupt the bracket (C-16).
   - Round Robin has no standings (C-18).
   - Group → knockout can't progress in the UI (C-19), and some group configurations crash with a 500 (C-20).
4. **The basics of a public product are missing:** brand and honest landing copy, password reset, legal pages, backups, and account deletion (needed for Play).

**Path forward:**
- **Batch 1:** make the live site safe and the event pipeline work. Effort is mostly small items.
- **Batch 2:** make every offered format work end to end, so a pilot club can run a tournament with zero DB edits.
- **Batch 3:** public web launch.
- **Batch 4:** Google Play.
- **Batch 5:** growth backlog.

---

## 2. Deduplicated change table

Sev: **LB** = launch blocker (the phase where it blocks is in brackets), **H** = High, **M** = Medium, **L** = Low. QA "Critical" maps to LB. Effort: S ≤ 1 day, M = 2–5 days, L > 1 week (solo dev). Owner "you" means a product decision, an outside account, or a prod-server action.

| C# | Source IDs | Title | Sev | Area | Effort | Owner | Depends on |
|---|---|---|---|---|---|---|---|
| C-01 | QA-1, QA-10 (part) | RabbitMQ consumers never ack; add idempotency by `matchId` and fix the sets count | LB (now) | stats-service, notification-service | S | backend-architect | — |
| C-02 | QA-2, U-4 (part) | Mobile sidebar covers every app page (CSS source order) | LB (now) | frontend | S | frontend-developer | — |
| C-03 | QA-33, S-1, S-2, S-3 | Anonymous writes on players/stats/notifications; notifications readable by anyone | LB (now) | infra (gateway), player-, stats-, notification-service | S | security-engineer + devops-specialist | — |
| C-04 | S-4 | `JWT_SECRET` falls back to a public default; prod `.env` unverified | LB (now) | auth-service, tournament-service, infra | S | backend-architect + you (prod `.env`) | — |
| C-05 | QA-4 | Any organiser can withdraw participants from any tournament | LB (now) | tournament-service | S | backend-architect | — |
| C-06 | QA-34, S-6 | `PATCH /tournaments/:id` skips validation: status, `organiserId`, bad dates → 500 | H | tournament-service | S | backend-architect | — |
| C-07 | QA-35, S-5 | Any logged-in user can create tournaments via the API | H | tournament-service | S | backend-architect | Q2 (default: organisers only) |
| C-08 | QA-20, PM finding | Refresh token accepted as an access token by both `JwtGuard`s and `/auth/validate` | M | auth-service, tournament-service | S | security-engineer | — |
| C-09 | S-7, QA-25 | Login throttle probably shared site-wide behind the host proxy; register/refresh unthrottled; raw "ThrottlerException" in the UI | H | auth-service, infra, frontend | S | security-engineer + you (proxy topology) | — |
| C-10 | QA-26 | Gateway 301 drops the port; invalid token on a public GET returns an HTML 401 | L | infra (gateway) | S | devops-specialist | — |
| C-11 | O-1 | No database backups or restore drill | LB (now) | infra | S | devops-specialist + you (storage, cron) | — |
| C-12 | O-9 (runbook part), G-3 (stopgap), O-13 (stopgap) | Deploy/rollback runbook, release tags, first-organiser bootstrap, prod data clean-up after C-03 | H | infra / docs | S | devops-specialist + you (run on prod) | C-11 |
| C-13 | O-11, O-6 | Docker log rotation; external uptime monitor | H | infra | S | devops-specialist + you (monitor account) | — |
| C-14 | QA-36, G-1, QA-17 | Show names everywhere; reject unknown or ghost `playerId`s | LB (pilot) | tournament-service, auth-service, frontend | M | backend-architect + frontend-developer | Q5 (walk-in guests) |
| C-15 | QA-32, G-2 | Tournament never completes; no champion; no cancel | LB (pilot) | tournament-service, frontend | M | backend-architect + frontend-developer | C-16, C-18, C-19 |
| C-16 | QA-6, QA-7, G-12a | Score integrity: winner must be a match participant, match must be playable, validate sets and status, bracket-correct slot, safe re-score | LB (pilot) | tournament-service | M | backend-architect | — |
| C-17 | QA-14 | No UI to correct a recorded result | H | frontend | S | frontend-developer | C-16 |
| C-18 | QA-8 | Round Robin rendered as a "FINAL" bracket; no rounds, standings or winner | LB (pilot) | tournament-service, frontend | M | backend-architect + frontend-developer | — |
| C-19 | QA-9, G-11 | Group → knockout can't progress in the UI; false "advance automatically" text | LB (pilot) | tournament-service, frontend | M | backend-architect + frontend-developer | C-20 |
| C-20 | QA-5, QA-12 | Group+KO crashes (500) for 3 or 6 groups, or 3 advancing; groups of 1 player with 0 matches | LB (pilot) | tournament-service, frontend wizard | S–M | backend-architect | — |
| C-21 | QA-37, G-4 (hide), G-5 (hide) | Double Elimination silently becomes Single Elim; Doubles/Mixed have no partner | LB (pilot) | frontend, tournament-service DTO | S | frontend-developer | Q4 |
| C-22 | QA-11, QA-18, QA-21, G-13 (cap part) | Participant state machine: max on approve, no WITHDRAWN → APPROVED, honest counter | H | tournament-service, frontend | S | backend-architect | — |
| C-23 | QA-16, QA-19 | Retirement, walkover and tiebreak points; withdrawing after the draw gives a walkover | H | tournament-service, frontend | M | backend-architect + frontend-developer | C-16 |
| C-24 | QA-31 | No confirm on Generate Draw; draw editable mid-tournament; inconsistent sidebar on the detail page | M | frontend | S | frontend-developer | — |
| C-25 | QA-3, G-3 | In-app path to the organiser role (search + promote) | LB (pilot) | auth-service, frontend | M | backend-architect + frontend-developer | Q2, C-12 (bootstrap) |
| C-26 | QA-13 | Email is case-sensitive: duplicate accounts, failed logins | H | auth-service | S | backend-architect | — |
| C-27 | QA-15 | Seed endpoint has no DTO: `"abc"` → 500, negative or duplicate seeds | M | tournament-service | S | backend-architect | — |
| C-28 | U-1, U-2 | Profane title, FPTC/Draw Master mismatch, landing claims unbuilt features | LB (public) | frontend | S | frontend-developer + you (name) | Q1 |
| C-29 | O-3, S-9 | No email provider, no password reset, no verification, weak passwords accepted | LB (public) | auth-service, frontend | M | backend-architect + you (provider, DNS) | Q3 |
| C-30 | O-4 | No privacy policy, terms or contact page | LB (public) | frontend + legal | S + legal text | frontend-developer + you (text) | Q3 |
| C-31 | G-6 | No public, shareable tournament/bracket view | H | frontend, tournament-service | S–M | frontend-developer | Q6, C-14, C-32 |
| C-32 | G-16, QA-23 | Tournament list shows others' drafts, private, nameless and past events; no filters | H | tournament-service, frontend | S | backend-architect + frontend-developer | — |
| C-33 | G-10 | No UI to edit, cancel or delete a tournament or to assign seeds | M | frontend | S–M | frontend-developer | C-06, C-15, C-27 |
| C-34 | QA-24, QA-22, QA-29, G-13 (deadline) | Input validation: blank or 5000-char names, empty tournament name, cross-field dates, deadline (validate, show, enforce), free max participants for RR/Groups | M | auth-service, tournament-service, frontend | S | backend-architect | — |
| C-35 | U-3, U-5, QA-27, QA-30 | 404 route, post-login → dashboard, human labels for enums, empty-state onboarding | M | frontend | S | ux-architect + frontend-developer | — |
| C-36 | G-15 | Profile is read-only: no name or password change | M | auth-service, frontend | S–M | backend-architect + frontend-developer | C-29 (email change) |
| C-37 | O-7, O-8 | No error tracking or product analytics | M | frontend, all services | S–M | devops-specialist + you (accounts) | Q3 (consent) |
| C-38 | QA-10 (rest) | Stats: corrected results never reversed; `tournamentWins` never set; report endpoint is a stub | M | stats-service, tournament-service | M | backend-architect | C-01, C-15, C-16 |
| C-39 | S-10 | CSP still allows `unsafe-eval`/`unsafe-inline` for the Vite dev server | L | infra (gateway) | S | security-engineer | — |
| C-40 | O-5 | No account deletion or data export (Play requirement) | LB (Play) | auth + all services, frontend | M | backend-architect | C-14 (name snapshots must be anonymised) |
| C-41 | M-3, O-10 | Prod mobile build URL; `http://localhost` origin in CORS | LB (Play) | mobile, infra | S | devops-specialist + you (`.env`) | — |
| C-42 | M-1, M-2, M-5 | Release signing, icons/splash, versioning, R8, `allowBackup` | LB (Play) | mobile | S | devops-specialist + you (keystore custody) | Q1 |
| C-43 | U-4 | Real-device QA: touch bracket, nav, login/refresh, back button | LB (Play) | mobile / QA | S | qa-specialist + you (device) | C-02 |
| C-44 | M-4 | Play Console, listing, Data Safety, rating, closed test (12 testers × 14 days) | LB (Play) | product/legal | M (calendar) | you | C-30, C-40 |
| C-45 | O-2 | `synchronize: true` everywhere; no migrations | H | all services | M | backend-architect | C-11 |
| C-46 | G-7 | Notifications UI; events for approve, reject and draw; email delivery | H | notification-service, frontend | M | backend-architect + frontend-developer | C-01, C-29 |
| C-47 | G-8 | Player profile `/players/:id`, stats, leaderboard | M | frontend, stats-service | M | frontend-developer | C-38 |
| C-48 | G-9 | Match scheduling (time/court) UI and a courts model | M | tournament-service, frontend | M–L | backend-architect + frontend-developer | — |
| C-49 | G-4 (build) | Double Elimination | L | tournament-service, frontend | L | backend-architect | Q4 |
| C-50 | G-5 (build) | Doubles with partner invite | M | tournament-service, frontend | M | backend-architect + frontend-developer | Q4, C-14 |
| C-51 | G-14 | Entry-fee payments | L | product, new integration | L | you → backend-architect | Q7 |
| C-52 | G-17 | Clubs model / multi-club (or hide "Club ID") | L | auth-service, frontend | S hide / L build | you → backend-architect | Q8 |
| C-53 | U-6 | i18n | L | frontend | L | frontend-developer | Q3 |
| C-54 | S-8 | Revocable refresh tokens; role change applies without re-login | M | auth-service | M | security-engineer | — |
| C-55 | O-9 (automation), O-12 | CI deploy over SSH, staging, compose healthchecks, gateway `/health` | M | infra | M | devops-specialist | C-12 |
| C-56 | O-13 | Admin console (users, roles, moderation) | M | auth-service, frontend | M | backend-architect | C-25 |
| C-57 | O-15 | player-service unused by the UI, and its Redis cache unused: keep or retire | L | architecture | — | backend-architect (microservice decision) | — |
| C-58 | QA-28 | Gender and age eligibility on entry | L | tournament-service | S warn / M enforce | you → backend-architect | Q9 |
| C-59 | M-6 | Push notifications | L | mobile, notification-service | L | devops-specialist | C-46 |
| C-60 | O-14 | Stale docs: CLAUDE.md (port 80, raw-JWT convention, profile page); dead `matches` DB; misleading `POSTGRES_MULTIPLE_DATABASES` | L | docs / infra | S | devops-specialist | — |

---

## 3. Implementation batches

Every batch ends with: CI green (unit + integration + E2E), a release tag, a deploy using the C-12 runbook with a pre-deploy dump, and the batch's own probes re-run against prod.

### Batch 1: Critical fixes and live-site security (13 items: C-01 to C-13)
Shippable alone. No product decision is needed except C-07, which defaults to organisers only.

| C# | Concrete fix | Proving test |
|---|---|---|
| C-01 | In `stats.controller.ts:13` and `notifications.controller.ts:12`, add `@Ctx() ctx: RmqContext`. `ack` after a successful handle; on error, `nack(msg, false, false)` to a dead-letter queue declared in `queueOptions` in both `main.ts` files. In stats-service, add a `processed_matches(matchId PK)` table and skip duplicates (this also stops re-score double counting). Fix `stats.service.ts:71-76` to count a set for whoever won more games. After deploy, the prod backlog drains on its own. | Extend `stats.integration.spec.ts` and `notifications.integration.spec.ts`: publish 5 events (one a duplicate `matchId`) and assert 4 processed and the queue empty. Unit: 6-0 6-0 → `setsWon` 2. |
| C-02 | In `frontend/src/index.css`, move the `@media (max-width:768px)` block (`:479-497`) below the base `.sidebar` rule (`:501`), or put the base rule first. Check `.dash-layout` and `main` offset. | New Playwright spec at viewport 375×812: on `/dashboard` and `/tournaments/:id`, `main` top < 200 px and the sidebar height < 100 px. Run in CI. |
| C-03 | Gateway (`api-gateway/nginx.conf`): <ul><li>For `/api/players/` and `/api/notifications/`, return 401 when there is no `Authorization` header on non-GET requests. Simplest fix: make `/auth/validate` return 401 when the token is missing, and add separate public `location`s for the allowed GETs.</li><li>For `/api/stats/`, allow only `GET`; deny `POST` (results arrive via RabbitMQ, so `POST /stats/results` and `/stats/seedings` can be blocked at the gateway, or the routes removed).</li></ul> Services: <ul><li>notification-service `GET /notifications/:recipientId` → 403 unless `X-User-Sub === recipientId`.</li><li>`POST /notifications/notify` is internal only and blocked at the gateway.</li><li>player-service writes require `X-User-Role === 'ORGANISER'`, or block them at the gateway, since the UI never calls them.</li></ul> | Probe script, also kept as `frontend/e2e/security-probes.spec.js` (API-only): anonymous POST/PATCH/DELETE `/api/players`, POST `/api/stats/results`, `/api/stats/seedings`, `/api/notifications/notify` → 401/403; user B GET user A's notifications → 403; user A → 200. |
| C-04 | In `auth-service/src/auth/auth.module.ts:15` and `tournament-service/src/app.module.ts:20`, remove the `||` fallback and throw on boot if `JWT_SECRET` is missing, shorter than 32 characters, or equal to a known placeholder (the dev default or the `.env.example` value). Do the same for the RabbitMQ URL fallback `tennis:tennis_secret` in `stats-service/src/main.ts` and `notification-service/src/main.ts`. You confirm the prod `.env`. | Unit test on the config factory: unset or placeholder → throws. CI `.env` uses a generated secret. |
| C-05 | In `tournaments.service.ts:148-158`, replace the `isOrganiser` parameter with `t.organiserId === requesterId \|\| p.playerId === requesterId`, and drop the role flag in `tournaments.controller.ts:92`. Block withdrawal once the tournament is `COMPLETED`. | `tournaments.service.spec.ts`: organiser B withdraws from A's tournament → `ForbiddenException`; the owner → OK; the player themselves → OK. |
| C-06 | Add `UpdateTournamentDto extends PartialType(OmitType(CreateTournamentDto, [...]))` and use it in `tournaments.controller.ts:51`. Never allow `status`, `organiserId` or `id`. Allow edits only in `DRAFT`/`OPEN` (format fields only in `DRAFT`). Status changes go only through lifecycle endpoints. | Unit/E2E: PATCH `status`, `organiserId` → 400 (forbidNonWhitelisted) or ignored; `startDate:"not-a-date"` → 400, not 500. |
| C-07 | `tournaments.controller.ts:42-47`: require `user.role === 'ORGANISER'` (a small `RolesGuard`). | Unit: MEMBER create → 403; ORGANISER → 201. |
| C-08 | In both `JwtGuard`s and in `/auth/validate`, reject `payload.type === 'refresh'` explicitly (401). Don't rely on the `setHeader(undefined)` throw. | auth-service unit: `/auth/me` with a refresh token → 401; `/auth/validate` with a refresh token → 401. |
| C-09 | Set `trust proxy` to the real hop count (host proxy + gateway = 2), or key the throttler on `X-Real-IP` set by the gateway from the host proxy's `X-Forwarded-For`. Add `@Throttle` to register and refresh, and a `limit_req` zone on `/api/auth/`. In `api.js`, map 429 to "Too many attempts, try again in a minute." You confirm the host proxy forwards `X-Forwarded-For`. | Prod probe: 6 logins from IP A are throttled while IP B still gets 200. Unit: the UI shows the friendly 429 text. |
| C-10 | Add `absolute_redirect off;` to the gateway `server` block, and an `error_page 401 = @json401` that returns `{"message":"Unauthorized"}` with JSON content-type. | curl `GET /api/tournaments` → no redirect with the wrong port; bad token → JSON 401. |
| C-11 | Nightly `docker compose exec -T postgres pg_dumpall \| gzip` to off-server storage with 14-day retention. Script in `infra/backup/`. Do one restore into a scratch container. | Restore drill: row counts in the restored `tournaments` and `auth` DBs match prod. Backup file age < 24 h is checked by the uptime monitor (a heartbeat URL). |
| C-12 | Write `docs/ops/runbook.md` with: <ul><li>Deploy, rollback and the gateway restart from gap doc §4.6.</li><li>First-organiser bootstrap SQL.</li><li>Support SQL: role change and user delete.</li><li>Post-C-03 audit: inspect prod `players`, `player_stats`, `head_to_head` and `notifications` rows created without a matching real event, and delete them. If stats are untrustworthy, truncate the stats tables and re-publish `match.completed` for every completed match through a one-off admin script (safe thanks to C-01 idempotency).</li></ul> | You run one deploy using it; the audit query shows no rows from unknown sources. |
| C-13 | Add `logging: {driver: json-file, options: {max-size: 10m, max-file: "3"}}` to every compose service. Set up an external uptime check on `/` and `/api/tournaments/` that alerts you. | `docker inspect` shows the log options; a test alert reaches your phone. |

**Exit:**
- All C-03 probes return 401/403 on prod.
- 10 consecutive scored matches produce 10 stats updates and 20 notifications.
- The 375 px Playwright check is green.
- A backup has been restored once.
- The prod `.env` is verified free of defaults.
- One deploy was done with the runbook.

### Batch 2: Pilot blockers (14 items: C-14 to C-27)
Goal: one club runs SE, RR and Groups+KO events from signup to champion with zero DB edits.

| C# | Concrete fix | Proving test |
|---|---|---|
| C-14 | <ul><li>Add `playerName` (and `partnerName`) columns to `participant.entity.ts`, filled at enrol time from the JWT `name` (`req.user.name`) on self-enrol.</li><li>For organiser-enrolled players, add an internal-only auth-service endpoint `GET /auth/internal/users/:id`, blocked at the gateway like `/auth/validate`. tournament-service calls it over the Docker network to validate existence and fetch the name; unknown → 400 (fixes QA-17). Add `@IsUUID()` on `EnrollParticipantDto.playerId`.</li><li>One-off backfill script for existing rows.</li><li>Frontend: show `playerName` in `TournamentDetailPage.jsx:357`, the `:406` bracket label, `BracketView.jsx` and `GroupStageView.jsx`, with the seed as a suffix "(1)".</li></ul> | Unit: enrol stores the name; ghost id → 400. Update the Playwright lifecycle spec to assert player display names appear in the participants tab, bracket and group table, and that no UUID fragment does. |
| C-15 | <ul><li>In `updateMatch`: after saving, if the match has no `nextMatchId` and `stage==='KNOCKOUT'` (final), set the tournament to `COMPLETED` with `championParticipantId`.</li><li>For RR: when all matches are complete, compute standings (shared with C-18) and set the champion.</li><li>Add `POST /tournaments/:id/cancel` (from DRAFT/OPEN/IN_PROGRESS) and an organiser "Finish tournament" endpoint for odd cases.</li><li>Emit `tournament.completed` (used by C-38).</li><li>Frontend: champion banner and final standings on the Overview, Completed badge.</li></ul> | Unit: scoring the final sets COMPLETED and the champion; the last RR match does the same. E2E lifecycle spec ends with a "Champion: <name>" assertion. |
| C-16 | In `updateMatch` (`tournaments.service.ts:383-401`): <ul><li>Reject unless the match has both participants and status `SCHEDULED` (or `COMPLETED` when correcting).</li><li>`winnerId` must be in {p1, p2}.</li><li>`UpdateMatchDto`: `@IsIn(['SCHEDULED','COMPLETED'])` for status, plus a nested set DTO with `@IsInt @Min(0)`.</li><li>Validate sets against `setsToWin`/`gamesPerSet`/`tiebreakAt`, allowing a match-tiebreak final set when `finalSetTiebreak`, and require the winner to have won `setsToWin` sets.</li><li>Advance into the slot given by `match.position % 2` (copy `:262-263`).</li><li>Re-score: if the next match is already completed → 409; otherwise replace the previous winner in the next match.</li><li>Emit the event only when the winner or score actually changed.</li></ul> | Unit cases: foreign winner → 400; TBD match → 400; status "FOO" → 400; loser-as-winner with 6-4 6-3 → 400; QF4 before QF3 → QF3 winner in the top slot; re-score changes the SF participant (no duplicate); re-score after the SF is played → 409. |
| C-17 | Make completed `MatchCard`s clickable for the owner while the next match is unplayed; open the score modal prefilled. | Playwright: score with the wrong winner, edit it, and the bracket shows the corrected player in the SF. |
| C-18 | <ul><li>`generateRoundRobin` (`:270-276`): store `stage:'GROUP'` with one group record, and use the circle method for `round` numbers.</li><li>Add a shared `computeStandings(matches)`: wins, sets, games, with head-to-head as the tiebreak.</li><li>`TournamentDetailPage.jsx:284`: route `ROUND_ROBIN` to `GroupStageView` with a single group and no KO section.</li><li>Migrate existing RR draws by script, or leave old ones as-is (test data).</li></ul> | Unit: 5 players → 10 matches across 5 rounds, nobody plays twice in a round; standings order with a tiebreak. Playwright: the RR tab shows a standings table and no "FINAL" heading. |
| C-19 | When the last match in a group completes, fill the KO slots whose `slot1`/`slot2` label matches (`A1`, `B2`…) from `computeStandings`. Add an organiser override that reuses the DrawManager pick/drag on KO cards in `GroupStageView.jsx`. Replace the `:307` text with the real behaviour. | Unit: finishing group A fills the A1 and A2 slots correctly. Playwright: full T3-style 2×4 groups → KO filled with no API calls → champion. |
| C-20 | <ul><li>`generateGroupStage`: `size = nextPow2(totalKO)`, build the KO rounds from `size`, and run `seededSlots(size)` so extra slots are byes for the top qualifiers (auto-advance as SE does).</li><li>Validate before generating: each group ≥ 3 players (or ≥ `advancePerGroup + 1`), and `numberOfGroups × advancePerGroup ≥ 2`.</li><li>The wizard suggests a group count from the expected entries.</li><li>Guard `seededSlots` against non-powers of 2 (throw).</li></ul> | Unit: 3 groups × 2 advancing with 12 players → 8-slot KO with 2 byes, no exception; 6 players / 4 groups → 400 with a message. |
| C-21 | Remove Double Elimination from `CreateTournamentPage.jsx:193` and Doubles/Mixed from `:184-186`. Restrict `create-tournament.dto.ts:43` and the event-type `@IsIn` to the supported values so the API refuses them too. | Unit: DTO rejects `DOUBLE_ELIMINATION`. Playwright: the options are absent. |
| C-22 | <ul><li>`approveParticipant`: require `PENDING`, and approved count < max → else 400.</li><li>`rejectParticipant`: require `PENDING`.</li><li>No approve/reject after the draw.</li><li>Header counter at `TournamentDetailPage.jsx:146,231` shows "approved/max · n pending".</li></ul> | Unit: 9th approval in an 8-max → 400; WITHDRAWN → APPROVED → 400. |
| C-23 | <ul><li>Match `outcome` enum `COMPLETED\|RETIRED\|WALKOVER\|DEFAULT`, plus an optional per-set `tb` (tiebreak points).</li><li>Score modal: RET and W/O buttons, and a tiebreak-points input when a set is 7-6.</li><li>Render "ret." / "w/o" and `7-6(5)`, and `[10-8]` for a match tiebreak.</li><li>Withdrawal after the draw: auto-record a WALKOVER for the opponent in the player's next unplayed match.</li><li>Score validation (C-16) is relaxed for RETIRED/WALKOVER.</li><li>Stats: count W/O as neither a win nor a loss, or flag it in the event.</li></ul> | Unit: RET with a trailing winner accepted only with outcome RETIRED; withdrawal after the draw → opponent advanced with WALKOVER. |
| C-24 | `confirm` step on Generate Draw (inline UI, matching TICKET-027) listing ignored pending entries. Hide the draw "×"/swap controls once any match is COMPLETED, and reject swaps server-side too. Use `Sidebar.jsx` on the detail page. | Playwright: Generate shows a confirm; after the first score, no "×" is visible; `PATCH …/draw/swap` → 400. |
| C-25 | auth-service: `GET /auth/users?email=` (organisers only, exact email match to avoid enumeration) and the existing `PATCH /auth/users/:id/role`. Frontend: "Organisers" page with email search → Promote. Change the `RegisterPage.jsx:106` copy to the real path ("ask your club organiser"). The promoted user refreshes their token on next load: call `/auth/refresh` on app start so the role updates. | Unit: MEMBER calling search → 403. Playwright: organiser promotes user B; B reloads and sees "Create tournament". |
| C-26 | `register.dto.ts` and `login.dto.ts`: `@Transform(trim + toLowerCase)` on email. Migration: lower-case existing rows, resolve duplicate pairs by hand (the QA test DB has one), add a unique index on `lower(email)`. | Unit: register `A@X.test` after `a@x.test` → 409; login with any case → 200. |
| C-27 | Add `AssignSeedDto { @IsInt() @Min(1) seed }`, check `seed ≤ maxParticipants`, unique per tournament, and no seeding after the draw. | Unit: "abc" → 400; duplicate → 400; after draw → 400. |

**Exit:**
- On prod, test organisers run one SE, one RR and one 2×4 Groups+KO tournament through the UI only, using real names, at least one corrected score, one walkover and one retirement.
- Each ends COMPLETED with a champion.
- Stats for the champion show the right wins.
- The pilot organiser was promoted in-app.

### Batch 3: Public web launch (12 items: C-28 to C-39)
Order: C-28 → C-30 → C-29 first, because they have outside lead time; then C-32, C-31, C-33, C-34, C-35, C-36, C-37, C-38, C-39.

| C# | Concrete fix | Proving test |
|---|---|---|
| C-28 | Set the `frontend/index.html:6` title and favicon, the logo `alt`, and the landing `FEATURES` (`LandingPage.jsx:5-26`) to the chosen brand and real features only. | Playwright: title equals the brand; no "Live Stats"/"Notifications" copy until those features ship. |
| C-29 | Add a mail module (provider SDK or SMTP) in auth-service. Add `POST /auth/forgot` (always 200) and `POST /auth/reset` with a single-use hashed token that expires after 1 h. Wire up the `LoginPage.jsx:80` link and add a reset page. Raise the password minimum to 8 and block the top-N common passwords. Optional: email verification gating tournament entry. | Unit: token single-use and expiry. Manual: a reset email arrives on the prod domain and passes SPF/DKIM. |
| C-30 | Add `/privacy`, `/terms` and `/contact` routes with static content. Link them from the landing footer, the register page (plus a consent checkbox) and the sidebar. | Playwright: the links resolve. |
| C-31 | Public routes `/t/:id` rendering a read-only overview, draw and standings without `PrivateRoute`; the API GETs are already public. Add a Share button. Respect `isPublic`. | Playwright (logged out): `/t/:id` renders the bracket with names; a private tournament → 404. |
| C-32 | `findAll`: return `OPEN/IN_PROGRESS/COMPLETED` and `isPublic`, plus the caller's own drafts. Add query params `status`, `mine` and `from`. Add filter tabs on `TournamentsPage.jsx` (Open, Upcoming, Mine, Past) and a search box. | Unit: another organiser's DRAFT isn't returned. Playwright: tabs filter. |
| C-33 | Organiser actions on the detail page: Edit (DRAFT/OPEN, via the C-06 DTO), Cancel (C-15), Delete (DRAFT only), and a Seeds editor (C-27). | Playwright: edit the name, cancel → badge Cancelled. |
| C-34 | <ul><li>`@Transform(trim) @IsNotEmpty() @MaxLength(100)` on user and tournament names.</li><li>Cross-field validators: end ≥ start, deadline ≤ start, min ≤ max, start not in the past on create.</li><li>Enforce the deadline in `enroll`.</li><li>Show the deadline on the Overview.</li><li>Allow max participants 2–128 for RR/Groups (keep powers of 2 optional for SE).</li></ul> | Unit cases for each validator; enrol after the deadline → 400. |
| C-35 | `<Route path="*">` 404 page. `LoginPage.jsx:27` / `RegisterPage.jsx:56` → `/dashboard` (or the `from` location). Use the `constants.js` label maps in the wizard summary and Overview. Dashboard empty state with "Browse tournaments" and how to become an organiser. | Playwright: unknown URL → 404; after login the URL is `/dashboard`; no `HARD_OUTDOOR` text. |
| C-36 | auth-service `PATCH /auth/me` (name) and `POST /auth/me/password` (needs the current password). Editable profile form. | Unit plus Playwright. |
| C-37 | Error tracking SDK in the frontend and the five services (env-gated DSN). Privacy-friendly analytics with events: signup, tournament_created, draw_generated, match_scored, tournament_completed. | A deliberate test error appears in the tracker; the event shows in the analytics dashboard. |
| C-38 | Stats upsert per `matchId` storing the full result; on a corrected result, reverse the old one and apply the new (C-01 laid the table). Consume `tournament.completed` to increment `tournamentWins`. Implement or remove the report stub. | Integration: a corrected winner flips the wins/losses counts; a champion gets `tournamentWins` 1. |
| C-39 | Remove `unsafe-eval`, `ws:` and (if the build allows) `unsafe-inline` from the gateway CSP (`nginx.conf:32-33`). | Manual: the prod app loads with no CSP console errors. |

**Exit:** the gap doc §4.5 pre-launch checklist is fully ticked, and the pilot tournament (Batch 2 exit) has completed with real players.

### Batch 4: Android / Google Play (6 items: C-40 to C-45)
| C# | Concrete fix | Proving test |
|---|---|---|
| C-40 | `DELETE /auth/me` → publish `user.deleted`. Each service anonymises or deletes its data: participants → `playerName` "Deleted player" (keep bracket integrity), stats, notifications. Add a web page `/account/delete` usable without the app. Optional JSON export. | Integration: after deletion, no rows reference the user except anonymised participants; login → 401. |
| C-41 | Build the mobile bundle with `VITE_API_BASE_URL=https://<domain>`. Add `http://localhost` to prod `ALLOWED_ORIGINS` and the gateway CORS map. Document this in `mobile/README.md`. | Emulator against prod: register, login, refresh. |
| C-42 | Signing config reading from env or a keystore file outside git; `versionCode` policy (CI build number); `minifyEnabled true` with Capacitor keep rules; brand icons and splash via `@capacitor/assets`; `allowBackup="false"` (or exclude WebView storage). | Signed release AAB installs and passes a smoke test; `bundletool validate`. |
| C-43 | Device test pass on 2 or more physical phones following the gap doc's list. | Written pass/fail sheet in `docs/product/`. |
| C-44 | You: Play Console account, listing, Data Safety form, content rating, privacy and deletion URLs, closed test. | Play production approval. |
| C-45 | Switch TypeORM to migrations per service (`synchronize: false`), generate the baseline from the current schema, run migrations on boot. | CI: a fresh DB plus migrations equals the entity schema; deploying to a prod copy shows no diff. |

**Exit:** Play production approved; login, enter and score work on 2 physical devices against prod; the deletion URL works.

### Batch 5: Growth backlog (15 items: C-46 to C-60)
Not a single shippable batch. Prioritise from pilot feedback. Suggested order: C-46 notifications → C-47 profiles/leaderboard → C-48 scheduling → C-55 CI deploy/staging → C-54 tokens → C-50 doubles → C-56 admin → C-49 DE → C-58 eligibility → C-52 clubs → C-51 payments → C-59 push → C-53 i18n → C-57 → C-60 (do C-60 any time; it's 30 minutes). iOS sits here too: it needs a Mac or cloud runner plus an Apple account.

---

## 4. Decisions only you can make

1. **Q1 Brand:** "Draw Master" or something else. Blocks C-28 and C-42.
2. **Q2 Who may organise:** organisers only (Batch 1 enforces this by default) or anyone self-serve. Also, who is the first prod organiser?
3. **Q3 Market and legal:** which country or countries and which legal entity. This sets GDPR scope, the privacy and terms text, the consent and analytics approach, language, and the email provider and sending domain.
4. **Q4 Formats for the pilot:** confirm Double Elimination and Doubles/Mixed stay hidden until Batch 5.
5. **Q5 Walk-in players:** may organisers add people without an account (name-only guests)? If yes, C-14 adds a guest flow; if no, every entrant must register.
6. **Q6 Spectators:** public shareable brackets by default, or members only (C-31)?
7. **Q7 Money:** entry fee informational only for launch (recommended), or in-app payments?
8. **Q8 Single club or multi-club:** decides whether "Club ID" is hidden (S) or becomes a clubs model (L).
9. **Q9 Eligibility:** enforce gender and age on entry, or just warn?
10. **Pilot:** which club and tournament, and roughly when, so Batch 2 has a target.

Also needed from you, beyond decisions:
- Prod SSH access: verify the `.env`, run the C-12 data audit, and set up the backup cron and storage.
- Uptime and error-tracker accounts.
- Email provider and DNS.
- Legal text.
- Play Console account and keystore custody.

---

## 5. Launch plan update (supersedes the phases in the gap doc §4 where they differ)

| Phase | Was | Now | Why it changed |
|---|---|---|---|
| 0 Harden live | S-1–S-4, backups, runbook, rate limit, logs, uptime, bootstrap | **Batch 1.** Adds C-01 (events), C-02 (mobile CSS), C-05 (cross-organiser withdraw), C-06/C-07 (moved up from Phase 1), C-08, C-10, plus a prod data audit for forged rows. | QA proved the event pipeline and phone layout are broken on the live site right now, and found a new authorisation hole. |
| 1a Pilot | Part of Phase 1 | **Batch 2.** Much larger than the gap doc assumed: RR standings, Group → KO progression, the group draw crash, retirement/walkover, the participant state machine and score correction are all new pilot blockers. | QA showed that only Single Elimination works end to end. Shortcut if the pilot is SE-only: C-14, C-15 (KO part), C-16, C-17, C-21, C-22, C-24, C-25 are enough to start, and C-18/C-19/C-20/C-23 follow. |
| 1b Public web | Rest of Phase 1 | **Batch 3.** Brand, legal, password reset, public view, list filtering, edit/cancel UI, validation, error tracking. | Split out so the pilot isn't held up by outside lead times (email DNS, legal text). Start those user tasks during Batch 1. |
| 2 Android | Phase 2 | **Batch 4.** Unchanged, but do a 15-minute device smoke right after C-02 ships instead of waiting. | U-4's "untested" risk turned out to be a real Critical (QA-2). |
| 3 Growth | Phase 3 | **Batch 5.** Unchanged list, plus C-38's stats correctness becomes a prerequisite for leaderboards (C-47). | QA-10. |

**New cross-cutting rule:** each batch adds the regression tests listed above. CI E2E gains a 375 px viewport project and the API security-probe spec. The existing CI let QA-1 and QA-2 through because no test scored more than one match against a running consumer and nothing ran at phone width.
