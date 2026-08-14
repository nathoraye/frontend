import { useRef } from 'react';
import { Upload, Trash2, Shirt } from 'lucide-react';
import { useCustomizerStore, COLOR_OPTIONS } from '../../store/useCustomizerStore';
import type { CustomizerPhase, CustomizerStep, PlacementZone } from '../../types/customizer';

const STEPS: CustomizerStep[] = ['Customizer', 'Grade/Scale', 'Colors'];
const PHASES: CustomizerPhase[] = ['Overview', 'Review'];
const PLACEMENT_ZONES: PlacementZone[] = ['chest', 'pocket', 'back', 'sleeve'];

/** Simple inline SVG swatches so preset graphics work without external assets. */
const PRESET_GRAPHICS: { id: string; name: string; imageUrl: string }[] = [
  {
    id: 'preset-star',
    name: 'Star Burst',
    imageUrl:
      'data:image/svg+xml;utf8,' +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><polygon points="50,5 61,39 97,39 68,61 79,95 50,73 21,95 32,61 3,39 39,39" fill="#FF1493"/></svg>',
      ),
  },
  {
    id: 'preset-bolt',
    name: 'Lightning Bolt',
    imageUrl:
      'data:image/svg+xml;utf8,' +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><polygon points="55,2 10,58 42,58 38,98 88,40 54,40" fill="#facc15"/></svg>',
      ),
  },
  {
    id: 'preset-wave',
    name: 'Wave',
    imageUrl:
      'data:image/svg+xml;utf8,' +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M0 60 Q 25 20 50 60 T 100 60 V100 H0 Z" fill="#38bdf8"/></svg>',
      ),
  },
];

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export function SidebarControls() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const color = useCustomizerStore((s) => s.color);
  const setColor = useCustomizerStore((s) => s.setColor);
  const step = useCustomizerStore((s) => s.step);
  const setStep = useCustomizerStore((s) => s.setStep);
  const phase = useCustomizerStore((s) => s.phase);
  const setPhase = useCustomizerStore((s) => s.setPhase);

  const decals = useCustomizerStore((s) => s.decals);
  const activeDecalId = useCustomizerStore((s) => s.activeDecalId);
  const setActiveDecalId = useCustomizerStore((s) => s.setActiveDecalId);
  const addDecal = useCustomizerStore((s) => s.addDecal);
  const removeDecal = useCustomizerStore((s) => s.removeDecal);
  const updateActiveDecalPosition = useCustomizerStore((s) => s.updateActiveDecalPosition);
  const updateActiveDecalScale = useCustomizerStore((s) => s.updateActiveDecalScale);
  const updateActiveDecalOpacity = useCustomizerStore((s) => s.updateActiveDecalOpacity);

  const activePlacement = useCustomizerStore((s) => s.activePlacement);
  const setActivePlacement = useCustomizerStore((s) => s.setActivePlacement);

  const activeDecal = decals.find((d) => d.id === activeDecalId) ?? null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const imageUrl = await readFileAsDataURL(file);
      addDecal({
        imageUrl,
        name: file.name,
        placement: activePlacement,
        position: { x: 0, y: 0 },
        scale: 1,
        opacity: 1,
        rotation: 0,
      });
    } catch (err) {
      console.error('Graphic upload failed:', err);
    } finally {
      e.target.value = '';
    }
  };

  const handleSelectPreset = (preset: (typeof PRESET_GRAPHICS)[number]) => {
    addDecal({
      imageUrl: preset.imageUrl,
      name: preset.name,
      placement: activePlacement,
      position: { x: 0, y: 0 },
      scale: 1,
      opacity: 1,
      rotation: 0,
    });
  };

  return (
    <aside className="w-80 shrink-0 border-r border-neutral-200 bg-neutral-50 text-neutral-800 flex flex-col h-full overflow-y-auto custom-scrollbar">
      {/* Step tabs */}
      <div className="flex border-b border-neutral-200 bg-white">
        {STEPS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStep(s)}
            className={`flex-1 py-3 text-xs font-semibold tracking-wide transition-colors ${
              step === s ? 'text-neutral-900 border-b-2 border-neutral-900' : 'text-neutral-400 hover:text-neutral-600'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Phase tabs */}
      <div className="flex gap-2 px-4 py-3 border-b border-neutral-200">
        {PHASES.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPhase(p)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              phase === p ? 'bg-neutral-900 text-white' : 'bg-neutral-200 text-neutral-500 hover:bg-neutral-300/70'
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      <div className="flex-1 flex flex-col gap-6 p-4">
        {/* Color palette */}
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-3">Colors</h3>
          <div className="grid grid-cols-5 gap-3">
            {COLOR_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                title={option.name}
                aria-label={option.name}
                onClick={() => setColor(option)}
                className={`w-9 h-9 rounded-full border-2 transition-transform ${
                  color.id === option.id ? 'border-neutral-900 scale-110 ring-2 ring-neutral-900/20' : 'border-neutral-300 hover:scale-105'
                }`}
                style={{ backgroundColor: option.hex }}
              />
            ))}
          </div>
          <p className="mt-2 text-xs text-neutral-500">{color.name}</p>
        </section>

        {/* Graphic / Decal section */}
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-3">Graphic</h3>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/svg+xml"
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 rounded-lg border border-dashed border-neutral-300 py-2.5 text-sm text-neutral-500 hover:border-neutral-900 hover:text-neutral-900 transition-colors"
          >
            <Upload size={16} /> Add Graphic
          </button>

          <div className="grid grid-cols-3 gap-2 mt-3">
            {PRESET_GRAPHICS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                title={preset.name}
                onClick={() => handleSelectPreset(preset)}
                className="aspect-square rounded-lg border border-neutral-200 bg-white p-2 hover:border-neutral-900 transition-colors"
              >
                <img src={preset.imageUrl} alt={preset.name} className="w-full h-full object-contain" />
              </button>
            ))}
          </div>

          {decals.length > 0 && (
            <div className="mt-3 flex flex-col gap-1.5">
              {decals.map((decal) => (
                <div
                  key={decal.id}
                  className={`flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs ${
                    decal.id === activeDecalId ? 'bg-neutral-900 text-white' : 'bg-white border border-neutral-200 text-neutral-700'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setActiveDecalId(decal.id)}
                    className="flex-1 flex items-center gap-2 text-left truncate"
                  >
                    <img src={decal.imageUrl} alt="" className="w-5 h-5 object-contain rounded shrink-0" />
                    <span className="truncate">{decal.name}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => removeDecal(decal.id)}
                    aria-label={`Remove ${decal.name}`}
                    className={`shrink-0 transition-colors ${decal.id === activeDecalId ? 'text-neutral-300 hover:text-red-400' : 'text-neutral-400 hover:text-red-500'}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Decal adjustment controls */}
          <div className={`mt-4 flex flex-col gap-3 ${activeDecal ? '' : 'opacity-40 pointer-events-none'}`}>
            <div>
              <label className="flex justify-between text-xs text-neutral-500 mb-1">
                <span>Position X</span>
                <span>{activeDecal?.position.x ?? 0}</span>
              </label>
              <input
                type="range"
                min={-100}
                max={100}
                value={activeDecal?.position.x ?? 0}
                onChange={(e) =>
                  updateActiveDecalPosition({
                    x: Number(e.target.value),
                    y: activeDecal?.position.y ?? 0,
                  })
                }
                className="w-full accent-neutral-900"
              />
            </div>
            <div>
              <label className="flex justify-between text-xs text-neutral-500 mb-1">
                <span>Position Y</span>
                <span>{activeDecal?.position.y ?? 0}</span>
              </label>
              <input
                type="range"
                min={-100}
                max={100}
                value={activeDecal?.position.y ?? 0}
                onChange={(e) =>
                  updateActiveDecalPosition({
                    x: activeDecal?.position.x ?? 0,
                    y: Number(e.target.value),
                  })
                }
                className="w-full accent-neutral-900"
              />
            </div>
            <div>
              <label className="flex justify-between text-xs text-neutral-500 mb-1">
                <span>Scale</span>
                <span>{(activeDecal?.scale ?? 1).toFixed(2)}x</span>
              </label>
              <input
                type="range"
                min={0.25}
                max={2.5}
                step={0.05}
                value={activeDecal?.scale ?? 1}
                onChange={(e) => updateActiveDecalScale(Number(e.target.value))}
                className="w-full accent-neutral-900"
              />
            </div>
            <div>
              <label className="flex justify-between text-xs text-neutral-500 mb-1">
                <span>Opacity</span>
                <span>{Math.round((activeDecal?.opacity ?? 1) * 100)}%</span>
              </label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={activeDecal?.opacity ?? 1}
                onChange={(e) => updateActiveDecalOpacity(Number(e.target.value))}
                className="w-full accent-neutral-900"
              />
            </div>
          </div>
        </section>

        {/* Placement zone selector */}
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-3 flex items-center gap-1.5">
            <Shirt size={14} /> Placement
          </h3>
          <select
            value={activePlacement}
            onChange={(e) => setActivePlacement(e.target.value as PlacementZone)}
            className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 focus:outline-none focus:border-neutral-900"
          >
            {PLACEMENT_ZONES.map((zone) => (
              <option key={zone} value={zone}>
                {zone.charAt(0).toUpperCase() + zone.slice(1)}
              </option>
            ))}
          </select>
        </section>
      </div>
    </aside>
  );
}

export default SidebarControls;
