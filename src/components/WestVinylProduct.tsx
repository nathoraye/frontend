import { useEffect, useRef, useState } from 'react';

const SCRIPT_URL = 'https://sdks.shopifycdn.com/buy-button/latest/buy-button-storefront.min.js';
const PRODUCT_ID = '15289649725681';

type BuyUI = {
  createComponent(type: string, config: Record<string, unknown>): Promise<unknown>;
  destroyComponent(type: string, id?: string): void;
};
type BuySDK = {
  buildClient(config: { domain: string; storefrontAccessToken: string }): unknown;
  UI: { onReady(client: unknown): Promise<BuyUI> };
};

let sdkPromise: Promise<BuySDK> | undefined;
function loadSDK() {
  if (!sdkPromise) {
    sdkPromise = new Promise<BuySDK>((resolve, reject) => {
      const sdk = () => (window as Window & { ShopifyBuy?: BuySDK }).ShopifyBuy;
      if (sdk()?.UI) { resolve(sdk()!); return; }
      const script = document.createElement('script');
      script.src = SCRIPT_URL;
      script.async = true;
      script.onload = () => sdk()?.UI ? resolve(sdk()!) : reject(new Error('Buy Button unavailable'));
      script.onerror = () => { script.remove(); reject(new Error('Buy Button unavailable')); };
      document.head.appendChild(script);
    }).catch(error => { sdkPromise = undefined; throw error; });
  }
  return sdkPromise;
}

const button = {
  color: '#e9f9f5',
  'background-color': '#48472c',
  ':hover': { color: '#e9f9f5', 'background-color': '#414028' },
  ':focus': { 'background-color': '#414028' },
  'border-radius': '15px',
};
const productButton = { ...button, 'padding-left': '51px', 'padding-right': '51px' };

export default function WestVinylProduct({ visible }: { visible: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const token = import.meta.env.VITE_SHOPIFY_BUY_BUTTON_STOREFRONT_TOKEN;
  const [state, setState] = useState<'loading' | 'ready' | 'error'>(token ? 'loading' : 'error');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!token || !host.current) return;
    let cancelled = false;
    let ui: BuyUI | undefined;
    const node = document.createElement('div');
    node.id = 'product-component-1794598038871';
    host.current.appendChild(node);
    // Serialise teardown after creation so an unmount cannot leave a late cart behind.
    const setup = (async () => {
      const sdk = await loadSDK();
      if (cancelled) return;
      ui = await sdk.UI.onReady(sdk.buildClient({ domain: 'stdgmt-5m.myshopify.com', storefrontAccessToken: token }));
      if (cancelled) return;
      await ui.createComponent('product', {
        id: PRODUCT_ID, node, moneyFormat: '%24%7B%7Bamount%7D%7D',
        options: {
          product: {
            styles: {
              product: { '@media (min-width: 601px)': { 'max-width': '100%', 'margin-left': '0px', 'margin-bottom': '24px' } },
              title: { color: '#f4f2f7' }, price: { color: '#f4f2f7' },
              button: productButton,
            },
            text: { button: 'Add to cart' },
          },
          modalProduct: {
            contents: { img: false, imgWithCarousel: true, button: false, buttonWithQuantity: true },
            styles: { product: { '@media (min-width: 601px)': { 'max-width': '100%', 'margin-left': '0px', 'margin-bottom': '0px' } }, button: productButton },
            text: { button: 'Add to cart' },
          },
          cart: { styles: { button }, text: { total: 'Subtotal', button: 'Checkout' } },
          toggle: { styles: {
            toggle: { 'background-color': '#48472c', ':hover': { 'background-color': '#414028' }, ':focus': { 'background-color': '#414028' } },
            count: { color: '#e9f9f5', ':hover': { color: '#e9f9f5' } }, iconPath: { fill: '#e9f9f5' },
          } },
        },
      });
      if (!cancelled) setState('ready');
    })();
    void setup.catch(() => { if (!cancelled) setState('error'); });
    return () => {
      cancelled = true;
      void setup.catch(() => {}).finally(() => {
        ui?.destroyComponent('product', PRODUCT_ID);
        ui?.destroyComponent('cart');
        ui?.destroyComponent('toggle');
        ui?.destroyComponent('modal');
        node.remove();
      });
    };
  }, [token, attempt]);

  return (
    <section hidden={!visible} aria-label="Featured West Vinyl product" className="west-vinyl-buy-button">
      {state === 'loading' && <p role="status">Loading featured product…</p>}
      {state === 'error' && <div className="department-status">
        <p>This product is not available to order online right now.</p>
        {token && <button type="button" onClick={() => { setState('loading'); setAttempt(value => value + 1); }}>Retry product</button>}
        <a href="/contact">Enquire about this product</a>
      </div>}
      <div ref={host} hidden={state === 'error'} />
    </section>
  );
}
