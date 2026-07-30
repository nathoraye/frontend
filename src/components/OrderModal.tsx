import { useState, useEffect, useRef, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { PayPalScriptProvider, PayPalButtons } from '@paypal/react-paypal-js';
import type { CreateOrderData, CreateOrderActions, OnApproveData, OnApproveActions } from '@paypal/paypal-js';
import * as fabric from 'fabric';
import { submitOrder } from '../services/orderService';

// ─── Types ───────────────────────────────────────────────────────────────────

type OrderType = 'vinyl' | 'permanent' | 'apparel';
type GarmentView = 'front' | 'back' | 'left-arm' | 'right-arm';
type Step = 1 | 2 | 3;

interface PrintConfig {
  scale: number;
  posX: number;
  posY: number;
}

interface CustomerFormValues {
  fullName: string;
  email: string;
  phone: string;
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
  vinylFinish?: string;
  permanentWidthCm?: number;
  permanentHeightCm?: number;
  permanentFinish?: string;
  apparelType?: string;
  apparelColor?: string;
  apparelSize?: string;
  printConfigs: Record<GarmentView, PrintConfig>;
  quantity: number;
}

interface OrderModalProps {
  canvas: fabric.Canvas;
  initialTab?: 'vinyl' | 'apparel';
  onClose: () => void;
}

const DEFAULT_PRINT_CONFIG: PrintConfig = {
  scale: 1,
  posX: 50,
  posY: 50,
};

const GARMENT_VIEWS: GarmentView[] = ['front', 'back', 'left-arm', 'right-arm'];

const UNIT_PRICES = {
  vinyl: 12.99,
  permanent: 18.99,
  apparel: 24.99,
};

const SHIPPING_COST = 5.99;

const COUNTRIES = [
  'Australia',
  'United States',
  'United Kingdom',
  'Canada',
  'New Zealand',
  'Other',
];

// ─── Helper Functions ────────────────────────────────────────────────────────

function calculatePrice(config: OrderConfig): number {
  const unitPrice = UNIT_PRICES[config.orderType];
  const subtotal = unitPrice * config.quantity;
  return subtotal + SHIPPING_COST;
}

// ─── Step 1: Configure ───────────────────────────────────────────────────────

interface Step1Props {
  config: OrderConfig;
  onConfigChange: (config: OrderConfig) => void;
}

function Step1Configure({ config, onConfigChange }: Step1Props) {
  const handleQuantityChange = (qty: number) => {
    onConfigChange({ ...config, quantity: Math.max(1, Math.min(qty, 100)) });
  };

  const handleOrderTypeChange = (type: OrderType) => {
    onConfigChange({ ...config, orderType: type });
  };

  const handleVinylSizeChange = (w: number, h: number) => {
    onConfigChange({
      ...config,
      vinylWidthCm: w,
      vinylHeightCm: h,
    });
  };

  const handleApparelChange = (key: string, value: string) => {
    onConfigChange({
      ...config,
      [key]: value,
    });
  };

  return (
    <div className="space-y-6">
      {/* Order Type Tabs */}
      <div className="flex gap-2 border-b border-pink-500">
        {(['vinyl', 'permanent', 'apparel'] as OrderType[]).map((type) => (
          <button
            key={type}
            onClick={() => handleOrderTypeChange(type)}
            className={`px-4 py-2 font-mono text-sm transition ${
              config.orderType === type
                ? 'text-pink-500 border-b-2 border-pink-500'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            {type === 'vinyl' && 'Vinyl Sticker'}
            {type === 'permanent' && 'Permanent Vinyl'}
            {type === 'apparel' && 'Iron-On Apparel'}
          </button>
        ))}
      </div>

      {/* Vinyl Sticker Config */}
      {config.orderType === 'vinyl' && (
        <div className="space-y-4">
          <label className="block text-sm font-mono text-gray-300">
            Size (cm)
          </label>
          <div className="flex gap-4">
            <input
              type="number"
              min="2"
              max="30"
              value={config.vinylWidthCm || 10}
              onChange={(e) =>
                handleVinylSizeChange(
                  parseFloat(e.target.value),
                  config.vinylHeightCm || 10
                )
              }
              className="w-20 px-2 py-1 bg-gray-800 text-gray-100 font-mono text-sm border border-gray-700 rounded"
              placeholder="W"
            />
            <span className="text-gray-500">×</span>
            <input
              type="number"
              min="2"
              max="30"
              value={config.vinylHeightCm || 10}
              onChange={(e) =>
                handleVinylSizeChange(
                  config.vinylWidthCm || 10,
                  parseFloat(e.target.value)
                )
              }
              className="w-20 px-2 py-1 bg-gray-800 text-gray-100 font-mono text-sm border border-gray-700 rounded"
              placeholder="H"
            />
          </div>
        </div>
      )}

      {/* Permanent Vinyl Config */}
      {config.orderType === 'permanent' && (
        <div className="space-y-4">
          <label className="block text-sm font-mono text-gray-300">
            Width: {config.permanentWidthCm || 15} cm
          </label>
          <input
            type="range"
            min="1"
            max="29"
            value={config.permanentWidthCm || 15}
            onChange={(e) =>
              onConfigChange({
                ...config,
                permanentWidthCm: parseFloat(e.target.value),
              })
            }
            className="w-full"
          />

          <label className="block text-sm font-mono text-gray-300">
            Height: {config.permanentHeightCm || 30} cm
          </label>
          <input
            type="range"
            min="1"
            max="60"
            value={config.permanentHeightCm || 30}
            onChange={(e) =>
              onConfigChange({
                ...config,
                permanentHeightCm: parseFloat(e.target.value),
              })
            }
            className="w-full"
          />

          <label className="block text-sm font-mono text-gray-300">
            Finish
          </label>
          <select
            value={config.permanentFinish || 'matte'}
            onChange={(e) =>
              handleApparelChange('permanentFinish', e.target.value)
            }
            className="w-full px-3 py-2 bg-gray-800 text-gray-100 font-mono text-sm border border-gray-700 rounded"
          >
            <option value="matte">Matte</option>
            <option value="gloss">Gloss</option>
            <option value="metallic">Metallic</option>
          </select>
        </div>
      )}

      {/* Apparel Config */}
      {config.orderType === 'apparel' && (
        <div className="space-y-4">
          <label className="block text-sm font-mono text-gray-300">
            Garment Type
          </label>
          <select
            value={config.apparelType || 'tshirt'}
            onChange={(e) =>
              handleApparelChange('apparelType', e.target.value)
            }
            className="w-full px-3 py-2 bg-gray-800 text-gray-100 font-mono text-sm border border-gray-700 rounded"
          >
            <option value="tshirt">T-Shirt</option>
            <option value="hoodie">Hoodie</option>
            <option value="longsleeve">Long Sleeve</option>
          </select>

          <label className="block text-sm font-mono text-gray-300">
            Colour
          </label>
          <select
            value={config.apparelColor || 'black'}
            onChange={(e) =>
              handleApparelChange('apparelColor', e.target.value)
            }
            className="w-full px-3 py-2 bg-gray-800 text-gray-100 font-mono text-sm border border-gray-700 rounded"
          >
            <option value="black">Black</option>
            <option value="white">White</option>
            <option value="navy">Navy</option>
            <option value="red">Red</option>
          </select>

          <label className="block text-sm font-mono text-gray-300">
            Size
          </label>
          <select
            value={config.apparelSize || 'M'}
            onChange={(e) =>
              handleApparelChange('apparelSize', e.target.value)
            }
            className="w-full px-3 py-2 bg-gray-800 text-gray-100 font-mono text-sm border border-gray-700 rounded"
          >
            <option value="XS">XS</option>
            <option value="S">S</option>
            <option value="M">M</option>
            <option value="L">L</option>
            <option value="XL">XL</option>
            <option value="2XL">2XL</option>
          </select>
        </div>
      )}

      {/* Quantity */}
      <div className="space-y-2">
        <label className="block text-sm font-mono text-gray-300">
          Quantity
        </label>
        <div className="flex items-center gap-4">
          <button
            onClick={() => handleQuantityChange(config.quantity - 1)}
            className="px-3 py-1 bg-gray-800 text-pink-500 border border-pink-500 rounded hover:bg-pink-500 hover:text-gray-900 transition"
          >
            −
          </button>
          <span className="font-mono text-lg text-gray-300 w-8 text-center">
            {config.quantity}
          </span>
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

// ─── Step 2: Placement ────────────────────────────────────────────────────────

interface Step2Props {
  config: OrderConfig;
  canvas: fabric.Canvas;
  onConfigChange: (config: OrderConfig) => void;
}

function Step2Placement({ config, canvas, onConfigChange }: Step2Props) {
  const [activeView, setActiveView] = useState<GarmentView>('front');
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!previewCanvasRef.current || config.orderType === 'vinyl') return;

    const pCtx = previewCanvasRef.current.getContext('2d');
    if (!pCtx) return;

    pCtx.fillStyle = '#1a1a1a';
    pCtx.fillRect(0, 0, previewCanvasRef.current.width, previewCanvasRef.current.height);

    // Placeholder garment mockup
    pCtx.fillStyle = config.apparelColor === 'white' ? '#e0e0e0' : '#1a1a1a';
    pCtx.fillRect(100, 50, 300, 400);

    // Draw print placement preview
    const printConfig = config.printConfigs[activeView];
    if (printConfig) {
      pCtx.fillStyle = '#FF1493';
      pCtx.globalAlpha = 0.7;
      pCtx.fillRect(
        printConfig.posX,
        printConfig.posY,
        100 * printConfig.scale,
        100 * printConfig.scale
      );
      pCtx.globalAlpha = 1;
    }
  }, [activeView, config, previewCanvasRef]);

  const handlePositionChange = (x: number, y: number) => {
    const newConfigs = { ...config.printConfigs };
    newConfigs[activeView] = { ...newConfigs[activeView], posX: x, posY: y };
    onConfigChange({ ...config, printConfigs: newConfigs });
  };

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-mono text-pink-500">Print Placement</h3>

      {/* Garment View Tabs */}
      {config.orderType !== 'vinyl' && (
        <div className="flex gap-2 border-b border-gray-700">
          {GARMENT_VIEWS.map((view) => (
            <button
              key={view}
              onClick={() => setActiveView(view)}
              className={`px-4 py-2 font-mono text-sm transition ${
                activeView === view
                  ? 'text-emerald-400 border-b-2 border-emerald-400'
                  : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              {view.charAt(0).toUpperCase() + view.slice(1)}
            </button>
          ))}
        </div>
      )}

      {/* Preview Canvas */}
      <div className="bg-gray-900 p-4 rounded border border-gray-700">
        <canvas
          ref={previewCanvasRef}
          width={500}
          height={500}
          className="w-full bg-gray-800 rounded cursor-move"
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            if (e.buttons === 1) {
              handlePositionChange(x, y);
            }
          }}
        />
      </div>

      {/* Position Readout */}
      <div className="text-xs font-mono text-gray-400">
        Position: ({config.printConfigs[activeView]?.posX.toFixed(0)},
        {config.printConfigs[activeView]?.posY.toFixed(0)}) | Scale:
        {config.printConfigs[activeView]?.scale.toFixed(2)}x
      </div>
    </div>
  );
}

// ─── Step 3: Details & Payment ──────────────────────────────────────────────

interface Step3Props {
  config: OrderConfig;
  canvas: fabric.Canvas;
  onConfirm: (customer: CustomerFormValues, paypalOrderId: string) => Promise<void>;
  isProcessing: boolean;
}

function Step3Details({
  config,
  canvas,
  onConfirm,
  isProcessing,
}: Step3Props) {
  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
    getValues,
  } = useForm<CustomerFormValues>({
    mode: 'onChange',
  });

  const totalPrice = calculatePrice(config);

  const handleApprove = async (data: OnApproveData) => {
    const formData = getValues();
    await onConfirm(formData, data.orderID);
  };

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-mono text-pink-500">Shipping & Payment</h3>

      {/* Order Summary */}
      <div className="bg-gray-800 p-4 rounded border border-gray-700 space-y-2 text-sm font-mono">
        <div className="flex justify-between text-gray-300">
          <span>Unit Price:</span>
          <span>${UNIT_PRICES[config.orderType].toFixed(2)} AUD</span>
        </div>
        <div className="flex justify-between text-gray-300">
          <span>Qty:</span>
          <span>{config.quantity}×</span>
        </div>
        <div className="flex justify-between text-gray-300">
          <span>Subtotal:</span>
          <span>
            ${(UNIT_PRICES[config.orderType] * config.quantity).toFixed(2)} AUD
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

      {/* Customer Form */}
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
            {...register('phone', { required: 'Phone required' })}
            placeholder="Phone"
            className="col-span-2 px-3 py-2 bg-gray-800 text-gray-100 font-mono text-sm border border-gray-700 rounded"
          />
          {errors.phone && (
            <span className="col-span-2 text-red-400 text-xs">
              {errors.phone.message}
            </span>
          )}

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

        {/* PayPal Buttons - Only render if form is valid */}
        {isValid && !isProcessing && (
          <PayPalScriptProvider
            options={{
              clientId: import.meta.env.VITE_PAYPAL_CLIENT_ID,
              currency: 'AUD',
            }}
          >
            <PayPalButtons
              createOrder={(data: CreateOrderData, actions: CreateOrderActions) =>
                actions.order.create({
                  intent: 'CAPTURE',
                  purchase_units: [
                    {
                      amount: {
                        currency_code: 'AUD',
                        value: totalPrice.toFixed(2),
                      },
                      reference_id: `WVS-${Date.now()}`,
                      description: `West Vinyl Studio - ${config.orderType}`,
                    },
                  ],
                })
              }
              onApprove={async (data: OnApproveData, actions: OnApproveActions) => {
                const details = await actions.order?.capture();
                if (details) {
                  await handleApprove(data);
                }
              }}
              onError={(err) => {
                console.error('PayPal error:', err);
              }}
            />
          </PayPalScriptProvider>
        )}

        {!isValid && (
          <div className="p-3 bg-red-900 bg-opacity-20 border border-red-700 rounded text-red-400 text-sm font-mono">
            Please fill in all required fields to proceed to payment.
          </div>
        )}
      </form>
    </div>
  );
}

// ─── Main Modal Component ─────────────────────────────────────────────────────

export function OrderModal({ canvas, onClose }: OrderModalProps) {
  const [step, setStep] = useState<Step>(1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [config, setConfig] = useState<OrderConfig>({
    orderType: 'vinyl',
    quantity: 1,
    printConfigs: {
      front: { ...DEFAULT_PRINT_CONFIG },
      back: { ...DEFAULT_PRINT_CONFIG },
      'left-arm': { ...DEFAULT_PRINT_CONFIG },
      'right-arm': { ...DEFAULT_PRINT_CONFIG },
    },
  });

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
      await submitOrder({
        paypalOrderId,
        customer,
        orderConfig: config,
        designSvg: canvas.toSVG(),
      });
      // Show confirmation and close
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (error) {
      console.error('Order submission failed:', error);
      alert('Failed to submit order. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
      <div className="bg-gray-900 w-full max-w-2xl max-h-[90vh] rounded-lg shadow-2xl flex flex-col border border-gray-700">
        {/* Header */}
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

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {step === 1 && (
            <Step1Configure config={config} onConfigChange={setConfig} />
          )}
          {step === 2 && (
            <Step2Placement
              config={config}
              canvas={canvas}
              onConfigChange={setConfig}
            />
          )}
          {step === 3 && (
            <Step3Details
              config={config}
              canvas={canvas}
              onConfirm={handleConfirm}
              isProcessing={isProcessing}
            />
          )}
        </div>

        {/* Footer */}
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

          <button
            onClick={handleNext}
            disabled={step === 3}
            className="px-6 py-2 font-mono text-sm bg-pink-500 text-gray-900 rounded hover:bg-pink-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}

export default OrderModal;
