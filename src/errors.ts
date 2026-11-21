import type { Token } from './syntax/token';

export interface CompileError {
  readonly line: number;
  readonly column: number;
  readonly where: string;
  readonly message: string;
}

export function compileErrorAt(token: Token, message: string): CompileError {
  const where = token.type === 'EOF' ? 'at end' : `at '${token.lexeme}'`;
  return { line: token.line, column: token.column, where, message };
}

export function formatCompileError(error: CompileError): string {
  const where = error.where === '' ? '' : ` ${error.where}`;
  return `[line ${error.line}] Error${where}: ${error.message}`;
}

export class RuntimeError extends Error {
  readonly line: number;

  constructor(line: number, message: string) {
    super(message);
    this.line = line;
  }
}

export function formatRuntimeError(error: RuntimeError): string {
  return `${error.message}\n[line ${error.line}]`;
}
