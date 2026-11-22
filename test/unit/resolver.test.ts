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
const THIS_OUTSIDE_CLASS = "Can't use 'this' outside of a class.";

const depthsOf = (source: string): [string, number][] => {
  const { statements } = parse(scan(source).tokens);
  return [...resolve(statements).locals].map(([expr, depth]) => [
    expr.kind === 'this' ? expr.keyword.lexeme : expr.name.lexeme,
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

describe('resolve: classes', () => {
  it('ignores a global class', () => {
    expect(depthsOf('class A {} A;')).toEqual([]);
  });

  it('declares a class in the current block', () => {
    expect(depthsOf('{ class A {} A; }')).toEqual([['A', 0]]);
  });

  it('declares a class inside a function', () => {
    expect(depthsOf('fun f() { class A {} return A; }')).toEqual([['A', 0]]);
  });

  it('adds one level for a function declared after a class in a block', () => {
    expect(depthsOf('{ class A {} fun f() { A; } }')).toEqual([['A', 1]]);
  });

  it('reports a second class with the same name in a block', () => {
    expect(errorsOf('{ class A {} class A {} }')).toEqual([
      `[line 1] Error at 'A': ${DUPLICATE}`,
    ]);
  });

  it('reports a class after a variable with the same name in a block', () => {
    expect(errorsOf('{ var A; class A {} }')).toEqual([
      `[line 1] Error at 'A': ${DUPLICATE}`,
    ]);
  });

  it('allows reading a class right after its declaration', () => {
    expect(errorsOf('{ class A {} A; }')).toEqual([]);
  });

  it.each([
    ['in global scope', 'class A {} class A {}'],
    ['in different blocks', '{ class A {} } { class A {} }'],
    ['in global scope and in a block', 'class A {} { class A {} }'],
  ])('allows the same class name %s', (_, source) => {
    expect(errorsOf(source)).toEqual([]);
  });
});

describe('resolve: properties', () => {
  it('resolves the object of a get', () => {
    expect(depthsOf('{ var a; a.b; }')).toEqual([['a', 0]]);
  });

  it('resolves the object of a get in a chain', () => {
    expect(depthsOf('{ var a; a.b.c; }')).toEqual([['a', 0]]);
  });

  it('resolves the object of a get that is called', () => {
    expect(depthsOf('{ var a; a.b(); }')).toEqual([['a', 0]]);
  });

  it('does not resolve the property name of a get', () => {
    expect(depthsOf('{ var b; var a; a.b; }')).toEqual([['a', 0]]);
  });

  it('resolves the object of a set', () => {
    expect(depthsOf('{ var a; a.b = 1; }')).toEqual([['a', 0]]);
  });

  it('resolves the value of a set', () => {
    expect(depthsOf('{ var a; g.b = a; }')).toEqual([['a', 0]]);
  });

  it('does not resolve the property name of a set', () => {
    expect(depthsOf('{ var b; var a; a.b = 1; }')).toEqual([['a', 0]]);
  });

  it('adds one level for an object used inside a function', () => {
    expect(depthsOf('{ var a; fun f() { a.b; } }')).toEqual([['a', 1]]);
  });

  it('reports a variable read in its own initializer through a get', () => {
    expect(errorsOf('{ var a = a.b; }')).toEqual([
      `[line 1] Error at 'a': ${INITIALIZER}`,
    ]);
  });

  it('reports a variable read in its own initializer through a set value', () => {
    expect(errorsOf('{ var a = g.b = a; }')).toEqual([
      `[line 1] Error at 'a': ${INITIALIZER}`,
    ]);
  });
});

describe('resolve: methods', () => {
  it('resolves this one level up from a method body', () => {
    expect(depthsOf('class A { m() { this; } }')).toEqual([['this', 1]]);
  });

  it('adds a level for this inside a block of a method', () => {
    expect(depthsOf('class A { m() { { this; } } }')).toEqual([['this', 2]]);
  });

  it('adds a level for this inside a function nested in a method', () => {
    expect(depthsOf('class A { m() { fun f() { this; } } }')).toEqual([
      ['this', 2],
    ]);
  });

  it('gives every use of this its own entry', () => {
    expect(depthsOf('class A { m() { this; this; } }')).toEqual([
      ['this', 1],
      ['this', 1],
    ]);
  });

  it('resolves this as the object of a get', () => {
    expect(depthsOf('class A { m() { this.x; } }')).toEqual([['this', 1]]);
  });

  it('resolves this as the object of a set', () => {
    expect(depthsOf('class A { m() { this.x = 1; } }')).toEqual([['this', 1]]);
  });

  it('keeps a parameter at depth 0 and this at depth 1', () => {
    expect(depthsOf('class A { m(a) { a; this; } }')).toEqual([
      ['a', 0],
      ['this', 1],
    ]);
  });

  it('reads a variable of the enclosing block from a method', () => {
    expect(depthsOf('{ var v; class A { m() { v; } } }')).toEqual([['v', 2]]);
  });

  it('reads the class name from a method inside a block', () => {
    expect(depthsOf('{ class A { m() { A; } } }')).toEqual([['A', 2]]);
  });

  it('does not see another method by its bare name', () => {
    expect(depthsOf('class A { m() {} n() { m; } }')).toEqual([]);
  });

  it('allows return with a value in a method', () => {
    expect(errorsOf('class A { m() { return 1; } }')).toEqual([]);
  });

  it('still rejects return at top level after a class', () => {
    expect(errorsOf('class A { m() {} } return 1;')).toEqual([
      `[line 1] Error at 'return': ${TOP_LEVEL_RETURN}`,
    ]);
  });
});

describe('resolve: this outside a class', () => {
  it.each([
    ['this printed at the top level', 'print this;'],
    ['this in a block at the top level', '{ var copy = this; }'],
    ['this in a function outside a class', 'fun show() { print this; }'],
    [
      'this in a function nested in another function',
      'fun outer() { fun inner() { return this; } }',
    ],
    ['this after a class has ended', 'class A { m() {} } print this;'],
    [
      'this in a function declared after a class',
      'class A {} fun f() { return this; }',
    ],
  ])('reports %s', (_, source) => {
    expect(errorsOf(source)).toEqual([
      `[line 1] Error at 'this': ${THIS_OUTSIDE_CLASS}`,
    ]);
  });

  it.each([
    [
      'this in a function nested in a method',
      'class A { m() { fun f() { return this; } } }',
    ],
    [
      'this in a method of a class declared in a function',
      'fun make() { class A { m() { return this; } } }',
    ],
    [
      'this in a method after an inner class has ended',
      'class A { m() { class B { n() { return this; } } return this; } }',
    ],
  ])('allows %s', (_, source) => {
    expect(errorsOf(source)).toEqual([]);
  });

  it('reports the line of this', () => {
    expect(errorsOf('var a = 1;\n\nprint this;')).toEqual([
      `[line 3] Error at 'this': ${THIS_OUTSIDE_CLASS}`,
    ]);
  });

  it('reports every use of this outside a class', () => {
    expect(errorsOf('print this == this;')).toHaveLength(2);
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
