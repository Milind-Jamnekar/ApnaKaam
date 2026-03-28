import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { LocationType, RawJobDto } from '../dto/raw-job.dto';
import { BaseScraper } from './base.scraper';

const REMOTIVE_API =
  'https://remotive.com/api/remote-jobs?category=software-dev';

const BACKEND_KEYWORDS = [
  'node',
  'nodejs',
  'node.js',
  'backend',
  'back-end',
  'server',
  'api',
  'nestjs',
  'express',
  'typescript',
];

interface RemotiveJob {
  id: number;
  url: string;
  title: string;
  company_name: string;
  tags: string[];
  description: string;
  salary: string;
  candidate_required_location: string;
  publication_date: string;
}

interface RemotiveResponse {
  jobs: RemotiveJob[];
}

@Injectable()
export class RemotiveScraper extends BaseScraper {
  constructor(
    @InjectPinoLogger(RemotiveScraper.name)
    logger: PinoLogger,
  ) {
    super(logger);
  }

  getSourceName(): string {
    return 'remotive';
  }

  async fetchListings(): Promise<RawJobDto[]> {
    const res = await fetch(REMOTIVE_API);
    if (!res.ok) {
      throw new Error(`Remotive API returned ${res.status}`);
    }

    const data = (await res.json()) as RemotiveResponse;

    return data.jobs
      .filter((job) => this.isBackendRole(job))
      .map((job) => this.mapToDto(job));
  }

  private isBackendRole(job: RemotiveJob): boolean {
    const haystack = [job.title, ...job.tags].join(' ').toLowerCase();
    return BACKEND_KEYWORDS.some((kw) => haystack.includes(kw));
  }

  private mapToDto(job: RemotiveJob): RawJobDto {
    const dto = new RawJobDto();
    dto.title = job.title;
    dto.companyName = job.company_name;
    dto.description = this.stripHtml(job.description);
    dto.url = job.url;
    dto.source = this.getSourceName();
    dto.location = job.candidate_required_location || 'Remote';
    dto.locationType = LocationType.REMOTE;
    dto.stackRaw = job.tags.join(', ');
    dto.postedAt = job.publication_date;
    dto.externalId = String(job.id);

    const salary = this.parseSalary(job.salary);
    if (salary) {
      dto.salaryMin = salary.min;
      dto.salaryMax = salary.max;
      dto.salaryCurrency = salary.currency;
    }

    return dto;
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  private parseSalary(
    salary: string,
  ): { min: number; max: number; currency: string } | null {
    if (!salary) return null;

    // Match patterns like "$80,000 - $120,000" or "80000-120000 USD"
    const currencyMatch = salary.match(/([£$€₹]|USD|EUR|GBP|INR)/i);
    const numbersMatch = salary.match(/[\d,]+/g);

    if (!numbersMatch || numbersMatch.length < 1) return null;

    const nums = numbersMatch.map((n) => parseInt(n.replace(/,/g, ''), 10));
    const currency = currencyMatch
      ? this.normalizeCurrency(currencyMatch[1])
      : 'USD';

    return {
      min: nums[0],
      max: nums[1] ?? nums[0],
      currency,
    };
  }

  private normalizeCurrency(raw: string): string {
    const map: Record<string, string> = {
      $: 'USD',
      '£': 'GBP',
      '€': 'EUR',
      '₹': 'INR',
    };
    return map[raw] ?? raw.toUpperCase();
  }
}
