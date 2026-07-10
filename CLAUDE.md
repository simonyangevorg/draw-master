# FPTC — Tennis Tournament Platform

Full-stack tennis tournament management platform. NestJS microservices backend, React frontend, all containerized with Docker Compose.

---

## Stack

### Backend (per service)
- **Runtime:** Node.js + TypeScript
- **Framework:** NestJS 10
- **ORM:** TypeORM 0.3 with PostgreSQL 16
- **Validation:** class-validator + class-transformer (DTOs on every endpoint)
- **Auth:** JWT via `@nestjs/jwt` — decoded by Nginx before hitting any service
- **Messaging:** RabbitMQ via `amqp-connection-manager`
- **Cache:** Redis 7

### Frontend
- React 18 + Vite 5
- React Router v6
- Plain JSX (no TypeScript, no CSS framework — inline styles / index.css)
- `src/api.js` — centralized fetch wrapper, all API calls go through here

### Infrastructure
- **Gateway:** Nginx — routes `/api/<service>/` to the right upstream, runs JWT validation subrequest before forwarding
- **Compose:** single `docker-compose.yml` at project root
- **DBs:** 5 separate PostgreSQL databases (players, tournaments, matches, stats, notifications)

---

## Service Map

Only `api-gateway` is exposed to the host (port `80`). All other services and infra are reachable only on Docker's internal network — access them via the gateway or `docker compose exec`.

| Service | Internal Port | DB | Notes |
|---|---|---|---|
| api-gateway (Nginx) | 80 (host: 80) | — | JWT gate, routes all `/api/*` |
| auth-service | 8000 | auth | Register/login, `/auth/validate` for Nginx |
| player-service | 8000 | players | Player CRUD, Redis cache, publishes RabbitMQ events |
| tournament-service | 8000 | tournaments | Full tournament lifecycle (see below) |
| match-service | 8000 | matches | Match management |
| stats-service | 8000 | stats | Consumes `match.completed` from RabbitMQ |
| notification-service | 8000 | notifications | Consumes RabbitMQ events |
| frontend | 3000 | — | React + Vite |

**Infrastructure:** (internal-only — no host ports)
- PostgreSQL: `postgres:5432` — credentials in `.env`
- Redis: `redis:6379`
- RabbitMQ: `rabbitmq:5672` — credentials in `.env` — Management UI at `rabbitmq:15672` (internal only)

---

## API Routing (Nginx)

All requests go through `localhost:80`. Nginx strips `/api/<service>/` prefix before proxying:

```
/api/auth/*           → auth-service /auth/*          (no JWT gate)
/api/tournaments/*    → tournament-service /tournaments/*
/api/players/*        → player-service /players/*
/api/matches/*        → match-service /matches/*
/api/stats/*          → stats-service /stats/*         (no JWT gate)
/api/notifications/*  → notification-service /notifications/*
/                     → frontend
```

JWT user claims are injected as headers by Nginx after validation:
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

**Draw formats NOT implemented:**
- Double Elimination (UI dropdown option exists, backend `generateDraw` does not handle it)

**Key flows:**
- Participant enrollment / approval / rejection / withdrawal
- Seeding
- Match result recording with auto-advancement
- Publishes `match.completed` events to RabbitMQ → consumed by stats-service and notification-service

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
  auth/                   — JWT guard
  app.module.ts
  main.ts
```

---

## Frontend Structure

```
frontend/src/
  api.js                  — all API calls, centralized
  App.jsx                 — router setup
  pages/
    LandingPage.jsx
    LoginPage.jsx
    RegisterPage.jsx
    DashboardPage.jsx
    CreateTournamentPage.jsx   — 4-step wizard
    TournamentDetailPage.jsx   — draw, participants, organizer actions
    BracketView.jsx            — single-elim / knockout bracket
    GroupStageView.jsx         — group stage tables
  components/             — shared UI components
  context/                — React context (auth state)
```

**No player profile page** — `/players/:id` route does not exist yet.
**No stats/leaderboard page** — not built.
**No notifications UI** — not built.

---

## Build & Run Commands

```bash
# Start everything
docker compose up --build

# Start a single service for development
cd tournament-service && npm run start:dev

# Run tests (tournament-service)
cd tournament-service && npm test
cd tournament-service && npm run test:cov

# Frontend dev server
cd frontend && npm run dev
```

---

## Conventions

### Backend
- Every endpoint input goes through a DTO with class-validator decorators — no raw `req.body` access
- Services never read JWT directly — only consume Nginx-injected `X-User-*` headers
- TypeORM entities use UUIDs as primary keys (`uuid` package)
- RabbitMQ event publishing is fire-and-forget; services must handle unavailability gracefully
- No shared packages between services — each service is fully self-contained

### Frontend
- All API calls go through `src/api.js` — never `fetch()` directly in a component
- Auth token stored in context / localStorage — not in a cookie
- No UI component library — keep it plain React

### General
- No secrets in code — all env vars come from `docker-compose.yml` environment blocks
- `JWT_SECRET` value `fptc_super_secret_change_in_prod` is dev-only — never use in production
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

- [ ] Double Elimination draw format — backend not implemented
- [ ] Player profile page (`/players/:id`) — frontend only
- [ ] Stats / leaderboard page — frontend only
- [ ] Notifications UI — frontend only
