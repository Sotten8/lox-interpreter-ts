import { readFileSync } from 'node:fs';
import { printAst, run } from './run';

export type Write = (text: string) => void;

export function cli(
  args: readonly string[],
  stdout: Write,
  stderr: Write,
): number {
  const astMode = args[0] === '--ast';
  const [path, ...rest] = astMode ? args.slice(1) : args;

  if (path === undefined || rest.length > 0) {
    stderr('Usage: lox [--ast] <script>\n');
    return 64;
  }

  let source: string;
  try {
    source = readFileSync(path, 'utf8');
  } catch {
    stderr(`Cannot read file '${path}'.\n`);
    return 66;
  }

  const result = astMode ? printAst(source) : run(source);
  for (const line of result.output) {
    stdout(`${line}\n`);
  }
  for (const error of result.errors) {
    stderr(`${error}\n`);
  }
  return result.exitCode;
}
