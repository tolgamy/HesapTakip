import test from 'node:test';
import assert from 'node:assert/strict';
import { validCategory, validMovementKind, remainingBalance, firmSchema } from '../src/firms.js';

test('borçlu / alacaklı firma türleri doğrulanır', () => {
  assert.equal(validCategory('payable'), 'payable');
  assert.equal(validCategory('receivable'), 'receivable');
  for (const x of ['borç','other',null,'']) assert.throws(() => validCategory(x));
});
test('cari hesap hareket türleri doğrulanır', () => {
  assert.equal(validMovementKind('charge'), 'charge');
  assert.equal(validMovementKind('settlement'), 'settlement');
  for (const x of ['refund','delete',null]) assert.throws(() => validMovementKind(x));
});
test('kısmi ödeme ve tahsilat bakiyeyi düşürür', () => {
  const list=[
    {kind:'charge',amount_kurus:5000000},
    {kind:'settlement',amount_kurus:2000000},
    {kind:'charge',amount_kurus:1000000}
  ];
  assert.equal(remainingBalance(list),4000000);
  assert.equal(remainingBalance([]),0);
});
test('schema mevcut kart/ekstre tablolarına dokunmaz', () => {
  assert.equal(firmSchema.length,4);
  for (const sql of firmSchema) {
    assert.match(sql,/IF NOT EXISTS/);
    assert.doesNotMatch(sql,/\b(?:DROP|TRUNCATE)\b/i);
  }
});
