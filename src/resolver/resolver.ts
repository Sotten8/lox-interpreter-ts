import type {
  AssignExpr,
  Expr,
  FunctionStmt,
  Stmt,
  VariableExpr,
} from '../syntax/ast';
import { assertNever } from '../assert-never';

export type Locals = ReadonlyMap<VariableExpr | AssignExpr, number>;

export function resolve(statements: readonly Stmt[]): Locals {
  const resolver = new Resolver();
  resolver.resolveStatements(statements);
  return resolver.locals;
}

class Resolver {
  readonly locals = new Map<VariableExpr | AssignExpr, number>();
  private readonly scopes: Set<string>[] = [];

  resolveStatements(statements: readonly Stmt[]): void {
    for (const statement of statements) {
      this.resolveStatement(statement);
    }
  }

  private resolveStatement(stmt: Stmt): void {
    switch (stmt.kind) {
      case 'expression':
      case 'print':
        this.resolveExpression(stmt.expression);
        return;
      case 'var':
        if (stmt.initializer !== null) {
          this.resolveExpression(stmt.initializer);
        }
        this.declare(stmt.name.lexeme);
        return;
      case 'block':
        this.beginScope();
        this.resolveStatements(stmt.statements);
        this.endScope();
        return;
      case 'if':
        this.resolveExpression(stmt.condition);
        this.resolveStatement(stmt.thenBranch);
        if (stmt.elseBranch !== null) {
          this.resolveStatement(stmt.elseBranch);
        }
        return;
      case 'while':
        this.resolveExpression(stmt.condition);
        this.resolveStatement(stmt.body);
        return;
      case 'function':
        this.declare(stmt.name.lexeme);
        this.resolveFunction(stmt);
        return;
      case 'return':
        if (stmt.value !== null) {
          this.resolveExpression(stmt.value);
        }
        return;
      default:
        return assertNever(stmt);
    }
  }

  private resolveExpression(expr: Expr): void {
    switch (expr.kind) {
      case 'literal':
        return;
      case 'grouping':
        this.resolveExpression(expr.expression);
        return;
      case 'unary':
        this.resolveExpression(expr.right);
        return;
      case 'binary':
      case 'logical':
        this.resolveExpression(expr.left);
        this.resolveExpression(expr.right);
        return;
      case 'variable':
        this.resolveLocal(expr, expr.name.lexeme);
        return;
      case 'assign':
        this.resolveExpression(expr.value);
        this.resolveLocal(expr, expr.name.lexeme);
        return;
      case 'call':
        this.resolveExpression(expr.callee);
        for (const argument of expr.args) {
          this.resolveExpression(argument);
        }
        return;
      default:
        return assertNever(expr);
    }
  }

  private resolveFunction(stmt: FunctionStmt): void {
    this.beginScope();
    for (const param of stmt.params) {
      this.declare(param.lexeme);
    }
    this.resolveStatements(stmt.body);
    this.endScope();
  }

  private beginScope(): void {
    this.scopes.push(new Set());
  }

  private endScope(): void {
    this.scopes.pop();
  }

  private declare(name: string): void {
    this.scopes.at(-1)?.add(name);
  }

  private resolveLocal(expr: VariableExpr | AssignExpr, name: string): void {
    for (let depth = 0; depth < this.scopes.length; depth++) {
      if (this.scopes.at(-1 - depth)?.has(name)) {
        this.locals.set(expr, depth);
        return;
      }
    }
  }
}
