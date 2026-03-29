import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma-client';
import { PrismaService } from '../database/prisma.service';
import { TelegramJob } from './formatters/job-message.formatter';

export const PAGE_SIZE = 10;

// Simple lookup used for search query parsing
const TECH_CANONICAL: Record<string, string> = {
  node: 'nodejs',
  nodejs: 'nodejs',
  nest: 'nestjs',
  nestjs: 'nestjs',
  ts: 'typescript',
  typescript: 'typescript',
  postgres: 'postgresql',
  postgresql: 'postgresql',
  pg: 'postgresql',
  mongo: 'mongodb',
  mongodb: 'mongodb',
  redis: 'redis',
  docker: 'docker',
  k8s: 'kubernetes',
  kubernetes: 'kubernetes',
  aws: 'aws',
  gcp: 'gcp',
  express: 'express',
  graphql: 'graphql',
  go: 'golang',
  golang: 'golang',
  python: 'python',
  java: 'java',
  spring: 'java',
  rust: 'rust',
  ruby: 'ruby',
  rails: 'ruby',
  php: 'php',
  laravel: 'php',
  kafka: 'kafka',
  rabbitmq: 'rabbitmq',
  prisma: 'prisma',
  typeorm: 'typeorm',
  microservices: 'microservices',
  elasticsearch: 'elasticsearch',
};

const LOCATION_KEYWORDS = new Set([
  'remote',
  'mumbai',
  'bangalore',
  'bengaluru',
  'delhi',
  'hyderabad',
  'pune',
  'india',
  'usa',
  'us',
  'europe',
  'anywhere',
  'worldwide',
]);

const SENIORITY_KEYWORDS = new Set([
  'junior',
  'mid',
  'senior',
  'lead',
  'staff',
  'principal',
]);

const LOCATION_EXPAND: Record<string, string[]> = {
  india: [
    'india',
    'mumbai',
    'bangalore',
    'bengaluru',
    'delhi',
    'hyderabad',
    'pune',
  ],
  europe: [
    'europe',
    'germany',
    'uk',
    'france',
    'netherlands',
    'spain',
    'sweden',
  ],
  us: ['usa', 'united states'],
  bengaluru: ['bangalore', 'bengaluru'],
};

export interface JobQueryResult {
  jobs: TelegramJob[];
  total: number;
}

export interface ParsedSearch {
  stack: string[];
  locations: string[];
  seniority: string | null;
  raw: string;
}

@Injectable()
export class TelegramJobsService {
  constructor(private readonly prisma: PrismaService) {}

  async findForUser(
    stackPrefs: string[],
    locationPrefs: string[],
    page: number,
  ): Promise<JobQueryResult> {
    const where = this.buildWhere(stackPrefs, locationPrefs, null);
    return this.query(where, page);
  }

  async search(parsed: ParsedSearch, page: number): Promise<JobQueryResult> {
    const where = this.buildWhere(
      parsed.stack,
      parsed.locations,
      parsed.seniority,
    );
    return this.query(where, page);
  }

  parseSearchQuery(raw: string): ParsedSearch {
    const words = raw.toLowerCase().trim().split(/\s+/).filter(Boolean);
    const stack: string[] = [];
    const locations: string[] = [];
    let seniority: string | null = null;

    for (const word of words) {
      if (TECH_CANONICAL[word]) {
        const canonical = TECH_CANONICAL[word];
        if (!stack.includes(canonical)) stack.push(canonical);
      } else if (LOCATION_KEYWORDS.has(word)) {
        if (!locations.includes(word)) locations.push(word);
      } else if (SENIORITY_KEYWORDS.has(word)) {
        seniority = word;
      }
    }

    return { stack, locations, seniority, raw };
  }

  private buildWhere(
    stackPrefs: string[],
    locationPrefs: string[],
    seniority: string | null,
  ): Prisma.JobWhereInput {
    const where: Prisma.JobWhereInput = { isActive: true };

    if (stackPrefs.length > 0) {
      where.stack = { hasSome: stackPrefs };
    }

    const locationOr = this.buildLocationOr(locationPrefs);
    if (locationOr.length > 0) {
      where.OR = locationOr;
    }

    if (seniority) {
      where.seniorityLevel = { contains: seniority, mode: 'insensitive' };
    }

    return where;
  }

  private buildLocationOr(locationPrefs: string[]): Prisma.JobWhereInput[] {
    if (!locationPrefs.length || locationPrefs.includes('anywhere')) return [];

    const or: Prisma.JobWhereInput[] = [];

    for (const pref of locationPrefs) {
      if (pref === 'remote') {
        or.push({ locationType: 'REMOTE' });
        continue;
      }

      const expanded = LOCATION_EXPAND[pref] ?? [pref];
      for (const term of expanded) {
        or.push({ location: { contains: term, mode: 'insensitive' } });
      }
    }

    return or;
  }

  private async query(
    where: Prisma.JobWhereInput,
    page: number,
  ): Promise<JobQueryResult> {
    const skip = (page - 1) * PAGE_SIZE;

    const [jobs, total] = await Promise.all([
      this.prisma.job.findMany({
        where,
        include: { company: { select: { name: true } } },
        orderBy: { postedAt: 'desc' },
        skip,
        take: PAGE_SIZE,
      }),
      this.prisma.job.count({ where }),
    ]);

    return { jobs, total };
  }
}
