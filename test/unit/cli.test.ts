import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cli } from '../../src/cli';

interface Outcome {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

let directory = '';
let scripts = 0;

beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), 'lox-cli-'));
});

afterAll(() => {
  rmSync(directory, { recursive: true, force: true });
});

const scriptWith = (source: string): string => {
  scripts += 1;
  const path = join(directory, `program-${scripts}.lox`);
  writeFileSync(path, source);
  return path;
};

const runCli = (args: string[]): Outcome => {
  let stdout = '';
  let stderr = '';
  const code = cli(
    args,
    (text) => {
      stdout += text;
    },
    (text) => {
      stderr += text;
    },
  );
  return { code, stdout, stderr };
};

describe('cli', () => {
  it('prints the output of the script to stdout and exits with 0', () => {
    expect(runCli([scriptWith('print 1;\nprint "two";')])).toEqual({
      code: 0,
      stdout: '1\ntwo\n',
      stderr: '',
    });
  });

  it('prints compile errors to stderr and exits with 65', () => {
    expect(runCli([scriptWith('print ;')])).toEqual({
      code: 65,
      stdout: '',
      stderr: "[line 1] Error at ';': Expect expression.\n",
    });
  });

  it('prints a runtime error to stderr and exits with 70', () => {
    expect(runCli([scriptWith('print 1;\nprint -nil;')])).toEqual({
      code: 70,
      stdout: '1\n',
      stderr: 'Operand must be a number.\n[line 2]\n',
    });
  });

  it('prints the usage and exits with 64 without one script', () => {
    const usage = { code: 64, stdout: '', stderr: 'Usage: lox <script>\n' };

    expect(runCli([])).toEqual(usage);
    expect(runCli([scriptWith('print 1;'), scriptWith('print 2;')])).toEqual(
      usage,
    );
  });

  it('exits with 66 when the script cannot be read', () => {
    const path = join(directory, 'missing.lox');

    expect(runCli([path])).toEqual({
      code: 66,
      stdout: '',
      stderr: `Cannot read file '${path}'.\n`,
    });
  });
});
