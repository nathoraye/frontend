/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useMemo } from 'react';
import * as fabric from 'fabric';

interface ContourModalProps {
  targetPath: fabric.Path;
  onConfirm: (newPathString: string | null) => void;
  onCancel: () => void;
}

export function ContourModal({ targetPath, onConfirm, onCancel }: ContourModalProps) {
    // 1. Split the compound path into individual sub-paths mathematically
    const subPaths = useMemo(() => {
        const paths: any[][] = [];
        let current: any[] = [];
        
        if (targetPath.path) {
            targetPath.path.forEach((cmd: any) => {
                const letter = cmd[0];
                if ((letter === 'M' || letter === 'm') && current.length > 0) {
                    paths.push(current);
                    current = [];
                }
                current.push(cmd);
            });
            if (current.length > 0) paths.push(current);
        }
        return paths;
    }, [targetPath]);

    // 2. Track which paths are toggled ON
    const [activeIdx, setActiveIdx] = useState<Set<number>>(new Set(subPaths.map((_, i) => i)));

    const toggle = (i: number) => {
        const next = new Set(activeIdx);
        if (next.has(i)) next.delete(i); else next.add(i);
        setActiveIdx(next);
    };

    const toggleAll = () => {
        if (activeIdx.size > 0) setActiveIdx(new Set());
        else setActiveIdx(new Set(subPaths.map((_, i) => i)));
    };

    const handleConfirm = () => {
        if (activeIdx.size === 0) {
            onConfirm(null); // Delete the shape entirely
            return;
        }
        
        // Rebuild the final path string using only the active sub-paths
        const finalPathData: any[] = [];
        subPaths.forEach((sp, i) => {
            if (activeIdx.has(i)) finalPathData.push(...sp);
        });
        
        const pathString = finalPathData.map(cmd => cmd.join(' ')).join(' ');
        onConfirm(pathString);
    };

    // Viewbox mapping ensures the SVG renders perfectly in the modal
    const vbX = -(targetPath.pathOffset?.x || 0);
    const vbY = -(targetPath.pathOffset?.y || 0);
    const vbW = targetPath.width || 100;
    const vbH = targetPath.height || 100;
    const viewBox = `${vbX} ${vbY} ${vbW} ${vbH}`;

    // Helper to render fabric commands into standard SVG string
    const cmdToPath = (cmdArray: any[]) => cmdArray.map(cmd => cmd.join(' ')).join(' ');

    return (
        <div className="fixed inset-0 z-[100] flex flex-col bg-[#0f111a]/95 select-none backdrop-blur-sm p-8">
            <div className="flex-none text-white text-center mb-6">
                <h2 className="text-2xl font-black tracking-widest uppercase mb-2">Hide Contours</h2>
                <p className="text-sm text-slate-400">Select the internal lines you want to hide from the final cut.</p>
            </div>
            
            <div className="flex-1 w-full max-w-6xl mx-auto flex gap-6 overflow-hidden min-h-0">
                {/* LEFT PANE: Interactive Giant SVG Preview */}
                <div className="flex-1 relative bg-black/50 border border-slate-700 rounded-xl p-8 flex items-center justify-center shadow-2xl">
                    <svg viewBox={viewBox} className="w-full h-full max-h-full overflow-visible drop-shadow-2xl">
                        {subPaths.map((sp, i) => {
                            const isActive = activeIdx.has(i);
                            return (
                                <path 
                                    key={i}
                                    d={cmdToPath(sp)}
                                    fill={isActive ? (targetPath.fill as string || '#FF1493') : '#1e2230'}
                                    stroke={isActive ? 'none' : '#334155'}
                                    strokeWidth={isActive ? 0 : 2}
                                    className="transition-all duration-200 cursor-pointer hover:stroke-white hover:stroke-[3px]"
                                    onClick={() => toggle(i)}
                                    style={{ opacity: isActive ? 1 : 0.4 }}
                                />
                            );
                        })}
                    </svg>
                </div>

                {/* RIGHT PANE: Scrollable Parts List */}
                <div className="w-80 flex flex-col bg-[#181a25] border border-slate-700 rounded-xl overflow-hidden shadow-2xl">
                    <div className="p-4 border-b border-slate-700 bg-slate-800/50 flex justify-between items-center">
                        <span className="font-bold text-slate-200 uppercase tracking-wider text-sm">Cut Paths ({subPaths.length})</span>
                        <button onClick={toggleAll} className="text-xs font-bold text-[#FF1493] hover:text-[#ff4da6] transition-colors">
                            {activeIdx.size > 0 ? 'Hide All' : 'Show All'}
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                        {subPaths.map((sp, i) => {
                            const isActive = activeIdx.has(i);
                            return (
                                <div 
                                    key={i} 
                                    onClick={() => toggle(i)}
                                    className={`flex items-center gap-4 p-3 rounded-lg border transition-all cursor-pointer ${isActive ? 'bg-slate-800/80 border-slate-600' : 'bg-black/40 border-slate-800 opacity-50 grayscale'}`}
                                >
                                    <div className="w-12 h-12 bg-black/50 rounded flex items-center justify-center p-1 shrink-0">
                                        <svg viewBox={viewBox} className="w-full h-full object-contain">
                                            <path d={cmdToPath(sp)} fill={targetPath.fill as string || '#FF1493'} />
                                        </svg>
                                    </div>
                                    <span className="text-xs font-mono text-slate-400">Path {i + 1}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            <div className="flex-none mt-8 flex justify-center gap-4">
                <button onClick={onCancel} className="px-8 py-3 rounded-lg font-bold text-white bg-slate-800 hover:bg-slate-700 transition-colors border border-slate-600">
                    Cancel
                </button>
                <button onClick={handleConfirm} className="px-8 py-3 rounded-lg font-black uppercase tracking-wider text-white bg-[#FF1493] hover:bg-[#ff4da6] transition-all shadow-lg shadow-[#FF1493]/20 hover:shadow-[#FF1493]/40 hover:-translate-y-0.5 active:translate-y-0">
                    Apply Changes
                </button>
            </div>
        </div>
    );
}
