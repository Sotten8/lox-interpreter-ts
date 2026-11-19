import { describe, expect, it } from 'vitest';
import { formatCompileError } from '../../src/errors';
import { printStmt } from '../../src/syntax/ast-printer';
import { parse, type ParseResult } from '../../src/syntax/parser';
import { scan } from '../../src/syntax/scanner';

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
      expect(errorsOf(`1 + * 2\n${keyword} 3;`)).toHaveLength(2);
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
