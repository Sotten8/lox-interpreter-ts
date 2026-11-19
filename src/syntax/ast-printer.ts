import type { Expr, LiteralValue, Stmt } from './ast';

function printLiteral(value: LiteralValue): string {
  if (value === null) {
    return 'nil';
  }
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  return String(value);
}

export function printExpr(expr: Expr): string {
  switch (expr.kind) {
    case 'literal':
      return printLiteral(expr.value);
    case 'grouping':
      return `(group ${printExpr(expr.expression)})`;
    case 'unary':
      return `(${expr.operator.lexeme} ${printExpr(expr.right)})`;
    case 'binary':
      return `(${expr.operator.lexeme} ${printExpr(expr.left)} ${printExpr(expr.right)})`;
    case 'variable':
      return expr.name.lexeme;
  }
}

export function printStmt(stmt: Stmt): string {
  switch (stmt.kind) {
    case 'expression':
      return `(expr ${printExpr(stmt.expression)})`;
    case 'print':
      return `(print ${printExpr(stmt.expression)})`;
    case 'var':
      return stmt.initializer === null
        ? `(var ${stmt.name.lexeme})`
        : `(var ${stmt.name.lexeme} ${printExpr(stmt.initializer)})`;
  }
}
