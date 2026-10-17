import { useEffect } from 'react';

export const ROUTE_META: Record<string, { title: string; description: string }> = {
  '/policies': {
    title: 'Store Policies, Pricing & Shipping Overview | West Vinyl Studio',
    description: 'Review West Vinyl Studio policies for custom vinyl decals and heat-pressed apparel. AUD pricing, Australia Post shipping rates, and ordering guidelines.',
  },
  '/terms': {
    title: 'Terms of Service, Shipping & Returns | West Vinyl Studio',
    description: 'Read the terms for custom vinyl stickers and apparel from West Vinyl Studio, including shipping, Stripe checkout, and Australian Consumer Law return rights.',
  },
  '/privacy': {
    title: 'Privacy Policy & Data Protection | West Vinyl Studio',
    description: 'Learn how West Vinyl Studio handles contact details, shipping information, uploaded artwork, analytics cookies, and payments through Stripe Checkout.',
  },
  '/contact': {
    title: 'Contact | West Vinyl Studio',
    description: 'Contact West Vinyl Studio in Wentworth, NSW, about custom vinyl decals, apparel, or your order. Find our email and phone details.',
  },
};

/** Keep the static home metadata intact and restore it when leaving an info page. */
export function useRouteMeta(pathname: string) {
  useEffect(() => {
    const meta = ROUTE_META[pathname];
    if (!meta) return;
    const previousTitle = document.title;
    const changes: Array<() => void> = [];
    function update(selector: string, attribute: string, value: string) {
      const element = document.head.querySelector(selector);
      if (!element) return;
      const previous = element.getAttribute(attribute);
      element.setAttribute(attribute, value);
      changes.push(() => {
        if (previous === null) element.removeAttribute(attribute);
        else element.setAttribute(attribute, previous);
      });
    }
    const url = `https://westvinylstudio.com${pathname}`;
    document.title = meta.title;
    for (const selector of ['meta[name="title"]', 'meta[property="og:title"]', 'meta[name="twitter:title"]']) {
      update(selector, 'content', meta.title);
    }
    for (const selector of ['meta[name="description"]', 'meta[property="og:description"]', 'meta[name="twitter:description"]']) {
      update(selector, 'content', meta.description);
    }
    update('link[rel="canonical"]', 'href', url);
    update('meta[property="og:url"]', 'content', url);
    update('meta[name="twitter:url"]', 'content', url);
    return () => {
      document.title = previousTitle;
      changes.forEach(restore => restore());
    };
  }, [pathname]);
}
