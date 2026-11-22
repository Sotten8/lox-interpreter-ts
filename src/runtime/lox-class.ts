import { RuntimeError } from '../errors';
import type { Token } from '../syntax/token';
import { LoxCallable } from './callable';
import type { Interpreter } from './interpreter';
import type { LoxValue } from './values';

export class LoxClass extends LoxCallable {
  readonly name: string;

  constructor(name: string) {
    super();
    this.name = name;
  }

  get arity(): number {
    return 0;
  }

  call(_interpreter: Interpreter, _args: readonly LoxValue[]): LoxValue {
    return new LoxInstance(this);
  }

  toString(): string {
    return this.name;
  }
}

export class LoxInstance {
  readonly loxClass: LoxClass;
  private readonly fields = new Map<string, LoxValue>();

  constructor(loxClass: LoxClass) {
    this.loxClass = loxClass;
  }

  get(name: Token): LoxValue {
    if (!this.fields.has(name.lexeme)) {
      throw new RuntimeError(name.line, `Undefined property '${name.lexeme}'.`);
    }
    return this.fields.get(name.lexeme) ?? null;
  }

  set(name: Token, value: LoxValue): void {
    this.fields.set(name.lexeme, value);
  }

  toString(): string {
    return `${this.loxClass.name} instance`;
  }
}
