# Draw Master (FPTC): Real-Life QA Test Report

_Date: 2026-11-18 · Baseline: `main` @ `fb0e83e` · Tester role: QA Specialist (`avengers-team/qa-specialist.md`)_

## 1. Environment and method

- **Stack:** the local Docker Compose stack, reached only through the gateway at `http://127.0.0.1:8080` (frontend at `/`, API at `/api/<service>/`). No containers were rebuilt, restarted or stopped by QA, and no source code was edited.
  - Note: during the first minutes of the session the whole stack restarted twice (all containers showed "Up 1–13 seconds"). That restart was not triggered by QA. After it settled, the stack stayed stable for the rest of the session.
- **UI testing:** done in the built-in browser pane (real clicks and typing) at desktop width and at 375 × 812 mobile emulation. I drove the full journey through the UI: register, login (including bad passwords), the 4-step wizard, open registration, approve and reject, generate the draw, score through the modal, the player dashboard, the tournaments list, the profile, and the mobile layout.
- **API testing:** bulk setup and edge cases ran through Node `fetch` scripts against the gateway. The scripts were kept in the session scratchpad and are not committed.
- **DB checks:** read-only queries via `docker compose exec -T postgres psql`, plus one role edit (see QA-3). I also listed the RabbitMQ queues with `rabbitmqctl list_queues`.
- **Pre-existing data:** about 30 tournaments from earlier smoke and E2E runs ("E2E Lifecycle …", "Smoke RR", …) were already in the DB. They show up in every list.

### Accounts created (test values only)

Every account below uses the same test password, `Court2026!`. Emails are on the reserved `.test` TLD.

| Name | Email | Role | How |
|---|---|---|---|
| Luca Bianchi, Sofia Marino, Daniel Okafor, Emma Lindqvist, Mateo Herrera, Aiko Tanaka, Tomas Novak, Priya Raman, Hugo Lefevre, Nina Petrova, Arman Sargsyan, Chloe Dubois | `<first>.<last>@qa-club.test` | MEMBER | API register |
| Hannah Clarke | `hannah.clarke@qa-club.test` | MEMBER → **ORGANISER** | UI register; promoted via psql |
| Margaret Hayes | `org.margaret@qa-club.test` | MEMBER → **ORGANISER** | API register; promoted via psql |
| Viktor Petrosyan | `org.viktor@qa-club.test` | MEMBER → **ORGANISER** | API register; promoted via psql |
| Negative-test leftovers | `luca.bianchi` with a different case (`Luca.Bianchi@QA-club.test`), `weak1@`, `x2@`, `x3@`, `x4@`, `x5@qa-club.test` | MEMBER | created by the validation probes (see QA-13, QA-24) |

### Tournaments created

| Key | Name | Organiser | Format | Players | Outcome |
|---|---|---|---|---|---|
| T1 | Riverside Winter Open 2026 (`9f4c1a24…`) | Hannah | Single Elim, 8, seeded, approval required, champion tiebreak | 10 applied + 1 ghost, 8 approved | Played to a champion (Emma). Status still **In Progress** |
| T2 | Thursday Ladder Round Robin (`4aecde81…`) | Margaret | Round Robin | 5 | All 10 matches scored; no standings, no winner |
| T3 | Club Championship Groups (`05d8f3a8…`) | Margaret | Groups + KO (2 × 4, top 2) | 8 | Group stage played in UI terms; KO filled via API; final played |
| T4 | Three Group Cup (`2cb595aa…`) | Margaret | Groups + KO (3 groups) | 12 | **Draw generation 500s** |
| T5 | Default Groups 6 players (`934ac613…`) | Margaret | Groups + KO (default 4 groups) | 6 | Groups of 2/2/1/1, only 2 group matches |
| T6 | Autumn Five Knockout (`b6765128…`) | Viktor (then transferred to Hannah via PATCH) | Single Elim, unseeded, 5 players | 5 | 3 byes generated correctly |
| T7 | Double Elim Trial (`9bcb7fc8…`) | Viktor | "Double Elimination" | 6 | Silently a single-elim bracket |
| T8 | Mixed Doubles Social (`6289f3c8…`) | Viktor | SE, Mixed Doubles | 4 | Single players, no partners |
| T9 | Tiny 3 player (`00eaec39…`) | Viktor | RR, min 2 | 3 | Generated |
| — | Luca Rogue Cup, Backwards, "" (empty name), Impossible, Last Year | Luca (player!) / Viktor | — | — | Validation probes, left as DRAFT |

---

## 2. Scenario results

Legend: **PASS** = works as a club would expect. **FAIL** = broken or wrong. **GAP** = missing capability.

### Scenario 1: Accounts

| # | Step | Expected | Actual | Result |
|---|---|---|---|---|
| 1.1 | Register 12 players + 3 organiser-to-be (API), Hannah via UI wizard ("Club Member" card) | 201, role MEMBER | 201, MEMBER. UI register works; confirm-password mismatch shows "Passwords do not match." | PASS |
| 1.2 | After UI register | Land on dashboard | Lands on the marketing landing page (`RegisterPage.jsx:56` → `navigate("/")`). Same after login (`LoginPage.jsx:27`). | FAIL (UX, QA-27) |
| 1.3 | Login correct / wrong password (UI and API) | 200 / clear error | 200 / "Invalid credentials" | PASS |
| 1.4 | Login with upper-cased email | Same account | 401 Invalid credentials. Email is case-sensitive. | FAIL (QA-13) |
| 1.5 | Register duplicate email | 409 | Exact duplicate → 409. **Case variant `Luca.Bianchi@QA-club.test` → 201, a second account** | FAIL (QA-13) |
| 1.6 | Weak password `123456` | Rejected | 201 accepted; only length ≥ 6 is checked | GAP (S-9) |
| 1.7 | Bad input: bad email, 1-char name, empty body, malformed JSON | 400 | 400 with readable messages | PASS |
| 1.8 | Name `"   "` (whitespace), 5000-char name, HTML in name | Rejected or trimmed | All 201 (whitespace-only name accepted) | FAIL (QA-24) |
| 1.9 | Register with `role: ORGANISER` | Rejected | 400 "role must be MEMBER, GUEST" | PASS |
| 1.10 | Become an organiser | Some in-app path | None. Register page says "Ask an existing organiser to upgrade your account", but no UI exists for that. Self-promote via `PATCH /auth/users/:id/role` → 403. **Unblocked by psql `UPDATE users SET role='ORGANISER'`.** | GAP (G-3, QA-3) |
| 1.11 | After the DB promotion, refresh the page | Role updates | Still MEMBER until sign-out/sign-in (role lives in the JWT) | GAP (S-8) |
| 1.12 | Login rate limit | Per-client throttle, friendly message | Throttled after 5 attempts/min; the UI shows the raw string **"ThrottlerException: Too Many Requests"** | FAIL (UX, QA-25; S-7) |
| 1.13 | Logout | Session cleared, protected route → /login | Works | PASS |
| 1.14 | Refresh token used as access token | Rejected | `GET /api/auth/me` with the **refresh** token → 200 (other services → 401/403) | FAIL (QA-20) |

### Scenario 2: Organiser flow

| # | Step | Expected | Actual | Result |
|---|---|---|---|---|
| 2.1 | Wizard step 1 with end date before start date | Blocked | "End date must be after start date." | PASS |
| 2.2 | Registration deadline **after** start date | Blocked | Accepted; the deadline is also never shown on the detail page | FAIL (QA-22, G-13) |
| 2.3 | Max participants for a 5-player club RR | Free number | Only 8/16/32/64 allowed (UI and DTO) | GAP (QA-29) |
| 2.4 | Wizard summary / overview labels | Human labels | Raw enums: `HARD_OUTDOOR`, `SINGLES MEN`, `OPEN` | FAIL (UX, QA-30) |
| 2.5 | Create SE / RR / Groups / odd SE | Created as DRAFT | Created | PASS |
| 2.6 | Double Elimination | Hidden or implemented | Offered. Creates a plain single-elim bracket silently (T7) | FAIL (G-4) |
| 2.7 | Mixed Doubles | Partner entry | Offered. Players enroll alone; a 4-"pair" draw is 4 singles | FAIL (G-5) |
| 2.8 | Open registration (UI) | Status OPEN | Works, with a success banner | PASS |
| 2.9 | Players enroll, duplicate enroll, enroll someone else | 201 / 400 / 403 | As expected | PASS |
| 2.10 | Organiser enrolls a non-existent `playerId: "not-a-real-user"` | 400 | **201**, a ghost participant appears in the list | FAIL (QA-17) |
| 2.11 | Participants tab (UI) | Names | "PLAYER ID eb6bcf86…"; the organiser can't tell who applied | FAIL (G-1) |
| 2.12 | Header counter | Approved / max | "👥 11/8": counts pending, rejected and withdrawn rows | FAIL (QA-21) |
| 2.13 | Approve beyond max (9 approved for an 8-draw) | Blocked at max | All approvals succeed (9/8) | FAIL (QA-11, extends G-13) |
| 2.14 | Reject (UI) | Rejected | Works | PASS |
| 2.15 | Player withdraws self; another player tries to withdraw her | 200 / 403 | 200 / 403 | PASS |
| 2.16 | Organiser re-approves a player who withdrew | Blocked | Allowed: WITHDRAWN → APPROVED | FAIL (QA-18) |
| 2.17 | **Organiser B (Viktor) withdraws a player from organiser A's (Hannah) tournament** | 403 | **200, WITHDRAWN** | FAIL (QA-4) |
| 2.18 | Seeding | UI to assign seeds | No UI (API only). API accepts duplicate seed 1, negative seed -5; `"abc"` → **500** | FAIL/GAP (G-10, QA-15) |
| 2.19 | Generate draw (UI) | Confirmation, then draw | No confirm dialog for an irreversible action; pending applications ignored silently. Draw is correct (1 v unseeded, 4 v unseeded in top half, 2/3 in bottom half) | PASS (with UX note QA-31) |
| 2.20 | Odd number (5) unseeded SE | Byes | 3 byes, BYE winners pre-advanced into R2 | PASS |
| 2.21 | Groups+KO with 3 groups (12 players) | Draw generated (byes for top seeds) | **500 Internal Server Error**; log shows `RangeError: Maximum call stack size exceeded` | FAIL (QA-5) |
| 2.22 | Groups+KO, 6 players with wizard default 4 groups | Validation or sensible groups | Groups of 2,2,1,1. Groups C and D have one player and **zero matches**, but still feed C1/D1/D2 KO slots | FAIL (QA-12) |
| 2.23 | Edit tournament after creation | Edit UI | None (no edit/cancel/delete buttons) | GAP (G-10) |

### Scenario 3: Scoring like real life

| # | Step | Expected | Actual | Result |
|---|---|---|---|---|
| 3.1 | Score 6-4 6-3 in the UI modal | Saved, winner advances | Saved, "Score saved — winner advanced." | PASS |
| 3.2 | Score 6-4 6-3 but pick the **loser** as winner (UI) | Rejected | Accepted; the loser advanced | FAIL (G-12a) |
| 3.3 | Edit a recorded score in the UI | Edit possible | Completed match is not clickable. No way to correct a mistake in the UI | GAP (QA-14) |
| 3.4 | Correct the winner via API (re-score QF1) | Old winner removed from SF | **Both** players are now in the SF (Tomas v Luca) | FAIL (G-12a) |
| 3.5 | Score with a `winnerId` that isn't in the match | 400 | 200. The bogus id **overwrote** a real player in the next match (SF1: Tomas v `000000…`) | FAIL (G-12a, QA-6) |
| 3.6 | Score a semi-final whose players are both TBD (out of order) | 400 | 200 COMPLETED; "Sofia" advanced to the final without playing | FAIL (QA-6) |
| 3.7 | `status: "FOO"` / `sets: [{a:1}]` | 400 | 200. Status "FOO" stored and shown as a scorable card | FAIL (QA-6) |
| 3.8 | Score QF4 before QF3 | QF3 winner goes to SF2 top slot | QF4 winner lands in the **top** slot (Mateo above Sofia); the bracket flips | FAIL (QA-7) |
| 3.9 | 7-6(5) 4-6 10-8 match tiebreak | Tiebreak points captured, 10-8 shown as [10-8] | Stored as three "sets" `7-6, 4-6, 10-8`; tiebreak points (5) can't be entered | GAP (QA-16) |
| 3.10 | Retirement (3-6 2-1 ret.) | RET marker | No RET/W.O. option. Stored as `3-6 2-1` with the "winner" trailing in set 2 | GAP (QA-16) |
| 3.11 | Walkover | W/O marker | `sets: []` + winner; UI shows a highlighted winner with no score and no "W/O" | GAP (QA-16) |
| 3.12 | Player or another organiser scores a match | 403 | 403 | PASS |
| 3.13 | Final played: champion shown, status Completed | Champion banner, COMPLETED | Status stays **In Progress**, no champion anywhere (T1, T2, T3) | FAIL (G-2) |
| 3.14 | Round Robin view | Standings table | **Rendered as a knockout bracket with 10 cards all under the heading "FINAL"**. No standings, no winner. Backend stores every RR match as `stage: KNOCKOUT, round: 1` | FAIL (QA-8) |
| 3.15 | Group stage view | Group tables | Cross-table and standings render correctly (UUIDs only) | PASS (G-1) |
| 3.16 | Group → knockout | Qualifiers fill KO | UI claims "Winners advance automatically after group stage completes". They don't, and **GroupStageView has no way to place players**. Filled only via the API slot endpoint | FAIL (QA-9, G-11) |
| 3.17 | Withdraw a player who is in a drawn match | Walkover / replacement | Status WITHDRAWN, but the draw is unchanged | GAP (QA-19) |
| 3.18 | Organiser "×" (remove from draw) on in-progress matches | Locked once play starts | Still shown on every unscored card mid-tournament | FAIL (UX, QA-31) |
| 3.19 | Round Robin match order | Rounds (circle method) | Luca plays matches 1–4 back-to-back; no round grouping | GAP (QA-8) |

### Scenario 4: Player view (Emma, who won T1)

| # | Step | Expected | Actual | Result |
|---|---|---|---|---|
| 4.1 | Dashboard | My entries, next match | 7 participations as cards (status + Approved). No next match, no result, no title | PASS / GAP |
| 4.2 | Tournaments list | Open tournaments to apply to | "Browse and apply to open tournaments" lists **all 40+**, including other organisers' DRAFTs, a nameless draft, a 2020 event and E2E test junk. No search or filter | FAIL (G-16, QA-23) |
| 4.3 | Profile | History, stats | Name, email, role, application counts. No matches, no titles, no stats | GAP (G-8) |
| 4.4 | My matches / opponent | Opponent name | No "my matches" view; bracket shows "Seed 2" / `3281be…` | FAIL (G-1) |
| 4.5 | Organiser controls hidden for player | Hidden | Hidden (no approve, score or draw buttons) | PASS |
| 4.6 | Woman enrolled in "Singles Men" | Blocked or warned | Allowed | GAP (QA-28) |
| 4.7 | Names anywhere? | Names | Only the user's own name (sidebar/profile). Every other person is a UUID fragment or "Seed n" | FAIL (G-1) |

### Scenario 5: Permissions and security

| # | Probe | Expected | Actual | Result |
|---|---|---|---|---|
| 5.1 | Player creates a tournament via API | 403 | 201 ("Luca Rogue Cup") | FAIL (S-5) |
| 5.2 | Player opens, approves or PATCHes someone's tournament | 403 | 403 | PASS |
| 5.3 | Organiser B PATCH, DELETE, draw, approve, seed or score on A's tournament | 403 | 403 | PASS |
| 5.4 | Organiser B **withdraws** a participant in A's tournament | 403 | **200** | FAIL (QA-4) |
| 5.5 | Owner PATCH `status: COMPLETED` / `OPEN` / `"BANANA"` | Rejected | All 200 | FAIL (S-6) |
| 5.6 | Owner PATCH `organiserId` → another user | Rejected | 200; ownership transferred (T6 Viktor → Hannah) | FAIL (S-6) |
| 5.7 | Owner PATCH `startDate: "not-a-date"` | 400 | 500 | FAIL (S-6) |
| 5.8 | Anonymous `POST/PATCH/DELETE /api/players` | 401 | 201 / 200 / 204 | FAIL (S-1) |
| 5.9 | Anonymous `POST /api/stats/results` forging a 6-0 6-0 win | 401 | 201; Luca's public stats now show a win and an H2H vs Sofia | FAIL (S-2) |
| 5.10 | Anonymous `POST /api/stats/seedings` | 401 | 201 | FAIL (S-2) |
| 5.11 | Anonymous `POST /api/notifications/notify` phishing message to Luca | 401 | 201 "Account suspended — verify at http://evil.test" stored | FAIL (S-3) |
| 5.12 | Sofia (and anonymous) read Luca's notifications | 403 | 200, full content | FAIL (S-3) |
| 5.13 | Invalid bearer token on a public GET | Treated as anonymous, or 401 JSON | 401 **HTML** nginx page | Note (QA-26) |
| 5.14 | `GET /api/tournaments` (no trailing slash) | 200 or a same-origin redirect | `301 Location: http://127.0.0.1/api/tournaments/`: the redirect **drops the port** | FAIL (QA-26) |

### Scenario 6: Side effects (stats and notifications)

| # | Check | Expected | Actual | Result |
|---|---|---|---|---|
| 6.1 | After about 33 completed matches, stats for Emma (champion, 6+ wins) | Wins counted | `matchesPlayed: 0` | FAIL (QA-1) |
| 6.2 | Notifications for Emma | "You won…" entries | `[]` | FAIL (QA-1) |
| 6.3 | Root cause | — | `rabbitmqctl list_queues` → `stats_queue 33 ready / 1 unacked`, `notifications_queue 33 ready / 1 unacked`. Only the **first** event after service start was processed | FAIL (QA-1) |
| 6.4 | Stats `setsWon` for a 6-0 6-0 result | 2 | **12**: games are summed as sets | FAIL (QA-10) |
| 6.5 | Corrected result (QF1 winner changed) | Stats reversed | Tomas keeps the win from the wrong first entry; no reversal path, and a re-score would emit a second event | FAIL (QA-10) |
| 6.6 | `tournamentWins` | Incremented for champions | Never written anywhere in stats-service | FAIL (QA-10) |
| 6.7 | `GET /api/stats/tournaments/:id/report` | Report | Stub: "Full report available once RabbitMQ event pipeline is connected." | GAP |

### Scenario 7: Mobile (375 × 812 emulation)

| # | Page | Expected | Actual | Result |
|---|---|---|---|---|
| 7.1 | Landing | Usable | Fine, no horizontal scroll | PASS |
| 7.2 | Dashboard, tournament detail, profile (any page with the app sidebar) | Collapsed top nav, content visible | **Sidebar renders full-height (812 px), sticky, full width, and covers the content even after scrolling**; `<main>` starts at y = 812 underneath it. These pages are effectively unusable on a phone | FAIL (QA-2) |

---

## 3. Findings (deduplicated)

Severity: **Critical** = data loss, a broken core loop, or a security hole that is trivially exploitable. **High** = blocks a real club use-case. **Medium** = wrong or confusing, with a workaround. **Low** = polish.

"Gap doc" cites `docs/product/gap-analysis-and-launch-plan.md`. NEW = not in that doc.

| ID | Sev | Area | Title | Gap doc |
|---|---|---|---|---|
| QA-1 | Critical | Events / stats / notifications | RabbitMQ consumers never ack, so only the first `match.completed` per service start is processed | **NEW** |
| QA-2 | Critical | Frontend / mobile | App sidebar covers the whole screen at phone width (CSS order bug) | **NEW** (U-4 only says "untested") |
| QA-3 | High | Accounts | Only way to create an organiser is a DB edit | G-3 |
| QA-4 | High | Security / participants | Any ORGANISER can withdraw any participant from any tournament | **NEW** |
| QA-5 | High | Draw generation | Group Stage + Knockout with a non-power-of-2 qualifier count (3, 6 groups, or 3 advancing) → 500 stack overflow | **NEW** |
| QA-6 | High | Scoring integrity | Scoring accepts foreign winners, empty matches, any status; it overwrites the next match's players | G-12a (extended) |
| QA-7 | Medium | Scoring / bracket | Advancement fills the first empty slot, not the bracket-correct slot | **NEW** |
| QA-8 | High | Round Robin | RR rendered as a bracket of "FINAL" cards; no standings, no winner, no rounds | **NEW** |
| QA-9 | High | Group → KO | No UI to place qualifiers, and the page falsely claims auto-advance | G-11 (worse than described) |
| QA-10 | Medium | Stats | `setsWon` sums games; `tournamentWins` never set; no reversal for corrected or duplicate results | **NEW** |
| QA-11 | Medium | Participants | Approve doesn't enforce max participants | G-13 (extended) |
| QA-12 | Medium | Draw generation | Group count isn't validated against players: empty or one-player groups | **NEW** |
| QA-13 | Medium | Auth | Email is case-sensitive: duplicate accounts, and login fails with different casing | **NEW** |
| QA-14 | Medium | Scoring UX | A completed match can't be edited in the UI | Partly G-12a (**NEW** as UI gap) |
| QA-15 | Medium | Seeding API | Seed body unvalidated: `"abc"` → 500, negative and duplicate seeds accepted | **NEW** (G-10 covers only the missing UI) |
| QA-16 | Medium | Scoring model | No retirement, walkover, or tiebreak-points support | **NEW** |
| QA-17 | Medium | Participants | Organiser can enroll any arbitrary `playerId` (ghost entries) | **NEW** |
| QA-18 | Low | Participants | Approve/reject have no state guards (WITHDRAWN → APPROVED) | **NEW** |
| QA-19 | Medium | Draw | Withdrawing a drawn player leaves them in the draw (no walkover handling) | **NEW** |
| QA-20 | Low | Auth | Refresh token accepted as an access token by auth-service `/auth/me` | **NEW** |
| QA-21 | Low | UX | Participant counter "11/8" counts pending, rejected and withdrawn rows | **NEW** |
| QA-22 | Low | Wizard validation | Registration deadline after start date accepted; deadline never displayed | G-13 (partial) / **NEW** (display) |
| QA-23 | Medium | Tournaments list | Lists other organisers' drafts, nameless and past events; no filters | G-16 (+ **NEW** list UX) |
| QA-24 | Low | Input validation | Whitespace-only and 5000-char names; empty tournament name; end < start and past dates accepted by API | **NEW** |
| QA-25 | Low | UX | Rate-limit error shown raw ("ThrottlerException: Too Many Requests") | **NEW** (S-7 covers the limiter itself) |
| QA-26 | Low | Gateway | Trailing-slash 301 drops the port; invalid tokens on public GETs return an HTML 401 | **NEW** |
| QA-27 | Low | UX | After login/register the user lands on the marketing page, not the dashboard | **NEW** |
| QA-28 | Low | Rules | No gender or age-group eligibility checks on enrollment | **NEW** |
| QA-29 | Low | Wizard | Max participants limited to 8/16/32/64 | **NEW** |
| QA-30 | Low | UX | Raw enum labels (`HARD_OUTDOOR`, `SINGLES MEN`) in summary and overview | **NEW** |
| QA-31 | Low | Organiser UX | No confirm dialog on Generate Draw; "remove from draw" × still available mid-tournament; sidebar on detail page lacks Profile/Sign out | **NEW** |
| QA-32 | High | Lifecycle | Tournament never completes; no champion (T1, T2, T3) | G-2 |
| QA-33 | Critical | Security | Anonymous writes on players/stats/notifications; anyone reads anyone's notifications | S-1, S-2, S-3 |
| QA-34 | High | Security | PATCH tournament bypasses validation: status, organiserId, invalid dates (500) | S-6 |
| QA-35 | High | Security | Players can create tournaments via API | S-5 |
| QA-36 | High | Product | Names never shown (participants, bracket, groups) | G-1 |
| QA-37 | High | Product | Double Elimination silently becomes Single Elim; Doubles/Mixed have no partners | G-4, G-5 |

**Counts:** Critical 3 · High 11 · Medium 11 · Low 12 (37 total: 24 NEW, 6 that extend an existing gap, 7 that re-confirm existing gaps).

### Finding details

#### QA-1: Event consumers never ack, so stats and notifications stop after one message (Critical, NEW)
- **Steps:** Restart stats-service or notification-service (or start the stack fresh). Score two or more matches.
- **Evidence:** Emma won 7+ matches and has `matchesPlayed: 0` with 0 notifications. `rabbitmqctl list_queues` shows `stats_queue 33 1 1` and `notifications_queue 33 1 1` (ready / unacked / consumers). `stats-service/src/main.ts:16-17` and `notification-service/src/main.ts:12-13` set `noAck: false, prefetchCount: 1`, but the `@EventPattern('match.completed')` handlers (`stats.controller.ts:13`, `notifications.controller.ts:12`) never call `context.getChannelRef().ack(...)`. After the first message the channel is saturated forever.
- **Fix:** Take `@Ctx() ctx: RmqContext` and `ack` after a successful handle (and `nack` with a dead-letter queue on failure), or set `noAck: true`. Add an integration test that publishes three or more events.

#### QA-2: Mobile layout: the sidebar covers every app page (Critical, NEW)
- **Steps:** Log in, set the viewport to 375 px, open `/dashboard` or any tournament.
- **Evidence:** The screen shows only the logo and nav links. JS shows `.sidebar` at 375 × 812, `position: sticky`, and `<main>` top = 812. Scrolling keeps the sidebar on top. Root cause: the `@media (max-width: 768px) .sidebar {…}` override at `frontend/src/index.css:479-497` comes **before** the base `.sidebar {… height:100vh; flex-direction:column}` rule at `index.css:501`, so the base rule wins (same specificity, later in source).
- **Fix:** Move the media block after the base rule (or raise its specificity). Add a Playwright 375 px screenshot check. This blocks the Capacitor Android app too.

#### QA-3: No in-app path to the organiser role (High, G-3)
- **Steps:** Register. The page says "Ask an existing organiser to upgrade your account". No UI exists to do that, and `PATCH /auth/users/:id/role` needs the organiser to know a UUID.
- **Evidence:** Unblocked with psql `UPDATE users SET role='ORGANISER' WHERE email IN (…)` (3 rows). The new role only applies after re-login.
- **Fix:** As G-3 says: a bootstrap script plus a user-search-and-promote screen. Force a token refresh after a role change.

#### QA-4: Any organiser can withdraw players from tournaments they don't own (High, NEW)
- **Steps:** As Viktor (ORGANISER), `PATCH /api/tournaments/{Hannah's T1}/participants/{Luca}/withdraw`.
- **Evidence:** 200 `"status":"WITHDRAWN"`. `tournaments.controller.ts:92` passes `user.role === 'ORGANISER'` as "isOrganiser", and `tournaments.service.ts:154` trusts it without checking `t.organiserId`.
- **Fix:** `const isOwner = t.organiserId === requesterId;` and allow only the owner or the player themselves.

#### QA-5: Groups + KO draw crashes for 3 groups (High, NEW)
- **Steps:** Create GROUP_STAGE_KNOCKOUT with `numberOfGroups: 3, advancePerGroup: 2` (both offered in the wizard), enroll 12, generate the draw.
- **Evidence:** `500 Internal server error`. The tournament-service log shows `RangeError: Maximum call stack size exceeded`. `tournaments.service.ts:316-339`: `totalKO = 6`, and `seededSlots(6)` recurses on 3 → 1.5 → … The KO round counts `totalKO / 2^round` are also fractional. The same happens for 6 groups, or for 3 advancing from 2 or 4 groups.
- **Fix:** Pad the KO bracket to `nextPow2(totalKO)` with byes for the top qualifiers, as single elimination already does. Validate the group/advance combination in the DTO and the wizard.

#### QA-6: Score endpoint has no integrity checks and corrupts the bracket (High, G-12a extended)
- **Steps:** (a) In the UI, enter 6-4 6-3 for Seed 1 and select the opponent as winner. (b) API: `PATCH …/matches/{QF2}` with `winnerId: 0000…`. (c) Score SF2 while both slots are TBD. (d) `status: "FOO"`.
- **Evidence:** All return 200. In (b), the bogus id **replaced Luca** in SF1 (`tournaments.service.ts:400-401` writes `participant2Id` whenever `participant1Id` is set). In (c), Sofia "advanced" to the final without playing. In (d), status "FOO" is stored and the card stays scorable. The UI then showed SF1 as `c9a95e… vs 000000…`.
- **Fix:** Require the match to have both participants and status SCHEDULED. Require `winnerId ∈ {p1, p2}`. Validate sets against `setsToWin`/`gamesPerSet` (6-5 and 8-1 are invalid; a deciding set may be a 10-point match tiebreak). Use `@IsIn` for status. On re-score, remove the previous winner from the next match and block it if the next match is already completed.

#### QA-7: Winners land in the wrong half of the next match (Medium, NEW)
- **Steps:** In an 8-draw, score QF4 before QF3.
- **Evidence:** SF2 = "Mateo Herrera (QF4) vs Sofia Marino (QF3)". The bottom-half winner is drawn on top, and the bracket visibly crosses lines. Same root cause as QA-6 (`:400-401`).
- **Fix:** `match.position % 2 === 0 ? next.participant1Id = w : next.participant2Id = w`, which already exists for byes at `:262-263`.

#### QA-8: Round Robin is displayed as a knockout bracket (High, NEW)
- **Steps:** Create an RR with 5 players, generate the draw, open the Draw tab.
- **Evidence:** 10 match cards in one column headed **"FINAL"**. After all 10 matches were scored, no table, points or winner appear. Backend: `generateRoundRobin` stores `stage:'KNOCKOUT', round:1` for every match (`tournaments.service.ts:275`). Frontend: `TournamentDetailPage.jsx:284-300` sends anything that isn't GROUP_STAGE_KNOCKOUT to the bracket `DrawManager`.
- **Fix:** Store RR as stage `GROUP`/`ROUND_ROBIN` with circle-method rounds. Render it with the GroupStageView table (one group). Declare the winner when all matches are done.

#### QA-9: Group stage can't progress to the knockout in the UI (High, G-11, worse)
- **Steps:** Finish all group matches in T3 and look at "Knockout Phase".
- **Evidence:** The label says "Winners advance automatically after group stage completes" (`GroupStageView.jsx:307`). Slots stay "A1 / B2" and are not clickable or droppable; GroupStageView has no slot editing. I had to call `PATCH …/draw/:matchId/slot` four times via the API. G-11 assumes the organiser can drag qualifiers in; they can't.
- **Fix:** Auto-fill KO slots from the standings when a group finishes, and add a manual override (reuse DrawManager's DnD). Remove the false claim until then.

#### QA-10: Stats data is wrong even when events arrive (Medium, NEW)
- **Evidence:** A 6-0 6-0 result gives `setsWon: 12, setsLost: 0` (`stats.service.ts:72-75` adds games). `tournamentWins` is initialised and never incremented. Nothing deduplicates by `matchId`, so a re-score (which re-emits, `tournaments.service.ts:455`) double-counts. A corrected winner (QF1 Tomas → Luca) is never reversed.
- **Fix:** Count a set to whoever has more games. Upsert results keyed by `matchId` and recompute aggregates. Emit `tournament.completed` for titles.

#### QA-11: Approving ignores max participants (Medium, G-13 extended)
- **Evidence:** 9 approved in an 8-max tournament; all approvals returned 200. `approveParticipant` (`tournaments.service.ts:127-136`) has no count check, and the draw then builds a 16-slot bracket.
- **Fix:** Check the approved count before approving. Show "x/8 approved, y pending".

#### QA-12: Group count isn't validated against entries (Medium, NEW)
- **Evidence:** 6 players with the default 4 groups → groups of 2/2/1/1. Only 2 group matches exist, yet the KO bracket has 8 slots (A1…D2) for 6 players.
- **Fix:** Require `players ≥ numberOfGroups × 3` (or at least `× advancePerGroup + 1`). Suggest a group count in the wizard.

#### QA-13: Email case-sensitivity (Medium, NEW)
- **Evidence:** `Luca.Bianchi@QA-club.test` registered as a second account (201). Logging in as `LUCA.Bianchi@…` → 401.
- **Fix:** Lower-case and trim the email in the DTO (`@Transform`) and add a unique index on `lower(email)`. Back-fill existing rows.

#### QA-14: Can't correct a recorded score in the UI (Medium, NEW as UI gap)
- **Evidence:** After the wrong winner was saved (3.2), the completed card had no click target and no edit action. The only fix was the API (which then double-advanced, QA-6).
- **Fix:** An "Edit result" action on completed matches whose next match isn't played yet, with the backend re-advance fix from QA-6.

#### QA-15: Seed endpoint is unvalidated (Medium, NEW)
- **Evidence:** `{seed:"abc"}` → 500 (`invalid input syntax for type integer`). `-5` and a duplicate `1` → 200. `tournaments.controller.ts:97` takes `@Body('seed') seed: number` with no DTO, which breaks the "DTO on every endpoint" convention.
- **Fix:** Add `AssignSeedDto { @IsInt() @Min(1) @Max(maxParticipants) seed }`, enforce unique seeds per tournament, and block seeding after the draw.

#### QA-16: Real tennis results can't be expressed (Medium, NEW)
- **Evidence:** 7-6(5) has nowhere to put the 5. A 10-8 match tiebreak is stored as a third "set". Retirement and walkover have no flag, so the bracket shows `3–6 2–1` with the trailing player as winner, and a walkover shows a winner with no score.
- **Fix:** Add `outcome: COMPLETED|RETIRED|WALKOVER|DEFAULT` and optional per-set `tb` points. Add RET/W.O. buttons in the score modal, and render "ret." and "w/o".

#### QA-17: Organiser can enroll a non-existent player (Medium, NEW)
- **Evidence:** `POST …/participants {playerId:"not-a-real-user"}` as the owner → 201, and a "not-a-re…" row appears. `enroll` (`tournaments.service.ts:108-125`) never validates the id.
- **Fix:** Validate `@IsUUID()` and existence (call auth-service or snapshot the name, see G-1). If walk-in guests are wanted, add an explicit "add guest by name" flow.

#### QA-18: No state machine on approve/reject (Low, NEW)
- **Evidence:** A WITHDRAWN entry was re-approved by the organiser (200), and then rejected (200).
- **Fix:** Allow only PENDING → APPROVED/REJECTED, and no participant changes after the draw except withdrawal.

#### QA-19: Withdrawal after the draw doesn't affect the bracket (Medium, NEW)
- **Evidence:** Tomas withdrew from T6 after the draw (200 WITHDRAWN). His R1 match vs Aiko is unchanged and still "SCHEDULED".
- **Fix:** On withdrawal after the draw, auto-record a walkover for the opponent, or prompt the organiser to substitute.

#### QA-20: Refresh token works as an access token on auth-service (Low, NEW)
- **Evidence:** `GET /api/auth/me` with `Authorization: Bearer <refreshToken>` → 200 with the profile. auth-service's JwtGuard doesn't check `type !== 'refresh'`.
- **Fix:** Reject tokens with `type === 'refresh'` in the guard and in `/auth/validate`.

#### QA-21: Misleading participant counter (Low, NEW)
- **Evidence:** "👥 11/8" with 1 approved and 10 pending or rejected (`TournamentDetailPage.jsx:146,231` use `participants.length`).
- **Fix:** Show approved/max, plus a pending count.

#### QA-22: Registration deadline not validated or shown (Low, G-13 partial)
- **Evidence:** Deadline 2026-12-20 with start 2026-12-12 accepted. The Overview tab doesn't show the deadline at all.
- **Fix:** Validate `deadline ≤ startDate`, display it, and enforce it (G-13).

#### QA-23: Tournaments page is unfiltered (Medium, G-16 + NEW)
- **Evidence:** A player sees 40+ cards, including other organisers' DRAFTs (one with an empty name), a 2020 event and test data. There is no search, status filter or date sort, despite the subtitle "Browse and apply to open tournaments".
- **Fix:** Server-side filter (G-16) plus filters for Open, Upcoming, Mine and Past.

#### QA-24: Weak input validation on names and tournaments (Low, NEW)
- **Evidence:** User names `"   "` and 5000×"A" → 201. `POST /tournaments` with `name: ""`, `endDate < startDate`, `minParticipants: 50 > max 8`, or 2020 dates → all 201. The wizard only guards end < start client-side.
- **Fix:** `@IsNotEmpty() @MaxLength(100)` with trim, plus cross-field validators on the tournament DTO.

#### QA-25: Raw throttler message in the login UI (Low, NEW)
- **Evidence:** The login form showed "ThrottlerException: Too Many Requests".
- **Fix:** Map 429 to "Too many attempts, try again in a minute." (Limiter scope: see S-7.)

#### QA-26: Gateway rough edges (Low, NEW)
- **Evidence:** `GET /api/tournaments` → `301 Location: http://127.0.0.1/api/tournaments/` (port 8080 lost, connection refused). An expired or garbage token on a public GET → nginx HTML 401 instead of JSON.
- **Fix:** `absolute_redirect off;` (or `port_in_redirect off`). Add an `error_page 401 = @json401`.

#### QA-27: Post-login landing (Low, NEW)
- **Evidence:** `LoginPage.jsx:27` and `RegisterPage.jsx:56` call `navigate("/")`, so the user sees the marketing hero with a "Go to Dashboard" button.
- **Fix:** `navigate("/dashboard")` (or back to the page that redirected to login).

#### QA-28: No eligibility rules (Low, NEW)
- **Evidence:** Emma and Sofia entered "Singles Men"; age group isn't checked (no DOB is captured).
- **Fix:** Product decision. At minimum show a warning, or capture gender and DOB.

#### QA-29: Max participants limited to powers of two (Low, NEW)
- **Evidence:** The wizard offers only 8/16/32/64, and the DTO has `@IsIn([8,16,32,64])`. A 5-player ladder must say "max 8".
- **Fix:** Allow any integer 2–128 for RR and Groups.

#### QA-30: Raw enums in the UI (Low, NEW)
- **Evidence:** The wizard summary and Overview show `HARD_OUTDOOR`, `SINGLES MEN`, `OPEN`, while the header correctly says "Hard (Outdoor)".
- **Fix:** Reuse the label map in `constants.js` everywhere.

#### QA-31: Organiser safety and navigation (Low, NEW)
- **Evidence:** "Generate Draw" runs without confirmation and locks entries. The "×" remove-from-draw buttons stay on unscored cards while the tournament is In Progress. On `/tournaments/:id` the sidebar lacks Profile, the user card and Sign out (only Dashboard/Tournaments), unlike the dashboard.
- **Fix:** Add a confirm dialog. Hide the draw-editing controls once any match is completed. Use the same sidebar component on every page.

#### QA-32 to QA-37: Already in the gap doc, re-confirmed by running them
- **QA-32 (G-2):** T1, T2 and T3 finished every match and stayed "In Progress", with no champion. The status can only be changed through the PATCH loophole (QA-34).
- **QA-33 (S-1/S-2/S-3):** Anonymous player create/patch/delete (201/200/204), a forged stats win visible in public stats and H2H, a phishing notification stored for Luca, and Luca's notifications readable by Sofia and by an anonymous caller.
- **QA-34 (S-6):** PATCH `status` (COMPLETED, OPEN, "BANANA"), `organiserId` takeover/transfer, and `startDate: "not-a-date"` → 500.
- **QA-35 (S-5):** Player Luca created "Luca Rogue Cup" (201).
- **QA-36 (G-1):** Participants table "PLAYER ID eb6bcf86…", bracket "Seed 1 / c9a95e…", group tables "fd275…".
- **QA-37 (G-4/G-5):** The DE tournament got a single-elim bracket with byes. The Mixed Doubles tournament got four singles entries.

---

## 4. Suggested priority

1. **Fix before any pilot:** QA-1 (events stall), QA-2 (mobile unusable), QA-33/S-1–S-3, QA-4, QA-6 + QA-7 + QA-14 (score integrity and correction), QA-32 (completion and champion), QA-36 (names).
2. **Make each advertised format actually work:** QA-8 (RR table), QA-9 (group → KO), QA-5 and QA-12 (group draw), QA-37 (hide DE/Doubles).
3. **Real-tennis scoring:** QA-16, QA-19. **Data quality:** QA-10, QA-11, QA-13, QA-15, QA-17.
4. Everything Low.

## 5. Test data left behind

The accounts and tournaments in §1 remain in the local DB, along with these leftovers: one ghost participant (`not-a-real-user`), a forged stats row and h2h for Luca vs Sofia, a phishing notification for Luca, ownership of "Autumn Five Knockout" moved to Hannah, and draft tournaments "Luca Rogue Cup", "Backwards", "" (empty name), "Impossible" and "Last Year". Riverside Winter Open's status was changed through PATCH (COMPLETED → OPEN → BANANA) and set back to IN_PROGRESS. 33 unconsumed messages are still sitting in each RabbitMQ queue.
