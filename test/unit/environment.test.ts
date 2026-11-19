import { describe, expect, it } from 'vitest';
import { formatRuntimeError, RuntimeError } from '../../src/errors';
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
