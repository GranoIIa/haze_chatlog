import type { ImageLayer } from './editorSettings';

// ---- Persistência das camadas (IndexedDB: metadados + arquivos de imagem) ----
const LAYERS_DB = 'haze-chatlog';

const openLayersDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB indisponível')); return; }
    const req = indexedDB.open(LAYERS_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
      if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const txDone = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transação abortada'));
  });

const reqResult = <T,>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

// Grava só os arquivos novos e remove os que nenhuma camada usa mais
export const saveLayersToDb = async (
  layers: ImageLayer[],
  blobs: Map<string, Blob>,
  stored: Set<string>
) => {
  const db = await openLayersDb();
  try {
    const used = new Set(layers.map(l => l.blobId));
    const tx = db.transaction(['meta', 'blobs'], 'readwrite');
    tx.objectStore('meta').put(layers, 'layers');
    const bs = tx.objectStore('blobs');
    used.forEach(id => {
      const b = blobs.get(id);
      if (b && !stored.has(id)) bs.put(b, id);
    });
    stored.forEach(id => { if (!used.has(id)) bs.delete(id); });
    await txDone(tx);
    stored.forEach(id => { if (!used.has(id)) stored.delete(id); });
    used.forEach(id => { if (blobs.has(id)) stored.add(id); });
  } finally {
    db.close();
  }
};

export const loadLayersFromDb = async (): Promise<{ layers: ImageLayer[]; blobs: Map<string, Blob> }> => {
  const db = await openLayersDb();
  try {
    const tx = db.transaction(['meta', 'blobs'], 'readonly');
    const raw = await reqResult(tx.objectStore('meta').get('layers'));
    const blobs = new Map<string, Blob>();
    const layers: ImageLayer[] = [];
    if (Array.isArray(raw)) {
      for (const l of raw.slice(0, 20)) {
        if (!l || typeof l.id !== 'string' || typeof l.blobId !== 'string') continue;
        if (!blobs.has(l.blobId)) {
          const b = await reqResult(tx.objectStore('blobs').get(l.blobId));
          if (b instanceof Blob) blobs.set(l.blobId, b);
        }
        if (!blobs.has(l.blobId)) continue;
        const n = (x: unknown, f: number) => (typeof x === 'number' && isFinite(x) ? x : f);
        layers.push({
          id: l.id, blobId: l.blobId,
          name: typeof l.name === 'string' ? l.name.slice(0, 120) : 'camada',
          cx: Math.min(1, Math.max(0, n(l.cx, 0.5))), cy: Math.min(1, Math.max(0, n(l.cy, 0.5))),
          widthPct: Math.min(200, Math.max(2, n(l.widthPct, 30))),
          rotation: Math.min(180, Math.max(-180, n(l.rotation, 0))),
          opacity: Math.min(1, Math.max(0, n(l.opacity, 1))),
          aboveChat: l.aboveChat === true, visible: l.visible !== false
        });
      }
    }
    return { layers, blobs };
  } finally {
    db.close();
  }
};

export const clearLayersDb = async () => {
  try {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase(LAYERS_DB);
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
  } catch (_) { /* sem IndexedDB: nada a limpar */ }
};

// ---- Foto de fundo (mesmo banco: meta['background'] = id, blobs[id] = arquivo) ----

/** Grava a foto de fundo atual (ou remove, com id nulo) e apaga o arquivo da foto anterior. */
export const saveBackgroundToDb = async (
  id: string | null,
  blob: Blob | null,
  storedId: { current: string | null }
) => {
  const db = await openLayersDb();
  try {
    const tx = db.transaction(['meta', 'blobs'], 'readwrite');
    const bs = tx.objectStore('blobs');
    if (storedId.current && storedId.current !== id) bs.delete(storedId.current);
    if (id && blob) {
      if (storedId.current !== id) bs.put(blob, id);
      tx.objectStore('meta').put(id, 'background');
    } else {
      tx.objectStore('meta').delete('background');
    }
    await txDone(tx);
    storedId.current = id && blob ? id : null;
  } finally {
    db.close();
  }
};

export const loadBackgroundFromDb = async (): Promise<{ id: string; blob: Blob } | null> => {
  const db = await openLayersDb();
  try {
    const tx = db.transaction(['meta', 'blobs'], 'readonly');
    const id = await reqResult(tx.objectStore('meta').get('background'));
    if (typeof id !== 'string') return null;
    const blob = await reqResult(tx.objectStore('blobs').get(id));
    return blob instanceof Blob ? { id, blob } : null;
  } finally {
    db.close();
  }
};
