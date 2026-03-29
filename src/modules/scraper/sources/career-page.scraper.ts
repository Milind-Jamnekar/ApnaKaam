import { Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { XMLParser } from 'fast-xml-parser';
import { ScraperConfig } from '../../../generated/prisma-client';
import { PrismaService } from '../../database/prisma.service';
import { LocationType, RawJobDto } from '../dto/raw-job.dto';
import { BaseScraper } from './base.scraper';

// ---------------------------------------------------------------------------
// Selector config shapes — stored as JSON in ScraperConfig.selectors
// ---------------------------------------------------------------------------

/**
 * For sourceType = 'api'
 * Dot-notation paths into the JSON response.
 *
 * Supported ATS flavours (auto-detected from baseUrl):
 *   - Greenhouse  boards-api.greenhouse.io   → jobs[], title, absolute_url, location.name
 *   - Ashby       api.ashbyhq.com            → jobs[], title, jobUrl, location, department, isRemote
 *   - Custom      any JSON endpoint          → supply explicit paths
 */
interface ApiSelectors {
  jobsPath: string; // dot path to the jobs array, e.g. "jobs" or "" for root array
  title: string; // dot path to title field
  url: string; // dot path to job URL
  location?: string; // dot path to location string/object
  department?: string;
  isRemote?: string; // dot path to boolean flag
  postedAt?: string; // dot path to ISO date string
}

/**
 * For sourceType = 'career_page' (HTML + CSS selectors via cheerio)
 */
interface HtmlSelectors {
  jobCard: string; // CSS selector for each job row/card
  title: string; // CSS selector for title within card
  url: string; // CSS selector for the apply link (href is extracted)
  location?: string;
  department?: string;
}

/**
 * For sourceType = 'rss'
 */
interface RssSelectors {
  titlePath: string; // XML key for title, e.g. "title"
  urlPath: string; // XML key for link
  descPath?: string;
  locationPath?: string;
}

type SelectorConfig = ApiSelectors | HtmlSelectors | RssSelectors;

// ---------------------------------------------------------------------------
// Backend filter (same keywords as other scrapers)
// ---------------------------------------------------------------------------

const BACKEND_RE =
  /node|nodejs|backend|back.end|server.side|api|rest|graphql|grpc|nestjs|express|fastify|typescript|javascript|python|django|fastapi|golang|ruby|rails|java|spring|rust|php|laravel|microservices|kafka|postgresql|postgres|mysql|mongodb|redis|elasticsearch|aws|gcp|azure|docker|kubernetes|devops|sre|fullstack|full.stack/i;

// ---------------------------------------------------------------------------
// Scraper
// ---------------------------------------------------------------------------

@Injectable()
export class CareerPageScraper extends BaseScraper {
  constructor(
    @InjectPinoLogger(CareerPageScraper.name)
    logger: PinoLogger,
    private readonly prisma: PrismaService,
  ) {
    super(logger);
  }

  getSourceName(): string {
    return 'career_page';
  }

  async fetchListings(): Promise<RawJobDto[]> {
    const configs = await this.prisma.scraperConfig.findMany({
      where: { isActive: true },
      include: { company: { select: { name: true } } },
    });

    this.logger.info(`CareerPage: running ${configs.length} active configs`);

    const results = await Promise.allSettled(
      configs.map((cfg) => this.runConfig(cfg)),
    );

    const allJobs: RawJobDto[] = [];
    for (const r of results) {
      if (r.status === 'fulfilled') allJobs.push(...r.value);
    }

    return allJobs;
  }

  // ── Per-config runner ────────────────────────────────────────────────────

  private async runConfig(
    cfg: ScraperConfig & { company: { name: string } },
  ): Promise<RawJobDto[]> {
    const start = Date.now();
    let status = 'success';

    try {
      const selectors = cfg.selectors as unknown as SelectorConfig;
      let jobs: RawJobDto[] = [];

      if (cfg.sourceType === 'api') {
        jobs = await this.scrapeApi(cfg, selectors as ApiSelectors);
      } else if (cfg.sourceType === 'career_page') {
        jobs = await this.scrapeHtml(cfg, selectors as HtmlSelectors);
      } else if (cfg.sourceType === 'rss') {
        jobs = await this.scrapeRss(cfg, selectors as RssSelectors);
      } else {
        this.logger.warn(
          `CareerPage [${cfg.company.name}]: unknown sourceType "${cfg.sourceType}"`,
        );
      }

      if (jobs.length === 0) {
        this.logger.warn(
          `CareerPage [${cfg.company.name}]: 0 jobs extracted from ${cfg.baseUrl} ` +
            `— selectors may be broken. sourceType=${cfg.sourceType}`,
        );
        status = 'empty';
      } else {
        this.logger.info(
          `CareerPage [${cfg.company.name}]: ${jobs.length} jobs in ${Date.now() - start}ms`,
        );
      }

      return jobs;
    } catch (err) {
      status = 'error';
      this.logger.error(
        {
          err: err instanceof Error ? err : new Error(String(err)),
          company: cfg.company.name,
          url: cfg.baseUrl,
        },
        `CareerPage [${cfg.company.name}]: scrape failed`,
      );
      return [];
    } finally {
      await this.prisma.scraperConfig.update({
        where: { id: cfg.id },
        data: { lastRunAt: new Date(), lastRunStatus: status },
      });
    }
  }

  // ── API (JSON) strategy ──────────────────────────────────────────────────

  private async scrapeApi(
    cfg: ScraperConfig & { company: { name: string } },
    sel: ApiSelectors,
  ): Promise<RawJobDto[]> {
    const res = await this.fetchWithTimeout(cfg.baseUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = (await res.json()) as unknown;
    const rawList = sel.jobsPath ? this.resolvePath(data, sel.jobsPath) : data;

    if (!Array.isArray(rawList)) {
      throw new Error(`jobsPath "${sel.jobsPath}" did not resolve to an array`);
    }

    const jobs: RawJobDto[] = [];
    for (const item of rawList as Record<string, unknown>[]) {
      const title = this.str(this.resolvePath(item, sel.title)).trim();
      const url = this.str(this.resolvePath(item, sel.url)).trim();
      if (!title || !url) continue;

      const department = sel.department
        ? this.str(this.resolvePath(item, sel.department)).trim()
        : '';

      if (!BACKEND_RE.test(`${title} ${department}`)) continue;

      const rawLocation = sel.location
        ? this.resolveLocationString(this.resolvePath(item, sel.location))
        : '';

      const isRemoteFlag = sel.isRemote
        ? Boolean(this.resolvePath(item, sel.isRemote))
        : false;

      const { locationType, location } = this.inferLocationType(
        rawLocation,
        isRemoteFlag,
      );

      const postedAt = sel.postedAt
        ? this.str(this.resolvePath(item, sel.postedAt)) || undefined
        : undefined;

      const dto = new RawJobDto();
      dto.title = title;
      dto.companyName = cfg.company.name;
      dto.description = `${title} at ${cfg.company.name}. ${department ? `Department: ${department}.` : ''}`;
      dto.url = url;
      dto.source = 'career_page';
      dto.location = location || undefined;
      dto.locationType = locationType;
      dto.stackRaw = `${title} ${department}`;
      if (postedAt) dto.postedAt = postedAt;

      jobs.push(dto);
    }

    return jobs;
  }

  // ── HTML / CSS strategy ──────────────────────────────────────────────────

  private async scrapeHtml(
    cfg: ScraperConfig & { company: { name: string } },
    sel: HtmlSelectors,
  ): Promise<RawJobDto[]> {
    const res = await this.fetchWithTimeout(cfg.baseUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const $ = cheerio.load(html);

    const jobs: RawJobDto[] = [];

    $(sel.jobCard).each((_, el) => {
      const title = $(el).find(sel.title).first().text().trim();
      const linkEl = $(el).find(sel.url).first();
      let url = linkEl.attr('href') ?? linkEl.text().trim();
      if (!url || !title) return;

      // Make relative URLs absolute
      if (url.startsWith('/')) {
        const base = new URL(cfg.baseUrl);
        url = `${base.origin}${url}`;
      }

      const department = sel.department
        ? $(el).find(sel.department).first().text().trim()
        : '';

      if (!BACKEND_RE.test(`${title} ${department}`)) return;

      const rawLocation = sel.location
        ? $(el).find(sel.location).first().text().trim()
        : '';

      const { locationType, location } = this.inferLocationType(
        rawLocation,
        false,
      );

      const dto = new RawJobDto();
      dto.title = title;
      dto.companyName = cfg.company.name;
      dto.description = `${title} at ${cfg.company.name}.`;
      dto.url = url;
      dto.source = 'career_page';
      dto.location = location || undefined;
      dto.locationType = locationType;
      dto.stackRaw = `${title} ${department}`;

      jobs.push(dto);
    });

    return jobs;
  }

  // ── RSS / XML strategy ───────────────────────────────────────────────────

  private async scrapeRss(
    cfg: ScraperConfig & { company: { name: string } },
    sel: RssSelectors,
  ): Promise<RawJobDto[]> {
    const res = await this.fetchWithTimeout(cfg.baseUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();

    const parser = new XMLParser({ ignoreAttributes: false });
    const parsed = parser.parse(xml) as Record<string, unknown>;

    // Walk to items — handles both RSS 2.0 (channel.item) and Atom (feed.entry)
    const channel =
      (parsed['rss'] as Record<string, unknown>)?.['channel'] ??
      parsed['feed'] ??
      parsed;
    const items: Record<string, unknown>[] = ((
      channel as Record<string, unknown>
    )['item'] ??
      (channel as Record<string, unknown>)['entry'] ??
      []) as Record<string, unknown>[];

    const jobs: RawJobDto[] = [];
    for (const item of items) {
      const title = this.str(item[sel.titlePath]).trim();
      const url = this.str(item[sel.urlPath]).trim();
      if (!title || !url) continue;

      const desc = sel.descPath ? this.str(item[sel.descPath]) : '';
      if (!BACKEND_RE.test(`${title} ${desc}`)) continue;

      const rawLocation = sel.locationPath
        ? this.str(item[sel.locationPath])
        : '';
      const { locationType, location } = this.inferLocationType(
        rawLocation,
        false,
      );

      const dto = new RawJobDto();
      dto.title = title;
      dto.companyName = cfg.company.name;
      dto.description = desc || `${title} at ${cfg.company.name}`;
      dto.url = url;
      dto.source = 'career_page';
      dto.location = location || undefined;
      dto.locationType = locationType;
      dto.stackRaw = `${title} ${desc}`;

      jobs.push(dto);
    }

    return jobs;
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  /** Safe string coercion — rejects objects so the linter is happy */
  private str(val: unknown): string {
    if (val === null || val === undefined) return '';
    if (typeof val === 'string') return val;
    if (typeof val === 'number' || typeof val === 'boolean') return String(val);
    return ''; // don't stringify objects — caller should use resolveLocationString
  }

  /** Resolve a dot-notation path like "location.name" or "departments.0.name" */
  private resolvePath(obj: unknown, path: string): unknown {
    if (!path) return obj;
    return path.split('.').reduce<unknown>((cur, key) => {
      if (cur === null || cur === undefined) return undefined;
      if (Array.isArray(cur)) return (cur as unknown[])[Number(key)];
      return (cur as Record<string, unknown>)[key];
    }, obj);
  }

  /** Normalise location field — handles both string and {name:string} shapes */
  private resolveLocationString(val: unknown): string {
    if (!val) return '';
    if (typeof val === 'string') return val;
    if (typeof val === 'object' && val !== null) {
      const obj = val as Record<string, unknown>;
      return this.str(obj['name'] ?? obj['city'] ?? obj['label'] ?? '');
    }
    return this.str(val);
  }

  private inferLocationType(
    location: string,
    isRemoteFlag: boolean,
  ): { locationType: LocationType; location: string } {
    if (isRemoteFlag || /\bremote\b/i.test(location)) {
      return {
        locationType: LocationType.REMOTE,
        location: location || 'Remote',
      };
    }
    if (/\bhybrid\b/i.test(location)) {
      return { locationType: LocationType.HYBRID, location };
    }
    return { locationType: LocationType.ONSITE, location };
  }
}
