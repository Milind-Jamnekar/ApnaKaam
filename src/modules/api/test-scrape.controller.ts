import { Controller, Get, Param } from '@nestjs/common';
import { ScraperService } from '../scraper/scraper.service';

// TODO: remove before production
@Controller('api/test-scrape')
export class TestScrapeController {
  constructor(private readonly scraperService: ScraperService) {}

  @Get(':source')
  async testScrape(@Param('source') source: string) {
    return this.scraperService.runBySource(source);
  }

  @Get()
  async testAll() {
    return this.scraperService.runAll();
  }
}
