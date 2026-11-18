import { describe, expect, it } from 'vitest';
import {
  isEqual,
  isTruthy,
  stringify,
  type LoxValue,
} from '../../src/runtime/values';

describe('isTruthy function tests', () => {
  it('treats nil and false as false', () => {
    expect(isTruthy(null)).toBe(false);
    expect(isTruthy(false)).toBe(false);
  });

  it('treats every other value as true, even 0, "" and NaN', () => {
    const values: [string, LoxValue][] = [
      ['true', true],
      ['zero', 0],
      ['the empty string', ''],
      ['NaN', NaN],
    ];

    for (const [name, value] of values) {
      expect(isTruthy(value), name).toBe(true);
    }
  });
});

describe('isEqual function tests', () => {
  it('compares values of the same type by value', () => {
    expect(isEqual(null, null)).toBe(true);
    expect(isEqual(true, true)).toBe(true);
    expect(isEqual('ab', 'ab')).toBe(true);
    expect(isEqual(1, 2)).toBe(false);
  });

  it('treats values of different types as not equal', () => {
    const values: LoxValue[] = [null, false, 0, '', '0'];

    for (const left of values) {
      for (const right of values) {
        if (left !== right) {
          expect(isEqual(left, right), `${left} and ${right}`).toBe(false);
        }
      }
    }
  });

  it('compares NaN and -0 like JavaScript', () => {
    expect(isEqual(NaN, NaN)).toBe(false);
    expect(isEqual(0, -0)).toBe(true);
  });
});

describe('stringify function tests', () => {
  it('writes nil, booleans and strings', () => {
    expect(stringify(null)).toBe('nil');
    expect(stringify(true)).toBe('true');
    expect(stringify('hi')).toBe('hi');
    expect(stringify('')).toBe('');
  });

  it('writes numbers without a trailing .0', () => {
    expect(stringify(7)).toBe('7');
    expect(stringify(3.5)).toBe('3.5');
    expect(stringify(0)).toBe('0');
  });

  it('writes -0, Infinity and NaN', () => {
    expect(stringify(-0)).toBe('-0');
    expect(stringify(Infinity)).toBe('Infinity');
    expect(stringify(-Infinity)).toBe('-Infinity');
    expect(stringify(NaN)).toBe('NaN');
  });
});
