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
    case 'logical':
      return `(${expr.operator.lexeme} ${printExpr(expr.left)} ${printExpr(expr.right)})`;
    case 'variable':
      return expr.name.lexeme;
    case 'assign':
      return `(= ${expr.name.lexeme} ${printExpr(expr.value)})`;
    case 'call':
      return `(${['call', printExpr(expr.callee), ...expr.args.map(printExpr)].join(' ')})`;
    case 'get':
      return `(get ${printExpr(expr.object)} ${expr.name.lexeme})`;
    case 'set':
      return `(set ${printExpr(expr.object)} ${expr.name.lexeme} ${printExpr(expr.value)})`;
    case 'this':
      return 'this';
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
    case 'block':
      return `(${['block', ...stmt.statements.map(printStmt)].join(' ')})`;
    case 'if': {
      const parts = [
        'if',
        printExpr(stmt.condition),
        printStmt(stmt.thenBranch),
      ];
      if (stmt.elseBranch !== null) {
        parts.push(printStmt(stmt.elseBranch));
      }
      return `(${parts.join(' ')})`;
    }
    case 'while':
      return `(while ${printExpr(stmt.condition)} ${printStmt(stmt.body)})`;
    case 'return':
      return stmt.value === null
        ? '(return)'
        : `(return ${printExpr(stmt.value)})`;
    case 'class': {
      const parts = ['class', stmt.name.lexeme];
      if (stmt.superclass !== null) {
        parts.push('<', stmt.superclass.name.lexeme);
      }
      return `(${[...parts, ...stmt.methods.map(printStmt)].join(' ')})`;
    }
    case 'function': {
      const params = `(${stmt.params.map((param) => param.lexeme).join(' ')})`;
      return `(${['fun', stmt.name.lexeme, params, ...stmt.body.map(printStmt)].join(' ')})`;
    }
  }
}
