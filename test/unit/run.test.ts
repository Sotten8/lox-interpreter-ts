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

  it('does not run anything when there is a compile error', () => {
    const result = run('print 1;\nprint ;');

    expect(result.output).toEqual([]);
    expect(result.exitCode).toBe(65);
  });

  it('reports a runtime error, exits with 70 and keeps earlier output', () => {
    expect(run('print 1;\nprint -"a";')).toEqual({
      output: ['1'],
      errors: ['Operand must be a number.\n[line 2]'],
      exitCode: 70,
    });
  });
});
