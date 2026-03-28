import { Module } from '@nestjs/common';
import { ProcessingService } from './processing.service';
import { NormalizerService } from './normalizer.service';
import { DeduplicatorService } from './deduplicator.service';
import { StackClassifierService } from './stack-classifier.service';

@Module({
  providers: [
    ProcessingService,
    NormalizerService,
    DeduplicatorService,
    StackClassifierService,
  ],
  exports: [ProcessingService],
})
export class ProcessingModule {}
