import { useEffect, useMemo, useState } from 'react';
import {
  defaultSizeCm,
  PRODUCT_LABELS,
  PRODUCT_TYPES,
  productLimitLabel,
  quoteOrder,
  type DesignType,
  type PriceQuote,
  type ProductType,
  type QuoteResult,
  type ShippingOption,
  type TextDensity,
} from '../lib/pricing';

export interface QuoteDraft {
  product: ProductType;
  widthCm: number;
  heightCm: number;
  designType: DesignType;
  textDensity: TextDensity;
  shippingOption: ShippingOption;
  requiresPrep: boolean;
}

interface VinylPricingCalculatorProps {
  initialProduct?: ProductType;
  onQuote?: (state: { draft: QuoteDraft; result: QuoteResult }) => void;
}

const inputClass =
  'w-full rounded border border-slate-700 bg-[#0f111a] px-2 py-2 text-sm text-slate-100';

function money(value: number): string {
  return `$${value.toFixed(2)}`;
}

export function VinylPricingCalculator({
  initialProduct = 'decal',
  onQuote,
}: VinylPricingCalculatorProps) {
  const [product, setProduct] = useState<ProductType>(initialProduct);
  const [widthCm, setWidthCm] = useState(() => defaultSizeCm(initialProduct).widthCm);
  const [heightCm, setHeightCm] = useState(() => defaultSizeCm(initialProduct).heightCm);
  const [designType, setDesignType] = useState<DesignType>('graphic');
  const [textDensity, setTextDensity] = useState<TextDensity>('standard');
  const [requiresPrep, setRequiresPrep] = useState(false);
  const [shippingOption, setShippingOption] = useState<ShippingOption>('untracked');

  const area = widthCm * heightCm;

  useEffect(() => {
    if (Number.isFinite(area) && area <= 300) {
      // Quote spec: prep is only valid above 300 cm², so clear it when the area drops.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- required reset when area changes
      setRequiresPrep(false);
    }
  }, [area]);

  const draft = useMemo<QuoteDraft>(
    () => ({
      product,
      widthCm,
      heightCm,
      designType,
      textDensity,
      shippingOption,
      requiresPrep,
    }),
    [product, widthCm, heightCm, designType, textDensity, shippingOption, requiresPrep],
  );

  const pricing = useMemo(() => quoteOrder(draft), [draft]);

  useEffect(() => {
    onQuote?.({ draft, result: pricing });
  }, [draft, pricing, onQuote]);

  const showPrep = pricing.ok && pricing.quote.areaCm2 > 300;

  return (
    <section
      className="mx-auto w-full max-w-md rounded-lg border border-slate-800 bg-[#181a25] p-4 text-slate-200 shadow-md"
      data-testid="vinyl-pricing-calculator"
    >
      <header className="mb-4">
        <h3 className="font-mono text-base text-white">West Vinyl Studio Instant Quote</h3>
      </header>

      <div className="space-y-4">
        <label className="block space-y-1">
          <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">Product</span>
          <select
            aria-label="Product"
            value={product}
            onChange={(event) => {
              const next = event.target.value as ProductType;
              setProduct(next);
              if (quoteOrder({ ...draft, product: next }).ok === false) {
                const size = defaultSizeCm(next);
                setWidthCm(size.widthCm);
                setHeightCm(size.heightCm);
              }
            }}
            className={inputClass}
          >
            {PRODUCT_TYPES.map((id) => (
              <option key={id} value={id}>
                {PRODUCT_LABELS[id]}
              </option>
            ))}
          </select>
        </label>

        <div className="space-y-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">Size (cm)</span>
            <span className="font-mono text-[10px] text-slate-500">
              Min 2x2cm · {productLimitLabel(product)}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-[10px] text-slate-500 uppercase">Width</span>
              <input
                aria-label="Width"
                type="number"
                min={2}
                step="0.1"
                inputMode="decimal"
                value={Number.isFinite(widthCm) ? widthCm : ''}
                onChange={(event) => setWidthCm(event.target.value === '' ? Number.NaN : Number(event.target.value))}
                className={inputClass}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[10px] text-slate-500 uppercase">Height</span>
              <input
                aria-label="Height"
                type="number"
                min={2}
                step="0.1"
                inputMode="decimal"
                value={Number.isFinite(heightCm) ? heightCm : ''}
                onChange={(event) => setHeightCm(event.target.value === '' ? Number.NaN : Number(event.target.value))}
                className={inputClass}
              />
            </label>
          </div>
        </div>

        <label className="block space-y-1">
          <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">Design category</span>
          <select
            aria-label="Design category"
            value={designType}
            onChange={(event) => setDesignType(event.target.value as DesignType)}
            className={inputClass}
          >
            <option value="text">Just Words / Text</option>
            <option value="graphic">Standard Graphic</option>
            <option value="intricate">Intricate Detail</option>
          </select>
        </label>

        {designType === 'text' ? (
          <label className="block space-y-1">
            <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">Text layout</span>
            <select
              aria-label="Text layout"
              value={textDensity}
              onChange={(event) => setTextDensity(event.target.value as TextDensity)}
              className={inputClass}
            >
              <option value="standard">Standard Text (2cm+ tall, under 15 words)</option>
              <option value="dense">Dense Text (15+ words / high cut count) +$5 Labor</option>
            </select>
          </label>
        ) : null}

        {showPrep ? (
          <label className="flex items-center gap-2 text-sm text-slate-200">
            <input
              type="checkbox"
              checked={requiresPrep}
              onChange={(event) => setRequiresPrep(event.target.checked)}
              className="accent-[#FF1493]"
            />
            Requires Substrate Prep (+$10)
          </label>
        ) : null}

        {product === 'decal' ? (
          <fieldset className="space-y-2">
            <legend className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">Shipping</legend>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="shippingOption"
                checked={shippingOption === 'untracked'}
                onChange={() => setShippingOption('untracked')}
                className="accent-[#FF1493]"
              />
              Untracked Rigid Post ($4.00)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="shippingOption"
                checked={shippingOption === 'tracked'}
                onChange={() => setShippingOption('tracked')}
                className="accent-[#FF1493]"
              />
              Tracked Parcel Mailer ($10.00)
            </label>
          </fieldset>
        ) : (
          <p className="text-sm text-slate-300">Standard AusPost Parcel ($12.00)</p>
        )}

        {!pricing.ok ? <p className="text-sm font-bold text-red-500">{pricing.error}</p> : <QuoteBreakdown quote={pricing.quote} />}
      </div>

      <footer className="mt-4 border-t border-slate-800 pt-3 text-xs text-slate-500">
        All prices in AUD. West Vinyl Studio.
      </footer>
    </section>
  );
}

function QuoteBreakdown({ quote }: { quote: PriceQuote }) {
  return (
    <div className="space-y-2 border-t border-slate-800 pt-3 font-mono text-sm">
      <div className="flex justify-between gap-3 text-slate-300">
        <span>Dimensions & area</span>
        <span>
          {quote.widthCm}×{quote.heightCm} cm · {quote.areaCm2} cm²
        </span>
      </div>
      <div className="flex justify-between gap-3 text-slate-300">
        <span>Product / customisation</span>
        <span>{money(quote.subtotal)}</span>
      </div>
      <div className="flex justify-between gap-3 text-slate-300">
        <span>Shipping</span>
        <span>{money(quote.shipping)}</span>
      </div>
      <div className="flex items-baseline justify-between gap-3 pt-1 text-lg font-bold text-[#FF1493]">
        <span>Grand Total</span>
        <span data-testid="quote-grand-total">{money(quote.total)}</span>
      </div>
    </div>
  );
}
