export const SKIPPED: ReadonlyMap<string, string> = new Map([
  ['regression/394.lox', 'needs classes (stage 4)'],
  ['benchmark', 'benchmarks print timings and are not tests'],
  ['class/inherit_self.lox', 'needs classes (stage 4)'],
  ['class/inherited_method.lox', 'needs classes (stage 4)'],
  ['class/local_inherit_other.lox', 'needs classes (stage 4)'],
  ['class/local_inherit_self.lox', 'needs classes (stage 4)'],
  ['constructor/arguments.lox', 'needs classes (stage 4)'],
  ['constructor/call_init_early_return.lox', 'needs classes (stage 4)'],
  ['constructor/call_init_explicitly.lox', 'needs classes (stage 4)'],
  ['constructor/early_return.lox', 'needs classes (stage 4)'],
  ['constructor/extra_arguments.lox', 'needs classes (stage 4)'],
  ['constructor/missing_arguments.lox', 'needs classes (stage 4)'],
  ['constructor/return_in_nested_function.lox', 'needs classes (stage 4)'],
  ['constructor/return_value.lox', 'needs classes (stage 4)'],
  ['inheritance', 'needs classes (stage 4)'],
  ['super', 'needs classes (stage 4)'],
  ['this/this_at_top_level.lox', 'needs classes (stage 4)'],
  ['this/this_in_top_level_function.lox', 'needs classes (stage 4)'],
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
