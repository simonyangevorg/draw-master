# DrawMaster — Tennis Tournament Platform

Full-stack tennis tournament management platform (product name **DrawMaster**, live at drawmaster.cloud; FPTC is its first club, not the product). NestJS microservices backend, React frontend, all containerized with Docker Compose.

The roadmap is `docs/product/dev-team-plan.md` (task IDs B-xx, F-xx, L-xx); operations are in `docs/ops/runbook.md`.

---

## Stack

### Backend (per service)
- **Runtime:** Node.js + TypeScript
- **Framework:** NestJS 10
- **ORM:** TypeORM 0.3 with PostgreSQL 16. **Schema is owned by migrations** (`src/migrations/`, run on boot); `synchronize` is off everywhere
- **Validation:** class-validator + class-transformer (DTOs on every endpoint)
- **Auth:** JWT issued by auth-service; the gateway validates it (auth_request to `/auth/validate`) and passes identity on as `X-User-*` headers
- **Messaging:** RabbitMQ via `amqp-connection-manager`, manual acks
- **Cache:** Redis 7 (provisioned; not used by any service yet)

### Frontend
- React 18 + Vite 5
- React Router v6
- Plain JSX (no TypeScript, no CSS framework — inline styles / index.css)
- `src/api.js` — centralized fetch wrapper, all API calls go through here

### Infrastructure
- **Gateway:** Nginx — routes `/api/<service>/` to the right upstream, runs JWT validation subrequest before forwarding
- **Compose:** single `docker-compose.yml` at project root
- **DBs:** 4 separate PostgreSQL databases (auth, tournaments, stats, notifications)

---

## Service Map

Only `api-gateway` is exposed to the host, on `127.0.0.1:8080` (production puts a TLS host proxy in front of it). All other services and infra are reachable only on Docker's internal network — access them via the gateway or `docker compose exec`.

| Service | Internal Port | DB | Notes |
|---|---|---|---|
| api-gateway (Nginx) | 80 (host: 127.0.0.1:8080) | — | JWT gate, real client IP, routes all `/api/*` |
| auth-service | 8000 | auth | Register/login/refresh (throttled per client IP), `/auth/validate` for Nginx |
| tournament-service | 8000 | tournaments | Full tournament lifecycle (see below), owns match entities directly |
| stats-service | 8000 | stats | Consumes `match.completed` and `match.corrected` from RabbitMQ |
| notification-service | 8000 | notifications | Consumes RabbitMQ events |
| frontend | 3000 | — | Vite build served by nginx |

player-service and match-service were retired (L-18, TICKET-023); don't re-add them.

**Infrastructure:** (internal-only — no host ports)
- PostgreSQL: `postgres:5432` — credentials in `.env`
- Redis: `redis:6379`
- RabbitMQ: `rabbitmq:5672` — credentials in `.env` — Management UI at `rabbitmq:15672` (internal only)

---

## API Routing (Nginx)

All requests go through `127.0.0.1:8080`. Nginx swaps the `/api/<service>/` prefix for the service's own route prefix:

```
/api/auth/*           → auth-service /auth/*          (no JWT gate, rate-limited)
/api/tournaments/*    → tournament-service /tournaments/*
/api/stats/*          → stats-service /stats/*         (no JWT gate, GET only)
/api/notifications/*  → notification-service /notifications/*
/api/<anything else>  → JSON 404
/                     → frontend
```

Gateway-raised errors (401, 429, 404) are JSON. `/api/<service>` without a trailing slash works too.

JWT user claims are injected as headers by Nginx after validation (a missing token means no headers, i.e. an anonymous caller; a bad token is a 401):
- `X-User-Sub` — user UUID
- `X-User-Email`
- `X-User-Name`
- `X-User-Role`

Services read identity from these headers — never from the raw Authorization header.

---

## Tournament Service — Domain Detail

The most complex service. Located at `tournament-service/src/tournaments/`.

**Tournament lifecycle:** `draft` → `open` → `in_progress` → `completed`

**Draw formats implemented:**
- Single Elimination
- Round Robin
- Group Stage + Knockout

**Not implemented yet (the API returns 400 and the wizard hides them, B-17):**
- Double Elimination (F-10)
- Doubles / mixed doubles (F-04)

**Key flows:**
- Participant enrollment (closes at the registration deadline) / approval (PENDING only, capped at max) / rejection / withdrawal
- Seeding (unique, 1..max, locked after the draw)
- Match result recording: validated (winner in the match, more sets), winner goes to the bracket slot in `nextSlot`; a correction re-advances or 409s if the next match was played; the draw locks once any match has a result
- Publishes `match.completed` (first result) and `match.corrected` (with `previous`) to RabbitMQ → stats-service reverses and re-applies; notification-service gets `match.completed`

**Module structure:**
```
src/
  tournaments/
    dto/                  — request/response DTOs
    entities/             — TypeORM entities
    tournaments.controller.ts
    tournaments.service.ts
    tournaments.service.spec.ts   — Jest unit tests
    tournaments.module.ts
  auth/                   — header-based guards (JwtGuard reads X-User-*)
  migrations/             — schema migrations, listed in index.ts
  data-source.ts          — shared by Nest and the TypeORM CLI
  app.module.ts
  main.ts
```

---

## Frontend Structure

```
frontend/src/
  api.js                  — all API calls, centralized
  App.jsx                 — router setup
  constants.js            — label maps for every enum (never render a raw enum)
  pages/
    LandingPage.jsx
    LoginPage.jsx / RegisterPage.jsx   — land on /dashboard or the page that sent you
    DashboardPage.jsx
    TournamentsPage.jsx
    ProfilePage.jsx            — your own account (/profile)
    CreateTournamentPage.jsx   — 4-step wizard
    TournamentDetailPage.jsx   — draw, participants, organizer actions
    NotFoundPage.jsx           — catch-all route
  components/
    Sidebar.jsx                — shared app navigation
    Logo.jsx                   — DrawMaster wordmark
    BracketView.jsx            — single-elim / knockout bracket
    GroupStageView.jsx         — group stage tables
  context/                — React context (auth state)
```

**No public player profile page** — `/players/:id` route does not exist yet.
**No stats/leaderboard page** — not built.
**No notifications UI** — not built.

---

## Build & Run Commands

```bash
# Start everything
docker compose up --build

# Start a single service for development
cd tournament-service && npm run start:dev

# Run tests (any service)
cd tournament-service && npm test
cd tournament-service && npm run test:cov

# After changing an entity: generate a migration against a DB at the current
# schema, review it, and add the class to src/migrations/index.ts
cd tournament-service && DATABASE_URL=... npm run migration:generate src/migrations/<Name>
cd tournament-service && DATABASE_URL=... npm run migration:check   # CI runs this

# Frontend dev server / E2E (E2E needs the stack up and raised throttle limits:
# LOGIN_THROTTLE_LIMIT=1000 REGISTER_THROTTLE_LIMIT=1000 docker compose up -d)
cd frontend && npm run dev
cd frontend && E2E_BASE_URL=http://127.0.0.1:8080 npm run test:e2e
```

---

## Conventions

### Backend
- Every endpoint input goes through a DTO with class-validator decorators — no raw `req.body` access
- Services never read JWT directly — only consume Nginx-injected `X-User-*` headers
- Never turn `synchronize` back on; every entity change ships with a migration
- TypeORM entities use UUIDs as primary keys (`uuid` package)
- RabbitMQ event publishing is fire-and-forget; services must handle unavailability gracefully
- No shared packages between services — each service is fully self-contained

### Frontend
- All API calls go through `src/api.js` — never `fetch()` directly in a component; show failures with `errorMessage(res, fallback)`
- Auth token stored in context / localStorage — not in a cookie
- No UI component library — keep it plain React
- The product is DrawMaster everywhere in the UI; CI fails on the old club name in `frontend/src`

### General
- No secrets in code — all env vars come from `docker-compose.yml` environment blocks
- Services refuse to start with a missing or published placeholder `JWT_SECRET` (B-04)
- Do not add cross-service database access — each service owns its DB exclusively

---

## Team

Specialist roles are defined in `avengers-team/`. Read the relevant `.md` before starting work in that domain.

Key specialists for this project:
- `backend-architect.md` — NestJS services, TypeORM, RabbitMQ
- `frontend-developer.md` — React, Vite, component work
- `qa-specialist.md` — Jest tests, test strategy
- `devops-specialist.md` — Docker, Compose, Nginx
- `microservice-architect.md` — service boundary decisions

---

## Known Gaps (open work)

Sprint 0 and Sprint 1 of `docs/product/dev-team-plan.md` are done. Next is Sprint 2 (roles, clubs, events). Notable open items:

- [ ] Double Elimination (F-10) and doubles pairs (F-04)
- [ ] Group stage → knockout progression (F-09): KO slots are labelled (A1, B2, BYE) but not filled from standings yet
- [ ] Correcting a result from the UI (F-07); the API already supports it
- [ ] Player profile page (`/players/:id`), stats / leaderboard page, notifications UI
