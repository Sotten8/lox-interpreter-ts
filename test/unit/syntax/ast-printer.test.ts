import { describe, expect, it } from 'vitest';
import type { Expr, Stmt } from '../../../src/syntax/ast';
import { printExpr, printStmt } from '../../../src/syntax/ast-printer';

describe('ast-printer: string literals', () => {
  it.each([
    ['a line break', 'up\ndown', '"up\\ndown"'],
    ['a carriage return', 'left\rright', '"left\\rright"'],
    ['a backslash', 'in\\out', '"in\\\\out"'],
  ])('escapes %s', (_, value, printed) => {
    expect(printExpr({ kind: 'literal', value })).toBe(printed);
  });
});

describe('ast-printer: invalid nodes', () => {
  it('rejects an unknown statement', () => {
    const unknown = { kind: 'unknown' } as unknown as Stmt;

    expect(() => printStmt(unknown)).toThrow(
      'Unexpected value: {"kind":"unknown"}',
    );
  });

  it('rejects an unknown expression', () => {
    const unknown = { kind: 'unknown' } as unknown as Expr;

    expect(() => printExpr(unknown)).toThrow(
      'Unexpected value: {"kind":"unknown"}',
    );
  });
});
