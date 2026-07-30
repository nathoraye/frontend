#!/usr/bin/env node
// Node validation script for exported SVGs
// Usage: node scripts/validateExport.js path/to/export.svg

import fs from 'fs';
import clipperLibModule from 'clipper-lib';

const clipperLib = clipperLibModule?.Clipper ? clipperLibModule : clipperLibModule;

const ZERO_AREA_THRESHOLD = 1e-3;

function collectPathCommands(d) {
  if (!d || typeof d !== 'string') return [];
  const trimmed = d.trim();
  if (!trimmed) return [];
  return trimmed.match(/[MmLlHhVvZz]|-?\d*\.?\d+/g) ?? [];
}

function parseLinearPath(d) {
  const commands = collectPathCommands(d);
  if (commands.length === 0) return null;

  const points = [];
  let currentX = 0;
  let currentY = 0;
  let startX = 0;
  let startY = 0;
  let lastCommand = null;
  const unsupportedCommands = [];

  const pushPoint = (x, y) => {
    points.push([x, y]);
    currentX = x;
    currentY = y;
  };

  const parseNumber = (token) => Number.parseFloat(token);

  for (let i = 0; i < commands.length; i += 1) {
    const token = commands[i];
    if (!token) continue;

    if (/[MmLlHhVvZz]/.test(token)) {
      const command = token;
      lastCommand = command;
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

      const isRelative = command === 'm' || command === 'l' || command === 'h' || command === 'v';
      const values = [];
      while (i + 1 < commands.length && !/[MmLlHhVvZz]/.test(commands[i + 1])) {
        values.push(parseNumber(commands[i + 1]));
        i += 1;
      }

      if (values.length < 2) continue;

      const apply = (x, y) => {
        const resolvedX = isRelative ? currentX + x : x;
        const resolvedY = isRelative ? currentY + y : y;
        if (points.length === 0) {
          startX = resolvedX;
          startY = resolvedY;
          pushPoint(resolvedX, resolvedY);
        } else {
          pushPoint(resolvedX, resolvedY);
        }
        currentX = resolvedX;
        currentY = resolvedY;
      };

      if (command === 'M' || command === 'm') {
        const [x, y] = values;
        apply(x, y);
      } else if (command === 'L' || command === 'l') {
        const [x, y] = values;
        apply(x, y);
      } else if (command === 'H' || command === 'h') {
        const [x] = values;
        apply(x, currentY);
      } else if (command === 'V' || command === 'v') {
        const [y] = values;
        apply(currentX, y);
      }
      continue;
    }

    unsupportedCommands.push(token);
  }

  if (points.length < 3) return null;
  const closed = points.length > 1 && points[0][0] === points[points.length - 1][0] && points[0][1] === points[points.length - 1][1];
  return { points, closed, unsupportedCommands };
}

function evaluatePath(d, index) {
  const parsed = parseLinearPath(d);
  const issues = [];
  if (!parsed) {
    issues.push({ severity: 'error', code: 'UNPARSEABLE_PATH', message: `Path ${index + 1} could not be parsed into linear contours.` });
    return { issues, area: 0 };
  }

  if (parsed.unsupportedCommands.length > 0) {
    issues.push({ severity: 'warning', code: 'UNSUPPORTED_PATH_COMMANDS', message: `Path ${index + 1} contains unsupported path commands; validation used linear segments only.` });
  }

  if (!parsed.closed) {
    issues.push({ severity: 'error', code: 'PATH_NOT_CLOSED', message: `Path ${index + 1} is not closed; add a trailing Z command before cutting.` });
  }

  const path = parsed.points.map(([x, y]) => ({ X: Math.round(x * 1000), Y: Math.round(y * 1000) }));
  const area = Math.abs(clipperLib.Clipper.Area(path) / 1_000_000);
  if (area <= ZERO_AREA_THRESHOLD) {
    issues.push({ severity: 'error', code: 'ZERO_AREA_PATH', message: `Path ${index + 1} has zero or near-zero area.` });
  }

  return { issues, area };
}

async function run() {
  const svgPath = process.argv[2];
  if (!svgPath) {
    console.error('Usage: node scripts/validateExport.js path/to/file.svg');
    process.exit(2);
  }

  if (!fs.existsSync(svgPath)) {
    console.error('File not found:', svgPath);
    process.exit(2);
  }

  const content = fs.readFileSync(svgPath, 'utf8');
  const pathRegex = /<path[^>]*d=["']([^"']*)["'][^>]*>/gi;
  const paths = Array.from(content.matchAll(pathRegex));
  const issues = [];
  const pathSummaries = [];

  if (paths.length === 0) {
    issues.push({ severity: 'error', code: 'NO_PATHS', message: 'No path data detected in the exported SVG.' });
  } else {
    paths.forEach((match, index) => {
      const d = match[1];
      const result = evaluatePath(d, index);
      issues.push(...result.issues);
      pathSummaries.push({ index, area: result.area });
    });
  }

  const transformRegex = /<(path|rect|circle|ellipse|line|polyline|polygon|g)[^>]*transform=/gi;
  if (transformRegex.test(content)) {
    issues.push({ severity: 'warning', code: 'HAS_TRANSFORM', message: 'The SVG contains transforms; flatten them before final cut export.' });
  }

  console.log('SVG Validation Report for', svgPath);
  console.log('---------------------------------');
  console.log('Path elements:', paths.length);
  console.log('Path areas:', pathSummaries.map((item) => ({ index: item.index, area: item.area.toFixed(3) })));
  console.log('Issues:');
  if (issues.length === 0) {
    console.log('  none');
    console.log('\nValidation: OK — file passed the deep cut-readiness checks.');
    process.exit(0);
  }

  issues.forEach((issue) => console.log(`- [${issue.severity}] ${issue.code}: ${issue.message}`));
  console.warn('\nValidation: WARN — issues found.');
  process.exit(1);
}

run();
