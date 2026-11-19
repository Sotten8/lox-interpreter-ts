import { formatCompileError, formatRuntimeError } from './errors';
import { Interpreter } from './runtime/interpreter';
import { parse } from './syntax/parser';
import { scan } from './syntax/scanner';

export type ExitCode = 0 | 65 | 70;

export interface RunResult {
  readonly output: readonly string[];
  readonly errors: readonly string[];
  readonly exitCode: ExitCode;
}

export function run(source: string): RunResult {
  const scanned = scan(source);
  const parsed = parse(scanned.tokens);
  const compileErrors = [...scanned.errors, ...parsed.errors];

  if (compileErrors.length > 0) {
    return {
      output: [],
      errors: compileErrors.map(formatCompileError),
      exitCode: 65,
    };
  }

  const output: string[] = [];
  const interpreter = new Interpreter((line) => output.push(line));
  const error = interpreter.interpret(parsed.statements);

  const result: RunResult =
    error !== null
      ? { output, errors: [formatRuntimeError(error)], exitCode: 70 }
      : { output, errors: [], exitCode: 0 };

  return result;
}
