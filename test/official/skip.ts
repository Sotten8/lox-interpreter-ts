export const SKIPPED: ReadonlyMap<string, string> = new Map([
  ['assignment/to_this.lox', 'needs classes (stage 4)'],
  ['for/closure_in_body.lox', 'needs functions and closures (stage 3)'],
  ['for/return_closure.lox', 'needs functions and closures (stage 3)'],
  ['for/return_inside.lox', 'needs functions (stage 3)'],
  ['for/syntax.lox', 'needs functions (stage 3)'],
  [
    'variable/duplicate_local.lox',
    'needs blocks and the resolver (stages 2-3)',
  ],
  [
    'variable/use_local_in_initializer.lox',
    'needs blocks and the resolver (stages 2-3)',
  ],
  [
    'variable/collide_with_parameter.lox',
    'needs functions and the resolver (stage 3)',
  ],
  [
    'variable/duplicate_parameter.lox',
    'needs functions and the resolver (stage 3)',
  ],
  [
    'variable/early_bound.lox',
    'needs functions, blocks and the resolver (stages 2-3)',
  ],
  ['variable/local_from_method.lox', 'needs classes (stage 4)'],
  ['while/closure_in_body.lox', 'needs functions and closures (stage 3)'],
  ['while/return_closure.lox', 'needs functions and closures (stage 3)'],
  ['while/return_inside.lox', 'needs functions (stage 3)'],
  ['call', 'needs functions (stage 3)'],
  ['closure', 'needs functions and closures (stage 3)'],
  ['function', 'needs functions (stage 3)'],
  ['return', 'needs functions (stage 3)'],
  ['regression', 'needs functions and classes (stages 3-4)'],
  ['benchmark', 'needs functions, classes and clock() (stages 3-4)'],
  ['class', 'needs classes (stage 4)'],
  ['constructor', 'needs classes (stage 4)'],
  ['field', 'needs classes (stage 4)'],
  ['inheritance', 'needs classes (stage 4)'],
  ['method', 'needs classes (stage 4)'],
  ['super', 'needs classes (stage 4)'],
  ['this', 'needs classes (stage 4)'],
  ['scanning', 'needs the token dump mode (not in MVP)'],
  ['expressions', 'needs the AST dump and bare expression modes (not in MVP)'],
  ['unexpected_character.lox', 'needs call expressions (stage 3)'],
  ['number/decimal_point_at_eof.lox', 'needs property access (stage 4)'],
  ['number/trailing_dot.lox', 'needs property access (stage 4)'],
  ['operator/equals_class.lox', 'needs classes (stage 4)'],
  ['operator/equals_method.lox', 'needs classes (stage 4)'],
  ['operator/not.lox', 'needs functions (stage 3)'],
  ['operator/not_class.lox', 'needs classes (stage 4)'],
  [
    'limit/stack_overflow.lox',
    'needs functions and a call depth limit (stage 3)',
  ],
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
