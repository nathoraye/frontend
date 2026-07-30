import * as fabric from 'fabric';
import { useEffect, useRef } from 'react';

export function useAlignmentEngine(canvas: fabric.Canvas | null) {
  const activeGuides = useRef<{ x: number | null; y: number | null }>({ x: null, y: null });

  useEffect(() => {
    if (!canvas) return;

    const grid = 20;
    const snapZone = 8;
    const alignZone = 6;
    const guideColor = '#FF1493'; 

    const onObjectMoving = (e: fabric.BasicTransformEvent<fabric.TPointerEvent> & { target: fabric.Object }) => {
      const activeObj = (e.target || e?.e?.target) as fabric.Object;
      if (!activeObj) return;

      const canvasWidth = 1200;
      const canvasHeight = 1200;
      
      const activeRect = activeObj.getBoundingRect();
      const activeCenterX = activeRect.left + activeRect.width / 2;
      const activeCenterY = activeRect.top + activeRect.height / 2;

      let snapX: number | null = null;
      let snapY: number | null = null;
      
      let dx = 0; 
      let dy = 0;

      const targets = canvas.getObjects();
      for (let i = 0; i < targets.length; i++) {
        const target = targets[i];
        
        if (target === activeObj || target.type === 'line' || target.type === 'path') continue;

        const targetRect = target.getBoundingRect();
        const targetCenterX = targetRect.left + targetRect.width / 2;
        const targetCenterY = targetRect.top + targetRect.height / 2;

        if (snapX === null) {
          if (Math.abs(activeCenterX - targetCenterX) < alignZone) {
            dx = targetCenterX - activeCenterX;
            snapX = targetCenterX;
          } else if (Math.abs(activeRect.left - targetRect.left) < alignZone) {
            dx = targetRect.left - activeRect.left;
            snapX = targetRect.left;
          } else if (Math.abs((activeRect.left + activeRect.width) - (targetRect.left + targetRect.width)) < alignZone) {
            dx = (targetRect.left + targetRect.width) - (activeRect.left + activeRect.width);
            snapX = targetRect.left + targetRect.width;
          }
        }

        if (snapY === null) {
          if (Math.abs(activeCenterY - targetCenterY) < alignZone) {
            dy = targetCenterY - activeCenterY;
            snapY = targetCenterY;
          } else if (Math.abs(activeRect.top - targetRect.top) < alignZone) {
            dy = targetRect.top - activeRect.top;
            snapY = targetRect.top;
          } else if (Math.abs((activeRect.top + activeRect.height) - (targetRect.top + targetRect.height)) < alignZone) {
            dy = (targetRect.top + targetRect.height) - (activeRect.top + activeRect.height);
            snapY = targetRect.top + targetRect.height;
          }
        }

        if (snapX !== null && snapY !== null) break;
      }

      if (snapX === null && Math.abs(activeCenterX - canvasWidth / 2) < alignZone) {
        dx = (canvasWidth / 2) - activeCenterX;
        snapX = canvasWidth / 2;
      }
      if (snapY === null && Math.abs(activeCenterY - canvasHeight / 2) < alignZone) {
        dy = (canvasHeight / 2) - activeCenterY;
        snapY = canvasHeight / 2;
      }

      if (dx !== 0) activeObj.set({ left: activeObj.left! + dx });
      if (dy !== 0) activeObj.set({ top: activeObj.top! + dy });

      if (snapX === null) {
        const currentLeft = activeObj.left || 0;
        const snappedLeft = Math.round(currentLeft / grid) * grid;
        if (Math.abs(currentLeft - snappedLeft) < snapZone) activeObj.set({ left: snappedLeft });
      }
      if (snapY === null) {
        const currentTop = activeObj.top || 0;
        const snappedTop = Math.round(currentTop / grid) * grid;
        if (Math.abs(currentTop - snappedTop) < snapZone) activeObj.set({ top: snappedTop });
      }

      activeGuides.current = { x: snapX, y: snapY };
    };

    const onAfterRender = (opt: { ctx?: CanvasRenderingContext2D }) => {
      const ctx = opt.ctx;
      const guides = activeGuides.current;
      if (!ctx || (guides.x === null && guides.y === null)) return;

      const vpt = canvas.viewportTransform;
      if (!vpt) return;
      const zoom = canvas.getZoom();

      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0); 
      ctx.strokeStyle = guideColor;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);

      if (guides.x !== null) {
        const visualX = guides.x * zoom + vpt[4];
        ctx.beginPath(); ctx.moveTo(visualX, 0); ctx.lineTo(visualX, canvas.height || window.innerHeight); ctx.stroke();
      }
      if (guides.y !== null) {
        const visualY = guides.y * zoom + vpt[5];
        ctx.beginPath(); ctx.moveTo(0, visualY); ctx.lineTo(canvas.width || window.innerWidth, visualY); ctx.stroke();
      }
      ctx.restore();
    };

    const clearGuides = () => {
      if (activeGuides.current.x !== null || activeGuides.current.y !== null) {
        activeGuides.current = { x: null, y: null };
        canvas.requestRenderAll(); 
      }
    };

    canvas.on('object:moving', onObjectMoving);
    canvas.on('after:render', onAfterRender);
    canvas.on('mouse:up', clearGuides);

    return () => {
      canvas.off('object:moving', onObjectMoving);
      canvas.off('after:render', onAfterRender);
      canvas.off('mouse:up', clearGuides);
    };
  }, [canvas]);
}
