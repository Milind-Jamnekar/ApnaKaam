import { Context } from 'telegraf';
import { Telegraf } from 'telegraf';

export abstract class BaseCommand {
  abstract register(bot: Telegraf<Context>): void;
}
