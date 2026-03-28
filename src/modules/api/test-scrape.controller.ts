import { Controller, Get, Param } from '@nestjs/common';
import { ScraperService } from '../scraper/scraper.service';

// TODO: remove before production
@Controller('api/test-scrape')
export class TestScrapeController {
  constructor(private readonly scraperService: ScraperService) {}

  @Get(':source')
  async testScrape(@Param('source') source: string) {
    const jobs = await this.scraperService.runBySource(source);
    return {
      source,
      count: jobs.length,
      sample: jobs.slice(0, 3),
    };
  }
}
