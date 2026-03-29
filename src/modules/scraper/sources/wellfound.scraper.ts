import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { RawJobDto } from '../dto/raw-job.dto';
import { BaseScraper } from './base.scraper';

// ---------------------------------------------------------------------------
// STATUS: BLOCKED — Wellfound is protected by DataDome + Cloudflare (HTTP 403).
//
// Confirmed approaches that do NOT work:
//   ✗ Plain headless Playwright (fingerprinted immediately)
//   ✗ playwright-extra + puppeteer-extra-plugin-stealth (still 403)
//   ✗ Direct API/GraphQL calls (all endpoints return 403 or 404)
//
// Viable paths forward:
//   1. Browserless.io / Apify Playwright cloud — residential IPs + pre-warmed
//      browser fingerprints bypass DataDome reliably. ~$30–50/mo.
//      Set BROWSERLESS_WS_ENDPOINT env var and replace chromium.connect().
//
//   2. Wellfound Talent API (requires partnership/account):
//      https://wellfound.com/talent/api — they have an official jobs data API
//      for recruiters. Request access and use Bearer token auth.
//
//   3. SerpAPI / ScraperAPI with JavaScript rendering enabled — wraps
//      residential proxy + stealth into a simple HTTP request.
//
// This scraper is kept as a placeholder. It logs a warning and returns []
// on every run so it doesn't waste Playwright launch time.
// ---------------------------------------------------------------------------

@Injectable()
export class WellfoundScraper extends BaseScraper {
  constructor(
    @InjectPinoLogger(WellfoundScraper.name)
    logger: PinoLogger,
  ) {
    super(logger);
  }

  getSourceName(): string {
    return 'wellfound';
  }

  fetchListings(): Promise<RawJobDto[]> {
    this.logger.warn(
      'Wellfound scraper is currently blocked by DataDome bot-protection (HTTP 403). ' +
        'See wellfound.scraper.ts for bypass options. Returning empty result.',
    );
    return Promise.resolve([]);
  }
}
