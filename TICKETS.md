# FPTC — Issue Tickets

Generated from full team review (Code Reviewer 👁️ · QA Specialist 🧪 · Security Engineer 🔒).

---

## 🔴 Critical

---

### TICKET-001 — Add rate limiting to login endpoint
**Specialist:** Security Engineer 🔒  
**File:** `auth-service/src/auth/auth.controller.ts`  
**Problem:** `POST /auth/login` has zero rate limiting. Unlimited password attempts per IP — open to credential stuffing and brute force.  
**Fix:** Install `@nestjs/throttler`, register `ThrottlerModule.forRoot([{ ttl: 60000, limit: 5 }])` in `AuthModule`, apply `@Throttle()` to the login endpoint.

---

### TICKET-002 — Move all secrets out of docker-compose.yml into .env
**Specialist:** Security Engineer 🔒  
**File:** `docker-compose.yml`  
**Problem:** `JWT_SECRET`, `POSTGRES_PASSWORD`, `RABBITMQ_DEFAULT_PASS` are hardcoded and committed to git history. JWT secret allows forging tokens for any user with any role.  
**Fix:** Create `.env` (gitignored), reference values with `${VAR}` in compose. Add `.env.example` with placeholder values. Rotate all secrets immediately.

---

### TICKET-003 — Remove infrastructure port exposure from docker-compose
**Specialist:** Security Engineer 🔒  
**File:** `docker-compose.yml`  
**Problem:** Postgres (`5432`), RabbitMQ (`5672`, `15672`), and auth-service (`8006`) are all exposed to the host. In any non-local deployment an attacker on the same network can hit the DB, MQ management UI, and bypass Nginx directly.  
**Fix:** Remove all host port mappings except `80:80`. Services communicate over Docker's internal network only.

---

### TICKET-004 — Restrict ORGANISER role self-assignment at registration
**Specialist:** Code Reviewer 👁️ · Security Engineer 🔒  
**File:** `auth-service/src/auth/dto/register.dto.ts`  
**Problem:** Any user can register with `role: "ORGANISER"` and immediately gain full tournament management privileges.  
**Fix:** Remove `ORGANISER` from the allowed values in `RegisterDto`. Default all new users to `MEMBER`. Add a separate admin-only endpoint or invite flow for granting ORGANISER role.

---

### TICKET-005 — Verify playerId ownership on enroll endpoint
**Specialist:** Code Reviewer 👁️ · Security Engineer 🔒  
**File:** `tournament-service/src/tournaments/tournaments.controller.ts:73`  
**Problem:** Any authenticated user can enroll any `playerId` — including other users. The requesting user's identity is never checked against `dto.playerId`.  
**Fix:** Pass `user.sub` into `enroll()`. In the service, validate `dto.playerId === requesterId` (or requesterId is an organiser).

---

### TICKET-006 — Persist match-service, stats-service, notification-service data to PostgreSQL
**Specialist:** Code Reviewer 👁️  
**Files:** `match-service/src/matches/matches.service.ts`, `stats-service/src/stats/stats.service.ts`, `notification-service/src/notifications/notifications.service.ts`  
**Problem:** All three services use in-memory Maps/arrays. All data is lost on every container restart. Each service already has a dedicated Postgres DB configured in docker-compose but never uses it.  
**Fix:** Add TypeORM entities and repositories to each service, following the same pattern as `tournament-service`.

---

### TICKET-007 — Fix `remove()` not awaited in player-service controller
**Specialist:** Code Reviewer 👁️ · QA Specialist 🧪  
**File:** `player-service/src/players/players.controller.ts:41`  
**Problem:** `this.playersService.remove(id)` is called without `return`. The Promise is fire-and-forget — errors are silently swallowed and the caller receives 204 even if the delete failed.  
**Fix:** Change to `return this.playersService.remove(id)`.

---

## 🟠 High

---

### TICKET-008 — Set JWT expiry and implement token refresh
**Specialist:** Security Engineer 🔒  
**File:** `auth-service/src/auth/auth.service.ts:64`  
**Problem:** `jwtService.sign(payload)` has no `expiresIn`. Tokens are valid indefinitely — a stolen token never expires.  
**Fix:** Add `signOptions: { expiresIn: '1h' }` to `JwtModule` config. Implement a refresh token endpoint for long-lived sessions.

---

### TICKET-009 — Constrain JWT algorithm to HS256 explicitly
**Specialist:** Security Engineer 🔒  
**Files:** `auth-service/src/auth/jwt.guard.ts`, `auth-service/src/auth/auth.controller.ts`  
**Problem:** `jwtService.verify(token)` is called without specifying allowed algorithms. Leaves open `alg:none` or algorithm confusion attacks depending on library version.  
**Fix:** Pass `{ algorithms: ['HS256'] }` to every `verify()` call.

---

### TICKET-010 — Fix Round Robin `round` counter — all RR matches should be round 1
**Specialist:** Code Reviewer 👁️ · QA Specialist 🧪  
**File:** `tournament-service/src/tournaments/tournaments.service.ts:258`  
**Problem:** `round` is incremented per match (`round++`), producing rounds 1–N instead of all matches being in round 1. Frontend and stats-service treat `round` as a grouping axis, creating N phantom rounds.  
**Fix:** Remove the incrementing counter. Set `round: 1` for all RR matches; use `position` (already incrementing via `all.length`) to distinguish them.

---

### TICKET-011 — Fix surface tracking in stats-service
**Specialist:** Code Reviewer 👁️  
**File:** `stats-service/src/stats/stats.service.ts:28`  
**Problem:** `surfaceWins` only has keys `clay`, `grass`, `hard`. Tournament surfaces include `HARD_OUTDOOR`, `HARD_INDOOR`, `CARPET`, `ACRYLIC`, etc. After `.toLowerCase()` most never match — stats silently dropped.  
**Fix:** Normalize surface before lookup: `'hard_outdoor'` and `'hard_indoor'` → `'hard'`; expand `surfaceWins` keys or use a normalization map.

---

### TICKET-012 — Write tests for auth-service
**Specialist:** QA Specialist 🧪  
**File:** `auth-service/src/` (no test files exist)  
**Problem:** Zero test coverage on the service that gates all protected routes. The `validate` endpoint behavior (valid/expired/missing token) is completely untested.  
**Scope:** Unit tests for `register` (duplicate email, role validation), `login` (wrong password, unknown user), `validate` (valid token → headers set, expired token → 401, no token → 200 no headers).

---

### TICKET-013 — Write tests for player, match, stats, notification services
**Specialist:** QA Specialist 🧪  
**Problem:** Four services have zero test coverage.  
**Scope:** At minimum: happy path + not-found + auth failure for each service's key endpoints.

---

## 🟡 Medium

---

### TICKET-014 — Restrict CORS on auth-service to known origins
**Specialist:** Security Engineer 🔒  
**File:** `auth-service/src/main.ts:7`  
**Problem:** `app.enableCors()` with no config allows all origins. Auth-service issues JWTs — open CORS on a token-issuing endpoint is a liability.  
**Fix:** `app.enableCors({ origin: process.env.ALLOWED_ORIGINS?.split(',') })`.

---

### TICKET-015 — Add security headers to Nginx
**Specialist:** Security Engineer 🔒  
**File:** `api-gateway/nginx.conf`  
**Problem:** No `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Content-Security-Policy`, or `Strict-Transport-Security` headers.  
**Fix:** Add `add_header` directives to the Nginx server block for all required headers.

---

### TICKET-016 — Block external access to `auth/validate` endpoint
**Specialist:** Security Engineer 🔒  
**File:** `api-gateway/nginx.conf`  
**Problem:** `GET /api/auth/validate` is publicly callable through Nginx. It's intended only for internal Nginx `auth_request` subrequests.  
**Fix:** Add `location /api/auth/validate { deny all; }` before the `/api/auth/` block in Nginx config.

---

### TICKET-017 — Add audit logging for security-relevant actions
**Specialist:** Security Engineer 🔒  
**Problem:** No logging of failed login attempts, organiser actions (approve/reject/withdraw/generate draw/record results), or tournament deletions. No audit trail exists.  
**Fix:** Add structured log entries (actorId, action, targetId, timestamp) on all state-changing endpoints. Use a dedicated audit logger separate from application logs.

---

### TICKET-018 — Wrap `updateMatch` winner advancement in a transaction
**Specialist:** Code Reviewer 👁️  
**File:** `tournament-service/src/tournaments/tournaments.service.ts:378`  
**Problem:** Match save and next-round advancement are two separate DB writes with no transaction. If the second write fails, the match is marked COMPLETED but the winner is never advanced — unrecoverable silent corruption.  
**Fix:** Use a TypeORM `QueryRunner` to wrap both saves in a single transaction.

---

### TICKET-019 — Add tournament lifecycle status transition guards
**Specialist:** Code Reviewer 👁️ · QA Specialist 🧪  
**File:** `tournament-service/src/tournaments/tournaments.service.ts:84, 78`  
**Problem:** `open()` can be called on `IN_PROGRESS` or `COMPLETED` tournaments, resetting status to `OPEN`. `remove()` can delete tournaments that are actively in progress.  
**Fix:** Add explicit status checks at the top of `open()` and `remove()`.

---

### TICKET-020 — Add integration tests with real database
**Specialist:** QA Specialist 🧪  
**Problem:** All existing tests mock repositories. The in-memory storage bug in match/stats/notification services would never be caught because mocks always return data. Integration tests hitting a real test DB are the only way to catch persistence-class bugs.  
**Fix:** Set up a test Postgres container in CI. Write at minimum one integration test per service that verifies data survives a service restart.

---

### TICKET-021 — Add E2E tests for critical frontend flows
**Specialist:** QA Specialist 🧪  
**Problem:** Zero Playwright coverage. Entire frontend is untested.  
**Priority flows:** Register → Login → Create Tournament → Open → Enroll → Generate Draw → Record Score, and Organiser approve/reject participant.

---

### TICKET-022 — Add regression test for enroll authorization gap
**Specialist:** QA Specialist 🧪  
**File:** `tournament-service/src/tournaments/tournaments.service.spec.ts`  
**Problem:** No test verifying that User A cannot enroll User B. The security fix for TICKET-005 must be paired with a test demonstrating the vulnerability first.  
**Fix:** Write a failing test before implementing the fix. Test that `enroll()` throws `ForbiddenException` when `dto.playerId !== requesterId`.

---

### TICKET-023 — Resolve match-service architecture — connect or remove
**Specialist:** Code Reviewer 👁️  
**File:** `match-service/`  
**Problem:** match-service has its own DB, controller, and endpoints but is 100% bypassed. Tournament-service manages all match entities directly. The two models will diverge silently.  
**Decision needed:** Either (a) delete match-service and own matches in tournament-service explicitly, or (b) move match management into match-service and have tournament-service call it via HTTP.

---

## 🟢 Low / Nit

---

### TICKET-024 — Add UUID validation pipe on all path parameters
**Specialist:** Code Reviewer 👁️  
**Problem:** `@Param('id')` accepts any string. Non-UUID values trigger a DB query that returns 500 instead of 400.  
**Fix:** Apply `new ParseUUIDPipe()` to all `:id`, `:pid`, `:matchId` params across all controllers.

---

### TICKET-025 — Batch DB saves in `generateGroupStage` and `swapParticipants`
**Specialist:** Code Reviewer 👁️  
**File:** `tournament-service/src/tournaments/tournaments.service.ts:277, 341`  
**Problem:** Participants saved one-by-one in a loop during group stage generation. Matches saved one-by-one during swap. With 64 players this is 64 individual UPDATE calls.  
**Fix:** Collect modified entities and call `repo.save(array)` once.

---

### TICKET-026 — Extract shared constants from Dashboard and TournamentDetail pages
**Specialist:** Code Reviewer 👁️  
**Files:** `frontend/src/pages/DashboardPage.jsx`, `frontend/src/pages/TournamentDetailPage.jsx`  
**Problem:** `STATUS_BADGE` and `SURFACE_LABEL` objects are duplicated in both files.  
**Fix:** Extract to `frontend/src/constants.js`.

---

### TICKET-027 — Replace `confirm()` dialog with inline confirmation UI
**Specialist:** Code Reviewer 👁️  
**File:** `frontend/src/pages/TournamentDetailPage.jsx:81`  
**Problem:** Native `confirm()` is blocked in iframes and inconsistent across browsers.  
**Fix:** Replace with a small inline confirmation component.

---

### TICKET-028 — Add missing test assertions on Round Robin `round` field values
**Specialist:** QA Specialist 🧪  
**File:** `tournament-service/src/tournaments/tournaments.service.spec.ts:542`  
**Problem:** RR tests only assert match count, not `round` values. The RR `round` counter bug (TICKET-010) slipped through because no test checks the field.  
**Fix:** Add `expect(matches.every(m => m.round === 1)).toBe(true)` to the RR test suite.

---

### TICKET-029 — Add index on `participants.playerId` column
**Specialist:** Code Reviewer 👁️  
**File:** `tournament-service/src/tournaments/entities/participant.entity.ts`  
**Problem:** `getMyParticipations()` does a full table scan on `playerId` with no index. Called on every dashboard load.  
**Fix:** Add `@Index()` decorator to the `playerId` column.

---

### TICKET-030 — Add `.gitattributes` to normalize line endings
**Specialist:** Code Reviewer 👁️  
**Problem:** Git warned about LF→CRLF conversion on every file during the initial commit. Without a `.gitattributes`, line ending behaviour depends on each developer's `core.autocrlf` setting — causing noise in diffs and VS Code Source Control confusion.  
**Fix:** Add `.gitattributes` with `* text=auto eol=lf`.

---

## Summary

| Tickets | Severity | Primary Owner |
|---|---|---|
| 001–007 | 🔴 Critical | 🔒 Security / 👁️ Code Review |
| 008–013 | 🟠 High | 🔒 Security / 🧪 QA |
| 014–023 | 🟡 Medium | 🔒 Security / 👁️ Code Review / 🧪 QA |
| 024–030 | 🟢 Low / Nit | 👁️ Code Review / 🧪 QA |

**Total: 30 tickets**
