/**
 * Haze Video Studio: projeto de vídeo dentro do formato `.haze` (ZIP + manifest.json).
 * Schema 2 acrescenta `kind: 'video'`. Os arquivos de vídeo NÃO vão no ZIP (tamanho): o projeto guarda
 * só a timeline e a "impressão digital" de cada mídia (nome, tamanho, duração). Ao abrir, o jogador
 * reconecta os arquivos e eles são casados por essa impressão. Mídia sem arquivo = clipe "offline".
 * O arquivo é tratado como NÃO confiável (limites, sanitização).
 */
import { PROJECT_FORMAT, PROJECT_SCHEMA_VERSION, ProjectError } from '../utils/projectFile';
import { sanitizeTimeline, Timeline, MediaRef } from './timeline';

export const VIDEO_MANIFEST_BYTES = 5 * 1024 * 1024;
export const VIDEO_PROJECT_BYTES = 20 * 1024 * 1024;
const MAX_MEDIA = 200;

export interface SavedMedia extends MediaRef { size: number }

export interface VideoProjectData { timeline: Timeline; media: SavedMedia[]; warnings: string[] }

export async function buildVideoProjectBlob(timeline: Timeline, media: SavedMedia[]): Promise<Blob> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const used = new Set([...timeline.clips.map(c => c.mediaId), ...(timeline.layers ?? []).map(l => l.mediaId)]);
  const manifest = {
    format: PROJECT_FORMAT,
    schemaVersion: PROJECT_SCHEMA_VERSION,
    kind: 'video',
    app: 'Haze RP Studio',
    createdAt: new Date().toISOString(),
    video: { timeline, media: media.filter(m => used.has(m.id)) }
  };
  zip.file('manifest.json', JSON.stringify(manifest));
  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  return new Blob([bytes as BlobPart], { type: 'application/zip' });
}

export async function parseVideoProject(file: Blob): Promise<VideoProjectData> {
  if (file.size > VIDEO_PROJECT_BYTES) throw new ProjectError('O arquivo é grande demais para ser um projeto de vídeo do Haze.');
  if (file.size < 22) throw new ProjectError('O arquivo está vazio ou corrompido.');
  const { default: JSZip } = await import('jszip');
  let zip: any;
  try { zip = await JSZip.loadAsync(await file.arrayBuffer()); }
  catch { throw new ProjectError('Este arquivo não é um projeto Haze válido (não é um ZIP legível).'); }
  const entry = zip.file('manifest.json');
  if (!entry) throw new ProjectError('Projeto inválido: manifest.json não encontrado.');
  let manifest: any;
  try {
    const raw: string = await entry.async('string');
    if (raw.length > VIDEO_MANIFEST_BYTES) throw new Error('grande');
    manifest = JSON.parse(raw);
  } catch { throw new ProjectError('Projeto inválido: o manifesto não pôde ser lido.'); }

  if (!manifest || manifest.format !== PROJECT_FORMAT) throw new ProjectError('Este arquivo não é um projeto do Haze RP Studio.');
  if (typeof manifest.schemaVersion !== 'number' || manifest.schemaVersion < 1) throw new ProjectError('Projeto inválido: versão desconhecida.');
  if (manifest.schemaVersion > PROJECT_SCHEMA_VERSION) {
    throw new ProjectError(`Este projeto foi salvo numa versão mais nova do Haze (formato ${manifest.schemaVersion}). Atualize o app para abri-lo.`);
  }
  if (manifest.kind !== 'video' || !manifest.video) {
    throw new ProjectError('Este é um projeto do Editor RP (foto e chat), sem vídeo. Abra-o na aba Editor RP.');
  }

  const warnings: string[] = [];
  const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const media: SavedMedia[] = [];
  const seen = new Set<string>();
  for (const m of Array.isArray(manifest.video.media) ? manifest.video.media.slice(0, MAX_MEDIA) : []) {
    if (typeof m?.id !== 'string' || typeof m?.name !== 'string' || seen.has(m.id)) continue;
    if (!(num(m.duration) > 0)) continue;
    seen.add(m.id);
    media.push({
      id: m.id.slice(0, 64), name: m.name.slice(0, 200), size: Math.max(0, num(m.size)), duration: num(m.duration),
      width: Math.max(0, num(m.width)), height: Math.max(0, num(m.height)), hasAudio: m.hasAudio === true
    });
  }
  const raw = sanitizeTimeline(manifest.video.timeline);
  const known = new Set(media.map(m => m.id));
  const clips = raw.clips.filter(c => known.has(c.mediaId));
  if (clips.length < raw.clips.length) warnings.push(`${raw.clips.length - clips.length} clipe(s) apontavam para mídia desconhecida e foram descartados`);
  const layers = (raw.layers ?? []).filter(l => known.has(l.mediaId));
  if (layers.length < (raw.layers ?? []).length) warnings.push(`${(raw.layers ?? []).length - layers.length} sobreposição(ões) apontavam para mídia desconhecida e foram descartadas`);
  const { layers: _unfiltered, ...rest } = raw; void _unfiltered;
  return { timeline: { ...rest, clips, ...(layers.length ? { layers } : {}) }, media, warnings };
}

/** Um arquivo reconecta uma mídia salva se nome e tamanho forem iguais e a duração bater (±50 ms). */
export function matchesSaved(saved: SavedMedia, file: { name: string; size: number }, duration?: number): boolean {
  if (saved.name !== file.name || saved.size !== file.size) return false;
  return duration === undefined || Math.abs(saved.duration - duration) <= 0.05;
}
