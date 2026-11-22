import { describe, expect, it } from 'vitest';
import { formatCompileError } from '../../../src/common/errors';
import { printStmt } from '../../../src/syntax/ast-printer';
import {
  MAX_NESTING,
  parse,
  type ParseResult,
} from '../../../src/syntax/parser';
import { scan } from '../../../src/syntax/scanner';

const parseSource = (source: string): ParseResult => parse(scan(source).tokens);

const trees = (source: string): string[] =>
  parseSource(source).statements.map(printStmt);

const exprTree = (source: string): string =>
  trees(`${source};`)
    .join('')
    .replace(/^\(expr (.*)\)$/, '$1');

const errorsOf = (source: string): string[] =>
  parseSource(source).errors.map(formatCompileError);

describe('parse: literals and statements', () => {
  it.each([
    ['123;', '123'],
    ['1.5;', '1.5'],
    ['"hi";', '"hi"'],
    ['true;', 'true'],
    ['false;', 'false'],
    ['nil;', 'nil'],
  ])('parses the literal in %s', (source, tree) => {
    expect(trees(source)).toEqual([`(expr ${tree})`]);
  });

  it('separates print from expression statements', () => {
    expect(trees('print 1; 2;')).toEqual(['(print 1)', '(expr 2)']);
  });

  it('returns nothing for an empty program', () => {
    const result = parseSource('');

    expect(result.statements).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it('keeps the line of the operator token', () => {
    const { statements } = parseSource('1\n+ 2;');
    const statement = statements[0];

    expect(statement?.kind).toBe('expression');
    if (statement?.kind === 'expression') {
      expect(statement.expression.kind).toBe('binary');
      if (statement.expression.kind === 'binary') {
        expect(statement.expression.operator.lexeme).toBe('+');
        expect(statement.expression.operator.line).toBe(2);
      }
    }
  });
});

describe('parse: priority and associativity', () => {
  it.each([
    ['1 + 2 * 3', '(+ 1 (* 2 3))'],
    ['1 * 2 + 3', '(+ (* 1 2) 3)'],
    ['-1 + 2', '(+ (- 1) 2)'],
    ['-1 * 2', '(* (- 1) 2)'],
    ['1 + 2 < 4', '(< (+ 1 2) 4)'],
    ['1 < 2 == 2 > 1', '(== (< 1 2) (> 2 1))'],
    ['!true == false', '(== (! true) false)'],
    ['(1 + 2) * 3', '(* (group (+ 1 2)) 3)'],
    ['1 != 2', '(!= 1 2)'],
    ['1 <= 2', '(<= 1 2)'],
    ['1 >= 2', '(>= 1 2)'],
    ['6 / 3', '(/ 6 3)'],
  ])('builds the tree for %s', (source, tree) => {
    expect(exprTree(source)).toBe(tree);
  });

  it.each([
    ['1 - 2 - 3', '(- (- 1 2) 3)'],
    ['8 / 4 / 2', '(/ (/ 8 4) 2)'],
  ])('groups %s from left to right', (source, tree) => {
    expect(exprTree(source)).toBe(tree);
  });

  it.each([
    ['--1', '(- (- 1))'],
    ['!!true', '(! (! true))'],
  ])('groups %s from right to left', (source, tree) => {
    expect(exprTree(source)).toBe(tree);
  });
});

describe('parse: variables', () => {
  it('parses declarations and names in expressions', () => {
    expect(trees('var a;')).toEqual(['(var a)']);
    expect(trees('var a = 1 + 2 * b;')).toEqual(['(var a (+ 1 (* 2 b)))']);
    expect(trees('print a; var a = nil; a;')).toEqual([
      '(print a)',
      '(var a nil)',
      '(expr a)',
    ]);
    expect(exprTree('-a == !b')).toBe('(== (- a) (! b))');
  });

  it('recovers after a broken declaration', () => {
    const result = parseSource('var 1 = 2;\nvar b = 3;\nvar ;\nprint b;');

    expect(result.statements.map(printStmt)).toEqual([
      '(var b 3)',
      '(print b)',
    ]);
    expect(result.errors).toHaveLength(2);
  });
});

describe('parse: assignment', () => {
  it('groups assignments from right to left', () => {
    expect(exprTree('a = 1')).toBe('(= a 1)');
    expect(exprTree('a = b = 1')).toBe('(= a (= b 1))');
    expect(exprTree('a = b = c = nil')).toBe('(= a (= b (= c nil)))');
    expect(exprTree('a = 1 + 2')).toBe('(= a (+ 1 2))');
    expect(exprTree('a = b == c')).toBe('(= a (== b c))');
    expect(exprTree('(a = 1) + 2')).toBe('(+ (group (= a 1)) 2)');
    expect(trees('var a = b = 1;')).toEqual(['(var a (= b 1))']);
  });

  it('reports a target that is not a variable and keeps parsing', () => {
    for (const source of ['1 = 2;', 'a + b = c;', '(a) = 1;', '-a = 1;']) {
      const errors = errorsOf(source);

      expect(errors, source).toHaveLength(1);
      expect(errors[0], source).toMatch(
        /^\[line 1\] Error at '=': Invalid assignment target\.$/,
      );
    }
    expect(errorsOf('a + b = c;\nprint 1;')).toHaveLength(1);
    expect(trees('a + b = c;\nprint 1;')).toEqual([
      '(expr (+ a b))',
      '(print 1)',
    ]);
    expect(parseSource('1 +\n  2 = 3;').errors[0]).toMatchObject({
      line: 2,
      column: 5,
      where: "at '='",
    });
  });
});

describe('parse: blocks', () => {
  it('parses blocks with any number of statements', () => {
    expect(trees('{}')).toEqual(['(block)']);
    expect(trees('{ 1; }')).toEqual(['(block (expr 1))']);
    expect(trees('{ var a = 1; print a; }')).toEqual([
      '(block (var a 1) (print a))',
    ]);
    expect(trees('{ { 1; } {} } print 2;')).toEqual([
      '(block (block (expr 1)) (block))',
      '(print 2)',
    ]);
  });

  it('reports a block that is not closed', () => {
    expect(errorsOf('{ print 1;')).toEqual([
      "[line 1] Error at end: Expect '}' after block.",
    ]);
    expect(errorsOf('{')).toEqual([
      "[line 1] Error at end: Expect '}' after block.",
    ]);
    expect(errorsOf('{ { print 1; }')).toEqual([
      "[line 1] Error at end: Expect '}' after block.",
    ]);
  });

  it('recovers after an error in a block', () => {
    const result = parseSource('{ print ; print 2; }\nprint 3;');

    expect(result.statements.map(printStmt)).toEqual([
      '(block (print 2))',
      '(print 3)',
    ]);
    expect(result.errors).toHaveLength(1);
  });
});

describe('parse: logical operators', () => {
  it('groups logical operators by priority', () => {
    expect(exprTree('a or b and c')).toBe('(or a (and b c))');
    expect(exprTree('a and b or c')).toBe('(or (and a b) c)');
    expect(exprTree('a or b or c')).toBe('(or (or a b) c)');
    expect(exprTree('a and b and c')).toBe('(and (and a b) c)');
    expect(exprTree('a == b and c != d')).toBe('(and (== a b) (!= c d))');
    expect(exprTree('a = b or c')).toBe('(= a (or b c))');
    expect(errorsOf('a or b = c;')).toEqual([
      "[line 1] Error at '=': Invalid assignment target.",
    ]);
  });
});

describe('parse: if', () => {
  it('parses if and else', () => {
    expect(trees('if (a) 1;')).toEqual(['(if a (expr 1))']);
    expect(trees('if (a) 1; else 2;')).toEqual(['(if a (expr 1) (expr 2))']);
    expect(trees('if (a = 1) 2; print 3;')).toEqual([
      '(if (= a 1) (expr 2))',
      '(print 3)',
    ]);
    expect(trees('if (a) { 1; } else { 2; }')).toEqual([
      '(if a (block (expr 1)) (block (expr 2)))',
    ]);
    expect(trees('if (a) 1; else if (b) 2; else 3;')).toEqual([
      '(if a (expr 1) (if b (expr 2) (expr 3)))',
    ]);
    expect(trees('if (a) if (b) 1; else 2;')).toEqual([
      '(if a (if b (expr 1) (expr 2)))',
    ]);
    expect(trees('if (a) { if (b) 1; } else 2;')).toEqual([
      '(if a (block (if b (expr 1))) (expr 2))',
    ]);
  });

  it('reports a broken if', () => {
    const cases: [string, string][] = [
      ['if a) 1;', "[line 1] Error at 'a': Expect '(' after 'if'."],
      ['if (a 1;', "[line 1] Error at '1': Expect ')' after if condition."],
      ['if (a) var b;', "[line 1] Error at 'var': Expect expression."],
      ['if (a) 1; else var b;', "[line 1] Error at 'var': Expect expression."],
    ];

    for (const [source, message] of cases) {
      expect(errorsOf(source), source).toEqual([message]);
    }
    expect(trees('if (a 1; print 2;')).toEqual(['(print 2)']);
  });
});

describe('parse: loops', () => {
  it('parses while', () => {
    expect(trees('while (a) 1;')).toEqual(['(while a (expr 1))']);
    expect(trees('while (a) { 1; }')).toEqual(['(while a (block (expr 1)))']);
    expect(trees('while (a = b) while (c) 1;')).toEqual([
      '(while (= a b) (while c (expr 1)))',
    ]);
  });

  it('turns for into while and blocks', () => {
    expect(trees('for (var i = 0; i < 3; i = i + 1) print i;')).toEqual([
      '(block (var i 0) (while (< i 3) (block (print i) (expr (= i (+ i 1))))))',
    ]);
    expect(trees('for (i = 0; a; ) 1;')).toEqual([
      '(block (expr (= i 0)) (while a (expr 1)))',
    ]);
    expect(trees('for (; a; i = i + 1) 1;')).toEqual([
      '(while a (block (expr 1) (expr (= i (+ i 1)))))',
    ]);
    expect(trees('for (;;) 1;')).toEqual(['(while true (expr 1))']);
  });

  it('reports a broken loop', () => {
    const cases: [string, string][] = [
      ['while a) 1;', "[line 1] Error at 'a': Expect '(' after 'while'."],
      ['while (a 1;', "[line 1] Error at '1': Expect ')' after condition."],
      ['while (a) var b;', "[line 1] Error at 'var': Expect expression."],
      ['for a) 1;', "[line 1] Error at 'a': Expect '(' after 'for'."],
      [
        'for (var i = 0; i < 3) 1;',
        "[line 1] Error at ')': Expect ';' after loop condition.",
      ],
      ['for (;; 1;', "[line 1] Error at ';': Expect ')' after for clauses."],
      ['for (;;) var b;', "[line 1] Error at 'var': Expect expression."],
    ];

    for (const [source, message] of cases) {
      expect(errorsOf(source), source).toEqual([message]);
    }
    expect(trees('while (a 1; print 2;')).toEqual(['(print 2)']);
  });
});

describe('parse: calls', () => {
  const callWith = (count: number): string =>
    `f(${Array.from({ length: count }, () => '1').join(', ')});`;

  it('parses calls with any number of arguments', () => {
    expect(exprTree('f()')).toBe('(call f)');
    expect(exprTree('f(1, 2 + 3)')).toBe('(call f 1 (+ 2 3))');
    expect(exprTree('f(a = 1)')).toBe('(call f (= a 1))');
    expect(exprTree('f(1)(2)(3)')).toBe('(call (call (call f 1) 2) 3)');
    expect(exprTree('(f)(1)')).toBe('(call (group f) 1)');
    expect(exprTree('-f() + g(1) * 2')).toBe(
      '(+ (- (call f)) (* (call g 1) 2))',
    );
    expect(exprTree('a or f()')).toBe('(or a (call f))');
  });

  it('allows at most 255 arguments and keeps parsing', () => {
    expect(errorsOf(callWith(255))).toEqual([]);
    expect(errorsOf(callWith(256))).toEqual([
      "[line 1] Error at '1': Can't have more than 255 arguments.",
    ]);
    expect(trees(callWith(256))).toHaveLength(1);
  });

  it('reports a broken call', () => {
    const cases: [string, string][] = [
      ['f(1;', "[line 1] Error at ';': Expect ')' after arguments."],
      ['f(1 2);', "[line 1] Error at '2': Expect ')' after arguments."],
      ['f(1,);', "[line 1] Error at ')': Expect expression."],
      ['f(', '[line 1] Error at end: Expect expression.'],
    ];

    for (const [source, message] of cases) {
      expect(errorsOf(source), source).toEqual([message]);
    }
    expect(trees('f(1; print 2;')).toEqual(['(print 2)']);
  });
});

describe('parse: functions', () => {
  const declarationWith = (count: number): string =>
    `fun f(${Array.from({ length: count }, (_, index) => `a${index}`).join(', ')}) {}`;

  it('parses function declarations', () => {
    expect(trees('fun f() {}')).toEqual(['(fun f ())']);
    expect(trees('fun add(a, b) { print a + b; }')).toEqual([
      '(fun add (a b) (print (+ a b)))',
    ]);
    expect(trees('fun outer() { fun inner(x) {} }')).toEqual([
      '(fun outer () (fun inner (x)))',
    ]);
    expect(trees('{ fun f() {} } fun g() {}')).toEqual([
      '(block (fun f ()))',
      '(fun g ())',
    ]);
  });

  it('allows at most 255 parameters and keeps parsing', () => {
    expect(errorsOf(declarationWith(255))).toEqual([]);
    expect(errorsOf(declarationWith(256))).toEqual([
      "[line 1] Error at 'a255': Can't have more than 255 parameters.",
    ]);
    expect(trees(declarationWith(256))).toHaveLength(1);
  });

  it('reports a broken declaration', () => {
    const cases: [string, string][] = [
      ['fun (a) {}', "[line 1] Error at '(': Expect function name."],
      ['fun f {}', "[line 1] Error at '{': Expect '(' after function name."],
      ['fun f(1) {}', "[line 1] Error at '1': Expect parameter name."],
      ['fun f(a,) {}', "[line 1] Error at ')': Expect parameter name."],
      ['fun f(a b) {}', "[line 1] Error at 'b': Expect ')' after parameters."],
      ['fun f() 1;', "[line 1] Error at '1': Expect '{' before function body."],
      ['fun f() { print 1;', "[line 1] Error at end: Expect '}' after block."],
    ];

    for (const [source, message] of cases) {
      expect(errorsOf(source), source).toEqual([message]);
    }
    expect(trees('fun f(; print 2;')).toEqual(['(print 2)']);
  });
});

describe('parse: return', () => {
  it('parses return with and without a value', () => {
    expect(trees('return;')).toEqual(['(return)']);
    expect(trees('return 1 + 2;')).toEqual(['(return (+ 1 2))']);
    expect(trees('fun f() { return a = 1; }')).toEqual([
      '(fun f () (return (= a 1)))',
    ]);
    expect(trees('if (a) return 1; else return;')).toEqual([
      '(if a (return 1) (return))',
    ]);
  });

  it('reports a broken return and keeps parsing', () => {
    expect(errorsOf('return 1')).toEqual([
      "[line 1] Error at end: Expect ';' after return value.",
    ]);
    expect(errorsOf('return 1 2;')).toEqual([
      "[line 1] Error at '2': Expect ';' after return value.",
    ]);
    expect(errorsOf('return')).toEqual([
      '[line 1] Error at end: Expect expression.',
    ]);
    expect(trees('return 1 2; print 3;')).toEqual(['(print 3)']);
  });
});

describe('parse: classes', () => {
  it('parses an empty class declaration', () => {
    expect(trees('class A {}')).toEqual(['(class A)']);
  });

  it('parses classes next to other statements', () => {
    expect(trees('class A {} print 1; class B {}')).toEqual([
      '(class A)',
      '(print 1)',
      '(class B)',
    ]);
  });

  it('parses a class inside a block', () => {
    expect(trees('{ class A {} }')).toEqual(['(block (class A))']);
  });

  it.each([
    ['class {}', "[line 1] Error at '{': Expect class name."],
    ['class 1 {}', "[line 1] Error at '1': Expect class name."],
    ['class print {}', "[line 1] Error at 'print': Expect class name."],
    ['class', '[line 1] Error at end: Expect class name.'],
    ['class A', "[line 1] Error at end: Expect '{' before class body."],
    ['class A 1', "[line 1] Error at '1': Expect '{' before class body."],
    ['class A {', "[line 1] Error at end: Expect '}' after class body."],
  ])('reports an error for %j', (source, message) => {
    expect(errorsOf(source)).toEqual([message]);
  });

  it('skips a broken declaration and parses the next statement', () => {
    expect(trees('class {} print 2;')).toEqual(['(print 2)']);
  });
});

describe('parse: property access', () => {
  it.each([
    ['a.b', '(get a b)'],
    ['a.b.c', '(get (get a b) c)'],
    ['a.b()', '(call (get a b))'],
    ['a().b', '(get (call a) b)'],
    ['a.b().c', '(get (call (get a b)) c)'],
    ['(a).b', '(get (group a) b)'],
    ['a.b + c.d', '(+ (get a b) (get c d))'],
  ])('parses %s', (source, tree) => {
    expect(exprTree(source)).toBe(tree);
  });

  it('handles a dot priority higher than unary minus', () => {
    expect(exprTree('-a.b')).toBe('(- (get a b))');
  });

  it('handles a dot priority higher than a call argument list', () => {
    expect(exprTree('f(a.b, c.d)')).toBe('(call f (get a b) (get c d))');
  });

  it.each([
    ['a.;', "[line 1] Error at ';': Expect property name after '.'."],
    ['a.1;', "[line 1] Error at '1': Expect property name after '.'."],
    ['a.(b);', "[line 1] Error at '(': Expect property name after '.'."],
    ['a.print;', "[line 1] Error at 'print': Expect property name after '.'."],
    ['a. = 1;', "[line 1] Error at '=': Expect property name after '.'."],
    ['a.', "[line 1] Error at end: Expect property name after '.'."],
  ])('reports an error for %j', (source, message) => {
    expect(errorsOf(source)).toEqual([message]);
  });

  it('skips a broken property access and parses the next statement', () => {
    expect(trees('a.; print 2;')).toEqual(['(print 2)']);
  });
});

describe('parse: property assignment', () => {
  it.each([
    ['a.b = 1', '(set a b 1)'],
    ['a.b.c = 1', '(set (get a b) c 1)'],
    ['f().x = 1', '(set (call f) x 1)'],
    ['a.b = 1 + 2', '(set a b (+ 1 2))'],
    ['a.b = c.d', '(set a b (get c d))'],
  ])('parses %s', (source, tree) => {
    expect(exprTree(source)).toBe(tree);
  });

  it('associates to the right through two fields', () => {
    expect(exprTree('a.b = c.d = 1')).toBe('(set a b (set c d 1))');
  });

  it('associates to the right through a field and a variable', () => {
    expect(exprTree('a.b = c = 1')).toBe('(set a b (= c 1))');
  });

  it('allows a field assignment as the value of a variable assignment', () => {
    expect(exprTree('a = b.c = 1')).toBe('(= a (set b c 1))');
  });

  it.each([
    ['a.b() = 1;', "[line 1] Error at '=': Invalid assignment target."],
    ['(a.b) = 1;', "[line 1] Error at '=': Invalid assignment target."],
    ['a.b + c = 1;', "[line 1] Error at '=': Invalid assignment target."],
  ])('rejects the target in %j', (source, message) => {
    expect(errorsOf(source)).toEqual([message]);
  });
});

describe('parse: methods', () => {
  it.each([
    ['class A { m() {} }', '(class A (fun m ()))'],
    ['class A { m(a, b) { print a; } }', '(class A (fun m (a b) (print a)))'],
    ['class A { m() {} n() {} }', '(class A (fun m ()) (fun n ()))'],
    ['class A { m() { return 1; } }', '(class A (fun m () (return 1)))'],
    ['class A { m() { fun f() {} } }', '(class A (fun m () (fun f ())))'],
  ])('parses %s', (source, tree) => {
    expect(trees(source)).toEqual([tree]);
  });

  it('parses a class with methods next to other statements', () => {
    expect(trees('class A { m() {} } print 1;')).toEqual([
      '(class A (fun m ()))',
      '(print 1)',
    ]);
  });

  it.each([
    ['class A { 1() {} }', "[line 1] Error at '1': Expect method name."],
    ['class A { fun m() {} }', "[line 1] Error at 'fun': Expect method name."],
    ['class A { m }', "[line 1] Error at '}': Expect '(' after method name."],
    [
      'class A { m() }',
      "[line 1] Error at '}': Expect '{' before method body.",
    ],
    ['class A { m() {}', "[line 1] Error at end: Expect '}' after class body."],
  ])('reports an error for %j', (source, message) => {
    expect(errorsOf(source)).toEqual([message]);
  });
});

describe('parse: inheritance', () => {
  it.each([
    ['class Dog < Animal {}', '(class Dog < Animal)'],
    ['class Dog < Animal { bark() {} }', '(class Dog < Animal (fun bark ()))'],
  ])('parses %s', (source, tree) => {
    expect(trees(source)).toEqual([tree]);
  });

  it('keeps a class without a superclass', () => {
    const [statement] = parseSource('class Animal {}').statements;

    expect(statement?.kind === 'class' && statement.superclass).toBeNull();
  });

  it('wraps the superclass name in a variable expression', () => {
    const [statement] = parseSource('class Dog < Animal {}').statements;

    expect(statement?.kind === 'class' && statement.superclass).toMatchObject({
      kind: 'variable',
      name: { lexeme: 'Animal', type: 'IDENTIFIER' },
    });
  });

  it.each([
    ['class Dog < {}', "[line 1] Error at '{': Expect superclass name."],
    ['class Dog <', '[line 1] Error at end: Expect superclass name.'],
    [
      'class Dog < pets.Animal {}',
      "[line 1] Error at '.': Expect '{' before class body.",
    ],
    [
      'class Dog > Animal {}',
      "[line 1] Error at '>': Expect '{' before class body.",
    ],
  ])('reports an error for %j', (source, message) => {
    expect(errorsOf(source)).toEqual([message]);
  });
});

describe('parse: super', () => {
  it.each([
    ['super.speak', '(super speak)'],
    ['super.speak()', '(call (super speak))'],
  ])('parses %s', (source, tree) => {
    expect(exprTree(source)).toBe(tree);
  });

  it('keeps the super keyword and the method name in the node', () => {
    const [statement] = parseSource('super.speak;').statements;

    expect(
      statement?.kind === 'expression' && statement.expression,
    ).toMatchObject({
      kind: 'super',
      keyword: { lexeme: 'super', type: 'SUPER' },
      method: { lexeme: 'speak', type: 'IDENTIFIER' },
    });
  });

  it.each([
    ['super(1);', "[line 1] Error at '(': Expect '.' after 'super'."],
    ['super.7;', "[line 1] Error at '7': Expect superclass method name."],
    ['super.speak = 1;', "[line 1] Error at '=': Invalid assignment target."],
  ])('reports an error for %j', (source, message) => {
    expect(errorsOf(source)).toEqual([message]);
  });
});

describe('parse: nesting limit', () => {
  const parens = (n: number): string =>
    `print ${'('.repeat(n)}1${')'.repeat(n)};`;

  const NESTED: [string, (n: number) => string][] = [
    ['parentheses', parens],
    ['unary operators', (n) => `print ${'-'.repeat(n)}1;`],
    ['assignments', (n) => `${'a = '.repeat(n)}1;`],
    ['binary operators', (n) => `print 1${' * 2'.repeat(n)};`],
    ['logical operators', (n) => `print a${' and b'.repeat(n)};`],
    ['calls', (n) => `f${'()'.repeat(n)};`],
    ['arguments', (n) => `${'f('.repeat(n)}1${')'.repeat(n)};`],
    ['property accesses', (n) => `a${'.b'.repeat(n)};`],
    ['blocks', (n) => `${'{'.repeat(n)}print 1;${'}'.repeat(n)}`],
    ['if statements', (n) => `${'if (a) '.repeat(n)}print 1;`],
    ['else branches', (n) => `${'if (a) print 0; else '.repeat(n)}print 1;`],
    ['while loops', (n) => `${'while (a) '.repeat(n)}print 1;`],
    ['for loops', (n) => `${'for (;;) '.repeat(n)}print 1;`],
    ['functions', (n) => `${'fun f() {'.repeat(n)}${'}'.repeat(n)}`],
    ['methods', (n) => `${'class C { m() {'.repeat(n)}${'} }'.repeat(n)}`],
  ];

  const TOO_DEEP = expect.stringMatching(/Too much nesting\.$/);

  it.each(NESTED)('allows %s nested up to the limit', (_, make) => {
    expect(errorsOf(make(MAX_NESTING))).toEqual([]);
  });

  it.each(NESTED)('rejects %s nested over the limit', (_, make) => {
    expect(errorsOf(make(MAX_NESTING + 1))).toEqual([TOO_DEEP]);
  });

  it('reports too much nesting at the first token over the limit', () => {
    expect(errorsOf(parens(MAX_NESTING + 1))).toEqual([
      "[line 1] Error at '1': Too much nesting.",
    ]);
  });

  it('allows different kinds of nesting together up to the limit', () => {
    const half = MAX_NESTING / 2;

    expect(
      errorsOf(`${'{'.repeat(half)}${parens(half)}${'}'.repeat(half)}`),
    ).toEqual([]);
  });

  it('counts different kinds of nesting together', () => {
    const half = MAX_NESTING / 2;

    expect(
      errorsOf(`${'{'.repeat(half)}${parens(half + 1)}${'}'.repeat(half)}`),
    ).toEqual([TOO_DEEP]);
  });

  it('starts from zero for every statement', () => {
    expect(errorsOf(`${parens(MAX_NESTING)} ${parens(MAX_NESTING)}`)).toEqual(
      [],
    );
  });

  it('starts from zero after a chain of operators', () => {
    const chain = `print 1${' + 1'.repeat(MAX_NESTING)};`;

    expect(errorsOf(`${chain} ${chain}`)).toEqual([]);
  });

  it('starts from zero after a chain of calls', () => {
    const chain = `f${'()'.repeat(MAX_NESTING)};`;

    expect(errorsOf(`${chain} ${chain}`)).toEqual([]);
  });

  it('starts from zero after a syntax error inside nesting', () => {
    const broken = `print ${'('.repeat(MAX_NESTING / 2)};`;

    expect(errorsOf(`${broken} ${parens(MAX_NESTING)}`)).toEqual([
      "[line 1] Error at ';': Expect expression.",
    ]);
  });

  it('stops parsing after too much nesting', () => {
    expect(errorsOf(`${parens(MAX_NESTING + 1)} print ;`)).toEqual([
      "[line 1] Error at '1': Too much nesting.",
    ]);
  });

  it('keeps the statements before too much nesting', () => {
    expect(trees(`print 1; ${parens(MAX_NESTING + 1)}`)).toEqual(['(print 1)']);
  });
});

describe('parse: this', () => {
  it.each([
    ['this', 'this'],
    ['this.x', '(get this x)'],
    ['this.x = 1', '(set this x 1)'],
    ['this.m()', '(call (get this m))'],
    ['this + 1', '(+ this 1)'],
    ['f(this)', '(call f this)'],
  ])('parses %s', (source, tree) => {
    expect(exprTree(source)).toBe(tree);
  });

  it('parses this inside a method', () => {
    expect(trees('class A { m() { return this; } }')).toEqual([
      '(class A (fun m () (return this)))',
    ]);
  });

  it('rejects this as an assignment target', () => {
    expect(errorsOf('this = 1;')).toEqual([
      "[line 1] Error at '=': Invalid assignment target.",
    ]);
  });
});

describe('parse: errors and recovery', () => {
  it.each([
    ['1 + ;', ["[line 1] Error at ';': Expect expression."]],
    ['(1 + 2;', ["[line 1] Error at ';': Expect ')' after expression."]],
    ['print 1', ["[line 1] Error at end: Expect ';' after value."]],
    ['1 + 2', ["[line 1] Error at end: Expect ';' after expression."]],
    ['print 1 2;', ["[line 1] Error at '2': Expect ';' after value."]],
    ['\n\n)', ["[line 3] Error at ')': Expect expression."]],
    ['var 1;', ["[line 1] Error at '1': Expect variable name."]],
    ['var', ['[line 1] Error at end: Expect variable name.']],
    [
      'var a = 1',
      ["[line 1] Error at end: Expect ';' after variable declaration."],
    ],
    [
      'var a 1;',
      ["[line 1] Error at '1': Expect ';' after variable declaration."],
    ],
  ])('reports an error for %j', (source, messages) => {
    expect(errorsOf(source)).toEqual(messages);
  });

  it('reports the column of the bad token', () => {
    expect(parseSource('print +;').errors[0]).toMatchObject({
      line: 1,
      column: 7,
    });
  });

  it('skips a broken statement and parses the next ones', () => {
    const result = parseSource('print ; print 2; print ;');

    expect(result.statements.map(printStmt)).toEqual(['(print 2)']);
    expect(result.errors).toHaveLength(2);
  });

  it('stops skipping before print', () => {
    const result = parseSource('1 + * 2\nprint 3;');

    expect(result.statements.map(printStmt)).toEqual(['(print 3)']);
    expect(result.errors).toHaveLength(1);
  });

  it('stops skipping before other statement keywords', () => {
    const keywords = ['class', 'fun', 'var', 'for', 'if', 'while', 'return'];

    for (const keyword of keywords) {
      expect(errorsOf(`1 + * 2\n${keyword} 3 4;`), keyword).toHaveLength(2);
    }
  });

  it('reports one error for each broken statement', () => {
    expect(errorsOf('1 +;\n2 *;\n(3;')).toHaveLength(3);
  });
});

describe('parse: input contract', () => {
  it('throws when the token list has no EOF', () => {
    const { tokens } = scan('1;');

    expect(() => parse(tokens.slice(0, -1))).toThrow(
      'Token list must end with an EOF token.',
    );
    expect(() => parse([])).toThrow('Token list must end with an EOF token.');
  });
});
