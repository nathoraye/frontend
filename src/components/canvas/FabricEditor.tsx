import { useEffect, useRef, useState } from 'react';
import * as fabric from 'fabric';
import { Image as ImageIcon, Moon, Square, Sun, Trash2, Type } from 'lucide-react';
import { useFabricEditor } from '../../hooks/useFabricEditor';

const LIGHT_BG = '#ffffff';
const DARK_BG = '#2b2d31';

interface ToolButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}

function ToolButton({ icon, label, onClick }: ToolButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200/70 active:bg-neutral-900 active:text-white transition-colors"
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

/** Left-side 2D Fabric.js editor: the live drawing surface bridged to the 3D texture via useFabricEditor. */
export function FabricEditor() {
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null);
  const [isDark, setIsDark] = useState(false);

  const fabricCanvasRef = useFabricEditor(canvasEl, { width: 800, height: 800 });

  useEffect(() => {
    setCanvasEl(canvasElRef.current);
  }, []);

  const withCanvas = (fn: (canvas: fabric.Canvas) => void) => {
    const canvas = fabricCanvasRef.current;
    if (canvas) fn(canvas);
  };

  const handleAddText = () =>
    withCanvas((canvas) => {
      const text = new fabric.IText('Your Text', {
        left: 220,
        top: 220,
        fill: isDark ? '#ffffff' : '#111111',
        fontSize: 48,
        fontFamily: 'Helvetica',
      });
      canvas.add(text);
      canvas.setActiveObject(text);
      canvas.requestRenderAll();
    });

  const handleAddShape = () =>
    withCanvas((canvas) => {
      const rect = new fabric.Rect({ left: 260, top: 260, width: 160, height: 160, fill: '#FF1493' });
      canvas.add(rect);
      canvas.setActiveObject(rect);
      canvas.requestRenderAll();
    });

  const handleUploadClick = () => fileInputRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      withCanvas((canvas) => {
        fabric.Image.fromURL(dataUrl, { crossOrigin: 'anonymous' }).then((img) => {
          img.scaleToWidth(320);
          img.set({ left: 120, top: 120 });
          canvas.add(img);
          canvas.setActiveObject(img);
          canvas.requestRenderAll();
        });
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleClear = () =>
    withCanvas((canvas) => {
      canvas.clear();
      canvas.backgroundColor = isDark ? DARK_BG : LIGHT_BG;
      canvas.requestRenderAll();
    });

  const toggleBackground = () => {
    const next = !isDark;
    setIsDark(next);
    withCanvas((canvas) => {
      canvas.backgroundColor = next ? DARK_BG : LIGHT_BG;
      canvas.requestRenderAll();
    });
  };

  return (
    <div className="flex flex-col h-full bg-neutral-100">
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-neutral-200 bg-white">
        <div className="flex items-center gap-1">
          <ToolButton icon={<Type size={16} />} label="Text" onClick={handleAddText} />
          <ToolButton icon={<Square size={16} />} label="Shape" onClick={handleAddShape} />
          <ToolButton icon={<ImageIcon size={16} />} label="Upload" onClick={handleUploadClick} />
          <ToolButton icon={<Trash2 size={16} />} label="Clear" onClick={handleClear} />
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
        </div>

        <button
          type="button"
          onClick={toggleBackground}
          title="Toggle canvas background"
          aria-pressed={isDark}
          className="relative inline-flex items-center h-7 w-14 shrink-0 rounded-full bg-neutral-200 transition-colors"
        >
          <span
            className={`absolute inset-y-0.5 left-0.5 flex items-center justify-center w-6 h-6 rounded-full bg-neutral-900 text-white shadow transition-transform ${
              isDark ? 'translate-x-7' : 'translate-x-0'
            }`}
          >
            {isDark ? <Moon size={13} /> : <Sun size={13} />}
          </span>
        </button>
      </div>

      <div className="flex-1 flex items-center justify-center overflow-auto p-4">
        <canvas ref={canvasElRef} className="rounded-lg shadow-sm border border-neutral-200" />
      </div>
    </div>
  );
}

export default FabricEditor;
