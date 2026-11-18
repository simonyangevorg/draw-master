# Draw Master (FPTC) — Gap Analysis & Launch Plan

_Audit date: 2026-11-18 · Baseline: `main` @ `fb0e83e` · Method: code read of controllers/DTOs, `frontend/src/App.jsx`, `pages/`, `api.js`, compose/Nginx/CI config. Nothing was run against production (no access)._

**What "launch" means here:** the web app is already deployed on Hostinger, but it isn't officially launched yet. In this plan, "launch" means two things:
1. **Web:** turn the live site into an official, supportable public product. First run a closed pilot with one club, then open it to everyone.
2. **Mobile:** ship the Capacitor Android app (`com.drawmaster.app`) on Google Play. iOS comes later and isn't part of this launch.

TICKETS.md (30 items, all closed) is out of scope and isn't repeated here.

---

## 1. Executive summary

- **The core organiser loop works through the UI**, but only for singles in Single Elimination, Round Robin or Group Stage + Knockout. The organiser can create a tournament (4-step wizard), open registration, approve or reject entries, generate the draw, edit it by drag-and-drop or tap, record scores, and winners advance automatically. Players can register, browse, apply and withdraw.
- **Launch blocker: the UI never shows a person's name.** Participants, brackets and group tables all show truncated UUIDs ("Player 3f9a1c", "Seed 2"). An organiser can't tell who applied, and a player can't find their opponent. Neither the participant record nor the tournament API has a name to show.
- **Launch blocker: tournaments can't finish.** No code path ever sets a tournament to `COMPLETED` (or `CANCELLED`), and no champion is shown. Every tournament stays "In Progress" forever.
- **Launch blocker: getting an organiser needs database access.** The only way to promote a user is the API `PATCH /auth/users/:id/role`, which needs the user's UUID. No UI calls it, and no endpoint lists users. The E2E setup itself promotes its organiser with SQL. Even so, the Register page tells users to "ask an existing organiser to upgrade your account".
- **Launch blocker: three services accept anonymous writes and reads.** player-service (create/update/delete players), stats-service (fake results, seedings) and notification-service (send to anyone, read anyone's notifications) never check who the caller is. The gateway lets requests with no token through.
- **Launch blocker: no backups, no password reset, no legal pages, no account deletion.** "Forgot password?" is `href="#"`. There's no privacy policy or terms page and no way to delete your data. Google Play requires the last two.
- **Launch blocker: the brand isn't presentable.** The browser title is "FPTC — F\*ck Pushers Tennis Club" while the app is called "Draw Master". The landing page also advertises player profiles, live stats, leaderboards, scheduling and notifications, and none of them exist.
- **The UI offers features the backend doesn't have.** Double Elimination silently produces a Single Elimination draw. Doubles events take single players with no partner field. Entry fee and prize pool are stored but nothing uses them.
- **Operations are entirely manual and unprotected.** Deploys are hand-run, every service uses `synchronize: true` (schema auto-mutates on deploy, with no migrations), there's no monitoring, error tracking or log rotation, and `JWT_SECRET` silently falls back to a public default if the env var is missing.

---

## 2. Feature inventory per role (what works end-to-end today)

"Works" means a user can reach it from the UI and the backend handles it.

### Guest / visitor (not logged in)
| Capability | Status | Evidence |
|---|---|---|
| Landing page | Works, but advertises features that don't exist | `frontend/src/pages/LandingPage.jsx:5-26` |
| Register as MEMBER or GUEST | Works (email + password ≥6, optional free-text Club ID) | `RegisterPage.jsx:5-18`, `auth-service/src/auth/dto/register.dto.ts` |
| Log in | Works (5 attempts/min per IP; see gap G-12 for the proxy caveat) | `auth.controller.ts:27-33` |
| View tournaments, draws or results without an account | **Not possible in UI.** Every route except `/`, `/login`, `/register` is behind `PrivateRoute`. The API itself allows public GETs. | `App.jsx:25-29`, `tournaments.controller.ts:22-38` |
| Forgot password | Dead link | `LoginPage.jsx:80-82` |

### Player (MEMBER / GUEST)
| Capability | Status | Evidence |
|---|---|---|
| Dashboard with own applications and counts | Works | `DashboardPage.jsx:16-17,119+` |
| Browse all tournaments, apply, cancel or withdraw | Works (singles only, no partner) | `TournamentsPage.jsx:16-42`, `TournamentDetailPage.jsx:62,75` |
| See approval status (pending/approved/rejected) | Works, in-page only. No notification. | `TournamentDetailPage.jsx:178-200` |
| View bracket or group tables | Works, but every player shows as an ID fragment or seed number | `BracketView.jsx:52`, `GroupStageView.jsx:16`, `TournamentDetailPage.jsx:357,406` |
| Own profile (`/profile`) | Read-only: name, email, role, participation counts. No edit, no password change, no stats. | `ProfilePage.jsx` |
| Match history, stats, rankings, head-to-head | **No UI.** The stats-service endpoints exist but the frontend never calls them. | `stats.controller.ts:39-60`; no `/api/stats` call in `frontend/src` |
| Notifications | **No UI.** In-app rows are stored for `match.completed` only. No email or push. | `notifications.controller.ts:12-35` |
| Report own score | Not supported (organiser-only) | `tournaments.service.ts:383-385` |

### Organiser (ORGANISER)
| Capability | Status | Evidence |
|---|---|---|
| Become an organiser | **Needs a DB update or a raw API call with the target's UUID.** No UI and no user lookup. | `auth.controller.ts:47-54`, `frontend/e2e/global-setup.js:30`, `RegisterPage.jsx:106` |
| Create tournament (4-step wizard: type, format, surface, dates, match rules, groups, fee and prize fields) | Works | `CreateTournamentPage.jsx`, `create-tournament.dto.ts` |
| Open registration → approve/reject → generate draw | Works | `TournamentDetailPage.jsx:45-56,81-87`, `tournaments.service.ts:89-191` |
| Single Elim (seeded slots, BYEs), Round Robin, Group + KO draws | Work. Group → KO qualifiers must be placed by hand into labelled slots (A1, B2…). | `tournaments.service.ts:220-350` |
| Double Elimination | **Offered, but silently generates Single Elimination** | `CreateTournamentPage.jsx:193`, `tournaments.service.ts:185-187` |
| Doubles / Mixed | **Offered, but entry has no partner selection** | `CreateTournamentPage.jsx:184-186`, `TournamentDetailPage.jsx:62` |
| Manual draw editing (drag-and-drop on desktop, tap-to-move on touch) | Works. Touch path not yet tested on a device. | `TournamentDetailPage.jsx:392-410` |
| Assign seeds | API only (`PATCH …/seed`). No UI. | `tournaments.controller.ts:95-99` |
| Record scores, auto-advance winner, emit `match.completed` | Works | `tournaments.service.ts:383-459` |
| Schedule matches (time or court) | API field `scheduledAt` only. No UI, and no courts model. | `update-match.dto.ts`, `match.entity.ts:319-320` |
| Edit, cancel or delete a tournament | API only (PATCH/DELETE). No UI. No cancel state transition. | `tournaments.controller.ts:49-60` |
| Complete a tournament or declare a champion | **Not implemented anywhere** | No assignment of `status='COMPLETED'` on a tournament in `tournaments.service.ts` |
| Grant organiser role to others | **No UI** | as above |

### Operator (whoever runs production)
| Capability | Status | Evidence |
|---|---|---|
| Deploy | Manual SSH + `docker compose up --build` on Hostinger. CI only tests. | `.github/workflows/ci.yml`; no deploy config in repo |
| TLS / public ingress | Not in repo. The gateway binds `127.0.0.1:8080`, so a host-level reverse proxy must exist on Hostinger. | `docker-compose.yml:62` |
| Health endpoints | Each service has `GET /health`, but they aren't routed through the gateway and compose has no app healthchecks | e.g. `tournaments.controller.ts:17` |
| Audit log | Exists for login failures, role changes, draw, delete and results. Written to stdout only. | `auth/audit-logger.service.ts`, `tournament-service/src/audit` |
| Backups, monitoring, error tracking, analytics, log rotation | **None** | no backup service or logging config in `docker-compose.yml`; no Sentry, analytics or logger library in any `package.json` |
| Admin tooling (users, roles, moderation) | **None.** Everything is done in psql via `docker compose exec`. | — |

---

## 3. Gap analysis

Severity: **LB** = Launch blocker (for the phase noted), **H** = High, **M** = Medium, **L** = Low. Effort: S ≤1 day, M = 2–5 days, L = more than a week (solo dev).

### 3a. Product features
| # | Gap | Evidence | Role hurt | Sev | Effort |
|---|---|---|---|---|---|
| G-1 | Player names never displayed. Participants table, brackets and group tables show UUID fragments or seed numbers. The participant record stores no name, and the tournament API doesn't join to auth users. | `TournamentDetailPage.jsx:338,357,406`; `BracketView.jsx:52`; `GroupStageView.jsx:16,137`; `participant.entity.ts` (no name column) | Organiser, player | **LB (P1)** | M (snapshot `playerName` on enroll from `X-User-Name`, plus a backfill) |
| G-2 | Tournament can never reach `COMPLETED`, and there's no champion view. `CANCELLED` exists as a type and a badge but has no transition. | `tournament.entity.ts:133`; no setter in `tournaments.service.ts`; `constants.js:5-6` | All | **LB (P1)** | S–M (auto-complete when final scored or RR finished, plus a manual "Finish/Cancel") |
| G-3 | No usable way to create organisers. No role-management UI, no user search, and no production bootstrap besides SQL. The Register page promises an upgrade path that doesn't exist. | `auth.controller.ts:47-54`; `RegisterPage.jsx:106`; `e2e/global-setup.js:30` | Organiser, operator | **LB (P1)** | S (documented bootstrap script) + M (in-app "request organiser" or a user-search-and-promote screen) |
| G-4 | Double Elimination offered but not implemented (silent fallback to SE) | `CreateTournamentPage.jsx:193`; `tournaments.service.ts:185-187`; DTO accepts it at `create-tournament.dto.ts:43` | Organiser | **H** (hide the option = S, a P1 blocker; implement = L, P3) | S / L |
| G-5 | Doubles and Mixed offered, but enrolment is single-player (partnerId exists in API, not in UI) | `CreateTournamentPage.jsx:184-186`; `enroll-participant.dto.ts`; `TournamentDetailPage.jsx:62` | Organiser, player | **H** (hide = S for P1; implement partner invite = M) | S / M |
| G-6 | No public, shareable tournament or bracket view for guests and spectators, even though the API GETs are public | `App.jsx:28` (`PrivateRoute`) | Guest, organiser (promotion) | H | S–M |
| G-7 | Notifications UI missing. Only `match.completed` creates notifications. No events for approved, rejected, draw published or schedule. No email or push delivery. | `notifications.controller.ts:12-35`; `tournaments.service.ts` emits only at `:456-457` | Player | H | M (in-app bell) / M (email) / L (push) |
| G-8 | No public player profile `/players/:id`, and no stats or leaderboard page (backend partly exists) | `App.jsx` (no route); `stats.controller.ts:39-60` | Player | M | M |
| G-9 | No match scheduling (time or court) UI and no court model | `match.entity.ts:319`; `update-match.dto.ts` | Organiser, player | M | M–L |
| G-10 | No UI to edit, delete or cancel a tournament or assign seeds | `tournaments.controller.ts:49-60,95-99`; no matching calls in `frontend/src` | Organiser | M | S–M |
| G-11 | Group → knockout qualifiers aren't auto-filled. The organiser drags them into slots by hand. | `tournaments.service.ts:312-339` (slot labels only) | Organiser | M | M |
| G-12a | Score entry isn't validated: `winnerId` isn't checked against the match participants, set scores aren't validated, and re-scoring a completed match pushes a second winner into the next match | `update-match.dto.ts`; `tournaments.service.ts:390-401` | Organiser | H | S |
| G-13 | Registration deadline isn't enforced, and pending applications aren't capped (only approved count against max) | `tournaments.service.ts:108-125` | Organiser | L | S |
| G-14 | Entry fee and prize pool are captured but have no payment flow | `CreateTournamentPage.jsx:323-327` | Organiser | L (P1) / product decision | L |
| G-15 | Profile is read-only: no name, email or password change | `ProfilePage.jsx` | Player | M | S–M |
| G-16 | `GET /tournaments` returns every tournament, including other organisers' `DRAFT` and `isPublic=false` ones. `isPublic` is ignored. | `tournaments.service.ts:41-43` | Organiser (privacy) | M | S |
| G-17 | "Club ID" is free text with no club entity, so it's meaningless to users | `RegisterPage.jsx:153-163`; `user.entity.ts:186` | Player | L (or H if multi-club is the model, see Q3) | S to hide / L for a clubs model |

### 3b. UX / brand
| # | Gap | Evidence | Sev | Effort |
|---|---|---|---|---|
| U-1 | Page title is "FPTC — F\*ck Pushers Tennis Club". The web brand (FPTC logo) doesn't match the app name "Draw Master". | `frontend/index.html:6`; `LandingPage.jsx` (`alt="FPTC"`); `mobile/capacitor.config.json:3` | **LB (P1)** | S (once the name is decided, see Q1) |
| U-2 | Landing page claims player profiles, rankings, live stats, leaderboards, scheduling and notifications. None exist. | `LandingPage.jsx:5-26` | **LB (P1)** | S |
| U-3 | No 404 route. Unknown URLs render blank. | `App.jsx:21-30` | L | S |
| U-4 | Touch bracket editor and collapsed mobile nav never tested on a real device or emulator | memory note / commit `2d0b90a` | H (for P2) | S (test session) |
| U-5 | No onboarding or help: an empty dashboard for new players, and no explanation of how to become an organiser | `DashboardPage.jsx`; `RegisterPage.jsx:106` | M | S |
| U-6 | English only, no i18n layer | `index.html:2` (`lang="en"`); hardcoded strings | Depends on Q4 | L |

### 3c. Security
| # | Gap | Evidence | Sev | Effort |
|---|---|---|---|---|
| S-1 | player-service: anonymous `POST/PATCH/DELETE /players`. The gateway forwards tokenless requests, and the service has no identity check. | `players.controller.ts:23-43`; `nginx.conf:98-111` | **LB (P0)** | S (block writes at Nginx or require role) |
| S-2 | stats-service: no JWT gate at all, so anyone can `POST /stats/results` and `/stats/seedings` | `nginx.conf:114-120`; `stats.controller.ts:33-55` | **LB (P0)** | S |
| S-3 | notification-service: anyone can `POST /notifications/notify` to any recipient, and `GET /notifications/:recipientId` doesn't check that the caller is the recipient | `notifications.controller.ts:44-53` | **LB (P0)** | S |
| S-4 | `JWT_SECRET` falls back to the public default `fptc_super_secret_change_in_prod` if the env var is unset, which allows token forgery | `auth-service/src/auth/auth.module.ts:15`; `tournament-service/src/app.module.ts:20` | **LB (P0)**: confirm prod `.env` now; fail fast on boot | S |
| S-5 | `POST /tournaments` doesn't check the ORGANISER role. Any logged-in user can create tournaments through the API, and the UI only hides the button. | `tournaments.controller.ts:42-47`; `tournaments.service.ts:54` | H, or a feature (see Q5) | S |
| S-6 | `PATCH /tournaments/:id` takes `Partial<CreateTournamentDto>`, so ValidationPipe skips validation. The owner can overwrite `status` (bypassing lifecycle guards), `organiserId` and so on. | `tournaments.controller.ts:51`; `tournaments.service.ts:74-79` | M | S (`PartialType` DTO) |
| S-7 | Rate limiting: only login is throttled. With the Hostinger host proxy in front of the gateway, `trust proxy 1` probably keys every client on the proxy's IP, so 5 logins per minute *site-wide*. Register and refresh aren't throttled, and Nginx has no `limit_req`. | `auth-service/src/main.ts:7`; `auth.controller.ts:22-39`; `nginx.conf` | H (verify on prod) | S |
| S-8 | Refresh tokens last 30 days and can't be revoked. Logout is client-side only. A role downgrade takes effect only when the 1-hour access token expires. | `auth.service.ts:131-132`; `AuthContext.jsx:82-85` | M | M |
| S-9 | No email verification, password minimum is 6 characters, and there's no CAPTCHA, so signups are easy to spam | `register.dto.ts:13`; `auth.service.ts:58-73` | M | M (needs the email provider) |
| S-10 | CSP still allows `unsafe-eval`/`unsafe-inline` "for Vite dev", but prod now serves a static build | `nginx.conf:32-33`; `frontend/Dockerfile` | L | S |

### 3d. Platform / operational readiness
| # | Gap | Evidence | Sev | Effort |
|---|---|---|---|---|
| O-1 | **No database backups.** There's one `postgres_data` volume, with no dump job, no off-site copy and no restore drill. | `docker-compose.yml:13` | **LB (P0)** | S |
| O-2 | `synchronize: true` in all 5 services, so the schema auto-alters on every deploy and an entity change can drop columns. There are no migrations. | `*/src/app.module.ts` (auth:12, player:12, tournament:16, stats:13, notification:12) | H (mitigate in P0 with a pre-deploy dump; migrations by P2) | M |
| O-3 | No password reset and no email provider anywhere | `LoginPage.jsx:80`; no mail library in any service | **LB (P1)** | M |
| O-4 | No privacy policy, terms, or contact/support page | no routes in `App.jsx`; no links in the footer | **LB (P1)** (GDPR if EU users; required by Play) | S (dev) + legal text (user) |
| O-5 | No account deletion or data export, in the app or on the web. Required by Google Play for apps with account creation. | no endpoint in `auth.controller.ts` | **LB (P2)**, H for P1 | M (cross-service: auth user, participations, stats, notifications) |
| O-6 | No uptime monitoring or alerting | — | H | S (external pinger; user creates the account) |
| O-7 | No error tracking (frontend or backend) | no Sentry or similar in `package.json` files | M | S–M |
| O-8 | No product analytics (signups, tournaments created, matches scored) | — | M | S (privacy-friendly; ties to the consent decision) |
| O-9 | Deploy is fully manual and undocumented. There's no tagged release, no rollback procedure and no staging. Nginx caches upstream DNS, so the gateway must be restarted after any service is recreated. | `.github/workflows/ci.yml` (test only); `nginx.conf:6-11` | H | S (runbook + script) / M (CI deploy over SSH) |
| O-10 | `ALLOWED_ORIGINS` is a placeholder in `.env.example`. Prod value unknown. The mobile app (`androidScheme: http`, origin `http://localhost`) needs that origin in auth-service CORS or mobile login/register fails. | `.env.example`; `auth-service/src/main.ts:8`; `capacitor.config.json:5`; `nginx.conf:17-22` | **LB (P2)**; verify in P0 | S |
| O-11 | No Docker log rotation, so json-file logs grow until the disk fills | `docker-compose.yml` (no `logging:`) | M | S |
| O-12 | No app-level healthchecks in compose, and the gateway doesn't expose a `/health` | `docker-compose.yml` | L | S |
| O-13 | No admin tooling. User support (reset, role, delete) means psql on the prod box. | — | M | M |
| O-14 | Stale docs: CLAUDE.md and `mobile/README.md` say the gateway is on host port 80, but compose binds `127.0.0.1:8080`. The init script still creates the dead `matches` DB. | `docker-compose.yml:62`; `infra/postgres/init-multiple-dbs.sh` | L | S |
| O-15 | player-service is disconnected from real users. Enrolment uses the auth user id, the `players` table is unused by the UI, and the claimed Redis cache isn't used. | `TournamentDetailPage.jsx:62`; `player-service/src` (no Redis usage) | L (tech debt; decide in P3) | — |

### 3e. Mobile store readiness (Android)
| # | Gap | Evidence | Sev | Effort |
|---|---|---|---|---|
| M-1 | No release signing config or upload keystore. `versionCode 1`, `minifyEnabled false`. | `mobile/android/app/build.gradle:10-21` | **LB (P2)** | S (dev) + keystore custody (user) |
| M-2 | Launcher icons and splash are still the Capacitor defaults (unchanged since scaffold `c8adfcf`) | `mobile/android/app/src/main/res/mipmap-*` | **LB (P2)** | S |
| M-3 | Prod build must set `VITE_API_BASE_URL` to the public HTTPS gateway URL. Not documented for prod. | `frontend/src/config.js:7`; `mobile/README.md` | **LB (P2)** | S |
| M-4 | Play Console account, Data Safety form, content rating, privacy policy URL, account-deletion URL, store listing assets. New personal accounts also need a closed test (≥12 testers for 14 days) before production. | — | **LB (P2)**, owned by the user | M (calendar time) |
| M-5 | `allowBackup="true"` backs up the WebView localStorage, including the 30-day refresh token | `AndroidManifest.xml:5` | L | S |
| M-6 | No push notifications (deferred Phase 6) | mobile plan | L for P2 | L |

---

## 4. Launch plan

Phases run in order. Each phase's exit criteria gate the next one. Owner "Dev" means the solo developer (with Claude). Owner "User" means account, legal, billing or prod-server actions only the product owner can take.

### Phase 0: Harden the current live web (no new features)
**Goal:** make the live site safe to keep running and recoverable.

| Item | Gaps | Owner |
|---|---|---|
| Confirm prod `.env`: strong `JWT_SECRET`, real `ALLOWED_ORIGINS`, non-default DB and RabbitMQ passwords. Make services refuse to boot without `JWT_SECRET`. | S-4, O-10 | User (verify on server) + Dev (fail-fast) |
| Close anonymous write/read on player, stats and notification services. Block writes at Nginx, or require role or identity headers in the services. | S-1, S-2, S-3 | Dev |
| Nightly `pg_dumpall` to off-box storage, plus a documented restore drill done once | O-1 | Dev (script) + User (storage account, cron on server) |
| Deploy/rollback runbook (section 4.6) and a release tag per deploy | O-9 | Dev |
| Fix the throttler client-IP keying behind the host proxy. Throttle register and refresh. Add basic Nginx `limit_req` on `/api/auth/`. | S-7 | Dev (+ User to confirm proxy topology) |
| Docker log rotation; external uptime check on `/` and one API GET | O-11, O-6 | Dev + User (monitor account) |
| Script and document the first-organiser bootstrap (one-off psql command in the runbook) | G-3 (stopgap) | Dev |

**Exit criteria:** anonymous POST/PATCH/DELETE on `/api/players`, `/api/stats`, `/api/notifications` all return 401/403. A backup has been restored successfully into a scratch DB. Prod `.env` confirmed with no defaults. Runbook used for at least one real deploy. An uptime alert reaches the user.
**Dependencies:** user SSH access to Hostinger. Knowledge of the host reverse proxy config.

### Phase 1: Soft launch (pilot club), then public web
**Goal:** one real club runs a real tournament from signup to champion without anyone touching the DB. Then the site opens publicly.

| Item | Gaps | Owner |
|---|---|---|
| Show player names everywhere: participants, bracket, groups, approvals | G-1 | Dev |
| Finish/cancel a tournament, plus a champion and final-standings view | G-2 | Dev |
| Organiser path: user search + promote screen for organisers, **or** a product decision that anyone can create tournaments (Q5), then align S-5 | G-3, S-5 | User decides → Dev |
| Hide Double Elimination and Doubles/Mixed until they're built. Hide or relabel fee/prize fields (Q6). | G-4, G-5, G-14 | Dev |
| Score validation and safe re-scoring | G-12a | Dev |
| Pick the brand. Fix the title, logo and landing copy to describe only real features. | U-1, U-2 | User (name) → Dev |
| Email provider + password reset (+ optional email verification) | O-3, S-9 | User (provider account, sending domain DNS) → Dev |
| Privacy policy, terms and contact pages, linked from the landing page, register page and footer | O-4 | User (legal text) → Dev (pages) |
| Public read-only tournament page / share link | G-6 | Dev |
| Error tracking + minimal analytics (signup, tournament created, draw generated, match scored) | O-7, O-8 | User (accounts) → Dev |
| Edit/cancel tournament UI, `isPublic`/DRAFT filtering, 404 page, `PartialType` DTO fix | G-10, G-16, U-3, S-6 | Dev |
| Admin runbook entries for support tasks: reset password, change role, delete user | O-13 (stopgap) | Dev |

**Exit criteria:** the pilot organiser runs at least one full tournament (registration → draw → all results → completed, champion shown) with zero DB edits. A pilot player can reset their own password. The privacy and terms URLs are live. No error-tracker issue at P1 severity stays open more than 48 hours. The landing page makes no claims about features that don't exist.
**Dependencies:** Phase 0 complete. Brand name (Q1). Email provider. Legal text.

### Phase 2: Android store launch
**Goal:** Draw Master is live on Google Play, pointed at production.

| Item | Gaps | Owner |
|---|---|---|
| Account deletion, in the app and as a web URL, across all services | O-5 | Dev |
| Prod mobile build: `VITE_API_BASE_URL=https://<prod-domain>`, `http://localhost` in `ALLOWED_ORIGINS` and the Nginx CORS map, verified against prod | M-3, O-10 | Dev + User (server `.env`) |
| Icons, splash, `versionCode`/`versionName` policy, release signing config, R8 on and tested, `allowBackup` reviewed | M-1, M-2, M-5 | Dev; **User keeps the upload keystore and password backed up** |
| Real-device QA: touch bracket editor, mobile nav, login/refresh, keyboard and back button | U-4 | Dev + User (device) |
| Play Console account ($25), store listing, screenshots, Data Safety form, content rating, privacy and deletion URLs | M-4 | User |
| Internal → closed testing track (≥12 testers for 14 days if it's a personal account) → production | M-4 | User (recruit testers) + Dev (fixes) |
| Switch to TypeORM migrations before the app is in users' hands (old app versions make schema drift riskier) | O-2 | Dev |

**Exit criteria:** production release approved on Play. Login, apply and score work on at least 2 physical Android devices against prod. The deletion URL works. Crash/error reporting is visible for the mobile build.
**Dependencies:** Phase 1 complete (privacy URL, brand, names visible). Play Console verification can take days, so the user should start it during Phase 1.

### Phase 3: Growth (prioritise from pilot feedback)
Candidates, roughly by expected value: notifications UI + email notifications for approve/reject/draw/result (G-7) · player profile `/players/:id` + stats/leaderboard (G-8) · match scheduling and courts (G-9) · auto group→KO advancement (G-11) · doubles with partner invite (G-5) · Double Elimination (G-4) · player score reporting with organiser confirmation · push notifications (M-6) · entry-fee payments (G-14, Q6) · clubs model / multi-club (G-17, Q3) · iOS build (needs Mac or cloud runner + Apple Developer account) · i18n (U-6, Q4) · CI deploy over SSH + staging (O-9) · admin console (O-13) · revocable refresh tokens (S-8).

**Exit criteria:** set per item. Suggested phase-level KPI: tournaments completed per month and repeat organisers.

### 4.5 Pre-launch checklist (before announcing the web launch, and again before Play production)
- [ ] Prod `.env`: `JWT_SECRET` is 64+ random hex and differs from dev and CI; DB and RabbitMQ passwords aren't the example values; `ALLOWED_ORIGINS` is the real domain (+ `http://localhost` once mobile ships)
- [ ] HTTPS valid on the domain. Host proxy forwards `X-Forwarded-For`/`-Proto`. HSTS `includeSubDomains` is OK for every subdomain on that domain.
- [ ] Anonymous write probes on players, stats and notifications return 401/403
- [ ] Login throttle tested from two different client IPs (not a shared bucket)
- [ ] Latest backup is under 24 hours old, and a restore was tested this release cycle
- [ ] Uptime monitor and error tracker alerting to the user's phone or email
- [ ] First organiser account exists, and the promotion procedure is documented
- [ ] Brand: title, logo and landing copy final, with no claims about unbuilt features
- [ ] Privacy, terms and contact pages live and linked. Deletion path works (for Play).
- [ ] Password reset email arrives (check the spam folder; SPF/DKIM set on the sending domain)
- [ ] Double Elimination and Doubles hidden (unless built)
- [ ] Full dry run on prod with test accounts: register → promote → create → open → apply ×N → approve → draw → score all → completed. Delete the test data afterwards.
- [ ] CI green on the release commit. Commit tagged.

### 4.6 Launch-day / deploy & rollback checklist (manual Hostinger docker compose)
**Deploy**
1. Announce a maintenance window if there will be downtime. Note the current commit: `git rev-parse HEAD > ~/last_good_commit`.
2. **Back up first:** `docker compose exec -T postgres pg_dumpall -U $POSTGRES_USER | gzip > ~/backups/pre-deploy-$(date +%F-%H%M).sql.gz`. Check the file isn't empty. (This is mandatory because `synchronize: true` can change the schema on boot.)
3. `git fetch --tags && git checkout <release-tag>`
4. Build before stopping anything: `docker compose build`
5. `docker compose up -d`
6. **`docker compose restart api-gateway`.** Nginx caches upstream IPs, and recreated services otherwise return 404 through the gateway.
7. Smoke test via the public URL: landing loads; `GET /api/tournaments/` returns 200; log in as the test account; open a tournament detail; check a draw renders. `docker compose ps` should show everything healthy with no restart loops.
8. Watch `docker compose logs -f --since 10m` and the error tracker for 15 minutes.

**Rollback** (trigger: smoke test fails, error spike, or data looks wrong)
1. `git checkout $(cat ~/last_good_commit) && docker compose build && docker compose up -d && docker compose restart api-gateway`
2. If the new release changed entities (schema), or the data looks wrong: `docker compose stop` the app services, restore the pre-deploy dump into Postgres, then start them again. Expect to lose writes made since the backup, and tell users.
3. Re-run the smoke test. Record what failed before trying again.

**Mobile release day:** roll out on Play in stages (for example 20% → 100%). The backend must stay compatible with the previous app version, so no breaking API changes in the same release. The keystore isn't on the build machine alone.

---

## 5. Open questions for the product owner

1. **Brand:** Is the public product "Draw Master", "FPTC", or something else? Can the current page title, which contains profanity, go?
2. **Target market and geography:** which country or countries? This decides GDPR applicability, language, currency and the legal entity named in the privacy policy.
3. **Single club or multi-club platform?** If multi-club: do clubs become real entities with their own admins, and does "Club ID" at signup mean anything?
4. **Languages:** English only for launch, or local language(s) from day one?
5. **Who may organise?** Anyone (self-serve, the current API behaviour) or vetted organisers only (needs a request/approval flow and someone to approve)? Who is the first production organiser?
6. **Monetization:** free, an organiser subscription, a per-tournament fee, or a cut of entry fees? Should players pay entry fees in the app (this needs a payment provider and changes legal and Play requirements), or is the fee informational only?
7. **Pilot:** which club and tournament is the first real pilot, and when? This sets the Phase 1 deadline.
8. **Spectators:** should brackets and results be public by default (shareable links, SEO), or members-only?
9. **Notifications priority after launch:** email first, or push first (push needs Firebase setup and Phase 6)?
10. **iOS:** is it needed for the target market at launch, or is Android-only acceptable? (Needs a Mac or cloud build runner plus a $99/yr Apple account.)
11. **Operations:** who gets woken up when the site is down? Is the Hostinger plan a VPS with enough disk and RAM for 5 services + Postgres + RabbitMQ + Redis, and does it include snapshots?
12. **Formats:** are Double Elimination and doubles events needed for the pilot, or can they stay hidden until Phase 3?
