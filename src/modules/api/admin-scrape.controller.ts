import { Controller, Param, Post } from '@nestjs/common';
import { ScraperService } from '../scraper/scraper.service';

@Controller('api/admin/scrape')
export class AdminScrapeController {
  constructor(private readonly scraperService: ScraperService) {}

  @Post('career-pages')
  async triggerCareerPages() {
    return this.scraperService.runBySource('career_page');
  }

  @Post(':source')
  async triggerSource(@Param('source') source: string) {
    return this.scraperService.runBySource(source);
  }

  @Post()
  async triggerAll() {
    return this.scraperService.runAll();
  }
}
