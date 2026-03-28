import { Injectable } from '@nestjs/common';

interface StackPattern {
  regex: RegExp;
  canonical: string;
}

const STACK_PATTERNS: StackPattern[] = [
  { regex: /\bnode\.?js\b|\bnodejs\b/i, canonical: 'nodejs' },
  { regex: /\bnest\.?js\b|\bnestjs\b/i, canonical: 'nestjs' },
  { regex: /\bpostgres(?:ql)?\b|\bpg\b/i, canonical: 'postgresql' },
  { regex: /\btypescript\b/i, canonical: 'typescript' },
  { regex: /\bredis\b/i, canonical: 'redis' },
  { regex: /\bmongo(?:db)?\b/i, canonical: 'mongodb' },
  { regex: /\bdocker\b/i, canonical: 'docker' },
  { regex: /\bk8s\b|\bkubernetes\b/i, canonical: 'kubernetes' },
  { regex: /\baws\b|\bamazon web services\b/i, canonical: 'aws' },
  { regex: /\bgcp\b|\bgoogle cloud\b/i, canonical: 'gcp' },
  {
    regex: /\bexpress\.?js\b|\bexpressjs\b|\bexpress\b/i,
    canonical: 'express',
  },
  { regex: /\bgraphql\b/i, canonical: 'graphql' },
  { regex: /\brabbitmq\b|\brabbit\s*mq\b/i, canonical: 'rabbitmq' },
  { regex: /\bkafka\b/i, canonical: 'kafka' },
  { regex: /\bprisma\b/i, canonical: 'prisma' },
  { regex: /\btypeorm\b/i, canonical: 'typeorm' },
  { regex: /\bmysql\b/i, canonical: 'mysql' },
  { regex: /\bsqlite\b/i, canonical: 'sqlite' },
  { regex: /\bgolang\b/i, canonical: 'golang' },
  { regex: /\bpython\b/i, canonical: 'python' },
  // \bjava\b(?!script) — match "java" but not "javascript"
  { regex: /\bjava\b(?!script)/i, canonical: 'java' },
  { regex: /\brust\b/i, canonical: 'rust' },
  { regex: /\bmicro-?services\b/i, canonical: 'microservices' },
  { regex: /\brest(?:ful)?(?:\s+api)?\b/i, canonical: 'rest-api' },
  { regex: /\bgrpc\b/i, canonical: 'grpc' },
  { regex: /\belasticsearch\b/i, canonical: 'elasticsearch' },
  { regex: /\bruby\b|\brails\b|ruby\s+on\s+rails/i, canonical: 'ruby' },
  { regex: /\bdjango\b|\bflask\b|\bfastapi\b/i, canonical: 'python' },
  { regex: /\blaravel\b|\bsymfony\b/i, canonical: 'php' },
  { regex: /\bspring\s*boot\b|\bspring\b/i, canonical: 'java' },
  { regex: /\bterraform\b/i, canonical: 'terraform' },
  { regex: /\bgithub\s*actions\b|\bci\/cd\b|\bcicd\b/i, canonical: 'ci-cd' },
];

@Injectable()
export class StackClassifierService {
  classifyStack(
    title: string,
    description: string,
    rawStack?: string,
  ): string[] {
    const text = [title, description, rawStack ?? ''].join(' ');
    const found = new Set<string>();

    for (const { regex, canonical } of STACK_PATTERNS) {
      if (regex.test(text)) {
        found.add(canonical);
      }
    }

    return Array.from(found).sort();
  }
}
