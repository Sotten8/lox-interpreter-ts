import fc from 'fast-check';
import { describe, it } from 'vitest';
import { resolve } from '../../src/resolver/resolver';
import { Interpreter } from '../../src/runtime/interpreter';
import { stringify } from '../../src/runtime/values';
import { parse } from '../../src/syntax/parser';
import { scan } from '../../src/syntax/scanner';

const OPERATORS = ['+', '-', '*', '/'] as const;

type Operator = (typeof OPERATORS)[number];

type Tree = number | { op: Operator; left: Tree; right: Tree };

const operator = fc.constantFrom<Operator>(...OPERATORS);

const number = fc.integer({ min: 0, max: 20 });

const tree: fc.Arbitrary<Tree> = fc.letrec<{ tree: Tree }>((tie) => ({
  tree: fc.oneof(
    { depthSize: 'small', withCrossShrink: true },
    number,
    fc.record({ op: operator, left: tie('tree'), right: tie('tree') }),
  ),
})).tree;

const withParentheses = (node: Tree): string =>
  typeof node === 'number'
    ? String(node)
    : `(${withParentheses(node.left)} ${node.op} ${withParentheses(node.right)})`;

const flat = fc
  .tuple(
    number,
    fc.array(fc.tuple(operator, number), { minLength: 1, maxLength: 8 }),
  )
  .map(([first, rest]) =>
    [String(first), ...rest.map(([op, value]) => `${op} ${value}`)].join(' '),
  );

const loxOutput = (expression: string): string[] => {
  const lines: string[] = [];
  const { statements } = parse(scan(`print ${expression};`).tokens);
  new Interpreter((line) => lines.push(line)).interpret(
    statements,
    resolve(statements).locals,
  );
  return lines;
};

const javaScriptResult = (expression: string): string[] => [
  stringify(new Function(`return ${expression};`)() as number),
];

describe('interpret: properties', () => {
  it('matches JavaScript on flat expressions', () => {
    fc.assert(
      fc.property(flat, (expression) => {
        const expected = javaScriptResult(expression);
        const actual = loxOutput(expression);

        return actual.length === 1 && actual[0] === expected[0];
      }),
      { numRuns: 1000 },
    );
  });

  it('matches JavaScript on fully parenthesized expressions', () => {
    fc.assert(
      fc.property(tree, (node) => {
        const expression = withParentheses(node);
        const expected = javaScriptResult(expression);
        const actual = loxOutput(expression);

        return actual.length === 1 && actual[0] === expected[0];
      }),
      { numRuns: 1000 },
    );
  });
});
