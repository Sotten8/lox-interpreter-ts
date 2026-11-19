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

export interface LogicalExpr {
  readonly kind: 'logical';
  readonly left: Expr;
  readonly operator: Token;
  readonly right: Expr;
}

export interface VariableExpr {
  readonly kind: 'variable';
  readonly name: Token;
}

export interface AssignExpr {
  readonly kind: 'assign';
  readonly name: Token;
  readonly value: Expr;
}

export interface CallExpr {
  readonly kind: 'call';
  readonly callee: Expr;
  readonly paren: Token;
  readonly args: readonly Expr[];
}

export type Expr =
  | LiteralExpr
  | GroupingExpr
  | UnaryExpr
  | BinaryExpr
  | LogicalExpr
  | VariableExpr
  | AssignExpr
  | CallExpr;

export interface ExpressionStmt {
  readonly kind: 'expression';
  readonly expression: Expr;
}

export interface PrintStmt {
  readonly kind: 'print';
  readonly expression: Expr;
}

export interface VarStmt {
  readonly kind: 'var';
  readonly name: Token;
  readonly initializer: Expr | null;
}

export interface BlockStmt {
  readonly kind: 'block';
  readonly statements: readonly Stmt[];
}

export interface IfStmt {
  readonly kind: 'if';
  readonly condition: Expr;
  readonly thenBranch: Stmt;
  readonly elseBranch: Stmt | null;
}

export interface WhileStmt {
  readonly kind: 'while';
  readonly condition: Expr;
  readonly body: Stmt;
}

export type Stmt =
  ExpressionStmt | PrintStmt | VarStmt | BlockStmt | IfStmt | WhileStmt;
