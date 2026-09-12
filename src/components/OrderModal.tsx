import { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { PayPalScriptProvider, PayPalButtons } from '@paypal/react-paypal-js';
import type { OnApproveData } from '@paypal/paypal-js';
import * as fabric from 'fabric';
import { createPayPalCheckout, submitOrder } from '../services/orderService';
import { notifyStudio } from '../utils/studioNotice';
import { snapshotDesignAsDataURL } from '../utils/designSnapshot';
import {
  calculateOrderTotal,
  ORDER_CURRENCY,
  PERMANENT_SURCHARGE,
  SHIPPING_COST,
  UNIT_PRICES,
} from '../utils/orderPricing';
import { ApparelMockupViewer } from './ApparelMockupViewer';
import { VinylSizePreview } from './VinylSizePreview';
import { PRODUCT_CATALOG, PRODUCT_IDS, type ProductId } from '../three/productCatalog';

type OrderType = 'vinyl' | 'product';
type Step = 1 | 2 | 3;

const SIZED_PRODUCTS: ProductId[] = ['tshirt', 'hoodie', 'sloppyJoe', 'babyClothes'];

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
  vinylWidthCm?: number;
  vinylHeightCm?: number;
  vinylPermanent?: boolean;
  vinylFinish?: string;
  productId?: ProductId;
  productColor?: string;
  productSize?: string;
  printConfigs: Record<string, PrintConfig>;
  quantity: number;
  [key: string]: unknown;
}

interface OrderModalProps {
  canvas: fabric.Canvas;
  initialTab?: 'vinyl' | 'apparel';
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

function calculatePrice(config: OrderConfig): number {
  return calculateOrderTotal({
    orderType: config.orderType,
    quantity: config.quantity,
    vinylPermanent: config.vinylPermanent,
  });
}

function printConfigsForProduct(productId: ProductId): Record<string, PrintConfig> {
  const views = PRODUCT_CATALOG[productId].views;
  return Object.fromEntries(views.map((v) => [v.id, { ...DEFAULT_PRINT_CONFIG }]));
}

interface Step1Props {
  config: OrderConfig;
  onConfigChange: (config: OrderConfig) => void;
}

function Step1Configure({ config, onConfigChange }: Step1Props) {
  const handleQuantityChange = (qty: number) => {
    onConfigChange({ ...config, quantity: Math.max(1, Math.min(qty, 100)) });
  };

  const handleOrderTypeChange = (type: OrderType) => {
    if (type === 'product' && !config.productId) {
      onConfigChange({
        ...config,
        orderType: type,
        productId: 'tshirt',
        productColor: PRODUCT_CATALOG.tshirt.colorOptions[0],
        printConfigs: printConfigsForProduct('tshirt'),
      });
      return;
    }
    onConfigChange({ ...config, orderType: type });
  };

  const handleProductChange = (productId: ProductId) => {
    onConfigChange({
      ...config,
      productId,
      productColor: PRODUCT_CATALOG[productId].colorOptions[0],
      printConfigs: printConfigsForProduct(productId),
    });
  };

  const activeProduct = config.productId ? PRODUCT_CATALOG[config.productId] : undefined;

  return (
    <div className="space-y-6">
      <div className="flex gap-2 border-b border-pink-500">
        {(['vinyl', 'product'] as OrderType[]).map((type) => (
          <button
            key={type}
            onClick={() => handleOrderTypeChange(type)}
            className={`px-4 py-2 font-mono text-sm transition ${
              config.orderType === type
                ? 'text-pink-500 border-b-2 border-pink-500'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            {type === 'vinyl' ? 'Vinyl Sticker' : 'Custom Product'}
          </button>
        ))}
      </div>

      {config.orderType === 'vinyl' && (
        <div className="space-y-4">
          <label className="block text-sm font-mono text-gray-300">Size (cm)</label>
          <div className="flex gap-4">
            <input
              type="number"
              min="2"
              max="30"
              value={config.vinylWidthCm || 10}
              onChange={(e) => onConfigChange({ ...config, vinylWidthCm: parseFloat(e.target.value) })}
              className="w-20 px-2 py-1 bg-gray-800 text-gray-100 font-mono text-sm border border-gray-700 rounded"
              placeholder="W"
            />
            <span className="text-gray-500">×</span>
            <input
              type="number"
              min="2"
              max="30"
              value={config.vinylHeightCm || 10}
              onChange={(e) => onConfigChange({ ...config, vinylHeightCm: parseFloat(e.target.value) })}
              className="w-20 px-2 py-1 bg-gray-800 text-gray-100 font-mono text-sm border border-gray-700 rounded"
              placeholder="H"
            />
          </div>

          <label className="flex items-center gap-2 text-sm font-mono text-gray-300">
            <input
              type="checkbox"
              checked={config.vinylPermanent ?? false}
              onChange={(e) => onConfigChange({ ...config, vinylPermanent: e.target.checked })}
            />
            Permanent adhesive (+${PERMANENT_SURCHARGE.toFixed(2)})
          </label>

          {config.vinylPermanent && (
            <>
              <label htmlFor="order-vinyl-finish" className="block text-sm font-mono text-gray-300">Finish</label>
              <select
                id="order-vinyl-finish"
                value={config.vinylFinish || 'matte'}
                onChange={(e) => onConfigChange({ ...config, vinylFinish: e.target.value })}
                className="w-full px-3 py-2 bg-gray-800 text-gray-100 font-mono text-sm border border-gray-700 rounded"
              >
                <option value="matte">Matte</option>
                <option value="gloss">Gloss</option>
                <option value="metallic">Metallic</option>
              </select>
            </>
          )}
        </div>
      )}

      {config.orderType === 'product' && activeProduct && (
        <div className="space-y-4">
          <label htmlFor="order-product" className="block text-sm font-mono text-gray-300">Product</label>
          <select
            id="order-product"
            value={activeProduct.id}
            onChange={(e) => handleProductChange(e.target.value as ProductId)}
            className="w-full px-3 py-2 bg-gray-800 text-gray-100 font-mono text-sm border border-gray-700 rounded"
          >
            {PRODUCT_IDS.map((id) => (
              <option key={id} value={id}>{PRODUCT_CATALOG[id].label}</option>
            ))}
          </select>

          <label className="block text-sm font-mono text-gray-300">Colour</label>
          <div className="flex items-center gap-2">
            {activeProduct.colorOptions.map((c) => (
              <button
                key={c}
                onClick={() => onConfigChange({ ...config, productColor: c })}
                className={`w-7 h-7 rounded-full border-2 ${config.productColor === c ? 'border-pink-500' : 'border-gray-700'}`}
                style={{ backgroundColor: c }}
                title={c}
                aria-label={`Colour ${c}`}
              />
            ))}
          </div>

          {SIZED_PRODUCTS.includes(activeProduct.id) && (
            <>
              <label htmlFor="order-product-size" className="block text-sm font-mono text-gray-300">Size</label>
              <select
                id="order-product-size"
                value={config.productSize || 'M'}
                onChange={(e) => onConfigChange({ ...config, productSize: e.target.value })}
                className="w-full px-3 py-2 bg-gray-800 text-gray-100 font-mono text-sm border border-gray-700 rounded"
              >
                <option value="XS">XS</option>
                <option value="S">S</option>
                <option value="M">M</option>
                <option value="L">L</option>
                <option value="XL">XL</option>
                <option value="2XL">2XL</option>
              </select>
            </>
          )}
        </div>
      )}

      <div className="space-y-2">
        <label className="block text-sm font-mono text-gray-300">Quantity</label>
        <div className="flex items-center gap-4">
          <button
            onClick={() => handleQuantityChange(config.quantity - 1)}
            className="px-3 py-1 bg-gray-800 text-pink-500 border border-pink-500 rounded hover:bg-pink-500 hover:text-gray-900 transition"
          >
            −
          </button>
          <span className="font-mono text-lg text-gray-300 w-8 text-center">{config.quantity}</span>
          <button
            onClick={() => handleQuantityChange(config.quantity + 1)}
            className="px-3 py-1 bg-gray-800 text-pink-500 border border-pink-500 rounded hover:bg-pink-500 hover:text-gray-900 transition"
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}

interface Step2Props {
  config: OrderConfig;
  onConfigChange: (config: OrderConfig) => void;
  designDataUrl: string | null;
}

function Step2Placement({ config, onConfigChange, designDataUrl }: Step2Props) {
  const product = config.productId ? PRODUCT_CATALOG[config.productId] : undefined;
  const [activeView, setActiveView] = useState<string>(product?.views[0]?.id ?? 'front');

  if (config.orderType === 'vinyl') {
    return (
      <VinylSizePreview
        designDataUrl={designDataUrl}
        widthCm={config.vinylWidthCm || 10}
        heightCm={config.vinylHeightCm || 10}
        onSizeChange={(widthCm, heightCm) => onConfigChange({ ...config, vinylWidthCm: widthCm, vinylHeightCm: heightCm })}
      />
    );
  }

  if (!product) return null;

  const placement = config.printConfigs[activeView] ?? DEFAULT_PRINT_CONFIG;

  const updatePlacement = (patch: Partial<PrintConfig>) => {
    onConfigChange({
      ...config,
      printConfigs: { ...config.printConfigs, [activeView]: { ...placement, ...patch } },
    });
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-mono text-pink-500">Print Placement</h3>

      {product.views.length > 1 && (
        <div className="flex gap-2 border-b border-gray-700">
          {product.views.map((view) => (
            <button
              key={view.id}
              onClick={() => setActiveView(view.id)}
              className={`px-4 py-2 font-mono text-sm transition ${
                activeView === view.id
                  ? 'text-emerald-400 border-b-2 border-emerald-400'
                  : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              {view.label}
            </button>
          ))}
        </div>
      )}

      <div className="bg-gray-900 rounded border border-gray-700 h-72">
        <ApparelMockupViewer
          productId={product.id}
          color={config.productColor || product.colorOptions[0]}
          activeView={activeView}
          designDataUrl={designDataUrl}
          placement={placement}
          interactive
          onPlacementChange={(next) => updatePlacement(next)}
        />
      </div>
      <p className="text-[10px] font-mono text-slate-300">Drag the print anywhere on the garment. Pink corners scale. Green handle rotates.</p>
    </div>
  );
}

interface Step3Props {
  config: OrderConfig;
  onConfirm: (customer: CustomerFormValues, paypalOrderId: string) => Promise<void>;
  isProcessing: boolean;
}

function Step3Details({
  config,
  onConfirm,
  isProcessing,
}: Step3Props) {
  const {
    register,
    formState: { errors, isValid },
    getValues,
  } = useForm<CustomerFormValues>({
    mode: 'onChange',
  });

  const totalPrice = calculatePrice(config);
  const unitPrice = UNIT_PRICES[config.orderType] + (config.orderType === 'vinyl' && config.vinylPermanent ? PERMANENT_SURCHARGE : 0);
  const paypalClientId = import.meta.env.VITE_PAYPAL_CLIENT_ID as string | undefined;
  const localCheckout = !paypalClientId || paypalClientId === 'test' || paypalClientId.includes('your_paypal');

  const checkoutOrderConfig = {
    orderType: config.orderType,
    quantity: config.quantity,
    vinylPermanent: config.vinylPermanent,
    vinylWidthCm: config.vinylWidthCm,
    vinylHeightCm: config.vinylHeightCm,
    productId: config.productId,
    productColor: config.productColor,
    productSize: config.productSize,
  };

  const handleApprove = async (orderData: OnApproveData) => {
    const formData = getValues();
    await onConfirm(formData, orderData.orderID);
  };

  const handleLocalCheckout = async () => {
    try {
      const created = await createPayPalCheckout(checkoutOrderConfig);
      await handleApprove({ orderID: created.id } as OnApproveData);
    } catch (error) {
      console.error('Local checkout failed:', error);
      notifyStudio({
        tone: 'error',
        title: 'Order not submitted',
        detail: error instanceof Error ? error.message : 'Try again in a moment.',
      });
    }
  };

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-mono text-pink-500">Shipping & Payment</h3>

      <div className="bg-gray-800 p-4 rounded border border-gray-700 space-y-2 text-sm font-mono">
        <div className="flex justify-between text-gray-300">
          <span>Unit Price:</span>
          <span>${unitPrice.toFixed(2)} AUD</span>
        </div>
        <div className="flex justify-between text-gray-300">
          <span>Qty:</span>
          <span>{config.quantity}×</span>
        </div>
        <div className="flex justify-between text-gray-300">
          <span>Subtotal:</span>
          <span>
            ${(unitPrice * config.quantity).toFixed(2)} AUD
          </span>
        </div>
        <div className="border-t border-gray-700 pt-2 flex justify-between text-gray-300">
          <span>Shipping:</span>
          <span>${SHIPPING_COST.toFixed(2)} AUD</span>
        </div>
        <div className="border-t border-gray-700 pt-2 flex justify-between text-pink-500 text-lg font-bold">
          <span>Total:</span>
          <span>${totalPrice.toFixed(2)} AUD</span>
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          return false;
        }}
        className="space-y-4"
      >
        <div className="grid grid-cols-2 gap-4">
          <input
            {...register('fullName', { required: 'Full name required' })}
            placeholder="Full Name"
            className="col-span-2 px-3 py-2 bg-gray-800 text-gray-100 font-mono text-sm border border-gray-700 rounded"
          />
          {errors.fullName && (
            <span className="col-span-2 text-red-400 text-xs">
              {errors.fullName.message}
            </span>
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
            <span className="col-span-2 text-red-400 text-xs">
              {errors.email.message}
            </span>
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
            <span className="col-span-2 text-red-400 text-xs">
              {errors.street.message}
            </span>
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
          {!isValid || isProcessing ? (
            <div className="p-3 bg-red-900 bg-opacity-20 border border-red-700 rounded text-red-400 text-sm font-mono">
              {isProcessing
                ? 'Submitting order…'
                : 'Please fill in all required fields to proceed to payment.'}
            </div>
          ) : localCheckout ? (
            <div className="space-y-2">
              <p className="text-xs font-mono text-amber-400">
                PayPal client id not set — using local unverified checkout.
              </p>
              <button
                type="button"
                onClick={() => void handleLocalCheckout()}
                className="w-full px-4 py-3 font-mono text-sm bg-pink-500 text-gray-900 rounded hover:bg-pink-600 transition"
              >
                Complete order (local)
              </button>
            </div>
          ) : (
            <PayPalScriptProvider
              options={{
                clientId: paypalClientId,
                currency: ORDER_CURRENCY,
              }}
            >
              <PayPalButtons
                createOrder={async () => {
                  const created = await createPayPalCheckout(checkoutOrderConfig);
                  return created.id;
                }}
                onApprove={async (orderData: OnApproveData) => {
                  // Capture happens on the server during submitOrder.
                  await handleApprove(orderData);
                }}
                onError={(err) => {
                  console.error('PayPal error:', err);
                  notifyStudio({
                    tone: 'error',
                    title: 'Payment failed',
                    detail: 'PayPal could not start checkout. Try again in a moment.',
                  });
                }}
              />
            </PayPalScriptProvider>
          )}
        </div>
      </form>
    </div>
  );
}

export function OrderModal({ canvas, initialTab, onClose }: OrderModalProps) {
  const [step, setStep] = useState<Step>(1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [config, setConfig] = useState<OrderConfig>(() => {
    const orderType: OrderType = initialTab === 'apparel' ? 'product' : 'vinyl';
    return {
      orderType,
      quantity: 1,
      vinylWidthCm: 10,
      vinylHeightCm: 10,
      productId: orderType === 'product' ? 'tshirt' : undefined,
      productColor: orderType === 'product' ? PRODUCT_CATALOG.tshirt.colorOptions[0] : undefined,
      printConfigs: orderType === 'product' ? printConfigsForProduct('tshirt') : {},
    };
  });

  const designDataUrl = useMemo(() => {
    try {
      return snapshotDesignAsDataURL(canvas);
    } catch (error) {
      console.error('Failed to snapshot design for product preview:', error);
      return null;
    }
  }, [canvas]);

  const handleNext = () => {
    if (step < 3) {
      setStep((step + 1) as Step);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep((step - 1) as Step);
    }
  };

  const handleConfirm = async (customer: CustomerFormValues, paypalOrderId: string) => {
    setIsProcessing(true);
    try {
      const result = await submitOrder({
        paypalOrderId,
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
          orderType: config.orderType,
          quantity: config.quantity,
          vinylPermanent: config.vinylPermanent,
          vinylWidthCm: config.vinylWidthCm,
          vinylHeightCm: config.vinylHeightCm,
          vinylFinish: config.vinylFinish,
          productId: config.productId,
          productColor: config.productColor,
          productSize: config.productSize,
          printConfigs: config.printConfigs,
        },
        designSvg: canvas.toSVG(),
      });
      const unverified = result.order.status === 'unverified';
      notifyStudio({
        tone: 'success',
        title: result.duplicate ? 'Order already recorded' : 'Order placed',
        detail: unverified
          ? 'Saved locally without PayPal capture. Configure PAYPAL_CLIENT_ID/SECRET for live verification.'
          : 'Payment verified. We will email you when the cut is ready.',
      });
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (error) {
      console.error('Order submission failed:', error);
      notifyStudio({
        tone: 'error',
        title: 'Order not submitted',
        detail: error instanceof Error ? error.message : 'Try again in a moment.',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
      <div className="bg-gray-900 w-full max-w-2xl max-h-[90vh] rounded-lg shadow-2xl flex flex-col border border-gray-700">
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <div className="flex gap-4">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={`w-8 h-8 rounded-full flex items-center justify-center font-mono text-sm transition ${
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
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-200 text-2xl"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {step === 1 && (
            <Step1Configure config={config} onConfigChange={setConfig} />
          )}
          {step === 2 && (
            <Step2Placement
              config={config}
              onConfigChange={setConfig}
              designDataUrl={designDataUrl}
            />
          )}
          {step === 3 && (
            <Step3Details
              config={config}
              onConfirm={handleConfirm}
              isProcessing={isProcessing}
            />
          )}
        </div>

        <div className="flex items-center justify-between p-6 border-t border-gray-700 bg-gray-950">
          <button
            onClick={handleBack}
            disabled={step === 1}
            className="px-6 py-2 font-mono text-sm bg-gray-800 text-gray-300 border border-gray-700 rounded hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            ← Back
          </button>

          <div className="text-sm font-mono text-gray-400">
            Step {step} / 3
          </div>

          {step < 3 ? (
            <button
              onClick={handleNext}
              className="px-6 py-2 font-mono text-sm bg-pink-500 text-gray-900 rounded hover:bg-pink-600 transition"
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
