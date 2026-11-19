import { describe, expect, it } from 'vitest';
import { listSuiteFiles, runSuiteFile } from './runner';
import { matchesEntry, SKIPPED, skipReason } from './skip';

const files = listSuiteFiles();

describe('official suite', () => {
  for (const path of files) {
    const reason = skipReason(path);
    if (reason === undefined) {
      it(path, () => {
        expect(runSuiteFile(path).mismatches).toEqual([]);
      });
    } else {
      it.skip(`${path} (${reason})`, () => {});
    }
  }
});

describe('official suite: skip list', () => {
  it('has only entries that match a file', () => {
    const unused = [...SKIPPED.keys()].filter(
      (entry) => !files.some((path) => matchesEntry(path, entry)),
    );

    expect(unused).toEqual([]);
  });

  it('has only files that still fail', () => {
    const passing = files.filter(
      (path) =>
        skipReason(path) !== undefined &&
        runSuiteFile(path).verdict !== 'failed',
    );

    expect(passing).toEqual([]);
  });
});
