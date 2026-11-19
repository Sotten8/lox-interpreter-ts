import { RuntimeError } from '../errors';
import type { Token } from '../syntax/token';
import type { LoxValue } from './values';

function undefinedVariable(name: Token): RuntimeError {
  return new RuntimeError(name.line, `Undefined variable '${name.lexeme}'.`);
}

export class Environment {
  private readonly values = new Map<string, LoxValue>();
  private readonly enclosing: Environment | null;

  constructor(enclosing: Environment | null = null) {
    this.enclosing = enclosing;
  }

  define(name: string, value: LoxValue): void {
    this.values.set(name, value);
  }

  get(name: Token): LoxValue {
    const scope = this.find(name.lexeme);
    if (scope === null) {
      throw undefinedVariable(name);
    }
    return scope.values.get(name.lexeme) ?? null;
  }

  assign(name: Token, value: LoxValue): void {
    const scope = this.find(name.lexeme);
    if (scope === null) {
      throw undefinedVariable(name);
    }
    scope.values.set(name.lexeme, value);
  }

  private find(name: string): Environment | null {
    let scope: Environment | null = this;
    while (scope !== null && !scope.values.has(name)) {
      scope = scope.enclosing;
    }
    return scope;
  }
}
