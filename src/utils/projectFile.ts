/**
 * Arquivo de projeto do Haze RP Studio (.haze)
 *
 * Um .haze é um ZIP com:
 *   manifest.json   metadados + cena (texto, estilo, luz, câmera, elementos de RP...)
 *   assets/<id>.ext imagens (foto de fundo e camadas de imagem)
 *
 * Nada é rasterizado: textos e elementos continuam editáveis ao reabrir.
 * A importação trata o arquivo como NÃO confiável: valida versão, tamanhos, caminhos,
 * tipo real das imagens (pelos primeiros bytes) e limita todos os campos da cena.
 */

import type { CanvasLayer, Character } from '../types';
import { DEFAULT_ADJUSTMENTS, PhotoAdjustments } from './photoFilters';
import { sanitizeLighting, Lighting } from './lighting';
import { sanitizeCamera, CameraState } from './cameraFx';
import {
  sanitizeCanvasLayers, FitMode, isFitMode, ImageLayer, MIN_RES, MAX_RES
} from './editorSettings';

export const PROJECT_FORMAT = 'haze-project';
/** Maior versão que este app abre. v1 = projeto de cena (Editor RP); v2 acrescenta `kind: 'video'` (Video Studio). */
export const PROJECT_SCHEMA_VERSION = 2;
/** Versão gravada nos projetos de CENA: continua 1 para que versões antigas do app sigam abrindo-os. */
export const SCENE_SCHEMA_VERSION = 1;
export const PROJECT_EXTENSION = '.haze';

export const LIMITS = {
  fileBytes: 300 * 1024 * 1024,
  manifestBytes: 5 * 1024 * 1024,
  assetBytes: 60 * 1024 * 1024,
  assets: 60,
  imageLayers: 20,
  characters: 50,
  canvasLayers: 40,
  rawText: 200_000
};

/** Erro de leitura/validação do projeto, com mensagem em português para o usuário. */
export class ProjectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectError';
  }
}

export interface ProjectScene {
  darkening: number;
  adjustments: PhotoAdjustments;
  rawText: string;
  fontSize: number;
  fontFamily: string;
  lineHeightFactor: number;
  strokeEnabled: boolean;
  strokeWidth: number;
  strokeColor: string;
  bgEnabled: boolean;
  bgColor: string;
  bgOpacity: number;
  maxWidthPercent: number;
  shadowEnabled: boolean;
  censorStyle: 'mosaic' | 'solid';
  showTimestamps: boolean;
  chatPos: { x: number; y: number };
  characters: Character[];
  outputRes: { w: number; h: number } | null;
  fitMode: FitMode;
  panX: number;
  panY: number;
  zoom: number;
  lighting: Lighting;
  camera: CameraState;
  canvasLayers: CanvasLayer[];
}

export interface ProjectAsset {
  id: string;
  name: string;
  mime: string;
  blob: Blob;
}

export interface ProjectData {
  scene: ProjectScene;
  background: { assetId: string; name: string } | null;
  imageLayers: ImageLayer[];
  assets: Map<string, ProjectAsset>;
  /** Partes do projeto que foram descartadas por serem inválidas (nada some em silêncio). */
  warnings: string[];
}

// ---------------------------------------------------------------- validação da cena

const clamp = (v: unknown, lo: number, hi: number, fallback: number): number =>
  typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;

const hexColor = (v: unknown, fallback: string): string =>
  typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : fallback;

const text = (v: unknown, max: number, fallback = ''): string =>
  typeof v === 'string' ? v.slice(0, max) : fallback;

const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Valida e completa uma cena vinda de fora (arquivo, armazenamento antigo). Nunca lança. */
export function normalizeScene(raw: any): ProjectScene {
  const r = raw && typeof raw === 'object' ? raw : {};

  const adj: PhotoAdjustments = { ...DEFAULT_ADJUSTMENTS };
  const ra = r.adjustments && typeof r.adjustments === 'object' ? r.adjustments : {};
  (['brightness', 'contrast', 'saturation', 'warmth'] as const).forEach(k => { adj[k] = clamp(ra[k], -100, 100, 0); });
  (['sharpen', 'depthOfField', 'vignette', 'grain'] as const).forEach(k => { adj[k] = clamp(ra[k], 0, 100, 0); });
  adj.letterbox = ra.letterbox === true;
  adj.colorPreset = ['golden-hour', 'midnight-neon', 'grit-crime', 'vintage-90s'].includes(ra.colorPreset)
    ? ra.colorPreset : 'none';

  const characters: Character[] = [];
  if (Array.isArray(r.characters)) {
    for (const c of r.characters.slice(0, LIMITS.characters)) {
      if (c && typeof c.id === 'string' && typeof c.name === 'string') {
        characters.push({ id: text(c.id, 40), name: text(c.name, 60), color: hexColor(c.color, '#38bdf8') });
      }
    }
  }

  const res = r.outputRes;
  const outputRes = res && typeof res.w === 'number' && typeof res.h === 'number' && isFinite(res.w) && isFinite(res.h)
    ? { w: Math.round(clamp(res.w, MIN_RES, MAX_RES, 1280)), h: Math.round(clamp(res.h, MIN_RES, MAX_RES, 720)) }
    : null;

  const canvasLayers = sanitizeCanvasLayers(r.canvasLayers)
    .slice(0, LIMITS.canvasLayers)
    .map(l => ({
      ...l,
      id: text(l.id, 64),
      name: text(l.name, 80),
      text: l.text !== undefined ? text(l.text, 2000) : undefined,
      content: l.content !== undefined ? text(l.content, 2000) : undefined,
      fontFamily: l.fontFamily !== undefined ? text(l.fontFamily, 200) : undefined,
      rotation: clamp(l.rotation, -3600, 3600, 0),
      x: clamp(l.x, -50_000, 50_000, 0),
      y: clamp(l.y, -50_000, 50_000, 0),
      width: clamp(l.width, 1, 50_000, 100),
      height: clamp(l.height, 1, 50_000, 100)
    }));

  return {
    darkening: clamp(r.darkening, 0, 0.8, 0.15),
    adjustments: adj,
    rawText: text(r.rawText, LIMITS.rawText),
    fontSize: clamp(r.fontSize, 10, 72, 20),
    fontFamily: text(r.fontFamily, 200, 'Arial, Helvetica, sans-serif'),
    lineHeightFactor: clamp(r.lineHeightFactor, 1, 3, 1.55),
    strokeEnabled: r.strokeEnabled !== false,
    strokeWidth: clamp(r.strokeWidth, 0, 8, 2),
    strokeColor: hexColor(r.strokeColor, '#000000'),
    bgEnabled: r.bgEnabled !== false,
    bgColor: hexColor(r.bgColor, '#000000'),
    bgOpacity: clamp(r.bgOpacity, 0, 1, 0.65),
    maxWidthPercent: clamp(r.maxWidthPercent, 30, 100, 85),
    shadowEnabled: r.shadowEnabled === true,
    censorStyle: r.censorStyle === 'solid' ? 'solid' : 'mosaic',
    showTimestamps: r.showTimestamps !== false,
    chatPos: { x: clamp(r.chatPos?.x, 0, 20_000, 40), y: clamp(r.chatPos?.y, 0, 20_000, 50) },
    characters,
    outputRes,
    fitMode: isFitMode(r.fitMode) ? r.fitMode : 'cover',
    panX: clamp(r.panX, -100, 100, 0),
    panY: clamp(r.panY, -100, 100, 0),
    zoom: clamp(r.zoom, 25, 400, 100),
    lighting: sanitizeLighting(r.lighting),
    camera: sanitizeCamera(r.camera),
    canvasLayers
  };
}

function normalizeImageLayers(raw: any, assets: Map<string, ProjectAsset>): ImageLayer[] {
  const out: ImageLayer[] = [];
  if (!Array.isArray(raw)) return out;
  const ids = new Set<string>();
  for (const l of raw.slice(0, LIMITS.imageLayers)) {
    if (!l || typeof l.id !== 'string' || typeof l.blobId !== 'string') continue;
    if (!SAFE_ID.test(l.id) || !SAFE_ID.test(l.blobId) || ids.has(l.id)) continue;
    if (!assets.has(l.blobId)) continue; // camada sem imagem: descarta
    ids.add(l.id);
    out.push({
      id: l.id,
      blobId: l.blobId,
      name: text(l.name, 120, 'camada'),
      cx: clamp(l.cx, 0, 1, 0.5),
      cy: clamp(l.cy, 0, 1, 0.5),
      widthPct: clamp(l.widthPct, 2, 200, 30),
      rotation: clamp(l.rotation, -180, 180, 0),
      opacity: clamp(l.opacity, 0, 1, 1),
      aboveChat: l.aboveChat === true,
      visible: l.visible !== false
    });
  }
  return out;
}

// ---------------------------------------------------------------- imagens (tipo real)

/** Descobre o tipo da imagem pelos primeiros bytes (não confia em extensão nem em MIME informado). */
export function sniffImageMime(b: Uint8Array): { mime: string; ext: string } | null {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { mime: 'image/png', ext: 'png' };
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return { mime: 'image/gif', ext: 'gif' };
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46
    && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return { mime: 'image/webp', ext: 'webp' };
  return null;
}

const ASSET_PATH = /^assets\/([A-Za-z0-9_-]{1,64})\.(png|jpg|gif|webp)$/;

// ---------------------------------------------------------------- exportar

export async function buildProjectBlob(data: Omit<ProjectData, 'warnings'>): Promise<Blob> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();

  const manifestAssets: Array<{ id: string; file: string; name: string; mime: string }> = [];
  for (const asset of data.assets.values()) {
    const bytes = new Uint8Array(await asset.blob.arrayBuffer());
    const kind = sniffImageMime(bytes);
    if (!kind) continue; // arquivo inválido não entra no projeto
    const file = `assets/${asset.id}.${kind.ext}`;
    zip.file(file, bytes);
    manifestAssets.push({ id: asset.id, file, name: asset.name, mime: kind.mime });
  }

  const manifest = {
    format: PROJECT_FORMAT,
    schemaVersion: SCENE_SCHEMA_VERSION,
    app: 'Haze RP Studio',
    createdAt: new Date().toISOString(),
    scene: data.scene,
    background: data.background,
    imageLayers: data.imageLayers,
    assets: manifestAssets
  };
  zip.file('manifest.json', JSON.stringify(manifest));

  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  return new Blob([bytes as BlobPart], { type: 'application/zip' });
}

// ---------------------------------------------------------------- importar

type JSZipEntry = { dir: boolean; _data?: { uncompressedSize?: number }; async: (t: 'uint8array' | 'string') => Promise<any> };

export async function parseProjectFile(file: Blob): Promise<ProjectData> {
  if (file.size > LIMITS.fileBytes) throw new ProjectError('O arquivo é grande demais para ser um projeto Haze.');
  if (file.size < 22) throw new ProjectError('O arquivo está vazio ou corrompido.');

  const { default: JSZip } = await import('jszip');
  let zip: any;
  try {
    zip = await JSZip.loadAsync(await file.arrayBuffer());
  } catch {
    throw new ProjectError('Este arquivo não é um projeto Haze válido (não é um ZIP legível).');
  }

  const manifestEntry = zip.file('manifest.json') as JSZipEntry | null;
  if (!manifestEntry) throw new ProjectError('Projeto inválido: manifest.json não encontrado.');
  if ((manifestEntry._data?.uncompressedSize ?? 0) > LIMITS.manifestBytes) {
    throw new ProjectError('Projeto inválido: manifesto grande demais.');
  }

  let manifest: any;
  try {
    const raw = await manifestEntry.async('string');
    if (raw.length > LIMITS.manifestBytes) throw new Error('grande');
    manifest = JSON.parse(raw);
  } catch {
    throw new ProjectError('Projeto inválido: o manifesto não pôde ser lido.');
  }

  if (!manifest || manifest.format !== PROJECT_FORMAT) {
    throw new ProjectError('Este arquivo não é um projeto do Haze RP Studio.');
  }
  if (typeof manifest.schemaVersion !== 'number' || manifest.schemaVersion < 1) {
    throw new ProjectError('Projeto inválido: versão desconhecida.');
  }
  if (manifest.schemaVersion > PROJECT_SCHEMA_VERSION) {
    throw new ProjectError(`Este projeto foi salvo numa versão mais nova do Haze (formato ${manifest.schemaVersion}). Atualize o app para abri-lo.`);
  }

  if (manifest.kind === 'video') {
    throw new ProjectError('Este é um projeto do Video Studio. Abra-o na aba Video Studio.');
  }

  // Assets: só caminhos assets/<id>.<ext>, com tipo real de imagem e tamanho limitado
  const assets = new Map<string, ProjectAsset>();
  const warnings: string[] = [];
  const listed = Array.isArray(manifest.assets) ? manifest.assets.slice(0, LIMITS.assets) : [];
  if (Array.isArray(manifest.assets) && manifest.assets.length > LIMITS.assets) {
    warnings.push(`${manifest.assets.length - LIMITS.assets} imagem(ns) além do limite de ${LIMITS.assets} foram ignoradas`);
  }
  let skippedAssets = 0;
  for (const a of listed) {
    if (!a || typeof a.file !== 'string' || typeof a.id !== 'string') { skippedAssets++; continue; }
    const m = ASSET_PATH.exec(a.file);
    if (!m || m[1] !== a.id || !SAFE_ID.test(a.id) || assets.has(a.id)) { skippedAssets++; continue; }
    const entry = zip.file(a.file) as JSZipEntry | null;
    if (!entry || entry.dir) { skippedAssets++; continue; }
    if ((entry._data?.uncompressedSize ?? 0) > LIMITS.assetBytes) {
      throw new ProjectError(`Imagem grande demais no projeto (${text(a.name, 60, a.id)}).`);
    }
    const bytes: Uint8Array = await entry.async('uint8array');
    if (bytes.length > LIMITS.assetBytes) throw new ProjectError(`Imagem grande demais no projeto (${text(a.name, 60, a.id)}).`);
    const kind = sniffImageMime(bytes);
    if (!kind) throw new ProjectError(`O arquivo "${text(a.name, 60, a.id)}" no projeto não é uma imagem válida.`);
    assets.set(a.id, {
      id: a.id,
      name: text(a.name, 120, a.id),
      mime: kind.mime,
      blob: new Blob([bytes as BlobPart], { type: kind.mime })
    });
  }

  if (skippedAssets > 0) warnings.push(`${skippedAssets} imagem(ns) do projeto foram ignoradas (caminho ou arquivo inválido)`);

  let background: ProjectData['background'] = null;
  if (manifest.background) {
    if (typeof manifest.background.assetId === 'string' && assets.has(manifest.background.assetId)) {
      background = { assetId: manifest.background.assetId, name: text(manifest.background.name, 120, 'fundo') };
    } else {
      warnings.push('a foto de fundo do projeto não pôde ser carregada');
    }
  }

  const imageLayers = normalizeImageLayers(manifest.imageLayers, assets);
  const declaredLayers = Array.isArray(manifest.imageLayers) ? Math.min(manifest.imageLayers.length, LIMITS.imageLayers) : 0;
  if (imageLayers.length < declaredLayers) {
    warnings.push(`${declaredLayers - imageLayers.length} camada(s) de imagem foram descartadas por falta da imagem`);
  }

  return {
    scene: normalizeScene(manifest.scene),
    background,
    imageLayers,
    assets,
    warnings
  };
}
