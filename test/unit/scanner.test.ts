import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { formatCompileError } from '../../src/errors';
import { scan } from '../../src/scanner';
import type { TokenType } from '../../src/token';
import { parseExpectations } from '../official/expectations';

const types = (source: string): TokenType[] =>
  scan(source).tokens.map((token) => token.type);

describe('scan: basics', () => {
  it('returns only EOF for an empty file', () => {
    const { tokens, errors } = scan('');

    expect(tokens).toEqual([
      { type: 'EOF', lexeme: '', literal: null, line: 1, column: 1 },
    ]);
    expect(errors).toEqual([]);
  });

  it('ignores space, tab and carriage return', () => {
    const { tokens, errors } = scan(' \t\r ');

    expect(tokens.map((token) => token.type)).toEqual(['EOF']);
    expect(errors).toEqual([]);
  });

  it('scans a full statement', () => {
    expect(types('print 1 + 2 * 3;')).toEqual([
      'PRINT',
      'NUMBER',
      'PLUS',
      'NUMBER',
      'STAR',
      'NUMBER',
      'SEMICOLON',
      'EOF',
    ]);
  });
});

describe('scan: operators', () => {
  it('scans tokens with one character', () => {
    expect(types('(){},.-+;*')).toEqual([
      'LEFT_PAREN',
      'RIGHT_PAREN',
      'LEFT_BRACE',
      'RIGHT_BRACE',
      'COMMA',
      'DOT',
      'MINUS',
      'PLUS',
      'SEMICOLON',
      'STAR',
      'EOF',
    ]);
  });

  it('scans operators with one or two characters', () => {
    expect(types('! != = == < <= > >=')).toEqual([
      'BANG',
      'BANG_EQUAL',
      'EQUAL',
      'EQUAL_EQUAL',
      'LESS',
      'LESS_EQUAL',
      'GREATER',
      'GREATER_EQUAL',
      'EOF',
    ]);
  });

  it('does not join operators with a space between', () => {
    expect(types('! =')).toEqual(['BANG', 'EQUAL', 'EOF']);
  });

  it('takes the longest operator', () => {
    expect(types('===')).toEqual(['EQUAL_EQUAL', 'EQUAL', 'EOF']);
  });

  it('keeps the text of two-character operators', () => {
    const lexemes = scan('!= == <= >=').tokens.map((token) => token.lexeme);

    expect(lexemes).toEqual(['!=', '==', '<=', '>=', '']);
  });

  it('treats one slash not as a comment', () => {
    expect(types('a / b')).toEqual([
      'IDENTIFIER',
      'SLASH',
      'IDENTIFIER',
      'EOF',
    ]);
  });
});

describe('scan: comments', () => {
  it('ignores a comment until the end of the line', () => {
    expect(types('1 // two\n3')).toEqual(['NUMBER', 'NUMBER', 'EOF']);
  });

  it('ignores a comment at the end of the file', () => {
    expect(types('// only a comment')).toEqual(['EOF']);
  });

  it('does not treat one slash before a new line as a comment', () => {
    expect(types('/\n/')).toEqual(['SLASH', 'SLASH', 'EOF']);
  });
});

describe('scan: numbers', () => {
  it('reads whole and decimal numbers', () => {
    const literals = scan('123 12.5 0.25').tokens.map((token) => token.literal);

    expect(literals).toEqual([123, 12.5, 0.25, null]);
  });

  it('keeps the original text in lexeme', () => {
    expect(scan('12.50').tokens[0]?.lexeme).toBe('12.50');
  });

  it('reads every digit from 0 to 9', () => {
    const token = scan('0123456789').tokens[0];

    expect(token).toMatchObject({ lexeme: '0123456789', literal: 123456789 });
  });

  it('does not include a dot after a number', () => {
    expect(types('1234.')).toEqual(['NUMBER', 'DOT', 'EOF']);
  });

  it('does not include a dot before a number', () => {
    expect(types('.1234')).toEqual(['DOT', 'NUMBER', 'EOF']);
  });

  it('stops at the second dot', () => {
    expect(types('1.2.3')).toEqual(['NUMBER', 'DOT', 'NUMBER', 'EOF']);

    const literals = scan('1.2.3').tokens.map((token) => token.literal);

    expect(literals).toEqual([1.2, null, 3, null]);
  });

  it('gives three tokens for number, dot and name', () => {
    expect(types('1.foo')).toEqual(['NUMBER', 'DOT', 'IDENTIFIER', 'EOF']);
  });
});

describe('scan: strings', () => {
  it('keeps the quotes in lexeme and leaves them out of literal', () => {
    const token = scan('"abc"').tokens[0];

    expect(token).toMatchObject({
      type: 'STRING',
      lexeme: '"abc"',
      literal: 'abc',
    });
  });

  it('reads an empty string', () => {
    expect(scan('""').tokens[0]?.literal).toBe('');
  });

  it('allows many lines in a string and keeps the first line', () => {
    const { tokens, errors } = scan('"a\nb"\nx');

    expect(errors).toEqual([]);
    expect(tokens[0]).toMatchObject({ literal: 'a\nb', line: 1, column: 1 });
    expect(tokens[1]).toMatchObject({ lexeme: 'x', line: 3, column: 1 });
  });

  it('keeps the right column after a multi-line string', () => {
    const { tokens } = scan('"a\nb" x');

    expect(tokens[1]).toMatchObject({ lexeme: 'x', line: 2, column: 4 });
  });

  it('does not treat two slashes inside a string as a comment', () => {
    expect(scan('"// no"').tokens[0]?.literal).toBe('// no');
  });

  it('puts the error on the first line of an unclosed string', () => {
    const { tokens, errors } = scan('1\n"abc');

    expect(errors).toEqual([
      { line: 2, column: 1, where: '', message: 'Unterminated string.' },
    ]);
    expect(tokens.map((token) => token.type)).toEqual(['NUMBER', 'EOF']);
  });

  it('puts the error on the first line of an unclosed multi-line string', () => {
    const { errors } = scan('x\n"abc\ndef\nghi');

    expect(errors).toEqual([
      { line: 2, column: 1, where: '', message: 'Unterminated string.' },
    ]);
  });
});

describe('scan: identifiers and keywords', () => {
  it('allows letters, digits and underscore in names', () => {
    const lexemes = scan('foo _bar baz1 a_2').tokens.map(
      (token) => token.lexeme,
    );

    expect(lexemes).toEqual(['foo', '_bar', 'baz1', 'a_2', '']);
    expect(types('foo _bar baz1 a_2')).toEqual([
      'IDENTIFIER',
      'IDENTIFIER',
      'IDENTIFIER',
      'IDENTIFIER',
      'EOF',
    ]);
  });

  it('allows every letter in a name', () => {
    const letters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_';

    expect(scan(letters).tokens[0]).toMatchObject({
      type: 'IDENTIFIER',
      lexeme: letters,
    });
  });

  it('recognizes all keywords', () => {
    const source =
      'and class else false for fun if nil or print return super this true var while';

    expect(types(source)).toEqual([
      'AND',
      'CLASS',
      'ELSE',
      'FALSE',
      'FOR',
      'FUN',
      'IF',
      'NIL',
      'OR',
      'PRINT',
      'RETURN',
      'SUPER',
      'THIS',
      'TRUE',
      'VAR',
      'WHILE',
      'EOF',
    ]);
  });

  it('treats a name that starts with a keyword as one name', () => {
    expect(types('orchid')).toEqual(['IDENTIFIER', 'EOF']);
  });

  it('treats keywords as case sensitive', () => {
    expect(types('And NIL')).toEqual(['IDENTIFIER', 'IDENTIFIER', 'EOF']);
  });

  it('does not treat JavaScript names as keywords', () => {
    expect(types('constructor toString __proto__ hasOwnProperty')).toEqual([
      'IDENTIFIER',
      'IDENTIFIER',
      'IDENTIFIER',
      'IDENTIFIER',
      'EOF',
    ]);
  });
});

describe('scan: positions', () => {
  it('counts lines and starts the column again after a new line', () => {
    const tokens = scan('a b\n  c\n\nd').tokens.map((token) => [
      token.lexeme,
      token.line,
      token.column,
    ]);

    expect(tokens).toEqual([
      ['a', 1, 1],
      ['b', 1, 3],
      ['c', 2, 3],
      ['d', 4, 1],
      ['', 4, 2],
    ]);
  });

  it('counts a Windows line break as one new line without errors', () => {
    const { tokens, errors } = scan('a\r\nb');

    expect(errors).toEqual([]);
    expect(tokens[1]).toMatchObject({ lexeme: 'b', line: 2, column: 1 });
  });

  it('puts EOF on the next line after the last new line', () => {
    expect(scan('a\n').tokens[1]).toMatchObject({
      type: 'EOF',
      line: 2,
      column: 1,
    });
  });
});

describe('scan: errors', () => {
  it('reports a bad character and continues', () => {
    const { tokens, errors } = scan('1 @ 2 # 3');

    expect(tokens.map((token) => token.type)).toEqual([
      'NUMBER',
      'NUMBER',
      'NUMBER',
      'EOF',
    ]);
    expect(errors).toEqual([
      { line: 1, column: 3, where: '', message: 'Unexpected character.' },
      { line: 1, column: 7, where: '', message: 'Unexpected character.' },
    ]);
  });

  it('reports a letter outside a to z as a bad character', () => {
    const { tokens, errors } = scan(String.fromCharCode(233));

    expect(tokens.map((token) => token.type)).toEqual(['EOF']);
    expect(errors).toEqual([
      { line: 1, column: 1, where: '', message: 'Unexpected character.' },
    ]);
  });

  it('reports the correct line number of an error', () => {
    const { errors } = scan('1\n2\n  ^');

    expect(errors.map(formatCompileError)).toEqual([
      '[line 3] Error: Unexpected character.',
    ]);
  });
});

describe('scan on official tests', () => {
  const suiteDirectory = fileURLToPath(
    new URL('../official/suite/', import.meta.url),
  );
  const files = readdirSync(suiteDirectory, {
    recursive: true,
    encoding: 'utf8',
  })
    .filter((path) => path.endsWith('.lox'))
    .sort();
  const scannerErrorPattern =
    /^\[\d+\] Error: (Unexpected character\.|Unterminated string\.)$/;

  it('ends every file with one EOF', () => {
    for (const file of files) {
      const { tokens } = scan(readFileSync(join(suiteDirectory, file), 'utf8'));
      const eofCount = tokens.filter((token) => token.type === 'EOF').length;

      expect(eofCount, file).toBe(1);
      expect(tokens[tokens.length - 1]?.type, file).toBe('EOF');
    }
  });

  it('reports the same scanner errors as the book', () => {
    let filesWithScannerErrors = 0;

    for (const file of files) {
      const source = readFileSync(join(suiteDirectory, file), 'utf8');
      const expected = parseExpectations(source)
        .compileErrors.filter((error) => scannerErrorPattern.test(error))
        .sort();
      const actual = scan(source)
        .errors.map((error) => `[${error.line}] Error: ${error.message}`)
        .sort();

      expect(actual, file).toEqual(expected);
      if (expected.length > 0) {
        filesWithScannerErrors += 1;
      }
    }

    expect(filesWithScannerErrors).toBeGreaterThan(0);
  });
});
