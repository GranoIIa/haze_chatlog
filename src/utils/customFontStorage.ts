/**
 * Gerenciador e persistência de fontes customizadas do usuário no navegador.
 * Permite que o jogador envie fontes (.ttf, .otf, .woff, .woff2) do próprio PC
 * e as utilize no Chat Log e elementos do Canvas.
 */

export interface CustomFontMeta {
  id: string;
  name: string;
  fileName: string;
  fileSize: number;
  uploadedAt: number;
}

export interface CustomFontRecord extends CustomFontMeta {
  buffer: ArrayBuffer;
}

const DB_NAME = 'haze-custom-fonts';
const DB_VERSION = 1;
const STORE_NAME = 'fonts';

export const MAX_FONT_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

/** Verifica se a extensão do arquivo corresponde a um formato de fonte válido. */
export function isValidFontFile(fileName: string): boolean {
  return /\.(ttf|otf|woff|woff2)$/i.test(fileName);
}

/** Extrai um nome limpo de família para a fonte a partir do nome do arquivo. */
export function fontNameFromFileName(fileName: string): string {
  const base = fileName.replace(/\.(ttf|otf|woff|woff2)$/i, '').trim();
  const clean = base
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return clean || 'Fonte Customizada';
}

/** Abre a conexão com o IndexedDB de fontes. */
function openFontsDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB indisponível'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Salva uma fonte customizada no IndexedDB. */
export async function saveCustomFont(record: CustomFontRecord): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const db = await openFontsDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('Transação abortada'));
    });
  } finally {
    db.close();
  }
}

/** Carrega todas as fontes customizadas salvas no IndexedDB. */
export async function loadAllCustomFonts(): Promise<CustomFontRecord[]> {
  if (typeof indexedDB === 'undefined') return [];
  const db = await openFontsDb();
  try {
    return await new Promise<CustomFontRecord[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => resolve(req.result ?? []);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[CustomFontStorage] Falha ao carregar fontes:', err);
    return [];
  } finally {
    db.close();
  }
}

/** Exclui uma fonte customizada pelo ID. */
export async function deleteCustomFont(id: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const db = await openFontsDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('Transação abortada'));
    });
  } finally {
    db.close();
  }
}

/** Registra uma fonte no FontFaceSet do documento para uso imediato em CSS e Canvas. */
export async function registerFontFace(name: string, buffer: ArrayBuffer): Promise<boolean> {
  if (typeof FontFace === 'undefined' || typeof document === 'undefined' || !document.fonts) {
    return false;
  }
  try {
    const face = new FontFace(name, buffer);
    await face.load();
    document.fonts.add(face);
    return true;
  } catch (err) {
    console.error(`[CustomFontStorage] Falha ao registrar FontFace "${name}":`, err);
    return false;
  }
}

/** Carrega todas as fontes do IndexedDB, registra-as no documento e retorna seus metadados. */
export async function loadAndApplyAllCustomFonts(): Promise<CustomFontMeta[]> {
  const records = await loadAllCustomFonts();
  const metas: CustomFontMeta[] = [];
  for (const r of records) {
    await registerFontFace(r.name, r.buffer);
    metas.push({
      id: r.id,
      name: r.name,
      fileName: r.fileName,
      fileSize: r.fileSize,
      uploadedAt: r.uploadedAt
    });
  }
  return metas;
}

