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

  getAt(distance: number, name: string): LoxValue {
    const scope = this.ancestor(distance);
    if (!scope.values.has(name)) {
      throw new Error(
        `Resolver bug: '${name}' is not at distance ${distance}.`,
      );
    }
    return scope.values.get(name) ?? null;
  }

  assignAt(distance: number, name: string, value: LoxValue): void {
    const scope = this.ancestor(distance);
    if (!scope.values.has(name)) {
      throw new Error(
        `Resolver bug: '${name}' is not at distance ${distance}.`,
      );
    }
    scope.values.set(name, value);
  }

  private ancestor(distance: number): Environment {
    let scope: Environment = this;
    for (let step = 0; step < distance; step++) {
      if (scope.enclosing === null) {
        throw new Error(`Resolver bug: no scope at distance ${distance}.`);
      }
      scope = scope.enclosing;
    }
    return scope;
  }

  private find(name: string): Environment | null {
    let scope: Environment | null = this;
    while (scope !== null && !scope.values.has(name)) {
      scope = scope.enclosing;
    }
    return scope;
  }
}
