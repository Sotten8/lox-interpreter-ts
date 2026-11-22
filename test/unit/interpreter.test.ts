import { describe, expect, it, vi } from 'vitest';
import { formatRuntimeError, type RuntimeError } from '../../src/errors';
import { resolve } from '../../src/resolver/resolver';
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
    resolve(statements).locals,
  );
  return { lines, error };
};

const outputOf = (source: string): string[] => execute(source).lines;

const errorOf = (source: string): string | null => {
  const { error } = execute(source);
  return error === null ? null : formatRuntimeError(error);
};

const withInstance = (body: string): string =>
  `class Box {} var box = Box(); ${body}`;

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
    expect(outputOf('var a = 1; { var b = a + 1; print b; } print a;')).toEqual(
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
    const run = (source: string): RuntimeError | null => {
      const { statements } = parse(scan(source).tokens);
      return interpreter.interpret(statements, resolve(statements).locals);
    };

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

describe('interpret: calls', () => {
  it('rejects a value that is not callable', () => {
    for (const source of ['true();', 'nil();', '123();', '"text"();']) {
      expect(errorOf(source), source).toBe(
        'Can only call functions and classes.\n[line 1]',
      );
    }
    expect(errorOf('"a"(\n1,\n2\n);')).toBe(
      'Can only call functions and classes.\n[line 4]',
    );
  });

  it('evaluates the callee and the arguments before the call error', () => {
    expect(errorOf('x(y);')).toBe("Undefined variable 'x'.\n[line 1]");
    expect(errorOf('nil(y);')).toBe("Undefined variable 'y'.\n[line 1]");
    expect(errorOf('nil(-"s");')).toBe('Operand must be a number.\n[line 1]');
    expect(errorOf('nil(1, -"s", y);')).toBe(
      'Operand must be a number.\n[line 1]',
    );
    expect(errorOf('fun f(a) {} f(1, -"s");')).toBe(
      'Operand must be a number.\n[line 1]',
    );
    expect(
      outputOf(
        'var i = 0; fun f(a, b) { print a; print b; } f(i = i + 1, i = i + 1);',
      ),
    ).toEqual(['1', '2']);
  });
});

describe('interpret: functions', () => {
  it('declares and calls functions', () => {
    expect(outputOf('fun hello() { print "hi"; } hello(); hello();')).toEqual([
      'hi',
      'hi',
    ]);
    expect(
      outputOf('fun add(a, b) { print a + b; } add(1, 2); add("x", "y");'),
    ).toEqual(['3', 'xy']);
    expect(outputOf('fun f() {} print f();')).toEqual(['nil']);
    expect(errorOf('fun f() { print nope; } f();')).toBe(
      "Undefined variable 'nope'.\n[line 1]",
    );
  });

  it('runs every call in its own scope inside the declaration scope', () => {
    expect(
      outputOf(
        'fun count(n) { if (n > 0) { print n; count(n - 1); print n; } } count(2);',
      ),
    ).toEqual(['2', '1', '1', '2']);
    expect(
      outputOf('var a = "global"; fun f(a) { print a; } f("param"); print a;'),
    ).toEqual(['param', 'global']);
    expect(errorOf('fun f(a) { var b = a; } f(1); print b;')).toBe(
      "Undefined variable 'b'.\n[line 1]",
    );
    expect(
      outputOf('fun outer(x) { fun inner() { print x; } inner(); } outer(7);'),
    ).toEqual(['7']);
    expect(
      outputOf('var n = 0; fun inc() { n = n + 1; } inc(); inc(); print n;'),
    ).toEqual(['2']);
  });

  it('treats functions as values', () => {
    expect(outputOf('fun foo() {} print foo; print clock;')).toEqual([
      '<fn foo>',
      '<native fn>',
    ]);
    expect(
      outputOf(
        'fun f() { print "f"; } var g = f; g(); print f == g; print f == clock; print !f;',
      ),
    ).toEqual(['f', 'true', 'false', 'false']);
  });

  it('checks the number of arguments before running the body', () => {
    expect(errorOf('fun f(a, b) {} f(1);')).toBe(
      'Expected 2 arguments but got 1.\n[line 1]',
    );
    expect(errorOf('fun f(a, b) {} f(1, 2, 3, 4);')).toBe(
      'Expected 2 arguments but got 4.\n[line 1]',
    );
    expect(errorOf('fun f(a) {}\nf(\n1,\n2\n);')).toBe(
      'Expected 1 arguments but got 2.\n[line 5]',
    );
    expect(execute('fun f(a) { print "ran"; } f();').lines).toEqual([]);
  });

  it('provides clock in seconds', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(5500);
      expect(outputOf('print clock();')).toEqual(['5.5']);
    } finally {
      vi.useRealTimers();
    }
    expect(errorOf('clock(1);')).toBe(
      'Expected 0 arguments but got 1.\n[line 1]',
    );
  });
});

describe('interpret: return', () => {
  it('returns the value of the expression or nil from the innermost function', () => {
    expect(outputOf('fun f() { return 1 + 2; } print f();')).toEqual(['3']);
    expect(outputOf('fun f() { return; } print f();')).toEqual(['nil']);
    expect(outputOf('fun f() { return "a"; print "b"; } print f();')).toEqual([
      'a',
    ]);
    expect(errorOf('fun f() { return -"s"; } f();')).toBe(
      'Operand must be a number.\n[line 1]',
    );
    expect(
      outputOf(
        'fun g() { return "g"; } fun f() { g(); return "f"; } print f(); print g();',
      ),
    ).toEqual(['f', 'g']);
    expect(
      outputOf(
        'fun fib(n) { if (n < 2) return n; return fib(n - 1) + fib(n - 2); } print fib(10);',
      ),
    ).toEqual(['55']);
  });

  it('leaves nested blocks and loops and restores the scope', () => {
    expect(
      outputOf(
        'fun f() { for (var i = 0; i < 10; i = i + 1) { if (i == 3) { return i; } } } print f();',
      ),
    ).toEqual(['3']);
    expect(errorOf('fun f() { { var a = 1; return a; } } f(); print a;')).toBe(
      "Undefined variable 'a'.\n[line 1]",
    );
  });

  it('returns closures that keep their own variables', () => {
    const counter =
      'fun makeCounter() { var i = 0; fun count() { i = i + 1; print i; } return count; }';

    expect(
      outputOf(
        `${counter} var a = makeCounter(); var b = makeCounter(); a(); a(); b();`,
      ),
    ).toEqual(['1', '2', '1']);
  });
});

describe('interpret: call depth', () => {
  it('counts calls correctly after a runtime error', () => {
    const interpreter = new Interpreter(() => undefined, 3);
    const interpret = (source: string): RuntimeError | null => {
      const { statements } = parse(scan(source).tokens);
      return interpreter.interpret(statements, resolve(statements).locals);
    };

    expect(
      interpret('fun boom() { -"s"; } fun a() { boom(); } a();'),
    ).not.toBeNull();
    expect(interpret('fun g() {} fun f() { g(); } f();')).toBeNull();
  });
});

describe('interpret: classes', () => {
  it('prints a class by its name', () => {
    expect(outputOf('class Box {} print Box;')).toEqual(['Box']);
  });

  it('prints an instance as the name of its class and "instance"', () => {
    expect(outputOf('class Box {} print Box();')).toEqual(['Box instance']);
  });

  it('creates a new instance on every call', () => {
    expect(outputOf('class Box {} print Box() == Box();')).toEqual(['false']);
  });

  it('equals an instance to itself', () => {
    expect(
      outputOf('class Box {} var a = Box(); var b = a; print a == b;'),
    ).toEqual(['true']);
  });

  it('does not equal a class to its instance', () => {
    expect(outputOf('class Box {} print Box == Box();')).toEqual(['false']);
  });

  it('stores a class in a variable', () => {
    expect(outputOf('class Box {} var B = Box; print B;')).toEqual(['Box']);
  });

  it('creates an instance through a variable that holds a class', () => {
    expect(outputOf('class Box {} var B = Box; print B();')).toEqual([
      'Box instance',
    ]);
  });

  it('passes a class to a function that creates an instance', () => {
    expect(
      outputOf('class Box {} fun make(c) { return c(); } print make(Box);'),
    ).toEqual(['Box instance']);
  });

  it('declares a class in a block', () => {
    expect(outputOf('{ class Box {} print Box; }')).toEqual(['Box']);
  });

  it('hides a class declared in a block outside of it', () => {
    expect(errorOf('{ class Box {} } print Box;')).toBe(
      "Undefined variable 'Box'.\n[line 1]",
    );
  });

  it('creates a different class on every call of the declaring function', () => {
    expect(
      outputOf('fun make() { class A {} return A; } print make() == make();'),
    ).toEqual(['false']);
  });

  it('lets the second declaration replace a global class', () => {
    expect(
      outputOf('class A {} var first = A; class A {} print first == A;'),
    ).toEqual(['false']);
  });

  it('rejects one argument for a class without init', () => {
    expect(errorOf('class Box {} Box(1);')).toBe(
      'Expected 0 arguments but got 1.\n[line 1]',
    );
  });
});

describe('interpret: fields', () => {
  it('sets a field and reads it back', () => {
    expect(outputOf(withInstance('box.x = "value"; print box.x;'))).toEqual([
      'value',
    ]);
  });

  it('returns the assigned value from a set', () => {
    expect(outputOf(withInstance('print box.x = 1;'))).toEqual(['1']);
  });

  it('overwrites a field', () => {
    expect(
      outputOf(withInstance('box.x = 1; box.x = 2; print box.x;')),
    ).toEqual(['2']);
  });

  it('keeps the fields of different instances apart', () => {
    expect(
      outputOf(
        'class Box {} var a = Box(); var b = Box(); a.x = 1; b.x = 2; print a.x; print b.x;',
      ),
    ).toEqual(['1', '2']);
  });

  it('keeps several fields of one instance apart', () => {
    expect(
      outputOf(withInstance('box.a = 1; box.b = 2; print box.a; print box.b;')),
    ).toEqual(['1', '2']);
  });

  it('stores nil in a field', () => {
    expect(outputOf(withInstance('box.x = nil; print box.x;'))).toEqual([
      'nil',
    ]);
  });

  it('stores false in a field', () => {
    expect(outputOf(withInstance('box.x = false; print box.x;'))).toEqual([
      'false',
    ]);
  });

  it('stores zero in a field', () => {
    expect(outputOf(withInstance('box.x = 0; print box.x;'))).toEqual(['0']);
  });

  it('stores an empty string in a field', () => {
    expect(outputOf(withInstance('box.x = ""; print box.x;'))).toEqual(['']);
  });

  it('stores a class in a field', () => {
    expect(outputOf(withInstance('box.x = Box; print box.x;'))).toEqual([
      'Box',
    ]);
  });

  it('reads a field through a chain of instances', () => {
    expect(
      outputOf(withInstance('box.a = Box(); box.a.b = 1; print box.a.b;')),
    ).toEqual(['1']);
  });

  it('lets an instance hold itself', () => {
    expect(
      outputOf(withInstance('box.me = box; print box.me.me == box;')),
    ).toEqual(['true']);
  });

  it('assigns a chain of field assignments from the right', () => {
    expect(
      outputOf(
        'class Box {} var a = Box(); var b = Box(); a.x = b.y = 1; print a.x; print b.y;',
      ),
    ).toEqual(['1', '1']);
  });

  it('assigns a field to a variable assignment', () => {
    expect(
      outputOf(withInstance('var v; box.x = v = 3; print box.x;')),
    ).toEqual(['3']);
  });

  it('calls a function stored in a field', () => {
    expect(
      outputOf(
        withInstance('fun f(a) { print a; } box.g = f; box.g("called");'),
      ),
    ).toEqual(['called']);
  });

  it('reads a field set inside a function', () => {
    expect(
      outputOf(withInstance('fun set() { box.x = 1; } set(); print box.x;')),
    ).toEqual(['1']);
  });

  it('reads a field of an instance created in a local scope', () => {
    expect(
      outputOf(
        'class Box {} { var local = Box(); local.x = 1; print local.x; }',
      ),
    ).toEqual(['1']);
  });

  it('stores a field named like a JavaScript property', () => {
    expect(
      outputOf(withInstance('box.constructor = 1; print box.constructor;')),
    ).toEqual(['1']);
  });

  it('stores a field named __proto__', () => {
    expect(
      outputOf(withInstance('box.__proto__ = 1; print box.__proto__;')),
    ).toEqual(['1']);
  });
});

describe('interpret: property errors', () => {
  it('reports an undefined property', () => {
    expect(errorOf(withInstance('print box.x;'))).toBe(
      "Undefined property 'x'.\n[line 1]",
    );
  });

  it('does not take a field of another instance', () => {
    expect(
      errorOf('class Box {} var a = Box(); var b = Box(); a.x = 1; print b.x;'),
    ).toBe("Undefined property 'x'.\n[line 1]");
  });

  it('does not see a JavaScript property of the field storage', () => {
    expect(errorOf(withInstance('print box.constructor;'))).toBe(
      "Undefined property 'constructor'.\n[line 1]",
    );
  });

  it('reports the line of the property name for an undefined property', () => {
    expect(errorOf(withInstance('print box\n.\nx;'))).toBe(
      "Undefined property 'x'.\n[line 3]",
    );
  });

  it('rejects reading a property of a number', () => {
    expect(errorOf('var n = 1; print n.x;')).toBe(
      'Only instances have properties.\n[line 1]',
    );
  });

  it('rejects reading a property of a class', () => {
    expect(errorOf('class Box {} print Box.x;')).toBe(
      'Only instances have properties.\n[line 1]',
    );
  });

  it('reports the line of the property name for a non-instance', () => {
    expect(errorOf('var n = 1;\nn\n.\nx;')).toBe(
      'Only instances have properties.\n[line 4]',
    );
  });

  it('rejects setting a field on a number', () => {
    expect(errorOf('var n = 1; n.x = 2;')).toBe(
      'Only instances have fields.\n[line 1]',
    );
  });

  it('rejects setting a field on a class', () => {
    expect(errorOf('class Box {} Box.x = 1;')).toBe(
      'Only instances have fields.\n[line 1]',
    );
  });

  it('reports the line of the property name when setting on a non-instance', () => {
    expect(errorOf('var n = 1;\nn\n.\nx = 2;')).toBe(
      'Only instances have fields.\n[line 4]',
    );
  });

  it('checks the object of a set before evaluating the value', () => {
    expect(errorOf('var n = 1; n.x = missing;')).toBe(
      'Only instances have fields.\n[line 1]',
    );
  });
});

describe('interpret: methods', () => {
  it('calls a method', () => {
    expect(
      outputOf('class Box { hello() { print "hi"; } } Box().hello();'),
    ).toEqual(['hi']);
  });

  it('passes arguments to a method', () => {
    expect(
      outputOf('class Box { add(a, b) { print a + b; } } Box().add(1, 2);'),
    ).toEqual(['3']);
  });

  it('returns a value from a method', () => {
    expect(
      outputOf('class Box { two() { return 2; } } print Box().two();'),
    ).toEqual(['2']);
  });

  it('returns nil from a method without return', () => {
    expect(outputOf('class Box { m() {} } print Box().m();')).toEqual(['nil']);
  });

  it('reads a field through this', () => {
    expect(
      outputOf(
        'class Box { show() { print this.x; } } var box = Box(); box.x = "field"; box.show();',
      ),
    ).toEqual(['field']);
  });

  it('writes a field through this', () => {
    expect(
      outputOf(
        'class Box { put() { this.x = 5; } } var box = Box(); box.put(); print box.x;',
      ),
    ).toEqual(['5']);
  });

  it('returns this from a method', () => {
    expect(
      outputOf(
        'class Box { me() { return this; } } var box = Box(); print box.me() == box;',
      ),
    ).toEqual(['true']);
  });

  it('chains method calls through this', () => {
    expect(
      outputOf(
        'class Box { put(v) { this.v = v; return this; } get() { return this.v; } } print Box().put(3).get();',
      ),
    ).toEqual(['3']);
  });

  it('calls another method through this', () => {
    expect(
      outputOf('class Box { a() { this.b(); } b() { print "b"; } } Box().a();'),
    ).toEqual(['b']);
  });

  it('calls a method recursively through this', () => {
    expect(
      outputOf(
        'class Box { count(n) { if (n > 0) { print n; this.count(n - 1); } } } Box().count(2);',
      ),
    ).toEqual(['2', '1']);
  });

  it('keeps this for a method taken out of the instance', () => {
    expect(
      outputOf(
        'class Box { show() { print this.x; } } var box = Box(); box.x = "kept"; var f = box.show; f();',
      ),
    ).toEqual(['kept']);
  });

  it('keeps the first instance when a method is moved to another one', () => {
    expect(
      outputOf(
        'class Box { show() { print this.x; } } var a = Box(); a.x = "a"; var b = Box(); b.x = "b"; b.f = a.show; b.f();',
      ),
    ).toEqual(['a']);
  });

  it('shares methods between instances but not fields', () => {
    expect(
      outputOf(
        'class Box { inc() { this.n = this.n + 1; } } var a = Box(); a.n = 0; var b = Box(); b.n = 10; a.inc(); b.inc(); print a.n; print b.n;',
      ),
    ).toEqual(['1', '11']);
  });

  it('lets a field hide a method with the same name', () => {
    expect(
      outputOf(
        'class Box { m() { print "method"; } } var box = Box(); box.m = "field"; print box.m;',
      ),
    ).toEqual(['field']);
  });

  it('keeps methods of different classes apart', () => {
    expect(
      outputOf(
        'class A { m() { print "A"; } } class B { m() { print "B"; } } A().m(); B().m();',
      ),
    ).toEqual(['A', 'B']);
  });

  it('closes over a variable of the enclosing block', () => {
    expect(
      outputOf(
        '{ var x = "local"; class Box { m() { print x; } } Box().m(); }',
      ),
    ).toEqual(['local']);
  });

  it('sees a global declared after the class', () => {
    expect(
      outputOf('class Box { m() { print late; } } var late = "ok"; Box().m();'),
    ).toEqual(['ok']);
  });

  it('keeps this in a function created inside a method', () => {
    expect(
      outputOf(
        'class Box { make() { fun inner() { return this.v; } return inner; } } var box = Box(); box.v = "captured"; var f = box.make(); print f();',
      ),
    ).toEqual(['captured']);
  });

  it('refers to its own class by name', () => {
    expect(
      outputOf('class Box { copy() { return Box(); } } print Box().copy();'),
    ).toEqual(['Box instance']);
  });

  it('calls a method of a class declared in a function', () => {
    expect(
      outputOf(
        'fun make() { class Box { m() { return "made"; } } return Box(); } print make().m();',
      ),
    ).toEqual(['made']);
  });

  it('prints a bound method as a function', () => {
    expect(outputOf('class Box { m() {} } print Box().m;')).toEqual(['<fn m>']);
  });

  it('calls a method named like a JavaScript property', () => {
    expect(
      outputOf('class Box { toString() { print "own"; } } Box().toString();'),
    ).toEqual(['own']);
  });

  it('rejects too few arguments for a method', () => {
    expect(errorOf('class Box { m(a) {} } Box().m();')).toBe(
      'Expected 1 arguments but got 0.\n[line 1]',
    );
  });

  it('rejects too many arguments for a method', () => {
    expect(errorOf('class Box { m() {} } Box().m(1);')).toBe(
      'Expected 0 arguments but got 1.\n[line 1]',
    );
  });
});

describe('interpret: binding of variables', () => {
  it('uses the variable declared above the function, not below', () => {
    expect(
      outputOf(
        'var a = "global"; { fun showA() { print a; } showA(); var a = "block"; showA(); }',
      ),
    ).toEqual(['global', 'global']);
  });

  it('assigns to the global, not to a local declared below', () => {
    expect(
      outputOf(
        'var a = "global"; { fun assign() { a = "assigned"; } var a = "inner"; assign(); print a; } print a;',
      ),
    ).toEqual(['inner', 'assigned']);
  });

  it('does not see a local function declared below', () => {
    expect(
      errorOf(
        '{ fun isEven(n) { if (n == 0) return true; return isOdd(n - 1); } fun isOdd(n) { return isEven(n - 1); } isEven(2); }',
      ),
    ).toBe("Undefined variable 'isOdd'.\n[line 1]");
  });

  it('finds a global declared below the function', () => {
    expect(outputOf('fun f() { print late; } var late = "ok"; f();')).toEqual([
      'ok',
    ]);
  });

  it('reads a local without a value as nil', () => {
    expect(outputOf('{ var a; print a; }')).toEqual(['nil']);
  });

  it('hides a global with a parameter of the same name', () => {
    expect(
      outputOf('var a = 1; fun f(a) { a = 2; print a; } f(0); print a;'),
    ).toEqual(['2', '1']);
  });

  it('reports an unknown variable read in a block', () => {
    expect(errorOf('{ print x; }')).toBe("Undefined variable 'x'.\n[line 1]");
  });

  it('reports an unknown variable assigned in a block', () => {
    expect(errorOf('{ x = 1; }')).toBe("Undefined variable 'x'.\n[line 1]");
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

    expect(() =>
      new Interpreter(() => {}).interpret([statement], new Map()),
    ).toThrow("Unknown binary operator ','.");
  });

  it('rejects a statement of an unknown kind', () => {
    const unknown = { kind: 'unknown' } as unknown as Stmt;

    expect(() =>
      new Interpreter(() => {}).interpret([unknown], new Map()),
    ).toThrow('Unexpected value: {"kind":"unknown"}');
  });
});
