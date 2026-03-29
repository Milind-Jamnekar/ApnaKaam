import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { RedisService } from '../../redis/redis.service';
import { LocationType, RawJobDto } from '../dto/raw-job.dto';
import { BaseScraper } from './base.scraper';

// ---------------------------------------------------------------------------
// HN "Who's Hiring" — posted on the 1st of each month by 'whoishiring'
// Top-level comments are job listings in a loose pipe-delimited format:
//   Company | Role | Location | [Salary] | [Remote/Onsite] | URL
// ---------------------------------------------------------------------------

const ALGOLIA_SEARCH =
  'https://hn.algolia.com/api/v1/search_by_date' +
  '?query=%22who+is+hiring%22&tags=story&numericFilters=created_at_i>';

const ALGOLIA_COMMENTS = (storyId: number, page: number) =>
  `https://hn.algolia.com/api/v1/search?tags=comment,story_${storyId}` +
  `&hitsPerPage=200&page=${page}`;

const HN_ITEM = (id: number) =>
  `https://hacker-news.firebaseio.com/v0/item/${id}.json`;

// Redis key for caching the resolved story ID (TTL = 2 days)
const REDIS_STORY_KEY = 'hn-hiring:story-id';
const STORY_TTL_S = 2 * 24 * 60 * 60;

// Delay between individual HN Firebase item fetches
const ITEM_DELAY_MS = 100;

// Max comments to fetch via item API fallback (Algolia usually covers all)
const MAX_DIRECT_COMMENTS = 300;

const BACKEND_KEYWORDS = [
  'node',
  'nodejs',
  'node.js',
  'backend',
  'back-end',
  'back end',
  'nestjs',
  'express',
  'fastify',
  'hapi',
  'typescript',
  'javascript',
  'python',
  'django',
  'fastapi',
  'flask',
  'golang',
  'go ',
  'ruby',
  'rails',
  'java',
  'spring',
  'rust',
  'php',
  'laravel',
  'api',
  'rest',
  'graphql',
  'grpc',
  'microservices',
  'kafka',
  'rabbitmq',
  'postgresql',
  'postgres',
  'mysql',
  'mongodb',
  'redis',
  'elasticsearch',
  'aws',
  'gcp',
  'azure',
  'docker',
  'kubernetes',
  'k8s',
  'devops',
  'sre',
  'full.?stack',
  'fullstack',
];

const BACKEND_RE = new RegExp(BACKEND_KEYWORDS.join('|'), 'i');

// Pipe-delimited fields we try to pull from the first line
const REMOTE_RE = /\bremote\b/i;
const HYBRID_RE = /\bhybrid\b/i;
const SALARY_RE = /\$[\d,]+|\d+k\s*[-–]\s*\d+k|\d{5,}/i;
const URL_RE = /https?:\/\/[^\s|<>"]+/g;

// ── Algolia shapes ──────────────────────────────────────────────────────────

interface AlgoliaStoryHit {
  objectID: string;
  title: string;
  author: string;
  created_at: string;
}

interface AlgoliaStoryResult {
  hits: AlgoliaStoryHit[];
}

interface AlgoliaCommentHit {
  objectID: string;
  comment_text: string | null;
  author: string | null;
  parent_id: number;
  story_id: number;
  created_at: string;
}

interface AlgoliaCommentResult {
  hits: AlgoliaCommentHit[];
  nbPages: number;
}

// ── HN Firebase shape ───────────────────────────────────────────────────────

interface HNItem {
  id: number;
  type: string;
  text?: string;
  by?: string;
  kids?: number[];
  deleted?: boolean;
  dead?: boolean;
  time: number;
  parent?: number;
}

@Injectable()
export class HnHiringScraper extends BaseScraper {
  constructor(
    @InjectPinoLogger(HnHiringScraper.name)
    logger: PinoLogger,
    private readonly redis: RedisService,
  ) {
    super(logger);
  }

  getSourceName(): string {
    return 'hn-hiring';
  }

  async fetchListings(): Promise<RawJobDto[]> {
    const storyId = await this.resolveStoryId();
    if (!storyId) {
      this.logger.warn(
        'HN Hiring: could not find a recent "Who\'s Hiring" thread',
      );
      return [];
    }
    this.logger.info(`HN Hiring: using story ${storyId}`);

    const comments = await this.fetchComments(storyId);
    this.logger.info(
      `HN Hiring: fetched ${comments.length} top-level comments`,
    );

    const jobs: RawJobDto[] = [];
    for (const text of comments) {
      if (!text || text === '[deleted]') continue;
      if (!BACKEND_RE.test(text)) continue;

      const dto = this.parseComment(text);
      if (dto) jobs.push(dto);
    }

    this.logger.info(`HN Hiring: ${jobs.length} backend-relevant jobs parsed`);
    return jobs;
  }

  // ── Story resolution ─────────────────────────────────────────────────────

  private async resolveStoryId(): Promise<number | null> {
    // Check Redis cache first
    const cached = await this.redis.get(REDIS_STORY_KEY);
    if (cached) {
      this.logger.info(`HN Hiring: using cached story ID ${cached}`);
      return parseInt(cached, 10);
    }

    // Search Algolia for threads posted in the last 45 days
    const since = Math.floor(Date.now() / 1000) - 45 * 24 * 60 * 60;
    const res = await this.fetchWithTimeout(`${ALGOLIA_SEARCH}${since}`);
    if (!res.ok) {
      throw new Error(`Algolia story search failed: ${res.status}`);
    }

    const data = (await res.json()) as AlgoliaStoryResult;

    // Filter to posts by 'whoishiring' with "Who is Hiring" in the title
    const match = data.hits.find(
      (h) => h.author === 'whoishiring' && /who is hiring/i.test(h.title),
    );

    if (!match) {
      // Fall back to any recent "who is hiring" story
      const fallback = data.hits.find((h) => /who is hiring/i.test(h.title));
      if (!fallback) return null;
      const id = parseInt(fallback.objectID, 10);
      await this.redis.set(REDIS_STORY_KEY, String(id), STORY_TTL_S);
      return id;
    }

    const id = parseInt(match.objectID, 10);
    await this.redis.set(REDIS_STORY_KEY, String(id), STORY_TTL_S);
    return id;
  }

  // ── Comment fetching ─────────────────────────────────────────────────────

  private async fetchComments(storyId: number): Promise<string[]> {
    // Try Algolia first — faster and paginated, no per-item delay needed
    const algoliaTexts = await this.fetchCommentsViaAlgolia(storyId);
    if (algoliaTexts.length > 0) return algoliaTexts;

    // Fallback: HN Firebase item API (respects MAX_DIRECT_COMMENTS cap)
    this.logger.info(
      'HN Hiring: Algolia returned 0 comments, falling back to HN item API',
    );
    return this.fetchCommentsViaItemApi(storyId);
  }

  private async fetchCommentsViaAlgolia(storyId: number): Promise<string[]> {
    const texts: string[] = [];
    let page = 0;
    let totalPages = 1;

    while (page < totalPages) {
      const res = await this.fetchWithTimeout(ALGOLIA_COMMENTS(storyId, page));
      if (!res.ok) break;

      const data = (await res.json()) as AlgoliaCommentResult;
      totalPages = data.nbPages;

      for (const hit of data.hits) {
        // Only top-level comments (direct children of the story)
        if (hit.parent_id !== storyId) continue;
        if (!hit.comment_text) continue;
        texts.push(this.stripHtml(hit.comment_text));
      }

      page++;
    }

    return texts;
  }

  private async fetchCommentsViaItemApi(storyId: number): Promise<string[]> {
    const storyRes = await this.fetchWithTimeout(HN_ITEM(storyId));
    if (!storyRes.ok)
      throw new Error(
        `HN item API failed for story ${storyId}: ${storyRes.status}`,
      );

    const story = (await storyRes.json()) as HNItem;
    const commentIds = (story.kids ?? []).slice(0, MAX_DIRECT_COMMENTS);

    const texts: string[] = [];
    for (const id of commentIds) {
      await this.delay(ITEM_DELAY_MS);
      try {
        const res = await this.fetchWithTimeout(HN_ITEM(id));
        if (!res.ok) continue;
        const item = (await res.json()) as HNItem;
        if (item.deleted || item.dead || !item.text) continue;
        texts.push(this.stripHtml(item.text));
      } catch {
        // skip individual failed comment
      }
    }

    return texts;
  }

  // ── Comment → RawJobDto ──────────────────────────────────────────────────

  private parseComment(text: string): RawJobDto | null {
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.length) return null;

    const firstLine = lines[0];
    const parts = firstLine
      .split('|')
      .map((p) => p.trim())
      .filter(Boolean);

    // Need at least a company name
    const companyName = parts[0] || 'Unknown';
    const role = parts[1] || firstLine.slice(0, 120);
    const rawLocation = parts[2] ?? '';

    // Skip if first field looks like a sentence rather than a company name
    // (indicates this comment doesn't follow the standard format at all)
    if (companyName.split(' ').length > 8) return null;

    const fullText = lines.join('\n');
    const { locationType, location } = this.parseLocation(
      rawLocation,
      fullText,
    );

    // Extract application URL — prefer from pipe fields, then scan full text
    const urlInParts = parts.slice(3).find((p) => /^https?:\/\//.test(p));
    const urlsInText: string[] = fullText.match(URL_RE) ?? [];
    const url =
      urlInParts ??
      urlsInText.find(
        (u) =>
          u.includes('jobs') || u.includes('apply') || u.includes('careers'),
      ) ??
      urlsInText[0] ??
      null;

    // Must have a URL to be useful
    if (!url) return null;

    // Clean URL (strip trailing punctuation that sometimes creeps in)
    const cleanUrl = url.replace(/[)>\].,;]+$/, '');

    const salary = this.parseSalary(fullText);

    const dto = new RawJobDto();
    dto.title = role;
    dto.companyName = companyName;
    dto.description = fullText;
    dto.url = cleanUrl;
    dto.source = this.getSourceName();
    dto.location = location || undefined;
    dto.locationType = locationType;
    dto.stackRaw = fullText; // stack classifier reads full text
    if (salary) {
      dto.salaryMin = salary.min;
      dto.salaryMax = salary.max;
      dto.salaryCurrency = salary.currency;
    }

    return dto;
  }

  private parseLocation(
    rawLocation: string,
    fullText: string,
  ): { locationType: LocationType; location: string } {
    const haystack = rawLocation || fullText;
    if (REMOTE_RE.test(haystack) && !HYBRID_RE.test(rawLocation)) {
      return {
        locationType: LocationType.REMOTE,
        location: rawLocation || 'Remote',
      };
    }
    if (HYBRID_RE.test(haystack)) {
      return {
        locationType: LocationType.HYBRID,
        location: rawLocation || 'Hybrid',
      };
    }
    return { locationType: LocationType.ONSITE, location: rawLocation };
  }

  private parseSalary(
    text: string,
  ): { min: number; max: number; currency: string } | null {
    const match = text.match(SALARY_RE);
    if (!match) return null;

    const raw = match[0];
    const nums = raw.match(/[\d,]+/g);
    if (!nums) return null;

    const parse = (s: string) => {
      const n = parseInt(s.replace(/,/g, ''), 10);
      // Handle shorthand like "150k"
      return /k/i.test(raw) && n < 1000 ? n * 1000 : n;
    };

    const values = nums.map(parse).filter((n) => n >= 1000);
    if (!values.length) return null;

    const currency = raw.includes('£')
      ? 'GBP'
      : raw.includes('€')
        ? 'EUR'
        : 'USD';
    return { min: values[0], max: values[1] ?? values[0], currency };
  }

  // ── Utilities ────────────────────────────────────────────────────────────

  private stripHtml(html: string): string {
    return (
      html
        .replace(/<p>/gi, '\n')
        .replace(/<br\s*\/?>/gi, '\n')
        // Preserve href URLs as plain text before stripping tags.
        // HN Algolia encodes href values with HTML entities (&#x2F; = /)
        // so we must decode the captured group before emitting it.
        .replace(
          /<a\s[^>]*href="([^"]+)"[^>]*>/gi,
          (_, href: string) =>
            href
              .replace(/&#x2F;/g, '/')
              .replace(/&#x3A;/g, ':')
              .replace(/&#x3D;/g, '=')
              .replace(/&#x40;/g, '@')
              .replace(/&amp;/g, '&') + ' ',
        )
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#x27;/g, "'")
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
    );
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
