import type { Expr, UnaryExpr, BinaryExpr, Stmt } from '../syntax/ast';
import type { Token, TokenType } from '../syntax/token';
import { isEqual, isTruthy, stringify, type LoxValue } from './values';
import { RuntimeError } from '../errors';
import { assertNever } from '../assert-never';

export type Output = (line: string) => void;

type NumericOperation = (left: number, right: number) => LoxValue;

const NUMERIC_OPERATIONS: ReadonlyMap<TokenType, NumericOperation> = new Map<
  TokenType,
  NumericOperation
>([
  ['MINUS', (left, right) => left - right],
  ['STAR', (left, right) => left * right],
  ['SLASH', (left, right) => left / right],
  ['GREATER', (left, right) => left > right],
  ['GREATER_EQUAL', (left, right) => left >= right],
  ['LESS', (left, right) => left < right],
  ['LESS_EQUAL', (left, right) => left <= right],
]);

function numberOperand(operator: Token, operand: LoxValue): number {
  if (typeof operand === 'number') {
    return operand;
  }
  throw new RuntimeError(operator.line, 'Operand must be a number.');
}

function numberOperands(
  operator: Token,
  left: LoxValue,
  right: LoxValue,
): [number, number] {
  if (typeof left === 'number' && typeof right === 'number') {
    return [left, right];
  }
  throw new RuntimeError(operator.line, 'Operands must be numbers.');
}

function add(operator: Token, left: LoxValue, right: LoxValue): LoxValue {
  if (typeof left === 'number' && typeof right === 'number') {
    return left + right;
  }
  if (typeof left === 'string' && typeof right === 'string') {
    return left + right;
  }
  throw new RuntimeError(
    operator.line,
    'Operands must be two numbers or two strings.',
  );
}

export class Interpreter {
  private readonly output: Output;

  constructor(output: Output) {
    this.output = output;
  }

  interpret(statements: readonly Stmt[]): RuntimeError | null {
    try {
      for (const statement of statements) {
        this.execute(statement);
      }
      return null;
    } catch (error) {
      if (error instanceof RuntimeError) {
        return error;
      }
      throw error;
    }
  }

  private execute(stmt: Stmt): void {
    switch (stmt.kind) {
      case 'expression':
        this.evaluate(stmt.expression);
        return;
      case 'print':
        this.output(stringify(this.evaluate(stmt.expression)));
        return;
      default:
        return assertNever(stmt);
    }
  }

  private evaluate(expr: Expr): LoxValue {
    switch (expr.kind) {
      case 'literal':
        return expr.value;
      case 'grouping':
        return this.evaluate(expr.expression);
      case 'unary':
        return this.evaluateUnary(expr);
      case 'binary':
        return this.evaluateBinary(expr);
    }
  }

  private evaluateUnary(expr: UnaryExpr): LoxValue {
    const right = this.evaluate(expr.right);
    if (expr.operator.type === 'MINUS') {
      return -numberOperand(expr.operator, right);
    }
    return !isTruthy(right);
  }

  private evaluateBinary(expr: BinaryExpr): LoxValue {
    const left = this.evaluate(expr.left);
    const right = this.evaluate(expr.right);
    const operator = expr.operator;
    switch (operator.type) {
      case 'PLUS':
        return add(operator, left, right);
      case 'EQUAL_EQUAL':
        return isEqual(left, right);
      case 'BANG_EQUAL':
        return !isEqual(left, right);
    }
    const operation = NUMERIC_OPERATIONS.get(operator.type);
    if (operation === undefined) {
      throw new Error(`Unknown binary operator '${operator.lexeme}'.`);
    }
    const [leftNumber, rightNumber] = numberOperands(operator, left, right);
    return operation(leftNumber, rightNumber);
  }
}
