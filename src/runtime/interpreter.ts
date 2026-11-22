import type {
  AssignExpr,
  Expr,
  UnaryExpr,
  BinaryExpr,
  CallExpr,
  GetExpr,
  LogicalExpr,
  SetExpr,
  Stmt,
  VariableExpr,
} from '../syntax/ast';
import type { Locals } from '../resolver/resolver';
import type { Token, TokenType } from '../syntax/token';
import { isEqual, isTruthy, stringify, type LoxValue } from './values';
import { RuntimeError } from '../errors';
import { assertNever } from '../assert-never';
import { Environment } from './environment';
import {
  LoxCallable,
  LoxFunction,
  NativeFunction,
  ReturnSignal,
} from './callable';
import { LoxClass, LoxInstance } from './lox-class';

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

export const DEFAULT_MAX_CALL_DEPTH = 200;

export class Interpreter {
  private readonly output: Output;
  private readonly maxCallDepth: number;
  private readonly globals = new Environment();
  private environment = this.globals;
  private locals: Locals = new Map();
  private callDepth = 0;

  constructor(output: Output, maxCallDepth: number = DEFAULT_MAX_CALL_DEPTH) {
    this.output = output;
    this.maxCallDepth = maxCallDepth;
    this.globals.define(
      'clock',
      new NativeFunction(0, () => Date.now() / 1000),
    );
  }

  interpret(statements: readonly Stmt[], locals: Locals): RuntimeError | null {
    this.locals = locals;
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
      case 'var': {
        const value =
          stmt.initializer === null ? null : this.evaluate(stmt.initializer);
        this.environment.define(stmt.name.lexeme, value);
        return;
      }
      case 'block':
        this.executeBlock(stmt.statements, new Environment(this.environment));
        return;
      case 'if':
        if (isTruthy(this.evaluate(stmt.condition))) {
          this.execute(stmt.thenBranch);
        } else if (stmt.elseBranch !== null) {
          this.execute(stmt.elseBranch);
        }
        return;
      case 'while':
        while (isTruthy(this.evaluate(stmt.condition))) {
          this.execute(stmt.body);
        }
        return;
      case 'function':
        this.environment.define(
          stmt.name.lexeme,
          new LoxFunction(stmt, this.environment),
        );
        return;
      case 'class':
        this.environment.define(
          stmt.name.lexeme,
          new LoxClass(stmt.name.lexeme),
        );
        return;
      case 'return':
        throw new ReturnSignal(
          stmt.value === null ? null : this.evaluate(stmt.value),
        );
      default:
        return assertNever(stmt);
    }
  }

  executeBlock(statements: readonly Stmt[], environment: Environment): void {
    const previous = this.environment;
    try {
      this.environment = environment;
      for (const statement of statements) {
        this.execute(statement);
      }
    } finally {
      this.environment = previous;
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
      case 'logical':
        return this.evaluateLogical(expr);
      case 'variable':
        return this.lookUpVariable(expr);
      case 'assign':
        return this.evaluateAssign(expr);
      case 'call':
        return this.evaluateCall(expr);
      case 'get':
        return this.evaluateGet(expr);
      case 'set':
        return this.evaluateSet(expr);
    }
  }

  private evaluateGet(expr: GetExpr): LoxValue {
    const object = this.evaluate(expr.object);
    if (!(object instanceof LoxInstance)) {
      throw new RuntimeError(expr.name.line, 'Only instances have properties.');
    }
    return object.get(expr.name);
  }

  private evaluateSet(expr: SetExpr): LoxValue {
    const object = this.evaluate(expr.object);
    if (!(object instanceof LoxInstance)) {
      throw new RuntimeError(expr.name.line, 'Only instances have fields.');
    }
    const value = this.evaluate(expr.value);
    object.set(expr.name, value);
    return value;
  }

  private lookUpVariable(expr: VariableExpr): LoxValue {
    const distance = this.locals.get(expr);
    if (distance === undefined) {
      return this.globals.get(expr.name);
    }
    return this.environment.getAt(distance, expr.name.lexeme);
  }

  private evaluateAssign(expr: AssignExpr): LoxValue {
    const value = this.evaluate(expr.value);
    const distance = this.locals.get(expr);
    if (distance === undefined) {
      this.globals.assign(expr.name, value);
    } else {
      this.environment.assignAt(distance, expr.name.lexeme, value);
    }
    return value;
  }

  private evaluateCall(expr: CallExpr): LoxValue {
    const callee = this.evaluate(expr.callee);
    const args = expr.args.map((argument) => this.evaluate(argument));
    if (!(callee instanceof LoxCallable)) {
      throw new RuntimeError(
        expr.paren.line,
        'Can only call functions and classes.',
      );
    }
    if (args.length !== callee.arity) {
      throw new RuntimeError(
        expr.paren.line,
        `Expected ${callee.arity} arguments but got ${args.length}.`,
      );
    }
    if (this.callDepth >= this.maxCallDepth) {
      throw new RuntimeError(expr.paren.line, 'Stack overflow.');
    }
    this.callDepth++;
    try {
      return callee.call(this, args);
    } finally {
      this.callDepth--;
    }
  }

  private evaluateUnary(expr: UnaryExpr): LoxValue {
    const right = this.evaluate(expr.right);
    if (expr.operator.type === 'MINUS') {
      return -numberOperand(expr.operator, right);
    }
    return !isTruthy(right);
  }

  private evaluateLogical(expr: LogicalExpr): LoxValue {
    const left = this.evaluate(expr.left);
    const decided =
      expr.operator.type === 'OR' ? isTruthy(left) : !isTruthy(left);
    return decided ? left : this.evaluate(expr.right);
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
