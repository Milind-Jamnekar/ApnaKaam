import { Injectable } from '@nestjs/common';
import { Context, Telegraf } from 'telegraf';
import { PrismaService } from '../../database/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { BaseCommand } from './base.command';

const CACHE_KEY = 'telegram:stats';
const CACHE_TTL = 300; // 5 minutes

// Canonical display name for each source key
const SOURCE_LABELS: Record<string, string> = {
  remotive: 'Remotive',
  wellfound: 'Wellfound',
  weworkremotely: 'We Work Remotely',
  'hn-hiring': "HN Who's Hiring",
  career_page: 'Career Pages',
};

// All sources shown even if count is 0
const SOURCE_ORDER = [
  'remotive',
  'wellfound',
  'weworkremotely',
  'hn-hiring',
  'career_page',
];

@Injectable()
export class StatsCommand extends BaseCommand {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {
    super();
  }

  register(bot: Telegraf<Context>): void {
    bot.command('stats', async (ctx) => {
      const cached = await this.redis.get(CACHE_KEY);
      if (cached) {
        await ctx.reply(cached, {
          parse_mode: 'HTML',
          link_preview_options: { is_disabled: true },
        });
        return;
      }

      const text = await this.buildStats();
      await this.redis.set(CACHE_KEY, text, CACHE_TTL);
      await ctx.reply(text, {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
      });
    });
  }

  private async buildStats(): Promise<string> {
    const now = Date.now();
    const todayStart = new Date(now - 24 * 3600 * 1000);
    const weekStart = new Date(now - 7 * 24 * 3600 * 1000);

    // Run all queries in parallel
    const [
      totalActive,
      newToday,
      newThisWeek,
      sourceCounts,
      userCount,
      stackAgg,
      scraperConfigs,
    ] = await Promise.all([
      this.prisma.job.count({ where: { isActive: true } }),
      this.prisma.job.count({
        where: { isActive: true, createdAt: { gte: todayStart } },
      }),
      this.prisma.job.count({
        where: { isActive: true, createdAt: { gte: weekStart } },
      }),
      // Count per source
      this.prisma.job.groupBy({
        by: ['source'],
        where: { isActive: true },
        _count: { id: true },
      }),
      this.prisma.user.count({ where: { isActive: true } }),
      // Top stacks: fetch all active jobs' stacks for in-memory tally
      // (Postgres doesn't have a native array element count in Prisma groupBy)
      this.prisma.job.findMany({
        where: { isActive: true },
        select: { stack: true },
      }),
      // Scraper last-run info from ScraperConfig (one row per company),
      // and from the job source for non-config scrapers we derive from jobs
      this.prisma.scraperConfig.findMany({
        select: {
          sourceType: true,
          lastRunAt: true,
          lastRunStatus: true,
        },
        orderBy: { lastRunAt: 'desc' },
      }),
    ]);

    // Build source count map
    const countBySource = new Map<string, number>();
    for (const row of sourceCounts) {
      countBySource.set(row.source, row._count.id);
    }

    // Build last-run map from ScraperConfig (career_page source)
    // For other sources (remotive, wwr, hn-hiring) track via job createdAt
    const lastRunBySource = new Map<string, Date | null>();

    // Aggregate career_page: use the most recent lastRunAt across all configs
    for (const cfg of scraperConfigs) {
      const src = cfg.sourceType === 'api' ? 'career_page' : cfg.sourceType;
      const existing = lastRunBySource.get(src);
      if (cfg.lastRunAt && (!existing || cfg.lastRunAt > existing)) {
        lastRunBySource.set(src, cfg.lastRunAt);
      }
    }

    // For sources without ScraperConfig (remotive, wellfound, hn-hiring, wwr),
    // use the most recently created job as a proxy for last run time
    const recentBySource = await this.prisma.job.findMany({
      where: {
        source: {
          in: SOURCE_ORDER.filter((s) => !lastRunBySource.has(s)),
        },
        isActive: true,
      },
      orderBy: { createdAt: 'desc' },
      distinct: ['source'],
      select: { source: true, createdAt: true },
    });

    for (const row of recentBySource) {
      if (!lastRunBySource.has(row.source)) {
        lastRunBySource.set(row.source, row.createdAt);
      }
    }

    // Top 5 stacks
    const stackFreq = new Map<string, number>();
    for (const { stack } of stackAgg) {
      for (const tech of stack) {
        stackFreq.set(tech, (stackFreq.get(tech) ?? 0) + 1);
      }
    }
    const topStacks = [...stackFreq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    // Build message
    let text =
      `📊 <b>Apna Kaam Stats</b>\n\n` +
      `📋 <b>Active Listings:</b> ${totalActive.toLocaleString()}\n` +
      `🆕 <b>New Today:</b> ${newToday.toLocaleString()} | ` +
      `<b>This Week:</b> ${newThisWeek.toLocaleString()}\n\n` +
      `📡 <b>Sources:</b>\n`;

    for (const src of SOURCE_ORDER) {
      const label = SOURCE_LABELS[src] ?? src;
      const count = countBySource.get(src) ?? 0;
      const lastRun = lastRunBySource.get(src) ?? null;
      const runStr = lastRun ? this.relativeTime(lastRun) : 'never';
      const statusIcon = lastRun ? '✅' : '❓';
      text += `• ${label}: <b>${count.toLocaleString()}</b> jobs (last run: ${runStr} ${statusIcon})\n`;
    }

    if (topStacks.length > 0) {
      text += `\n🛠 <b>Top Stacks:</b>\n`;
      text += topStacks.map(([tech, n]) => `${tech} (${n})`).join(' · ');
      text += '\n';
    }

    text += `\n👥 <b>Registered Users:</b> ${userCount.toLocaleString()}`;

    return text;
  }

  private relativeTime(date: Date): string {
    const mins = Math.floor((Date.now() - date.getTime()) / 60_000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }
}
