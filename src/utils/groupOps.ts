import * as fabric from 'fabric';

type GroupLike = fabric.Object & {
  getObjects?: () => fabric.Object[];
  removeAll?: () => fabric.Object[];
};

type CanvasLike = {
  add: (...objects: fabric.Object[]) => unknown;
  remove: (...objects: fabric.Object[]) => unknown;
  setActiveObject?: (obj: fabric.Object) => unknown;
  requestRenderAll?: () => unknown;
};

export function isGroupLike(obj: fabric.Object | null | undefined): obj is fabric.Group {
  if (!obj) return false;
  const type = String(obj.type || '').toLowerCase();
  return type === 'group' || type === 'activeselection';
}

export function isUngroupable(obj: fabric.Object | null | undefined): obj is fabric.Group {
  return !!obj && String(obj.type || '').toLowerCase() === 'group';
}

export function getGroupChildren(obj: fabric.Object | null | undefined): fabric.Object[] {
  const getObjects = obj ? (obj as GroupLike).getObjects : undefined;
  if (typeof getObjects !== 'function') return [];
  return getObjects.call(obj) ?? [];
}

export function forEachLeafObject(obj: fabric.Object, visit: (leaf: fabric.Object) => void): void {
  if (isGroupLike(obj)) {
    getGroupChildren(obj).forEach((child) => forEachLeafObject(child, visit));
    return;
  }
  visit(obj);
}

const OFFSET_COLOR = '#FF1493';

/** Paint every nested path so a layered SVG gets a kiss-cut halo, not a duplicate. */
export function paintOffsetAppearance(
  obj: fabric.Object,
  strokeWidth: number,
  color: string = OFFSET_COLOR,
): void {
  const style = {
    fill: color,
    stroke: color,
    strokeWidth,
    strokeLineJoin: 'round' as const,
    strokeLineCap: 'round' as const,
    strokeUniform: true,
    dirty: true,
  };
  obj.set({
    ...style,
    originX: 'center',
    originY: 'center',
    evented: true,
    objectCaching: true,
  });
  forEachLeafObject(obj, (leaf) => {
    leaf.set(style);
  });
}

/** Fabric v7 dropped Group.toActiveSelection — explode one group level onto the canvas. */
export function ungroupOnce(canvas: CanvasLike, group: fabric.Group): fabric.Object[] {
  if (!isGroupLike(group)) return [];
  const removeAll = (group as GroupLike).removeAll;
  const children = typeof removeAll === 'function' ? removeAll.call(group) : getGroupChildren(group);
  canvas.remove(group);
  children.forEach((child) => canvas.add(child));
  if (children.length > 1) {
    try {
      const sel = new fabric.ActiveSelection(children, { canvas: canvas as fabric.Canvas });
      canvas.setActiveObject?.(sel);
    } catch {
      canvas.setActiveObject?.(children[0]);
    }
  } else if (children[0]) {
    canvas.setActiveObject?.(children[0]);
  }
  canvas.requestRenderAll?.();
  return children;
}

/** Fabric v7 dropped ActiveSelection.toGroup. */
export function groupActiveSelection(canvas: CanvasLike, selection: fabric.ActiveSelection): fabric.Group | null {
  const type = String(selection.type || '').toLowerCase();
  if (type !== 'activeselection') return null;
  const objects = typeof selection.removeAll === 'function'
    ? selection.removeAll()
    : selection.getObjects();
  if (!objects.length) return null;
  canvas.remove(selection);
  const group = new fabric.Group(objects, {
    originX: 'center',
    originY: 'center',
    cornerColor: '#FF1493',
    transparentCorners: false,
    cornerStyle: 'circle',
  });
  canvas.add(group);
  canvas.setActiveObject?.(group);
  canvas.requestRenderAll?.();
  return group;
}
