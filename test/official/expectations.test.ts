import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseExpectations } from "./expectations";

const lines = (...parts: string[]): string => parts.join("\n");

describe("parseExpectations", () => {
  it("returns an empty result without annotations", () => {
    const result = parseExpectations("print 1;");

    expect(result).toEqual({
      nonTest: false,
      output: [],
      compileErrors: [],
      runtimeError: null,
      exitCode: 0,
    });
  });

  it("collects output lines in order", () => {
    const source = lines(
      "print 1; // expect: 1",
      "print 2; // expect: 2",
      "print 3; // expect: three",
    );

    expect(parseExpectations(source).output).toEqual(["1", "2", "three"]);
  });

  it("accepts expect without a space after the colon", () => {
    expect(parseExpectations("print 7; // expect:7").output).toEqual(["7"]);
  });

  it("treats an empty expect as an empty output line", () => {
    expect(parseExpectations('print ""; // expect: ').output).toEqual([""]);
  });

  it("records a compile error and exit code 65", () => {
    const source = lines(
      "print 1;",
      "",
      "print +; // Error at '+': Expect expression.",
    );

    const result = parseExpectations(source);

    expect(result.compileErrors).toEqual([
      "[3] Error at '+': Expect expression.",
    ]);
    expect(result.exitCode).toBe(65);
  });

  it("takes the line from a line-tagged error", () => {
    const source = lines(
      "// [line 2] Error at 'false': Expect variable name.",
      'var false = "value";',
    );

    expect(parseExpectations(source).compileErrors).toEqual([
      "[2] Error at 'false': Expect variable name.",
    ]);
  });

  it("applies java-tagged errors and ignores c-tagged ones", () => {
    const source = lines(
      "// [java line 4] Error at ')': Expect expression.",
      "// [c line 5] Error at ')': Expect expression (c).",
    );

    expect(parseExpectations(source).compileErrors).toEqual([
      "[4] Error at ')': Expect expression.",
    ]);
  });

  it("records a runtime error and exit code 70", () => {
    const source = lines(
      "var a = 1;",
      "",
      "a + nil; // expect runtime error: Operands must be two numbers or two strings.",
    );

    const result = parseExpectations(source);

    expect(result.runtimeError).toEqual({
      line: 3,
      message: "Operands must be two numbers or two strings.",
    });
    expect(result.exitCode).toBe(70);
  });

  it("keeps output alongside a runtime error", () => {
    const source = lines(
      "print 1; // expect: 1",
      "nil(); // expect runtime error: Can only call functions and classes.",
    );

    const result = parseExpectations(source);

    expect(result.output).toEqual(["1"]);
    expect(result.exitCode).toBe(70);
  });

  it("marks a nontest file", () => {
    const source = lines("// nontest", "print 1; // expect: 1");

    expect(parseExpectations(source)).toEqual({
      nonTest: true,
      output: [],
      compileErrors: [],
      runtimeError: null,
      exitCode: 0,
    });
  });

  it("rejects both compile and runtime errors in one file", () => {
    const source = lines(
      "print +; // Error at '+': Expect expression.",
      "nil(); // expect runtime error: Can only call functions and classes.",
    );

    expect(() => parseExpectations(source)).toThrow(
      "Test expects both a compile error and a runtime error",
    );
  });
});

describe("parseExpectations on the official suite", () => {
  const suiteDirectory = fileURLToPath(new URL("./suite/", import.meta.url));
  const files = readdirSync(suiteDirectory, {
    recursive: true,
    encoding: "utf8",
  })
    .filter((path) => path.endsWith(".lox"))
    .sort();
  const parse = (file: string) =>
    parseExpectations(readFileSync(join(suiteDirectory, file), "utf8"));

  it("finds the official files", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("parses every file without throwing", () => {
    for (const file of files) {
      expect(() => parse(file), file).not.toThrow();
    }
  });

  it("yields all three exit codes", () => {
    const exitCodes = new Set(files.map((file) => parse(file).exitCode));

    expect([...exitCodes].sort((a, b) => a - b)).toEqual([0, 65, 70]);
  });

  it("parses precedence.lox", () => {
    expect(parse("precedence.lox")).toEqual({
      nonTest: false,
      output: [
        "14",
        "8",
        "4",
        "0",
        "true",
        "true",
        "true",
        "true",
        "0",
        "0",
        "0",
        "0",
        "4",
      ],
      compileErrors: [],
      runtimeError: null,
      exitCode: 0,
    });
  });

  it("parses operator/add_bool_nil.lox", () => {
    expect(parse("operator/add_bool_nil.lox")).toEqual({
      nonTest: false,
      output: [],
      compileErrors: [],
      runtimeError: {
        line: 1,
        message: "Operands must be two numbers or two strings.",
      },
      exitCode: 70,
    });
  });

  it("parses variable/use_false_as_var.lox", () => {
    expect(parse("variable/use_false_as_var.lox")).toEqual({
      nonTest: false,
      output: [],
      compileErrors: ["[2] Error at 'false': Expect variable name."],
      runtimeError: null,
      exitCode: 65,
    });
  });

  it("parses unexpected_character.lox", () => {
    expect(parse("unexpected_character.lox")).toEqual({
      nonTest: false,
      output: [],
      compileErrors: [
        "[3] Error: Unexpected character.",
        "[3] Error at 'b': Expect ')' after arguments.",
      ],
      runtimeError: null,
      exitCode: 65,
    });
  });

  it("counts all annotations in the suite", () => {
    const all = files.map(parse);

    expect(all.reduce((sum, e) => sum + e.output.length, 0)).toBe(504);
    expect(all.reduce((sum, e) => sum + e.compileErrors.length, 0)).toBe(61);
    expect(all.filter((e) => e.runtimeError !== null).length).toBe(62);
  });
});
