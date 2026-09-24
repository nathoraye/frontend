/**
 * Fabric's canvas.toSVG() still serializes objects with visible:false
 * (as visibility:hidden). loadSVGFromString then re-imports them as normal
 * visible shapes, so a "hide others" weld bake silently merges the whole
 * mat into one huge group — artwork looks shrunk inside a giant selection box.
 *
 * excludeFromExport is the Fabric-supported way to omit objects from SVG.
 */

export type ExportableObject = {
  excludeFromExport?: boolean;
};

/**
 * Temporarily mark every object not in `keep` as excludeFromExport so
 * canvas.toSVG() only contains the selection. Restores prior flags in finally.
 */
export function withSvgExportIsolation<T>(
  allObjects: ExportableObject[],
  keep: ExportableObject[],
  exportSvg: () => T,
): T {
  const keepSet = new Set(keep);
  const previous = new Map<ExportableObject, boolean | undefined>();

  for (const obj of allObjects) {
    previous.set(obj, obj.excludeFromExport);
    if (!keepSet.has(obj)) {
      obj.excludeFromExport = true;
    }
  }

  try {
    return exportSvg();
  } finally {
    for (const obj of allObjects) {
      const prior = previous.get(obj);
      if (prior === undefined) {
        delete obj.excludeFromExport;
      } else {
        obj.excludeFromExport = prior;
      }
    }
  }
}
