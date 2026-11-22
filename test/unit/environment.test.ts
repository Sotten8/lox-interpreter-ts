import { describe, expect, it } from 'vitest';
import { formatRuntimeError, RuntimeError } from '../../src/common/errors';
import { Environment } from '../../src/runtime/environment';
import type { Token } from '../../src/syntax/token';

const name = (lexeme: string, line = 1): Token => ({
  type: 'IDENTIFIER',
  lexeme,
  literal: null,
  line,
  column: 1,
});

const errorOf = (action: () => unknown): string | null => {
  try {
    action();
  } catch (error) {
    if (error instanceof RuntimeError) {
      return formatRuntimeError(error);
    }
    throw error;
  }
  return null;
};

describe('environment: one scope', () => {
  it('returns a defined value, including nil and false', () => {
    const environment = new Environment();
    environment.define('a', 1);
    environment.define('b', null);
    environment.define('c', false);

    expect(environment.get(name('a'))).toBe(1);
    expect(environment.get(name('b'))).toBeNull();
    expect(environment.get(name('c'))).toBe(false);
  });

  it('reports an undefined variable with the line of the name', () => {
    const environment = new Environment();

    expect(errorOf(() => environment.get(name('x', 3)))).toBe(
      "Undefined variable 'x'.\n[line 3]",
    );
  });

  it('allows a variable be defined again', () => {
    const environment = new Environment();
    environment.define('a', 1);
    environment.define('a', 'new');

    expect(environment.get(name('a'))).toBe('new');
  });

  it('assigns to a defined variable and reports an undefined one', () => {
    const environment = new Environment();
    environment.define('a', 1);
    environment.assign(name('a'), 2);

    expect(environment.get(name('a'))).toBe(2);
    expect(errorOf(() => environment.assign(name('b', 5), 1))).toBe(
      "Undefined variable 'b'.\n[line 5]",
    );
    expect(errorOf(() => environment.get(name('b')))).toBe(
      "Undefined variable 'b'.\n[line 1]",
    );
  });

  it('treats names of JavaScript objects as ordinary variables', () => {
    const environment = new Environment();

    for (const word of ['constructor', 'toString', '__proto__']) {
      expect(
        errorOf(() => environment.get(name(word))),
        word,
      ).toBe(`Undefined variable '${word}'.\n[line 1]`);
      environment.define(word, 1);
      expect(environment.get(name(word)), word).toBe(1);
    }
  });
});

describe('environment: nested scopes', () => {
  it('reads a variable of an enclosing scope', () => {
    const outer = new Environment();
    outer.define('a', 1);
    const inner = new Environment(outer);

    expect(inner.get(name('a'))).toBe(1);
    expect(new Environment(inner).get(name('a'))).toBe(1);
  });

  it('lets an inner variable hide the outer one without changing it', () => {
    const outer = new Environment();
    outer.define('a', 'outer');
    const inner = new Environment(outer);
    inner.define('a', 'inner');

    expect(inner.get(name('a'))).toBe('inner');
    expect(outer.get(name('a'))).toBe('outer');
  });

  it('assigns to the nearest scope that defines the variable', () => {
    const outer = new Environment();
    outer.define('a', 1);
    outer.define('b', 1);
    const inner = new Environment(outer);
    inner.define('b', 2);

    inner.assign(name('a'), 10);
    inner.assign(name('b'), 20);

    expect(outer.get(name('a'))).toBe(10);
    expect(outer.get(name('b'))).toBe(1);
    expect(inner.get(name('b'))).toBe(20);
  });

  it('does not see variables of an inner scope from the outer one', () => {
    const outer = new Environment();
    const inner = new Environment(outer);
    inner.define('a', 1);

    expect(errorOf(() => outer.get(name('a')))).toBe(
      "Undefined variable 'a'.\n[line 1]",
    );
    expect(errorOf(() => outer.assign(name('a'), 2))).toBe(
      "Undefined variable 'a'.\n[line 1]",
    );
  });
});

describe('environment: access by distance', () => {
  const chain = (): [Environment, Environment, Environment] => {
    const outer = new Environment();
    const middle = new Environment(outer);
    const inner = new Environment(middle);
    outer.define('a', 'outer');
    middle.define('a', 'middle');
    inner.define('a', 'inner');
    return [outer, middle, inner];
  };

  it('reads at distance 0, 1 and 2', () => {
    const [, , inner] = chain();

    expect(inner.getAt(0, 'a')).toBe('inner');
    expect(inner.getAt(1, 'a')).toBe('middle');
    expect(inner.getAt(2, 'a')).toBe('outer');
  });

  it('reads nil and false', () => {
    const environment = new Environment();
    environment.define('n', null);
    environment.define('f', false);

    expect(environment.getAt(0, 'n')).toBeNull();
    expect(environment.getAt(0, 'f')).toBe(false);
  });

  it('assigns only at the given distance', () => {
    const [outer, middle, inner] = chain();

    inner.assignAt(1, 'a', 'changed');

    expect(middle.getAt(0, 'a')).toBe('changed');
    expect(inner.getAt(0, 'a')).toBe('inner');
    expect(outer.getAt(0, 'a')).toBe('outer');
  });

  it('assigns at distance 0', () => {
    const [, middle, inner] = chain();

    inner.assignAt(0, 'a', 'changed');

    expect(inner.getAt(0, 'a')).toBe('changed');
    expect(middle.getAt(0, 'a')).toBe('middle');
  });

  it('does not look outside when reading a missing name', () => {
    const outer = new Environment();
    outer.define('a', 1);
    const inner = new Environment(outer);

    expect(() => inner.getAt(0, 'a')).toThrow(
      "Resolver bug: 'a' is not at distance 0.",
    );
  });

  it('does not look outside when assigning a missing name', () => {
    const outer = new Environment();
    outer.define('a', 1);
    const inner = new Environment(outer);

    expect(() => inner.assignAt(0, 'a', 2)).toThrow(
      "Resolver bug: 'a' is not at distance 0.",
    );
    expect(outer.getAt(0, 'a')).toBe(1);
  });

  it('fails when reading too far out', () => {
    const [, , inner] = chain();

    expect(() => inner.getAt(3, 'a')).toThrow(
      'Resolver bug: no scope at distance 3.',
    );
  });

  it('fails when assigning too far out', () => {
    const [, , inner] = chain();

    expect(() => inner.assignAt(3, 'a', 1)).toThrow(
      'Resolver bug: no scope at distance 3.',
    );
  });
});
