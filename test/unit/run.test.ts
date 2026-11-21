import { describe, expect, it } from 'vitest';
import { run } from '../../src/run';

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
