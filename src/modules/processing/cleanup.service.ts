import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../database/prisma.service';

const STALE_AFTER_DAYS = 30;

@Injectable()
export class CleanupService {
  constructor(
    @InjectPinoLogger(CleanupService.name)
    private readonly logger: PinoLogger,
    private readonly prisma: PrismaService,
  ) {}

  async deactivateStaleJobs(): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - STALE_AFTER_DAYS);

    const result = await this.prisma.job.updateMany({
      where: { isActive: true, scrapedAt: { lt: cutoff } },
      data: { isActive: false },
    });

    this.logger.info(
      { count: result.count, cutoff },
      `Cleanup: deactivated ${result.count} stale jobs`,
    );

    return result.count;
  }
}
