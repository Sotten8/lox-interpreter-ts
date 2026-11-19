import { describe, expect, it } from 'vitest';
import { formatRuntimeError, type RuntimeError } from '../../src/errors';
import { Interpreter } from '../../src/runtime/interpreter';
import { parse } from '../../src/syntax/parser';
import { scan } from '../../src/syntax/scanner';
import type { Stmt } from '../../src/syntax/ast';
import type { Token } from '../../src/syntax/token';

interface Execution {
  readonly lines: string[];
  readonly error: RuntimeError | null;
}

const execute = (source: string): Execution => {
  const lines: string[] = [];
  const { statements } = parse(scan(source).tokens);
  const error = new Interpreter((line) => lines.push(line)).interpret(
    statements,
  );
  return { lines, error };
};

const outputOf = (source: string): string[] => execute(source).lines;

const errorOf = (source: string): string | null => {
  const { error } = execute(source);
  return error === null ? null : formatRuntimeError(error);
};

const expectPrinted = (cases: [string, string][]): void => {
  for (const [source, expected] of cases) {
    expect(outputOf(`print ${source};`), source).toEqual([expected]);
  }
};

describe('interpret: printing', () => {
  it('prints every kind of literal', () => {
    expectPrinted([
      ['123', '123'],
      ['123.456', '123.456'],
      ['-0', '-0'],
      ['"hi"', 'hi'],
      ['false', 'false'],
      ['nil', 'nil'],
    ]);
  });

  it('prints one line per print statement and nothing else', () => {
    expect(outputOf('print 1; print "two"; print nil;')).toEqual([
      '1',
      'two',
      'nil',
    ]);
    expect(outputOf('print "1\n2";')).toEqual(['1\n2']);
    expect(outputOf('print "";')).toEqual(['']);
    expect(outputOf('1 + 2; "a";')).toEqual([]);
    expect(outputOf('')).toEqual([]);
  });
});

describe('interpret: expressions', () => {
  it('evaluates arithmetic and string concatenation', () => {
    expectPrinted([
      ['1 + 2 * 3', '7'],
      ['10 - 4 - 3', '3'],
      ['7 / 2 / 2', '1.75'],
      ['-(3)', '-3'],
      ['---(3)', '-3'],
      ['1 / 0', 'Infinity'],
      ['0 / 0', 'NaN'],
      ['"a" + "b"', 'ab'],
    ]);
  });

  it('compares numbers', () => {
    expectPrinted([
      ['1 < 2', 'true'],
      ['2 < 2', 'false'],
      ['2 <= 2', 'true'],
      ['3 <= 2', 'false'],
      ['2 > 1', 'true'],
      ['2 > 2', 'false'],
      ['2 >= 2', 'true'],
      ['1 >= 2', 'false'],
      ['0 < -0', 'false'],
    ]);
  });

  it('checks values for equality', () => {
    expectPrinted([
      ['nil == nil', 'true'],
      ['"a" == "a"', 'true'],
      ['1 == 2', 'false'],
      ['nil == false', 'false'],
      ['0 == "0"', 'false'],
      ['0 == -0', 'true'],
      ['0 / 0 == 0 / 0', 'false'],
      ['1 != 2', 'true'],
      ['0 / 0 != 0 / 0', 'true'],
    ]);
  });

  it('turns every value into a boolean with !', () => {
    expectPrinted([
      ['!nil', 'true'],
      ['!false', 'true'],
      ['!0', 'false'],
      ['!""', 'false'],
    ]);
  });
});

describe('interpret: runtime errors', () => {
  it('reports operands of the wrong type', () => {
    for (const source of ['-"s";', '-nil;']) {
      expect(errorOf(source), source).toBe(
        'Operand must be a number.\n[line 1]',
      );
    }

    for (const operator of ['-', '*', '/', '<', '<=', '>', '>=']) {
      const expected = 'Operands must be numbers.\n[line 1]';

      expect(errorOf(`"1" ${operator} 1;`), `"1" ${operator} 1`).toBe(expected);
      expect(errorOf(`1 ${operator} "1";`), `1 ${operator} "1"`).toBe(expected);
    }

    for (const source of [
      '1 + nil;',
      '"s" + nil;',
      'true + "s";',
      '1 + "1";',
      '"1" + 1;',
    ]) {
      expect(errorOf(source), source).toBe(
        'Operands must be two numbers or two strings.\n[line 1]',
      );
    }
  });

  it('reports the line of the operator', () => {
    expect(errorOf('1\n+\nnil;')).toBe(
      'Operands must be two numbers or two strings.\n[line 2]',
    );
    expect(errorOf('\n\n-"s";')).toBe('Operand must be a number.\n[line 3]');
    expect(errorOf('1\n*\n"a";')).toBe('Operands must be numbers.\n[line 2]');
  });

  it('evaluates operands from left to right before checking types', () => {
    expect(errorOf('-"a" + (1 + nil);')).toBe(
      'Operand must be a number.\n[line 1]',
    );
    expect(errorOf('"a" - (1 + nil);')).toBe(
      'Operands must be two numbers or two strings.\n[line 1]',
    );
  });

  it('stops at the first error and keeps earlier output', () => {
    const result = execute('print 1;\nprint -"a";\nprint 3;');

    expect(result.lines).toEqual(['1']);
    expect(result.error?.line).toBe(2);
    expect(result.error?.message).toBe('Operand must be a number.');
    expect(execute('print 1;').error).toBeNull();
  });

  it('rethrows errors that are not Lox runtime errors', () => {
    const plus: Token = {
      type: 'COMMA',
      lexeme: ',',
      literal: null,
      line: 1,
      column: 1,
    };
    const statement: Stmt = {
      kind: 'expression',
      expression: {
        kind: 'binary',
        left: { kind: 'literal', value: 1 },
        operator: plus,
        right: { kind: 'literal', value: 2 },
      },
    };

    expect(() => new Interpreter(() => {}).interpret([statement])).toThrow(
      "Unknown binary operator ','.",
    );
  });

  it('rejects a statement of an unknown kind', () => {
    const unknown = { kind: 'unknown' } as unknown as Stmt;

    expect(() => new Interpreter(() => {}).interpret([unknown])).toThrow(
      'Unexpected value: {"kind":"unknown"}',
    );
  });
});
