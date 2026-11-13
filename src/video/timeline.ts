/**
 * Haze Video Studio (POC): modelo de timeline NÃO destrutivo.
 *
 * Tudo aqui é puro (sem DOM, sem mediabunny): entra um Timeline, sai um Timeline novo.
 * A trilha de vídeo é sequencial ("magnética"): a posição de cada clipe é derivada da ordem,
 * então reorganizar/cortar nunca deixa buraco nem sobreposição na trilha principal.
 * Overlays de chat ficam em tempo absoluto e podem se sobrepor.
 */

export const MIN_CLIP = 0.1;       // s: menor duração de um clipe
export const TIME_EPS = 0.001;     // s: precisão de tempo (1 ms)
export const HISTORY_LIMIT = 100;

export interface MediaRef {
  id: string;
  name: string;
  duration: number;
  width: number;
  height: number;
  hasAudio: boolean;
}

/** Preset de câmera RP aplicado a um clipe (reaproveita `utils/cameraFx`). Ausente = sem preset. */
export interface ClipCamera {
  preset: 'bodycam' | 'cctv' | 'noir';
  /** Relógio exibido: data e hora no INÍCIO da mídia (o relógio avança com o vídeo). */
  date: string; // AAAA-MM-DD
  time: string; // HH:MM:SS
  officer?: string; dept?: string;       // bodycam
  camName?: string; location?: string;   // cctv
}

export interface Clip {
  id: string;
  mediaId: string;
  camera?: ClipCamera;
  /** Ponto inicial e final DENTRO da mídia original (s). Duração = outPoint - inPoint. */
  inPoint: number;
  outPoint: number;
  volume: number; // 0..2
}

export interface ChatOverlay {
  id: string;
  /** 'chat' = linhas de servidor com as cores do Editor RP; 'text' = título/legenda livre. */
  kind?: 'chat' | 'text';
  /** Cor do texto livre (#rrggbb). */
  color?: string;
  /** Instante de entrada de cada linha, relativo ao início do overlay (s). Ausente = tudo de uma vez. */
  lineOffsets?: number[];
  /** Tempo absoluto na timeline (s). */
  start: number;
  duration: number;
  /** Linhas de chat no formato do servidor (mesmo texto aceito pelo Editor RP). */
  text: string;
  x: number;
  y: number;
  fontSize: number;
}

export interface Timeline {
  version: 1;
  clips: Clip[];
  overlays: ChatOverlay[];
}

export interface PlacedClip { clip: Clip; start: number; end: number }

export const round3 = (n: number): number => Math.round(n * 1000) / 1000;

let counter = 0;
export const makeId = (prefix: string): string =>
  `${prefix}_${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const emptyTimeline = (): Timeline => ({ version: 1, clips: [], overlays: [] });

export const clipDuration = (c: Clip): number => round3(c.outPoint - c.inPoint);

/** Posições derivadas da ordem dos clipes. */
export function layout(tl: Timeline): PlacedClip[] {
  let t = 0;
  return tl.clips.map(clip => {
    const start = t;
    t = round3(t + clipDuration(clip));
    return { clip, start, end: t };
  });
}

export const totalDuration = (tl: Timeline): number => {
  const l = layout(tl);
  return l.length ? l[l.length - 1].end : 0;
};

/** Qual clipe está sob o tempo `t` e em que instante da mídia original. */
export function locate(tl: Timeline, t: number): { clip: Clip; start: number; sourceTime: number } | null {
  for (const p of layout(tl)) {
    if (t >= p.start - TIME_EPS && t < p.end - TIME_EPS) {
      return { clip: p.clip, start: p.start, sourceTime: round3(p.clip.inPoint + (t - p.start)) };
    }
  }
  return null;
}

// ---------------------------------------------------------------- edição (imutável)

export function addClip(tl: Timeline, media: MediaRef, id = makeId('clip')): Timeline {
  const clip: Clip = { id, mediaId: media.id, inPoint: 0, outPoint: round3(media.duration), volume: 1 };
  return { ...tl, clips: [...tl.clips, clip] };
}

/** Ajusta os pontos de entrada/saída do clipe dentro da mídia original. Valores inválidos são limitados. */
export function trimClip(
  tl: Timeline, clipId: string, change: { inPoint?: number; outPoint?: number }, mediaDuration: number
): Timeline {
  return {
    ...tl,
    clips: tl.clips.map(c => {
      if (c.id !== clipId) return c;
      let a = change.inPoint ?? c.inPoint;
      let b = change.outPoint ?? c.outPoint;
      if (!Number.isFinite(a) || !Number.isFinite(b)) return c;
      a = Math.max(0, Math.min(a, mediaDuration));
      b = Math.max(0, Math.min(b, mediaDuration));
      // Se o usuário puxou uma ponta além da outra, a ponta movida para em MIN_CLIP da fixa.
      if (change.inPoint !== undefined && b - a < MIN_CLIP) a = b - MIN_CLIP;
      if (change.outPoint !== undefined && b - a < MIN_CLIP) b = a + MIN_CLIP;
      if (a < 0 || b > mediaDuration + TIME_EPS || b - a < MIN_CLIP - TIME_EPS) return c;
      return { ...c, inPoint: round3(a), outPoint: round3(b) };
    })
  };
}

/** Divide o clipe que contém `t` em dois. Sem efeito se `t` cair a menos de MIN_CLIP de uma borda. */
export function splitAt(tl: Timeline, t: number, newId = makeId('clip')): Timeline {
  const hit = layout(tl).find(p => t > p.start + MIN_CLIP - TIME_EPS && t < p.end - MIN_CLIP + TIME_EPS);
  if (!hit) return tl;
  const cut = round3(hit.clip.inPoint + (t - hit.start));
  const left: Clip = { ...hit.clip, outPoint: cut };
  const right: Clip = { ...hit.clip, id: newId, inPoint: cut };
  const i = tl.clips.findIndex(c => c.id === hit.clip.id);
  const clips = [...tl.clips];
  clips.splice(i, 1, left, right);
  return { ...tl, clips };
}

export function moveClip(tl: Timeline, clipId: string, toIndex: number): Timeline {
  const from = tl.clips.findIndex(c => c.id === clipId);
  if (from < 0) return tl;
  const to = Math.max(0, Math.min(tl.clips.length - 1, Math.round(toIndex)));
  if (to === from) return tl;
  const clips = [...tl.clips];
  const [c] = clips.splice(from, 1);
  clips.splice(to, 0, c);
  return { ...tl, clips };
}

export const removeClip = (tl: Timeline, clipId: string): Timeline =>
  ({ ...tl, clips: tl.clips.filter(c => c.id !== clipId) });

export function setClipVolume(tl: Timeline, clipId: string, volume: number): Timeline {
  const v = Math.max(0, Math.min(2, Number.isFinite(volume) ? volume : 1));
  return { ...tl, clips: tl.clips.map(c => (c.id === clipId ? { ...c, volume: v } : c)) };
}

export function addOverlay(tl: Timeline, o: Partial<ChatOverlay> & { text: string }, id = makeId('chat')): Timeline {
  const overlay: ChatOverlay = {
    id, start: round3(Math.max(0, o.start ?? 0)), duration: round3(Math.max(MIN_CLIP, o.duration ?? 3)),
    text: o.text, x: o.x ?? 24, y: o.y ?? 24, fontSize: o.fontSize ?? 22,
    ...(o.kind === 'text' ? { kind: 'text' as const, color: o.color ?? '#ffffff' } : {})
  };
  return { ...tl, overlays: [...tl.overlays, overlay] };
}

export function updateOverlay(tl: Timeline, id: string, patch: Partial<Omit<ChatOverlay, 'id'>>): Timeline {
  return {
    ...tl,
    overlays: tl.overlays.map(o => {
      if (o.id !== id) return o;
      const n = { ...o, ...patch };
      n.start = round3(Math.max(0, n.start));
      n.duration = round3(Math.max(MIN_CLIP, n.duration));
      return n;
    })
  };
}

export const removeOverlay = (tl: Timeline, id: string): Timeline =>
  ({ ...tl, overlays: tl.overlays.filter(o => o.id !== id) });

export const overlaysAt = (tl: Timeline, t: number): ChatOverlay[] =>
  tl.overlays.filter(o => t >= o.start - TIME_EPS && t < o.start + o.duration - TIME_EPS);


const NL = String.fromCharCode(10);
const CAM_PRESETS = ['bodycam', 'cctv', 'noir'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}:\d{2}$/;

/** Liga/troca/remove o preset de câmera de um clipe. `preset: 'none'` remove. */
export function setClipCamera(
  tl: Timeline, clipId: string, preset: 'none' | ClipCamera['preset'], now: { date: string; time: string },
  extra: Partial<Omit<ClipCamera, 'preset'>> = {}
): Timeline {
  return {
    ...tl,
    clips: tl.clips.map(c => {
      if (c.id !== clipId) return c;
      if (preset === 'none') { const { camera: _drop, ...rest } = c; void _drop; return rest; }
      const prev = c.camera;
      const camera: ClipCamera = {
        ...(prev ?? { date: now.date, time: now.time }), ...extra, preset,
        date: DATE_RE.test(extra.date ?? prev?.date ?? '') ? (extra.date ?? prev!.date) : now.date,
        time: TIME_RE.test(extra.time ?? prev?.time ?? '') ? (extra.time ?? prev!.time) : now.time
      };
      return { ...c, camera };
    })
  };
}

/** Faz as linhas do chat entrarem uma a uma, `step` segundos entre elas. `step <= 0` remove a sequência. */
export function setLineStep(tl: Timeline, overlayId: string, step: number): Timeline {
  return {
    ...tl,
    overlays: tl.overlays.map(o => {
      if (o.id !== overlayId) return o;
      if (!(step > 0)) { const { lineOffsets: _d, ...rest } = o; void _d; return rest; }
      const n = o.text.split(NL).filter(l => l.trim()).length;
      return { ...o, lineOffsets: Array.from({ length: n }, (_, i) => round3(i * step)) };
    })
  };
}

/** Texto visível do overlay no tempo `t` (linhas já "chegadas"). Vazio = nada a desenhar. */
export function overlayText(o: ChatOverlay, t: number): string {
  const lines = o.text.split(NL).filter(l => l.trim());
  if (!o.lineOffsets || o.lineOffsets.length !== lines.length) return o.text;
  const rel = t - o.start;
  return lines.filter((_, i) => rel >= o.lineOffsets![i] - TIME_EPS).join(NL);
}

/** Relógio da câmera no instante `sourceTime` da mídia (data/hora iniciais + tempo decorrido). */
export function cameraClock(cam: ClipCamera, sourceTime: number): { date: string; time: string } {
  const [y, mo, d] = cam.date.split('-').map(Number);
  const [h, mi, sec] = cam.time.split(':').map(Number);
  const base = Date.UTC(y, mo - 1, d, h, mi, sec);
  const dt = new Date(base + Math.floor(sourceTime) * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${dt.getUTCFullYear()}-${p(dt.getUTCMonth() + 1)}-${p(dt.getUTCDate())}`,
    time: `${p(dt.getUTCHours())}:${p(dt.getUTCMinutes())}:${p(dt.getUTCSeconds())}`
  };
}

// ---------------------------------------------------------------- validação / serialização

/** Devolve a lista de problemas (vazia = válida). Usada antes de exportar e ao abrir projeto. */
export function validate(tl: Timeline, media: Map<string, MediaRef>): string[] {
  const errs: string[] = [];
  const seen = new Set<string>();
  for (const c of tl.clips) {
    if (seen.has(c.id)) errs.push(`id duplicado: ${c.id}`);
    seen.add(c.id);
    const m = media.get(c.mediaId);
    if (!m) { errs.push(`clipe ${c.id}: mídia ausente (${c.mediaId})`); continue; }
    if (!(c.inPoint >= 0) || !(c.outPoint <= m.duration + TIME_EPS)) errs.push(`clipe ${c.id}: pontos fora da mídia`);
    if (!(c.outPoint - c.inPoint >= MIN_CLIP - TIME_EPS)) errs.push(`clipe ${c.id}: duração menor que ${MIN_CLIP}s`);
  }
  const total = totalDuration(tl);
  for (const o of tl.overlays) {
    if (seen.has(o.id)) errs.push(`id duplicado: ${o.id}`);
    seen.add(o.id);
    if (o.start < 0 || o.duration < MIN_CLIP - TIME_EPS) errs.push(`chat ${o.id}: tempo inválido`);
    if (o.start >= total && total > 0) errs.push(`chat ${o.id}: começa depois do fim do vídeo`);
  }
  return errs;
}

/** Lê uma timeline de dados não confiáveis (ex.: arquivo .haze). Nunca lança; descarta o que for inválido. */
export function sanitizeTimeline(raw: unknown): Timeline {
  const tl = emptyTimeline();
  const r = raw as any;
  if (!r || typeof r !== 'object') return tl;
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  for (const c of Array.isArray(r.clips) ? r.clips.slice(0, 500) : []) {
    if (typeof c?.id !== 'string' || typeof c?.mediaId !== 'string') continue;
    const a = num(c.inPoint, 0), b = num(c.outPoint, 0);
    if (a < 0 || b - a < MIN_CLIP - TIME_EPS) continue;
    const clip: Clip = { id: c.id.slice(0, 64), mediaId: c.mediaId.slice(0, 64), inPoint: round3(a), outPoint: round3(b), volume: Math.max(0, Math.min(2, num(c.volume, 1))) };
    const cam = c.camera;
    if (cam && CAM_PRESETS.includes(cam.preset) && DATE_RE.test(cam.date) && TIME_RE.test(cam.time)) {
      const str = (v: unknown) => (typeof v === 'string' ? v.slice(0, 60) : undefined);
      clip.camera = { preset: cam.preset, date: cam.date, time: cam.time, officer: str(cam.officer), dept: str(cam.dept), camName: str(cam.camName), location: str(cam.location) };
    }
    tl.clips.push(clip);
  }
  for (const o of Array.isArray(r.overlays) ? r.overlays.slice(0, 500) : []) {
    if (typeof o?.id !== 'string' || typeof o?.text !== 'string') continue;
    const lines = o.text.split(NL).filter((l: string) => l.trim()).length;
    const offs = Array.isArray(o.lineOffsets) && o.lineOffsets.length === lines && o.lineOffsets.every((v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0)
      ? o.lineOffsets.map((v: number) => round3(v)) : undefined;
    tl.overlays.push({
      ...(o.kind === 'text' ? { kind: 'text' as const, color: typeof o.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(o.color) ? o.color : '#ffffff' } : {}),
      ...(offs ? { lineOffsets: offs } : {}),
      id: o.id.slice(0, 64), text: o.text.slice(0, 2000), start: Math.max(0, round3(num(o.start, 0))),
      duration: Math.max(MIN_CLIP, round3(num(o.duration, 3))), x: num(o.x, 24), y: num(o.y, 24),
      fontSize: Math.max(10, Math.min(72, num(o.fontSize, 22)))
    });
  }
  return tl;
}

// ---------------------------------------------------------------- histórico (desfazer/refazer)

export interface History { past: Timeline[]; present: Timeline; future: Timeline[] }

export const createHistory = (tl: Timeline = emptyTimeline()): History => ({ past: [], present: tl, future: [] });

/** Registra um novo estado. Se nada mudou (mesma referência), não polui o histórico. */
export function commit(h: History, next: Timeline): History {
  if (next === h.present) return h;
  return { past: [...h.past, h.present].slice(-HISTORY_LIMIT), present: next, future: [] };
}
export const undo = (h: History): History =>
  h.past.length ? { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] } : h;
export const redo = (h: History): History =>
  h.future.length ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) } : h;
