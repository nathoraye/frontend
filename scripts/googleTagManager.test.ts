import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('GTM bootstrap is the first element in the shared head', () => {
  assert.match(html, /<head>\s*<!-- Google Tag Manager -->\s*<script>/);
  assert.ok(html.includes("})(window,document,'script','dataLayer','GTM-N7RK77WT');"));
  assert.equal(html.split('https://www.googletagmanager.com/gtm.js?id=').length - 1, 1);
});

test('GTM noscript iframe immediately follows the opening body', () => {
  assert.match(html, /<body>\s*<!-- Google Tag Manager \(noscript\) -->\s*<noscript><iframe src="https:\/\/www.googletagmanager.com\/ns.html\?id=GTM-N7RK77WT"\s*height="0" width="0" style="display:none;visibility:hidden"><\/iframe><\/noscript>/);
  assert.equal(html.split('https://www.googletagmanager.com/ns.html?id=').length - 1, 1);
});
