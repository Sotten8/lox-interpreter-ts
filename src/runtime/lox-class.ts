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

  constructor(loxClass: LoxClass) {
    this.loxClass = loxClass;
  }

  toString(): string {
    return `${this.loxClass.name} instance`;
  }
}
