import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import * as fabric from 'fabric';
import { createCheckoutSession, fetchCheckoutHealth } from '../services/orderService';
import { notifyStudio } from '../utils/studioNotice';
import { snapshotDesignAsDataURL } from '../utils/designSnapshot';
import { serializeDesignSvgForOrder } from '../utils/orderDesignSerialize';
import {
  catalogIdForProduct,
  chargedTotal,
  defaultSizeCm,
  productTypeFromCatalog,
  quoteOrder,
  type QuoteResult,
  type ShippingOption,
} from '../lib/pricing';
import type { ProductPlacement } from '../utils/apparelPlacement';
import { ApparelMockupViewer } from './ApparelMockupViewer';
import { VinylPricingCalculator, type QuoteDraft } from './VinylPricingCalculator';
import {
  isSizedProduct,
  PRODUCT_CATALOG,
  type ProductId,
} from '../three/productCatalog';
import { checkoutAnalyticsPayload, newEventId } from '../analytics/attribution';
import { trackAddToCart, trackBeginCheckout, trackViewItem } from '../analytics/track';

type OrderType = 'vinyl' | 'product';
type CheckoutStep = 1 | 2;

interface PrintConfig {
  scale: number;
  posX: number;
  posY: number;
  rotationDeg: number;
}

interface CustomerFormValues {
  fullName: string;
  email: string;
  phone?: string;
  street: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
}

interface OrderConfig {
  orderType: OrderType;
  productId?: ProductId;
  productColor?: string;
  productSize?: string;
  printConfigs: Record<string, PrintConfig>;
  quantity: number;
}

function initialQuote(isApparel: boolean, preview?: OrderPreviewState): { draft: QuoteDraft; result: QuoteResult } {
  const product = isApparel
    ? productTypeFromCatalog(preview?.productId ?? 'tshirt') ?? 'tee'
    : 'decal';
  const fallback = defaultSizeCm(product);
  const draft: QuoteDraft = {
    product,
    widthCm: preview?.widthCm ?? fallback.widthCm,
    heightCm: preview?.heightCm ?? fallback.heightCm,
    designType: 'graphic',
    textDensity: 'standard',
    shippingOption: preview?.shippingOption ?? 'untracked',
  };
  return { draft, result: quoteOrder(draft) };
}

/** Snapshot of Product Preview when opening checkout. */
export interface OrderPreviewState {
  productId: ProductId;
  productColor: string;
  productSize?: string;
  activeView: string;
  placement: ProductPlacement;
  widthCm: number;
  heightCm: number;
  shippingOption?: ShippingOption;
}

interface OrderModalProps {
  canvas: fabric.Canvas;
  initialTab?: 'vinyl' | 'apparel';
  preview?: OrderPreviewState;
  onClose: () => void;
}

const DEFAULT_PRINT_CONFIG: PrintConfig = {
  scale: 1,
  posX: 0,
  posY: 0,
  rotationDeg: 0,
};

const COUNTRIES = [
  'Australia',
  'United States',
  'United Kingdom',
  'Canada',
  'New Zealand',
  'Other',
];

function printConfigsForProduct(
  productId: ProductId,
  seedView?: string,
  seedPlacement?: ProductPlacement,
): Record<string, PrintConfig> {
  return Object.fromEntries(
    PRODUCT_CATALOG[productId].views.map((view) => [
      view.id,
      seedView && seedPlacement && view.id === seedView
        ? { ...seedPlacement }
        : { ...DEFAULT_PRINT_CONFIG },
    ]),
  );
}

function QuantityControls({
  quantity,
  onChange,
}: {
  quantity: number;
  onChange: (qty: number) => void;
}) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-mono text-gray-300">Quantity</label>
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => onChange(Math.max(1, quantity - 1))}
          className="px-3 py-1 bg-gray-800 text-pink-500 border border-pink-500 rounded hover:bg-pink-500 hover:text-gray-900 transition"
        >
          −
        </button>
        <span className="font-mono text-lg text-gray-300 w-8 text-center">{quantity}</span>
        <button
          type="button"
          onClick={() => onChange(Math.min(100, quantity + 1))}
          className="px-3 py-1 bg-gray-800 text-pink-500 border border-pink-500 rounded hover:bg-pink-500 hover:text-gray-900 transition"
        >
          +
        </button>
      </div>
    </div>
  );
}

function StepVinylOptions({
  config,
  onConfigChange,
  designDataUrl,
  initialProduct,
  widthCm,
  heightCm,
  shippingOption,
  onQuote,
}: {
  config: OrderConfig;
  onConfigChange: (config: OrderConfig) => void;
  designDataUrl: string | null;
  initialProduct: QuoteDraft['product'];
  widthCm: number;
  heightCm: number;
  shippingOption: ShippingOption;
  onQuote: (state: { draft: QuoteDraft; result: QuoteResult }) => void;
}) {
  return (
    <div className="space-y-6">
      <h3 className="text-lg font-mono text-pink-500">Sticker options</h3>
      <p className="text-xs font-mono text-gray-400">
        Size, shipping, and price come from the sticker screen. Artwork comes from your studio design.
        The server prices the job again before Stripe.
      </p>
      {designDataUrl ? (
        <img
          src={designDataUrl}
          alt="Studio design"
          className="mx-auto max-h-28 rounded border border-slate-800 bg-[#0f111a] object-contain"
        />
      ) : null}
      <VinylPricingCalculator
        initialProduct={initialProduct}
        locked={{ product: initialProduct, widthCm, heightCm, shippingOption }}
        onQuote={onQuote}
      />
      <QuantityControls
        quantity={config.quantity}
        onChange={(quantity) => onConfigChange({ ...config, quantity })}
      />
    </div>
  );
}

function StepApparelReview({
  config,
  onConfigChange,
  designDataUrl,
  activeView,
  initialProduct,
  widthCm,
  heightCm,
  onQuote,
}: {
  config: OrderConfig;
  onConfigChange: (config: OrderConfig) => void;
  designDataUrl: string | null;
  activeView: string;
  initialProduct: QuoteDraft['product'];
  widthCm: number;
  heightCm: number;
  onQuote: (state: { draft: QuoteDraft; result: QuoteResult }) => void;
}) {
  const product = config.productId ? PRODUCT_CATALOG[config.productId] : undefined;
  if (!product) return null;

  const placement = config.printConfigs[activeView] ?? DEFAULT_PRINT_CONFIG;

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-mono text-pink-500">Review your apparel</h3>
      <p className="text-xs font-mono text-gray-400">
        Colour, garment size, and print placement come from Product Preview. Go back there to
        change them.
      </p>

      <div className="bg-gray-800 p-4 rounded border border-gray-700 space-y-2 text-sm font-mono text-gray-300">
        <div className="flex justify-between gap-4">
          <span>Product</span>
          <span className="text-pink-400">{product.label}</span>
        </div>
        <div className="flex justify-between items-center gap-4">
          <span>Colour</span>
          <span className="flex items-center gap-2">
            <span
              className="inline-block w-4 h-4 rounded-full border border-gray-600"
              style={{ backgroundColor: config.productColor || product.colorOptions[0] }}
            />
            <span className="text-pink-400">{config.productColor || product.colorOptions[0]}</span>
          </span>
        </div>
        {isSizedProduct(product.id) && (
          <div className="flex justify-between gap-4">
            <span>Garment size</span>
            <span className="text-pink-400">{config.productSize || 'M'}</span>
          </div>
        )}
        <div className="flex justify-between gap-4">
          <span>Print view</span>
          <span className="text-pink-400 capitalize">{activeView}</span>
        </div>
      </div>

      <div className="bg-gray-900 rounded border border-gray-700 h-64 pointer-events-none">
        <ApparelMockupViewer
          productId={product.id}
          color={config.productColor || product.colorOptions[0]}
          activeView={activeView}
          designDataUrl={designDataUrl}
          placement={placement}
          interactive={false}
        />
      </div>

      <QuantityControls
        quantity={config.quantity}
        onChange={(quantity) => onConfigChange({ ...config, quantity })}
      />

      <VinylPricingCalculator
        initialProduct={initialProduct}
        locked={{ product: initialProduct, widthCm, heightCm }}
        onQuote={onQuote}
      />
    </div>
  );
}

function StepShippingPayment({
  config,
  quote,
  onConfirm,
  isProcessing,
}: {
  config: OrderConfig;
  quote: QuoteResult;
  onConfirm: (customer: CustomerFormValues) => Promise<void>;
  isProcessing: boolean;
}) {
  const {
    register,
    formState: { errors, isValid },
    getValues,
  } = useForm<CustomerFormValues>({ mode: 'onChange' });

  const item = quote.ok ? quote.quote.subtotal : 0;
  const shipping = quote.ok ? quote.quote.shipping : 0;
  const totalPrice = quote.ok ? chargedTotal(quote.quote, config.quantity) : 0;
  const [stripeReady, setStripeReady] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchCheckoutHealth()
      .then((health) => {
        if (!cancelled) setStripeReady(Boolean(health.checkout?.stripe));
      })
      .catch(() => {
        if (!cancelled) setStripeReady(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-mono text-pink-500">Shipping & Payment</h3>

      <div className="bg-gray-800 p-4 rounded border border-gray-700 space-y-2 text-sm font-mono">
        {quote.ok ? (
          <>
            <div className="flex justify-between text-gray-300">
              <span>Product / customisation:</span>
              <span>${item.toFixed(2)} AUD</span>
            </div>
            <div className="flex justify-between text-gray-300">
              <span>Qty:</span>
              <span>{config.quantity}×</span>
            </div>
            <div className="flex justify-between text-gray-300">
              <span>Shipping:</span>
              <span>${shipping.toFixed(2)} AUD</span>
            </div>
            <div className="border-t border-gray-700 pt-2 flex justify-between text-pink-500 text-lg font-bold">
              <span>Grand Total:</span>
              <span>${totalPrice.toFixed(2)} AUD</span>
            </div>
          </>
        ) : (
          <p className="font-bold text-red-500">{quote.error}</p>
        )}
      </div>

      {/* Div, not a form: Chrome's "Save address?" prompt treats a form submit as a
          navigation and reloads the studio before we can redirect to /order/success. */}
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4 pb-28">
          <input
            {...register('fullName', { required: 'Full name required' })}
            placeholder="Full Name"
            className="col-span-2 px-3 py-2 bg-gray-800 text-gray-100 font-mono text-sm border border-gray-700 rounded"
          />
          {errors.fullName && (
            <span className="col-span-2 text-red-400 text-xs">{errors.fullName.message}</span>
          )}

          <input
            {...register('email', {
              required: 'Email required',
              pattern: {
                value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                message: 'Invalid email',
              },
            })}
            placeholder="Email"
            className="col-span-2 px-3 py-2 bg-gray-800 text-gray-100 font-mono text-sm border border-gray-700 rounded"
          />
          {errors.email && (
            <span className="col-span-2 text-red-400 text-xs">{errors.email.message}</span>
          )}

          <input
            {...register('phone')}
            placeholder="Phone (optional)"
            className="col-span-2 px-3 py-2 bg-gray-800 text-gray-100 font-mono text-sm border border-gray-700 rounded"
          />

          <input
            {...register('street', { required: 'Street required' })}
            placeholder="Street Address"
            className="col-span-2 px-3 py-2 bg-gray-800 text-gray-100 font-mono text-sm border border-gray-700 rounded"
          />
          {errors.street && (
            <span className="col-span-2 text-red-400 text-xs">{errors.street.message}</span>
          )}

          <input
            {...register('city', { required: 'City required' })}
            placeholder="City"
            className="px-3 py-2 bg-gray-800 text-gray-100 font-mono text-sm border border-gray-700 rounded"
          />
          <input
            {...register('state', { required: 'State/Region required' })}
            placeholder="State/Region"
            className="px-3 py-2 bg-gray-800 text-gray-100 font-mono text-sm border border-gray-700 rounded"
          />

          <input
            {...register('postcode', { required: 'Postcode required' })}
            placeholder="Postcode"
            className="px-3 py-2 bg-gray-800 text-gray-100 font-mono text-sm border border-gray-700 rounded"
          />
          <select
            id="order-country"
            aria-label="Country"
            {...register('country', { required: 'Country required' })}
            className="px-3 py-2 bg-gray-800 text-gray-100 font-mono text-sm border border-gray-700 rounded"
          >
            <option value="">Country</option>
            {COUNTRIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="sticky bottom-0 z-10 -mx-6 border-t border-gray-800 bg-gray-900 px-6 pt-3">
          {!quote.ok || !isValid || isProcessing ? (
            <div className="p-3 bg-red-900 bg-opacity-20 border border-red-700 rounded text-red-400 text-sm font-mono">
              {isProcessing
                ? stripeReady === false
                  ? 'Saving job…'
                  : 'Redirecting to Stripe Checkout…'
                : !quote.ok
                  ? quote.error
                  : 'Please fill in all required fields to proceed to payment.'}
            </div>
          ) : (
            <div className="space-y-2">
              {stripeReady === false ? (
                <p className="text-xs font-mono text-amber-400">
                  Stripe secret key not set — saving an unverified local job so you can still open
                  it on the Jobs board.
                </p>
              ) : (
                <p className="text-xs font-mono text-gray-400">
                  You will be redirected to Stripe Checkout to pay. We make the sticker or iron-on
                  after payment and ship it to this address.{' '}
                  <a className="text-pink-300 hover:text-pink-200" href="/terms">
                    Shipping and returns
                  </a>
                  {' · '}
                  <a className="text-pink-300 hover:text-pink-200" href="/privacy">
                    Privacy
                  </a>
                </p>
              )}
              <button
                type="button"
                onClick={() => void onConfirm(getValues())}
                className="w-full px-4 py-3 font-mono text-sm bg-pink-500 text-gray-900 rounded hover:bg-pink-600 transition"
              >
                {stripeReady === false ? 'Complete order (local)' : 'Pay with Stripe'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


export function OrderModal({ canvas, initialTab, preview, onClose }: OrderModalProps) {
  const isApparel = initialTab === 'apparel';
  const [step, setStep] = useState<CheckoutStep>(1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeView] = useState(
    () =>
      preview?.activeView ??
      PRODUCT_CATALOG[preview?.productId ?? 'tshirt'].views[0]?.id ??
      'front',
  );

  const [config, setConfig] = useState<OrderConfig>(() => {
    if (isApparel) {
      const productId = preview?.productId ?? 'tshirt';
      return {
        orderType: 'product',
        quantity: 1,
        productId,
        productColor: preview?.productColor ?? PRODUCT_CATALOG[productId].colorOptions[0],
        productSize: preview?.productSize ?? (isSizedProduct(productId) ? 'M' : undefined),
        printConfigs: printConfigsForProduct(productId, preview?.activeView, preview?.placement),
      };
    }
    return {
      orderType: 'vinyl',
      quantity: 1,
      printConfigs: {},
    };
  });
  const [quoteState, setQuoteState] = useState(() => initialQuote(isApparel, preview));
  const cartTracked = useRef(false);
  useEffect(() => {
    if (cartTracked.current || !quoteState.result.ok) return;
    cartTracked.current = true;
    const itemId = isApparel ? (config.productId ?? 'apparel') : 'decal';
    const itemName = isApparel
      ? PRODUCT_CATALOG[config.productId ?? 'tshirt'].label
      : 'Custom decal';
    const value = chargedTotal(quoteState.result.quote, config.quantity);
    const item = { itemId, itemName, value, quantity: config.quantity };
    trackViewItem(item);
    trackAddToCart(item);
  }, [config.productId, config.quantity, isApparel, quoteState.result]);
  const onQuote = useCallback((state: { draft: QuoteDraft; result: QuoteResult }) => {
    setQuoteState(state);
  }, []);

  const designDataUrl = useMemo(() => {
    try {
      return snapshotDesignAsDataURL(canvas);
    } catch (error) {
      console.error('Failed to snapshot design for checkout:', error);
      return null;
    }
  }, [canvas]);

  const handleConfirm = async (customer: CustomerFormValues) => {
    setIsProcessing(true);
    try {
      if (!quoteState.result.ok) {
        throw new Error(quoteState.result.error);
      }
      const draft = quoteState.draft;
      const designSvg = await serializeDesignSvgForOrder(canvas);
      const designPreviewPng = designDataUrl || snapshotDesignAsDataURL(canvas) || undefined;
      const pricedProductId =
        draft.product === 'decal'
          ? undefined
          : catalogIdForProduct(draft.product, config.productId);
      const eventId = newEventId();
      const result = await createCheckoutSession({
        analytics: checkoutAnalyticsPayload(eventId),
        customer: {
          fullName: customer.fullName,
          email: customer.email,
          phone: customer.phone,
          street: customer.street,
          city: customer.city,
          state: customer.state,
          postcode: customer.postcode,
          country: customer.country,
        },
        orderConfig: {
          orderType: draft.product === 'decal' ? 'vinyl' : 'product',
          quantity: config.quantity,
          productType: draft.product,
          widthCm: draft.widthCm,
          heightCm: draft.heightCm,
          designType: draft.designType,
          textDensity: draft.textDensity,
          shippingOption: draft.shippingOption,
          productId: pricedProductId,
          productColor: config.productColor,
          productSize: config.productSize,
          printConfigs: config.printConfigs,
        },
        designSvg,
        designPreviewPng,
        origin: window.location.origin,
      });
      if (!result.url) {
        throw new Error('Checkout did not return a redirect URL');
      }
      const go = () => window.location.assign(result.url);
      if (result.unverified) {
        go();
        return;
      }
      const amount = Number(result.amount);
      const itemId = draft.product === 'decal' ? 'decal' : String(pricedProductId || draft.product);
      const itemName =
        draft.product === 'decal'
          ? 'Custom decal'
          : PRODUCT_CATALOG[config.productId ?? 'tshirt'].label;
      trackBeginCheckout(
        {
          eventId: result.eventId || eventId,
          value: amount,
          item: { itemId, itemName, quantity: config.quantity, value: amount },
        },
        go,
      );
    } catch (error) {
      console.error('Checkout session failed:', error);
      notifyStudio({
        tone: 'error',
        title: 'Checkout not started',
        detail: error instanceof Error ? error.message : 'Try again in a moment.',
      });
      setIsProcessing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/75 p-0 sm:items-center sm:p-4"
      data-testid="order-checkout"
      role="dialog"
      aria-modal="true"
      aria-label="Checkout"
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        paddingLeft: 'env(safe-area-inset-left, 0px)',
        paddingRight: 'env(safe-area-inset-right, 0px)',
      }}
    >
      <div className="flex h-[100dvh] max-h-[100dvh] w-full max-w-2xl flex-col rounded-none border-0 border-gray-700 bg-gray-900 shadow-2xl sm:h-auto sm:max-h-[min(90vh,100dvh)] sm:rounded-lg sm:border">
        <div className="flex items-center justify-between border-b border-gray-700 p-4 sm:p-6">
          <div className="flex gap-4">
            {[1, 2].map((s) => (
              <div
                key={s}
                className={`flex h-8 w-8 items-center justify-center rounded-full font-mono text-sm transition ${
                  s === step
                    ? 'bg-pink-500 text-gray-900'
                    : s < step
                      ? 'bg-emerald-500 text-gray-900'
                      : 'bg-gray-700 text-gray-400'
                }`}
              >
                {s < step ? '✓' : s}
              </div>
            ))}
          </div>
          <button onClick={onClose} className="min-h-11 min-w-11 text-2xl text-gray-400 hover:text-gray-200 touch-manipulation">
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6">
          <div className={step === 1 ? 'block' : 'hidden'}>
            {isApparel ? (
              <StepApparelReview
                config={config}
                onConfigChange={setConfig}
                designDataUrl={designDataUrl}
                activeView={activeView}
                initialProduct={quoteState.draft.product}
                widthCm={quoteState.draft.widthCm}
                heightCm={quoteState.draft.heightCm}
                onQuote={onQuote}
              />
            ) : (
              <StepVinylOptions
                config={config}
                onConfigChange={setConfig}
                designDataUrl={designDataUrl}
                initialProduct="decal"
                widthCm={quoteState.draft.widthCm}
                heightCm={quoteState.draft.heightCm}
                shippingOption={quoteState.draft.shippingOption}
                onQuote={onQuote}
              />
            )}
          </div>
          {step === 2 && (
            <StepShippingPayment
              config={config}
              quote={quoteState.result}
              onConfirm={handleConfirm}
              isProcessing={isProcessing}
            />
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-gray-700 bg-gray-950 p-4 sm:p-6">
          <button
            onClick={() => setStep(1)}
            disabled={step === 1}
            className="min-h-11 rounded border border-gray-700 bg-gray-800 px-4 py-2 font-mono text-sm text-gray-300 transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50 touch-manipulation sm:px-6"
          >
            ← Back
          </button>

          <div className="text-sm font-mono text-gray-400">Step {step} / 2</div>

          {step < 2 ? (
            <button
              onClick={() => setStep(2)}
              disabled={!quoteState.result.ok}
              className="min-h-11 rounded bg-pink-500 px-4 py-2 font-mono text-sm text-gray-900 transition hover:bg-pink-600 touch-manipulation disabled:cursor-not-allowed disabled:opacity-50 sm:px-6"
            >
              Next →
            </button>
          ) : (
            <div className="px-3 py-2 font-mono text-xs text-gray-500">Pay above</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default OrderModal;
