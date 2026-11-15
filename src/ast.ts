import type { Token } from './token';

export type LiteralValue = number | string | boolean | null;

export interface LiteralExpr {
  readonly kind: 'literal';
  readonly value: LiteralValue;
}

export interface GroupingExpr {
  readonly kind: 'grouping';
  readonly expression: Expr;
}

export interface UnaryExpr {
  readonly kind: 'unary';
  readonly operator: Token;
  readonly right: Expr;
}

export interface BinaryExpr {
  readonly kind: 'binary';
  readonly left: Expr;
  readonly operator: Token;
  readonly right: Expr;
}

export type Expr = LiteralExpr | GroupingExpr | UnaryExpr | BinaryExpr;

export interface ExpressionStmt {
  readonly kind: 'expression';
  readonly expression: Expr;
}

export interface PrintStmt {
  readonly kind: 'print';
  readonly expression: Expr;
}

export type Stmt = ExpressionStmt | PrintStmt;
