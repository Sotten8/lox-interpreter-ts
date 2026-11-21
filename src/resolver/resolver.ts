import type {
  AssignExpr,
  Expr,
  FunctionStmt,
  Stmt,
  VariableExpr,
} from '../syntax/ast';
import type { Token } from '../syntax/token';
import { compileErrorAt, type CompileError } from '../errors';
import { assertNever } from '../assert-never';

export type Locals = ReadonlyMap<VariableExpr | AssignExpr, number>;

export interface ResolveResult {
  readonly locals: Locals;
  readonly errors: readonly CompileError[];
}

type FunctionType = 'none' | 'function';

export function resolve(statements: readonly Stmt[]): ResolveResult {
  const resolver = new Resolver();
  resolver.resolveStatements(statements);
  return { locals: resolver.locals, errors: resolver.errors };
}

class Resolver {
  readonly locals = new Map<VariableExpr | AssignExpr, number>();
  readonly errors: CompileError[] = [];
  private readonly scopes: Map<string, boolean>[] = [];
  private currentFunction: FunctionType = 'none';

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
        this.declare(stmt.name);
        if (stmt.initializer !== null) {
          this.resolveExpression(stmt.initializer);
        }
        this.define(stmt.name);
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
        this.declare(stmt.name);
        this.define(stmt.name);
        this.resolveFunction(stmt);
        return;
      case 'class':
        this.declare(stmt.name);
        this.define(stmt.name);
        return;
      case 'return':
        if (this.currentFunction === 'none') {
          this.report(stmt.keyword, "Can't return from top-level code.");
        }
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
        if (this.scopes.at(-1)?.get(expr.name.lexeme) === false) {
          this.report(
            expr.name,
            "Can't read local variable in its own initializer.",
          );
        }
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
    const enclosingFunction = this.currentFunction;
    this.currentFunction = 'function';
    this.beginScope();
    for (const param of stmt.params) {
      this.declare(param);
      this.define(param);
    }
    this.resolveStatements(stmt.body);
    this.endScope();
    this.currentFunction = enclosingFunction;
  }

  private beginScope(): void {
    this.scopes.push(new Map());
  }

  private endScope(): void {
    this.scopes.pop();
  }

  private declare(name: Token): void {
    const scope = this.scopes.at(-1);
    if (scope === undefined) {
      return;
    }
    if (scope.has(name.lexeme)) {
      this.report(name, 'Already a variable with this name in this scope.');
    }
    scope.set(name.lexeme, false);
  }

  private define(name: Token): void {
    this.scopes.at(-1)?.set(name.lexeme, true);
  }

  private report(token: Token, message: string): void {
    this.errors.push(compileErrorAt(token, message));
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
