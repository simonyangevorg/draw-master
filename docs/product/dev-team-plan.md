# DrawMaster: Dev-Team Implementation Plan

_Date: 2026-11-18 · Baseline: `main` @ `fb0e83e` · Built from: `consolidated-change-list.md` (C-nn), `qa-real-life-test-report.md` (QA-n), and the user's product decisions of 2026-11-18. Source docs are unchanged. Specialist briefs: `avengers-team/*.md`._

## 0. Product decisions this plan implements

- **Brand:** the product is **DrawMaster** (one word). **FPTC** is the first club on the platform, not the product.
- **Multi-club platform with three roles:**
  - **Super-admin:** platform level; opens clubs and appoints club admins.
  - **Club admin:** per club; a club can have several. Creates and runs tournaments, and replaces today's `ORGANISER`.
  - **Player.**
- **Joining clubs:** open signup, then a player applies to join a club and a club admin approves or rejects.
- **Guests and invites:**
  - Club admins can add name-only **guest entrants** (no account, stats or notifications).
  - Club admins can **invite any registered user** to a tournament without making them a club member.
- **Visibility:** tournaments are visible to club members by default; a club admin can make one **public**.
- **Fees:** entry fees are informational only.
- **Eligibility:** gender is enforced (men's, women's, mixed, mixed doubles). There are no age rules.
- **Launch scope:**
  - **Web only** and English only. Android is in Appendix A.
  - Legal text uses generic GDPR-safe defaults until a jurisdiction is chosen.
- **Formats at launch:** **all** formats must work: Single Elimination, Round Robin, Group Stage + Knockout, Double Elimination, and doubles including mixed doubles.
- **Events and rules:**
  - A tournament contains several **events**.
  - **Match rules** are configurable per stage, and clubs can save presets.

Items marked **ASSUMPTION** are defaults the user hasn't confirmed explicitly; §7 lists them.

## 1. Architecture choices (needed before anyone codes)

Owner: microservice-architect. Each choice is reversible before Sprint 2 ends.

1. **Clubs, memberships and roles live in auth-service.** auth-service already owns identity and is the token issuer.
   - No new microservice. player-service is unused by the UI (O-15); it gets blocked at the gateway and retired (L-18).
   - No cross-service DB access: other services learn about club roles from token claims only.
2. **The access token carries the club claims.**
   - `role` is `SUPER_ADMIN | PLAYER`.
   - `clubs` holds up to about 20 entries, each `{id, role: ADMIN|MEMBER}`.
   - The gateway forwards them as `X-User-Role` and a new `X-User-Clubs` header (compact `id:A,id:M`).
   - Services authorise from these headers, which matches CLAUDE.md. The tournament-service `JwtGuard` that re-verifies the raw JWT is replaced by a header-reading guard (see B-08).
   - Membership or role changes take effect on the next token refresh. The frontend refreshes on app load and after any membership action, and access-token TTL drops from 1 h to 15 min (L-17).
3. **Tournament data owns its own copies of names.**
   - Entries store display names and genders as snapshots, so tournament-service never calls auth-service at read time.
   - For writes that reference another user (invite, admin-formed pair), tournament-service calls an internal-only auth-service lookup, `GET /auth/internal/users/:id` and `?email=`, which is blocked at the gateway like `/auth/validate`.
4. **Migrations come before the model changes.**
   - `synchronize: true` is turned off and baseline migrations are generated (L-01) before any entity in §5 changes.
   - Every model change ships as a reviewed migration together with its data back-fill.

---

## 2. Chunk 1: Existing bugs (21 tasks)

Everything broken today. Ordered by risk. B-01 to B-08 are the live-site emergency set (Sprint 0).

### B-01 Close anonymous access on players, stats and notifications (C-03, QA-33, S-1/2/3)
- **Problem:** without logging in, anyone can create, change or delete player records, forge match results and seedings, send notifications to any user, and read anyone's notifications.
- **Acceptance:**
  - Anonymous `POST/PATCH/DELETE /api/players*` → 401.
  - Any `POST /api/stats/*` from outside → 403.
  - `POST /api/notifications/notify` from outside → 403.
  - `GET /api/notifications/:id` → 403 unless it is the caller's own id.
- **Approach:**
  - `api-gateway/nginx.conf`:
    - In the `/api/stats/` location, allow only `GET` (`limit_except GET { deny all; }`). Results arrive via RabbitMQ.
    - Add an exact `location = /api/notifications/notify { return 403; }`.
    - Deny non-GET methods on `/api/players/`; the UI never calls them, and the service is retired in L-18.
  - notification-service, `notifications.controller.ts:50`: compare `@Headers('x-user-sub')` with `recipientId`; missing → 401, mismatch → 403. Add a `GET /notifications/me` alias for the UI.
- **Owner:** security-engineer + devops-specialist · **Effort:** S · **Depends:** —
- **Test:** new API spec `frontend/e2e/security-probes.spec.js` runs the anonymous and cross-user probes above. notification-service unit test for the header check.

### B-02 Event consumers stall after one message; stats double-count (C-01, QA-1, QA-10 part)
- **Problem:** stats and notification consumers never ack, so only the first `match.completed` per restart is processed. Stats add up games as sets, and re-scores count twice.
- **Acceptance:**
  - N events published → N handled, and the queue drains to 0 ready / 0 unacked.
  - A duplicate `matchId` is ignored.
  - 6-0 6-0 → `setsWon` 2.
- **Approach:**
  - `stats-service/src/stats/stats.controller.ts:13` and `notification-service/src/notifications/notifications.controller.ts:12`: add `@Ctx() ctx: RmqContext`. Ack on success. On failure, `nack(msg,false,false)` to a dead-letter queue declared via `queueOptions.arguments` in both `main.ts` files.
  - stats-service: new `processed_events(matchId PK, payload jsonb)` table; skip if the `matchId` is present.
  - `stats.service.ts:71-76`: award each set to whichever side won more games.
  - Prod's queued backlog then drains automatically.
- **Owner:** backend-architect · **Effort:** S · **Depends:** —
- **Test:** extend `stats.integration.spec.ts` and `notifications.integration.spec.ts`: publish 5 events including a duplicate, assert 4 processed and the queue empty. Unit test for the set count.

### B-03 Sidebar covers every app page at phone width (C-02, QA-2)
- **Problem:** at 768 px or narrower, the `@media` override (`frontend/src/index.css:479-497`) sits before the base `.sidebar` rule (`:501`), so the base rule wins. The dashboard and tournament pages are unusable on phones.
- **Acceptance:** at 375 × 812 the nav is a single top bar under 100 px tall, and the page content starts below it on every authenticated page.
- **Approach:** move the media block after the base `.sidebar` rule. Audit the other two 768 px blocks (`:146`, `:305`) for the same ordering problem.
- **Owner:** frontend-developer · **Effort:** S · **Depends:** —
- **Test:** add a Playwright project with a `375x812` viewport to the E2E config. Spec: on `/dashboard`, `/tournaments` and `/tournaments/:id`, `main` top < 120 px.

### B-04 Fail fast on missing or placeholder secrets (C-04, S-4)
- **Problem:** if `JWT_SECRET` is unset, both token issuer and verifier fall back to a public string (`auth-service/src/auth/auth.module.ts:15`, `tournament-service/src/app.module.ts:20`). RabbitMQ URLs fall back to `tennis:tennis_secret` (`stats-service/src/main.ts`, `notification-service/src/main.ts`).
- **Acceptance:** a service refuses to start when `JWT_SECRET` is missing, shorter than 32 characters, or equals the dev default or the `.env.example` placeholder. No credential fallbacks remain in code.
- **Approach:** a small `requireEnv()` helper copied into each service (no shared packages, per convention). The user verifies the prod `.env`.
- **Owner:** backend-architect + **user** (prod `.env`) · **Effort:** S · **Depends:** —
- **Test:** unit test of the helper. The CI `.env` uses a generated secret.

### B-05 Any organiser can withdraw players from tournaments they don't own (C-05, QA-4)
- **Problem:** `tournaments.controller.ts:92` passes `role === 'ORGANISER'` as "isOrganiser", and `tournaments.service.ts:148-158` trusts it.
- **Acceptance:** only the tournament's managers (today the owner; after L-06, the club's admins) or the player themselves can withdraw an entry. Anyone else → 403.
- **Approach:** compute `isOwner = t.organiserId === requesterId` in the service and drop the controller flag.
- **Owner:** backend-architect · **Effort:** S · **Depends:** —
- **Test:** `tournaments.service.spec.ts`: a foreign organiser → `ForbiddenException`; owner and self → OK.

### B-06 PATCH tournament bypasses validation (C-06, QA-34, S-6)
- **Problem:** `Partial<CreateTournamentDto>` (`tournaments.controller.ts:51`) skips the ValidationPipe, so an owner can set `status: "BANANA"`, give the tournament to another user, or trigger a 500 with a bad date.
- **Acceptance:**
  - `status`, `organiserId`, `clubId` and `id` can't be changed via PATCH.
  - Invalid fields → 400.
  - Format fields are editable only in DRAFT; descriptive fields in DRAFT/OPEN.
- **Approach:** `UpdateTournamentDto = PartialType(OmitType(CreateTournamentDto, [...]))` from `@nestjs/mapped-types`. Turn on `forbidNonWhitelisted` in tournament-service's ValidationPipe.
- **Owner:** backend-architect · **Effort:** S · **Depends:** —
- **Test:** unit tests for each QA-34 probe → 400.

### B-07 Players can create tournaments via the API (C-07, QA-35, S-5)
- **Problem:** `POST /tournaments` checks only that a token exists.
- **Acceptance:** non-organisers → 403. After L-06 the rule becomes: you must be an admin of the target `clubId`.
- **Approach:** a `RolesGuard` reading `X-User-Role` now, swapped for the club-admin check in L-06.
- **Owner:** backend-architect · **Effort:** S · **Depends:** —
- **Test:** unit test: a MEMBER → 403.

### B-08 Refresh token works as an access token; tournament-service verifies the raw JWT (C-08, QA-20)
- **Problem:** neither `JwtGuard` rejects `type:'refresh'`. `/auth/me` returns a profile for a refresh token. The gateway only blocks it by accident: `res.setHeader(..., undefined)` throws in `auth.controller.ts:69-77`.
- **Acceptance:**
  - Refresh tokens → 401 on `/auth/me`, `/auth/validate` and every guarded route.
  - `/auth/validate` never sets undefined headers.
  - tournament-service authorises from `X-User-*` headers.
- **Approach:**
  - Check `payload.type !== 'refresh'` explicitly.
  - Rewrite `tournament-service/src/auth/jwt.guard.ts` to require `x-user-sub` and fill `req.user` from the headers. The gateway already strips client-supplied values.
  - Remove `JwtModule` from tournament-service, which also removes its secret fallback.
- **Owner:** security-engineer · **Effort:** S · **Depends:** —
- **Test:** auth-service unit tests. tournament-service guard unit test: headers present → user; absent → 401.

### B-09 Scoring corrupts the bracket (C-16, QA-6, QA-7, G-12a)
- **Problem:** `updateMatch` (`tournaments.service.ts:383-401`) has no integrity checks:
  - It accepts a winner who isn't in the match, scores for TBD matches, and any status string.
  - It accepts a loser picked as winner.
  - It advances into the "first empty slot" rather than the bracket position.
  - A re-score pushes a second winner into the next match.
- **Acceptance:**
  - Scoring requires both participants and status `SCHEDULED`.
  - `winnerId` ∈ {p1, p2}, and the winner has more sets than the opponent.
  - Status is limited to an enum.
  - The winner goes into slot `position % 2`.
  - A re-score replaces the earlier winner in the next match, or returns 409 if the next match has been played.
  - Events are emitted only when the result changes.
- **Approach:**
  - Nested `SetScoreDto` (`@IsInt @Min(0)`) in `update-match.dto.ts`.
  - Reuse the BYE slot logic at `:262-263`, and store `nextSlot` explicitly on the match (see §5).
  - Rule-aware set validation (6-5 is invalid, and so on) arrives with F-06. This task only enforces structure and the winner.
- **Owner:** backend-architect · **Effort:** M · **Depends:** —
- **Test:** unit cases from QA-6 (a–d) and QA-7, plus re-score before and after the next match is played.

### B-10 Group+KO draw crashes or builds empty groups (C-20, QA-5, QA-12)
- **Problem:**
  - `seededSlots(6)` recurses forever (`:212-217`) for 3 or 6 groups, or for 3 qualifiers per group, giving a 500.
  - Fractional KO match counts (`:315-318`).
  - With 6 players and the default 4 groups, two groups have one player and no matches.
- **Acceptance:**
  - Any valid configuration generates a draw. The KO bracket is padded to the next power of two, with byes for the top qualifiers.
  - An invalid configuration (fewer than 3 per group, or fewer than `advancePerGroup + 1`) → 400 with a clear message.
- **Approach:**
  - `size = nextPow2(totalKO)` and build the KO rounds from `size`.
  - Mark unfilled slot labels as `BYE` so the bye auto-advances once the group finishes (wired in F-09).
  - `seededSlots` throws on input that isn't a power of two.
  - The wizard suggests a group count.
- **Owner:** backend-architect · **Effort:** S · **Depends:** —
- **Test:** unit tests: 12 players / 3 groups / 2 advance → 8-slot KO with 2 byes; 6 players / 4 groups → 400.

### B-11 Participant state machine and capacity (C-22, QA-11, QA-18, QA-21)
- **Problem:** approvals ignore the maximum (9 approved for 8 places), withdrawn entries can be re-approved, and the header shows "11/8" because it counts every row.
- **Acceptance:**
  - Only PENDING → APPROVED or REJECTED.
  - Approval is refused at the maximum.
  - No approve or reject after the draw.
  - The counter shows "approved/max · n pending".
- **Approach:** guards in `approveParticipant`/`rejectParticipant`; counter at `TournamentDetailPage.jsx:146,231`.
- **Owner:** backend-architect + frontend-developer · **Effort:** S · **Depends:** —
- **Test:** unit tests for each transition, plus the 9th-approval case.

### B-12 Email is case-sensitive (C-26, QA-13)
- **Problem:** `Luca.Bianchi@…` creates a second account, and logging in with different casing fails.
- **Acceptance:** emails are trimmed and lower-cased on register and login, and there is a unique index on `lower(email)`.
- **Approach:**
  - `@Transform` in `register.dto.ts` and `login.dto.ts`.
  - A migration lower-cases existing rows. It aborts and lists collisions, which the user resolves by hand.
- **Owner:** backend-architect · **Effort:** S · **Depends:** L-01
- **Test:** unit tests: a duplicate in different case → 409; login with any casing → 200.

### B-13 Seed endpoint has no DTO (C-27, QA-15)
- **Problem:** `@Body('seed')` (`tournaments.controller.ts:97`): `"abc"` → 500, and negative or duplicate seeds are accepted.
- **Acceptance:** seeds are integers from 1 to the entry maximum, unique within an event, and locked after the draw.
- **Approach:** `AssignSeedDto`.
- **Owner:** backend-architect · **Effort:** S · **Depends:** —
- **Test:** unit tests for the three failure cases.

### B-14 Weak input validation (C-34, QA-24, QA-22, G-13)
- **Problem:** whitespace-only and 5000-character names, empty tournament names, end before start, minimum above maximum, past dates, and a deadline after the start are all accepted. The deadline is neither enforced nor displayed.
- **Acceptance:**
  - All of the above → 400.
  - Entering after the deadline → 400.
  - The deadline is shown on the Overview.
- **Approach:**
  - `@Transform(trim) @IsNotEmpty() @MaxLength(100)` on names.
  - A custom class-validator for cross-field rules on the tournament DTO.
  - A deadline check in `enroll`.
- **Owner:** backend-architect · **Effort:** S · **Depends:** —
- **Test:** one unit test per rule.

### B-15 Login throttle keyed on the proxy, and raw throttler text in the UI (C-09, S-7, QA-25)
- **Problem:**
  - `trust proxy 1` (`auth-service/src/main.ts:7`) behind host proxy plus gateway probably puts every client in one site-wide bucket of 5 logins per minute.
  - Register and refresh aren't throttled.
  - The UI shows "ThrottlerException".
- **Acceptance:**
  - Throttling is per real client IP.
  - Register and refresh are limited.
  - Nginx applies `limit_req` on `/api/auth/`.
  - The UI shows "Too many attempts, try again in a minute."
- **Approach:**
  - Set `trust proxy` to the real hop count once the user confirms the host-proxy topology.
  - Map 429 in `frontend/src/api.js`.
- **Owner:** security-engineer + **user** (proxy topology) · **Effort:** S · **Depends:** —
- **Test:** prod probe from two IPs. Unit test for the 429 mapping.

### B-16 Gateway redirect drops the port; HTML 401 (C-10, QA-26)
- **Acceptance:** `GET /api/tournaments` (no trailing slash) works or redirects to the same origin; every 401 is JSON.
- **Approach:** `absolute_redirect off;` and `error_page 401 = @json401`.
- **Owner:** devops-specialist · **Effort:** S · **Depends:** —
- **Test:** curl checks added to the CI smoke step.

### B-17 Double Elimination and Doubles silently degrade (C-21, QA-37)
- **Problem:** Double Elimination produces a Single Elim draw (`tournaments.service.ts:185-187`). Doubles and Mixed take single players with no partner.
- **Acceptance:** until F-04 and F-10 ship, the API returns 400 for these formats and the wizard hides them. Nothing is silently swapped.
- **Approach:** temporary DTO restriction, removed by F-04 and F-10.
- **Owner:** frontend-developer · **Effort:** S · **Depends:** —
- **Test:** unit test: the DTO rejects them.

### B-18 Stats are never corrected (C-38 part, QA-10)
- **Problem:** a corrected winner keeps the old win; there's no reversal.
- **Acceptance:** a `match.corrected` event (old and new result) reverses the old aggregates and applies the new ones.
- **Approach:**
  - B-09 emits `match.corrected` instead of a second `match.completed`.
  - stats-service uses the stored payload in `processed_events` to reverse.
- **Owner:** backend-architect · **Effort:** S–M · **Depends:** B-02, B-09
- **Test:** integration test: score, correct, assert the wins/losses flip and H2H is fixed.

### B-19 Draw can be edited mid-tournament; no confirmation on Generate Draw (C-24, QA-31)
- **Acceptance:**
  - Generate Draw shows an inline confirmation listing any pending entries it will ignore.
  - The "×" and swap controls are hidden once any match is complete, and `swap`/`slot` endpoints return 400 server-side.
  - The detail page uses the shared `Sidebar.jsx`.
- **Owner:** frontend-developer + backend-architect · **Effort:** S · **Depends:** —
- **Test:** Playwright: confirmation shown; after the first score, no "×" is visible and the API returns 400.

### B-20 UX defects (C-35 part, U-3, QA-27, QA-30)
- **Acceptance:**
  - Unknown URL → 404 page.
  - After login or register the user lands on `/dashboard` or the page that sent them to login (`LoginPage.jsx:27`, `RegisterPage.jsx:56`).
  - No raw enums (`HARD_OUTDOOR`, `SINGLES MEN`) anywhere; use the `constants.js` label maps.
- **Owner:** frontend-developer · **Effort:** S · **Depends:** —
- **Test:** Playwright assertions for each.

### B-21 Tournament list leaks other organisers' drafts (C-32 part, G-16, QA-23)
- **Problem:** `findAll()` (`tournaments.service.ts:41-43`) returns everything.
- **Acceptance (interim, until L-06):** DRAFTs are visible only to their owner, `isPublic=false` is respected, and past and cancelled tournaments are excluded unless `?status=` asks for them.
- **Owner:** backend-architect · **Effort:** S · **Depends:** —
- **Test:** unit test: another owner's DRAFT is not returned.

**Chunk 1 exit:**
- All QA-report FAIL rows that map to B-tasks are PASS on a fresh run.
- Security probes are green in CI.
- On prod, 10 consecutive results produce 10 stats updates.
- The 375 px suite is green.

---

## 3. Chunk 2: Functional changes for a smooth end-to-end flow (20 tasks)

Goal: a club admin goes from creating a multi-event tournament to champions in every format, with no API calls, no DB edits and no workarounds.

Ordered by dependency. F-01 and F-05 are the model foundations; build them right after L-01 to L-03.

### F-01 Events within a tournament
- **User story:** As a club admin, I create one tournament (for example "Winter Open") with Men's Singles, Women's Singles and Mixed Doubles. Each event has its own format, entries, draw and champion.
- **Acceptance:**
  - A tournament holds 1 or more events.
  - Entries, draws, matches, groups, seeds and champions belong to an event.
  - The tournament status rolls up from its events: IN_PROGRESS when any event is drawn, COMPLETED when all are complete.
  - A player can enter several events.
  - Existing tournaments migrate to one event each.
- **Approach:**
  - New `events` table (§5). Move `tournamentType`, `drawFormat`, sizing, seeding and group fields from the tournament to the event.
  - `participants` becomes `entries` with an `eventId`; `matches` and `groups` get an `eventId`.
  - Routes are nested under `/tournaments/:id/events/:eid/...`. Old routes are kept as aliases for one release, then removed.
  - Detail page: event tabs.
- **Owner:** backend-architect + frontend-developer · **Effort:** L · **Depends:** L-01, L-06
- **Test:** migration test on a prod-shaped dump (old tournament → 1 event, same matches). Service unit tests are rewritten for events. Playwright: a 2-event tournament runs both.

### F-02 Real names everywhere, and guest entrants (C-14, G-1, QA-36, QA-17)
- **User story:** As an admin or player, I see people's names, not UUID fragments. As a club admin, I can add a walk-in by name.
- **Acceptance:**
  - Entries snapshot `displayName` (and `gender`) for each player.
  - The participants list, bracket, group tables, standings and champion banner show names.
  - Guests: a club admin adds `{name, gender}` with no user account; the entry shows a "Guest" tag; no stats or notifications are emitted for guests.
  - Entering an unknown user id → 400.
- **Approach:**
  - Self-entry takes the name from `X-User-Name`.
  - Admin-added registered users are fetched via the internal auth lookup (§1.3).
  - Back-fill existing rows by script, using auth data exported by the user on prod.
  - `BracketView.jsx`, `GroupStageView.jsx` and `TournamentDetailPage.jsx:357,406` render `displayName` with the seed as a suffix.
  - Events emit only `userId`s, never guest ids.
- **Owner:** backend-architect + frontend-developer · **Effort:** M · **Depends:** F-01
- **Test:** unit tests: guest entry; a ghost id → 400; a guest result emits no stats. Playwright: no 6-hex-character fragment appears on the draw page.

### F-03 Gender and event eligibility
- **User story:** As a club admin, I run Men's, Women's and Mixed events, and the system stops wrong-gender entries.
- **Acceptance:**
  - The user profile has a `gender` field (`MALE | FEMALE`). **ASSUMPTION:** self-declared and required at signup; existing users are asked on next login.
  - Event categories: `MEN | WOMEN | MIXED | OPEN`.
  - Singles MEN/WOMEN require the matching gender.
  - A mixed-doubles pair must be one man and one woman.
  - OPEN allows anyone.
  - Guests carry a gender set by the admin.
  - Age groups are removed from the wizard (the user decided no age rules).
- **Approach:** `gender` on `users` (auth-service), included in the token claims and snapshotted on the entry. Validation lives in the entry service.
- **Owner:** backend-architect + frontend-developer · **Effort:** S–M · **Depends:** F-01, F-02
- **Test:** unit tests: a woman entering Men's Singles → 400; a MIXED pair of the same gender → 400.

### F-04 Doubles and mixed-doubles pairs
- **User story:** As a player, I enter a doubles event with my partner, who confirms. As a club admin, I pair players or guests myself.
- **Acceptance:**
  - A doubles entry has two players.
  - Player-created: P1 picks P2 from the users eligible for the event (club members or invitees). The entry stays `PENDING_PARTNER` until P2 accepts, and P2 can decline.
  - Admin-formed: any two eligible players or guests → the entry is created already confirmed.
  - Nobody can be in two entries of the same event.
  - Names show as "A / B".
  - Stats: **ASSUMPTION:** doubles results aren't counted in singles stats at launch.
- **Approach:** entry columns for player 2 (§5); new endpoints `POST …/entries/:id/accept|decline`; partner picker UI; a notification to the partner (F-18).
- **Owner:** backend-architect + frontend-developer · **Effort:** M · **Depends:** F-01, F-02, F-03
- **Test:** unit tests for the pair lifecycle and the duplicate guard. Playwright: a mixed-doubles event runs from entry to champion.

### F-05 Configurable match rules, presets and per-stage rules
- **User story:** As a club admin, I set groups to "1 set to 6" and the knockout to "best of 3, match tiebreak to 10", and reuse my club's presets.
- **Acceptance:**
  - A rule set holds (each **ASSUMPTION**):
    - `bestOf` 1/3/5
    - `gamesPerSet` 4/6/8 (8 = pro set)
    - `tiebreakAt` (games-all at which a tiebreak is played; default = `gamesPerSet`)
    - `decidingSet` `FULL | MATCH_TIEBREAK_10`
    - `noAd` on/off
  - An event has `groupRules` (RR and group stage) and `knockoutRules`, plus an optional `finalRules` override.
  - Built-in presets: "Best of 3, full sets", "Best of 3, match tiebreak to 10", "1 set to 6", "2 short sets to 4, match TB", "8-game pro set".
  - Club admins can save, edit and delete club presets.
  - Rules are snapshotted onto the event when the draw is generated. Editing a preset never changes a running event.
  - Rules are locked after the draw.
- **Approach:**
  - `match_rule_presets` table (`clubId` null = built-in), seeded by migration.
  - The event stores the three rule snapshots as JSONB.
  - The wizard step "Match rules" offers a preset picker or custom values per stage.
  - The existing `setsToWin`, `gamesPerSet`, `tiebreakAt`, `finalSetTiebreak` and `noAd` columns migrate into `knockoutRules` and `groupRules`.
- **Owner:** backend-architect + frontend-developer · **Effort:** M · **Depends:** F-01
- **Test:** unit tests: snapshot isolation (editing a preset after the draw changes nothing); the final override is applied to the final only.

### F-06 Score entry validated against the rules, with retirement, walkover and default (C-23, QA-16, G-12a)
- **User story:** As a club admin, I enter set scores, including tiebreak points, a 10-point match tiebreak, a retirement, or a walkover, and impossible scores are rejected.
- **Acceptance:**
  - Each set is `{p1, p2, tb?}`.
  - Set validity under the match's rules, with N = `gamesPerSet`:
    - A normal set is won at N with a 2-game lead.
    - At `tiebreakAt`-all a tiebreak is played, giving a final N+1 to N.
    - A pro set follows the same logic at 8.
    - A match tiebreak `[10-x]` needs a 2-point lead and is stored with `isMatchTiebreak`.
  - The winner must have won `ceil(bestOf/2)` sets.
  - Outcome is `COMPLETED | RETIRED | WALKOVER | DEFAULT`. RETIRED allows a partial final set; WALKOVER allows no sets.
  - Display: `7-6(5) 4-6 [10-8]`, "ret.", "w/o".
  - The score modal shows the active rules ("Best of 3 · match TB") and validates live.
  - **ASSUMPTION:** set scores only, with no point-by-point scoring and no admin override for irregular scores.
- **Approach:** a pure `validateScore(rules, sets, outcome)` module in tournament-service, mirrored in the frontend (`frontend/src/scoreRules.js`). The modal gets a tiebreak-points input and RET/W.O./DEF buttons.
- **Owner:** backend-architect + frontend-developer · **Effort:** M · **Depends:** F-05, B-09
- **Test:** a table-driven unit test file with at least 40 valid and invalid scores across all presets. The frontend validator is run against the same fixture file.

### F-07 Correct a recorded result in the UI (C-17, QA-14)
- **User story:** As a club admin who saved the wrong winner, I fix it without calling the API.
- **Acceptance:** completed matches have an "Edit result" action while the next match is unplayed. Saving re-advances correctly (B-09) and emits `match.corrected` (B-18). If the next match has been played, a clear message explains that the later result has to be undone first.
- **Owner:** frontend-developer · **Effort:** S · **Depends:** B-09, F-06
- **Test:** Playwright: save the wrong winner, edit it, and the semi-final shows the corrected player.

### F-08 Round Robin: rounds, standings and winner (C-18, QA-8)
- **User story:** As a player in a 5-player round robin, I see who I play each round and a live table, and the winner is declared.
- **Acceptance:**
  - Matches are generated with the circle method: rounds with nobody playing twice in a round, and a bye round for odd numbers.
  - Stored as `stage: GROUP` in a single group.
  - The standings table orders by wins, then head-to-head (among tied players; for 3 or more tied, a mini-league of wins among them), then % sets won, then % games won, then drawing lots (manual admin choice). Each step is an **ASSUMPTION**, using the user's stated order.
  - Walkovers count as a win with 2-0 sets and 12-0 games, or **ASSUMPTION** excluded from the percentages; pick one, document it, and show it in the table legend.
  - When all matches are complete, the event completes with the top-ranked player as champion.
  - The Draw tab shows a round-by-round list and the table, with no bracket and no "FINAL" heading.
- **Approach:**
  - A shared pure `computeStandings(matches, entries)` used by F-08, F-09 and the API (`GET …/events/:eid/standings`).
  - `TournamentDetailPage.jsx:284` routes RR to `GroupStageView` in single-group mode.
- **Owner:** backend-architect + frontend-developer · **Effort:** M · **Depends:** F-01, F-06
- **Test:** unit tests: 5 players → 5 rounds and 10 matches; tie-break fixtures for 2-way and 3-way ties. Playwright: the standings table renders and the champion appears.

### F-09 Group stage → knockout progression (C-19, QA-9, G-11)
- **User story:** As a club admin, when the groups finish the qualifiers appear in the knockout automatically, and I can override them if needed.
- **Acceptance:**
  - When a group's last match completes, its KO slots (`A1`, `A2`…) are filled from `computeStandings`, and bye slots from B-10 auto-advance.
  - The admin can swap or override KO slot occupants until the first KO match is scored (reuse DrawManager pick/drag in `GroupStageView.jsx`).
  - The false text at `GroupStageView.jsx:307` is replaced by the real status ("Group A complete — A1: …").
  - Group and KO rules apply per stage (F-05).
- **Owner:** backend-architect + frontend-developer · **Effort:** M · **Depends:** F-08, B-10
- **Test:** unit test: finishing group A fills A1/A2. Playwright: 2×4 groups → KO filled → champion, with zero API calls from the test.

### F-10 Double Elimination
- **User story:** As a club admin, I run a double-elimination event where every player can lose once before going out.
- **Acceptance:**
  - Winners bracket (seeded as single elimination with byes) and a losers bracket with the standard drop-down mapping (losers of WB round r enter LB in alternating order to avoid immediate rematches).
  - Grand final between the WB winner and the LB winner. **ASSUMPTION:** a single grand final with no bracket reset; a configurable reset is a later item.
  - Works for 3 to 64 entries with byes; a bye in the WB doesn't create a phantom LB entrant.
  - Correction (F-07) re-routes both the winner path and the loser path, and is blocked if either downstream match has been played.
  - UI: WB and LB brackets plus the grand final.
- **Approach:**
  - Generator as a pure function returning matches with `bracket: WB|LB|GF`, `nextMatchId`+`nextSlot`, and `loserNextMatchId`+`loserNextSlot` (§5).
  - Extend `updateMatch` to route the loser.
  - New `DoubleElimView.jsx` reusing `BracketView` columns.
  - Remove the B-17 restriction.
- **Owner:** backend-architect + frontend-developer · **Effort:** L · **Depends:** F-01, F-06, B-09
- **Test:** property-style unit test for N = 3..32: every entrant except the champion ends with exactly 2 losses (1 for the GF loser if there's no reset), with no orphan or self-referencing matches. Playwright: 6-entry DE to champion.

### F-11 Withdrawal after the draw gives a walkover (C-23, QA-19)
- **Acceptance:** when an entry withdraws after the draw, their next unplayed match is recorded as a WALKOVER for the opponent, who advances. In RR or groups, their remaining matches become walkovers (scored per the F-08 assumption). If an opponent slot is still TBD, the walkover is applied when the slot fills.
- **Owner:** backend-architect · **Effort:** S–M · **Depends:** F-06, F-08
- **Test:** unit tests for the KO, RR and DE cases.

### F-12 Finish events and tournaments, show champions, cancel (C-15, G-2, QA-32)
- **User story:** As anyone, when the final is played I see the champion and the tournament shows Completed.
- **Acceptance:**
  - An event completes automatically:
    - KO or Groups+KO: when the final is scored.
    - RR: when the last match is scored.
    - DE: when the grand final is scored.
  - The tournament completes when all its events are complete or cancelled.
  - Club admins can cancel an event or tournament (DRAFT/OPEN/IN_PROGRESS) with a reason.
  - A champion banner shows per event, with final standings and runners-up.
  - `tournament.completed` and `event.completed` events are published, and stats increments `tournamentWins` for non-guest champions.
- **Owner:** backend-architect + frontend-developer · **Effort:** M · **Depends:** F-08, F-09, F-10
- **Test:** unit tests for each format's completion trigger. The Playwright lifecycle spec ends with "Champion: <name>". Stats integration test: the champion gets `tournamentWins` 1.

### F-13 Invite registered users to a tournament (non-members)
- **User story:** As a club admin, I search any registered user by email or name and invite them to my tournament without making them a club member.
- **Acceptance:**
  - The admin searches users. To limit enumeration, results show name and partial email only, with a minimum of 3 characters and rate limiting.
  - The admin sends an invite for the tournament (all events, or a chosen event).
  - The invitee gets a notification, sees that tournament (and only that one, per the user's ASSUMPTION) in "My tournaments", and can enter eligible events.
  - The admin can revoke an invite before the draw.
  - The invitee is not a club member and doesn't see other club tournaments.
- **Approach:** `tournament_invites` table (§5). Visibility check (L-06) = member OR invitee OR public. Search goes through the internal auth lookup; the search UI calls a tournament-service endpoint that checks club-admin rights first.
- **Owner:** backend-architect + frontend-developer · **Effort:** M · **Depends:** L-06, F-02, F-18
- **Test:** unit tests: an invitee sees only that tournament; a revoked invite → 403. Playwright: the invite → enter flow.

### F-14 Seeding UI and per-event draw generation (C-33 part, G-10)
- **Acceptance:** before the draw, the admin assigns seeds in the entries list (inline number input, with B-13 rules) or uses "Auto-seed by …" (**ASSUMPTION:** manual only at launch). Generate Draw runs per event, with the B-19 confirmation.
- **Owner:** frontend-developer · **Effort:** S · **Depends:** F-01, B-13
- **Test:** Playwright: seeds 1 and 2 land at opposite ends of the bracket.

### F-15 Edit, cancel and delete a tournament in the UI (C-33, G-10)
- **Acceptance:** admin actions on the detail page:
  - Edit details (DRAFT/OPEN) and event setup (DRAFT only).
  - Cancel (F-12).
  - Delete (DRAFT only, with confirmation).
  - Open/close registration per tournament.
- **Owner:** frontend-developer · **Effort:** S–M · **Depends:** B-06, F-01, F-12
- **Test:** Playwright for each action.

### F-16 Create-tournament wizard for events and rules (QA-29, QA-30)
- **Acceptance:**
  - Wizard steps:
    1. Details: name, dates, deadline, venue, surface, visibility, informational entry fee, requires approval.
    2. Events: add one or more, each with category, singles/doubles, format, maximum entries (any integer 2–128; for SE/DE the bracket pads to a power of two with byes), group settings with suggested values.
    3. Match rules per stage (F-05).
    4. Review, with human labels.
  - The tournament is created under the admin's club; admins of several clubs pick one.
  - The prize-pool field is kept as informational text.
- **Owner:** frontend-developer + ux-architect · **Effort:** M · **Depends:** F-01, F-05, L-06
- **Test:** Playwright: create a 3-event tournament (Men's SE, Women's RR, Mixed Doubles Groups+KO).

### F-17 Player experience: my tournaments, my matches, findable tournaments (C-32, QA-23, QA 4.1)
- **User story:** As a player, I see my upcoming matches with opponent names and can find tournaments open to me.
- **Acceptance:**
  - Dashboard: "My next matches" (event, round, opponent, rules), "My entries" (status, pending partner confirmations, invites), and "My results".
  - The Tournaments page has tabs Open to me / Upcoming / In progress / Past, plus search. It is scoped by visibility (member clubs, invites, public).
- **Approach:** `GET /tournaments?scope=…` (server-side filtering, L-06) and `GET /me/matches`.
- **Owner:** frontend-developer + backend-architect · **Effort:** M · **Depends:** L-06, F-01, F-02
- **Test:** Playwright as a player with an invite plus a club membership: the right tournaments appear.

### F-18 In-app notifications for flow events (C-46 part, G-7)
- **User story:** As a player, I'm told when my entry is approved, a partner invites me, I'm invited to a tournament, the draw is out, my match result is recorded, or my club membership is decided.
- **Acceptance:**
  - Notification bell with an unread count; mark as read.
  - Events: `entry.approved`/`rejected`, `pair.invited`, `tournament.invited`, `draw.published`, `match.completed`, `membership.approved`/`rejected`.
  - No notifications for guests.
  - Email copies of invites and membership decisions are sent via L-10, behind a toggle.
- **Approach:** new RabbitMQ event types from tournament-service and auth-service; notification-service consumers (with B-02 acks); `GET /notifications/me`, `PATCH …/read`; `NotificationBell.jsx`.
- **Owner:** backend-architect + frontend-developer · **Effort:** M · **Depends:** B-01, B-02
- **Test:** integration test: each event type creates exactly one notification. Playwright: the bell count increments after approval.

### F-19 Public tournament page and share link (C-31, G-6)
- **Acceptance:** a public tournament (admin toggle) is readable logged-out at `/t/:id`: overview, events, draws, standings, champions. Private tournaments → 404 for outsiders. There is a "Copy share link" action.
- **Approach:** add `optionalAuth` reads in tournament-service. Anonymous GETs pass only for `visibility=PUBLIC`.
- **Owner:** frontend-developer + backend-architect · **Effort:** S–M · **Depends:** L-06, F-02
- **Test:** Playwright logged-out: public → renders with names; private → 404.

### F-20 Profile editing (C-36, G-15)
- **Acceptance:** a user can edit their name and gender (gender is locked while they have an entry in a gendered event that is drawn), change their password (current password required), and see their club memberships and pending applications.
- **Owner:** backend-architect + frontend-developer · **Effort:** S–M · **Depends:** F-03, L-05
- **Test:** unit and Playwright tests.

**Chunk 2 exit:**
- On a staging copy, a club admin runs one tournament containing:
  - Men's SE
  - Women's RR
  - Mixed Doubles Groups+KO
  - Open DE
- Including a guest, an invited non-member, one correction, one retirement and one walkover. Every event reaches a champion through the UI only.

---

## 4. Chunk 3: Launch preparation (19 tasks)

Ordered for execution. L-01 to L-03 are foundations that chunk 2 depends on (see §6). L-09 to L-11 have outside lead time, so the user starts their part in Sprint 0.

### L-01 Switch from `synchronize: true` to migrations (C-45, O-2)
- **Problem:** all 5 `app.module.ts` files auto-alter the schema on boot. The chunk 2 and chunk 3 model changes would rename and drop columns on prod.
- **Acceptance:**
  - `synchronize: false` everywhere.
  - Each service has `src/migrations/` with a baseline generated from the current schema, plus a `migration:run` on boot (or a pre-start step in the Dockerfile `CMD`).
  - CI checks that a fresh DB plus migrations equals the entity schema (`migration:generate --check` produces no diff).
- **Owner:** backend-architect · **Effort:** M · **Depends:** L-13 (a backup must exist)
- **Test:** CI job; dry run on a restored prod dump shows no schema changes from the baseline.

### L-02 Roles: super-admin, club admin, player, and the bootstrap at deploy
- **User story:** As the platform owner, I have a super-admin account the moment the platform is deployed, with no SQL.
- **Acceptance:**
  - `users.role` is `SUPER_ADMIN | PLAYER`. Club admin is a membership role, not a global one.
  - Token claims as in §1.2.
  - Bootstrap: on auth-service boot, if `SUPERADMIN_EMAIL` is set and no SUPER_ADMIN exists, create that user (password from `SUPERADMIN_INITIAL_PASSWORD`, which must be changed on first login), or promote them if they already exist. Idempotent, and audit-logged.
  - The frontend replaces every `role === "ORGANISER"` check (`Sidebar.jsx:24`, `DashboardPage.jsx:34`, `ProfilePage.jsx:89`, `TournamentDetailPage.jsx:126`, `TournamentsPage.jsx:57`) with helpers `isSuperAdmin()` and `isClubAdmin(clubId)`.
  - `PATCH /auth/users/:id/role` is restricted to SUPER_ADMIN.
- **Owner:** backend-architect + security-engineer · **Effort:** M · **Depends:** L-01
- **Test:** unit tests: bootstrap is idempotent; a non-super-admin role change → 403. Integration test: the token carries `clubs`.

### L-03 Club entity and super-admin club management
- **User story:** As the super-admin, I open a club (name, city, country, contact email, logo optional) and appoint one or more club admins.
- **Acceptance:**
  - `clubs` CRUD (super-admin only); clubs can be deactivated, which hides their tournaments.
  - Appoint and remove club admins by user search. A club always keeps at least one admin (or the super-admin is warned).
  - Admin pages `/admin/clubs`, `/admin/clubs/:id` (super-admin only).
  - A public club directory `/clubs` (name, city) for players applying.
  - Every tournament has a `clubId` (non-null after L-07).
- **Approach:** in auth-service (§1.1). Removes the free-text `users.clubId` (`user.entity.ts:25`) and the Club ID field on the register page.
- **Owner:** backend-architect + frontend-developer · **Effort:** M · **Depends:** L-02
- **Test:** unit tests for permissions. Playwright: super-admin creates a club, appoints an admin, and that admin sees the "Create tournament" action.

### L-04 Super-admin user administration
- **User story:** As the super-admin, I support users without SQL.
- **Acceptance:** `/admin/users`:
  - Search by email or name.
  - View memberships.
  - Disable/enable an account (a disabled account can't log in; refresh is revoked via L-17).
  - Send a password-reset email (L-10).
  - Promote to or demote from SUPER_ADMIN.
  - Delete an account (L-12).
  - Every action is audit-logged.
- **Owner:** backend-architect + frontend-developer · **Effort:** M · **Depends:** L-02, L-10, L-12, L-17
- **Test:** Playwright: disable a user → login fails; re-enable → OK.

### L-05 Club membership: apply, approve, reject, leave, remove
- **User story:** As a new player, I register, find my club and apply. A club admin approves me, and I can then see and enter the club's tournaments.
- **Acceptance:**
  - After registration, an onboarding screen: "Find your club" (directory and search) → Apply (optional message).
  - Club admins see pending applications on their club page and in the notification bell, and approve or reject (optional reason).
  - Members can leave; admins can remove members (existing entries remain).
  - A user can belong to several clubs.
  - States: `PENDING → ACTIVE | REJECTED`, then `ACTIVE → LEFT | REMOVED`. A rejected user can reapply after 30 days (**ASSUMPTION**).
  - Approval triggers a token refresh on the member's next request (§1.2).
- **Owner:** backend-architect + frontend-developer + ux-architect · **Effort:** M · **Depends:** L-03, F-18
- **Test:** unit tests for the state machine. Playwright: register → apply → admin approves → the player sees the club's private tournament.

### L-06 Club-scoped authorisation and visibility in tournament-service
- **Problem:** ownership today is a single `organiserId`, and visibility is ignored.
- **Acceptance:**
  - Manage rights = super-admin OR admin of `tournament.clubId`. Every admin of the club can manage every club tournament.
  - Read rights = PUBLIC, OR an ACTIVE member of the club, OR an invitee (F-13), OR a manager.
  - Entry rights = member or invitee, and eligible (F-03).
  - `organiserId` becomes `createdBy` (audit only).
  - Visibility is `CLUB | PUBLIC`, with CLUB as the default (replacing `isPublic` default true; existing rows are migrated per L-07).
  - B-05, B-07 and B-21 checks are re-expressed with these rules.
- **Approach:** an `access.ts` policy module with pure functions over `(user headers, tournament, invite)`, used by every controller method.
- **Owner:** backend-architect + security-engineer · **Effort:** M · **Depends:** L-02, L-03
- **Test:** a policy unit-test matrix (roles × visibility × action). The API probe suite gets cross-club cases: an admin of club A can't touch club B; a non-member can't read a CLUB tournament.

### L-07 Data migration of existing production data
- **Acceptance:** migration scripts, rehearsed on a restored prod dump, that:
  - Create club **FPTC**.
  - Make every existing `ORGANISER` a PLAYER who is an ACTIVE admin of FPTC.
  - Make every MEMBER/GUEST a PLAYER and an ACTIVE member of FPTC (**ASSUMPTION**: the live site has been FPTC's).
  - Assign all tournaments to FPTC. QA/E2E junk is deleted per an L-16 list the user approves.
  - Convert each tournament into 1 event carrying its old format and rules.
  - Turn participants into entries with names back-filled.
  - Map `isPublic=true` to visibility CLUB (**ASSUMPTION**: safer default; admins can re-publish).
  - Record `gender` as unknown, prompting on next login.
- **Approach:**
  - One ordered migration per service, plus a cross-service back-fill step for names: auth-service exports `id,name,gender` to a file, and tournament-service imports it.
  - The runbook (L-14) holds the exact order.
- **Owner:** backend-architect + devops-specialist + **user** (runs on prod) · **Effort:** M · **Depends:** L-01, L-02, L-03, F-01, F-02
- **Test:** rehearsal on a prod dump. Checks: counts before and after match; no entry lacks a name; every tournament has a `clubId`; the app smoke test passes.

### L-08 Onboard FPTC as the first club, and the pilot
- **Acceptance:**
  - The super-admin exists (L-02).
  - FPTC exists with its admins appointed (user names them).
  - Built-in rule presets are present, and FPTC's own presets are created with the club.
  - The FPTC admins get a one-page "How to run a tournament on DrawMaster" guide (`docs/product/club-admin-guide.md`).
  - Pilot dry run on prod with test accounts across all formats, then the test data is deleted.
  - Pilot exit: FPTC runs one real tournament end to end with zero DB edits, and no Sev-1 errors are open longer than 48 h.
  - Open-up: super-admin onboards further clubs using the same checklist.
- **Owner:** **user** (club, admins, pilot) + qa-specialist (dry run) · **Effort:** S (dev) · **Depends:** all of chunks 1 and 2, L-01 to L-07, L-09 to L-15
- **Test:** the dry-run checklist is signed off.

### L-09 Brand: DrawMaster (C-28, U-1, U-2)
- **Acceptance:**
  - Title, favicon, logo, `alt` text, and landing/login/register copy all say **DrawMaster** (`frontend/index.html:6`, `LandingPage.jsx`).
  - No "FPTC" in product chrome; FPTC appears only as a club.
  - The landing feature list (`LandingPage.jsx:5-26`) describes only shipped features (clubs, events, all formats, match rules, live draws, notifications).
- **Owner:** frontend-developer + ux-architect + **user** (logo approval) · **Effort:** S · **Depends:** —
- **Test:** Playwright: title equals "DrawMaster"; a grep in CI fails the build on "Pushers" or "FPTC" in `frontend/src`, outside club seed data.

### L-10 Email provider, password reset and transactional email (C-29, O-3, S-9)
- **Acceptance:**
  - Mail module in auth-service, with the provider set by env.
  - `POST /auth/forgot` (always 200, rate-limited) and `POST /auth/reset` (single-use hashed token, 1 h TTL); the reset page is wired to the `LoginPage.jsx:80` link.
  - Password minimum of 8 characters plus a common-password blocklist.
  - Optional email verification before applying to a club (**ASSUMPTION:** on).
  - Templates for reset, verification, membership decision and tournament invite (used by F-18).
  - SPF and DKIM on the sending domain.
- **Owner:** backend-architect + **user** (provider account, domain DNS) · **Effort:** M · **Depends:** —
- **Test:** unit tests for token single use and expiry. Manual: the reset email arrives on prod and isn't flagged as spam.

### L-11 Legal pages and consent: generic, GDPR-safe (C-30, O-4)
- **Acceptance:**
  - `/privacy`, `/terms`, `/contact` and an imprint placeholder, linked from the landing footer, register page and sidebar.
  - The register page has a terms/privacy checkbox; the version accepted is stored on the user.
  - Privacy notice content covers data categories (account, gender, results, club membership), purposes, legal bases, retention, processors (hosting, email, error tracking), rights (access, rectification, erasure, export) and contact.
  - **Flagged:** the jurisdiction, legal entity and DPO/contact must be filled in before open-up; the pilot can run with the generic text plus a named contact.
  - No non-essential cookies (auth uses localStorage), so no cookie banner unless analytics needs one (L-15 uses cookieless analytics).
- **Owner:** frontend-developer + **user** (legal text approval) · **Effort:** S (dev) · **Depends:** —
- **Test:** Playwright: the links resolve; registration without the checkbox is blocked.

### L-12 Account deletion and data export (C-40, O-5; required by GDPR even without Android)
- **Acceptance:**
  - Settings offers "Download my data" (JSON from auth, entries, stats and notifications) and "Delete my account" (re-enter password).
  - Deletion publishes `user.deleted`:
    - auth removes the user and memberships;
    - tournament-service anonymises entry snapshots to "Deleted player" so draws stay intact;
    - stats and notifications delete their rows.
  - The super-admin can do the same from L-04.
  - The last admin of a club can't delete their account until they hand over the role.
- **Owner:** backend-architect · **Effort:** M · **Depends:** F-02, L-03
- **Test:** integration test: after deletion, no row references the user id except anonymised entries; login → 401.

### L-13 Backups and restore drill (C-11, O-1)
- **Acceptance:**
  - Nightly `pg_dumpall` (compressed) to off-server storage with 14-day retention, plus a dump before every deploy.
  - A restore into a scratch Postgres has been performed and documented.
  - The backup job pings a heartbeat monitor (L-15).
- **Approach:** `infra/backup/backup.sh` plus cron on the Hostinger host.
- **Owner:** devops-specialist + **user** (storage account, cron) · **Effort:** S · **Depends:** —
- **Test:** restore drill: row counts match.

### L-14 Runbook, releases and support procedures (C-12, O-9)
- **Acceptance:** `docs/ops/runbook.md` covers:
  - Deploy with a mandatory pre-deploy dump, `migration:run`, `docker compose restart api-gateway`, a smoke test, and rollback (from the gap doc §4.6).
  - Release tagging.
  - The super-admin bootstrap env vars.
  - The L-07 migration order.
  - Incident checklist.
  - Retention of the RabbitMQ dead-letter queue.
- **Owner:** devops-specialist · **Effort:** S · **Depends:** L-13
- **Test:** the user performs one deploy using only the runbook.

### L-15 Monitoring: uptime, logs, error tracking, analytics (C-13, C-37, O-6, O-7, O-8, O-11)
- **Acceptance:**
  - Docker `logging` rotation (10 MB × 3) on every service.
  - External uptime checks on `/` and `/api/tournaments/` plus the backup heartbeat, alerting the user.
  - Error tracking in the frontend and all services (DSN by env).
  - Cookieless analytics events: `signup`, `club_applied`, `club_approved`, `tournament_created`, `draw_generated`, `match_scored`, `tournament_completed`.
- **Owner:** devops-specialist + **user** (accounts) · **Effort:** S–M · **Depends:** —
- **Test:** a test alert and a test error reach the user; events show in the analytics dashboard.

### L-16 Production data clean-up
- **Acceptance:**
  - After B-01 ships, audit prod `players`, `player_stats`, `head_to_head` and `notifications` for rows not traceable to real events, and delete them.
  - Truncate the stats tables and rebuild them by re-publishing `match.completed` for every completed match (a one-off script; safe because of B-02 idempotency).
  - The user approves a list of QA/test tournaments and accounts to delete before L-07.
- **Owner:** backend-architect + **user** (runs on prod, approves list) · **Effort:** S · **Depends:** B-01, B-02, L-13
- **Test:** the audit query returns 0 rows of unknown origin; spot-checked stats match the completed matches.

### L-17 Session hardening (C-54, S-8, C-39, S-10)
- **Acceptance:**
  - Access-token TTL is 15 min.
  - Refresh tokens are stored hashed with rotation and revocation; logout and disable revoke them; role and membership changes take effect on the next refresh.
  - The gateway CSP drops `unsafe-eval`, `ws:` and, if the build allows, `unsafe-inline` (`nginx.conf:32-33`).
- **Owner:** security-engineer · **Effort:** M · **Depends:** L-01
- **Test:** unit tests: a revoked refresh → 401; a rotated token can't be reused. Manual: no CSP errors in the console on prod.

### L-18 Retire player-service and fix stale docs (C-57, C-60, O-14, O-15)
- **Acceptance:**
  - player-service is removed from the gateway and compose (the UI never calls it), or the decision to keep it is documented by the microservice-architect.
  - The dead `matches` DB is removed from `infra/postgres/init-multiple-dbs.sh`.
  - CLAUDE.md is updated: port 8080, header-based auth, roles, clubs, events.
- **Owner:** devops-specialist + microservice-architect · **Effort:** S · **Depends:** B-01
- **Test:** the stack starts and the E2E suite is green without player-service.

### L-19 Launch QA gate
- **Acceptance:**
  - The full QA real-life pass is re-run against staging (a restored prod copy) with the new model: multiple clubs, all formats, guests, invites, security probes (cross-club included), and 375 px mobile web.
  - All Critical and High findings are closed.
  - The gap doc §4.5 checklist, minus its Android lines, is ticked.
- **Owner:** qa-specialist · **Effort:** M · **Depends:** everything else
- **Test:** a QA report with zero open Critical or High findings.

---

## 5. Data-model changes (cross-cutting)

All changes ship as migrations (L-01). "Service" is the owning database.

| Entity | Service | Change | Key fields | Tasks |
|---|---|---|---|---|
| `users` | auth | Modify | `role` → `SUPER_ADMIN\|PLAYER` (migrate ORGANISER/MEMBER/GUEST); add `gender MALE\|FEMALE\|null`, `disabledAt`, `termsVersion`, `emailVerifiedAt`; remove `clubId`; unique index on `lower(email)` | B-12, F-03, L-02, L-03, L-10, L-11 |
| `clubs` | auth | **New** | `id, name (unique), slug, city, country, contactEmail, logoUrl?, status ACTIVE\|INACTIVE, createdBy, createdAt` | L-03 |
| `club_memberships` | auth | **New** | `id, clubId, userId, role ADMIN\|MEMBER, status PENDING\|ACTIVE\|REJECTED\|LEFT\|REMOVED, message?, decidedBy?, decidedAt?`; unique `(clubId,userId)` | L-03, L-05 |
| `refresh_tokens` | auth | **New** | `id, userId, tokenHash, expiresAt, revokedAt, replacedBy` | L-17 |
| `password_resets` | auth | **New** | `userId, tokenHash, expiresAt, usedAt` | L-10 |
| `tournaments` | tournament | Modify | `clubId` NOT NULL; `organiserId` → `createdBy`; `visibility CLUB\|PUBLIC` replaces `isPublic`; format, size, seeding, group and rule columns move to `events`; `status` rolled up from events; `cancelReason`; drop `ageGroup` | F-01, L-06, L-07 |
| `events` | tournament | **New** | `id, tournamentId, name, category MEN\|WOMEN\|MIXED\|OPEN, discipline SINGLES\|DOUBLES, drawFormat, maxEntries, minEntries, seeded, numberOfGroups?, advancePerGroup?, groupRules jsonb, knockoutRules jsonb, finalRules jsonb?, status DRAFT\|OPEN\|IN_PROGRESS\|COMPLETED\|CANCELLED, championEntryId?` | F-01, F-05, F-12 |
| `entries` (was `participants`) | tournament | Rename + modify | `eventId`; `player1UserId?`, `player1Name`, `player1Gender`; `player2UserId?`, `player2Name?`, `player2Gender?` (doubles); `isGuest1/isGuest2`; `status PENDING_PARTNER\|PENDING\|APPROVED\|REJECTED\|WITHDRAWN`; `seed`, `groupId`; `createdBy`; unique per event on each non-null userId | F-01 to F-04 |
| `tournament_invites` | tournament | **New** | `id, tournamentId, eventId?, userId, userName, invitedBy, status ACTIVE\|REVOKED, createdAt` | F-13 |
| `match_rule_presets` | tournament | **New** | `id, clubId? (null = built-in), name, bestOf 1\|3\|5, gamesPerSet 4\|6\|8, tiebreakAt, decidingSet FULL\|MATCH_TIEBREAK_10, noAd` | F-05 |
| `matches` | tournament | Modify | add `eventId`; `bracket WB\|LB\|GF\|null`; `stage GROUP\|KNOCKOUT`; `entry1Id/entry2Id` (rename); `nextSlot 1\|2`; `loserNextMatchId?`, `loserNextSlot?`; `sets [{p1,p2,tb?,isMatchTiebreak?}]`; `outcome COMPLETED\|RETIRED\|WALKOVER\|DEFAULT`; `status` enum-checked; `rulesStage GROUP\|KNOCKOUT\|FINAL` | B-09, F-06, F-10 |
| `groups` | tournament | Modify | add `eventId` | F-01 |
| `processed_events` | stats | **New** | `matchId PK, payload jsonb, processedAt` | B-02, B-18 |
| `player_stats` | stats | Modify | correct `setsWon/Lost`; `tournamentWins` written; singles only (**ASSUMPTION**) | B-02, F-12 |
| `notifications` | notification | Modify | add `type`, `readAt`, `link` | F-18 |
| player-service DB | player | **Retire** | — | L-18 |

**New RabbitMQ events:**

| Event | Published by |
|---|---|
| `match.corrected`, `event.completed`, `tournament.completed`, `draw.published`, `entry.approved`, `entry.rejected`, `pair.invited`, `tournament.invited` | tournament-service |
| `membership.approved`, `membership.rejected`, `user.deleted` | auth-service |

All consumers ack explicitly and dead-letter on failure.

**Token claims and gateway headers:** `sub, email, name, role, gender, clubs[]`. The gateway adds `X-User-Clubs` and `X-User-Gender` and strips client copies of every `X-User-*` header.

---

## 6. Sprint sequence

A sprint here is a shippable increment that ends with a tagged deploy (runbook, pre-deploy dump). Lengths are left to the dev team. The "parallel" column lists work that touches different files or specialists and can be built at the same time.

| Sprint | Goal | Tasks | Parallel tracks |
|---|---|---|---|
| **S0 Emergency** | Live site safe; events flow; phones work; recoverable | B-01, B-02, B-03, B-04, B-05, B-06, B-07, B-08, L-13, L-14, L-15 (logs + uptime), L-16 | backend (B-02, B-04 to B-08) ∥ security/devops (B-01, L-13, L-14, L-15) ∥ frontend (B-03). **User starts now:** prod `.env`, backup storage, monitor accounts, email provider, logo, list of FPTC admins. |
| **S1 Bug sweep + migrations** | Every remaining known bug fixed; schema under migration control | B-09 to B-21, L-01, L-09, L-18 | backend (B-09 to B-14, B-18, B-21, L-01) ∥ frontend (B-17, B-19, B-20, L-09) ∥ devops (B-15, B-16, L-18). L-01 must merge before S2 starts. |
| **S2 Platform foundations** | Roles, clubs, club-scoped authorisation, events model | L-02, L-03, L-06, F-01, F-05, L-17 | L-02 → L-03 → L-06 are sequential on the backend. F-01 and F-05 start when L-02 merges (tournament-service, different files). The frontend builds the admin club pages against the agreed API contract while the backend works. L-17 is independent. |
| **S3 Formats and scoring** | All formats correct, with rules-validated scoring | F-02, F-03, F-06, F-07, F-08, F-09, F-10, F-11, F-12 | F-06 first; then F-08 → F-09 ∥ F-10 (largest item; start early, isolated generator); F-02 → F-03 ∥ the scoring work; F-07, F-11, F-12 last. |
| **S4 Flow and onboarding** | Smooth journeys for players and admins | F-04, F-13, F-14, F-15, F-16, F-17, F-18, F-19, F-20, L-04, L-05 | backend (F-04, F-13, F-18, L-05) ∥ frontend (F-14, F-15, F-16, F-17, F-19) ∥ ux-architect (onboarding and wizard flows, ahead of the frontend). L-04 waits for L-10 and L-12. |
| **S5 Launch readiness** | Legal, email, data migration, pilot | L-10, L-11, L-12, L-07, L-08, L-15 (error tracking + analytics), L-19 | L-10 ∥ L-11 ∥ L-12 ∥ L-15. L-07 is rehearsed on a prod dump during S4 and run on prod at the start of S5. Then L-19 → FPTC pilot (L-08) → open-up. |

**Cross-chunk dependencies to watch:**
- L-01 (chunk 3) blocks all model changes in chunk 2.
- L-02, L-03 and L-06 (chunk 3) block F-01 and every visibility-dependent chunk 2 task.
- B-09 (chunk 1) is the base for F-06, F-07 and F-10.

---

## 7. Assumptions to confirm, and open questions

### Assumptions (proceeding with these unless the user objects)

| # | Assumption | Where |
|---|---|---|
| A1 | Invited non-members see only the tournaments they're invited to, and can enter only eligible events in them | F-13, L-06 |
| A2 | Rollout: FPTC pilot on web first, then other clubs | L-08 |
| A3 | Rule options: best of 1/3/5; games 4/6/8 (8 = pro set); tiebreak at games-all; deciding set full or match tiebreak to 10; no-ad toggle | F-05 |
| A4 | Rules per stage (groups vs knockout) plus an optional final override; built-in plus club presets; rules locked once the draw is generated | F-05 |
| A5 | Set scores only (no live point scoring), and no admin override for scores that break the rules (RET/W.O./DEF cover irregular endings) | F-06 |
| A6 | Standings: wins → head-to-head (mini-league for 3 or more tied) → % sets → % games → admin decision | F-08 |
| A7 | Walkovers count as a win with a 2-0 / 12-0 score in RR/group standings (alternative: excluded from the percentages) | F-08, F-11 |
| A8 | Doubles pairs: player-proposed with partner confirmation, or admin-formed | F-04 |
| A9 | Double Elimination grand final has no bracket reset | F-10 |
| A10 | Doubles results aren't counted in individual stats at launch; guests never have stats | F-04, §5 |
| A11 | Gender is self-declared Male/Female, required to enter gendered events; existing users are prompted on next login; OPEN events accept anyone | F-03 |
| A12 | Existing live users become FPTC members, existing organisers become FPTC admins, and existing tournaments become FPTC tournaments with CLUB visibility | L-07 |
| A13 | A user can belong to several clubs; rejected applicants can reapply after 30 days | L-05 |
| A14 | All admins of a club share full control of every club tournament; the super-admin can act on any club for support | L-06 |
| A15 | Clubs are created only by the super-admin (no self-serve "create a club" at launch; clubs ask via the contact page) | L-03 |
| A16 | Email verification is required before applying to a club | L-10 |
| A17 | Public tournaments are viewable by anyone, but only members and invitees can enter them | F-19, L-06 |
| A18 | player-service is retired | L-18 |
| A19 | The web app must work on mobile browsers (375 px) even though the native app is out of scope | B-03, L-19 |

### Open questions (not blocking the start; answers needed by the sprint shown)

1. **Jurisdiction, legal entity and privacy contact** for the legal pages: needed before open-up (S5).
2. **Sending domain and email provider:** needed in S1 to give DNS time.
3. **The FPTC admin accounts** (who) and whether FPTC's live users should all become members (A12): needed before the L-07 rehearsal in S4.
4. **Seeding:** manual only at launch, or auto-seed from DrawMaster stats? Needed in S4.
5. **Team competitions** (club vs club): confirmed as later; scope separately.

---

## Appendix A: Later (out of launch scope)

- **Android app (Capacitor, `mobile/`):** C-41 production build URL and CORS origin, C-42 signing/icons/R8/`allowBackup`, C-43 real-device QA, C-44 Play Console and closed testing, C-59 push notifications. The rename to DrawMaster and account deletion (L-12) already cover two Play prerequisites.
- iOS build.
- Match scheduling, times and courts (C-48).
- Player profiles, leaderboards and the stats report (C-47); doubles stats.
- Double Elimination bracket reset; auto-seeding from stats.
- In-app entry-fee payments (C-51).
- Team (club vs club) competitions.
- i18n (C-53).
- CI deploy over SSH, staging environment automation, compose healthchecks (C-55).
- Player self-reported scores with admin confirmation.
- Converting guest entrants into registered accounts (history merge).
