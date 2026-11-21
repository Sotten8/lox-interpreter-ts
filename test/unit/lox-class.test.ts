import { describe, expect, it } from 'vitest';
import { LoxCallable } from '../../src/runtime/callable';
import { Interpreter } from '../../src/runtime/interpreter';
import { LoxClass, LoxInstance } from '../../src/runtime/lox-class';

const interpreter = new Interpreter(() => undefined);

describe('LoxClass', () => {
  it('is callable', () => {
    expect(new LoxClass('Foo')).toBeInstanceOf(LoxCallable);
  });

  it('keeps its name', () => {
    expect(new LoxClass('Foo').name).toBe('Foo');
  });

  it('takes no arguments', () => {
    expect(new LoxClass('Foo').arity).toBe(0);
  });

  it('is printed as its name', () => {
    expect(new LoxClass('Foo').toString()).toBe('Foo');
  });

  it('creates an instance', () => {
    expect(new LoxClass('Foo').call(interpreter, [])).toBeInstanceOf(
      LoxInstance,
    );
  });

  it('creates an instance that refers to this class', () => {
    const loxClass = new LoxClass('Foo');
    const instance = loxClass.call(interpreter, []) as LoxInstance;

    expect(instance.loxClass).toBe(loxClass);
  });

  it('creates a different instance on every call', () => {
    const loxClass = new LoxClass('Foo');

    expect(loxClass.call(interpreter, [])).not.toBe(
      loxClass.call(interpreter, []),
    );
  });
});

describe('LoxInstance', () => {
  it('is not callable', () => {
    expect(new LoxInstance(new LoxClass('Foo'))).not.toBeInstanceOf(
      LoxCallable,
    );
  });

  it('is printed as the name of its class and "instance"', () => {
    expect(new LoxInstance(new LoxClass('Foo')).toString()).toBe(
      'Foo instance',
    );
  });
});
