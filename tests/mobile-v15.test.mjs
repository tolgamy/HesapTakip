import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public/mobile-v15.css', import.meta.url), 'utf8');
const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

test('Ayarlar is persistently discoverable on phones', () => {
  const bottom = html.match(/<nav class="mobile-bottom-nav"[\s\S]*?<\/nav>/)?.[0];
  assert.ok(bottom, 'mobile bottom navigation is present');
  assert.equal((bottom.match(/class="mobile-bottom-item/g) || []).length, 6);
  assert.match(bottom, /data-mobile-tab="settings"[^>]*>[\s\S]*?<small>Ayarlar<\/small>/);
  assert.match(html, /class="mobile-header-action ht-settings-launch"[^>]*data-mobile-tab="settings"[^>]*>[\s\S]*?mobile-settings-label">Ayarlar<\/span>/);
  assert.match(html, /class="mobile-other-item" data-mobile-tab="settings"/);
  assert.match(html, /<section id="settingsView" class="view" hidden>/);
});

test('mobile Settings uses existing tab click handling and selected state', () => {
  assert.match(app, /const nav=event\.target\.closest\('\[data-mobile-tab\]'\)/);
  assert.match(app, /tab\(nav\.dataset\.mobileTab\)/);
  assert.match(app, /btn\.dataset\.mobileTab===primary/);
  assert.match(app, /settings:\['Ayarlar'/);
});

test('mobile layout avoids clipped forms and allows safe-area navigation', () => {
  assert.match(html, /href="\/mobile-v15\.css"/);
  assert.match(css, /@media \(max-width: 620px\)/);
  assert.match(css, /grid-template-columns: repeat\(6, minmax\(0, 1fr\)\)/);
  assert.match(css, /env\(safe-area-inset-bottom, 0px\)/);
  assert.match(css, /max-height: calc\(100dvh/);
  assert.match(css, /overflow-y: auto/);
  assert.match(css, /font-size: 16px/);
  assert.match(css, /\.table-wrap/);
});
