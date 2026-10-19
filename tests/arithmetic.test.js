import test from 'node:test';
import assert from 'node:assert/strict';
import { NumberParser } from '../src/domain/NumberParser.js';
import { ResourceForm } from '../src/discord/ResourceForm.js';
import { PlayerHelp } from '../src/discord/PlayerHelp.js';

test('bounded exact arithmetic honors precedence, parentheses, whitespace and number formats', () => {
  for (const [input, expected] of [
    ['3+5*3', 18], ['3 + 5 * 3', 18], ['(3+5)*5-2', 38], ['(20-5)/3', 5],
    ['20-5-3', 12], ['24/3/2', 4], ['1/3*3', 1], ['5/2+5/2', 5],
    ['-3+5', 2], ['3-(-5)', 8], ['+(2+3)', 5], ['10-(3*(2+1))', 1],
    ['200*0.94', 188], ['200 * 0,94', 188], ['9.55k + 5', 9555],
    ['(9007199254740991-1)+1', Number.MAX_SAFE_INTEGER], ['5-5', 0],
  ]) assert.equal(NumberParser.integer(input), expected, input);
  assert.equal(NumberParser.integer('9,55+5', { implicitThousands: true }), 9555);
  assert.equal(NumberParser.integer('9.55k-0.55k', { implicitThousands: true }), 9000);
  for (const input of ['1/0', '1/(3-3)', '1/3', '3-5', '1e3', '2**3', '2(3)', '1 2',
    '(2+3', '2+3)', '3+', '3=3', 'Infinity', 'NaN', 'Math.max(1,2)', 'process.exit()',
    '(()=>1)()', '1;2', '0x10', '1/*x*/+2', '9007199254740991+1', '('.repeat(17)+'1'+')'.repeat(17), '1'.repeat(129)]) {
    assert.throws(() => NumberParser.integer(input), undefined, input);
  }
  assert.throws(() => NumberParser.integer('5-5', { positive: true }));
  assert.equal(NumberParser.integer('200-3*4', { positive: true }), 188);
});

test('all seven resource/cost fields accept calculations with one shared hint per form', () => {
  const resourceFields = ResourceForm.open('11').data.components;
  const costFields = ResourceForm.costs('11').data.components;
  assert.equal(resourceFields.length, 5);
  for (const fields of [resourceFields, costFields]) {
    assert.equal(fields.filter(field => field.description).length, 1);
    assert.ok(fields[0].description.length <= 100);
    const parsed = ResourceForm.parse(fields.map(field => ({ component: { custom_id: field.component.custom_id, value: ' (3 + 5) * 5 - 2 ' } })));
    assert.ok(Object.values(parsed).every(value => value === 38));
    assert.equal(Object.keys(parsed).length, fields.length);
  }
  assert.match(PlayerHelp.panel('11').embeds[0].description, /3\+5\*3 = 18/);
  assert.ok(PlayerHelp.panel('11').embeds[0].description.length <= 4096);
});
