import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { XMLParser } from 'fast-xml-parser';
import { LocationType, RawJobDto } from '../dto/raw-job.dto';
import { BaseScraper } from './base.scraper';

const WWR_RSS =
  'https://weworkremotely.com/categories/remote-back-end-programming-jobs.rss';

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
  'python',
  'ruby',
  'golang',
  'java',
  'php',
  'rails',
  'django',
  'laravel',
  'spring',
];

interface WwrItem {
  title: string;
  link: string | string[];
  description: string;
  pubDate: string;
  guid: string;
}

@Injectable()
export class WeworkremotelyScraper extends BaseScraper {
  private readonly parser = new XMLParser({
    ignoreAttributes: false,
    cdataPropName: '__cdata',
    processEntities: { enabled: true, maxTotalExpansions: 10000 },
  });

  constructor(
    @InjectPinoLogger(WeworkremotelyScraper.name)
    logger: PinoLogger,
  ) {
    super(logger);
  }

  getSourceName(): string {
    return 'weworkremotely';
  }

  async fetchListings(): Promise<RawJobDto[]> {
    const res = await fetch(WWR_RSS);
    if (!res.ok) {
      throw new Error(`WWR RSS returned ${res.status}`);
    }

    const xml = await res.text();
    const parsed = this.parser.parse(xml) as {
      rss: { channel: { item: WwrItem[] } };
    };

    const items: WwrItem[] = parsed.rss?.channel?.item ?? [];

    return items
      .filter((item) => this.isBackendRole(item))
      .map((item) => this.mapToDto(item));
  }

  private isBackendRole(item: WwrItem): boolean {
    const rawTitle = this.extractCdata(item.title).toLowerCase();
    return BACKEND_KEYWORDS.some((kw) => rawTitle.includes(kw));
  }

  private mapToDto(item: WwrItem): RawJobDto {
    const rawTitle = this.extractCdata(item.title);
    const { company, title } = this.splitTitle(rawTitle);

    const dto = new RawJobDto();
    dto.title = title;
    dto.companyName = company;
    dto.description = this.stripHtml(this.extractCdata(item.description));
    dto.url = this.extractUrl(item.link, item.guid);
    dto.source = this.getSourceName();
    dto.location = 'Remote';
    dto.locationType = LocationType.REMOTE;
    dto.postedAt = item.pubDate
      ? new Date(item.pubDate).toISOString()
      : undefined;
    dto.externalId = this.extractCdata(item.guid);

    return dto;
  }

  // WWR wraps text content in CDATA blocks — fast-xml-parser puts them in __cdata
  private extractCdata(value: unknown): string {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'object' && value !== null && '__cdata' in value) {
      const cdata = (value as Record<string, unknown>)['__cdata'];
      return typeof cdata === 'string' ? cdata : '';
    }
    return '';
  }

  // WWR link elements contain both the canonical URL and an "apply" URL.
  // The RSS <link> tag is sometimes an array; pick the first non-empty string.
  private extractUrl(link: string | string[], guid: string): string {
    if (Array.isArray(link)) {
      const found = link.find(
        (l) => typeof l === 'string' && l.startsWith('http'),
      );
      return found ?? this.extractCdata(guid);
    }
    if (typeof link === 'string' && link.startsWith('http')) return link;
    return this.extractCdata(guid);
  }

  // Titles are formatted as "Company: Job Title" or "Region: Company: Job Title"
  // We split on the LAST colon to isolate the actual job title.
  private splitTitle(raw: string): { company: string; title: string } {
    const parts = raw
      .split(':')
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length >= 2) {
      return {
        company: parts[parts.length - 2],
        title: parts[parts.length - 1],
      };
    }
    return { company: 'Unknown', title: raw.trim() };
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
}
