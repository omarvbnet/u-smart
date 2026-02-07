# U-SMART: Home ↔ API ↔ Admin ↔ Database

This document describes how the home page, API, admin, and database are connected.

## Environment

- **`.env`** (required): `DATABASE_URL` must point to your PostgreSQL (e.g. Prisma Accelerate or direct URL).
- **`.env.example`**: Template listing all optional env vars (`DATABASE_URL`, `NEXT_PUBLIC_APP_URL`, etc.).

## Database

- **`prisma/schema.prisma`**: Defines models (Statistic, User, Project, Service, Client, etc.) and uses `env("DATABASE_URL")`.
- **`lib/prisma.ts`**: Singleton Prisma client used by all API routes.
- **`lib/database.ts`**: Optional DB service (health/stats); API routes use `lib/prisma.ts` directly.

Run once: `npx prisma generate` and `npx prisma db push` (or `migrate dev`).

## API (all use Prisma → DATABASE_URL)

| Route | Purpose |
|-------|--------|
| `GET /api/hero` | Home hero data: statistics, featured projects, solutions (services), clients. |
| `PATCH /api/hero/statistics/[key]` | Update a hero statistic (admin). |
| `GET/POST /api/projects` | List / create projects. |
| `GET/PATCH/DELETE /api/projects/[id]` | Single project CRUD. |
| `GET/POST /api/services` | List / create services. |
| `GET/PATCH/DELETE /api/services/[id]` | Single service CRUD. |
| `GET/POST /api/clients` | List / create clients. |
| `GET/PATCH/DELETE /api/clients/[id]` | Single client CRUD. |
| `GET /api/health` | Health check; verifies DB connection. |
| `POST /api/auth/login` | Admin login (email + password); sets httpOnly cookie. |
| `POST /api/auth/logout` | Clears admin session cookie. |
| `GET /api/auth/me` | Returns current admin user or 401. |

## Admin login

- **`/admin/login`**: Login page. Unauthenticated visitors to `/admin` or `/admin/*` (except `/admin/login`) are redirected here.
- **Auth**: JWT stored in httpOnly cookie `admin_token`; only users with role **ADMIN** or **EDITOR** can log in.
- **Test admin user** (created by `npm run seed`): **admin@usmart.com** / **Admin@123**
- **`.env`**: Set `JWT_SECRET` for signing tokens (optional; default fallback exists for development).

## Home Page

- **`app/[locale]/page.tsx`** (e.g. `/ar`, `/en`):
  - Fetches **`GET /api/hero`** once on load.
  - **Stats**: Uses `statistics` from API (hero numbers).
  - **Featured Projects**: Renders `featuredProjects` from API (section only if non-empty).
  - **Services**: Uses `solutions` from API when present; otherwise static list.
  - **Clients**: Renders `clients` from API (section only if non-empty).

All hero data is driven by the database via `/api/hero`.

## Admin

- **`/admin`**: Hero stats + list of featured projects & solutions; edits stats via `PATCH /api/hero/statistics/[key]`.
- **`/admin/projects`**: CRUD projects via `/api/projects` and `/api/projects/[id]`.
- **`/admin/services`**: CRUD services via `/api/services` and `/api/services/[id]`.
- **`/admin/clients`**: CRUD clients via `/api/clients` and `/api/clients/[id]`.

Admin layout: **`app/admin/layout.tsx`** + **`app/admin/AdminNav.tsx`** (sidebar with active state).

## API Clients (used by admin / optional for front-end)

- **`lib/api/hero.ts`**: `heroApi.getHero()`, `heroApi.updateStatistic(key, value)`, etc.
- **`lib/api/projects.ts`**: `projectsApi.list()`, `create()`, `update()`, `delete()`.
- **`lib/api/services.ts`**: `servicesApi.list()`, `create()`, `update()`, `delete()`.
- **`lib/api/clients.ts`**: `clientsApi.list()`, `create()`, `update()`, `delete()`.

## Types

- **`app/api/types/index.ts`**: `HeroStat`, `FeaturedProject`, `Solution`, `Client` (used by API responses and front-end).

## Flow Summary

1. **Database**: PostgreSQL via `DATABASE_URL`; Prisma in `lib/prisma.ts`.
2. **API**: All `/api/*` routes use `prisma` from `lib/prisma.ts`; hero data comes from Statistic, Project, Service, Client.
3. **Home**: One fetch to `/api/hero` → stats, featured projects, solutions, clients rendered in sections.
4. **Admin**: Uses `lib/api/*` to call the same API; changes (projects, services, clients, hero stats) persist in the DB and appear on the home page after refresh (or when home refetches).

To verify: set `DATABASE_URL` in `.env`, run `npm run dev`, open `/ar` or `/en`, then `/admin` and add/edit content; refresh home to see updates.
