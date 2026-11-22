import {
  formatCompileError,
  formatRuntimeError,
  type CompileError,
} from './common/errors';
import { resolve } from './resolver/resolver';
import { Interpreter } from './interpreter/interpreter';
import { printStmt } from './syntax/ast-printer';
import { parse, type ParseResult } from './syntax/parser';
import { scan } from './syntax/scanner';

export type ExitCode = 0 | 65 | 70;

export interface RunResult {
  readonly output: readonly string[];
  readonly errors: readonly string[];
  readonly exitCode: ExitCode;
}

export interface RunOptions {
  readonly maxCallDepth?: number;
}

function compileFailure(errors: readonly CompileError[]): RunResult {
  return { output: [], errors: errors.map(formatCompileError), exitCode: 65 };
}

function scanAndParse(source: string): ParseResult {
  const scanned = scan(source);
  const parsed = parse(scanned.tokens);
  return {
    statements: parsed.statements,
    errors: [...scanned.errors, ...parsed.errors],
  };
}

export function printAst(source: string): RunResult {
  const parsed = scanAndParse(source);

  if (parsed.errors.length > 0) {
    return compileFailure(parsed.errors);
  }

  return { output: parsed.statements.map(printStmt), errors: [], exitCode: 0 };
}

export function run(source: string, options: RunOptions = {}): RunResult {
  const parsed = scanAndParse(source);

  if (parsed.errors.length > 0) {
    return compileFailure(parsed.errors);
  }

  const resolved = resolve(parsed.statements);

  if (resolved.errors.length > 0) {
    return compileFailure(resolved.errors);
  }

  const output: string[] = [];
  const interpreter = new Interpreter(
    (line) => output.push(line),
    options.maxCallDepth,
  );
  const error = interpreter.interpret(parsed.statements, resolved.locals);

  const result: RunResult =
    error !== null
      ? { output, errors: [formatRuntimeError(error)], exitCode: 70 }
      : { output, errors: [], exitCode: 0 };

  return result;
}
