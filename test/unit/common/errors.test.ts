import { describe, expect, it } from 'vitest';
import {
  RuntimeError,
  compileErrorAt,
  formatCompileError,
  formatRuntimeError,
} from '../../../src/common/errors';
import type { Token, TokenType } from '../../../src/syntax/token';

const token = (type: TokenType, lexeme: string): Token => ({
  type,
  lexeme,
  literal: null,
  line: 2,
  column: 5,
});

describe('compileErrorAt', () => {
  it('names the lexeme of the token', () => {
    expect(compileErrorAt(token('IDENTIFIER', 'abc'), 'Bad.')).toEqual({
      line: 2,
      column: 5,
      where: "at 'abc'",
      message: 'Bad.',
    });
  });

  it('says "at end" for the end of the file', () => {
    expect(compileErrorAt(token('EOF', ''), 'Bad.').where).toBe('at end');
  });
});

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

describe('formatRuntimeError', () => {
  it('puts the line after the message', () => {
    const error = new RuntimeError(4, 'Operand must be a number.');

    expect(formatRuntimeError(error)).toBe(
      'Operand must be a number.\n[line 4]',
    );
  });

  it('stores the line and the message', () => {
    const error = new RuntimeError(9, 'Bad.');

    expect(error).toBeInstanceOf(Error);
    expect(error.line).toBe(9);
    expect(error.message).toBe('Bad.');
  });
});
