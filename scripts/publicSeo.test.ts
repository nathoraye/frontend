import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://westvinylstudio.com';

const PUBLIC_PATHS = ['/', '/policies', '/privacy', '/terms', '/contact'] as const;
const PRIVATE_PATHS = ['/admin', '/admin/orders', '/jobs', '/api', '/order/success', '/order/cancel'];

describe('public SEO files', () => {
  test('sitemap lists only public customer pages on the canonical origin', async () => {
    const xml = await fs.readFile(path.join(root, 'public/sitemap.xml'), 'utf8');
    assert.match(xml, /<urlset[^>]*xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"/);
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
    assert.deepEqual(
      locs,
      PUBLIC_PATHS.map((page) => (page === '/' ? `${ORIGIN}/` : `${ORIGIN}${page}`)),
    );
    for (const loc of locs) {
      assert.equal(loc.startsWith(`${ORIGIN}/`) || loc === `${ORIGIN}/`, true, loc);
      const pathname = new URL(loc).pathname;
      for (const blocked of PRIVATE_PATHS) {
        assert.equal(pathname === blocked || pathname.startsWith(`${blocked}/`), false, loc);
      }
    }
  });

  test('robots.txt allows the public site and points at the sitemap', async () => {
    const robots = await fs.readFile(path.join(root, 'public/robots.txt'), 'utf8');
    const lines = robots.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    assert.ok(lines.includes('User-agent: *'));
    assert.ok(lines.includes('Allow: /'));
    assert.equal(lines.includes('Disallow: /'), false);
    assert.ok(lines.includes(`Sitemap: ${ORIGIN}/sitemap.xml`));
    // Draft PR #63 adds these. Keep them when present; do not require them on main.
    for (const line of lines) {
      if (!line.startsWith('Disallow:')) continue;
      assert.ok(line === 'Disallow: /admin/orders' || line === 'Disallow: /jobs', line);
    }
  });

  test('index.html exposes title, description, canonical, social tags, and business JSON-LD', async () => {
    const html = await fs.readFile(path.join(root, 'index.html'), 'utf8');
    assert.match(html, /<html lang="en-AU">/);
    assert.match(html, /<title>West Vinyl Studio \| Custom Vinyl Decals &amp; Printed Apparel, Australia<\/title>/);
    assert.match(html, /name="description"/);
    assert.match(html, /Custom vinyl decals and stickers/);
    assert.match(html, /Wentworth, NSW/);
    assert.match(html, /Ships Australia-wide/);
    assert.match(html, /Prices in AUD/);
    assert.match(html, /<link rel="canonical" href="https:\/\/westvinylstudio\.com\/"\s*\/>/);
    assert.match(html, /property="og:title"/);
    assert.match(html, /property="og:description"/);
    assert.match(html, /property="og:image" content="https:\/\/westvinylstudio\.com\/hoodie\.png"/);
    assert.match(html, /name="twitter:card" content="summary_large_image"/);
    assert.match(html, /name="twitter:image"/);
    assert.match(html, /id="crawlable-summary"/);
    assert.match(html, /<noscript>/);
    assert.match(html, /vinyl decals and stickers, and applies vinyl to tees/);

    const jsonLd = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    assert.ok(jsonLd);
    const data = JSON.parse(jsonLd[1]) as {
      '@type': string;
      name: string;
      url: string;
      telephone?: string;
      email?: string;
      address?: {
        streetAddress?: string;
        addressLocality?: string;
        addressRegion?: string;
      };
      areaServed?: { name?: string };
    };
    assert.equal(data['@type'], 'Store');
    assert.equal(data.name, 'West Vinyl Studio');
    assert.equal(data.url, `${ORIGIN}/`);
    assert.equal(data.address?.addressLocality, 'Wentworth');
    assert.equal(data.address?.addressRegion, 'NSW');
    assert.equal(data.address?.streetAddress, undefined);
    assert.equal(data.areaServed?.name, 'Australia');
    assert.equal(data.telephone, undefined);
    assert.equal(data.email, undefined);
  });

  test('the SPA rewrite does not claim sitemap.xml or robots.txt', async () => {
    const vercel = JSON.parse(await fs.readFile(path.join(root, 'vercel.json'), 'utf8')) as {
      rewrites: { source: string; destination: string }[];
    };
    const rewrite = vercel.rewrites.find((entry) => entry.destination === '/index.html');
    assert.ok(rewrite);
    assert.match(rewrite.source, /sitemap\\\.xml/);
    assert.match(rewrite.source, /robots\\\.txt/);
    assert.match(rewrite.source, /api\//);

    const pattern = new RegExp(`^${rewrite.source}$`);
    assert.equal(pattern.test('/sitemap.xml'), false);
    assert.equal(pattern.test('/robots.txt'), false);
    assert.equal(pattern.test('/api/health'), false);
    assert.equal(pattern.test('/'), true);
    assert.equal(pattern.test('/policies'), true);
    assert.equal(pattern.test('/contact'), true);

    const viteConfig = await fs.readFile(path.join(root, 'vite.config.ts'), 'utf8');
    assert.match(viteConfig, /sitemap\\\.xml/);
    assert.match(viteConfig, /robots\\\.txt/);
  });
});
