import type { RunResult } from '../../src/run';
import type { Expectations } from './expectations';

const COMPILE_ERROR_PATTERN = /^\[line (\d+)\] (Error.*)$/;

const MAX_OUTPUT_MISMATCHES = 5;

function show(line: string | undefined): string {
  return line === undefined ? 'nothing' : JSON.stringify(line);
}

function outputMismatches(
  expected: readonly string[],
  actual: readonly string[],
): string[] {
  const length = Math.max(expected.length, actual.length);
  const mismatches: string[] = [];
  for (let index = 0; index < length; index += 1) {
    if (expected[index] !== actual[index]) {
      mismatches.push(
        `Output differs at line ${index + 1}: expected ${show(expected[index])}, got ${show(actual[index])}`,
      );
    }
  }
  if (mismatches.length <= MAX_OUTPUT_MISMATCHES) {
    return mismatches;
  }
  const hidden = mismatches.length - MAX_OUTPUT_MISMATCHES;
  return [
    ...mismatches.slice(0, MAX_OUTPUT_MISMATCHES),
    `... and ${hidden} more`,
  ];
}

function normalizeCompileError(error: string): string {
  const match = COMPILE_ERROR_PATTERN.exec(error);
  return match === null ? error : `[${match[1] ?? ''}] ${match[2] ?? ''}`;
}

function sameItems(left: readonly string[], right: readonly string[]): boolean {
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return (
    sortedLeft.length === sortedRight.length &&
    sortedLeft.every((item, index) => item === sortedRight[index])
  );
}

export function findMismatches(
  expected: Expectations,
  actual: RunResult,
): string[] {
  const mismatches: string[] = [];

  if (actual.exitCode !== expected.exitCode) {
    mismatches.push(
      `Expected exit code ${expected.exitCode}, got ${actual.exitCode}`,
    );
  }

  mismatches.push(...outputMismatches(expected.output, actual.output));

  const { runtimeError } = expected;
  const expectedErrors =
    runtimeError === null
      ? expected.compileErrors
      : [`${runtimeError.message}\n[line ${runtimeError.line}]`];
  const actualErrors =
    runtimeError === null
      ? actual.errors.map(normalizeCompileError)
      : actual.errors;
  if (!sameItems(expectedErrors, actualErrors)) {
    mismatches.push(
      `Expected errors ${JSON.stringify(expectedErrors)}, got ${JSON.stringify(actualErrors)}`,
    );
  }

  return mismatches;
}
