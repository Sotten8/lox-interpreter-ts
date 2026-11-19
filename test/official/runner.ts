import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { run } from '../../src/run';
import { findMismatches } from './compare';
import { parseExpectations } from './expectations';

export const SUITE_DIRECTORY = join(import.meta.dirname, 'suite');

export type Verdict = 'passed' | 'failed' | 'nontest';

export interface FileResult {
  readonly path: string;
  readonly verdict: Verdict;
  readonly mismatches: readonly string[];
}

export function listSuiteFiles(root: string = SUITE_DIRECTORY): string[] {
  return readdirSync(root, { recursive: true, encoding: 'utf8' })
    .map((path) => path.replaceAll('\\', '/'))
    .filter((path) => path.endsWith('.lox'))
    .sort();
}

export function runSuiteFile(
  path: string,
  root: string = SUITE_DIRECTORY,
): FileResult {
  const source = readFileSync(join(root, path), 'utf8');

  try {
    const expectations = parseExpectations(source);
    if (expectations.nonTest) {
      return { path, verdict: 'nontest', mismatches: [] };
    }
    const mismatches = findMismatches(expectations, run(source));
    return {
      path,
      verdict: mismatches.length === 0 ? 'passed' : 'failed',
      mismatches,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { path, verdict: 'failed', mismatches: [`Crashed: ${message}`] };
  }
}
