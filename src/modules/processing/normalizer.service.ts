import { Injectable } from '@nestjs/common';
import { LocationType as PrismaLocationType } from '../../generated/prisma-client';
import {
  RawJobDto,
  LocationType as RawLocationType,
} from '../scraper/dto/raw-job.dto';

export interface NormalizedJob {
  title: string;
  companyName: string;
  description: string;
  url: string;
  source: string;
  location: string;
  locationType: PrismaLocationType;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  experienceMin?: number;
  experienceMax?: number;
  stackRaw?: string;
  postedAt?: Date;
}

const LOCATION_MAP: Record<string, string> = {
  anywhere: 'Remote',
  worldwide: 'Remote',
  global: 'Remote',
  remote: 'Remote',
  'work from home': 'Remote',
  wfh: 'Remote',
  india: 'India',
  'india only': 'India',
  usa: 'USA',
  'usa only': 'USA',
  'us only': 'USA',
  'united states': 'USA',
};

@Injectable()
export class NormalizerService {
  normalize(raw: RawJobDto): NormalizedJob {
    return {
      title: raw.title.trim(),
      companyName: raw.companyName.trim(),
      description: this.stripHtml(raw.description).trim(),
      url: raw.url.trim(),
      source: raw.source.trim(),
      location: this.normalizeLocation(raw.location),
      locationType: this.mapLocationType(raw.locationType),
      salaryMin: raw.salaryMin,
      salaryMax: raw.salaryMax,
      salaryCurrency: raw.salaryCurrency?.trim().toUpperCase(),
      experienceMin: raw.experienceMin,
      experienceMax: raw.experienceMax,
      stackRaw: raw.stackRaw?.trim(),
      postedAt: raw.postedAt ? new Date(raw.postedAt) : undefined,
    };
  }

  private normalizeLocation(location?: string): string {
    if (!location) return 'Remote';
    const key = location.toLowerCase().trim();
    return LOCATION_MAP[key] ?? location.trim();
  }

  private mapLocationType(type?: RawLocationType): PrismaLocationType {
    switch (type) {
      case RawLocationType.HYBRID:
        return PrismaLocationType.HYBRID;
      case RawLocationType.ONSITE:
        return PrismaLocationType.ONSITE;
      default:
        return PrismaLocationType.REMOTE;
    }
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }
}
