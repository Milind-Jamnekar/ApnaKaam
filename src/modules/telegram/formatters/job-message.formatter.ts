import { Injectable } from '@nestjs/common';
import { LocationType } from '../../../generated/prisma-client';

export interface TelegramJob {
  id: string;
  title: string;
  company: { name: string };
  url: string;
  location: string | null;
  locationType: LocationType;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  stack: string[];
  postedAt: Date | null;
  seniorityLevel: string | null;
}

@Injectable()
export class JobMessageFormatter {
  formatJobList(jobs: TelegramJob[], page: number, total: number): string {
    if (jobs.length === 0) {
      return (
        `😕 <b>No matching jobs found.</b>\n\n` +
        `I'm scraping new listings every 6 hours — check back soon, ` +
        `or broaden your preferences with /settings.`
      );
    }

    const pageSize = jobs.length;
    const start = (page - 1) * 10 + 1;
    const end = start + pageSize - 1;

    const header =
      `🔍 <b>Jobs ${start}–${end} of ${total}</b>\n` +
      `─────────────────────\n\n`;

    const cards = jobs.map((job, i) => this.formatSingleJob(job, start + i));

    return header + cards.join('\n─────────────────────\n\n');
  }

  formatSingleJob(job: TelegramJob, index: number): string {
    const title = this.escape(job.title);
    const company = this.escape(job.company.name);
    const location = this.formatLocation(job);
    const salary = this.formatSalary(
      job.salaryMin,
      job.salaryMax,
      job.salaryCurrency,
    );
    const stack = this.formatStack(job.stack);
    const age = this.relativeTime(job.postedAt);
    const url = job.url;

    let line = `${index}. <b>${title}</b> — ${company}\n`;
    line += `📍 ${location}`;
    if (salary) line += `  ${salary}`;
    line += `\n`;
    if (stack) line += `🛠 ${stack}\n`;
    line += `🔗 <a href="${url}">Apply</a>  📅 ${age}\n`;

    return line;
  }

  private formatLocation(job: TelegramJob): string {
    const loc = job.location ?? '';
    const type =
      job.locationType === LocationType.REMOTE
        ? 'Remote'
        : job.locationType === LocationType.HYBRID
          ? 'Hybrid'
          : 'Onsite';

    if (!loc || loc.toLowerCase() === type.toLowerCase()) return type;
    return `${this.escape(loc)} (${type})`;
  }

  private formatSalary(
    min: number | null,
    max: number | null,
    currency: string | null,
  ): string {
    if (!min && !max) return '';
    const curr = (currency ?? 'USD').toUpperCase();
    const symbol =
      curr === 'INR' ? '₹' : curr === 'EUR' ? '€' : curr === 'GBP' ? '£' : '$';
    const fmt = (n: number) =>
      n >= 1000 ? `${Math.round(n / 1000)}K` : String(n);

    if (min && max && min !== max) {
      return `💰 ${symbol}${fmt(min)}–${fmt(max)} ${curr}`;
    }
    return `💰 ${symbol}${fmt(min ?? max ?? 0)} ${curr}`;
  }

  private formatStack(stack: string[]): string {
    if (!stack.length) return '';
    return stack.slice(0, 6).join(', ');
  }

  private relativeTime(date: Date | null): string {
    if (!date) return 'unknown date';
    const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
    if (days === 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 7) return `${days} days ago`;
    if (days < 14) return '1 week ago';
    if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
    if (days < 60) return '1 month ago';
    return `${Math.floor(days / 30)} months ago`;
  }

  private escape(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}
