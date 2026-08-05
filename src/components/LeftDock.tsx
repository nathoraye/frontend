import React from 'react';

type ToolMode = 'select' | 'draw' | 'track-line' | 'wand' | 'bucket' | 'eraser';

type ShapeType = 'rect' | 'circle' | 'triangle' | 'star' | 'hex';

interface LeftDockProps {
  tool: ToolMode;
  setTool: (tool: ToolMode) => void;
  addText: () => void;
  addShape: (shape: ShapeType) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handleImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  borderCol: string;
  bgPanel: string;
  setShowLeftPanel?: (show: boolean) => void;
}

export const LeftDock: React.FC<LeftDockProps> = React.memo(({
  tool, setTool, addText, addShape, fileInputRef, handleImageUpload, borderCol, bgPanel, setShowLeftPanel
}) => {
  return (
    <aside className={`w-16 border-r ${borderCol} ${bgPanel} flex flex-col items-center py-4 gap-3 z-10 shrink-0 overflow-y-auto overflow-x-hidden custom-scrollbar relative`}>
      {setShowLeftPanel && (
        <button type="button" onClick={() => setShowLeftPanel(false)} className="absolute top-1 right-1 p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 transition-colors touch-manipulation" title="Hide Sidebar" aria-label="Hide sidebar">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/></svg>
        </button>
      )}
      <ToolBtn active={tool==='select'} onClick={() => setTool('select')} icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m3 3 7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/><path d="m13 13 6 6"/></svg>} tooltip="Select (V)" />
      <ToolBtn active={tool==='wand'} onClick={() => setTool('wand')} icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 7-1-1-1 1 1 1 1-1Z"/><path d="m12 11-1-1-1 1 1 1 1-1Z"/><path d="m19 12-1-1-1 1 1 1 1-1Z"/><path d="m8 6-1-1-1 1 1 1 1-1Z"/><path d="m20.12 16.18-8.59 8.59a2 2 0 0 1-2.83 0l-5.66-5.66a2 2 0 0 1 0-2.83l8.59-8.59"/></svg>} tooltip="Magic Wand" />
      <ToolBtn active={tool==='draw'} onClick={() => setTool('draw')} icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m18 5-3-3H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2"/><path d="M8 18h1"/><path d="M18.4 9.6a2 2 0 1 1 2.8 2.8L12 21l-4 1 1-4Z"/></svg>} tooltip="Brush Tool (B)" />
      <ToolBtn active={tool==='track-line'} onClick={() => setTool('track-line')} icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3v18"/><path d="M3 17v-4a4 4 0 0 1 4-4h14"/></svg>} tooltip="Track Line (Click to track, Double click to end)" />
      <ToolBtn active={tool==='bucket'} onClick={() => setTool('bucket')} icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m19 11-8-8-8.6 8.6a2 2 0 0 0 0 2.8l5.2 5.2c.8.8 2 .8 2.8 0L19 11Z"/><path d="m5 2 5 5"/><path d="M2 13h15"/><path d="M22 20a2 2 0 1 1-4 0c0-1.6 1.7-2.4 2-4 .3 1.6 2 2.4 2 4Z"/></svg>} tooltip="Paint Bucket (Fill)" />
      
      <div className={`w-8 h-px ${borderCol} my-1`}></div>
      <ToolBtn active={false} onClick={addText} icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" x2="15" y1="20" y2="20"/><line x1="12" x2="12" y1="4" y2="20"/></svg>} tooltip="Add Text (T)" />
      <ToolBtn active={false} onClick={() => addShape('rect')} icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="18" height="18" x="3" y="3" rx="2" /></svg>} tooltip="Square" />
      <ToolBtn active={false} onClick={() => addShape('circle')} icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /></svg>} tooltip="Circle" />
      <ToolBtn active={false} onClick={() => addShape('triangle')} icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3 2 21h20Z" /></svg>} tooltip="Triangle" />
      <ToolBtn active={false} onClick={() => addShape('star')} icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>} tooltip="Star" />
      <ToolBtn active={false} onClick={() => addShape('hex')} icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2"/></svg>} tooltip="Hexagon" />
      
      <div className={`w-8 h-px ${borderCol} my-1`}></div>
      <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" className="hidden" />
      <ToolBtn active={false} onClick={() => fileInputRef.current?.click()} icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="18" height="18" x="3" y="3" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /></svg>} tooltip="Import Image" />
    </aside>
  );
});

interface ToolBtnProps {
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
  tooltip: string;
}

function ToolBtn({ icon, active, onClick, tooltip }: ToolBtnProps) {
  return (
    <button onClick={onClick} title={tooltip} className={`p-3 rounded-xl transition-all ${active ? 'bg-[#FF1493] text-white shadow-lg shadow-pink-900/40 transform scale-105' : 'text-slate-400 hover:text-slate-100 hover:bg-slate-700/50'}`}>
      {icon}
    </button>
  );
}