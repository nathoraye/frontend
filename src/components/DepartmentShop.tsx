import { useEffect, useState, type CSSProperties } from 'react';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { DEPARTMENTS, type Department } from '../config/departments';
import './DepartmentShop.css';

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
      <p>No products are available in {department.name} yet.</p>
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

export default function DepartmentShop() {
  const initial = DEPARTMENTS.find(department => department.handle === new URLSearchParams(window.location.search).get('department')) || DEPARTMENTS[0];
  const [selected, setSelected] = useState(initial);
  const accent = { '--department-accent': selected.accentColor } as CSSProperties;
  return (
    <div className="department-shop" style={accent}>
      <header className="department-header">
        <a className="department-wordmark" href="/">West Vinyl Studio</a>
        <nav aria-label="Site navigation"><a href="/">Design studio <ArrowUpRight size={16} aria-hidden="true" /></a><a href="/contact">Contact</a></nav>
      </header>
      <main id="main-content">
        <div className="department-intro">
          <h1>Custom. Crafted.<br />Collected.</h1>
          <p>Explore West Vinyl, West Made and West Finds.<br />Choose your department to see what’s available.</p>
        </div>
        <div className="department-directory" aria-label="Departments">
          {DEPARTMENTS.map(department => (
            <section key={department.id} style={{ '--department-accent': department.accentColor } as CSSProperties} className="department-summary">
              <h2>{department.name}<span>{department.subhead}</span></h2>
              <p className="department-tagline">{department.tagline}</p>
              <ul>{department.features.map(feature => <li key={feature}>{feature}</li>)}</ul>
              <button type="button" aria-pressed={selected.id === department.id} aria-controls="department-collection" onClick={() => {
                setSelected(department);
                const url = new URL(window.location.href);
                url.searchParams.set('department', department.handle);
                window.history.replaceState(null, '', url);
              }}>
                {selected.id === department.id ? 'Viewing products' : 'Explore products'} <ArrowRight size={18} aria-hidden="true" />
              </button>
            </section>
          ))}
        </div>
        <section id="department-collection" aria-labelledby="department-collection-title" className="department-collection">
          <h2 id="department-collection-title">{selected.name} <span>/ {selected.subhead}</span></h2>
          {selected.id === 'custom' && <p className="department-studio-link">Make something your own. <a href="/">Open the design studio <ArrowUpRight size={16} aria-hidden="true" /></a></p>}
          <ProductList key={selected.id} department={selected} />
        </section>
      </main>
      <footer className="department-footer"><a href="/policies">Studio policies</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/contact">Contact</a></footer>
    </div>
  );
}
