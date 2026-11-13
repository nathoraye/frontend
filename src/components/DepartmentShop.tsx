import { useEffect, useState, type CSSProperties } from 'react';
import { ArrowRight, ArrowUpRight, Check, Heart, MapPin, Mail, Palette, Gift, Compass } from 'lucide-react';
import { DEPARTMENTS, type Department } from '../config/departments';
import './DepartmentShop.css';
import WestVinylProduct from './WestVinylProduct';

type Product = {
  id: string;
  title: string;
  availableForSale: boolean;
  onlineStoreUrl: string | null;
  priceRange: { minVariantPrice: { amount: string; currencyCode: string } };
  featuredImage: { url: string; altText: string | null } | null;
};
type Collection = {
  title: string;
  description: string;
  products: { edges: { node: Product }[] };
};
type Result = { collection: Collection | null; error?: never } | { error: string; collection?: never };

function ProductList({ department }: { department: Department }) {
  const [result, setResult] = useState<Result | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/departments?handle=${encodeURIComponent(department.handle)}`, { signal: controller.signal })
      .then(async response => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Products could not be loaded. Please try again.');
        return payload as Result;
      })
      .then(setResult)
      .catch(error => {
        if (!controller.signal.aborted) setResult({ error: error instanceof Error ? error.message : 'Products could not be loaded.' });
      });
    return () => controller.abort();
  }, [department.handle, attempt]);

  if (!result) return <p role="status">Loading {department.name} products…</p>;
  if (result.error) return (
    <div role="status" className="department-status">
      <p>{result.error}</p>
      <button type="button" onClick={() => { setResult(null); setAttempt(value => value + 1); }}>Try again</button>
      <a href="/contact">Contact us <ArrowUpRight size={16} aria-hidden="true" /></a>
    </div>
  );
  const collection = result.collection;
  if (!collection || collection.products.edges.length === 0) return (
    <div className="department-status" role="status">
      <p>{department.id === 'custom' ? 'No additional collection products' : 'No products'} are available in {department.name} yet.</p>
      <a href="/contact">Ask about {department.subhead.toLowerCase()} <ArrowUpRight size={16} aria-hidden="true" /></a>
    </div>
  );
  return (
    <>
      {collection.description && <p className="department-description">{collection.description}</p>}
      <p className="department-product-note">Showing up to 12 products. Product links open the Shopify store.</p>
      <div className="department-products">
        {collection.products.edges.map(({ node: product }) => {
          // Only Shopify-provided HTTPS destinations can become clickable links.
          const productUrl = product.onlineStoreUrl?.startsWith('https://') ? product.onlineStoreUrl : null;
          return (
            <article key={product.id} className="department-product">
              {product.featuredImage
                ? <img src={product.featuredImage.url} alt={product.featuredImage.altText || product.title} loading="lazy" width="480" height="480" />
                : <div className="department-no-image">Image unavailable</div>}
              <h3>{product.title}</h3>
              <p>{new Intl.NumberFormat('en-AU', { style: 'currency', currency: product.priceRange.minVariantPrice.currencyCode }).format(Number(product.priceRange.minVariantPrice.amount))} <span>{product.priceRange.minVariantPrice.currencyCode}</span></p>
              {!product.availableForSale && <p className="department-product-note">Sold out</p>}
              {productUrl ? <a href={productUrl}>View product <ArrowUpRight size={16} aria-hidden="true" /></a> : <p className="department-product-note">Online product page unavailable</p>}
            </article>
          );
        })}
      </div>
    </>
  );
}

const DEPARTMENT_IMAGES: Record<string, { src: string; alt: string; action: string }> = {
  custom: { src: '/shop/custom.webp', alt: 'White mountain vinyl decal on a vehicle window', action: 'Shop custom vinyl' },
  crafts: { src: '/shop/crafts.webp', alt: 'Engraved wooden tree, Good Vibes keyring and handmade candle', action: 'Shop crafts' },
  collectables: { src: '/shop/collectables.webp', alt: 'Vintage camera, books, compass and pocket watch on a wooden table', action: 'Shop collectables' },
};

function ShopWordmark() {
  return <span className="shop-wordmark" aria-label="West Vinyl Studio"><span>West Vinyl</span><span>Studio</span></span>;
}

export default function DepartmentShop() {
  const initial = DEPARTMENTS.find(department => department.handle === new URLSearchParams(window.location.search).get('department')) || DEPARTMENTS[0];
  const [selected, setSelected] = useState(initial);
  const accent = { '--department-accent': selected.accentColor } as CSSProperties;
  function selectDepartment(department: Department, scroll = false) {
    setSelected(department);
    const url = new URL(window.location.href);
    url.searchParams.set('department', department.handle);
    window.history.replaceState(null, '', url);
    if (scroll) document.getElementById('department-collection')?.scrollIntoView({ behavior: 'instant', block: 'start' });
  }
  return (
    <div className="department-shop" style={accent}>
      <a className="shop-skip-link" href="#main-content">Skip to content</a>
      <div className="shop-local-strip"><span><MapPin size={14} aria-hidden="true" /> Wentworth, NSW · Australia</span><span><Heart size={14} aria-hidden="true" /> Custom creations. Handmade goods. Curated finds.</span></div>
      <header className="department-header">
        <a href="/" className="shop-brand"><ShopWordmark /></a>
        <nav aria-label="Site navigation">
          <a className="shop-active-link" href="/" aria-current="page">Shop</a>
          {DEPARTMENTS.map(department => <a key={department.id} href={`#department-${department.id}`} onClick={() => selectDepartment(department)}>{department.subhead}</a>)}
          <a href="/studio">Design studio <ArrowUpRight size={14} aria-hidden="true" /></a>
          <a href="/contact">Contact</a>
        </nav>
      </header>
      <main id="main-content">
        <section className="shop-hero" aria-labelledby="shop-hero-title">
          <img className="shop-hero-image" src="/shop/hero.webp" alt="Off-road ute in the Australian bush at sunset beside a windmill" width="1024" height="572" fetchPriority="high" />
          <div className="shop-hero-copy">
            <h1 id="shop-hero-title">More than just vinyl.</h1>
            <p className="shop-hero-subhead">A creative studio for all things unique!</p>
            <p className="shop-hero-description">Custom vinyl, handmade crafts and curated vintage finds<br className="shop-desktop-break" /> — all in one place, right here at West Vinyl Studio.</p>
            <a className="shop-primary-action" href="#departments">Explore our collections <ArrowRight size={18} aria-hidden="true" /></a>
          </div>
        </section>
        <div id="departments" className="department-directory" aria-label="Departments">
          {DEPARTMENTS.map(department => {
            const image = DEPARTMENT_IMAGES[department.id];
            return (
              <section id={`department-${department.id}`} key={department.id} style={{ '--department-accent': department.accentColor } as CSSProperties} className="department-summary">
                <img className="department-photo" src={image.src} alt={image.alt} width="825" height="1024" />
                <div className="department-panel-copy">
                  <h2>{department.name} <span>| {department.subhead}</span></h2>
                  <p className="department-tagline">{department.tagline}</p>
                  <ul>{department.features.map(feature => <li key={feature}><Check size={13} strokeWidth={3} aria-hidden="true" />{feature}</li>)}</ul>
                  <button type="button" aria-label={image.action} aria-pressed={selected.id === department.id} aria-controls="department-collection" onClick={() => selectDepartment(department, true)}>
                    {image.action} <ArrowRight size={16} aria-hidden="true" />
                  </button>
                </div>
              </section>
            );
          })}
        </div>
        <div className="shop-values" aria-label="Our departments at a glance">
          <span><Palette aria-hidden="true" /><span>Custom designs<br /><strong>Made your way</strong></span></span>
          <span><Gift aria-hidden="true" /><span>Handmade gifts<br /><strong>Made with heart</strong></span></span>
          <span><Compass aria-hidden="true" /><span>Curated finds<br /><strong>Worth discovering</strong></span></span>
          <span><MapPin aria-hidden="true" /><span>Wentworth, NSW<br /><strong>Locally rooted</strong></span></span>
        </div>
        <section id="department-collection" aria-labelledby="department-collection-title" className="department-collection">
          <h2 id="department-collection-title">{selected.name} <span>/ {selected.subhead}</span></h2>
          {selected.id === 'custom' && <p className="department-studio-link">Make something your own. <a href="/studio">Open the design studio <ArrowUpRight size={16} aria-hidden="true" /></a></p>}
          <WestVinylProduct visible={selected.id === 'custom'} />
          <ProductList key={selected.id} department={selected} />
        </section>
      </main>
      <footer className="department-footer">
        <div className="shop-contact"><h2>Let's make it yours.</h2><p>Got an idea or looking for something special?</p><a href="/contact"><Mail size={18} aria-hidden="true" /> Get in touch <ArrowRight size={16} aria-hidden="true" /></a></div>
        <div className="shop-footer-brand"><ShopWordmark /><p>Locally rooted. Creatively driven.</p></div>
        <nav aria-label="Footer navigation"><a href="/policies">Studio policies</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/contact">Contact</a><span>West Vinyl Studio · Wentworth NSW · Australia</span></nav>
      </footer>
    </div>
  );
}
