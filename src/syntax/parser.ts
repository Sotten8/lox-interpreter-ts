import type { Expr, Stmt } from './ast';
import type { CompileError } from '../errors';
import type { Token, TokenType } from './token';

export interface ParseResult {
  readonly statements: readonly Stmt[];
  readonly errors: readonly CompileError[];
}

class ParseError extends Error {}

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

  constructor(tokens: readonly Token[]) {
    this.tokens = tokens;
  }

  parse(): ParseResult {
    const statements: Stmt[] = [];
    while (!this.isAtEnd()) {
      const statement = this.declaration();
      if (statement !== null) {
        statements.push(statement);
      }
    }
    return { statements, errors: this.errors };
  }

  private declaration(): Stmt | null {
    try {
      if (this.match('FUN')) {
        return this.functionDeclaration();
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

  private functionDeclaration(): Stmt {
    const name = this.consume('IDENTIFIER', 'Expect function name.');
    this.consume('LEFT_PAREN', "Expect '(' after function name.");
    const params = this.commaSeparated(
      () => this.consume('IDENTIFIER', 'Expect parameter name.'),
      "Can't have more than 255 parameters.",
    );
    this.consume('RIGHT_PAREN', "Expect ')' after parameters.");
    this.consume('LEFT_BRACE', "Expect '{' before function body.");
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
    if (this.match('LEFT_BRACE')) {
      return { kind: 'block', statements: this.block() };
    }
    return this.expressionStatement();
  }

  private block(): Stmt[] {
    const statements: Stmt[] = [];
    while (!this.check('RIGHT_BRACE') && !this.isAtEnd()) {
      const statement = this.declaration();
      if (statement !== null) {
        statements.push(statement);
      }
    }
    this.consume('RIGHT_BRACE', "Expect '}' after block.");
    return statements;
  }

  private ifStatement(): Stmt {
    this.consume('LEFT_PAREN', "Expect '(' after 'if'.");
    const condition = this.expression();
    this.consume('RIGHT_PAREN', "Expect ')' after if condition.");
    const thenBranch = this.statement();
    const elseBranch = this.match('ELSE') ? this.statement() : null;
    return { kind: 'if', condition, thenBranch, elseBranch };
  }

  private whileStatement(): Stmt {
    this.consume('LEFT_PAREN', "Expect '(' after 'while'.");
    const condition = this.expression();
    this.consume('RIGHT_PAREN', "Expect ')' after condition.");
    const body = this.statement();
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

    let body = this.statement();
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
      const value = this.assignment();
      if (expr.kind === 'variable') {
        return { kind: 'assign', name: expr.name, value };
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
    while (this.match(...operators)) {
      const operator = this.previous();
      const right = operand();
      expr = { kind, left: expr, operator, right };
    }
    return expr;
  }

  private unary(): Expr {
    if (this.match('BANG', 'MINUS')) {
      const operator = this.previous();
      const right = this.unary();
      return { kind: 'unary', operator, right };
    }
    return this.call();
  }

  private call(): Expr {
    let expr = this.primary();
    while (this.match('LEFT_PAREN')) {
      expr = this.finishCall(expr);
    }
    return expr;
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
    if (this.match('IDENTIFIER')) {
      return { kind: 'variable', name: this.previous() };
    }
    if (this.match('LEFT_PAREN')) {
      const expression = this.expression();
      this.consume('RIGHT_PAREN', "Expect ')' after expression.");
      return { kind: 'grouping', expression };
    }
    throw this.error(this.peek(), 'Expect expression.');
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
    const where = token.type === 'EOF' ? 'at end' : `at '${token.lexeme}'`;
    this.errors.push({
      line: token.line,
      column: token.column,
      where,
      message,
    });
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
