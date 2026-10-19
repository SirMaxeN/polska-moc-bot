import { UserInputError } from './UserInputError.js';

// A bounded arithmetic grammar; user input is never evaluated as JavaScript.
export class ArithmeticParser {
  constructor(input, implicitThousands) {
    this.input = input;
    this.position = 0;
    this.implicitThousands = implicitThousands;
  }
  fail() { throw new UserInputError('Podaj liczbę lub działanie, np. 3+5*3 albo (3+5)*5-2.'); }
  skip() { while (/\s/.test(this.input[this.position] ?? '') && this.position < this.input.length) this.position++; }
  take(char) {
    this.skip();
    if (this.input[this.position] !== char) return false;
    this.position++;
    return true;
  }
  fraction(n, d = 1n) {
    if (d === 0n) throw new UserInputError('Nie można dzielić przez zero.');
    if (d < 0n) { n = -n; d = -d; }
    let a = n < 0n ? -n : n, b = d;
    while (b) [a, b] = [b, a % b];
    n /= a; d /= a;
    if (n.toString().length > 128 || d.toString().length > 128) throw new UserInputError('Wynik pośredni jest zbyt duży.');
    return [n, d];
  }
  expression(depth = 0) {
    let [n, d] = this.product(depth);
    while (true) {
      const sign = this.take('+') ? 1n : this.take('-') ? -1n : 0n;
      if (!sign) return [n, d];
      const [r, s] = this.product(depth);
      [n, d] = this.fraction(n * s + sign * r * d, d * s);
    }
  }
  product(depth) {
    let [n, d] = this.atom(depth);
    while (true) {
      if (this.take('*')) {
        const [r, s] = this.atom(depth);
        [n, d] = this.fraction(n * r, d * s);
      } else if (this.take('/')) {
        const [r, s] = this.atom(depth);
        [n, d] = this.fraction(n * s, d * r);
      } else return [n, d];
    }
  }
  atom(depth) {
    if (depth > 16) throw new UserInputError('Zbyt wiele zagnieżdżonych nawiasów lub znaków.');
    if (this.take('+')) return this.atom(depth + 1);
    if (this.take('-')) { const [n, d] = this.atom(depth + 1); return [-n, d]; }
    if (this.take('(')) {
      const value = this.expression(depth + 1);
      if (!this.take(')')) this.fail();
      return value;
    }
    this.skip();
    const match = /^(\d+)(?:[.,](\d+))?([kK])?/.exec(this.input.slice(this.position));
    if (!match || match[0].length > 32) this.fail();
    this.position += match[0].length;
    const fraction = match[2] ?? '';
    return this.fraction(BigInt(match[1] + fraction) * (match[3] || (this.implicitThousands && match[2] !== undefined) ? 1000n : 1n), 10n ** BigInt(fraction.length));
  }
  parse() {
    const result = this.expression();
    this.skip();
    if (this.position !== this.input.length) this.fail();
    return result;
  }
}
