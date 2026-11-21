import type { LoxCallable } from './callable';
import type { LoxInstance } from './lox-class';

export type LoxValue =
  number | string | boolean | null | LoxCallable | LoxInstance;

export function isTruthy(value: LoxValue): boolean {
  return value !== null && value !== false;
}

export function isEqual(left: LoxValue, right: LoxValue): boolean {
  return left === right;
}

export function stringify(value: LoxValue): string {
  if (value === null) {
    return 'nil';
  }
  if (Object.is(value, -0)) {
    return '-0';
  }
  return String(value);
}
