import { Injectable } from '@nestjs/common';
import { LocationType } from '../../generated/prisma-client';

// ---------------------------------------------------------------------------
// Scoring weights (total = 100)
// ---------------------------------------------------------------------------
const W_STACK = 40;
const W_STACK_TITLE_BONUS = 5;
const W_LOCATION = 25;
const W_SENIORITY = 20;
const W_RECENCY = 15;

// Seniority ladder — index distance drives partial credit
const SENIORITY_LADDER = [
  'junior',
  'mid',
  'senior',
  'lead',
  'staff',
  'principal',
];

// Countries/regions used to detect same-region partial location matches
const REGION_GROUPS: Record<string, string[]> = {
  india: [
    'india',
    'mumbai',
    'bangalore',
    'bengaluru',
    'delhi',
    'hyderabad',
    'pune',
    'chennai',
    'kolkata',
  ],
  europe: [
    'europe',
    'germany',
    'uk',
    'france',
    'netherlands',
    'spain',
    'sweden',
    'denmark',
    'poland',
  ],
  us: [
    'usa',
    'united states',
    'new york',
    'san francisco',
    'seattle',
    'austin',
    'boston',
    'chicago',
  ],
};

export interface ScoredJob<T> {
  job: T;
  score: number;
}

export interface ScoringInput {
  stack: string[];
  title: string;
  location: string | null;
  locationType: LocationType;
  seniorityLevel: string | null;
  postedAt: Date | null;
}

export interface UserPrefs {
  stackPreferences: string[];
  locationPrefs: string[];
  seniorityPref: string | null;
}

@Injectable()
export class RelevanceScorerService {
  /**
   * Score a single job against user preferences. Returns 0–100.
   */
  scoreJob(job: ScoringInput, user: UserPrefs): number {
    return (
      this.scoreStack(job, user) +
      this.scoreLocation(job, user) +
      this.scoreSeniority(job, user) +
      this.scoreRecency(job)
    );
  }

  /**
   * Score and sort a list of jobs for a user.
   */
  scoreAndSort<T extends ScoringInput>(
    jobs: T[],
    user: UserPrefs,
  ): ScoredJob<T>[] {
    return jobs
      .map((job) => ({ job, score: this.scoreJob(job, user) }))
      .sort((a, b) => b.score - a.score);
  }

  // ── Stack (0 – 45 with bonus) ────────────────────────────────────────────

  private scoreStack(job: ScoringInput, user: UserPrefs): number {
    const prefs = user.stackPreferences;
    if (!prefs.length) return Math.round(W_STACK * 0.5); // no prefs → neutral

    const jobStack = job.stack.map((s) => s.toLowerCase());
    const matchCount = prefs.filter((p) =>
      jobStack.includes(p.toLowerCase()),
    ).length;

    let score = Math.round((matchCount / prefs.length) * W_STACK);

    // Title bonus: does the job title mention any preferred stack tech?
    const titleLower = job.title.toLowerCase();
    const hasStackInTitle = prefs.some((p) =>
      titleLower.includes(p.toLowerCase()),
    );
    if (hasStackInTitle) score += W_STACK_TITLE_BONUS;

    return Math.min(score, W_STACK + W_STACK_TITLE_BONUS);
  }

  // ── Location (0 – 25) ────────────────────────────────────────────────────

  private scoreLocation(job: ScoringInput, user: UserPrefs): number {
    const prefs = user.locationPrefs.map((p) => p.toLowerCase());
    if (!prefs.length) return Math.round(W_LOCATION * 0.5); // neutral

    if (prefs.includes('anywhere')) return 20;

    if (prefs.includes('remote') && job.locationType === LocationType.REMOTE) {
      return W_LOCATION; // perfect remote match
    }

    const jobLoc = (job.location ?? '').toLowerCase();

    // Exact / substring city match
    for (const pref of prefs) {
      if (pref === 'remote') continue;
      if (jobLoc.includes(pref) || pref.includes(jobLoc)) return W_LOCATION;
    }

    // Same-region partial match
    for (const pref of prefs) {
      const group = this.findRegion(pref);
      if (group && this.findRegion(jobLoc) === group) return 10;
    }

    // Hybrid is better than nothing when user wants remote
    if (prefs.includes('remote') && job.locationType === LocationType.HYBRID)
      return 8;

    return 0;
  }

  // ── Seniority (0 – 20) ───────────────────────────────────────────────────

  private scoreSeniority(job: ScoringInput, user: UserPrefs): number {
    const want = user.seniorityPref?.toLowerCase() ?? null;
    const have = job.seniorityLevel?.toLowerCase() ?? null;

    if (!want || !have) return 5; // unknown → neutral, don't penalise

    const wantIdx = SENIORITY_LADDER.indexOf(want);
    const haveIdx = SENIORITY_LADDER.findIndex((s) => have.includes(s));

    if (wantIdx === -1 || haveIdx === -1) return 5;
    if (wantIdx === haveIdx) return W_SENIORITY;
    if (Math.abs(wantIdx - haveIdx) === 1) return 10; // adjacent level
    return 0;
  }

  // ── Recency (1 – 15) ─────────────────────────────────────────────────────

  private scoreRecency(job: ScoringInput): number {
    if (!job.postedAt) return 4; // unknown date → assume moderate age

    const days = (Date.now() - job.postedAt.getTime()) / 86_400_000;

    if (days < 1) return W_RECENCY; // today
    if (days < 3) return 12;
    if (days < 7) return 8;
    if (days < 14) return 4;
    return 1;
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private findRegion(term: string): string | null {
    for (const [region, members] of Object.entries(REGION_GROUPS)) {
      if (members.some((m) => term.includes(m) || m.includes(term))) {
        return region;
      }
    }
    return null;
  }

  /** Emoji badge based on score */
  static badge(score: number): string {
    if (score >= 80) return '🟢';
    if (score >= 50) return '🟡';
    return '🔴';
  }
}
