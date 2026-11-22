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

export interface GetExpr {
  readonly kind: 'get';
  readonly object: Expr;
  readonly name: Token;
}

export interface SetExpr {
  readonly kind: 'set';
  readonly object: Expr;
  readonly name: Token;
  readonly value: Expr;
}

export interface ThisExpr {
  readonly kind: 'this';
  readonly keyword: Token;
}

export type Expr =
  | LiteralExpr
  | GroupingExpr
  | UnaryExpr
  | BinaryExpr
  | LogicalExpr
  | VariableExpr
  | AssignExpr
  | CallExpr
  | GetExpr
  | SetExpr
  | ThisExpr;

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

export interface FunctionStmt {
  readonly kind: 'function';
  readonly name: Token;
  readonly params: readonly Token[];
  readonly body: readonly Stmt[];
}

export interface ReturnStmt {
  readonly kind: 'return';
  readonly keyword: Token;
  readonly value: Expr | null;
}

export interface ClassStmt {
  readonly kind: 'class';
  readonly name: Token;
  readonly superclass: VariableExpr | null;
  readonly methods: readonly FunctionStmt[];
}

export type Stmt =
  | ExpressionStmt
  | PrintStmt
  | VarStmt
  | BlockStmt
  | IfStmt
  | WhileStmt
  | FunctionStmt
  | ReturnStmt
  | ClassStmt;
