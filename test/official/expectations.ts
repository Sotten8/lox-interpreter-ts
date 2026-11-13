export type ExpectedExitCode = 0 | 65 | 70;

export interface RuntimeErrorExpectation {
  readonly line: number;
  readonly message: string;
}

export interface Expectations {
  readonly nonTest: boolean;
  readonly output: readonly string[];
  readonly compileErrors: readonly string[];
  readonly runtimeError: RuntimeErrorExpectation | null;
  readonly exitCode: ExpectedExitCode;
}

const IMPLEMENTATION = "java";

const OUTPUT_PATTERN = /\/\/ expect: ?(.*)/;
const COMPILE_ERROR_PATTERN = /\/\/ (Error.*)/;
const COMPILE_ERROR_LINE_PATTERN = /\/\/ \[((java|c) )?line (\d+)\] (Error.*)/;
const RUNTIME_ERROR_PATTERN = /\/\/ expect runtime error: (.+)/;
const NON_TEST_PATTERN = /\/\/ nontest/;

export function parseExpectations(source: string): Expectations {
  const output: string[] = [];
  const compileErrors: string[] = [];
  let runtimeError: RuntimeErrorExpectation | null = null;

  for (const [index, text] of source.split("\n").entries()) {
    const lineNumber = index + 1;

    if (NON_TEST_PATTERN.test(text)) {
      return {
        nonTest: true,
        output: [],
        compileErrors: [],
        runtimeError: null,
        exitCode: 0,
      };
    }

    const outputMatch = OUTPUT_PATTERN.exec(text);
    if (outputMatch !== null) {
      output.push(outputMatch[1] ?? "");
      continue;
    }

    const errorMatch = COMPILE_ERROR_PATTERN.exec(text);
    if (errorMatch !== null) {
      compileErrors.push(`[${lineNumber}] ${errorMatch[1] ?? ""}`);
      continue;
    }

    const errorLineMatch = COMPILE_ERROR_LINE_PATTERN.exec(text);
    if (errorLineMatch !== null) {
      const implementation = errorLineMatch[2];
      if (implementation === undefined || implementation === IMPLEMENTATION) {
        compileErrors.push(
          `[${errorLineMatch[3] ?? ""}] ${errorLineMatch[4] ?? ""}`,
        );
      }
      continue;
    }

    const runtimeMatch = RUNTIME_ERROR_PATTERN.exec(text);
    if (runtimeMatch !== null) {
      runtimeError = { line: lineNumber, message: runtimeMatch[1] ?? "" };
    }
  }

  if (runtimeError !== null && compileErrors.length > 0) {
    throw new Error("Test expects both a compile error and a runtime error");
  }

  let exitCode: ExpectedExitCode = 0;
  if (compileErrors.length > 0) {
    exitCode = 65;
  } else if (runtimeError !== null) {
    exitCode = 70;
  }

  return { nonTest: false, output, compileErrors, runtimeError, exitCode };
}
