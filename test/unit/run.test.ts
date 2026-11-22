import { describe, expect, it } from 'vitest';
import { printAst, run } from '../../src/run';
import { MAX_NESTING } from '../../src/syntax/parser';

describe('run', () => {
  it('prints the output of the program and exits with 0', () => {
    expect(run('print 1 + 2 * 3;')).toEqual({
      output: ['7'],
      errors: [],
      exitCode: 0,
    });
    expect(run('')).toEqual({ output: [], errors: [], exitCode: 0 });
  });

  it('reports a syntax error and exits with 65', () => {
    expect(run('print 1 +;')).toEqual({
      output: [],
      errors: ["[line 1] Error at ';': Expect expression."],
      exitCode: 65,
    });
  });

  it('lists scanner errors before parser errors', () => {
    expect(run('print @;').errors).toEqual([
      '[line 1] Error: Unexpected character.',
      "[line 1] Error at ';': Expect expression.",
    ]);
  });

  it('reports a static error and exits with 65', () => {
    expect(run('return 1;')).toEqual({
      output: [],
      errors: ["[line 1] Error at 'return': Can't return from top-level code."],
      exitCode: 65,
    });
  });

  it('does not run anything when there is a static error', () => {
    const result = run('print 1;\nreturn 2;');

    expect(result.output).toEqual([]);
    expect(result.exitCode).toBe(65);
  });

  it('lists every static error', () => {
    expect(run('{ var a; var a; }\nreturn 1;').errors).toEqual([
      "[line 1] Error at 'a': Already a variable with this name in this scope.",
      "[line 2] Error at 'return': Can't return from top-level code.",
    ]);
  });

  it('reports only syntax errors when there are both kinds', () => {
    expect(run('var = 1;\nreturn 2;').errors).toEqual([
      "[line 1] Error at '=': Expect variable name.",
    ]);
  });

  it('does not run anything when there is a compile error', () => {
    const result = run('print 1;\nprint ;');

    expect(result.output).toEqual([]);
    expect(result.exitCode).toBe(65);
  });

  it('limits the depth of calls', () => {
    const recursion = (depth: number): string =>
      `fun f(n) { if (n > 0) f(n - 1); } f(${depth});`;

    expect(run(recursion(2), { maxCallDepth: 3 }).exitCode).toBe(0);
    expect(run(recursion(3), { maxCallDepth: 3 })).toEqual({
      output: [],
      errors: ['Stack overflow.\n[line 1]'],
      exitCode: 70,
    });
    expect(
      run('fun f() { return 1; } for (var i = 0; i < 9; i = i + 1) f();', {
        maxCallDepth: 2,
      }).exitCode,
    ).toBe(0);
    expect(run('fun f() {\n  f();\n}\nf();')).toEqual({
      output: [],
      errors: ['Stack overflow.\n[line 2]'],
      exitCode: 70,
    });
  });

  it('reports a runtime error, exits with 70 and keeps earlier output', () => {
    expect(run('print 1;\nprint -"a";')).toEqual({
      output: ['1'],
      errors: ['Operand must be a number.\n[line 2]'],
      exitCode: 70,
    });
  });
});

describe('run: edge cases', () => {
  const sum = (n: number): string =>
    `fun sum(n) {\n  if (n == 0) return 0;\n  return n + sum(n - 1);\n}\nprint sum(${n});`;

  it('allows 200 nested calls by default', () => {
    expect(run(sum(199))).toEqual({
      output: ['19900'],
      errors: [],
      exitCode: 0,
    });
  });

  it('reports Stack overflow at the 201st nested call by default', () => {
    expect(run(sum(200))).toEqual({
      output: [],
      errors: ['Stack overflow.\n[line 3]'],
      exitCode: 70,
    });
  });
});

describe('run: limits of the JavaScript engine', () => {
  it('reports an overflow of the JavaScript stack as Stack overflow', () => {
    expect(
      run('fun f(n) {\n  if (n > 0) f(n - 1);\n}\nf(1000000);', {
        maxCallDepth: 1_000_000,
      }),
    ).toEqual({
      output: [],
      errors: ['Stack overflow.\n[line 2]'],
      exitCode: 70,
    });
  });

  it('reports Stack overflow for a deep body before the call limit', () => {
    const body = `${'{'.repeat(90)} if (n > 0) f(n - 1); ${'}'.repeat(90)}`;

    expect(run(`fun f(n) { ${body} } f(199); print "unreachable";`)).toEqual({
      output: [],
      errors: ['Stack overflow.\n[line 1]'],
      exitCode: 70,
    });
  });

  it('reports a string that is too long', () => {
    expect(
      run('print "start";\nvar s = "ab";\nwhile (true) s = s + s;'),
    ).toEqual({
      output: ['start'],
      errors: ['String is too long.\n[line 3]'],
      exitCode: 70,
    });
  });

  it('reports a string that is too long inside a function', () => {
    expect(
      run(
        'fun grow() {\n  var s = "ab";\n  while (true) s = s + s;\n}\ngrow();',
      ),
    ).toEqual({
      output: [],
      errors: ['String is too long.\n[line 3]'],
      exitCode: 70,
    });
  });
});

describe('run: nesting limit', () => {
  it('allows 100 levels of nesting', () => {
    expect(run(`print ${'('.repeat(100)}7${')'.repeat(100)};`)).toEqual({
      output: ['7'],
      errors: [],
      exitCode: 0,
    });
  });

  it('rejects 101 levels of nesting', () => {
    expect(run(`print ${'('.repeat(101)}7${')'.repeat(101)};`)).toEqual({
      output: [],
      errors: ["[line 1] Error at '7': Too much nesting."],
      exitCode: 65,
    });
  });

  it('reports too much nesting as a compile error', () => {
    expect(run(`print ${'('.repeat(10_000)}1${')'.repeat(10_000)};`)).toEqual({
      output: [],
      errors: ["[line 1] Error at '(': Too much nesting."],
      exitCode: 65,
    });
  });

  const n = MAX_NESTING;

  it.each([
    ['parentheses', `print ${'('.repeat(n)}7${')'.repeat(n)};`],
    [
      'for loops whose increment adds two levels',
      `${'for (var i = 0; i < 1; i = i + 1) '.repeat(n - 1)}print 7;`,
    ],
    [
      'calls with arguments',
      `fun id(x) { return x; } print ${'id('.repeat(n)}7${')'.repeat(n)};`,
    ],
    [
      'methods in classes',
      `${'class C { m() {'.repeat(n)}${'} }'.repeat(n)} print 7;`,
    ],
  ])('runs %s nested up to the limit', (_, source) => {
    expect(run(source)).toEqual({ output: ['7'], errors: [], exitCode: 0 });
  });
});

describe('printAst', () => {
  it('gives one tree for every statement and exits with 0', () => {
    expect(printAst('var speed = 3;\nprint speed * 2;')).toEqual({
      output: ['(var speed 3)', '(print (* speed 2))'],
      errors: [],
      exitCode: 0,
    });
  });

  it('does not run the program', () => {
    expect(printAst('print "a" < 1;')).toEqual({
      output: ['(print (< "a" 1))'],
      errors: [],
      exitCode: 0,
    });
  });

  it('does not look for static errors', () => {
    expect(printAst('return 5;')).toEqual({
      output: ['(return 5)'],
      errors: [],
      exitCode: 0,
    });
  });

  it('reports a syntax error and exits with 65', () => {
    expect(printAst('print 2 *;')).toEqual({
      output: [],
      errors: ["[line 1] Error at ';': Expect expression."],
      exitCode: 65,
    });
  });

  it('prints a tree nested up to the limit', () => {
    const n = MAX_NESTING;

    expect(printAst(`print ${'('.repeat(n)}7${')'.repeat(n)};`).output).toEqual(
      [`(print ${'(group '.repeat(n)}7${')'.repeat(n)})`],
    );
  });
});
