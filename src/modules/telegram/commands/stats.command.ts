import { Injectable } from '@nestjs/common';
import { Context, Telegraf } from 'telegraf';
import { PrismaService } from '../../database/prisma.service';
import { BaseCommand } from './base.command';

@Injectable()
export class StatsCommand extends BaseCommand {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  register(bot: Telegraf<Context>): void {
    bot.command('stats', async (ctx) => {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const [totalActive, newToday, totalCompanies] = await Promise.all([
        this.prisma.job.count({ where: { isActive: true } }),
        this.prisma.job.count({
          where: { isActive: true, createdAt: { gte: todayStart } },
        }),
        this.prisma.company.count(),
      ]);

      await ctx.reply(
        `📊 <b>ApnaKaam Stats</b>\n\n` +
          `🟢 Active listings: <b>${totalActive.toLocaleString()}</b>\n` +
          `🆕 Added today: <b>${newToday.toLocaleString()}</b>\n` +
          `🏢 Companies tracked: <b>${totalCompanies.toLocaleString()}</b>\n\n` +
          `<i>Data refreshed every 6 hours via automated scraping.</i>`,
        { parse_mode: 'HTML' },
      );
    });
  }
}
