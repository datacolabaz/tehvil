import assert from 'node:assert/strict';
import { test } from 'node:test';
import { copy } from './i18n';
import { uiCopy } from './i18n-ui';
import { clerkLocalization } from './clerk-localization';
import { auditDetail } from './audit-detail';
import { money } from '../components/kit';

test('all supported languages cover the same interface keys', () => {
  for (const lang of ['az', 'ru', 'en'] as const) {
    assert.deepEqual(Object.keys(copy[lang]).sort(), Object.keys(copy.en).sort());
    assert.deepEqual(Object.keys(uiCopy[lang]).sort(), Object.keys(uiCopy.en).sort());
  }
});

test('Azerbaijani auth fields and action have no English fallback', () => {
  const locale = clerkLocalization('az');
  assert.equal(locale.formFieldLabel__emailAddress, 'E-poçt ünvanı');
  assert.equal(locale.formFieldLabel__password, 'Şifrə');
  assert.equal(locale.formButtonPrimary, 'Davam et');
  assert.equal(clerkLocalization('ru').locale, 'ru-RU');
  assert.equal(clerkLocalization('en').locale, 'en-US');
});

test('translated audit framing never changes original titles or comments', () => {
  for (const lang of ['az', 'ru', 'en'] as const) {
    const t = (key: keyof typeof copy.en) => copy[lang][key];
    assert.ok(auditDetail({ action: 'scope.room_added', detail: 'Ərazi əlavə edildi: My unchanged title' }, t).endsWith('My unchanged title'));
    assert.ok(auditDetail({ action: 'scope.approved', detail: 'İş həcmi v2: My original comment' }, t).endsWith('My original comment'));
  }
});

test('locale-aware financial formatting preserves fractional amounts', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => 'en' } });
    assert.equal(money(0.35), '0.35');
    assert.equal(money(1234.5), '1,234.5');
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});