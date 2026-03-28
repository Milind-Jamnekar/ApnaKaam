import { Module } from '@nestjs/common';
import { ScraperService } from './scraper.service';
import { RemotiveScraper } from './sources/remotive.scraper';

@Module({
  providers: [ScraperService, RemotiveScraper],
  exports: [ScraperService],
})
export class ScraperModule {}
