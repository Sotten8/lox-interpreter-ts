import { describe, expect, it } from 'vitest';
import { formatCompileError } from '../../src/errors';
import { resolve } from '../../src/resolver/resolver';
import { parse } from '../../src/syntax/parser';
import { scan } from '../../src/syntax/scanner';
import type { Expr, Stmt } from '../../src/syntax/ast';

const errorsOf = (source: string): string[] => {
  const { statements } = parse(scan(source).tokens);
  return resolve(statements).errors.map(formatCompileError);
};

const INITIALIZER = "Can't read local variable in its own initializer.";
const DUPLICATE = 'Already a variable with this name in this scope.';
const TOP_LEVEL_RETURN = "Can't return from top-level code.";

const depthsOf = (source: string): [string, number][] => {
  const { statements } = parse(scan(source).tokens);
  return [...resolve(statements).locals].map(([expr, depth]) => [
    expr.name.lexeme,
    depth,
  ]);
};

describe('resolve: globals', () => {
  it('ignores global variables', () => {
    expect(depthsOf('var a = 1; print a; a = 2;')).toEqual([]);
  });

  it('ignores globals inside a function', () => {
    expect(depthsOf('var a = 1; fun f() { print a; a = 2; }')).toEqual([]);
  });

  it('ignores an unknown name', () => {
    expect(depthsOf('{ print x; }')).toEqual([]);
  });
});

describe('resolve: blocks', () => {
  it('gives depth 0 in the same block', () => {
    expect(depthsOf('{ var a = 1; print a; }')).toEqual([['a', 0]]);
  });

  it('gives depth 1 one block deeper', () => {
    expect(depthsOf('{ var a = 1; { print a; } }')).toEqual([['a', 1]]);
  });

  it('gives depth 2 two blocks deeper', () => {
    expect(depthsOf('{ var a = 1; { { print a; } } }')).toEqual([['a', 2]]);
  });

  it('counts only blocks between the use and the var', () => {
    expect(depthsOf('{ { var a = 1; { print a; } } }')).toEqual([['a', 1]]);
  });

  it('takes the closest of two variables with one name', () => {
    expect(depthsOf('{ var a = 1; { var a = 2; print a; } }')).toEqual([
      ['a', 0],
    ]);
  });

  it('gives each use its own depth', () => {
    expect(depthsOf('{ var a; print a; print a; }')).toEqual([
      ['a', 0],
      ['a', 0],
    ]);
  });

  it('finds the variable on the left of =', () => {
    expect(depthsOf('{ var a = 1; { a = 2; } }')).toEqual([['a', 1]]);
  });

  it('looks at the right side of = first', () => {
    expect(depthsOf('{ var a; var b; a = b; }')).toEqual([
      ['b', 0],
      ['a', 0],
    ]);
  });

  it('cannot see a variable from a finished inner block', () => {
    expect(depthsOf('{ { var a; } print a; }')).toEqual([]);
  });

  it('cannot see a variable from the previous block', () => {
    expect(depthsOf('{ var a; } { print a; }')).toEqual([]);
  });

  it('ignores a variable declared below the use', () => {
    expect(
      depthsOf('var a = 1; { fun show() { print a; } var a = 2; show(); }'),
    ).toEqual([['show', 0]]);
  });
});

describe('resolve: functions', () => {
  it('puts parameters at the level of the body', () => {
    expect(depthsOf('fun f(a) { print a; }')).toEqual([['a', 0]]);
  });

  it('keeps parameters and body variables on one level', () => {
    expect(depthsOf('fun f(a) { var b = a; print b; }')).toEqual([
      ['a', 0],
      ['b', 0],
    ]);
  });

  it('adds one level for a function inside a block', () => {
    expect(depthsOf('{ var a = 1; fun f() { print a; } }')).toEqual([['a', 1]]);
  });

  it('adds one level for a function inside a function', () => {
    expect(depthsOf('fun f(a) { fun g() { print a; } }')).toEqual([['a', 1]]);
  });

  it('adds two levels for two functions inside a function', () => {
    expect(depthsOf('fun f(a) { fun g() { fun h() { a; } } }')).toEqual([
      ['a', 2],
    ]);
  });

  it('lets a function see its own name', () => {
    expect(depthsOf('{ fun f() { f(); } }')).toEqual([['f', 1]]);
  });

  it('sees a function declared above', () => {
    expect(depthsOf('{ fun f() {} f(); }')).toEqual([['f', 0]]);
  });

  it('does not see a function declared below', () => {
    expect(depthsOf('{ fun f() { g(); } fun g() {} }')).toEqual([]);
  });

  it('does not see parameters of another function', () => {
    expect(depthsOf('fun f(a) {} fun g() { print a; }')).toEqual([]);
  });
});

describe('resolve: for loop', () => {
  it('gives depth 0 in the condition and 1 in the body', () => {
    expect(depthsOf('for (var i = 0; i < 3; i = i + 1) print i;')).toEqual([
      ['i', 0],
      ['i', 1],
      ['i', 1],
      ['i', 1],
    ]);
  });
});

describe('resolve: all kinds of nodes', () => {
  it.each([
    ['expression statement', 'a;'],
    ['print', 'print a;'],
    ['var initializer', 'var b = a;'],
    ['if condition', 'if (a) 1;'],
    ['if then branch', 'if (1) a;'],
    ['if else branch', 'if (1) 1; else a;'],
    ['while condition', 'while (a) 1;'],
    ['while body', 'while (1) a;'],
    ['grouping', '(a);'],
    ['unary operand', '-a;'],
    ['binary left', 'a + 1;'],
    ['binary right', '1 + a;'],
    ['logical left', 'a or 1;'],
    ['logical right', '1 or a;'],
    ['callee', 'a();'],
    ['argument', 'f(1, a);'],
  ])('visits %s', (_, body) => {
    const depths = depthsOf(`{ var a; ${body} }`).filter(
      ([name]) => name === 'a',
    );

    expect(depths).toEqual([['a', 0]]);
  });

  it('visits the value after return', () => {
    expect(depthsOf('fun f() { var a; return a; }')).toEqual([['a', 0]]);
  });
});

describe('resolve: a variable in its own initializer', () => {
  it.each([
    ['a local read in its own initializer', '{ var a = a; }'],
    [
      'a read when an outer variable has the same name',
      'var a = 1; { var a = a; }',
    ],
    ['a read inside a larger expression', '{ var a = 1 + a; }'],
    ['a read inside a call argument', '{ var a = f(a); }'],
    ['a read inside a function body', 'fun f() { var a = a; }'],
  ])('reports %s', (_, source) => {
    expect(errorsOf(source)).toEqual([`[line 1] Error at 'a': ${INITIALIZER}`]);
  });

  it.each([
    ['another variable in an initializer', '{ var a = 1; var b = a; }'],
    ['a function called after its declaration', '{ fun f() {} f(); }'],
  ])('allows %s', (_, source) => {
    expect(errorsOf(source)).toEqual([]);
  });

  it('reports every read of the variable', () => {
    expect(errorsOf('{ var a = a + a; }')).toHaveLength(2);
  });

  it('stops reporting after the initializer', () => {
    expect(errorsOf('{ var a = a; print a; }')).toHaveLength(1);
  });
});

describe('resolve: duplicate variables', () => {
  it.each([
    ['a variable repeated in one block', '{ var a = 1; var a = 2; }'],
    ['a repeated parameter', 'fun f(a, a) {}'],
    ['a variable named like a parameter', 'fun f(a) { var a; }'],
    ['a function named like a variable', '{ var a; fun a() {} }'],
    ['a variable named like a function', '{ fun a() {} var a; }'],
  ])('reports %s', (_, source) => {
    expect(errorsOf(source)).toEqual([`[line 1] Error at 'a': ${DUPLICATE}`]);
  });

  it.each([
    ['hiding a name in an inner block', '{ var a; { var a; } }'],
    ['a parameter hiding a variable of the block', '{ var a; fun f(a) {} }'],
  ])('allows %s', (_, source) => {
    expect(errorsOf(source)).toEqual([]);
  });

  it('reports the line of the second declaration', () => {
    expect(errorsOf('{\n  var a;\n  var a;\n}')).toEqual([
      `[line 3] Error at 'a': ${DUPLICATE}`,
    ]);
  });

  it('reports every repeat', () => {
    expect(errorsOf('{ var a; var a; var a; }')).toHaveLength(2);
  });
});

describe('resolve: return outside a function', () => {
  it.each([
    ['return at the top level', 'return 1;'],
    ['return without a value', 'return;'],
    ['return in a block at the top level', '{ return 1; }'],
    ['return after a function has ended', 'fun f() {} return 1;'],
  ])('reports %s', (_, source) => {
    expect(errorsOf(source)).toEqual([
      `[line 1] Error at 'return': ${TOP_LEVEL_RETURN}`,
    ]);
  });

  it.each([
    ['return in a function', 'fun f() { return 1; }'],
    [
      'return after an inner function has ended',
      'fun f() { fun g() { return 1; } return 2; }',
    ],
  ])('allows %s', (_, source) => {
    expect(errorsOf(source)).toEqual([]);
  });

  it('still resolves the value of a misplaced return', () => {
    expect(depthsOf('{ var a; return a; }')).toEqual([['a', 0]]);
  });
});

describe('resolve: several errors', () => {
  it('lists the errors in the order of the code', () => {
    expect(errorsOf('{ var a = a; var b; var b; }\nreturn 1;')).toEqual([
      `[line 1] Error at 'a': ${INITIALIZER}`,
      `[line 1] Error at 'b': ${DUPLICATE}`,
      `[line 2] Error at 'return': ${TOP_LEVEL_RETURN}`,
    ]);
  });

  it('finds no errors in a correct program', () => {
    expect(
      errorsOf(
        'var a = 1; { var b = a; fun f(c) { return b + c; } print f(1); }',
      ),
    ).toEqual([]);
  });
});

describe('resolve: invalid nodes', () => {
  it('rejects an unknown statement', () => {
    const unknown = { kind: 'unknown' } as unknown as Stmt;

    expect(() => resolve([unknown])).toThrow(
      'Unexpected value: {"kind":"unknown"}',
    );
  });

  it('rejects an unknown expression', () => {
    const unknown = { kind: 'unknown' } as unknown as Expr;

    expect(() => resolve([{ kind: 'print', expression: unknown }])).toThrow(
      'Unexpected value: {"kind":"unknown"}',
    );
  });
});
