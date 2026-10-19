import { UserInputError } from './UserInputError.js';
import { ArithmeticParser } from './ArithmeticParser.js';

export class NumberParser {
  static integer(input, { positive = false, implicitThousands = false } = {}) {
    const text = String(input).trim();
    if (text.length > 128) throw new UserInputError('Liczba lub działanie jest zbyt długie (maks. 128 znaków).');
    const [numerator, scale] = new ArithmeticParser(text, implicitThousands).parse();
    if (numerator % scale !== 0n) throw new UserInputError('Wartość musi być liczbą całkowitą.');
    const value = numerator / scale;
    if (value < 0n) throw new UserInputError('Wynik nie może być ujemny.');
    if (value > BigInt(Number.MAX_SAFE_INTEGER) || (positive && value === 0n)) {
      throw new UserInputError(positive ? 'Koszt musi być dodatnią bezpieczną liczbą całkowitą.' : 'Liczba jest zbyt duża.');
    }
    return Number(value);
  }

  static percentage(input) {
    const value = this.integer(String(input).trim().replace(/%$/, '').trim());
    if (value > 40 || value % 4 !== 0) throw new UserInputError('Bonus musi wynosić 0–40%, co 4%.');
    return value;
  }
}

