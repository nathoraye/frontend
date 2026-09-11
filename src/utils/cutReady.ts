export type CutReadySeverity = 'error' | 'warning';

export type CutReadyIssue = {
  severity: CutReadySeverity;
  code: string;
  message: string;
};

export type CutReadyReport = {
  ok: boolean;
  ready: boolean;
  issues: CutReadyIssue[];
  rasterCount: number;
  vectorCount: number;
  textCount: number;
  hasWeedingBox: boolean;
};

type Walkable = {
  type?: string;
  fill?: unknown;
  stroke?: unknown;
  getObjects?: () => Walkable[];
};

const VECTOR_TYPES = new Set([
  'path',
  'polygon',
  'polyline',
  'rect',
  'circle',
  'ellipse',
  'triangle',
  'line',
  'group',
  'activeselection',
]);

const TEXT_TYPES = new Set(['i-text', 'text', 'textbox', 'itext']);

function walk(obj: Walkable, visit: (node: Walkable) => void): void {
  visit(obj);
  const kids = typeof obj.getObjects === 'function' ? obj.getObjects() : [];
  kids.forEach((child) => walk(child, visit));
}

function isWeedingBox(obj: Walkable): boolean {
  const type = String(obj.type || '').toLowerCase();
  if (type !== 'rect') return false;
  const fill = String(obj.fill ?? '').toLowerCase();
  const stroke = String(obj.stroke ?? '').toLowerCase();
  const emptyFill = fill === '' || fill === 'transparent' || fill === 'none';
  const cyan = stroke === '#00ffff' || stroke === 'cyan' || stroke === 'rgb(0, 255, 255)';
  return emptyFill && cyan;
}

export function inspectObjectsForCut(objects: Walkable[]): CutReadyReport {
  const issues: CutReadyIssue[] = [];
  let rasterCount = 0;
  let vectorCount = 0;
  let textCount = 0;
  let hasWeedingBox = false;

  objects.forEach((obj) => {
    if (isWeedingBox(obj)) hasWeedingBox = true;
    walk(obj, (node) => {
      const type = String(node.type || '').toLowerCase();
      if (type === 'image') rasterCount += 1;
      else if (TEXT_TYPES.has(type)) textCount += 1;
      else if (VECTOR_TYPES.has(type) && type !== 'group' && type !== 'activeselection') vectorCount += 1;
    });
  });

  if (objects.length === 0) {
    issues.push({
      severity: 'error',
      code: 'EMPTY_MAT',
      message: 'The mat is empty. Add or trace a design before cutting.',
    });
  }

  if (rasterCount > 0) {
    issues.push({
      severity: 'error',
      code: 'RASTER_REMAINING',
      message: `${rasterCount} photo layer${rasterCount === 1 ? '' : 's'} still on the mat. Trace to SVG before cutting.`,
    });
  }

  if (objects.length > 0 && vectorCount === 0 && rasterCount === 0 && textCount === 0) {
    issues.push({
      severity: 'error',
      code: 'NO_VECTORS',
      message: 'No cut paths found on the mat.',
    });
  }

  if (textCount > 0) {
    issues.push({
      severity: 'warning',
      code: 'LIVE_TEXT',
      message: `${textCount} live text layer${textCount === 1 ? '' : 's'}. Weld or explode text so the plotter gets outlines.`,
    });
  }

  if (objects.length > 0 && !hasWeedingBox) {
    issues.push({
      severity: 'warning',
      code: 'NO_WEEDING_BOX',
      message: 'No weeding box. Add one from the selection bar so vinyl weeds cleanly.',
    });
  }

  const errors = issues.filter((i) => i.severity === 'error');
  return {
    ok: errors.length === 0 && objects.length > 0,
    ready: errors.length === 0 && issues.length === 0 && objects.length > 0,
    issues,
    rasterCount,
    vectorCount,
    textCount,
    hasWeedingBox,
  };
}
