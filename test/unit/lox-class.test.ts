import { describe, expect, it } from 'vitest';
import { RuntimeError } from '../../src/errors';
import type { Token } from '../../src/syntax/token';
import { LoxCallable } from '../../src/runtime/callable';
import { Interpreter } from '../../src/runtime/interpreter';
import { LoxClass, LoxInstance } from '../../src/runtime/lox-class';

const interpreter = new Interpreter(() => undefined);

const identifier = (lexeme: string, line = 1): Token => ({
  type: 'IDENTIFIER',
  lexeme,
  literal: null,
  line,
  column: 1,
});

const newInstance = (): LoxInstance => new LoxInstance(new LoxClass('Box'));

describe('LoxClass', () => {
  it('is callable', () => {
    expect(new LoxClass('Box')).toBeInstanceOf(LoxCallable);
  });

  it('keeps its name', () => {
    expect(new LoxClass('Box').name).toBe('Box');
  });

  it('takes no arguments', () => {
    expect(new LoxClass('Box').arity).toBe(0);
  });

  it('is printed as its name', () => {
    expect(new LoxClass('Box').toString()).toBe('Box');
  });

  it('creates an instance', () => {
    expect(new LoxClass('Box').call(interpreter, [])).toBeInstanceOf(
      LoxInstance,
    );
  });

  it('creates an instance that refers to this class', () => {
    const loxClass = new LoxClass('Box');
    const instance = loxClass.call(interpreter, []) as LoxInstance;

    expect(instance.loxClass).toBe(loxClass);
  });

  it('creates a different instance on every call', () => {
    const loxClass = new LoxClass('Box');

    expect(loxClass.call(interpreter, [])).not.toBe(
      loxClass.call(interpreter, []),
    );
  });
});

describe('LoxInstance fields', () => {
  it('reads a field after it is set', () => {
    const instance = newInstance();

    instance.set(identifier('x'), 1);

    expect(instance.get(identifier('x'))).toBe(1);
  });

  it('reads nil from a field set to nil', () => {
    const instance = newInstance();

    instance.set(identifier('x'), null);

    expect(instance.get(identifier('x'))).toBeNull();
  });

  it('replaces the value of a field', () => {
    const instance = newInstance();

    instance.set(identifier('x'), 1);
    instance.set(identifier('x'), 2);

    expect(instance.get(identifier('x'))).toBe(2);
  });

  it('keeps the fields of different instances apart', () => {
    const first = newInstance();
    const second = newInstance();

    first.set(identifier('x'), 1);

    expect(() => second.get(identifier('x'))).toThrow(RuntimeError);
  });

  it('throws a runtime error for a field that was never set', () => {
    expect(() => newInstance().get(identifier('x'))).toThrow(
      "Undefined property 'x'.",
    );
  });

  it('puts the line of the name into the error', () => {
    expect(() => newInstance().get(identifier('x', 7))).toThrow(
      expect.objectContaining({ line: 7 }),
    );
  });
});

describe('LoxInstance', () => {
  it('is not callable', () => {
    expect(newInstance()).not.toBeInstanceOf(LoxCallable);
  });

  it('is printed as the name of its class and "instance"', () => {
    expect(newInstance().toString()).toBe('Box instance');
  });
});
