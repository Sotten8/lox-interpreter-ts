import { describe, expect, it } from 'vitest';
import { formatCompileError } from '../../src/errors';

describe('formatCompileError', () => {
  it('formats an error without a place', () => {
    const error = {
      line: 3,
      column: 5,
      where: '',
      message: 'Unexpected character.',
    };

    expect(formatCompileError(error)).toBe(
      '[line 3] Error: Unexpected character.',
    );
  });

  it('formats an error with a place', () => {
    const error = {
      line: 1,
      column: 7,
      where: "at ';'",
      message: 'Expect expression.',
    };

    expect(formatCompileError(error)).toBe(
      "[line 1] Error at ';': Expect expression.",
    );
  });
});
