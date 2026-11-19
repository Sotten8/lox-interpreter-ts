export type TokenType =
  | 'LEFT_PAREN'
  | 'RIGHT_PAREN'
  | 'LEFT_BRACE'
  | 'RIGHT_BRACE'
  | 'COMMA'
  | 'DOT'
  | 'MINUS'
  | 'PLUS'
  | 'SEMICOLON'
  | 'SLASH'
  | 'STAR'
  | 'BANG'
  | 'BANG_EQUAL'
  | 'EQUAL'
  | 'EQUAL_EQUAL'
  | 'GREATER'
  | 'GREATER_EQUAL'
  | 'LESS'
  | 'LESS_EQUAL'
  | 'IDENTIFIER'
  | 'STRING'
  | 'NUMBER'
  | 'AND'
  | 'CLASS'
  | 'ELSE'
  | 'FALSE'
  | 'FUN'
  | 'FOR'
  | 'IF'
  | 'NIL'
  | 'OR'
  | 'PRINT'
  | 'RETURN'
  | 'SUPER'
  | 'THIS'
  | 'TRUE'
  | 'VAR'
  | 'WHILE'
  | 'EOF';

export type TokenLiteral = number | string | null;

export interface Token {
  readonly type: TokenType;
  readonly lexeme: string;
  readonly literal: TokenLiteral;
  readonly line: number;
  readonly column: number;
}

export const KEYWORDS: ReadonlyMap<string, TokenType> = new Map<
  string,
  TokenType
>([
  ['and', 'AND'],
  ['class', 'CLASS'],
  ['else', 'ELSE'],
  ['false', 'FALSE'],
  ['for', 'FOR'],
  ['fun', 'FUN'],
  ['if', 'IF'],
  ['nil', 'NIL'],
  ['or', 'OR'],
  ['print', 'PRINT'],
  ['return', 'RETURN'],
  ['super', 'SUPER'],
  ['this', 'THIS'],
  ['true', 'TRUE'],
  ['var', 'VAR'],
  ['while', 'WHILE'],
]);
