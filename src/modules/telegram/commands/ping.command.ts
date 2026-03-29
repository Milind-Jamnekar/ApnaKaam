import { Injectable } from '@nestjs/common';
import { Context, Telegraf } from 'telegraf';
import { BaseCommand } from './base.command';

@Injectable()
export class PingCommand extends BaseCommand {
  register(bot: Telegraf<Context>): void {
    bot.command('ping', (ctx) => ctx.reply('pong 🏓'));
  }
}
