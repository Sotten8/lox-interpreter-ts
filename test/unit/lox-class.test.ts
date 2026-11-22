import { describe, expect, it } from 'vitest';
import { RuntimeError } from '../../src/errors';
import type { FunctionStmt } from '../../src/syntax/ast';
import type { Token } from '../../src/syntax/token';
import { LoxCallable, LoxFunction } from '../../src/runtime/callable';
import { Environment } from '../../src/runtime/environment';
import { parse } from '../../src/syntax/parser';
import { scan } from '../../src/syntax/scanner';
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

const declarationOf = (name: string, params: string): FunctionStmt => {
  const { statements } = parse(
    scan(`class Box { ${name}(${params}) {} }`).tokens,
  );
  const declaration = statements[0];
  if (declaration?.kind !== 'class') {
    throw new Error('Expected a class declaration.');
  }
  const [method] = declaration.methods;
  if (method === undefined) {
    throw new Error('Expected a method.');
  }
  return method;
};

const methodNamed = (name: string, params = ''): LoxFunction =>
  new LoxFunction(declarationOf(name, params), new Environment());

const initializer = (params = ''): LoxFunction =>
  new LoxFunction(declarationOf('init', params), new Environment(), true);

const classWith = (...methods: [string, LoxFunction][]): LoxClass =>
  new LoxClass('Box', new Map(methods));

describe('LoxClass methods', () => {
  it('finds a method by its name', () => {
    const method = methodNamed('m');

    expect(classWith(['m', method]).findMethod('m')).toBe(method);
  });

  it('finds nothing for a name that is not a method', () => {
    expect(classWith(['m', methodNamed('m')]).findMethod('n')).toBeUndefined();
  });

  it('has no methods by default', () => {
    expect(new LoxClass('Box').findMethod('m')).toBeUndefined();
  });

  it('does not find a method named like a JavaScript property', () => {
    expect(new LoxClass('Box').findMethod('toString')).toBeUndefined();
  });
});

describe('LoxClass init', () => {
  it('takes the arity of init', () => {
    expect(classWith(['init', initializer('a, b')]).arity).toBe(2);
  });

  it('ignores the arity of other methods', () => {
    expect(classWith(['m', methodNamed('m', 'a')]).arity).toBe(0);
  });

  it('creates an instance of the class when it has init', () => {
    const loxClass = classWith(['init', initializer()]);
    const instance = loxClass.call(interpreter, []) as LoxInstance;

    expect(instance.loxClass).toBe(loxClass);
  });

  it('returns the instance from a direct call of init', () => {
    const instance = new LoxInstance(classWith(['init', initializer()]));
    const bound = instance.get(identifier('init')) as LoxFunction;

    expect(bound.call(interpreter, [])).toBe(instance);
  });
});

const subclassOf = (
  superclass: LoxClass,
  ...methods: [string, LoxFunction][]
): LoxClass => new LoxClass('Sub', new Map(methods), superclass);

describe('LoxClass inheritance', () => {
  it('finds a method of the superclass', () => {
    const method = methodNamed('m');

    expect(subclassOf(classWith(['m', method])).findMethod('m')).toBe(method);
  });

  it('prefers its own method over the method of the superclass', () => {
    const own = methodNamed('m');
    const sub = subclassOf(classWith(['m', methodNamed('m')]), ['m', own]);

    expect(sub.findMethod('m')).toBe(own);
  });

  it('finds a method two classes up', () => {
    const method = methodNamed('m');
    const sub = subclassOf(subclassOf(classWith(['m', method])));

    expect(sub.findMethod('m')).toBe(method);
  });

  it('finds nothing when no class in the chain has the method', () => {
    expect(
      subclassOf(subclassOf(classWith(['m', methodNamed('m')]))).findMethod(
        'n',
      ),
    ).toBeUndefined();
  });

  it('does not give its methods to the superclass', () => {
    const base = classWith();
    subclassOf(base, ['m', methodNamed('m')]);

    expect(base.findMethod('m')).toBeUndefined();
  });

  it('takes the arity of an inherited init', () => {
    expect(subclassOf(classWith(['init', initializer('a, b, c')])).arity).toBe(
      3,
    );
  });

  it('creates an instance of the subclass with an inherited init', () => {
    const sub = subclassOf(classWith(['init', initializer()]));
    const instance = sub.call(interpreter, []) as LoxInstance;

    expect(instance.loxClass).toBe(sub);
  });

  it('finds a method through a very long chain of classes', () => {
    const method = methodNamed('m');
    let loxClass = classWith(['m', method]);
    for (let i = 0; i < 100000; i++) {
      loxClass = subclassOf(loxClass);
    }

    expect(loxClass.findMethod('m')).toBe(method);
  });
});

describe('LoxInstance methods', () => {
  it('returns a method as a function', () => {
    const instance = new LoxInstance(classWith(['m', methodNamed('m')]));

    expect(instance.get(identifier('m'))).toBeInstanceOf(LoxFunction);
  });

  it('returns a new function, not the one stored in the class', () => {
    const method = methodNamed('m');
    const instance = new LoxInstance(classWith(['m', method]));

    expect(instance.get(identifier('m'))).not.toBe(method);
  });

  it('keeps the arity of the method', () => {
    const instance = new LoxInstance(
      classWith(['m', methodNamed('m', 'a, b')]),
    );
    const bound = instance.get(identifier('m')) as LoxFunction;

    expect(bound.arity).toBe(2);
  });

  it('prefers a field over a method with the same name', () => {
    const instance = new LoxInstance(classWith(['m', methodNamed('m')]));

    instance.set(identifier('m'), 1);

    expect(instance.get(identifier('m'))).toBe(1);
  });

  it('keeps a method that is not init from returning the instance', () => {
    const instance = new LoxInstance(classWith(['m', methodNamed('m')]));
    const bound = instance.get(identifier('m')) as LoxFunction;

    expect(bound.call(interpreter, [])).toBeNull();
  });

  it('reports a name that is neither a field nor a method', () => {
    const instance = new LoxInstance(classWith(['m', methodNamed('m')]));

    expect(() => instance.get(identifier('n'))).toThrow(
      "Undefined property 'n'.",
    );
  });
});
