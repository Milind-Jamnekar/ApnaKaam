import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma-client';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// ---------------------------------------------------------------------------
// Seed: ScraperConfig entries for 5 companies with public ATS APIs
//
// ATS API formats supported by CareerPageScraper (sourceType = 'api'):
//
//   Greenhouse  GET https://boards-api.greenhouse.io/v1/boards/{slug}/jobs
//               Response: { jobs: [{ title, absolute_url, location: {name}, ... }] }
//
//   Ashby       GET https://api.ashbyhq.com/posting-api/job-board/{slug}
//               Response: { jobs: [{ title, jobUrl, location, department, isRemote, ... }] }
// ---------------------------------------------------------------------------

const configs = [
  // ── Stripe (Greenhouse) ────────────────────────────────────────────────
  {
    companyName: 'Stripe',
    sourceType: 'api',
    baseUrl: 'https://boards-api.greenhouse.io/v1/boards/stripe/jobs',
    selectors: {
      jobsPath: 'jobs',
      title: 'title',
      url: 'absolute_url',
      location: 'location.name',
    },
    scheduleMinutes: 720,
  },

  // ── Discord (Greenhouse) ───────────────────────────────────────────────
  {
    companyName: 'Discord',
    sourceType: 'api',
    baseUrl: 'https://boards-api.greenhouse.io/v1/boards/discord/jobs',
    selectors: {
      jobsPath: 'jobs',
      title: 'title',
      url: 'absolute_url',
      location: 'location.name',
    },
    scheduleMinutes: 720,
  },

  // ── Postman (Greenhouse) ───────────────────────────────────────────────
  {
    companyName: 'Postman',
    sourceType: 'api',
    baseUrl: 'https://boards-api.greenhouse.io/v1/boards/postman/jobs',
    selectors: {
      jobsPath: 'jobs',
      title: 'title',
      url: 'absolute_url',
      location: 'location.name',
    },
    scheduleMinutes: 720,
  },

  // ── Supabase (Ashby) ───────────────────────────────────────────────────
  {
    companyName: 'Supabase',
    sourceType: 'api',
    baseUrl: 'https://api.ashbyhq.com/posting-api/job-board/supabase',
    selectors: {
      jobsPath: 'jobs',
      title: 'title',
      url: 'jobUrl',
      location: 'location',
      department: 'department',
      isRemote: 'isRemote',
    },
    scheduleMinutes: 720,
  },

  // ── Linear (Ashby) ────────────────────────────────────────────────────
  {
    companyName: 'Linear',
    sourceType: 'api',
    baseUrl: 'https://api.ashbyhq.com/posting-api/job-board/linear',
    selectors: {
      jobsPath: 'jobs',
      title: 'title',
      url: 'jobUrl',
      location: 'location',
      department: 'department',
      isRemote: 'isRemote',
    },
    scheduleMinutes: 720,
  },
];

async function main() {
  console.log('Seeding ScraperConfigs...');

  for (const cfg of configs) {
    const company = await prisma.company.upsert({
      where: { name: cfg.companyName },
      create: { name: cfg.companyName },
      update: {},
    });

    // Skip if config already exists for this company
    const existing = await prisma.scraperConfig.findUnique({
      where: { companyId: company.id },
    });

    if (existing) {
      console.log(`  [skip] ${cfg.companyName} — config already exists`);
      continue;
    }

    await prisma.scraperConfig.create({
      data: {
        companyId: company.id,
        sourceType: cfg.sourceType,
        baseUrl: cfg.baseUrl,
        selectors: cfg.selectors,
        scheduleMinutes: cfg.scheduleMinutes,
        isActive: true,
      },
    });

    console.log(`  [ok]   ${cfg.companyName} (${cfg.sourceType})`);
  }

  console.log('Done.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
