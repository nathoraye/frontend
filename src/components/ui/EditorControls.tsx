import { useCustomizerStore } from '../../store/useCustomizerStore';

const SWATCHES = ['#000000', '#ffffff', '#e63946', '#2a9d8f', '#264653'];

export default function EditorControls() {
  const setGarmentColor = useCustomizerStore((s) => s.setGarmentColor);
  const addText = useCustomizerStore((s) => s.addText);
  const garmentColor = useCustomizerStore((s) => s.garmentColor);

  return (
    <div className="bg-gray-900 text-white p-4 rounded-lg w-56 flex flex-col gap-4">
      <button
        type="button"
        onClick={addText}
        className="w-full rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium hover:bg-indigo-500 transition-colors"
      >
        Add Text
      </button>

      <div>
        <p className="text-xs font-medium text-gray-400 mb-2">Garment Color</p>
        <div className="grid grid-cols-5 gap-2">
          {SWATCHES.map((hex) => (
            <button
              key={hex}
              type="button"
              aria-label={`Set garment color to ${hex}`}
              onClick={() => setGarmentColor(hex)}
              className={`h-8 w-8 rounded-full border-2 transition-transform hover:scale-105 ${
                garmentColor === hex ? 'border-indigo-400' : 'border-gray-700'
              }`}
              style={{ backgroundColor: hex }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
