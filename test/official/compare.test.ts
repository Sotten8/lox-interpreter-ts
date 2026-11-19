import { describe, expect, it } from 'vitest';
import { run, type RunResult } from '../../src/run';
import { findMismatches } from './compare';
import { parseExpectations, type Expectations } from './expectations';

const expectations = (overrides: Partial<Expectations> = {}): Expectations => ({
  nonTest: false,
  output: [],
  compileErrors: [],
  runtimeError: null,
  exitCode: 0,
  ...overrides,
});

const result = (overrides: Partial<RunResult> = {}): RunResult => ({
  output: [],
  errors: [],
  exitCode: 0,
  ...overrides,
});

const check = (source: string): string[] =>
  findMismatches(parseExpectations(source), run(source));

describe('findMismatches: output and exit code', () => {
  it('finds nothing when output and exit code match', () => {
    expect(
      findMismatches(
        expectations({ output: ['1', '2'] }),
        result({ output: ['1', '2'] }),
      ),
    ).toEqual([]);
    expect(findMismatches(expectations(), result())).toEqual([]);
  });

  it('compares the lines of a printed value that contains newlines', () => {
    expect(
      findMismatches(
        expectations({ output: ['1', '2', '3', 'end'] }),
        result({ output: ['1\n2\n3', 'end'] }),
      ),
    ).toEqual([]);
    expect(
      findMismatches(
        expectations({ output: ['a', '', 'b'] }),
        result({ output: ['a\n\nb'] }),
      ),
    ).toEqual([]);
    expect(
      findMismatches(
        expectations({ output: ['1', '2'] }),
        result({ output: ['1\n3'] }),
      ),
    ).toEqual(['Output differs at line 2: expected "2", got "3"']);
  });

  it('reports every line where output differs', () => {
    expect(
      findMismatches(
        expectations({ output: ['1', '2', '3'] }),
        result({ output: ['1', 'x', 'y'] }),
      ),
    ).toEqual([
      'Output differs at line 2: expected "2", got "x"',
      'Output differs at line 3: expected "3", got "y"',
    ]);
    expect(
      findMismatches(
        expectations({ output: ['1', '2', '3'] }),
        result({ output: ['3', '2', '1'] }),
      ),
    ).toEqual([
      'Output differs at line 1: expected "1", got "3"',
      'Output differs at line 3: expected "3", got "1"',
    ]);
  });

  describe('with many differing lines', () => {
    const differing = (count: number): string[] => {
      const lines = Array.from({ length: count }, (_, index) => `${index}`);
      return findMismatches(
        expectations({ output: lines.map((line) => `a${line}`) }),
        result({ output: lines.map((line) => `b${line}`) }),
      );
    };

    it('lists up to five lines and nothing more', () => {
      const mismatches = differing(5);

      expect(mismatches).toHaveLength(5);
      expect(mismatches[4]).toBe(
        'Output differs at line 5: expected "a4", got "b4"',
      );
    });

    it('shows five lines and counts the rest', () => {
      const mismatches = differing(6);

      expect(mismatches).toHaveLength(6);
      expect(mismatches[4]).toBe(
        'Output differs at line 5: expected "a4", got "b4"',
      );
      expect(mismatches[5]).toBe('... and 1 more');
      expect(differing(9)[5]).toBe('... and 4 more');
    });
  });

  it('reports missing, extra and empty output lines', () => {
    expect(
      findMismatches(
        expectations({ output: ['1', '2'] }),
        result({ output: ['1'] }),
      ),
    ).toEqual(['Output differs at line 2: expected "2", got nothing']);
    expect(
      findMismatches(
        expectations({ output: ['1'] }),
        result({ output: ['1', '2'] }),
      ),
    ).toEqual(['Output differs at line 2: expected nothing, got "2"']);
    expect(findMismatches(expectations({ output: [''] }), result())).toEqual([
      'Output differs at line 1: expected "", got nothing',
    ]);
  });

  it('reports a wrong exit code', () => {
    expect(findMismatches(expectations(), result({ exitCode: 70 }))).toEqual([
      'Expected exit code 0, got 70',
    ]);
  });
});

describe('findMismatches: compile errors', () => {
  const unexpected = expectations({
    compileErrors: ['[1] Error: Unexpected character.'],
    exitCode: 65,
  });

  it('matches errors after turning [line N] into [N]', () => {
    expect(
      findMismatches(
        unexpected,
        result({
          errors: ['[line 1] Error: Unexpected character.'],
          exitCode: 65,
        }),
      ),
    ).toEqual([]);
    expect(
      findMismatches(
        expectations({ compileErrors: ['[12] Error: a.'], exitCode: 65 }),
        result({ errors: ['[line 12] Error: a.'], exitCode: 65 }),
      ),
    ).toEqual([]);
  });

  it('ignores the order of errors', () => {
    const two = expectations({
      compileErrors: ['[1] Error: a.', '[2] Error: b.'],
      exitCode: 65,
    });
    const reversed = expectations({
      compileErrors: ['[2] Error: b.', '[1] Error: a.'],
      exitCode: 65,
    });

    expect(
      findMismatches(
        two,
        result({
          errors: ['[line 2] Error: b.', '[line 1] Error: a.'],
          exitCode: 65,
        }),
      ),
    ).toEqual([]);
    expect(
      findMismatches(
        reversed,
        result({
          errors: ['[line 1] Error: a.', '[line 2] Error: b.'],
          exitCode: 65,
        }),
      ),
    ).toEqual([]);
  });

  it('reports errors that do not match', () => {
    expect(
      findMismatches(
        unexpected,
        result({
          errors: ['[line 2] Error: Unexpected character.'],
          exitCode: 65,
        }),
      ),
    ).toEqual([
      'Expected errors ["[1] Error: Unexpected character."], got ["[2] Error: Unexpected character."]',
    ]);
    expect(
      findMismatches(
        unexpected,
        result({ errors: ['Unexpected character.'], exitCode: 65 }),
      ),
    ).toEqual([
      'Expected errors ["[1] Error: Unexpected character."], got ["Unexpected character."]',
    ]);
    expect(findMismatches(unexpected, result({ exitCode: 65 }))).toEqual([
      'Expected errors ["[1] Error: Unexpected character."], got []',
    ]);
  });

  it('counts a repeated error', () => {
    expect(
      findMismatches(
        unexpected,
        result({
          errors: [
            '[line 1] Error: Unexpected character.',
            '[line 1] Error: Unexpected character.',
          ],
          exitCode: 65,
        }),
      ),
    ).toEqual([
      'Expected errors ["[1] Error: Unexpected character."], got ["[1] Error: Unexpected character.","[1] Error: Unexpected character."]',
    ]);
  });

  it('reports an error nobody expected', () => {
    expect(
      findMismatches(
        expectations(),
        result({ errors: ['[line 1] Error: Boom.'], exitCode: 65 }),
      ),
    ).toEqual([
      'Expected exit code 0, got 65',
      'Expected errors [], got ["[1] Error: Boom."]',
    ]);
  });
});

describe('findMismatches: runtime errors', () => {
  const failing = expectations({
    output: ['1'],
    runtimeError: { line: 2, message: 'Operand must be a number.' },
    exitCode: 70,
  });

  it('matches the message and the line', () => {
    expect(
      findMismatches(
        failing,
        result({
          output: ['1'],
          errors: ['Operand must be a number.\n[line 2]'],
          exitCode: 70,
        }),
      ),
    ).toEqual([]);
  });

  it('reports a wrong line or a wrong message', () => {
    expect(
      findMismatches(
        failing,
        result({
          output: ['1'],
          errors: ['Operand must be a number.\n[line 3]'],
          exitCode: 70,
        }),
      ),
    ).toEqual([
      'Expected errors ["Operand must be a number.\\n[line 2]"], got ["Operand must be a number.\\n[line 3]"]',
    ]);
    expect(
      findMismatches(
        failing,
        result({
          output: ['1'],
          errors: ['Operands must be numbers.\n[line 2]'],
          exitCode: 70,
        }),
      ),
    ).toEqual([
      'Expected errors ["Operand must be a number.\\n[line 2]"], got ["Operands must be numbers.\\n[line 2]"]',
    ]);
  });

  it('reports a program that finished without the error', () => {
    expect(findMismatches(failing, result({ output: ['1'] }))).toEqual([
      'Expected exit code 70, got 0',
      'Expected errors ["Operand must be a number.\\n[line 2]"], got []',
    ]);
  });
});

describe('findMismatches: annotated programs', () => {
  it('passes a program with the expected compile error', () => {
    expect(check("print ; // Error at ';': Expect expression.\n")).toEqual([]);
  });

  it('passes a program with the expected runtime error', () => {
    expect(
      check(
        'print 1; // expect: 1\nprint -"a"; // expect runtime error: Operand must be a number.\n',
      ),
    ).toEqual([]);
  });

  it('fails a program: its output is not what the comment says', () => {
    expect(check('print 1 + 2; // expect: 4\n')).toEqual([
      'Output differs at line 1: expected "4", got "3"',
    ]);
  });
});
