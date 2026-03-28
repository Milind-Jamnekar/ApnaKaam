# BackendJobs — Project Design Document

## What is this?

A niche job aggregator focused exclusively on backend/Node.js engineering roles worldwide. It collects job listings from multiple sources, deduplicates and normalizes them, scores them by relevance to a user's stack, and delivers fresh matches via Telegram bot and a simple web dashboard.

**Why this exists:** Every backend developer knows the pain — jobs are scattered across Naukri, LinkedIn, Wellfound, and dozens of company career pages. You search "NestJS jobs" and get stale listings, frontend roles mislabeled as backend, and results from 6 months ago. BackendJobs solves this by being the single source of truth for backend engineering jobs, updated daily, filtered by actual tech stack, and delivered where you already are — Telegram.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                     DATA INGESTION LAYER                │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐  │
│  │ Wellfound│  │ Remotive │  │ HN Who's  │  │ GitHub │  │
│  │ Scraper  │  │ API      │  │ Hiring    │  │ Jobs   │  │
│  └────┬─────┘  └────┬─────┘  └────┬──────┘  └───┬────┘  │
│       │              │             │              │       │
│       └──────────┬───┴─────────┬──┘──────────────┘       │
│                  ▼             ▼                          │
│            ┌──────────────────────┐                       │
│            │  Raw Job Queue       │ (BullMQ / Redis)      │
│            └──────────┬───────────┘                       │
│                       ▼                                   │
│            ┌──────────────────────┐                       │
│            │  Processing Pipeline │                       │
│            │  • Normalize         │                       │
│            │  • Deduplicate       │                       │
│            │  • Classify stack    │                       │
│            │  • Score relevance   │                       │
│            └──────────┬───────────┘                       │
│                       ▼                                   │
└─────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│                     DATA STORAGE LAYER                  │
│                                                         │
│  ┌─────────────────┐    ┌─────────────────────────┐     │
│  │  PostgreSQL      │    │  Redis                  │     │
│  │  • jobs          │    │  • dedup fingerprints   │     │
│  │  • companies     │    │  • rate limit counters  │     │
│  │  • users         │    │  • hot job cache        │     │
│  │  • subscriptions │    │  • queue state          │     │
│  │  • alerts_log    │    │                         │     │
│  └─────────────────┘    └─────────────────────────┘     │
│                                                         │
└─────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│                     DELIVERY LAYER                      │
│                                                         │
│  ┌──────────────┐   ┌──────────────┐   ┌────────────┐  │
│  │ Telegram Bot │   │  REST API    │   │ Web Dashboard│ │
│  │ (alerts +    │   │ (public API) │   │ (Phase 3)   │  │
│  │  commands)   │   │              │   │             │  │
│  └──────────────┘   └──────────────┘   └─────────────┘  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Runtime | Node.js + TypeScript | Your core stack, interview-relevant |
| Framework | NestJS | Modular architecture, DI, guards, interceptors — your strongest framework |
| ORM | Prisma | Type-safe queries, migrations, your daily driver |
| Database | PostgreSQL | Full-text search, JSONB for raw job data, pg_trgm for fuzzy matching |
| Cache | Redis | Dedup fingerprints, rate limiting, hot job cache |
| Queue | BullMQ | Job scheduling (scraper crons), retry logic, concurrency control |
| Bot | Telegraf.js | Telegram bot framework for Node.js, well-maintained |
| Scraping | Playwright + Cheerio | Playwright for JS-rendered pages, Cheerio for static HTML |
| Deployment | Docker Compose + VPS | Same setup as your thumbnail generator project |
| CI/CD | GitHub Actions | Lint, test, build, deploy on push |
| Monitoring | Pino + Grafana (later) | Structured logging from day 1 |

---

## Data Sources — What's Actually Feasible

This is the most important section. Let's be realistic about what you can and can't scrape.

### Tier 1 — Easy, Start Here (MVP)

| Source | Method | Job Volume | Notes |
|--------|--------|------------|-------|
| **Wellfound (AngelList)** | Public job listings, HTML scrape | High | Startup-focused, backend roles well-tagged |
| **Remotive.com** | Public API (free) | Medium | Remote jobs, good for global coverage |
| **HN "Who's Hiring"** | Monthly thread scrape | Medium | High-quality roles, monthly batch |
| **GitHub Jobs / ReadMe Jobs** | RSS/API | Medium | Developer-focused |
| **We Work Remotely** | HTML scrape | Medium | Clean listings, remote-only |
| **Stack Overflow Jobs (archived)** | Various mirrors | Low | Legacy but still has data |

### Tier 2 — Company Career Pages (High Value, More Work)

Build a configurable scraper that targets career pages of specific companies. Start with 20-30 companies known for strong backend teams:

**India:** Razorpay, CRED, Groww, Zerodha, PhonePe, Swiggy, Zomato, Dream11, CleverTap, Postman, Meesho, ShareChat, Gojek, Jupiter, Slice

**Global:** Stripe, Vercel, Supabase, PlanetScale, Fly.io, Railway, Render, Linear, Notion, Figma

Each career page needs a custom scraper config (CSS selectors, pagination pattern). Store configs in a `scraper_configs` table so adding new companies is just a DB entry, not a code change.

### Tier 3 — Avoid for Now

| Source | Why Avoid |
|--------|-----------|
| **LinkedIn** | Aggressive bot detection, legal risk, requires auth |
| **Naukri** | Anti-scraping measures, requires login for full listings |
| **Indeed** | Heavy anti-bot, rate limits, legal gray area |

> **Strategy:** Don't scrape LinkedIn/Naukri directly. Instead, when you find a job on other sources, check if a LinkedIn/Naukri link exists and store it as a reference URL. Users can click through to apply on the original platform.

---

## Database Schema (Prisma)

```prisma
model Company {
  id          String   @id @default(cuid())
  name        String
  website     String?
  careerPage  String?
  logo        String?
  size        String?  // startup, mid, large
  domain      String?  // fintech, e-commerce, devtools, etc.
  jobs        Job[]
  scraperConfig ScraperConfig?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model Job {
  id              String   @id @default(cuid())
  title           String
  company         Company  @relation(fields: [companyId], references: [id])
  companyId       String
  description     String   // cleaned text
  rawDescription  Json?    // original HTML/JSON for reference
  url             String   @unique // original listing URL (dedup key)
  source          String   // wellfound, remotive, hn, career_page, etc.
  location        String?  // "Mumbai", "Remote", "Berlin", etc.
  locationType    LocationType // remote, hybrid, onsite
  salaryMin       Int?
  salaryMax       Int?
  salaryCurrency  String?
  experienceMin   Int?     // years
  experienceMax   Int?
  stack           String[] // extracted: ["nodejs", "nestjs", "postgresql", "redis"]
  stackRaw        String?  // raw skills text from listing
  seniorityLevel  String?  // junior, mid, senior, lead, staff
  relevanceScore  Float?   // computed score based on user preferences
  fingerprint     String   @unique // hash for dedup (title + company + normalized location)
  postedAt        DateTime?
  scrapedAt       DateTime @default(now())
  expiresAt       DateTime?
  isActive        Boolean  @default(true)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([source])
  @@index([postedAt])
  @@index([isActive])
  @@index([stack], type: Gin)
}

model ScraperConfig {
  id              String   @id @default(cuid())
  company         Company  @relation(fields: [companyId], references: [id])
  companyId       String   @unique
  sourceType      String   // career_page, api, rss
  baseUrl         String
  selectors       Json     // CSS selectors for title, description, link, etc.
  paginationType  String?  // none, page_number, load_more, infinite_scroll
  scheduleMinutes Int      @default(360) // how often to scrape (default 6 hours)
  isActive        Boolean  @default(true)
  lastRunAt       DateTime?
  lastRunStatus   String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

model User {
  id              String   @id @default(cuid())
  telegramChatId  String   @unique
  telegramUsername String?
  stackPreferences String[] // ["nodejs", "nestjs", "typescript", "postgresql"]
  locationPrefs   String[] // ["mumbai", "remote", "bangalore"]
  seniorityPref   String?  // mid, senior, lead
  minSalary       Int?
  isActive        Boolean  @default(true)
  subscriptions   Subscription[]
  alertsLog       AlertLog[]
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

model Subscription {
  id          String   @id @default(cuid())
  user        User     @relation(fields: [userId], references: [id])
  userId      String
  frequency   String   @default("daily") // daily, realtime, weekly
  timeOfDay   String?  @default("09:00") // when to send daily digest
  timezone    String?  @default("Asia/Kolkata")
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model AlertLog {
  id        String   @id @default(cuid())
  user      User     @relation(fields: [userId], references: [id])
  userId    String
  jobId     String
  sentAt    DateTime @default(now())
  channel   String   // telegram, email
}

enum LocationType {
  REMOTE
  HYBRID
  ONSITE
}
```

---

## Core Modules (NestJS)

### 1. Scraper Module (`src/modules/scraper/`)

Responsible for fetching raw job data from all sources.

```
scraper/
├── scraper.module.ts
├── scraper.service.ts          # orchestrates all scrapers
├── sources/
│   ├── base.scraper.ts         # abstract base class
│   ├── wellfound.scraper.ts
│   ├── remotive.scraper.ts
│   ├── hn-hiring.scraper.ts
│   ├── weworkremotely.scraper.ts
│   └── career-page.scraper.ts  # configurable per-company scraper
├── scraper-scheduler.service.ts # BullMQ cron jobs
└── dto/
    └── raw-job.dto.ts          # common shape for all scrapers
```

**Key design decisions:**
- Each scraper extends a `BaseScraper` abstract class with methods: `fetchListings()`, `parseJob()`, `getSourceName()`
- All scrapers output a normalized `RawJobDto` regardless of source
- Career page scraper reads `ScraperConfig` from DB and uses Playwright with configurable selectors
- BullMQ schedules each scraper independently (Wellfound every 6 hours, HN monthly, career pages every 12 hours)
- Rate limiting per source to avoid bans
- Retry logic with exponential backoff on failures

### 2. Processing Module (`src/modules/processing/`)

Normalizes, deduplicates, classifies, and scores jobs.

```
processing/
├── processing.module.ts
├── processing.service.ts       # pipeline orchestrator
├── normalizer.service.ts       # clean HTML, standardize fields
├── deduplicator.service.ts     # fingerprint-based dedup via Redis
├── stack-classifier.service.ts # extract tech stack from description
├── relevance-scorer.service.ts # score jobs against user preferences
└── constants/
    └── stack-keywords.ts       # keyword taxonomy for classification
```

**Stack classification logic:**
- Parse job description for known keywords (e.g., "Node.js", "NestJS", "Express", "TypeScript", "PostgreSQL", "Redis", "Docker", "Kubernetes", "AWS", "microservices", etc.)
- Normalize aliases: "node" = "nodejs", "postgres" = "postgresql", "TS" = "typescript"
- Store extracted stack as a string array on the job record
- Use PostgreSQL array operators + GIN index for fast stack-based queries

**Deduplication logic:**
- Generate fingerprint: `hash(lowercase(title) + companyName + normalizedLocation)`
- Store fingerprints in Redis SET with 30-day TTL
- Check before inserting — if fingerprint exists, skip or update `scrapedAt` timestamp

**Relevance scoring:**
- Score = weighted sum of: stack match (40%), seniority match (25%), location match (20%), recency (15%)
- Personalized per user based on their `stackPreferences`, `seniorityPref`, `locationPrefs`

### 3. Telegram Bot Module (`src/modules/telegram/`)

User-facing interface via Telegram.

```
telegram/
├── telegram.module.ts
├── telegram.service.ts
├── commands/
│   ├── start.command.ts        # /start — register user
│   ├── subscribe.command.ts    # /subscribe — set preferences
│   ├── jobs.command.ts         # /jobs — get latest matches
│   ├── search.command.ts       # /search nestjs remote — search jobs
│   ├── settings.command.ts     # /settings — update preferences
│   └── help.command.ts         # /help — list commands
├── formatters/
│   └── job-message.formatter.ts # format job as Telegram message
└── alerts/
    └── daily-digest.service.ts  # scheduled daily alert sender
```

**Telegram commands:**

| Command | Description |
|---------|-------------|
| `/start` | Register and set up your preferences (stack, location, seniority) |
| `/jobs` | Get top 10 latest jobs matching your preferences |
| `/search <query>` | Search jobs: `/search nestjs remote senior` |
| `/subscribe daily 9:00` | Get daily digest at 9 AM IST |
| `/subscribe realtime` | Get notified as soon as new matching jobs are found |
| `/settings` | View/update your preferences |
| `/stats` | How many jobs scraped today, total active listings |
| `/help` | List all commands |

**Daily digest format:**
```
🔔 Your Daily Backend Jobs Digest — 28 Mar 2026

Found 5 new jobs matching your stack:

1️⃣ Senior Backend Engineer — Razorpay
📍 Bangalore (Hybrid) | 💰 ₹25-35 LPA
🛠 Node.js, TypeScript, PostgreSQL, Kubernetes
🔗 Apply: [link]

2️⃣ Backend Engineer — Supabase
📍 Remote | 💰 $120-160K
🛠 Node.js, PostgreSQL, Redis, Docker
🔗 Apply: [link]

...

📊 Total active listings: 847 | New today: 23
Type /jobs for more or /search to filter
```

### 4. API Module (`src/modules/api/`)

Public REST API for the web dashboard (Phase 3) and potential third-party consumers.

```
api/
├── api.module.ts
├── jobs.controller.ts
├── companies.controller.ts
├── stats.controller.ts
└── dto/
    ├── job-query.dto.ts
    └── job-response.dto.ts
```

**Key endpoints:**

```
GET  /api/jobs?stack=nodejs,nestjs&location=remote&seniority=senior&page=1
GET  /api/jobs/:id
GET  /api/companies
GET  /api/stats  (total jobs, sources breakdown, jobs added today)
```

---

## Phased Roadmap

### Phase 1 — Core Pipeline (Week 1-2)

**Goal:** Jobs flowing into database from at least 2 sources.

- [ ] Project setup: NestJS + Prisma + PostgreSQL + Redis + Docker Compose
- [ ] Database schema and migrations
- [ ] Base scraper abstract class
- [ ] Remotive scraper (API-based, easiest to start)
- [ ] We Work Remotely scraper (simple HTML)
- [ ] Processing pipeline: normalizer + deduplicator + stack classifier
- [ ] BullMQ scheduler for periodic scraping
- [ ] Pino structured logging
- [ ] Basic health check endpoint
- [ ] Docker Compose for local dev (postgres, redis, app)

### Phase 2 — Telegram Bot + More Sources (Week 3-4)

**Goal:** Users can interact via Telegram and get job alerts.

- [ ] Telegram bot setup with Telegraf.js
- [ ] `/start`, `/jobs`, `/search`, `/subscribe` commands
- [ ] User registration and preference storage
- [ ] Daily digest scheduler (BullMQ cron)
- [ ] Relevance scoring service
- [ ] Wellfound scraper
- [ ] HN "Who's Hiring" thread parser
- [ ] Career page scraper (configurable, start with 5 companies)
- [ ] Deploy to VPS with Docker Compose + GitHub Actions CI/CD

### Phase 3 — Polish + Scale (Week 5-6)

**Goal:** Production-ready with monitoring and more sources.

- [ ] REST API for public consumption
- [ ] Simple web dashboard (React/Next.js — minimal, job listing page + filters)
- [ ] Add 15-20 more company career pages
- [ ] Job expiry detection (re-scrape and mark inactive)
- [ ] Rate limiting on API
- [ ] Monitoring: Pino + log aggregation
- [ ] Error alerting (scraper failures → Telegram alert to you)
- [ ] README + architecture diagram in repo
- [ ] Portfolio page writeup

### Phase 4 — Growth Features (Optional, Future)

- [ ] Email digest option
- [ ] Salary normalization (USD/INR/EUR conversion)
- [ ] Company reviews integration
- [ ] "Similar jobs" recommendations
- [ ] Chrome extension to save jobs from any page
- [ ] Public API with rate-limited keys for other developers

---

## What Makes This Impressive in Interviews

This project naturally demonstrates:

1. **System design thinking** — multi-source data ingestion, pipeline architecture, scheduling
2. **Queue expertise** — BullMQ for job scheduling, retries, concurrency control, cron
3. **Database design** — normalized schema, GIN indexes, full-text search, dedup strategies
4. **Caching** — Redis for dedup fingerprints, hot job cache, rate limiting
5. **API design** — clean REST endpoints with pagination, filtering, sorting
6. **External integrations** — Telegram bot, web scraping, API consumption
7. **DevOps** — Docker Compose, GitHub Actions CI/CD, VPS deployment, structured logging
8. **Production thinking** — error handling, retry logic, monitoring, graceful degradation

When asked "Tell me about a project you built" in an interview, you can talk about:
- **Architecture decisions**: Why BullMQ over simple cron? Why fingerprint-based dedup over URL matching?
- **Scaling considerations**: What happens when you add 100 company career pages? How do you handle rate limits?
- **Trade-offs**: Why PostgreSQL array + GIN index instead of Elasticsearch for stack filtering?
- **Real-world problems**: Dealing with inconsistent job data, handling scraper failures, dedup edge cases

---

## Getting Started

```bash
# Clone and setup
mkdir backendjobs && cd backendjobs
npx @nestjs/cli new backendjobs-api --strict --package-manager npm

# Install core dependencies
npm install @nestjs/bullmq bullmq ioredis
npm install @prisma/client prisma
npm install telegraf
npm install cheerio playwright
npm install pino pino-pretty nestjs-pino

# Dev dependencies
npm install -D @types/cheerio

# Initialize Prisma
npx prisma init --datasource-provider postgresql

# Docker Compose for local dev
# PostgreSQL + Redis + App
```

---

## Naming Ideas

- **BackendJobs** — simple, descriptive
- **NodeHire** — Node.js focused hiring
- **StackPipe** — jobs piped to you by stack
- **BackendRadar** — radar for backend opportunities
- **HireNode** — clean, memorable
