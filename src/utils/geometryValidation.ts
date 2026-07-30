import * as clipperLib from 'clipper-lib';

export interface GeometryIssue {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  pathIndex?: number;
}

export interface GeometryValidationResult {
  isValid: boolean;
  issues: GeometryIssue[];
  polygons: Array<{
    pathIndex: number;
    pointCount: number;
    area: number;
    closed: boolean;
  }>;
}

interface ParsedPath {
  index: number;
  d: string;
  points: Array<[number, number]>;
  closed: boolean;
  unsupportedCommands: string[];
}

type ClipperPath = Array<{ X: number; Y: number }>;

const ZERO_AREA_THRESHOLD = 1e-3;

function parsePathData(d: string): ParsedPath | null {
  if (!d || typeof d !== 'string') return null;
  const trimmed = d.trim();
  if (!trimmed) return null;

  const commands = trimmed.match(/[MmLlHhVvCcSsQqTtAaZz]|-?\d*\.?\d+(?:e[+-]?\d+)?/gi) ?? [];
  if (commands.length === 0) return null;

  const points: Array<[number, number]> = [];
  const unsupportedCommands: string[] = [];
  let currentX = 0;
  let currentY = 0;

  const pushPoint = (x: number, y: number) => {
    points.push([x, y]);
    currentX = x;
    currentY = y;
  };

  const parseNumber = (token: string) => Number.parseFloat(token);

  for (let i = 0; i < commands.length; i += 1) {
    const token = commands[i];
    if (!token) continue;

    if (/[MmLlHhVvCcSsQqTtAaZz]/i.test(token) && token.length === 1) {
      const command = token;

      if (command === 'Z' || command === 'z') {
        if (points.length > 0) {
          const last = points[points.length - 1];
          const first = points[0];
          if (last[0] !== first[0] || last[1] !== first[1]) {
            points.push([first[0], first[1]]);
          }
        }
        continue;
      }

      const isRelative = command === command.toLowerCase();
      const nextTokens = [] as string[];
      while (i + 1 < commands.length && !/[MmLlHhVvCcSsQqTtAaZz]/i.test(commands[i + 1])) {
        nextTokens.push(commands[i + 1]);
        i += 1;
      }

      const values = nextTokens.map(parseNumber);
      if (values.length < 1) continue;

      const resolve = (x: number, y: number): [number, number] => [
        isRelative ? currentX + x : x,
        isRelative ? currentY + y : y,
      ];

      const cmd = command.toUpperCase();

      if (cmd === 'M' || cmd === 'L') {
        if (values.length < 2) continue;
        const [rx, ry] = resolve(values[0], values[1]);
        pushPoint(rx, ry);
      } else if (cmd === 'H') {
        const rx = isRelative ? currentX + values[0] : values[0];
        pushPoint(rx, currentY);
      } else if (cmd === 'V') {
        const ry = isRelative ? currentY + values[0] : values[0];
        pushPoint(currentX, ry);
      } else if (cmd === 'C') {
        // Cubic Bezier: 6 values per segment (x1 y1 x2 y2 x y)
        for (let j = 0; j + 5 < values.length; j += 6) {
          // Record the two control points and the end point for area estimation
          pushPoint(...resolve(values[j], values[j + 1]));
          pushPoint(...resolve(values[j + 2], values[j + 3]));
          pushPoint(...resolve(values[j + 4], values[j + 5]));
        }
      } else if (cmd === 'S') {
        // Smooth cubic: 4 values per segment (x2 y2 x y)
        for (let j = 0; j + 3 < values.length; j += 4) {
          pushPoint(...resolve(values[j], values[j + 1]));
          pushPoint(...resolve(values[j + 2], values[j + 3]));
        }
      } else if (cmd === 'Q') {
        // Quadratic Bezier: 4 values per segment (x1 y1 x y)
        for (let j = 0; j + 3 < values.length; j += 4) {
          pushPoint(...resolve(values[j], values[j + 1]));
          pushPoint(...resolve(values[j + 2], values[j + 3]));
        }
      } else if (cmd === 'T') {
        // Smooth quadratic: 2 values per segment (x y)
        for (let j = 0; j + 1 < values.length; j += 2) {
          pushPoint(...resolve(values[j], values[j + 1]));
        }
      } else if (cmd === 'A') {
        // Elliptical arc: 7 values per segment (rx ry x-rot large-arc-flag sweep-flag x y)
        for (let j = 0; j + 6 < values.length; j += 7) {
          pushPoint(...resolve(values[j + 5], values[j + 6]));
        }
      }

      continue;
    }

    // Tokens that are not recognised command letters and not numbers are truly unsupported
    if (isNaN(parseNumber(token))) {
      unsupportedCommands.push(token);
    }
  }

  if (points.length < 3) return null;

  const closed = points.length > 1 && points[0][0] === points[points.length - 1][0] && points[0][1] === points[points.length - 1][1];
  return { index: 0, d: trimmed, points, closed, unsupportedCommands };
}

function buildClipperPath(points: Array<[number, number]>): ClipperPath {
  return points.map(([x, y]) => ({ X: Math.round(x * 1000), Y: Math.round(y * 1000) }));
}

function validatePolygon(path: ParsedPath, pathIndex: number): GeometryValidationResult['polygons'][number] {
  const scaledPath = buildClipperPath(path.points);
  const area = Math.abs(clipperLib.Clipper.Area(scaledPath) / 1_000_000);
  return {
    pathIndex,
    pointCount: path.points.length,
    area,
    closed: path.closed
  };
}

export function validateSVGForCutting(svgString: string): GeometryValidationResult {
  const issues: GeometryIssue[] = [];
  const polygons: GeometryValidationResult['polygons'] = [];

  if (!svgString || typeof svgString !== 'string') {
    return { isValid: false, issues: [{ severity: 'error', code: 'EMPTY_SVG', message: 'SVG content is empty.' }], polygons: [] };
  }

  const pathRegex = /<path[^>]*d=["']([^"']*)["'][^>]*>/gi;
  const paths = Array.from(svgString.matchAll(pathRegex));

  if (paths.length === 0) {
    issues.push({ severity: 'error', code: 'NO_PATHS', message: 'No path data detected in the exported SVG.' });
    return { isValid: false, issues, polygons };
  }

  paths.forEach((match, index) => {
    const d = match[1] ?? '';
    const parsed = parsePathData(d);
    if (!parsed) {
      issues.push({ severity: 'error', code: 'UNPARSEABLE_PATH', message: `Path ${index + 1} could not be parsed into linear contours.`, pathIndex: index });
      return;
    }

    if (parsed.unsupportedCommands.length > 0) {
      issues.push({ severity: 'warning', code: 'UNKNOWN_PATH_COMMANDS', message: `Path ${index + 1} contains unrecognised path tokens (${parsed.unsupportedCommands.join(', ')}) which were skipped during area estimation.`, pathIndex: index });
    }

    if (!parsed.closed) {
      issues.push({ severity: 'error', code: 'PATH_NOT_CLOSED', message: `Path ${index + 1} is not closed; add a trailing Z command or close the contour before cutting.`, pathIndex: index });
    }

    const polygon = validatePolygon(parsed, index);
    polygons.push(polygon);

    if (polygon.area <= ZERO_AREA_THRESHOLD) {
      issues.push({ severity: 'error', code: 'ZERO_AREA_PATH', message: `Path ${index + 1} has zero or near-zero area and is not suitable for cutting.`, pathIndex: index });
    }
  });

  const transformRegex = /<(path|rect|circle|ellipse|line|polyline|polygon|g)[^>]*transform=/gi;
  if (transformRegex.test(svgString)) {
    issues.push({ severity: 'warning', code: 'HAS_TRANSFORM', message: 'The SVG contains transforms; flatten them before final cut export.' });
  }

  return {
    isValid: issues.filter((issue) => issue.severity === 'error').length === 0,
    issues,
    polygons
  };
}
