import { Module } from '@nestjs/common';
import { ScraperModule } from '../scraper/scraper.module';
import { HealthController } from './health.controller';
import { TestScrapeController } from './test-scrape.controller';

@Module({
  imports: [ScraperModule],
  controllers: [HealthController, TestScrapeController],
})
export class ApiModule {}
