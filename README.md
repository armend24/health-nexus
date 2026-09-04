# Health Nexus

This is the initial commit, used as a base for the project setup.

## Project structure

- **frontend-nexus/** - Vite + React frontend (TanStack, Zustand, shadcn, Tailwind)
- **backend-nexus/** - FastAPI + SQLAlchemy + Alembic backend

## Tech stack

**Frontend:** Vite, React, TypeScript, TanStack, Zustand, shadcn/ui, Tailwind CSS, React Hook Form, Zod  
**Backend:** FastAPI, SQLAlchemy 2.0, Alembic, PostgreSQL, Docker Compose

## Backend bootstrap

1. Copy `.env.example` to `.env` and ensure `DATABASE_URL` uses `postgresql+psycopg://` (required for Python 3.13 support).
2. Start services:
   `docker compose up --build`

On startup, backend now:

- waits for Postgres,
- runs `alembic upgrade head`,
- seeds deterministic data (`app.seed`),
- verifies migration + seed baseline (`app.verify_seed`).

You can control bootstrap behavior via env vars:

- `SEED_ON_BOOT=true|false` (default `true`)
- `VERIFY_SEED_ON_BOOT=true|false` (default `true`)

## Migration + seed verification steps

- Full clean bootstrap:
  - `docker compose down -v`
  - `docker compose up --build`
- Verify startup logs include:
  - `Running migrations...`
  - `Seed completed.`
  - `Seed verification passed.`

## For future schema changes

1.docker compose up -d db  
2.docker compose run --rm api python -m alembic upgrade head  
3.docker compose run --rm api python -m alembic revision --autogenerate -m "...Migration Name..."  
4.Review migration output  
5.docker compose run --rm api python -m alembic upgrade head  
6.Commit new file in `backend-nexus/alembic/versions/`
