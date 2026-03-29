import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../database/prisma.service';
import { RelevanceScorerService } from '../../processing/relevance-scorer.service';
import { JobMessageFormatter } from '../formatters/job-message.formatter';
import { SubscriptionService } from '../subscription.service';
import { TelegramService } from '../telegram.service';

@Injectable()
export class RealtimeAlertService {
  constructor(
    @InjectPinoLogger(RealtimeAlertService.name)
    private readonly logger: PinoLogger,
    private readonly prisma: PrismaService,
    private readonly subscriptionService: SubscriptionService,
    private readonly formatter: JobMessageFormatter,
    private readonly telegram: TelegramService,
    private readonly scorer: RelevanceScorerService,
  ) {}

  async notifyNewJobs(jobIds: string[]): Promise<void> {
    if (!jobIds.length) return;

    const subscribers =
      await this.subscriptionService.getAllActiveByFrequency('realtime');
    if (!subscribers.length) return;

    const jobs = await this.prisma.job.findMany({
      where: { id: { in: jobIds } },
      include: { company: { select: { name: true } } },
    });

    for (const sub of subscribers) {
      const userPrefs = {
        stackPreferences: sub.stackPreferences,
        locationPrefs: sub.locationPrefs,
        seniorityPref: sub.seniorityPref,
      };

      const scored = this.scorer.scoreAndSort(jobs, userPrefs);
      const matching = scored
        .filter(({ score }) => score >= 60)
        .map(({ job, score }) => ({ ...job, score }));

      // Filter to jobs not yet sent
      const unsent: (typeof matching)[number][] = [];
      for (const job of matching) {
        const alreadySent = await this.subscriptionService.hasAlertBeenSent(
          sub.userId,
          job.id,
        );
        if (!alreadySent) unsent.push(job);
      }
      if (unsent.length === 0) continue;

      try {
        // Send one batched message with all matching jobs
        const jobCount = unsent.length;
        const cards = unsent
          .map((job, i) => this.formatter.formatSingleJob(job, i + 1))
          .join('\n─────────────────────\n\n');
        const heading =
          jobCount === 1
            ? '🆕 <b>New job matching your stack!</b>'
            : `🆕 <b>${jobCount} new jobs matching your stack!</b>`;
        const text = `${heading}\n\n${cards}\nReply /jobs for more matches`;

        await this.telegram.sendMessage(sub.chatId, text);

        for (const job of unsent) {
          await this.subscriptionService.logAlert(
            sub.userId,
            job.id,
            'telegram-realtime',
          );
        }
      } catch (err) {
        this.logger.error(
          {
            err: err instanceof Error ? err : new Error(String(err)),
            chatId: sub.chatId,
          },
          'Failed to send realtime alert',
        );
      }

      await this.delay(200);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
