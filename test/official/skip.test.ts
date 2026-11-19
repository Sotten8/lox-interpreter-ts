import { describe, expect, it } from 'vitest';
import { SKIPPED, skipReason } from './skip';

describe('skipReason', () => {
  const entries = new Map([
    ['block', 'directory reason'],
    ['variable/use.lox', 'file reason'],
  ]);

  it('matches a directory entry to every file under it', () => {
    expect(skipReason('block/a.lox', entries)).toBe('directory reason');
    expect(skipReason('block/deeper/b.lox', entries)).toBe('directory reason');
  });

  it('matches a file entry only to that file', () => {
    expect(skipReason('variable/use.lox', entries)).toBe('file reason');
    expect(skipReason('variable/other.lox', entries)).toBeUndefined();
  });

  it('does not match a longer name or a nested directory of that name', () => {
    expect(skipReason('blocks/a.lox', entries)).toBeUndefined();
    expect(skipReason('block.lox', entries)).toBeUndefined();
    expect(skipReason('other/block/a.lox', entries)).toBeUndefined();
  });

  it('gives a reason for every entry of the real list', () => {
    for (const [entry, reason] of SKIPPED) {
      expect(reason.trim(), entry).not.toBe('');
    }
  });
});
