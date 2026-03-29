# ApnaKaam

A backend job aggregator for Node.js/backend engineering roles. Scrapes multiple job boards and company career pages, normalizes and deduplicates listings, and delivers personalized matches via a Telegram bot with relevance scoring, daily digests, and realtime alerts.

## Architecture

```
                        ┌─────────────────────────────────────────┐
  Telegram Users ──────▶│          TelegramModule (Bot)           │
                        │  /jobs  /search  /subscribe  /settings  │
                        │  /stats  /help  /start                  │
                        └──────────────┬──────────────────────────┘
                                       │ realtime alerts
                                       │ daily/weekly digest (BullMQ)
                                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          NestJS Application                         │
│                                                                     │
│  ┌─────────────────┐   BullMQ      ┌──────────────────────────┐    │
│  │  ScraperModule  │──scraper-jobs▶│     ScraperProcessor     │    │
│  │  (scheduler)    │               │  runBySource()           │    │
│  └─────────────────┘               │  health checks           │    │
│                                    └────────────┬─────────────┘    │
│  ┌──────────────────────────────────────────────┤                  │
│  │ Data Sources                fetchListings()  │                  │
│  │  • Remotive (RSS, 6h)                        ▼                  │
│  │  • We Work Remotely (HTML, 6h)  ┌────────────────────────────┐  │
│  │  • Wellfound (stubbed)          │    ProcessingService       │  │
│  │  • HN Who's Hiring (API, 24h)   │  normalize → deduplicate   │  │
│  │  • Career Pages (ATS API, 24h)  │  classify stack → save     │  │
│  └─────────────────────────────────└──────────┬─────────────────┘  │
│                                               │                    │
│  ┌────────────────┐                           ▼                    │
│  │   REST API     │              ┌────────────────────────────┐    │
│  │  GET /api/jobs │◀────────────▶│        PostgreSQL           │    │
│  │  GET /stats    │   Redis      │  Job, Company, User        │    │
│  │  POST /admin/  │   Cache      │  Subscription, AlertLog    │    │
│  │  scrape        │   5min TTL   │  ScraperConfig             │    │
│  └────────────────┘              └────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | NestJS 11 + TypeScript (strict) |
| Database | PostgreSQL 16 via Prisma 7 (driver adapter) |
| Queue | BullMQ backed by Redis 7 |
| Cache | Redis (ioredis) |
| Logging | Pino via nestjs-pino |
| Telegram | Telegraf v4 |
| Package manager | pnpm |

## Data Sources

| Source | Type | Schedule | Notes |
|---|---|---|---|
| [Remotive](https://remotive.com) | RSS feed | Every 6h | ~200 remote backend jobs |
| [We Work Remotely](https://weworkremotely.com) | HTML scraper | Every 6h | Programming section |
| [Wellfound](https://wellfound.com) | Stubbed | Every 12h | Blocked by DataDome bot protection |
| [HN Who's Hiring](https://news.ycombinator.com/item?id=...) | Algolia API | Every 24h | Monthly thread, ~200 comments parsed |
| Company Career Pages | ATS API (Greenhouse/Ashby) | Every 24h | Configurable via ScraperConfig in DB |

Career page scraper configs are managed via admin API and seeded with: **Stripe, Discord, Postman** (Greenhouse) and **Supabase, Linear** (Ashby).

## Telegram Bot

### Setup

1. Message [@BotFather](https://t.me/BotFather) on Telegram
2. Send `/newbot` and follow the prompts to get a bot token
3. Add `TELEGRAM_BOT_TOKEN=<your_token>` to `.env`
4. To receive admin alerts, get your chat ID by messaging [@userinfobot](https://t.me/userinfobot) and add `ADMIN_TELEGRAM_CHAT_ID=<your_id>` to `.env`

### Commands

| Command | Description |
|---|---|
| `/start` | Register and set up your profile (stack, location, seniority) |
| `/jobs` | Top 10 jobs scored by relevance to your preferences (🟢/🟡/🔴 badge) |
| `/search <query>` | Free-text search — e.g. `/search senior nestjs remote` |
| `/settings` | View or update your tech stack, location, and seniority preferences |
| `/subscribe` | Set up job alerts (daily digest at 9AM IST, realtime, or weekly) |
| `/unsubscribe` | Stop all alerts |
| `/stats` | Platform statistics: active listings, sources breakdown, top stacks |
| `/help` | Show this command list |
| `/ping` | Health check |

### Relevance Scoring

Jobs are scored 0–100 against your preferences:

| Component | Max Points | Logic |
|---|---|---|
| Stack match | 40 (+5 bonus) | `(matched / total_prefs) × 40`; +5 if tech appears in job title |
| Location | 25 | Exact city/remote = 25; same region = 10; hybrid when remote wanted = 8 |
| Seniority | 20 | Exact = 20; adjacent level = 10; unknown = 5 |
| Recency | 15 | Today = 15; <3d = 12; <7d = 8; <14d = 4; older = 1 |

Score badges: 🟢 ≥80 · 🟡 50–79 · 🔴 <50

- Daily digest only includes jobs with score ≥ 40
- Realtime alerts only fire for jobs with score ≥ 60

### Admin Alerts

If a scraper fails 3 consecutive times, or returns unexpectedly few jobs (0 for sources that should have results), an alert is sent to `ADMIN_TELEGRAM_CHAT_ID`.

## Running Locally

**Prerequisites:** Docker, Node.js 20+, pnpm

```bash
# 1. Clone and install
pnpm install

# 2. Copy environment variables
cp .env.example .env
# Edit .env — fill in TELEGRAM_BOT_TOKEN and optionally ADMIN_TELEGRAM_CHAT_ID

# 3. Start PostgreSQL and Redis
docker compose up -d

# 4. Run database migrations
pnpm prisma migrate deploy

# 5. Seed career page scraper configs (Stripe, Discord, Postman, Supabase, Linear)
pnpm prisma migrate deploy --seed
# or directly:
npx ts-node --project tsconfig.json prisma/seed.ts

# 6. Start in watch mode
pnpm start:dev
```

The app starts on `http://localhost:3000`. On startup, scraper jobs are registered in BullMQ automatically.

To trigger a scrape immediately:

```bash
# All sources
curl -X POST http://localhost:3000/api/admin/scrape

# Specific source
curl -X POST http://localhost:3000/api/admin/scrape/remotive
curl -X POST http://localhost:3000/api/admin/scrape/hn-hiring
curl -X POST http://localhost:3000/api/admin/scrape/career_page
```

## API Reference

### `GET /health`

```json
{ "status": "ok", "database": "connected", "redis": "connected" }
```

---

### `GET /api/jobs`

| Parameter | Type | Default | Description |
|---|---|---|---|
| `stack` | string | — | Comma-separated: `nodejs,nestjs` |
| `location` | string | — | Partial match |
| `locationType` | `REMOTE` \| `HYBRID` \| `ONSITE` | — | Exact match |
| `seniority` | string | — | Partial match |
| `source` | string | — | `remotive`, `weworkremotely`, `hn-hiring`, `career_page` |
| `minSalary` | number | — | Minimum salaryMin |
| `page` | number | `1` | Page number |
| `limit` | number | `20` | Results per page (max 50) |
| `sortBy` | `postedAt` \| `relevanceScore` | `postedAt` | Sort field (desc) |

```bash
curl "http://localhost:3000/api/jobs?stack=nodejs,postgresql&locationType=REMOTE&limit=10"
```

---

### `GET /api/jobs/stats`

```bash
curl http://localhost:3000/api/jobs/stats
```

---

### `GET /api/jobs/:id`

Single job with company details.

---

### `POST /api/admin/scrape`

Trigger all scrapers.

### `POST /api/admin/scrape/:source`

Trigger a specific scraper.

### `GET /api/admin/scraper-config`

List all career page scraper configs.

### `POST /api/admin/scraper-config`

Create a new scraper config (supports Greenhouse, Ashby, HTML, RSS sources).

```bash
curl -X POST http://localhost:3000/api/admin/scraper-config \
  -H 'Content-Type: application/json' \
  -d '{
    "companyName": "Vercel",
    "sourceType": "api",
    "baseUrl": "https://api.ashbyhq.com/posting-api/job-board/vercel",
    "selectors": {
      "jobsPath": "jobs",
      "title": "title",
      "url": "jobUrl",
      "location": "location",
      "department": "department",
      "isRemote": "isRemote"
    }
  }'
```

### `PUT /api/admin/scraper-config/:id`

Update a scraper config (selectors, baseUrl, isActive, scheduleMinutes).

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `REDIS_HOST` | Yes | Redis hostname (default: `localhost`) |
| `REDIS_PORT` | Yes | Redis port (default: `6379`) |
| `TELEGRAM_BOT_TOKEN` | Yes | Token from @BotFather |
| `ADMIN_TELEGRAM_CHAT_ID` | No | Your chat ID for scraper failure alerts |
| `PORT` | No | HTTP port (default: `3000`) |
| `NODE_ENV` | No | `development` or `production` |

## Docker

`docker-compose.yml` provides PostgreSQL 16 and Redis 7 for local development. The NestJS app runs directly on the host with `pnpm start:dev`.

> **Note on Wellfound scraping:** Wellfound uses DataDome bot protection which blocks both direct HTTP requests and headless Playwright from server IPs. The scraper is stubbed out (`wellfound.scraper.ts` returns `[]`). Alternatives if needed: [Browserless.io](https://browserless.io), the Wellfound Talent API (requires partnership), or a residential proxy.
