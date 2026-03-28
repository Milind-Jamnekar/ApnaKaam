import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../redis/redis.service';

const FINGERPRINT_KEY = 'job:fingerprints';
const TTL_30_DAYS = 30 * 24 * 60 * 60;

@Injectable()
export class DeduplicatorService {
  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
  ) {}

  async isDuplicate(fingerprint: string, url: string): Promise<boolean> {
    // Primary check: Redis SET (fast, O(1))
    const inRedis = await this.redis.sismember(FINGERPRINT_KEY, fingerprint);
    if (inRedis) return true;

    // Fallback: check URL uniqueness in DB (catches cases where Redis was flushed)
    const existing = await this.prisma.job.findUnique({ where: { url } });
    return existing !== null;
  }

  async markAsSeen(fingerprint: string): Promise<void> {
    await this.redis.sadd(FINGERPRINT_KEY, fingerprint);
    // Reset TTL on every write — acceptable rolling window for dedup
    await this.redis.expire(FINGERPRINT_KEY, TTL_30_DAYS);
  }
}
