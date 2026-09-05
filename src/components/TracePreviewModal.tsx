import { useEffect, useState } from 'react';
import DOMPurify from 'dompurify';
import type { ColorTraceParams } from '../utils/traceParams';
import { DEFAULT_COLOR_TRACE } from '../utils/traceParams';

interface TracePreviewModalProps {
  rasterDataUrl: string;
  imageData: ImageData;
  traceImage: (imageData: ImageData, params?: ColorTraceParams) => Promise<string>;
  onAccept: (svg: string) => void;
  onCancel: () => void;
}

export function TracePreviewModal({
  rasterDataUrl,
  imageData,
  traceImage,
  onAccept,
  onCancel,
}: TracePreviewModalProps) {
  const [maxColors, setMaxColors] = useState(DEFAULT_COLOR_TRACE.maxColors);
  const [cornerThreshold, setCornerThreshold] = useState(DEFAULT_COLOR_TRACE.cornerThreshold);
  const [curveFit, setCurveFit] = useState(DEFAULT_COLOR_TRACE.curveFit);
  const [filterSpeckle, setFilterSpeckle] = useState(DEFAULT_COLOR_TRACE.filterSpeckle);
  const [svg, setSvg] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const handle = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const next = await traceImage(imageData, { maxColors, cornerThreshold, curveFit, filterSpeckle });
        if (!cancelled) setSvg(next);
      } catch (err) {
        if (!cancelled) {
          setSvg('');
          setError(err instanceof Error ? err.message : 'Trace failed');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [imageData, maxColors, cornerThreshold, curveFit, filterSpeckle, traceImage]);

  const safeSvg = svg
    ? DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } })
    : '';

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-[#0f111a]/95 select-none backdrop-blur-sm p-4 md:p-8">
      <div className="flex-none text-white text-center mb-4">
        <h2 className="text-xl md:text-2xl font-black tracking-widest uppercase mb-1">Trace to Razor SVG</h2>
        <p className="text-sm text-slate-400">Compare the original raster with a colour-accurate vector. Accept only if the holes and paint colours look right.</p>
      </div>

      <div className="flex-1 w-full max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-4 min-h-0 overflow-hidden">
        <figure className="flex flex-col min-h-0 rounded-xl border border-slate-700 bg-black/40 p-3">
          <figcaption className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Original raster</figcaption>
          <div className="flex-1 min-h-0 flex items-center justify-center overflow-hidden rounded-lg" style={{ backgroundImage: 'linear-gradient(45deg,#2a2d38 25%,transparent 25%),linear-gradient(-45deg,#2a2d38 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#2a2d38 75%),linear-gradient(-45deg,transparent 75%,#2a2d38 75%)', backgroundSize: '16px 16px', backgroundPosition: '0 0,0 8px,8px -8px,-8px 0', backgroundColor: '#1a1c24' }}>
            <img src={rasterDataUrl} alt="Original raster" className="max-w-full max-h-full object-contain" />
          </div>
        </figure>
        <figure className="flex flex-col min-h-0 rounded-xl border border-slate-700 bg-black/40 p-3">
          <figcaption className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
            Vector trace {loading ? '(updating…)' : ''}
          </figcaption>
          <div className="flex-1 min-h-0 flex items-center justify-center overflow-hidden rounded-lg" style={{ backgroundImage: 'linear-gradient(45deg,#2a2d38 25%,transparent 25%),linear-gradient(-45deg,#2a2d38 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#2a2d38 75%),linear-gradient(-45deg,transparent 75%,#2a2d38 75%)', backgroundSize: '16px 16px', backgroundPosition: '0 0,0 8px,8px -8px,-8px 0', backgroundColor: '#1a1c24' }}>
            {error && <p className="text-red-400 text-sm px-4 text-center">{error}</p>}
            {!error && safeSvg && (
              <div className="w-full h-full flex items-center justify-center [&_svg]:max-w-full [&_svg]:max-h-full [&_svg]:w-auto [&_svg]:h-auto" dangerouslySetInnerHTML={{ __html: safeSvg }} />
            )}
          </div>
        </figure>
      </div>

      <div className="flex-none w-full max-w-6xl mx-auto mt-4 rounded-xl border border-slate-700 bg-[#181a25] p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Colours <span className="font-mono text-[#FF1493]">{maxColors}</span>
            <input type="range" min={2} max={16} value={maxColors} onChange={(e) => setMaxColors(Number(e.target.value))} className="w-full accent-[#FF1493] mt-2" />
            <span className="block normal-case font-medium tracking-normal mt-1 text-slate-500">6–8 keeps thin outlines as their own ink.</span>
          </label>
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Corner sharpness <span className="font-mono text-[#FF1493]">{cornerThreshold}°</span>
            <input type="range" min={20} max={180} value={cornerThreshold} onChange={(e) => setCornerThreshold(Number(e.target.value))} className="w-full accent-[#FF1493] mt-2" />
          </label>
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Curve fit <span className="font-mono text-[#FF1493]">{curveFit}</span>
            <input type="range" min={0} max={10} value={curveFit} onChange={(e) => setCurveFit(Number(e.target.value))} className="w-full accent-[#FF1493] mt-2" />
            <span className="block normal-case font-medium tracking-normal mt-1 text-slate-500">0 hugs the pixels; higher smooths splines.</span>
          </label>
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Drop specks <span className="font-mono text-[#FF1493]">{filterSpeckle}</span>
            <input type="range" min={0} max={8} value={filterSpeckle} onChange={(e) => setFilterSpeckle(Number(e.target.value))} className="w-full accent-[#FF1493] mt-2" />
            <span className="block normal-case font-medium tracking-normal mt-1 text-slate-500">0 keeps small numbers and thin strokes.</span>
          </label>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" onClick={onCancel} className="h-9 px-4 rounded-lg font-bold text-white bg-slate-800 hover:bg-slate-700 border border-slate-600">
            Cancel
          </button>
          <button
            type="button"
            disabled={!svg || loading || !!error}
            onClick={() => onAccept(svg)}
            className="h-9 px-5 rounded-lg font-black uppercase tracking-wider text-white bg-[#FF1493] hover:bg-[#ff4da6] disabled:opacity-40 disabled:pointer-events-none"
          >
            Use this trace
          </button>
        </div>
      </div>
    </div>
  );
}
