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

// Maximum retries when Telegram responds with 429 Too Many Requests
const MAX_SEND_RETRIES = 3;

interface TelegramApiError {
  error_code?: number;
  parameters?: { retry_after?: number };
}

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
    this.registerFallbackHandlers();
    await this.bot.telegram.setMyCommands(BOT_COMMANDS);
    void this.bot.launch();
    this.logger.info('Telegram bot started');
  }

  onModuleDestroy(): void {
    this.bot.stop('SIGTERM');
    this.logger.info('Telegram bot stopped');
  }

  async sendMessage(
    chatId: string | number,
    text: string,
    retriesLeft = MAX_SEND_RETRIES,
  ): Promise<void> {
    try {
      await this.bot.telegram.sendMessage(chatId, text, {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
      });
    } catch (err) {
      const apiErr = err as TelegramApiError;
      if (apiErr?.error_code === 429 && retriesLeft > 0) {
        const waitSecs = apiErr.parameters?.retry_after ?? 5;
        this.logger.warn(
          { chatId, waitSecs, retriesLeft },
          'Telegram 429 — backing off before retry',
        );
        await this.delay(waitSecs * 1000);
        return this.sendMessage(chatId, text, retriesLeft - 1);
      }
      throw err;
    }
  }

  private registerCommands(): void {
    for (const command of this.commands) {
      command.register(this.bot);
    }
  }

  /**
   * Catch-all handlers registered AFTER all commands so they fire last.
   * - Unknown slash command → helpful error
   * - Plain text message → silently ignored
   */
  private registerFallbackHandlers(): void {
    this.bot.on('text', async (ctx) => {
      const text = ctx.message.text ?? '';
      if (text.startsWith('/')) {
        await ctx.reply(
          "I don't know that command. Try /help for a list of what I can do.",
        );
      }
      // Non-command text: ignore silently
    });
  }

  private registerErrorMiddleware(): void {
    this.bot.catch(async (err, ctx) => {
      this.logger.error(
        {
          err: err instanceof Error ? err : new Error(String(err)),
          updateType: ctx.updateType,
          chatId: ctx.chat?.id,
        },
        `Telegram bot error on update type: ${ctx.updateType}`,
      );
      try {
        await ctx.reply(
          'Something went wrong on my end. Try again in a few minutes.',
        );
      } catch {
        // Ignore errors when trying to send the error reply
      }
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
