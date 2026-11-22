import { describe, expect, it } from 'vitest';
import type { Expr, Stmt } from '../../../src/syntax/ast';
import { printExpr, printStmt } from '../../../src/syntax/ast-printer';

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
