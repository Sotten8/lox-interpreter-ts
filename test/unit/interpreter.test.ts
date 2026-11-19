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

describe('interpret: variables', () => {
  it('stores values of every kind and gives nil to a bare declaration', () => {
    expect(outputOf('var a = 1; print a;')).toEqual(['1']);
    expect(outputOf('var a = "text"; print a;')).toEqual(['text']);
    expect(outputOf('var a = false; print a;')).toEqual(['false']);
    expect(outputOf('var a = nil; print a;')).toEqual(['nil']);
    expect(outputOf('var a; print a;')).toEqual(['nil']);
    expect(outputOf('var a = 1; var b;')).toEqual([]);
  });

  it('allows a global variable be declared again', () => {
    expect(outputOf('var a = 1; var a = 2; print a;')).toEqual(['2']);
    expect(outputOf('var a = 1; var a = a + 1; print a;')).toEqual(['2']);
    expect(outputOf('var a = 1; var a; print a;')).toEqual(['nil']);
    expect(outputOf('var a = 1; var b = a + 2; print b * a;')).toEqual(['3']);
  });

  it('treats names of JavaScript objects as variables', () => {
    expect(errorOf('print constructor;')).toBe(
      "Undefined variable 'constructor'.\n[line 1]",
    );
    expect(outputOf('var toString = 1; print toString;')).toEqual(['1']);
  });

  it('reports an undefined variable with the line of the name', () => {
    expect(errorOf('print x;')).toBe("Undefined variable 'x'.\n[line 1]");
    expect(errorOf('var a = 1;\nprint a +\nb;')).toBe(
      "Undefined variable 'b'.\n[line 3]",
    );
    expect(errorOf('var a = a;')).toBe("Undefined variable 'a'.\n[line 1]");
    expect(errorOf('var a = -"s";')).toBe(
      'Operand must be a number.\n[line 1]',
    );
  });
});

describe('interpret: assignment', () => {
  it('changes a variable and gives back the assigned value', () => {
    expect(outputOf('var a = 1; a = 2; print a;')).toEqual(['2']);
    expect(outputOf('var a; print a = 3; print a;')).toEqual(['3', '3']);
    expect(outputOf('var a = 1; a = a + 1; print a;')).toEqual(['2']);
    expect(outputOf('var a = 1; a = nil; print a;')).toEqual(['nil']);
    expect(outputOf('var a; var b; a = b = 4; print a; print b;')).toEqual([
      '4',
      '4',
    ]);
  });

  it('does not create a variable and evaluates the value first', () => {
    expect(errorOf('a = 1;')).toBe("Undefined variable 'a'.\n[line 1]");
    expect(errorOf('var b;\n\nx = 1;')).toBe(
      "Undefined variable 'x'.\n[line 3]",
    );
    expect(errorOf('constructor = 1;')).toBe(
      "Undefined variable 'constructor'.\n[line 1]",
    );
    expect(errorOf('x = y;')).toBe("Undefined variable 'y'.\n[line 1]");
    expect(errorOf('x = -"s";')).toBe('Operand must be a number.\n[line 1]');
  });
});

describe('interpret: blocks', () => {
  it('hides block variables from the outside', () => {
    expect(outputOf('{ print 1; print 2; }')).toEqual(['1', '2']);
    expect(outputOf('{} {{}}')).toEqual([]);
    expect(outputOf('{ var a = 1; print a; }')).toEqual(['1']);
    expect(errorOf('{ var a = 1; }\nprint a;')).toBe(
      "Undefined variable 'a'.\n[line 2]",
    );
    expect(errorOf('{ { var a = 1; } print a; }')).toBe(
      "Undefined variable 'a'.\n[line 1]",
    );
  });

  it('allows an inner variable to shadow an outer one', () => {
    expect(
      outputOf(
        'var a = "global";\n{ var a = "outer"; { var a = "inner"; print a; }\nprint a; }\nprint a;',
      ),
    ).toEqual(['inner', 'outer', 'global']);
    expect(outputOf('var a = 1; { var a = a + 1; print a; } print a;')).toEqual(
      ['2', '1'],
    );
  });

  it('changes an outer variable from inside a block', () => {
    expect(outputOf('var a = 1; { a = 2; } print a;')).toEqual(['2']);
    expect(
      outputOf('var a = 1; { { a = a + 1; } a = a * 10; } print a;'),
    ).toEqual(['20']);
    expect(outputOf('var a = 1; { var a = 5; a = 6; } print a;')).toEqual([
      '1',
    ]);
  });

  it('leaves the block scope after a runtime error', () => {
    const lines: string[] = [];
    const interpreter = new Interpreter((line) => lines.push(line));
    const run = (source: string): RuntimeError | null =>
      interpreter.interpret(parse(scan(source).tokens).statements);

    expect(
      run('var a = "outer"; { var a = "inner"; print -"x"; }')?.message,
    ).toBe('Operand must be a number.');
    expect(run('print a;')).toBeNull();
    expect(lines).toEqual(['outer']);
  });
});

describe('interpret: logical operators', () => {
  it('returns an operand, not a boolean', () => {
    expectPrinted([
      ['nil or "yes"', 'yes'],
      ['"a" or "b"', 'a'],
      ['false and 1', 'false'],
      ['1 and 2', '2'],
      ['0 or 1', '0'],
      ['"" and "ok"', 'ok'],
      ['nil and 1 or 2', '2'],
      ['1 == 1 and 2 < 3', 'true'],
    ]);
  });

  it('skips the right operand when the left one decides', () => {
    expect(outputOf('var a = 1; false and (a = 2); print a;')).toEqual(['1']);
    expect(outputOf('var a = 1; true or (a = 2); print a;')).toEqual(['1']);
    expect(outputOf('var a = 1; nil or (a = 2); print a;')).toEqual(['2']);
    expect(outputOf('var a = 1; true and (a = 2); print a;')).toEqual(['2']);
    expect(errorOf('true or -"x";')).toBeNull();
    expect(errorOf('nil or -"x";')).toBe('Operand must be a number.\n[line 1]');
    expect(errorOf('-"x" or y;')).toBe('Operand must be a number.\n[line 1]');
  });
});

describe('interpret: if', () => {
  it('picks one branch by truthiness', () => {
    const cases: [string, string[]][] = [
      ['if (true) print 1;', ['1']],
      ['if (false) print 1;', []],
      ['if (false) print 1; else print 2;', ['2']],
      ['if (nil) print 1; else print 2;', ['2']],
      ['if (0) print 1; else print 2;', ['1']],
      ['if ("") print 1; else print 2;', ['1']],
      ['var n = 0; if (n = n + 1) print n;', ['1']],
    ];

    for (const [source, lines] of cases) {
      expect(outputOf(source), source).toEqual(lines);
    }

    const chain = (n: number): string =>
      `var a = ${n}; if (a == 1) print "one"; else if (a == 2) print "two"; else print "many";`;

    expect(outputOf(chain(1))).toEqual(['one']);
    expect(outputOf(chain(2))).toEqual(['two']);
    expect(outputOf(chain(3))).toEqual(['many']);
    expect(outputOf('if (true) if (false) print 1; else print 2;')).toEqual([
      '2',
    ]);
    expect(outputOf('if (false) if (true) print 1; else print 2;')).toEqual([]);
    expect(errorOf('if (false) print y;')).toBeNull();
    expect(errorOf('if (true) print 1; else print y;')).toBeNull();
    expect(errorOf('if (true) print y;')).toBe(
      "Undefined variable 'y'.\n[line 1]",
    );
    expect(errorOf('if (false) print 1; else print y;')).toBe(
      "Undefined variable 'y'.\n[line 1]",
    );
    expect(errorOf('if (-"x") print 1;')).toBe(
      'Operand must be a number.\n[line 1]',
    );
  });
});

describe('interpret: loops', () => {
  it('repeats while the condition is true', () => {
    expect(
      outputOf('var i = 0; while (i < 3) { print i; i = i + 1; }'),
    ).toEqual(['0', '1', '2']);
    expect(outputOf('var i = 0; while (i < 3) i = i + 1; print i;')).toEqual([
      '3',
    ]);
    expect(outputOf('var n = 0; while ((n = n + 1) < 3) print n;')).toEqual([
      '1',
      '2',
    ]);
    expect(outputOf('while (false) print 1;')).toEqual([]);
    expect(outputOf('while (nil) print 1;')).toEqual([]);
    expect(outputOf('var s = "go"; while (s) s = nil; print s;')).toEqual([
      'nil',
    ]);
    expect(errorOf('while (true) -"x";')).toBe(
      'Operand must be a number.\n[line 1]',
    );
  });

  it('runs for with optional clauses and its own scope', () => {
    expect(outputOf('for (var i = 0; i < 3; i = i + 1) print i;')).toEqual([
      '0',
      '1',
      '2',
    ]);
    expect(outputOf('var i; for (i = 0; i < 2; i = i + 1) print i;')).toEqual([
      '0',
      '1',
    ]);
    expect(outputOf('var i = 0; for (; i < 2; i = i + 1) print i;')).toEqual([
      '0',
      '1',
    ]);
    expect(outputOf('for (var i = 0; i < 2;) { print i; i = i + 1; }')).toEqual(
      ['0', '1'],
    );
    expect(outputOf('for (var i = 0; false; i = i + 1) print 1;')).toEqual([]);
    expect(
      outputOf(
        'var n = 0; for (var i = 0; i < 4; i = i + 1) n = n + i; print n;',
      ),
    ).toEqual(['6']);
    expect(errorOf('for (;;) -"x";')).toBe(
      'Operand must be a number.\n[line 1]',
    );
    expect(errorOf('for (var i = 0; i < 1; i = i + 1) {} print i;')).toBe(
      "Undefined variable 'i'.\n[line 1]",
    );
    expect(
      outputOf(
        'var i = "out"; for (var i = 0; i < 1; i = i + 1) print i; print i;',
      ),
    ).toEqual(['0', 'out']);
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
