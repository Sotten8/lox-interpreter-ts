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

describe('parse: errors and recovery', () => {
  it.each([
    ['1 + ;', ["[line 1] Error at ';': Expect expression."]],
    ['(1 + 2;', ["[line 1] Error at ';': Expect ')' after expression."]],
    ['print 1', ["[line 1] Error at end: Expect ';' after value."]],
    ['1 + 2', ["[line 1] Error at end: Expect ';' after expression."]],
    ['print 1 2;', ["[line 1] Error at '2': Expect ';' after value."]],
    ['\n\n)', ["[line 3] Error at ')': Expect expression."]],
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
