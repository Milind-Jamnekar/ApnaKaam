import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma-client';
import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../redis/redis.service';
import { JobQueryDto } from './dto/job-query.dto';
import { JobResponseDto, toJobResponseDto } from './dto/job-response.dto';

const JOBS_CACHE_TTL = 300; // 5 minutes
const STATS_CACHE_KEY = 'cache:stats';

export interface PaginatedJobs {
  data: JobResponseDto[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface JobStats {
  totalJobs: number;
  activeJobs: number;
  jobsToday: number;
  sourceBreakdown: Record<string, number>;
  topStacks: { name: string; count: number }[];
}

@Injectable()
export class JobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async findAll(query: JobQueryDto): Promise<PaginatedJobs> {
    const cacheKey = `cache:jobs:${JSON.stringify(query)}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as PaginatedJobs;

    const where = this.buildWhere(query);
    const orderBy: Prisma.JobOrderByWithRelationInput =
      query.sortBy === 'relevanceScore'
        ? { relevanceScore: 'desc' }
        : { postedAt: 'desc' };

    const skip = (query.page - 1) * query.limit;

    const [jobs, total] = await Promise.all([
      this.prisma.job.findMany({
        where,
        include: { company: true },
        orderBy,
        skip,
        take: query.limit,
      }),
      this.prisma.job.count({ where }),
    ]);

    const result: PaginatedJobs = {
      data: jobs.map(toJobResponseDto),
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit),
      },
    };

    await this.redis.set(cacheKey, JSON.stringify(result), JOBS_CACHE_TTL);
    return result;
  }

  async findOne(id: string): Promise<JobResponseDto> {
    const job = await this.prisma.job.findUnique({
      where: { id },
      include: { company: true },
    });

    if (!job) throw new NotFoundException(`Job ${id} not found`);
    return toJobResponseDto(job);
  }

  async getStats(): Promise<JobStats> {
    const cached = await this.redis.get(STATS_CACHE_KEY);
    if (cached) return JSON.parse(cached) as JobStats;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [totalJobs, activeJobs, jobsToday, sourceGroups, topStacksRaw] =
      await Promise.all([
        this.prisma.job.count(),
        this.prisma.job.count({ where: { isActive: true } }),
        this.prisma.job.count({ where: { scrapedAt: { gte: today } } }),
        this.prisma.job.groupBy({ by: ['source'], _count: { id: true } }),
        this.prisma.$queryRaw<{ stack_item: string; count: bigint }[]>`
          SELECT unnest(stack) AS stack_item, COUNT(*) AS count
          FROM "Job"
          WHERE "isActive" = true
          GROUP BY stack_item
          ORDER BY count DESC
          LIMIT 10
        `,
      ]);

    const result: JobStats = {
      totalJobs,
      activeJobs,
      jobsToday,
      sourceBreakdown: Object.fromEntries(
        sourceGroups.map(({ source, _count }) => [source, _count.id]),
      ),
      topStacks: topStacksRaw.map(({ stack_item, count }) => ({
        name: stack_item,
        count: Number(count),
      })),
    };

    await this.redis.set(
      STATS_CACHE_KEY,
      JSON.stringify(result),
      JOBS_CACHE_TTL,
    );
    return result;
  }

  private buildWhere(query: JobQueryDto): Prisma.JobWhereInput {
    const where: Prisma.JobWhereInput = { isActive: true };

    if (query.stack) {
      const stackArray = query.stack
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      where.stack = { hasSome: stackArray };
    }

    if (query.location) {
      where.location = { contains: query.location, mode: 'insensitive' };
    }

    if (query.locationType) {
      where.locationType = query.locationType;
    }

    if (query.seniority) {
      where.seniorityLevel = { contains: query.seniority, mode: 'insensitive' };
    }

    if (query.source) {
      where.source = query.source;
    }

    if (query.minSalary !== undefined) {
      where.salaryMin = { gte: query.minSalary };
    }

    return where;
  }
}
