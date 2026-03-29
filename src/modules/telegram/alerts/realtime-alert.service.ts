import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../database/prisma.service';
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
      const matching = jobs.filter(
        (job) =>
          sub.stackPreferences.length === 0 ||
          job.stack.some((s) => sub.stackPreferences.includes(s)),
      );

      for (const job of matching) {
        try {
          const alreadySent = await this.subscriptionService.hasAlertBeenSent(
            sub.userId,
            job.id,
          );
          if (alreadySent) continue;

          const card = this.formatter.formatSingleJob(job, 1);
          const text = `🆕 <b>New job matching your stack!</b>\n\n${card}\nReply /jobs for more matches`;

          await this.telegram.sendMessage(sub.chatId, text);
          await this.subscriptionService.logAlert(
            sub.userId,
            job.id,
            'telegram-realtime',
          );
          await this.delay(200);
        } catch (err) {
          this.logger.error(
            {
              err: err instanceof Error ? err : new Error(String(err)),
              chatId: sub.chatId,
            },
            'Failed to send realtime alert',
          );
        }
      }
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
