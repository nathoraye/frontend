import { ShoppingCart, RotateCcw } from 'lucide-react';
import { useCustomizerStore } from '../../store/useCustomizerStore';
import type { CameraView } from '../../types/customizer';

const CAMERA_VIEWS: CameraView[] = ['front', 'back', 'side'];

const BASE_PRICE = 59.99;

export interface BottomBarProps {
  price?: number;
  onAddToCart?: () => void;
}

export function BottomBar({ price = BASE_PRICE, onAddToCart }: BottomBarProps) {
  const cameraView = useCustomizerStore((s) => s.cameraView);
  const setCameraView = useCustomizerStore((s) => s.setCameraView);
  const zoom = useCustomizerStore((s) => s.zoom);
  const setZoom = useCustomizerStore((s) => s.setZoom);
  const reset = useCustomizerStore((s) => s.reset);

  return (
    <div className="w-full border-t border-neutral-200 bg-white text-neutral-800 px-4 py-3 flex flex-wrap items-center justify-between gap-4">
      {/* Camera angle presets */}
      <div className="flex items-center gap-1.5 bg-neutral-100 rounded-full p-1">
        {CAMERA_VIEWS.map((view) => (
          <button
            key={view}
            type="button"
            onClick={() => setCameraView(view)}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold capitalize transition-colors ${
              cameraView === view ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:text-neutral-800'
            }`}
          >
            {view}
          </button>
        ))}
        <button
          type="button"
          onClick={reset}
          title="Reset customizer"
          aria-label="Reset customizer"
          className="ml-1 p-1.5 rounded-full text-neutral-400 hover:text-neutral-900 hover:bg-neutral-200/70 transition-colors"
        >
          <RotateCcw size={14} />
        </button>
      </div>

      {/* Zoom slider */}
      <div className="flex items-center gap-3 min-w-[200px]">
        <span className="text-xs text-neutral-500 shrink-0">Zoom</span>
        <input
          type="range"
          min={50}
          max={200}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="w-full accent-neutral-900"
        />
        <span className="text-xs text-neutral-600 w-10 text-right shrink-0">{zoom}%</span>
      </div>

      {/* Add to cart */}
      <button
        type="button"
        onClick={onAddToCart}
        className="flex items-center gap-2 rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-neutral-800 active:bg-black transition-colors"
      >
        <ShoppingCart size={16} />
        Add to Cart · ${price.toFixed(2)}
      </button>
    </div>
  );
}

export default BottomBar;
