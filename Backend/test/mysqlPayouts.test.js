import test from 'node:test';
import assert from 'node:assert/strict';
import { decimalToCents, formatCents } from '../src/routes/mysqlPayouts.js';

test('decimalToCents parses MySQL DECIMAL values exactly', () => {
  assert.equal(decimalToCents('0.01'), 1n);
  assert.equal(decimalToCents('10'), 1000n);
  assert.equal(decimalToCents('125.5'), 12550n);
  assert.equal(decimalToCents('999999999999.99'), 99999999999999n);
});

test('decimalToCents rejects malformed, negative and over-precision values', () => {
  for (const value of ['-1.00', '1.001', '1.2.3', '1e3', 'abc', '']) {
    assert.throws(() => decimalToCents(value));
  }
});

test('formatCents formats exact two-decimal currency amounts', () => {
  assert.equal(formatCents(0n), '0.00');
  assert.equal(formatCents(1n), '0.01');
  assert.equal(formatCents(105n), '1.05');
  assert.equal(formatCents(123456n), '1234.56');
});

test('decimal conversion and formatting round-trip supported amounts', () => {
  for (const value of ['0.01', '1.00', '10.5', '999999999999.99']) {
    assert.equal(formatCents(decimalToCents(value)), value.includes('.') ? value.padEnd(value.indexOf('.') + 3, '0') : value + '.00');
  }
});
