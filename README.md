# ApnaKaam

A backend job aggregator for Node.js/backend engineering roles. Scrapes remote job boards, normalizes and deduplicates listings, and exposes a REST API with filtering, pagination, and Redis caching.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         ApnaKaam API                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌──────────────┐    BullMQ Queue     ┌─────────────────────┐  │
│   │ ScraperModule│ ──── scraper-jobs ──▶ ScraperProcessor    │  │
│   │  (scheduler) │                     │  - run scraper      │  │
│   └──────────────┘                     │  - cleanup stale    │  │
│                                        └──────────┬──────────┘  │
│   ┌──────────────┐                               │              │
│   │  Remotive    │◀──────────────────────────────┤              │
│   │  Scraper     │  fetchListings()              │              │
│   └──────────────┘                               ▼              │
│   ┌──────────────┐                    ┌─────────────────────┐   │
│   │  WWR Scraper │                    │  ProcessingService  │   │
│   └──────────────┘                    │  - normalize        │   │
│                                       │  - deduplicate      │   │
│   ┌──────────────┐                    │  - classify stack   │   │
│   │  ApiModule   │                    │  - save to DB       │   │
│   │  GET /jobs   │                    └──────────┬──────────┘   │
│   │  GET /stats  │                               │              │
│   └──────┬───────┘                               ▼              │
│          │                            ┌─────────────────────┐   │
│          │           ┌────────────────│     PostgreSQL       │   │
│          └──────────▶│  Redis Cache   │  Company, Job,      │   │
│                      │  (5min TTL)    │  User, Subscription │   │
│                      └────────────────└─────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | NestJS 11 + TypeScript (strict) |
| Database | PostgreSQL 16 via Prisma 7 |
| Queue | BullMQ backed by Redis 7 |
| Cache | Redis (ioredis) |
| Logging | Pino via nestjs-pino |
| Package manager | pnpm |

## Running Locally

**Prerequisites:** Docker, Node.js 20+, pnpm

```bash
# 1. Clone and install
pnpm install

# 2. Copy environment variables
cp .env.example .env

# 3. Start PostgreSQL and Redis
docker compose up -d

# 4. Run database migrations
pnpm prisma migrate deploy

# 5. Start in watch mode
pnpm start:dev
```

The app starts on `http://localhost:3000`.

On startup, two scraper jobs are registered in BullMQ (every 6h) and a cleanup job (every 24h). To trigger a scrape immediately:

```bash
curl -X POST http://localhost:3000/api/admin/scrape
```

## API Reference

### `GET /health`

Returns database and Redis connectivity status.

```json
{ "status": "ok", "database": "connected", "redis": "connected" }
```

---

### `GET /api/jobs`

List jobs with optional filters and pagination.

**Query parameters:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `stack` | string | — | Comma-separated stack filter: `nodejs,nestjs` |
| `location` | string | — | Partial match on location |
| `locationType` | `REMOTE` \| `HYBRID` \| `ONSITE` | — | Exact match |
| `seniority` | string | — | Partial match on seniority level |
| `source` | string | — | Exact match: `remotive`, `weworkremotely` |
| `minSalary` | number | — | Minimum salaryMin value |
| `page` | number | `1` | Page number |
| `limit` | number | `20` | Results per page (max 50) |
| `sortBy` | `postedAt` \| `relevanceScore` | `postedAt` | Sort field (descending) |

**Example:**
```bash
curl "http://localhost:3000/api/jobs?stack=nodejs,postgresql&locationType=REMOTE&limit=10"
```

**Response:**
```json
{
  "data": [
    {
      "id": "cm...",
      "title": "Senior Backend Engineer",
      "company": { "id": "cm...", "name": "Acme Corp", "website": null, "logo": null },
      "description": "...",
      "url": "https://...",
      "source": "remotive",
      "location": "Remote",
      "locationType": "REMOTE",
      "salaryMin": 80000,
      "salaryMax": 120000,
      "salaryCurrency": "USD",
      "stack": ["nodejs", "postgresql", "typescript"],
      "postedAt": "2026-03-29T00:00:00.000Z",
      "scrapedAt": "2026-03-29T09:00:00.000Z",
      "isActive": true,
      "createdAt": "2026-03-29T09:00:00.000Z"
    }
  ],
  "meta": {
    "total": 142,
    "page": 1,
    "limit": 10,
    "totalPages": 15
  }
}
```

---

### `GET /api/jobs/stats`

Aggregated statistics across all jobs.

```bash
curl http://localhost:3000/api/jobs/stats
```

```json
{
  "totalJobs": 312,
  "activeJobs": 289,
  "jobsToday": 47,
  "sourceBreakdown": {
    "remotive": 185,
    "weworkremotely": 127
  },
  "topStacks": [
    { "name": "nodejs", "count": 134 },
    { "name": "typescript", "count": 118 },
    { "name": "postgresql", "count": 89 }
  ]
}
```

---

### `GET /api/jobs/:id`

Single job with company details.

```bash
curl http://localhost:3000/api/jobs/cmnatgc8o00017qugyyye1y40
```

---

### `POST /api/admin/scrape`

Manually trigger all scrapers.

```bash
curl -X POST http://localhost:3000/api/admin/scrape
```

### `POST /api/admin/scrape/:source`

Manually trigger a specific scraper.

```bash
curl -X POST http://localhost:3000/api/admin/scrape/remotive
curl -X POST http://localhost:3000/api/admin/scrape/weworkremotely
```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `REDIS_HOST` | Yes | Redis hostname |
| `REDIS_PORT` | Yes | Redis port (default `6379`) |
| `PORT` | No | HTTP port (default `3000`) |
| `NODE_ENV` | No | `development` or `production` |
