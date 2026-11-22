import type { FunctionStmt } from '../syntax/ast';
import { Environment } from './environment';
import type { Interpreter } from './interpreter';
import type { LoxInstance } from './lox-class';
import type { LoxValue } from '../runtime/values';

export class ReturnSignal {
  readonly value: LoxValue;

  constructor(value: LoxValue) {
    this.value = value;
  }
}

export abstract class LoxCallable {
  abstract get arity(): number;
  abstract call(interpreter: Interpreter, args: readonly LoxValue[]): LoxValue;
  abstract toString(): string;
}

export class NativeFunction extends LoxCallable {
  private readonly parameterCount: number;
  private readonly implementation: (args: readonly LoxValue[]) => LoxValue;

  constructor(
    parameterCount: number,
    implementation: (args: readonly LoxValue[]) => LoxValue,
  ) {
    super();
    this.parameterCount = parameterCount;
    this.implementation = implementation;
  }

  get arity(): number {
    return this.parameterCount;
  }

  call(_interpreter: Interpreter, args: readonly LoxValue[]): LoxValue {
    return this.implementation(args);
  }

  toString(): string {
    return '<native fn>';
  }
}

export class LoxFunction extends LoxCallable {
  private readonly declaration: FunctionStmt;
  private readonly closure: Environment;
  private readonly isInitializer: boolean;

  constructor(
    declaration: FunctionStmt,
    closure: Environment,
    isInitializer = false,
  ) {
    super();
    this.declaration = declaration;
    this.closure = closure;
    this.isInitializer = isInitializer;
  }

  get arity(): number {
    return this.declaration.params.length;
  }

  bind(instance: LoxInstance): LoxFunction {
    const environment = new Environment(this.closure);
    environment.define('this', instance);
    return new LoxFunction(this.declaration, environment, this.isInitializer);
  }

  call(interpreter: Interpreter, args: readonly LoxValue[]): LoxValue {
    const environment = new Environment(this.closure);
    this.declaration.params.forEach((param, index) => {
      environment.define(param.lexeme, args[index] as LoxValue);
    });
    let result: LoxValue = null;
    try {
      interpreter.executeBlock(this.declaration.body, environment);
    } catch (error) {
      if (!(error instanceof ReturnSignal)) {
        throw error;
      }
      result = error.value;
    }
    return this.isInitializer ? this.closure.getAt(0, 'this') : result;
  }

  toString(): string {
    return `<fn ${this.declaration.name.lexeme}>`;
  }
}
