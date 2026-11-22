export const SKIPPED: ReadonlyMap<string, string> = new Map([
  ['benchmark', 'benchmarks print timings and are not tests'],
  ['super', 'needs classes (stage 4)'],
  ['scanning', 'needs the token dump mode (not in MVP)'],
  ['expressions', 'needs the AST dump and bare expression modes (not in MVP)'],
  [
    'limit/loop_too_large.lox',
    'limit of the bytecode compiler (stage 5, not MVP)',
  ],
  [
    'limit/no_reuse_constants.lox',
    'limit of the bytecode compiler (stage 5, not MVP)',
  ],
  [
    'limit/too_many_constants.lox',
    'limit of the bytecode compiler (stage 5, not MVP)',
  ],
  [
    'limit/too_many_locals.lox',
    'limit of the bytecode compiler (stage 5, not MVP)',
  ],
  [
    'limit/too_many_upvalues.lox',
    'limit of the bytecode compiler (stage 5, not MVP)',
  ],
]);

export function matchesEntry(path: string, entry: string): boolean {
  return path === entry || path.startsWith(`${entry}/`);
}

export function skipReason(
  path: string,
  entries: ReadonlyMap<string, string> = SKIPPED,
): string | undefined {
  for (const [entry, reason] of entries) {
    if (matchesEntry(path, entry)) {
      return reason;
    }
  }
  return undefined;
}
