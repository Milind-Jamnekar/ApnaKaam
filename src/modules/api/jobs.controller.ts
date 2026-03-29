import { Controller, Get, Param, Query } from '@nestjs/common';
import { JobQueryDto } from './dto/job-query.dto';
import { JobsService } from './jobs.service';

@Controller('api/jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Get()
  findAll(@Query() query: JobQueryDto) {
    return this.jobsService.findAll(query);
  }

  @Get('stats')
  getStats() {
    return this.jobsService.getStats();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.jobsService.findOne(id);
  }
}
