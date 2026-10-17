import assert from 'node:assert/strict';
import { ROUTE_META } from '../src/utils/useRouteMeta.ts';
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
    assert.match(html, /<title>West Vinyl Studio \| Custom Vinyl Decals, Stickers &amp; Apparel Australia<\/title>/);
    assert.match(html, /name="description"/);
    assert.match(html, /Custom vinyl decals and stickers/);
    assert.match(html, /Wentworth, NSW/);
    assert.match(html, /Ships Australia-wide/);
    assert.match(html, /Prices in AUD/);
    assert.match(html, /<link rel="canonical" href="https:\/\/westvinylstudio\.com\/"\s*\/>/);
    assert.match(html, /property="og:title"/);
    assert.match(html, /property="og:description"/);
    assert.match(html, /property="og:image" content="https:\/\/westvinylstudio\.com\/og-preview\.jpg"/);
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

  test('studio controls are excluded from snippets and the social JPEG is 1200 by 630', async () => {
    const app = await fs.readFile(path.join(root, 'src/App.tsx'), 'utf8');
    assert.match(app, /<div data-nosnippet="" className="relative flex h-\[100dvh\]/);
    const html = await fs.readFile(path.join(root, 'index.html'), 'utf8');
    assert.match(html, /property="og:image:width" content="1200"/);
    assert.match(html, /property="og:image:height" content="630"/);
    assert.match(html, /name="twitter:image" content="https:\/\/westvinylstudio\.com\/og-preview\.jpg"/);
    const jpeg = await fs.readFile(path.join(root, 'public/og-preview.jpg'));
    assert.equal(jpeg.readUInt16BE(0), 0xffd8);
    let offset = 2;
    let dimensions: number[] | undefined;
    while (offset < jpeg.length) {
      const marker = jpeg.readUInt16BE(offset);
      const length = jpeg.readUInt16BE(offset + 2);
      if (marker === 0xffc0 || marker === 0xffc2) {
        dimensions = [jpeg.readUInt16BE(offset + 7), jpeg.readUInt16BE(offset + 5)];
        break;
      }
      offset += 2 + length;
    }
    assert.deepEqual(dimensions, [1200, 630]);
  });

  test('shared info-page navigation is excluded from snippets without excluding body copy', async () => {
    const source = await fs.readFile(path.join(root, 'src/components/StudioInfoPage.tsx'), 'utf8');
    const nav = source.match(/<nav\b[^>]*>([\s\S]*?)<\/nav>/);
    assert.ok(nav);
    assert.match(nav[0], /data-nosnippet=""/);
    assert.match(nav[0], /aria-label="Site navigation"/);
    for (const href of PUBLIC_PATHS) {
      assert.ok(nav[1].includes(`href="${href}"`));
    }
    assert.match(source, /<div className="space-y-4 text-sm leading-relaxed text-slate-300">\{children\}<\/div>/);
    assert.equal((source.match(/data-nosnippet/g) ?? []).length, 1);
  });

  test('public info routes have unique nonempty metadata', () => {
    const titles = new Set<string>();
    const descriptions = new Set<string>();
    for (const route of PUBLIC_PATHS.filter(route => route !== '/')) {
      const meta = ROUTE_META[route];
      assert.ok(meta.title.includes('West Vinyl Studio'));
      assert.ok(meta.description.length > 50);
      titles.add(meta.title);
      descriptions.add(meta.description);
    }
    assert.equal(titles.size, 4);
    assert.equal(descriptions.size, 4);
  });

  test('document routes do not eagerly import the canvas engine', async () => {
    const main = await fs.readFile(path.join(root, 'src/main.tsx'), 'utf8');
    assert.doesNotMatch(main, /canvasSerialize|from ['"]fabric/);
    const routes = await fs.readFile(path.join(root, 'src/RootPage.tsx'), 'utf8');
    assert.match(routes, /lazy\(\(\) => import\('\.\/App.tsx'\)\)/);
    assert.match(routes, /<Suspense fallback=/);
    const config = await fs.readFile(path.join(root, 'vite.config.ts'), 'utf8');
    assert.match(config, /globIgnores: \['\*\*\/\*\.js'\]/);
    const dock = await fs.readFile(path.join(root, 'src/components/LeftDock.tsx'), 'utf8');
    assert.match(dock, /aria-label=\{tooltip\}/);
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
