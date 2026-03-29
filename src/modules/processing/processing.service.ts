import { Injectable } from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/client';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../redis/redis.service';
import { RawJobDto } from '../scraper/dto/raw-job.dto';
import { BaseScraper } from '../scraper/sources/base.scraper';
import { DeduplicatorService } from './deduplicator.service';
import { NormalizerService } from './normalizer.service';
import { StackClassifierService } from './stack-classifier.service';

export interface ProcessingResult {
  saved: number;
  duplicates: number;
  errors: number;
}

@Injectable()
export class ProcessingService {
  constructor(
    @InjectPinoLogger(ProcessingService.name)
    private readonly logger: PinoLogger,
    private readonly normalizer: NormalizerService,
    private readonly deduplicator: DeduplicatorService,
    private readonly classifier: StackClassifierService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async processJobs(rawJobs: RawJobDto[]): Promise<ProcessingResult> {
    const result: ProcessingResult = { saved: 0, duplicates: 0, errors: 0 };

    for (const raw of rawJobs) {
      try {
        const normalized = this.normalizer.normalize(raw);
        const fingerprint = BaseScraper.generateFingerprint(
          normalized.title,
          normalized.companyName,
          normalized.location,
        );

        const isDup = await this.deduplicator.isDuplicate(
          fingerprint,
          normalized.url,
        );
        if (isDup) {
          result.duplicates++;
          continue;
        }

        const stack = this.classifier.classifyStack(
          normalized.title,
          normalized.description,
          normalized.stackRaw,
        );

        await this.prisma.$transaction(async (tx) => {
          const company = await tx.company.upsert({
            where: { name: normalized.companyName },
            create: { name: normalized.companyName },
            update: {},
          });

          await tx.job.create({
            data: {
              title: normalized.title,
              companyId: company.id,
              description: normalized.description,
              url: normalized.url,
              source: normalized.source,
              location: normalized.location,
              locationType: normalized.locationType,
              salaryMin: normalized.salaryMin,
              salaryMax: normalized.salaryMax,
              salaryCurrency: normalized.salaryCurrency,
              experienceMin: normalized.experienceMin,
              experienceMax: normalized.experienceMax,
              stack,
              stackRaw: normalized.stackRaw,
              fingerprint,
              postedAt: normalized.postedAt,
            },
          });
        });

        await this.deduplicator.markAsSeen(fingerprint);
        result.saved++;
      } catch (err) {
        // P2002 = unique constraint violation — URL already exists (race condition)
        if (
          err instanceof PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          result.duplicates++;
        } else {
          result.errors++;
          this.logger.error(
            { err: err instanceof Error ? err : new Error(String(err)) },
            `Failed to process job "${raw.title}" from ${raw.source}`,
          );
        }
      }
    }

    this.logger.info(
      result,
      `Processing complete: ${result.saved} saved, ${result.duplicates} duplicates, ${result.errors} errors`,
    );

    if (result.saved > 0) {
      await this.redis.delByPattern('cache:jobs:*');
      await this.redis.del('cache:stats');
    }

    return result;
  }
}
