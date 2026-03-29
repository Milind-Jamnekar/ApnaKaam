import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Telegraf } from 'telegraf';
import { BaseCommand } from './commands/base.command';
import { TELEGRAM_COMMANDS } from './telegram.constants';

const BOT_COMMANDS = [
  { command: 'start', description: 'Register and set up your preferences' },
  { command: 'jobs', description: 'Get latest jobs matching your stack' },
  { command: 'search', description: 'Search jobs — /search nestjs remote' },
  { command: 'subscribe', description: 'Subscribe to daily digest' },
  { command: 'settings', description: 'View or update your preferences' },
  { command: 'stats', description: 'Jobs scraped today and active listings' },
  { command: 'help', description: 'List all commands' },
  { command: 'ping', description: 'Health check' },
];

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  readonly bot: Telegraf;

  constructor(
    @InjectPinoLogger(TelegramService.name)
    private readonly logger: PinoLogger,
    private readonly config: ConfigService,
    @Inject(TELEGRAM_COMMANDS) private readonly commands: BaseCommand[],
  ) {
    const token = this.config.getOrThrow<string>('TELEGRAM_BOT_TOKEN');
    this.bot = new Telegraf(token);
  }

  async onModuleInit(): Promise<void> {
    this.registerErrorMiddleware();
    this.registerCommands();
    await this.bot.telegram.setMyCommands(BOT_COMMANDS);
    void this.bot.launch();
    this.logger.info('Telegram bot started');
  }

  onModuleDestroy(): void {
    this.bot.stop('SIGTERM');
    this.logger.info('Telegram bot stopped');
  }

  async sendMessage(chatId: string | number, text: string): Promise<void> {
    await this.bot.telegram.sendMessage(chatId, text, {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
    });
  }

  private registerCommands(): void {
    for (const command of this.commands) {
      command.register(this.bot);
    }
  }

  private registerErrorMiddleware(): void {
    this.bot.catch((err, ctx) => {
      this.logger.error(
        {
          err: err instanceof Error ? err : new Error(String(err)),
          updateType: ctx.updateType,
          chatId: ctx.chat?.id,
        },
        `Telegram bot error on update type: ${ctx.updateType}`,
      );
    });
  }
}
