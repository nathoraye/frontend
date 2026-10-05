/**
 * GA4 collect hits.
 * gtag.js only delivers the first GA4 hit on a page in current Chrome, so
 * ecommerce events are posted straight to /g/collect. The query matches the
 * hit gtag itself builds (currency, value, event id, items, transaction id).
 */

export interface Ga4CollectItem {
  id: string;
  name: string;
  quantity: number;
  price?: number;
}

export interface Ga4CollectInput {
  measurementId: string;
  clientId: string;
  eventName: string;
  pageLocation: string;
  pageTitle: string;
  language: string;
  screen: string;
  sessionId: string;
  hitIndex: number;
  pageLoadId: string;
  sessionStart?: boolean;
  firstVisit?: boolean;
  currency?: string;
  value?: number;
  eventId?: string;
  transactionId?: string;
  items?: Ga4CollectItem[];
}

function cleanProduct(value: string): string {
  return value.replace(/~/g, ' ').replace(/&/g, ' ').slice(0, 100);
}

export function buildGa4CollectUrl(input: Ga4CollectInput): string {
  const query = new URLSearchParams();
  query.set('v', '2');
  query.set('tid', input.measurementId);
  query.set('cid', input.clientId);
  query.set('en', input.eventName);
  query.set('_p', input.pageLoadId);
  query.set('_s', String(input.hitIndex));
  query.set('dl', input.pageLocation);
  query.set('dt', input.pageTitle.slice(0, 150));
  query.set('ul', input.language.toLowerCase());
  query.set('sr', input.screen);
  query.set('sid', input.sessionId);
  query.set('sct', '1');
  query.set('seg', '1');
  if (input.sessionStart) query.set('_ss', '1');
  if (input.firstVisit) query.set('_fv', '1');
  if (input.currency) query.set('cu', input.currency);
  if (typeof input.value === 'number' && Number.isFinite(input.value)) {
    query.set('epn.value', String(input.value));
  }
  if (input.eventId) query.set('evnid', input.eventId);
  if (input.transactionId) query.set('ep.transaction_id', input.transactionId);
  for (const [index, item] of (input.items || []).entries()) {
    const quantity = item.quantity > 0 ? item.quantity : 1;
    let product = `id${cleanProduct(item.id)}~nm${cleanProduct(item.name)}~qt${quantity}`;
    if (typeof item.price === 'number' && Number.isFinite(item.price)) {
      product += `~pr${item.price}`;
    }
    query.set(`pr${index + 1}`, product);
  }
  return `https://www.google-analytics.com/g/collect?${query.toString()}`;
}
