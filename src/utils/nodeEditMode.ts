/**
 * nodeEditMode.ts
 *
 * Interactive path-vertex editor for Fabric.js v7.
 *
 * When a designer enters "Node Edit Mode" on a traced vinyl path, the standard
 * scale/rotate handles are hidden and replaced with drag-able anchor points
 * mapped directly to the path's SVG command coordinates.  Dragging an anchor
 * writes back to the raw `pathObject.path` array in real time so cuts are
 * mathematically accurate without any intermediate approximation.
 *
 * Fabric v7 ships `controlsUtils.createPathControls`, which already implements
 * the positionHandler / actionHandler pair using `fabric.util.transformPoint`
 * and `fabric.util.invertTransform`.  We wrap that API cleanly, apply the vinyl
 * studio visual style, and expose `enterNodeEditMode` / `exitNodeEditMode`.
 */

import * as fabric from 'fabric';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The raw SVG path command tuple as stored in `fabric.Path.path`.
 * Each element is an array whose first item is the command letter followed by
 * numeric coordinate arguments:
 *   ['M', x, y]
 *   ['L', x, y]
 *   ['C', x1, y1, x2, y2, x, y]   — cubic Bézier
 *   ['Q', x1, y1, x, y]           — quadratic Bézier
 *   ['Z']                          — close path
 */
export type PathCommand = [string, ...number[]];

/** Fabric Path with the runtime `path` array exposed. */
export type EditablePath = fabric.Path & {
  path: PathCommand[];
};

// ---------------------------------------------------------------------------
// Visual style for anchor-point controls
// ---------------------------------------------------------------------------

/** Hot-pink accent matches the studio's `#FF1493` brand colour. */
const ANCHOR_FILL = '#FF1493';
const ANCHOR_STROKE = '#ffffff';
const ANCHOR_RADIUS = 5;

/**
 * Custom render function for anchor controls.
 * Draws a filled circle with a white border so anchors are visible on any
 * background colour.
 */
function renderAnchorControl(
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  _styleOverride: unknown,
  fabricObject: fabric.Object,
): void {
  // Save the current context state to avoid polluting other renders.
  ctx.save();

  // Translate to the control's screen position (Fabric passes the pre-
  // transformed coordinates so we just draw at the origin after translating).
  ctx.translate(left, top);

  // Apply the object's rotation so anchors rotate with the path.
  ctx.rotate(fabric.util.degreesToRadians(fabricObject.angle ?? 0));

  // Draw the filled circle.
  ctx.beginPath();
  ctx.arc(0, 0, ANCHOR_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = ANCHOR_FILL;
  ctx.fill();

  // White border makes the anchor legible over both dark and light fills.
  ctx.strokeStyle = ANCHOR_STROKE;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.restore();
}

// ---------------------------------------------------------------------------
// Node Edit Mode
// ---------------------------------------------------------------------------

/** Symbol used to stash the original controls so we can restore them. */
const ORIGINAL_CONTROLS_KEY = '__nodeEditOriginalControls__';
const ORIGINAL_CACHING_KEY = '__nodeEditOriginalCaching__';
const ORIGINAL_LOCKS_KEY = '__nodeEditOriginalLocks__';

const NODE_EDITABLE_TYPES = new Set(['path', 'polygon', 'polyline']);

export function isNodeEditable(obj: fabric.Object | null | undefined): boolean {
  if (!obj) return false;
  return NODE_EDITABLE_TYPES.has((obj.type || '').toLowerCase());
}

export function isInNodeEditMode(obj: fabric.Object | null | undefined): boolean {
  if (!obj) return false;
  return Boolean((obj as unknown as Record<string, unknown>)[ORIGINAL_CONTROLS_KEY]);
}

function isGroupType(obj: fabric.Object | null | undefined): obj is fabric.Group {
  if (!obj) return false;
  const type = String(obj.type || '').toLowerCase();
  return type === 'group' || type === 'activeselection';
}

function groupChildren(obj: fabric.Object): fabric.Object[] {
  const group = obj as fabric.Group;
  return typeof group.getObjects === 'function' ? group.getObjects() ?? [] : [];
}

function explodeGroup(group: fabric.Group, canvas: fabric.Canvas): fabric.Object[] {
  const children = typeof group.removeAll === 'function' ? group.removeAll() : groupChildren(group);
  canvas.remove(group);
  children.forEach((child) => canvas.add(child));
  return children;
}

export function canNodeEdit(obj: fabric.Object | null | undefined): boolean {
  if (!obj) return false;
  if (isNodeEditable(obj)) return true;
  if (!isGroupType(obj)) return false;
  return groupChildren(obj).some(canNodeEdit);
}

/**
 * Pick the object that should receive node controls.
 * Razor SVG and layered SVG groups are ungrouped (including nested colour
 * sheets) so each path can be edited with native Fabric controls.
 */
export function resolveEditableObject(
  obj: fabric.Object,
  canvas: fabric.Canvas,
): fabric.Object | null {
  if (isNodeEditable(obj)) return obj;
  if (!isGroupType(obj)) return null;
  let current: fabric.Object | null = obj;
  const seen = new Set<fabric.Object>();
  while (current && isGroupType(current) && !seen.has(current)) {
    seen.add(current);
    const kids = groupChildren(current);
    const leaf = kids.find(isNodeEditable);
    const nested = kids.find((child) => child !== leaf && canNodeEdit(child));
    explodeGroup(current, canvas);
    if (leaf) {
      canvas.setActiveObject(leaf);
      return leaf;
    }
    current = nested ?? null;
  }
  if (current && isNodeEditable(current)) {
    canvas.setActiveObject(current);
    return current;
  }
  return null;
}

/**
 * Enter node-edit mode on a `fabric.Path` object.
 *
 * What happens:
 *  1. The standard scaling / rotation handles are hidden.
 *  2. Fabric's built-in `createPathControls` generates one `fabric.Control`
 *     per path anchor (endpoint of M, L, C, Q commands) and one per Bézier
 *     control point (the off-curve handles of C/Q).
 *  3. Each control's `positionHandler` converts the stored path-local
 *     coordinate to a canvas screen position using the object's full
 *     transform matrix:
 *
 *       screenPt = transformPoint(localPt − pathOffset, viewportTransform × objectTransform)
 *
 *  4. Each control's `actionHandler` (provided by `createPathControls`)
 *     inverts that transform on every mouse-move to write the dragged position
 *     back into `pathObject.path[commandIndex][pointIndex]`:
 *
 *       localPt = transformPoint(mousePt, invertTransform(viewportTransform × objectTransform))
 *                 + pathOffset
 *
 *     It then calls `pathObject.setCoords()` and `canvas.requestRenderAll()`
 *     so the path outline updates every frame without stutter.
 *  5. The controls are styled with the custom anchor renderer defined above.
 *
 * @param pathObject  The `fabric.Path` to edit.
 * @param canvas      The `fabric.Canvas` instance (needed for re-render).
 */
export function enterNodeEditMode(
  pathObject: fabric.Object,
  canvas: fabric.Canvas,
): void {
  const editable = pathObject as EditablePath;
  const kind = (editable.type || '').toLowerCase();

  // Stash the original controls so we can restore them in exitNodeEditMode.
  const editableAny = editable as unknown as Record<string, unknown>;
  if (!editableAny[ORIGINAL_CONTROLS_KEY]) {
    editableAny[ORIGINAL_CONTROLS_KEY] = editable.controls;
    editableAny[ORIGINAL_CACHING_KEY] = editable.objectCaching;
    editableAny[ORIGINAL_LOCKS_KEY] = {
      lockMovementX: editable.lockMovementX,
      lockMovementY: editable.lockMovementY,
      lockRotation: editable.lockRotation,
      lockScalingX: editable.lockScalingX,
      lockScalingY: editable.lockScalingY,
      lockSkewingX: editable.lockSkewingX,
      lockSkewingY: editable.lockSkewingY,
    };
  }

  // Path commands use createPathControls; polygons / polylines use vertex controls.
  const nodeControls = kind === 'path'
    ? fabric.controlsUtils.createPathControls(editable)
    : fabric.controlsUtils.createPolyControls(editable as unknown as fabric.Polygon);

  // Apply the vinyl-studio visual style to every generated anchor.
  for (const key of Object.keys(nodeControls)) {
    const ctrl = nodeControls[key];

    // Mark Bézier control-point handles as slightly smaller and semi-transparent.
    const isControlPoint = key.includes('_CP_');

    ctrl.sizeX = isControlPoint ? ANCHOR_RADIUS * 1.5 : ANCHOR_RADIUS * 2;
    ctrl.sizeY = isControlPoint ? ANCHOR_RADIUS * 1.5 : ANCHOR_RADIUS * 2;
    ctrl.touchSizeX = ANCHOR_RADIUS * 4;
    ctrl.touchSizeY = ANCHOR_RADIUS * 4;
    ctrl.cursorStyle = 'crosshair';

    // Replace the default square render with our circle renderer.
    // Fabric.js v7 reads `render` from the Control instance if present.
    (ctrl as fabric.Control & { render?: typeof renderAnchorControl }).render =
      isControlPoint
        ? // Bézier handles: smaller, outlined-only circle so they read as
          // "secondary" to the endpoint anchors.
          (ctx, left, top, _so, obj) => {
            ctx.save();
            ctx.translate(left, top);
            ctx.rotate(fabric.util.degreesToRadians(obj.angle ?? 0));
            ctx.beginPath();
            ctx.arc(0, 0, ANCHOR_RADIUS - 1, 0, Math.PI * 2);
            ctx.strokeStyle = ANCHOR_FILL;
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.restore();
          }
        : renderAnchorControl;
  }

  editable.controls = nodeControls;

  // Hide the selection bounding-box border — only anchor points are shown.
  // Lock body transform so dragging the fill cannot steal the gesture
  // from a vertex (that left the UI stuck in a half-entered state).
  editable.hasBorders = false;
  editable.hasControls = true;
  editable.objectCaching = false;
  editable.set({
    lockMovementX: true,
    lockMovementY: true,
    lockRotation: true,
    lockScalingX: true,
    lockScalingY: true,
    lockSkewingX: true,
    lockSkewingY: true,
    dirty: true,
  });

  // Force Fabric to recompute screen positions of all new controls.
  editable.setCoords();

  // Redraw so the anchors appear immediately.
  canvas.requestRenderAll();
}

/**
 * Exit node-edit mode, restoring the standard transform handles.
 *
 * @param pathObject  The same `fabric.Path` passed to `enterNodeEditMode`.
 * @param canvas      The `fabric.Canvas` instance.
 */
export function exitNodeEditMode(
  pathObject: fabric.Object,
  canvas: fabric.Canvas,
): void {
  const editable = pathObject as EditablePath;
  const editableAny = editable as unknown as Record<string, unknown>;

  // Restore the original controls (scale / rotate handles).
  if (editableAny[ORIGINAL_CONTROLS_KEY]) {
    editable.controls = editableAny[ORIGINAL_CONTROLS_KEY] as fabric.Path['controls'];
    delete editableAny[ORIGINAL_CONTROLS_KEY];
  } else {
    // Fallback: reset to the class-level prototype defaults.
    editable.controls = fabric.Object.prototype.controls;
  }

  // Restore the selection border, cache, and transform locks.
  editable.hasBorders = true;
  editable.hasControls = true;
  if (ORIGINAL_CACHING_KEY in editableAny) {
    editable.objectCaching = Boolean(editableAny[ORIGINAL_CACHING_KEY]);
    delete editableAny[ORIGINAL_CACHING_KEY];
  }
  const locks = editableAny[ORIGINAL_LOCKS_KEY] as Record<string, boolean> | undefined;
  if (locks) {
    editable.set(locks);
    delete editableAny[ORIGINAL_LOCKS_KEY];
  }

  // Re-assign geometry so Fabric commits in-place point/path mutations
  // (otherwise the cached silhouette can snap back on the next render).
  const poly = editable as fabric.Object & { points?: { x: number; y: number }[]; path?: PathCommand[] };
  if (Array.isArray(poly.points)) {
    editable.set('points', poly.points.map((pt) => ({ x: pt.x, y: pt.y })));
  }
  if (Array.isArray(poly.path)) {
    editable.set('path', poly.path.map((cmd) => [...cmd]) as PathCommand[]);
  }
  const withDims = editable as fabric.Object & { setDimensions?: () => void };
  if (typeof withDims.setDimensions === 'function') {
    withDims.setDimensions();
  }
  editable.set({ dirty: true });
  editable.setCoords();
  canvas.requestRenderAll();
}

// ---------------------------------------------------------------------------
// Low-level coordinate helpers (exported for testing / external use)
// ---------------------------------------------------------------------------

/**
 * Convert a point in the path's local SVG coordinate space to a canvas screen
 * position, accounting for the object's full compound transform and the
 * canvas viewport transform.
 *
 * Used internally by the positionHandler of each node control.
 *
 * @param localX     X coordinate as stored in the `pathObject.path` array.
 * @param localY     Y coordinate as stored in the `pathObject.path` array.
 * @param pathObject The path whose transform should be applied.
 * @returns          Screen-space `{x, y}` ready for canvas rendering.
 */
export function pathLocalToScreen(
  localX: number,
  localY: number,
  pathObject: fabric.Path,
): { x: number; y: number } {
  const editable = pathObject as EditablePath;

  // Path commands are stored relative to the path's bounding-box origin.
  // `pathOffset` is the vector from the path origin to the bounding-box
  // centre — subtract it to place the point in object-local space.
  const offset = editable.pathOffset ?? new fabric.Point(0, 0);
  const localPt = new fabric.Point(localX - offset.x, localY - offset.y);

  // Apply the object-to-canvas transform (includes pan/zoom viewport).
  const matrix = fabric.util.multiplyTransformMatrices(
    pathObject.canvas?.viewportTransform ?? [1, 0, 0, 1, 0, 0],
    pathObject.calcTransformMatrix(),
  );
  const screen = fabric.util.transformPoint(localPt, matrix);
  return { x: screen.x, y: screen.y };
}

/**
 * Convert a canvas screen position back into the path's local SVG coordinate
 * space — the inverse of `pathLocalToScreen`.
 *
 * Used internally by the actionHandler of each node control to write dragged
 * positions back into `pathObject.path[commandIndex][pointIndex]`.
 *
 * @param screenX    Mouse X in canvas screen space.
 * @param screenY    Mouse Y in canvas screen space.
 * @param pathObject The path whose inverse transform should be applied.
 * @returns          Local `{x, y}` suitable for writing into path commands.
 */
export function screenToPathLocal(
  screenX: number,
  screenY: number,
  pathObject: fabric.Path,
): { x: number; y: number } {
  const editable = pathObject as EditablePath;
  const offset = editable.pathOffset ?? new fabric.Point(0, 0);

  // Invert the combined viewport + object transform to go screen → local.
  const matrix = fabric.util.multiplyTransformMatrices(
    pathObject.canvas?.viewportTransform ?? [1, 0, 0, 1, 0, 0],
    pathObject.calcTransformMatrix(),
  );
  const invMatrix = fabric.util.invertTransform(matrix);
  const local = fabric.util.transformPoint(new fabric.Point(screenX, screenY), invMatrix);

  // Add pathOffset back to restore the stored SVG coordinate system.
  return { x: local.x + offset.x, y: local.y + offset.y };
}
