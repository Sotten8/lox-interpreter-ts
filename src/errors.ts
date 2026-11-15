export interface CompileError {
  readonly line: number;
  readonly column: number;
  readonly where: string;
  readonly message: string;
}

export function formatCompileError(error: CompileError): string {
  const where = error.where === '' ? '' : ` ${error.where}`;
  return `[line ${error.line}] Error${where}: ${error.message}`;
}
