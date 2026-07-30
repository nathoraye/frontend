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

// ─── Constants ───────────────────────────────────────────────────────────────

const SHIPPING_AUD = 5.99;

const GARMENT_VIEWS: { id: GarmentView; label: string; mockup: string }[] = [
  { id: 'front',     label: 'Front',     mockup: '/tshirt-front.svg' },
  { id: 'back',      label: 'Back',      mockup: '/tshirt-back.svg' },
  { id: 'left-arm',  label: 'Left Arm',  mockup: '/sleeve-left.svg' },
  { id: 'right-arm', label: 'Right Arm', mockup: '/sleeve-right.svg' },
];

const DEFAULT_PRINT_CONFIGS: Record<GarmentView, PrintConfig> = {
  'front':     { scale: 35, posX: 50, posY: 32 },
  'back':      { scale: 40, posX: 50, posY: 30 },
  'left-arm':  { scale: 22, posX: 50, posY: 35 },
  'right-arm': { scale: 22, posX: 50, posY: 35 },
};

const APPAREL_TYPES = ['T-Shirt', 'Hoodie', 'Sloppy Joe', 'Bib'];
const APPAREL_COLORS = ['Black', 'White', 'Heather Grey', 'Navy', 'Pink', 'Red'];
const VINYL_FINISHES = ['Glossy', 'Matte', 'Holographic'];
const COUNTRIES = ['Australia', 'New Zealand', 'United States', 'United Kingdom', 'Canada', 'Other'];

function getApparelBaseImage(config: OrderConfig): string {
  const isLightGarment = ['White', 'Heather Grey', 'Pink'].includes(config.apparelColor ?? '');
  if (config.apparelType === 'Hoodie') {
    return isLightGarment ? '/hoodyw.png' : '/hoody.png';
  }
  return '/hoodie.png';
}

async function onFulfillment(details: {
  paypalOrderId: string;
  customer: CustomerFormValues;
  orderConfig: OrderConfig;
  designSvg: string;
}) {
  try {
    await submitOrder({
      paypalOrderId: details.paypalOrderId,
      customer: details.customer,
      orderConfig: details.orderConfig as unknown as Record<string, unknown>,
      designSvg: details.designSvg,
    });
  } catch (error) {
    console.error('[Fulfillment Hook] Failed to submit order', error);
    throw error;
  }
}

// ─── Price calculator ─────────────────────────────────────────────────────────

function calculatePrice(config: OrderConfig): number {
  let unit = 0;
  if (config.orderType === 'vinyl') {
    const area = (config.vinylWidthCm ?? 5) * (config.vinylHeightCm ?? 5);
    unit = Math.max(4.99, area * 0.08);
  } else if (config.orderType === 'permanent') {
    const area = (config.permanentWidthCm ?? 10) * (config.permanentHeightCm ?? 20);
    unit = Math.max(7.99, area * 0.05);
    if (config.permanentFinish === 'Holographic') unit += 4;
  } else {
    unit = config.apparelType === 'Hoodie' ? 39.99
         : config.apparelType === 'Sloppy Joe' ? 29.99
         : config.apparelType === 'Bib' ? 14.99
         : 24.99;
  }
  return unit * config.quantity;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StepIndicator({ step }: { step: Step }) {
  const steps = ['Configure', 'Placement', 'Details & Pay'];
  return (
    <div className="flex items-center gap-0 mb-8">
      {steps.map((label, i) => {
        const n = (i + 1) as Step;
        const active = step === n;
        const done = step > n;
        return (
          <div key={n} className="flex items-center">
            <div className="flex flex-col items-center gap-1">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black border-2 transition-all ${
                done  ? 'bg-[#FF1493] border-[#FF1493] text-white' :
                active ? 'bg-transparent border-[#FF1493] text-[#FF1493]' :
                         'bg-transparent border-slate-700 text-slate-600'
              }`}>
                {done ? '✓' : n}
              </div>
              <span className={`text-[9px] uppercase tracking-widest font-bold hidden md:block ${active ? 'text-white' : done ? 'text-[#FF1493]' : 'text-slate-600'}`}>{label}</span>
            </div>
            {i < 2 && <div className={`w-16 h-0.5 mx-2 mb-4 transition-all ${done ? 'bg-[#FF1493]' : 'bg-slate-700'}`} />}
          </div>
        );
      })}
    </div>
  );
}

function CmSlider({ label, value, min, max, onChange, unit = 'cm' }: {
  label: string; value: number; min: number; max: number;
  onChange: (v: number) => void; unit?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs font-bold text-slate-400 uppercase tracking-wider">
        <span>{label}</span>
        <span className="font-mono text-white">{value} {unit}</span>
      </div>
      <input type="range" min={min} max={max} step={0.5} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-[#FF1493] cursor-pointer" />
      <div className="flex justify-between text-[10px] text-slate-600 font-mono">
        <span>{min}{unit}</span><span>{max}{unit}</span>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function OrderModal({ canvas, initialTab = 'vinyl', onClose }: OrderModalProps) {
  const [step, setStep] = useState<Step>(1);
  const [previewUrl, setPreviewUrl] = useState('');
  const [activeView, setActiveView] = useState<GarmentView>('front');
  const [confirmed, setConfirmed] = useState(false);
  const [confirmedOrderId, setConfirmedOrderId] = useState('');
  const [formReady, setFormReady] = useState(false);

  const previewContainerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, startX: 0, startY: 0, startScale: 35 });

  const [config, setConfig] = useState<OrderConfig>({
    orderType: initialTab === 'apparel' ? 'apparel' : 'vinyl',
    vinylWidthCm: 10,
    vinylHeightCm: 10,
    vinylFinish: 'Glossy',
    permanentWidthCm: 15,
    permanentHeightCm: 30,
    permanentFinish: 'Glossy',
    apparelType: 'T-Shirt',
    apparelColor: 'Black',
    apparelSize: 'Mens L',
    printConfigs: { ...DEFAULT_PRINT_CONFIGS },
    quantity: 1,
  });

  const { register, handleSubmit, watch, formState: { errors, isValid } } = useForm<CustomerFormValues>({
    mode: 'onChange',
    defaultValues: { country: 'Australia' },
  });

  const watchedFields = watch();
  useEffect(() => { setFormReady(isValid); }, [isValid]);

  // ── Canvas preview crop ──────────────────────────────────────────────────
  useEffect(() => {
    if (!canvas) return;
    const timer = setTimeout(() => {
      const prevBg = canvas.backgroundColor;
      canvas.backgroundColor = 'transparent';
      canvas.renderAll();
      const raw = canvas.toDataURL({ format: 'png', multiplier: 2 });
      const img = new Image();
      img.onload = () => {
        const tmp = document.createElement('canvas');
        tmp.width = img.width; tmp.height = img.height;
        const ctx = tmp.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);
        const d = ctx.getImageData(0, 0, tmp.width, tmp.height).data;
        let minX = tmp.width, minY = tmp.height, maxX = 0, maxY = 0, has = false;
        for (let y = 0; y < tmp.height; y++) for (let x = 0; x < tmp.width; x++) {
          if (d[(y * tmp.width + x) * 4 + 3] > 15) {
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
            has = true;
          }
        }
        if (!has) { setPreviewUrl(raw); } else {
          const p = 20;
          minX = Math.max(0, minX - p); minY = Math.max(0, minY - p);
          maxX = Math.min(tmp.width, maxX + p); maxY = Math.min(tmp.height, maxY + p);
          const crop = document.createElement('canvas');
          crop.width = maxX - minX; crop.height = maxY - minY;
          crop.getContext('2d')?.drawImage(tmp, minX, minY, crop.width, crop.height, 0, 0, crop.width, crop.height);
          setPreviewUrl(crop.toDataURL('image/png'));
        }
        canvas.backgroundColor = prevBg;
        canvas.renderAll();
      };
      img.src = raw;
    }, 50);
    return () => clearTimeout(timer);
  }, [canvas]);

  // ── Drag / resize handlers ───────────────────────────────────────────────
  const handleMouseDownDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    const c = config.printConfigs[activeView];
    dragStartRef.current = { x: e.clientX, y: e.clientY, startX: c.posX, startY: c.posY, startScale: c.scale };
  }, [config, activeView]);

  const handleMouseDownResize = useCallback((e: React.MouseEvent) => {
    e.stopPropagation(); e.preventDefault();
    setIsResizing(true);
    const c = config.printConfigs[activeView];
    dragStartRef.current = { x: e.clientX, y: e.clientY, startX: c.posX, startY: c.posY, startScale: c.scale };
  }, [config, activeView]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!previewContainerRef.current) return;
    const rect = previewContainerRef.current.getBoundingClientRect();
    setConfig(prev => {
      const updated = { ...prev.printConfigs };
      if (isDragging) {
        const dx = e.clientX - dragStartRef.current.x;
        const dy = e.clientY - dragStartRef.current.y;
        updated[activeView] = {
          ...updated[activeView],
          posX: Number(Math.max(10, Math.min(90, dragStartRef.current.startX + (dx / rect.width) * 100)).toFixed(1)),
          posY: Number(Math.max(10, Math.min(90, dragStartRef.current.startY + (dy / rect.height) * 100)).toFixed(1)),
        };
      } else if (isResizing) {
        const ds = (e.clientX - dragStartRef.current.x) * 0.3;
        updated[activeView] = {
          ...updated[activeView],
          scale: Number(Math.max(10, Math.min(75, dragStartRef.current.startScale + ds)).toFixed(1)),
        };
      }
      return { ...prev, printConfigs: updated };
    });
  }, [isDragging, isResizing, activeView]);

  const handleMouseUp = useCallback(() => { setIsDragging(false); setIsResizing(false); }, []);

  // ── PayPal handlers ──────────────────────────────────────────────────────
  const createPayPalOrder = async (_data: CreateOrderData, actions: CreateOrderActions) => {
    const total = (calculatePrice(config) + SHIPPING_AUD).toFixed(2);
    return actions.order.create({
      intent: 'CAPTURE',
      purchase_units: [{
        amount: { currency_code: 'AUD', value: total },
        description: `West Vinyl Co. — ${config.orderType} order`,
      }],
    });
  };

  const onPayPalApprove = async (_data: OnApproveData, actions: OnApproveActions) => {
    const details = await actions.order!.capture();
    const orderId = details.id ?? 'UNKNOWN';
    const designSvg = canvas.toSVG();
    await onFulfillment({
      paypalOrderId: orderId,
      customer: watchedFields as CustomerFormValues,
      orderConfig: config,
      designSvg,
    });
    setConfirmedOrderId(orderId);
    setConfirmed(true);
  };

  // ── Helpers ──────────────────────────────────────────────────────────────
  const subtotal = calculatePrice(config);
  const total = (subtotal + SHIPPING_AUD).toFixed(2);
  const currentPrint = config.printConfigs[activeView];
  const viewInfo = GARMENT_VIEWS.find(v => v.id === activeView)!;

  // Tint the SVG mockup by injecting a colour overlay div
  const garmentHex: Record<string, string> = {
    Black: '#1e293b', White: '#f8fafc', 'Heather Grey': '#94a3b8',
    Navy: '#1e3a8a', Pink: '#f472b6', Red: '#ef4444',
  };
  const tint = garmentHex[config.apparelColor ?? 'Black'] ?? '#1e293b';
  const isLightGarment = ['White', 'Heather Grey', 'Pink'].includes(config.apparelColor ?? '');
  const apparelBaseImage = getApparelBaseImage(config);
  const garmentGraphic = config.apparelType === 'Hoodie' ? apparelBaseImage : viewInfo.mockup;

  // ─── Confirmation Screen ─────────────────────────────────────────────────
  if (confirmed) {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[#0f111a]/95 backdrop-blur-md p-4">
        <div className="bg-[#181a25] border border-slate-700 rounded-2xl shadow-2xl p-10 flex flex-col items-center gap-6 max-w-md w-full text-center">
          <div className="w-20 h-20 rounded-full bg-[#FF1493]/10 border-2 border-[#FF1493] flex items-center justify-center animate-bounce">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#FF1493" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
          </div>
          <div>
            <h2 className="text-2xl font-black text-white uppercase tracking-tight">Order Confirmed!</h2>
            <p className="text-slate-400 text-sm mt-2">We've received your order and will begin production shortly.</p>
          </div>
          <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 w-full">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">PayPal Order ID</span>
            <p className="font-mono text-[#FF1493] text-sm mt-1 break-all">{confirmedOrderId}</p>
          </div>
          <button
            onClick={() => { const svg = canvas.toSVG(); const b = new Blob([svg], { type: 'image/svg+xml' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'west-vinyl-design.svg'; a.click(); }}
            className="w-full py-3 rounded-lg border border-slate-700 text-slate-300 hover:border-[#FF1493] hover:text-[#FF1493] font-bold text-sm transition-all"
          >
            ↓ Download My Design (SVG)
          </button>
          <button onClick={onClose} className="w-full py-3 rounded-lg bg-[#FF1493] hover:bg-[#ff4da6] text-white font-black uppercase tracking-widest text-sm transition-all shadow-lg shadow-[#FF1493]/20">
            Return to Studio
          </button>
        </div>
      </div>
    );
  }

  // ─── Main Modal ──────────────────────────────────────────────────────────
  return (
    <PayPalScriptProvider options={{ clientId: import.meta.env.VITE_PAYPAL_CLIENT_ID ?? '', currency: 'AUD' }}>
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[#0f111a]/95 p-2 md:p-4 select-none backdrop-blur-md">
        <div className="bg-[#181a25] border border-slate-700 rounded-2xl shadow-2xl flex flex-col w-full max-w-4xl overflow-hidden max-h-[96vh]">

          {/* ── Header ── */}
          <div className="flex items-center justify-between px-8 pt-7 pb-4 border-b border-slate-800">
            <div className="flex items-center gap-3">
              <span className="font-black tracking-widest uppercase text-base text-white">West Vinyl Co.</span>
              <span className="bg-[#FF1493] text-white text-[9px] font-black px-2 py-0.5 rounded-sm uppercase tracking-wider">Order</span>
            </div>
            <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors p-1 rounded-lg hover:bg-slate-800">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          <div className="overflow-y-auto custom-scrollbar flex-1">
            <div className="px-8 py-6">
              <StepIndicator step={step} />

              {/* ════ STEP 1 — Configure ════ */}
              {step === 1 && (
                <div className="space-y-6">
                  {/* Order type tabs */}
                  <div className="flex bg-slate-800/50 p-1 rounded-xl border border-slate-700 gap-1">
                    {([['vinyl', 'Vinyl Sticker'], ['permanent', 'Permanent Vinyl'], ['apparel', 'Iron-On Apparel']] as [OrderType, string][]).map(([type, label]) => (
                      <button key={type} onClick={() => setConfig(p => ({ ...p, orderType: type }))}
                        className={`flex-1 py-2.5 rounded-lg text-xs font-black tracking-wider uppercase transition-all ${config.orderType === type ? 'bg-[#FF1493] text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}>
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* ── Vinyl Sticker ── */}
                  {config.orderType === 'vinyl' && (
                    <div className="space-y-5 bg-slate-800/30 border border-slate-700/50 rounded-xl p-5">
                      <h3 className="text-xs font-black uppercase tracking-widest text-[#FF1493]">Sticker Dimensions</h3>
                      <CmSlider label="Width" value={config.vinylWidthCm ?? 10} min={2} max={30} onChange={v => setConfig(p => ({ ...p, vinylWidthCm: v }))} />
                      <CmSlider label="Height" value={config.vinylHeightCm ?? 10} min={2} max={30} onChange={v => setConfig(p => ({ ...p, vinylHeightCm: v }))} />
                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Finish</label>
                        <div className="grid grid-cols-3 gap-2">
                          {VINYL_FINISHES.map(f => (
                            <button key={f} onClick={() => setConfig(p => ({ ...p, vinylFinish: f }))}
                              className={`py-2 border rounded-lg text-sm font-bold transition-all ${config.vinylFinish === f ? 'border-[#FF1493] bg-[#FF1493]/10 text-[#FF1493]' : 'border-slate-700 text-slate-300 hover:border-slate-500'}`}>{f}</button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── Permanent Vinyl ── */}
                  {config.orderType === 'permanent' && (
                    <div className="space-y-5 bg-slate-800/30 border border-slate-700/50 rounded-xl p-5">
                      <h3 className="text-xs font-black uppercase tracking-widest text-[#FF1493]">Permanent Vinyl Dimensions</h3>
                      <CmSlider label="Width" value={config.permanentWidthCm ?? 15} min={1} max={29} onChange={v => setConfig(p => ({ ...p, permanentWidthCm: v }))} />
                      <CmSlider label="Height" value={config.permanentHeightCm ?? 30} min={1} max={60} onChange={v => setConfig(p => ({ ...p, permanentHeightCm: v }))} />
                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Finish</label>
                        <div className="grid grid-cols-3 gap-2">
                          {VINYL_FINISHES.map(f => (
                            <button key={f} onClick={() => setConfig(p => ({ ...p, permanentFinish: f }))}
                              className={`py-2 border rounded-lg text-sm font-bold transition-all ${config.permanentFinish === f ? 'border-[#FF1493] bg-[#FF1493]/10 text-[#FF1493]' : 'border-slate-700 text-slate-300 hover:border-slate-500'}`}>{f}</button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── Iron-On Apparel ── */}
                  {config.orderType === 'apparel' && (
                    <div className="space-y-5 bg-slate-800/30 border border-slate-700/50 rounded-xl p-5">
                      <h3 className="text-xs font-black uppercase tracking-widest text-emerald-400">Garment Options</h3>
                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Type</label>
                        <div className="grid grid-cols-4 gap-2">
                          {APPAREL_TYPES.map(t => (
                            <button key={t} onClick={() => setConfig(p => ({ ...p, apparelType: t }))}
                              className={`py-2 border rounded-lg text-[11px] uppercase tracking-wider font-bold transition-all ${config.apparelType === t ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400' : 'border-slate-700 text-slate-300 hover:border-slate-500'}`}>{t}</button>
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-4">
                        <div className="flex-1">
                          <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Colour</label>
                          <div className="grid grid-cols-3 gap-1.5">
                            {APPAREL_COLORS.map(c => (
                              <button key={c} onClick={() => setConfig(p => ({ ...p, apparelColor: c }))}
                                className={`py-2 border rounded-lg text-[10px] uppercase tracking-wider font-bold transition-all ${config.apparelColor === c ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400' : 'border-slate-700 text-slate-300 hover:border-slate-500'}`}>{c}</button>
                            ))}
                          </div>
                        </div>
                        <div className="flex-1">
                          <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Size</label>
                          <select value={config.apparelSize} onChange={e => setConfig(p => ({ ...p, apparelSize: e.target.value }))}
                            className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg p-2.5 outline-none focus:border-emerald-500 transition-colors cursor-pointer">
                            {config.apparelType === 'Bib' ? (
                              <option>One Size Fits All</option>
                            ) : (
                              <>
                                <optgroup label="Mens">{['XS','S','M','L','XL','2XL','3XL'].map(s => <option key={`m-${s}`} value={`Mens ${s}`}>Mens {s}</option>)}</optgroup>
                                <optgroup label="Womens">{['6','8','10','12','14'].map(s => <option key={`w-${s}`} value={`Womens ${s}`}>Womens {s}</option>)}</optgroup>
                                <optgroup label="Kids">{['2','4','6','8','10','12','14','16'].map(s => <option key={`k-${s}`} value={`Kids ${s}`}>Kids {s}</option>)}</optgroup>
                              </>
                            )}
                          </select>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Quantity + price summary */}
                  <div className="flex items-center justify-between pt-2">
                    <div className="flex items-center gap-4">
                      <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Qty</span>
                      <div className="flex items-center bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
                        <button onClick={() => setConfig(p => ({ ...p, quantity: Math.max(1, p.quantity - 1) }))} className="px-3 py-1.5 text-slate-300 hover:bg-slate-700 font-bold">−</button>
                        <span className="px-4 py-1.5 font-mono text-white text-sm border-x border-slate-700">{config.quantity}</span>
                        <button onClick={() => setConfig(p => ({ ...p, quantity: p.quantity + 1 }))} className="px-3 py-1.5 text-slate-300 hover:bg-slate-700 font-bold">+</button>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="block text-[9px] font-black text-slate-500 uppercase tracking-widest">Subtotal</span>
                      <span className="text-3xl font-black text-white">${subtotal.toFixed(2)}</span>
                      <span className="text-slate-500 text-xs ml-1">AUD</span>
                    </div>
                  </div>

                  <button onClick={() => setStep(2)} className="w-full py-4 rounded-xl bg-[#FF1493] hover:bg-[#ff4da6] text-white font-black uppercase tracking-widest shadow-lg shadow-[#FF1493]/20 hover:-translate-y-0.5 transition-all">
                    Next: Set Placement →
                  </button>
                </div>
              )}

              {/* ════ STEP 2 — Placement ════ */}
              {step === 2 && (
                <div className="space-y-6">
                  <div className="flex flex-col md:flex-row gap-6">

                    {/* Left: interactive preview */}
                    <div className="md:w-1/2 flex flex-col gap-3">

                      {/* Garment view selector — only for apparel */}
                      {config.orderType === 'apparel' && (
                        <div className="flex gap-1.5 bg-slate-800/50 p-1 rounded-xl border border-slate-700">
                          {GARMENT_VIEWS.map(v => (
                            <button key={v.id} onClick={() => setActiveView(v.id)}
                              className={`flex-1 py-2 rounded-lg text-[10px] uppercase tracking-widest font-black transition-all ${activeView === v.id ? 'bg-[#FF1493] text-white' : 'text-slate-500 hover:text-white'}`}>
                              {v.label}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Preview area */}
                      <div
                        ref={previewContainerRef}
                        onMouseMove={handleMouseMove}
                        onMouseUp={handleMouseUp}
                        onMouseLeave={handleMouseUp}
                        className="relative w-full aspect-square bg-slate-900 rounded-2xl border border-slate-700 overflow-hidden shadow-inner flex items-center justify-center cursor-crosshair"
                      >
                        {config.orderType === 'vinyl' || config.orderType === 'permanent' ? (
                          /* Vinyl / permanent — floating sticker mockup */
                          <div className="relative flex items-center justify-center w-full h-full">
                            <div className="absolute inset-0 bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl" />
                            <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, #fff 1px, transparent 0)', backgroundSize: '24px 24px' }} />
                            <img src={previewUrl} alt="Design preview"
                              className="relative z-10 max-w-[60%] max-h-[60%] object-contain drop-shadow-[0_20px_30px_rgba(0,0,0,0.7)]" />
                          </div>
                        ) : (
                          /* Apparel — garment mockup with tinted SVG + draggable print */
                          <>
                            {/* Tinted garment mockup */}
                            <div className="absolute inset-6 flex items-center justify-center pointer-events-none">
                              <div className="relative w-full h-full">
                                <img src={garmentGraphic} alt={viewInfo.label} className="w-full h-full object-contain" style={{ filter: `drop-shadow(0 4px 12px rgba(0,0,0,0.5))` }} />
                                {/* Colour tint overlay using CSS mix-blend */}
                                <div className="absolute inset-0 rounded pointer-events-none mix-blend-multiply" style={{ backgroundColor: tint, opacity: isLightGarment ? 0.2 : 0.6 }} />
                              </div>
                            </div>

                            {/* Draggable print placement */}
                            <div
                              onMouseDown={handleMouseDownDrag}
                              className="absolute group cursor-move z-20"
                              style={{ top: `${currentPrint.posY}%`, left: `${currentPrint.posX}%`, transform: 'translate(-50%, -50%)', width: `${currentPrint.scale}%` }}
                            >
                              <div className="absolute -inset-2 border-2 border-dashed border-[#FF1493] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none rounded">
                                {['-top-1.5 -left-1.5', '-top-1.5 -right-1.5', '-bottom-1.5 -left-1.5', '-bottom-1.5 -right-1.5'].map(pos => (
                                  <div key={pos} className={`absolute ${pos} w-3 h-3 bg-[#FF1493] rounded-full`} />
                                ))}
                              </div>
                              {previewUrl && (
                                <img src={previewUrl} alt="Print" className={`w-full object-contain pointer-events-none ${isLightGarment ? 'mix-blend-multiply opacity-90' : 'drop-shadow-md'}`} />
                              )}
                              <div onMouseDown={handleMouseDownResize}
                                className="absolute -bottom-3 -right-3 w-6 h-6 bg-[#FF1493] text-white text-[10px] flex items-center justify-center rounded-full shadow-lg opacity-0 group-hover:opacity-100 cursor-se-resize transition-opacity"
                                title="Drag to resize">↔</div>
                            </div>

                            <span className="absolute bottom-3 text-[9px] text-slate-300 font-black uppercase tracking-widest z-30 bg-black/60 px-3 py-1 rounded-full backdrop-blur-md border border-slate-700 shadow-xl pointer-events-none">
                              {viewInfo.label} · {config.apparelColor}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Right: fine-tune sliders */}
                    <div className="md:w-1/2 flex flex-col gap-4">
                      <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">
                        {config.orderType === 'apparel' ? `Fine-Tune — ${viewInfo.label}` : 'Your Design Preview'}
                      </h3>
                      {config.orderType === 'apparel' && (
                        <div className="space-y-4 bg-slate-800/30 border border-slate-700/50 rounded-xl p-4">
                          <CmSlider label="Scale" value={currentPrint.scale} min={10} max={75} unit="%" onChange={v => setConfig(p => ({ ...p, printConfigs: { ...p.printConfigs, [activeView]: { ...p.printConfigs[activeView], scale: v } } }))} />
                          <CmSlider label="Vertical" value={currentPrint.posY} min={10} max={90} unit="%" onChange={v => setConfig(p => ({ ...p, printConfigs: { ...p.printConfigs, [activeView]: { ...p.printConfigs[activeView], posY: v } } }))} />
                          <CmSlider label="Horizontal" value={currentPrint.posX} min={10} max={90} unit="%" onChange={v => setConfig(p => ({ ...p, printConfigs: { ...p.printConfigs, [activeView]: { ...p.printConfigs[activeView], posX: v } } }))} />
                        </div>
                      )}
                      {config.orderType !== 'apparel' && (
                        <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-4 space-y-2 text-sm text-slate-400">
                          <p><span className="text-white font-bold">Type:</span> {config.orderType === 'permanent' ? 'Permanent Vinyl' : 'Vinyl Sticker'}</p>
                          <p><span className="text-white font-bold">Size:</span> {config.orderType === 'permanent' ? `${config.permanentWidthCm} × ${config.permanentHeightCm} cm` : `${config.vinylWidthCm} × ${config.vinylHeightCm} cm`}</p>
                          <p><span className="text-white font-bold">Finish:</span> {config.orderType === 'permanent' ? config.permanentFinish : config.vinylFinish}</p>
                          <p><span className="text-white font-bold">Qty:</span> {config.quantity}</p>
                        </div>
                      )}

                      {/* Order summary card */}
                      <div className="mt-auto bg-slate-800/40 border border-slate-700/60 rounded-xl p-4 space-y-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Order Summary</span>
                        <div className="flex justify-between text-sm text-slate-300"><span>Subtotal</span><span className="font-mono">${subtotal.toFixed(2)}</span></div>
                        <div className="flex justify-between text-sm text-slate-300"><span>Shipping (AUS)</span><span className="font-mono">${SHIPPING_AUD.toFixed(2)}</span></div>
                        <div className="flex justify-between text-base font-black text-white border-t border-slate-700 pt-2 mt-2"><span>Total</span><span className="font-mono text-[#FF1493]">${total} AUD</span></div>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button onClick={() => setStep(1)} className="px-6 py-4 rounded-xl font-bold text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors">← Back</button>
                    <button onClick={() => setStep(3)} className="flex-1 py-4 rounded-xl bg-[#FF1493] hover:bg-[#ff4da6] text-white font-black uppercase tracking-widest shadow-lg shadow-[#FF1493]/20 hover:-translate-y-0.5 transition-all">
                      Next: Details & Pay →
                    </button>
                  </div>
                </div>
              )}

              {/* ════ STEP 3 — Details & Pay ════ */}
              {step === 3 && (
                <form onSubmit={handleSubmit(() => {})} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                    {/* Left: customer + shipping form */}
                    <div className="space-y-4">
                      <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Customer Details</h3>

                      {([
                        ['fullName',  'Full Name',    'text',  'Jane Smith'],
                        ['email',     'Email',        'email', 'jane@example.com'],
                        ['phone',     'Phone',        'tel',   '+61 4xx xxx xxx'],
                      ] as [keyof CustomerFormValues, string, string, string][]).map(([field, label, type, placeholder]) => (
                        <div key={field}>
                          <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">{label}</label>
                          <input type={type} placeholder={placeholder}
                            {...register(field, { required: `${label} is required`, ...(field === 'email' ? { pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Invalid email' } } : {}) })}
                            className={`w-full bg-slate-800 border rounded-lg px-4 py-2.5 text-white text-sm outline-none transition-colors placeholder:text-slate-600 ${errors[field] ? 'border-red-500 focus:border-red-400' : 'border-slate-700 focus:border-[#FF1493]'}`}
                          />
                          {errors[field] && <p className="text-red-400 text-[10px] mt-1 font-bold">{errors[field]?.message}</p>}
                        </div>
                      ))}

                      <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 pt-2">Shipping Address</h3>

                      {([
                        ['street',   'Street Address', 'text', '123 Main Street'],
                        ['city',     'City',            'text', 'Melbourne'],
                        ['state',    'State / Region',  'text', 'VIC'],
                        ['postcode', 'Postcode',        'text', '3000'],
                      ] as [keyof CustomerFormValues, string, string, string][]).map(([field, label, type, placeholder]) => (
                        <div key={field}>
                          <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">{label}</label>
                          <input type={type} placeholder={placeholder}
                            {...register(field, { required: `${label} is required` })}
                            className={`w-full bg-slate-800 border rounded-lg px-4 py-2.5 text-white text-sm outline-none transition-colors placeholder:text-slate-600 ${errors[field] ? 'border-red-500 focus:border-red-400' : 'border-slate-700 focus:border-[#FF1493]'}`}
                          />
                          {errors[field] && <p className="text-red-400 text-[10px] mt-1 font-bold">{errors[field]?.message}</p>}
                        </div>
                      ))}

                      <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Country</label>
                        <select {...register('country', { required: true })}
                          className="w-full bg-slate-800 border border-slate-700 focus:border-[#FF1493] text-white text-sm rounded-lg px-4 py-2.5 outline-none transition-colors cursor-pointer">
                          {COUNTRIES.map(c => <option key={c}>{c}</option>)}
                        </select>
                      </div>
                    </div>

                    {/* Right: order summary + PayPal */}
                    <div className="flex flex-col gap-4">
                      <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Order Summary</h3>
                      <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-4 space-y-3">
                        {previewUrl && <img src={previewUrl} alt="Design" className="w-full max-h-32 object-contain rounded-lg border border-slate-700 bg-slate-900 p-2" />}
                        <div className="space-y-1.5 text-sm text-slate-300">
                          <div className="flex justify-between"><span className="text-slate-500">Type</span><span className="font-bold text-white capitalize">{config.orderType === 'permanent' ? 'Permanent Vinyl' : config.orderType}</span></div>
                          {config.orderType === 'vinyl' && <div className="flex justify-between"><span className="text-slate-500">Size</span><span className="font-bold text-white">{config.vinylWidthCm} × {config.vinylHeightCm} cm</span></div>}
                          {config.orderType === 'permanent' && <div className="flex justify-between"><span className="text-slate-500">Size</span><span className="font-bold text-white">{config.permanentWidthCm} × {config.permanentHeightCm} cm</span></div>}
                          {config.orderType === 'apparel' && <div className="flex justify-between"><span className="text-slate-500">Garment</span><span className="font-bold text-white">{config.apparelType} · {config.apparelColor} · {config.apparelSize}</span></div>}
                          <div className="flex justify-between"><span className="text-slate-500">Qty</span><span className="font-bold text-white">{config.quantity}</span></div>
                        </div>
                        <div className="border-t border-slate-700 pt-3 space-y-1.5 text-sm">
                          <div className="flex justify-between text-slate-400"><span>Subtotal</span><span className="font-mono">${subtotal.toFixed(2)}</span></div>
                          <div className="flex justify-between text-slate-400"><span>Shipping</span><span className="font-mono">${SHIPPING_AUD.toFixed(2)}</span></div>
                          <div className="flex justify-between text-lg font-black text-white"><span>Total</span><span className="font-mono text-[#FF1493]">${total} AUD</span></div>
                        </div>
                      </div>

                      {/* PayPal — only renders after form is valid */}
                      <div className={`transition-all duration-300 ${formReady ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                        {!formReady && (
                          <p className="text-center text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Complete the form to unlock payment</p>
                        )}
                        <PayPalButtons
                          style={{ layout: 'vertical', color: 'gold', shape: 'rect', label: 'pay' }}
                          createOrder={createPayPalOrder}
                          onApprove={onPayPalApprove}
                          disabled={!formReady}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button type="button" onClick={() => setStep(2)} className="px-6 py-4 rounded-xl font-bold text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors">← Back</button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </PayPalScriptProvider>
  );
}

