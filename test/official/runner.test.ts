import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { listSuiteFiles, runSuiteFile } from './runner';

const roots: string[] = [];

afterAll(() => {
  for (const root of roots) {
    rmSync(root, { recursive: true, force: true });
  }
});

const makeSuite = (files: Record<string, string>): string => {
  const root = mkdtempSync(join(tmpdir(), 'lox-runner-'));
  roots.push(root);
  for (const [path, source] of Object.entries(files)) {
    const target = join(root, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, source);
  }
  return root;
};

describe('listSuiteFiles', () => {
  it('lists only .lox files of every level, sorted, with forward slashes', () => {
    const root = makeSuite({
      'a.lox': '',
      'B.lox': '',
      'notes.txt': '',
      'nested/deeper/c.lox': '',
    });

    expect(listSuiteFiles(root)).toEqual([
      'B.lox',
      'a.lox',
      'nested/deeper/c.lox',
    ]);
  });
});

describe('runSuiteFile', () => {
  it('passes a file whose result matches its annotations', () => {
    const root = makeSuite({ 'ok.lox': 'print 1 + 2; // expect: 3\n' });

    expect(runSuiteFile('ok.lox', root)).toEqual({
      path: 'ok.lox',
      verdict: 'passed',
      mismatches: [],
    });
  });

  it('fails a file whose result differs and lists the mismatches', () => {
    const root = makeSuite({ 'bad.lox': 'print 1; // expect: 2\n' });

    expect(runSuiteFile('bad.lox', root)).toEqual({
      path: 'bad.lox',
      verdict: 'failed',
      mismatches: ['Output differs at line 1: expected "2", got "1"'],
    });
  });

  it('does not run a file marked nontest', () => {
    const root = makeSuite({ 'skip.lox': '// nontest\nprint ;\n' });

    expect(runSuiteFile('skip.lox', root)).toEqual({
      path: 'skip.lox',
      verdict: 'nontest',
      mismatches: [],
    });
  });

  it('reports a file with contradicting annotations as a crash', () => {
    const root = makeSuite({
      'both.lox':
        'print ; // Error at \';\': Expect expression.\nprint -"a"; // expect runtime error: Operand must be a number.\n',
    });

    expect(runSuiteFile('both.lox', root)).toEqual({
      path: 'both.lox',
      verdict: 'failed',
      mismatches: [
        'Crashed: Test expects both a compile error and a runtime error',
      ],
    });
  });
});
