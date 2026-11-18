import type { CompileError } from '../errors';
import {
  KEYWORDS,
  type Token,
  type TokenLiteral,
  type TokenType,
} from './token';

export interface ScanResult {
  readonly tokens: readonly Token[];
  readonly errors: readonly CompileError[];
}

const SINGLE_CHARACTER_TOKENS: ReadonlyMap<string, TokenType> = new Map<
  string,
  TokenType
>([
  ['(', 'LEFT_PAREN'],
  [')', 'RIGHT_PAREN'],
  ['{', 'LEFT_BRACE'],
  ['}', 'RIGHT_BRACE'],
  [',', 'COMMA'],
  ['.', 'DOT'],
  ['-', 'MINUS'],
  ['+', 'PLUS'],
  [';', 'SEMICOLON'],
  ['*', 'STAR'],
]);

function isDigit(char: string): boolean {
  return char >= '0' && char <= '9';
}

function isAlpha(char: string): boolean {
  return (
    (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') || char === '_'
  );
}

function isAlphaNumeric(char: string): boolean {
  return isAlpha(char) || isDigit(char);
}

class Scanner {
  private readonly tokens: Token[] = [];
  private readonly errors: CompileError[] = [];
  private start = 0;
  private current = 0;
  private line = 1;
  private lineStart = 0;
  private tokenLine = 1;
  private tokenColumn = 1;

  constructor(private readonly source: string) {}

  scan(): ScanResult {
    while (!this.isAtEnd()) {
      this.start = this.current;
      this.tokenLine = this.line;
      this.tokenColumn = this.start - this.lineStart + 1;
      this.scanToken();
    }

    this.tokens.push({
      type: 'EOF',
      lexeme: '',
      literal: null,
      line: this.line,
      column: this.current - this.lineStart + 1,
    });
    return { tokens: this.tokens, errors: this.errors };
  }

  private scanToken(): void {
    const char = this.advance();

    const single = SINGLE_CHARACTER_TOKENS.get(char);
    if (single !== undefined) {
      this.addToken(single);
      return;
    }

    switch (char) {
      case '!':
        this.addToken(this.match('=') ? 'BANG_EQUAL' : 'BANG');
        break;
      case '=':
        this.addToken(this.match('=') ? 'EQUAL_EQUAL' : 'EQUAL');
        break;
      case '<':
        this.addToken(this.match('=') ? 'LESS_EQUAL' : 'LESS');
        break;
      case '>':
        this.addToken(this.match('=') ? 'GREATER_EQUAL' : 'GREATER');
        break;
      case '/':
        if (this.match('/')) {
          this.skipLineComment();
        } else {
          this.addToken('SLASH');
        }
        break;
      case ' ':
      case '\r':
      case '\t':
        break;
      case '\n':
        this.startNewLine();
        break;
      case '"':
        this.string();
        break;
      default:
        if (isDigit(char)) {
          this.number();
        } else if (isAlpha(char)) {
          this.identifier();
        } else {
          this.error('Unexpected character.');
        }
    }
  }

  private skipLineComment(): void {
    while (!this.isAtEnd() && this.peek() !== '\n') {
      this.advance();
    }
  }

  private string(): void {
    while (!this.isAtEnd() && this.peek() !== '"') {
      if (this.advance() === '\n') {
        this.startNewLine();
      }
    }

    if (this.isAtEnd()) {
      this.error('Unterminated string.');
      return;
    }

    this.advance();
    this.addToken(
      'STRING',
      this.source.slice(this.start + 1, this.current - 1),
    );
  }

  private number(): void {
    while (isDigit(this.peek())) {
      this.advance();
    }

    if (this.peek() === '.' && isDigit(this.peekNext())) {
      this.advance();
      while (isDigit(this.peek())) {
        this.advance();
      }
    }

    this.addToken(
      'NUMBER',
      Number(this.source.slice(this.start, this.current)),
    );
  }

  private identifier(): void {
    while (isAlphaNumeric(this.peek())) {
      this.advance();
    }

    const text = this.source.slice(this.start, this.current);
    this.addToken(KEYWORDS.get(text) ?? 'IDENTIFIER');
  }

  private startNewLine(): void {
    this.line += 1;
    this.lineStart = this.current;
  }

  private isAtEnd(): boolean {
    return this.current >= this.source.length;
  }

  private advance(): string {
    const char = this.source.charAt(this.current);
    this.current += 1;
    return char;
  }

  private match(expected: string): boolean {
    if (this.isAtEnd() || this.source.charAt(this.current) !== expected) {
      return false;
    }
    this.current += 1;
    return true;
  }

  private peek(): string {
    return this.source.charAt(this.current);
  }

  private peekNext(): string {
    return this.source.charAt(this.current + 1);
  }

  private addToken(type: TokenType, literal: TokenLiteral = null): void {
    this.tokens.push({
      type,
      lexeme: this.source.slice(this.start, this.current),
      literal,
      line: this.tokenLine,
      column: this.tokenColumn,
    });
  }

  private error(message: string): void {
    this.errors.push({
      line: this.tokenLine,
      column: this.tokenColumn,
      where: '',
      message,
    });
  }
}

export function scan(source: string): ScanResult {
  return new Scanner(source).scan();
}
