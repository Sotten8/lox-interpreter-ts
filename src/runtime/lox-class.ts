import { RuntimeError } from '../errors';
import type { Token } from '../syntax/token';
import { LoxCallable, type LoxFunction } from './callable';
import type { Interpreter } from './interpreter';
import type { LoxValue } from './values';

export class LoxClass extends LoxCallable {
  readonly name: string;
  private readonly methods: ReadonlyMap<string, LoxFunction>;

  constructor(
    name: string,
    methods: ReadonlyMap<string, LoxFunction> = new Map(),
  ) {
    super();
    this.name = name;
    this.methods = methods;
  }

  get arity(): number {
    return this.findMethod('init')?.arity ?? 0;
  }

  findMethod(name: string): LoxFunction | undefined {
    return this.methods.get(name);
  }

  call(interpreter: Interpreter, args: readonly LoxValue[]): LoxValue {
    const instance = new LoxInstance(this);
    this.findMethod('init')?.bind(instance).call(interpreter, args);
    return instance;
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
    if (this.fields.has(name.lexeme)) {
      return this.fields.get(name.lexeme) ?? null;
    }
    const method = this.loxClass.findMethod(name.lexeme);
    if (method !== undefined) {
      return method.bind(this);
    }
    throw new RuntimeError(name.line, `Undefined property '${name.lexeme}'.`);
  }

  set(name: Token, value: LoxValue): void {
    this.fields.set(name.lexeme, value);
  }

  toString(): string {
    return `${this.loxClass.name} instance`;
  }
}
