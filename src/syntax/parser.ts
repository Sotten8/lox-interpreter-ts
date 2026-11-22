import type { Expr, FunctionStmt, Stmt, VariableExpr } from './ast';
import { compileErrorAt, type CompileError } from '../common/errors';
import type { Token, TokenType } from './token';

export interface ParseResult {
  readonly statements: readonly Stmt[];
  readonly errors: readonly CompileError[];
}

class ParseError extends Error {}

class NestingError extends Error {}

export const MAX_NESTING = 100;

const STATEMENT_KEYWORDS: ReadonlySet<TokenType> = new Set<TokenType>([
  'CLASS',
  'FUN',
  'VAR',
  'FOR',
  'IF',
  'WHILE',
  'PRINT',
  'RETURN',
]);

class Parser {
  private readonly tokens: readonly Token[];
  private readonly errors: CompileError[] = [];
  private current = 0;
  private depth = 0;

  constructor(tokens: readonly Token[]) {
    this.tokens = tokens;
  }

  parse(): ParseResult {
    const statements: Stmt[] = [];
    try {
      while (!this.isAtEnd()) {
        const statement = this.declaration();
        if (statement !== null) {
          statements.push(statement);
        }
      }
    } catch (error) {
      if (!(error instanceof NestingError)) {
        throw error;
      }
    }
    return { statements, errors: this.errors };
  }

  private declaration(): Stmt | null {
    try {
      if (this.match('CLASS')) {
        return this.classDeclaration();
      }
      if (this.match('FUN')) {
        return this.functionDeclaration('function');
      }
      if (this.match('VAR')) {
        return this.varDeclaration();
      }
      return this.statement();
    } catch (error) {
      if (error instanceof ParseError) {
        this.synchronize();
        return null;
      }
      throw error;
    }
  }

  private classDeclaration(): Stmt {
    const name = this.consume('IDENTIFIER', 'Expect class name.');
    let superclass: VariableExpr | null = null;
    if (this.match('LESS')) {
      superclass = {
        kind: 'variable',
        name: this.consume('IDENTIFIER', 'Expect superclass name.'),
      };
    }
    this.consume('LEFT_BRACE', "Expect '{' before class body.");
    const methods: FunctionStmt[] = [];
    while (!this.check('RIGHT_BRACE') && !this.isAtEnd()) {
      methods.push(this.functionDeclaration('method'));
    }
    this.consume('RIGHT_BRACE', "Expect '}' after class body.");
    return { kind: 'class', name, superclass, methods };
  }

  private functionDeclaration(kind: 'function' | 'method'): FunctionStmt {
    const name = this.consume('IDENTIFIER', `Expect ${kind} name.`);
    this.consume('LEFT_PAREN', `Expect '(' after ${kind} name.`);
    const params = this.commaSeparated(
      () => this.consume('IDENTIFIER', 'Expect parameter name.'),
      "Can't have more than 255 parameters.",
    );
    this.consume('RIGHT_PAREN', "Expect ')' after parameters.");
    this.consume('LEFT_BRACE', `Expect '{' before ${kind} body.`);
    const body = this.block();
    return { kind: 'function', name, params, body };
  }

  private varDeclaration(): Stmt {
    const name = this.consume('IDENTIFIER', 'Expect variable name.');
    const initializer = this.match('EQUAL') ? this.expression() : null;
    this.consume('SEMICOLON', "Expect ';' after variable declaration.");
    return { kind: 'var', name, initializer };
  }

  private statement(): Stmt {
    if (this.match('FOR')) {
      return this.forStatement();
    }
    if (this.match('IF')) {
      return this.ifStatement();
    }
    if (this.match('WHILE')) {
      return this.whileStatement();
    }
    if (this.match('PRINT')) {
      return this.printStatement();
    }
    if (this.match('RETURN')) {
      return this.returnStatement();
    }
    if (this.match('LEFT_BRACE')) {
      return { kind: 'block', statements: this.block() };
    }
    return this.expressionStatement();
  }

  private block(): Stmt[] {
    return this.nested(() => {
      const statements: Stmt[] = [];
      while (!this.check('RIGHT_BRACE') && !this.isAtEnd()) {
        const statement = this.declaration();
        if (statement !== null) {
          statements.push(statement);
        }
      }
      this.consume('RIGHT_BRACE', "Expect '}' after block.");
      return statements;
    });
  }

  private innerStatement(): Stmt {
    return this.nested(() => this.statement());
  }

  private ifStatement(): Stmt {
    this.consume('LEFT_PAREN', "Expect '(' after 'if'.");
    const condition = this.expression();
    this.consume('RIGHT_PAREN', "Expect ')' after if condition.");
    const thenBranch = this.innerStatement();
    const elseBranch = this.match('ELSE') ? this.innerStatement() : null;
    return { kind: 'if', condition, thenBranch, elseBranch };
  }

  private whileStatement(): Stmt {
    this.consume('LEFT_PAREN', "Expect '(' after 'while'.");
    const condition = this.expression();
    this.consume('RIGHT_PAREN', "Expect ')' after condition.");
    const body = this.innerStatement();
    return { kind: 'while', condition, body };
  }

  private forStatement(): Stmt {
    this.consume('LEFT_PAREN', "Expect '(' after 'for'.");

    let initializer: Stmt | null;
    if (this.match('SEMICOLON')) {
      initializer = null;
    } else if (this.match('VAR')) {
      initializer = this.varDeclaration();
    } else {
      initializer = this.expressionStatement();
    }

    let condition: Expr = { kind: 'literal', value: true };
    if (!this.check('SEMICOLON')) {
      condition = this.expression();
    }
    this.consume('SEMICOLON', "Expect ';' after loop condition.");

    let increment: Expr | null = null;
    if (!this.check('RIGHT_PAREN')) {
      increment = this.expression();
    }
    this.consume('RIGHT_PAREN', "Expect ')' after for clauses.");

    let body = this.innerStatement();
    if (increment !== null) {
      body = {
        kind: 'block',
        statements: [body, { kind: 'expression', expression: increment }],
      };
    }
    body = { kind: 'while', condition, body };
    if (initializer !== null) {
      body = { kind: 'block', statements: [initializer, body] };
    }
    return body;
  }

  private returnStatement(): Stmt {
    const keyword = this.previous();
    const value = this.check('SEMICOLON') ? null : this.expression();
    this.consume('SEMICOLON', "Expect ';' after return value.");
    return { kind: 'return', keyword, value };
  }

  private printStatement(): Stmt {
    const expression = this.expression();
    this.consume('SEMICOLON', "Expect ';' after value.");
    return { kind: 'print', expression };
  }

  private expressionStatement(): Stmt {
    const expression = this.expression();
    this.consume('SEMICOLON', "Expect ';' after expression.");
    return { kind: 'expression', expression };
  }

  private expression(): Expr {
    return this.assignment();
  }

  private assignment(): Expr {
    const expr = this.or();
    if (this.match('EQUAL')) {
      const equals = this.previous();
      const value = this.nested(() => this.assignment());
      if (expr.kind === 'variable') {
        return { kind: 'assign', name: expr.name, value };
      }
      if (expr.kind === 'get') {
        return { kind: 'set', object: expr.object, name: expr.name, value };
      }
      this.error(equals, 'Invalid assignment target.');
    }
    return expr;
  }

  private or(): Expr {
    return this.leftAssociative(() => this.and(), ['OR'], 'logical');
  }

  private and(): Expr {
    return this.leftAssociative(() => this.equality(), ['AND'], 'logical');
  }

  private equality(): Expr {
    return this.leftAssociative(
      () => this.comparison(),
      ['BANG_EQUAL', 'EQUAL_EQUAL'],
    );
  }

  private comparison(): Expr {
    return this.leftAssociative(
      () => this.term(),
      ['GREATER', 'GREATER_EQUAL', 'LESS', 'LESS_EQUAL'],
    );
  }

  private term(): Expr {
    return this.leftAssociative(() => this.factor(), ['MINUS', 'PLUS']);
  }

  private factor(): Expr {
    return this.leftAssociative(() => this.unary(), ['SLASH', 'STAR']);
  }

  private leftAssociative(
    operand: () => Expr,
    operators: readonly TokenType[],
    kind: 'binary' | 'logical' = 'binary',
  ): Expr {
    let expr = operand();
    const depth = this.depth;
    try {
      while (this.match(...operators)) {
        this.deepen();
        const operator = this.previous();
        const right = operand();
        expr = { kind, left: expr, operator, right };
      }
      return expr;
    } finally {
      this.depth = depth;
    }
  }

  private unary(): Expr {
    if (this.match('BANG', 'MINUS')) {
      const operator = this.previous();
      const right = this.nested(() => this.unary());
      return { kind: 'unary', operator, right };
    }
    return this.call();
  }

  private call(): Expr {
    let expr = this.primary();
    const depth = this.depth;
    try {
      while (true) {
        if (this.match('LEFT_PAREN')) {
          this.deepen();
          expr = this.finishCall(expr);
        } else if (this.match('DOT')) {
          this.deepen();
          const name = this.consume(
            'IDENTIFIER',
            "Expect property name after '.'.",
          );
          expr = { kind: 'get', object: expr, name };
        } else {
          return expr;
        }
      }
    } finally {
      this.depth = depth;
    }
  }

  private finishCall(callee: Expr): Expr {
    const args = this.commaSeparated(
      () => this.expression(),
      "Can't have more than 255 arguments.",
    );
    const paren = this.consume('RIGHT_PAREN', "Expect ')' after arguments.");
    return { kind: 'call', callee, paren, args };
  }

  private commaSeparated<T>(item: () => T, limitMessage: string): T[] {
    const items: T[] = [];
    if (!this.check('RIGHT_PAREN')) {
      do {
        if (items.length >= 255) {
          this.error(this.peek(), limitMessage);
        }
        items.push(item());
      } while (this.match('COMMA'));
    }
    return items;
  }

  private primary(): Expr {
    if (this.match('FALSE')) {
      return { kind: 'literal', value: false };
    }
    if (this.match('TRUE')) {
      return { kind: 'literal', value: true };
    }
    if (this.match('NIL')) {
      return { kind: 'literal', value: null };
    }
    if (this.match('NUMBER', 'STRING')) {
      return { kind: 'literal', value: this.previous().literal };
    }
    if (this.match('SUPER')) {
      const keyword = this.previous();
      this.consume('DOT', "Expect '.' after 'super'.");
      const method = this.consume(
        'IDENTIFIER',
        'Expect superclass method name.',
      );
      return { kind: 'super', keyword, method };
    }
    if (this.match('THIS')) {
      return { kind: 'this', keyword: this.previous() };
    }
    if (this.match('IDENTIFIER')) {
      return { kind: 'variable', name: this.previous() };
    }
    if (this.match('LEFT_PAREN')) {
      const expression = this.nested(() => this.expression());
      this.consume('RIGHT_PAREN', "Expect ')' after expression.");
      return { kind: 'grouping', expression };
    }
    throw this.error(this.peek(), 'Expect expression.');
  }

  private nested<T>(parse: () => T): T {
    const depth = this.depth;
    this.deepen();
    try {
      return parse();
    } finally {
      this.depth = depth;
    }
  }

  private deepen(): void {
    if (this.depth >= MAX_NESTING) {
      this.errors.push(compileErrorAt(this.peek(), 'Too much nesting.'));
      throw new NestingError();
    }
    this.depth++;
  }

  private match(...types: readonly TokenType[]): boolean {
    for (const type of types) {
      if (this.check(type)) {
        this.advance();
        return true;
      }
    }
    return false;
  }

  private consume(type: TokenType, message: string): Token {
    if (this.check(type)) {
      return this.advance();
    }
    throw this.error(this.peek(), message);
  }

  private check(type: TokenType): boolean {
    return !this.isAtEnd() && this.peek().type === type;
  }

  private advance(): Token {
    if (!this.isAtEnd()) {
      this.current++;
    }
    return this.previous();
  }

  private isAtEnd(): boolean {
    return this.peek().type === 'EOF';
  }

  private peek(): Token {
    return this.tokens[this.current] as Token;
  }

  private previous(): Token {
    return this.tokens[this.current - 1] as Token;
  }

  private error(token: Token, message: string): ParseError {
    this.errors.push(compileErrorAt(token, message));
    return new ParseError(message);
  }

  private synchronize(): void {
    this.advance();
    while (!this.isAtEnd()) {
      if (this.previous().type === 'SEMICOLON') {
        return;
      }
      if (STATEMENT_KEYWORDS.has(this.peek().type)) {
        return;
      }
      this.advance();
    }
  }
}

export function parse(tokens: readonly Token[]): ParseResult {
  if (tokens[tokens.length - 1]?.type !== 'EOF') {
    throw new Error('Token list must end with an EOF token.');
  }
  return new Parser(tokens).parse();
}
