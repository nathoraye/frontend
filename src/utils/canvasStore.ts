import { serializeCanvas } from './canvasSerialize';
import type * as fabric from 'fabric';

const DB_NAME = 'west-vinyl-studio';
const STORE = 'kv';
const KEY = 'canvas-json';
const AUTOSAVE_MS = 500;

let restoreDone = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

export function setCanvasRestoreDone(done: boolean): void {
  restoreDone = done;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
}

export async function loadSavedCanvas(): Promise<string | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(typeof req.result === 'string' ? req.result : null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function persistCanvasJson(json: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(STORE).put(json, KEY);
    });
  } catch {
    // Autosave is best-effort; a private-mode or blocked IDB must not break editing.
  }
}

export async function clearSavedCanvas(): Promise<void> {
  await persistCanvasJson(JSON.stringify({ version: '7.0.0', objects: [] }));
}

export function queueCanvasAutosave(canvas: fabric.Canvas): void {
  if (!restoreDone) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    void persistCanvasJson(serializeCanvas(canvas));
  }, AUTOSAVE_MS);
}
