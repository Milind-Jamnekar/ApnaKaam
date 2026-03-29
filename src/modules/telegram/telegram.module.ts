import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Module, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import {
  DIGEST_QUEUE,
  DailyDigestService,
} from './alerts/daily-digest.service';
import { RealtimeAlertService } from './alerts/realtime-alert.service';
import { BaseCommand } from './commands/base.command';
import { HelpCommand } from './commands/help.command';
import { JobsCommand } from './commands/jobs.command';
import { PingCommand } from './commands/ping.command';
import { PreferenceFlowCommand } from './commands/preference-flow.command';
import { SearchCommand } from './commands/search.command';
import { SettingsCommand } from './commands/settings.command';
import { StartCommand } from './commands/start.command';
import { StatsCommand } from './commands/stats.command';
import { SubscribeCommand } from './commands/subscribe.command';
import { JobMessageFormatter } from './formatters/job-message.formatter';
import { PreferenceFlowService } from './preference-flow.service';
import { SessionService } from './session.service';
import { SubscriptionService } from './subscription.service';
import { TELEGRAM_COMMANDS } from './telegram.constants';
import { TelegramJobsService } from './telegram-jobs.service';
import { TelegramService } from './telegram.service';
import { UserService } from './user.service';

// Daily 9 AM IST = 3:30 AM UTC
const DAILY_DIGEST_CRON = '30 3 * * *';
// Weekly Monday 9 AM IST = Monday 3:30 AM UTC
const WEEKLY_DIGEST_CRON = '30 3 * * 1';

const commandProviders = [
  PingCommand,
  StartCommand,
  SettingsCommand,
  PreferenceFlowCommand,
  JobsCommand,
  SearchCommand,
  SubscribeCommand,
  HelpCommand,
  StatsCommand,
];

@Module({
  imports: [BullModule.registerQueue({ name: DIGEST_QUEUE })],
  providers: [
    UserService,
    SessionService,
    PreferenceFlowService,
    TelegramJobsService,
    JobMessageFormatter,
    SubscriptionService,
    DailyDigestService,
    RealtimeAlertService,
    ...commandProviders,
    {
      provide: TELEGRAM_COMMANDS,
      useFactory: (...cmds: BaseCommand[]) => cmds,
      inject: commandProviders,
    },
    TelegramService,
  ],
  exports: [TelegramService, RealtimeAlertService],
})
export class TelegramModule implements OnModuleInit {
  constructor(
    @InjectQueue(DIGEST_QUEUE) private readonly digestQueue: Queue,
    @InjectPinoLogger(TelegramModule.name) private readonly logger: PinoLogger,
  ) {}

  async onModuleInit(): Promise<void> {
    const existing = await this.digestQueue.getJobSchedulers();
    const existingNames = new Set(existing.map((j) => j.name));

    if (!existingNames.has('daily')) {
      await this.digestQueue.add(
        'daily',
        {},
        { repeat: { pattern: DAILY_DIGEST_CRON, tz: 'UTC' } },
      );
      this.logger.info('Registered daily digest job (9 AM IST)');
    }

    if (!existingNames.has('weekly')) {
      await this.digestQueue.add(
        'weekly',
        {},
        { repeat: { pattern: WEEKLY_DIGEST_CRON, tz: 'UTC' } },
      );
      this.logger.info('Registered weekly digest job (Monday 9 AM IST)');
    }
  }
}
