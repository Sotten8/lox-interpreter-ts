import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { scan } from '../../src/syntax/scanner';

const FRAGMENTS = [
  'var ',
  'x',
  ' ',
  '\t',
  '\r\n',
  '\n',
  '1',
  '23',
  '2.5',
  '.',
  '"s"',
  '"',
  '"two\nlines"',
  '//c\n',
  '// c',
  '/',
  '+',
  '-',
  '*',
  '=',
  '==',
  '!',
  '!=',
  '<',
  '<=',
  '>',
  '>=',
  '(',
  ')',
  '{',
  '}',
  ';',
  ',',
  'and',
  'or',
  'orchid',
  'class',
  '_a1',
  '@',
  '#',
  '\u00e9',
];

const loxLike = fc
  .array(fc.constantFrom(...FRAGMENTS), { maxLength: 40 })
  .map((parts) => parts.join(''));

const printable = fc.string({ maxLength: 80 });
const anyCharacters = fc.string({ unit: 'binary', maxLength: 40 });

const anySource = fc.oneof(loxLike, printable, anyCharacters);

function offsetOf(source: string, line: number, column: number): number {
  let currentLine = 1;
  let lineStart = 0;
  for (let index = 0; index < source.length && currentLine < line; index += 1) {
    if (source.charAt(index) === '\n') {
      currentLine += 1;
      lineStart = index + 1;
    }
  }
  return lineStart + column - 1;
}

describe('scan: properties', () => {
  it('never fails and always gives one EOF', () => {
    fc.assert(
      fc.property(anySource, (source) => {
        const { tokens } = scan(source);
        const eofCount = tokens.filter((token) => token.type === 'EOF').length;

        expect(eofCount).toBe(1);
        expect(tokens[tokens.length - 1]?.type).toBe('EOF');
      }),
      { numRuns: 1000 },
    );
  });

  it('puts each token where its text starts', () => {
    fc.assert(
      fc.property(anySource, (source) => {
        for (const token of scan(source).tokens) {
          const offset = offsetOf(source, token.line, token.column);

          expect(source.slice(offset, offset + token.lexeme.length)).toBe(
            token.lexeme,
          );
        }
      }),
      { numRuns: 1000 },
    );
  });

  it('puts each error at the character that caused it', () => {
    const notStartOfToken = /[^A-Za-z0-9_"(){},.+\-;*!=<>/ \t\r\n]/;

    fc.assert(
      fc.property(anySource, (source) => {
        for (const error of scan(source).errors) {
          const character = source.charAt(
            offsetOf(source, error.line, error.column),
          );

          if (error.message === 'Unterminated string.') {
            expect(character).toBe('"');
          } else {
            expect(character).toMatch(notStartOfToken);
          }
        }
      }),
      { numRuns: 1000 },
    );
  });

  it('takes lexemes from the text in the same order', () => {
    fc.assert(
      fc.property(anySource, (source) => {
        let position = 0;
        for (const token of scan(source).tokens) {
          const found = source.indexOf(token.lexeme, position);

          expect(found).toBeGreaterThanOrEqual(position);
          position = found + token.lexeme.length;
        }
      }),
      { numRuns: 1000 },
    );
  });

  it('gives positive positions that never go back', () => {
    fc.assert(
      fc.property(anySource, (source) => {
        let previousLine = 1;
        let previousColumn = 0;
        for (const token of scan(source).tokens) {
          expect(token.line).toBeGreaterThanOrEqual(1);
          expect(token.column).toBeGreaterThanOrEqual(1);
          expect(token.line).toBeGreaterThanOrEqual(previousLine);
          if (token.line === previousLine) {
            expect(token.column).toBeGreaterThan(previousColumn);
          }
          previousLine = token.line;
          previousColumn = token.column;
        }
      }),
      { numRuns: 1000 },
    );
  });

  it('reports only known messages and correct positions', () => {
    fc.assert(
      fc.property(anySource, (source) => {
        for (const error of scan(source).errors) {
          expect(['Unexpected character.', 'Unterminated string.']).toContain(
            error.message,
          );
          expect(error.line).toBeGreaterThanOrEqual(1);
          expect(error.column).toBeGreaterThanOrEqual(1);
        }
      }),
      { numRuns: 1000 },
    );
  });

  it('gives the same tokens when lexemes are joined with spaces', () => {
    fc.assert(
      fc.property(anySource, (source) => {
        const original = scan(source).tokens.filter(
          (token) => token.type !== 'EOF',
        );
        const rejoined = scan(
          original.map((token) => token.lexeme).join(' '),
        ).tokens.filter((token) => token.type !== 'EOF');

        expect(
          rejoined.map((token) => [token.type, token.lexeme, token.literal]),
        ).toEqual(
          original.map((token) => [token.type, token.lexeme, token.literal]),
        );
      }),
      { numRuns: 1000 },
    );
  });

  it('reports no errors for text made of valid pieces', () => {
    const validFragments = FRAGMENTS.filter(
      (fragment) => !['@', '#', '\u00e9', '"', '// c', '/'].includes(fragment),
    );
    const valid = fc
      .array(fc.constantFrom(...validFragments), { maxLength: 40 })
      .map((parts) => parts.join(''));

    fc.assert(
      fc.property(valid, (source) => {
        expect(scan(source).errors).toEqual([]);
      }),
      { numRuns: 1000 },
    );
  });
});
