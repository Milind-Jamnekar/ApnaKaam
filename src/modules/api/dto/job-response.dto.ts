import { LocationType } from '../../../generated/prisma-client';

export class CompanyResponseDto {
  id: string;
  name: string;
  website: string | null;
  logo: string | null;
}

export class JobResponseDto {
  id: string;
  title: string;
  company: CompanyResponseDto;
  description: string;
  url: string;
  source: string;
  location: string | null;
  locationType: LocationType;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  experienceMin: number | null;
  experienceMax: number | null;
  stack: string[];
  stackRaw: string | null;
  seniorityLevel: string | null;
  relevanceScore: number | null;
  postedAt: Date | null;
  scrapedAt: Date;
  isActive: boolean;
  createdAt: Date;
}

type JobWithCompany = {
  id: string;
  title: string;
  description: string;
  url: string;
  source: string;
  location: string | null;
  locationType: LocationType;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  experienceMin: number | null;
  experienceMax: number | null;
  stack: string[];
  stackRaw: string | null;
  seniorityLevel: string | null;
  relevanceScore: number | null;
  postedAt: Date | null;
  scrapedAt: Date;
  isActive: boolean;
  createdAt: Date;
  company: {
    id: string;
    name: string;
    website: string | null;
    logo: string | null;
  };
};

export function toJobResponseDto(job: JobWithCompany): JobResponseDto {
  return {
    id: job.id,
    title: job.title,
    company: {
      id: job.company.id,
      name: job.company.name,
      website: job.company.website,
      logo: job.company.logo,
    },
    description: job.description,
    url: job.url,
    source: job.source,
    location: job.location,
    locationType: job.locationType,
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
    salaryCurrency: job.salaryCurrency,
    experienceMin: job.experienceMin,
    experienceMax: job.experienceMax,
    stack: job.stack,
    stackRaw: job.stackRaw,
    seniorityLevel: job.seniorityLevel,
    relevanceScore: job.relevanceScore,
    postedAt: job.postedAt,
    scrapedAt: job.scrapedAt,
    isActive: job.isActive,
    createdAt: job.createdAt,
  };
}
