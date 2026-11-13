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
  /** Velocidade de reprodução (0,25 a 4). Ausente = 1. A duração na timeline é (saída - entrada) / velocidade. */
  speed?: number;
  /** Entrada/saída gradual (s, tempo da timeline): imagem vinda do preto e som subindo; o inverso no fim. */
  fadeIn?: number;
  fadeOut?: number;
  /** Transição de entrada: o clipe começa `duration` s antes do fim do anterior (fusão de imagem e de som). */
  transition?: { duration: number };
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
  /** 'center' centraliza no quadro (legendas); padrão 'left' a partir de x. */
  align?: 'left' | 'center';
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

/** Posição do CENTRO (fração do quadro; 0,5/0,5 = meio), escala (1 = cabe no quadro) e opacidade de uma camada. */
export interface Transform { x: number; y: number; scale: number; opacity: number }
/** Keyframe: valores completos num instante `time` (s desde o início da camada). */
export interface Keyframe extends Transform { time: number }

/** Clipe da trilha de SOBREPOSIÇÃO (picture-in-picture): posição livre no tempo, por cima da trilha principal. */
export interface LayerClip {
  id: string;
  mediaId: string;
  /** Início na timeline (s). */
  start: number;
  inPoint: number;
  outPoint: number;
  volume: number;
  /** Transformação fixa; ignorada quando há keyframes (valem os keyframes, interpolados). */
  base: Transform;
  keyframes?: Keyframe[];
}

export interface Timeline {
  version: 1;
  clips: Clip[];
  overlays: ChatOverlay[];
  /** Trilha de sobreposição (opcional: timelines antigas não têm). Ordem = de baixo para cima. */
  layers?: LayerClip[];
}

export interface PlacedClip {
  clip: Clip; start: number; end: number;
  /** Sobreposição com o clipe anterior (transição), em s. */
  overlap: number;
  /** Rampas de ÁUDIO efetivas (fade do clipe ou duração da transição, o que for maior). */
  audioFadeIn: number; audioFadeOut: number;
}

export const round3 = (n: number): number => Math.round(n * 1000) / 1000;

let counter = 0;
export const makeId = (prefix: string): string =>
  `${prefix}_${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const emptyTimeline = (): Timeline => ({ version: 1, clips: [], overlays: [] });

export const MIN_SPEED = 0.25;
export const MAX_SPEED = 4;
export const speedOf = (c: Clip): number => c.speed ?? 1;
/** Duração do clipe na TIMELINE (já considera a velocidade). */
export const clipDuration = (c: Clip): number => round3((c.outPoint - c.inPoint) / speedOf(c));

/** Posições derivadas da ordem dos clipes e das transições. */
export function layout(tl: Timeline): PlacedClip[] {
  const durs = tl.clips.map(clipDuration);
  const overlaps = tl.clips.map((c, i) =>
    i > 0 && c.transition ? round3(Math.max(0, Math.min(c.transition.duration, durs[i - 1] / 2, durs[i] / 2))) : 0);
  let end = 0;
  return tl.clips.map((clip, i) => {
    const start = round3(Math.max(0, end - overlaps[i]));
    end = round3(start + durs[i]);
    return {
      clip, start, end, overlap: overlaps[i],
      audioFadeIn: Math.max(clip.fadeIn ?? 0, overlaps[i]),
      audioFadeOut: Math.max(clip.fadeOut ?? 0, i + 1 < tl.clips.length ? overlaps[i + 1] : 0)
    };
  });
}

export const totalDuration = (tl: Timeline): number => {
  const l = layout(tl);
  let end = l.length ? l[l.length - 1].end : 0;
  for (const c of tl.layers ?? []) end = Math.max(end, round3(c.start + layerDuration(c)));
  return end;
};

/** Fator 0..1 das rampas de entrada/saída gradual (clipe) no instante `rel` (s desde o início do clipe). */
export function fadeFactor(rel: number, dur: number, fadeIn: number, fadeOut: number): number {
  let f = 1;
  if (fadeIn > 0) f = Math.min(f, Math.max(0, rel / fadeIn));
  if (fadeOut > 0) f = Math.min(f, Math.max(0, (dur - rel) / fadeOut));
  return Math.max(0, Math.min(1, f));
}

export interface ActiveLayer { clip: Clip; start: number; sourceTime: number; alpha: number }

/** Todos os clipes visíveis em `t` (mais de um durante uma transição), de baixo para cima, com a opacidade de cada um. */
export function activeLayers(tl: Timeline, t: number): ActiveLayer[] {
  const out: ActiveLayer[] = [];
  for (const p of layout(tl)) {
    if (!(t >= p.start - TIME_EPS && t < p.end - TIME_EPS)) continue;
    const rel = t - p.start;
    const dur = p.end - p.start;
    const ramp = p.overlap > 0 ? Math.min(1, rel / p.overlap) : 1; // o clipe que entra surge por cima
    const fade = fadeFactor(rel, dur, p.clip.fadeIn ?? 0, p.clip.fadeOut ?? 0);
    out.push({ clip: p.clip, start: p.start, sourceTime: round3(p.clip.inPoint + rel * speedOf(p.clip)), alpha: ramp * fade });
  }
  return out;
}

/** Qual clipe está sob o tempo `t` (o de cima, se houver transição) e em que instante da mídia original. */
export function locate(tl: Timeline, t: number): { clip: Clip; start: number; sourceTime: number } | null {
  const l = activeLayers(tl, t);
  return l.length ? l[l.length - 1] : null;
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
      const minSrc = MIN_CLIP * speedOf(c);
      let a = change.inPoint ?? c.inPoint;
      let b = change.outPoint ?? c.outPoint;
      if (!Number.isFinite(a) || !Number.isFinite(b)) return c;
      a = Math.max(0, Math.min(a, mediaDuration));
      b = Math.max(0, Math.min(b, mediaDuration));
      // Se o usuário puxou uma ponta além da outra, a ponta movida para em MIN_CLIP da fixa.
      if (change.inPoint !== undefined && b - a < minSrc) a = b - minSrc;
      if (change.outPoint !== undefined && b - a < minSrc) b = a + minSrc;
      if (a < 0 || b > mediaDuration + TIME_EPS || b - a < minSrc - TIME_EPS) return c;
      return { ...c, inPoint: round3(a), outPoint: round3(b) };
    })
  };
}

/** Divide o clipe que contém `t` em dois. Sem efeito se `t` cair a menos de MIN_CLIP de uma borda. */
export function splitAt(tl: Timeline, t: number, newId = makeId('clip')): Timeline {
  const hit = layout(tl).find(p => t > p.start + MIN_CLIP - TIME_EPS && t < p.end - MIN_CLIP + TIME_EPS);
  if (!hit) return tl;
  const cut = round3(hit.clip.inPoint + (t - hit.start) * speedOf(hit.clip));
  // a entrada (fade/transição) fica na 1ª metade, a saída gradual na 2ª
  const { fadeOut: fo, ...leftBase } = hit.clip;
  const { fadeIn: _fi, transition: _tr, ...rightBase } = hit.clip;
  void _fi; void _tr;
  const left: Clip = { ...leftBase, outPoint: cut };
  const right: Clip = { ...rightBase, id: newId, inPoint: cut };
  void fo;
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
    ...(o.kind === 'text' ? { kind: 'text' as const, color: o.color ?? '#ffffff', ...(o.align === 'center' ? { align: 'center' as const } : {}) } : {})
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


export function setClipSpeed(tl: Timeline, clipId: string, speed: number): Timeline {
  if (!Number.isFinite(speed)) return tl;
  const v = round3(Math.max(MIN_SPEED, Math.min(MAX_SPEED, speed)));
  return { ...tl, clips: tl.clips.map(c => {
    if (c.id !== clipId) return c;
    if (v === 1) { const { speed: _s, ...rest } = c; void _s; return rest; }
    return { ...c, speed: v };
  }) };
}

/** Entrada/saída gradual em segundos (0 remove). Limitada à metade da duração do clipe. */
export function setClipFades(tl: Timeline, clipId: string, f: { fadeIn?: number; fadeOut?: number }): Timeline {
  return { ...tl, clips: tl.clips.map(c => {
    if (c.id !== clipId) return c;
    const half = clipDuration(c) / 2;
    const n: Clip = { ...c };
    const put = (k: 'fadeIn' | 'fadeOut', v: number | undefined) => {
      if (v === undefined || !Number.isFinite(v)) return;
      const x = round3(Math.max(0, Math.min(half, v)));
      if (x > 0) n[k] = x; else delete n[k];
    };
    put('fadeIn', f.fadeIn); put('fadeOut', f.fadeOut);
    return n;
  }) };
}

/** Transição (fusão) da entrada do clipe com o anterior; 0 remove. */
export function setClipTransition(tl: Timeline, clipId: string, duration: number): Timeline {
  return { ...tl, clips: tl.clips.map(c => {
    if (c.id !== clipId) return c;
    if (!(duration > 0) || !Number.isFinite(duration)) { const { transition: _t, ...rest } = c; void _t; return rest; }
    return { ...c, transition: { duration: round3(Math.min(5, duration)) } };
  }) };
}

/** Gruda `t` na borda mais próxima (clipes e outros textos) se estiver a menos de `threshold` s. */
export function snapTime(tl: Timeline, t: number, ignoreOverlayId?: string, threshold = 0.12): number {
  const cands = [0];
  for (const p of layout(tl)) cands.push(p.start, p.end);
  for (const c of tl.layers ?? []) cands.push(c.start, c.start + layerDuration(c));
  for (const o of tl.overlays) if (o.id !== ignoreOverlayId) cands.push(o.start, o.start + o.duration);
  let best = t, bd = threshold;
  for (const c of cands) { const d = Math.abs(c - t); if (d <= bd) { bd = d; best = c; } }
  return round3(best);
}

/** Cria uma legenda (texto livre centralizado, embaixo) para cada trecho do SRT. */
export function addSubtitles(tl: Timeline, cues: Array<{ start: number; end: number; text: string }>): Timeline {
  const made: ChatOverlay[] = cues.map(c => ({
    id: makeId('sub'), kind: 'text', align: 'center', color: '#ffffff',
    start: round3(Math.max(0, c.start)), duration: round3(Math.max(MIN_CLIP, c.end - c.start)),
    text: c.text, x: 0, y: 630, fontSize: 28
  }));
  return { ...tl, overlays: [...tl.overlays, ...made] };
}

export const MAX_LAYERS = 50;
export const MAX_KEYFRAMES = 200;
export const DEFAULT_LAYER_TRANSFORM: Transform = { x: 0.75, y: 0.25, scale: 0.3, opacity: 1 };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
/** Valores fora do intervalo são limitados; o que não é número vira o padrão. */
export function clampTransform(t: any, d: Transform = DEFAULT_LAYER_TRANSFORM): Transform {
  const n = (v: unknown, fb: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fb);
  return {
    x: round3(clamp(n(t?.x, d.x), -0.5, 1.5)), y: round3(clamp(n(t?.y, d.y), -0.5, 1.5)),
    scale: round3(clamp(n(t?.scale, d.scale), 0.05, 4)), opacity: round3(clamp(n(t?.opacity, d.opacity), 0, 1))
  };
}

export const layerDuration = (c: LayerClip): number => round3(c.outPoint - c.inPoint);

/** Valores da camada no instante `rel` (s desde o início dela): interpolação linear entre keyframes. */
export function evalTransform(l: LayerClip, rel: number): Transform {
  const k = l.keyframes;
  if (!k || !k.length) return l.base;
  if (rel <= k[0].time) return pick(k[0]);
  if (rel >= k[k.length - 1].time) return pick(k[k.length - 1]);
  let i = 0; while (i < k.length - 1 && k[i + 1].time <= rel) i++;
  const a = k[i], b = k[i + 1];
  const f = (rel - a.time) / (b.time - a.time);
  const mix = (p: number, q: number) => p + (q - p) * f;
  return { x: mix(a.x, b.x), y: mix(a.y, b.y), scale: mix(a.scale, b.scale), opacity: mix(a.opacity, b.opacity) };
}
const pick = (k: Keyframe): Transform => ({ x: k.x, y: k.y, scale: k.scale, opacity: k.opacity });

export interface ActiveLayerClip { layer: LayerClip; sourceTime: number; tr: Transform }

/** Camadas de sobreposição visíveis em `t`, de baixo para cima. */
export function activeLayerClips(tl: Timeline, t: number): ActiveLayerClip[] {
  const out: ActiveLayerClip[] = [];
  for (const l of tl.layers ?? []) {
    const rel = t - l.start;
    if (rel >= -TIME_EPS && rel < layerDuration(l) - TIME_EPS) {
      out.push({ layer: l, sourceTime: round3(l.inPoint + Math.max(0, rel)), tr: evalTransform(l, Math.max(0, rel)) });
    }
  }
  return out;
}

export function addLayer(tl: Timeline, media: MediaRef, start: number, id = makeId('layer')): Timeline {
  if ((tl.layers ?? []).length >= MAX_LAYERS) return tl;
  const l: LayerClip = {
    id, mediaId: media.id, start: round3(Math.max(0, start)), inPoint: 0, outPoint: round3(media.duration),
    volume: 1, base: { ...DEFAULT_LAYER_TRANSFORM }
  };
  return { ...tl, layers: [...(tl.layers ?? []), l] };
}

const mapLayer = (tl: Timeline, id: string, f: (l: LayerClip) => LayerClip): Timeline =>
  ({ ...tl, layers: (tl.layers ?? []).map(l => (l.id === id ? f(l) : l)) });

export const removeLayer = (tl: Timeline, id: string): Timeline =>
  ({ ...tl, layers: (tl.layers ?? []).filter(l => l.id !== id) });

export function updateLayer(tl: Timeline, id: string, patch: { start?: number; volume?: number; base?: Partial<Transform> }): Timeline {
  return mapLayer(tl, id, l => ({
    ...l,
    ...(patch.start !== undefined && Number.isFinite(patch.start) ? { start: round3(Math.max(0, patch.start)) } : {}),
    ...(patch.volume !== undefined && Number.isFinite(patch.volume) ? { volume: clamp(patch.volume, 0, 2) } : {}),
    ...(patch.base ? { base: clampTransform({ ...l.base, ...patch.base }, l.base) } : {})
  }));
}

export function trimLayer(tl: Timeline, id: string, change: { inPoint?: number; outPoint?: number }, mediaDuration: number): Timeline {
  return mapLayer(tl, id, l => {
    let a = change.inPoint ?? l.inPoint, b = change.outPoint ?? l.outPoint;
    if (!Number.isFinite(a) || !Number.isFinite(b)) return l;
    a = clamp(a, 0, mediaDuration); b = clamp(b, 0, mediaDuration);
    if (change.inPoint !== undefined && b - a < MIN_CLIP) a = b - MIN_CLIP;
    if (change.outPoint !== undefined && b - a < MIN_CLIP) b = a + MIN_CLIP;
    if (a < 0 || b > mediaDuration + TIME_EPS) return l;
    const n = { ...l, inPoint: round3(a), outPoint: round3(b) };
    // keyframes além do novo fim são limitados à duração
    if (n.keyframes) { const d = layerDuration(n); n.keyframes = n.keyframes.map(k => ({ ...k, time: Math.min(k.time, d) })); }
    return n;
  });
}

/** Cria (ou substitui, se já houver um no mesmo instante) um keyframe. Sem `values`, captura o valor atual. */
export function addKeyframe(tl: Timeline, id: string, time: number, values?: Partial<Transform>): Timeline {
  return mapLayer(tl, id, l => {
    if (!Number.isFinite(time)) return l;
    const t = round3(clamp(time, 0, layerDuration(l)));
    const cur = evalTransform(l, t);
    const kf: Keyframe = { time: t, ...clampTransform({ ...cur, ...values }, cur) };
    const rest = (l.keyframes ?? []).filter(k => Math.abs(k.time - t) >= TIME_EPS);
    if (rest.length >= MAX_KEYFRAMES) return l;
    return { ...l, keyframes: [...rest, kf].sort((a, b) => a.time - b.time) };
  });
}

export function removeKeyframe(tl: Timeline, id: string, time: number): Timeline {
  return mapLayer(tl, id, l => {
    const rest = (l.keyframes ?? []).filter(k => Math.abs(k.time - time) >= TIME_EPS);
    const { keyframes: _k, ...noKf } = l; void _k;
    return rest.length ? { ...l, keyframes: rest } : noKf;
  });
}

/** Tudo que emite som, em ordem de início: clipes da trilha principal + camadas de sobreposição. */
export function audioItems(tl: Timeline): PlacedClip[] {
  const items: PlacedClip[] = [...layout(tl)];
  for (const l of tl.layers ?? []) {
    items.push({
      clip: { id: l.id, mediaId: l.mediaId, inPoint: l.inPoint, outPoint: l.outPoint, volume: l.volume },
      start: l.start, end: round3(l.start + layerDuration(l)), overlap: 0, audioFadeIn: 0, audioFadeOut: 0
    });
  }
  return items.sort((a, b) => a.start - b.start);
}

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
    if (!(clipDuration(c) >= MIN_CLIP - TIME_EPS)) errs.push(`clipe ${c.id}: duração menor que ${MIN_CLIP}s`);
  }
  for (const c of tl.layers ?? []) {
    if (seen.has(c.id)) errs.push(`id duplicado: ${c.id}`);
    seen.add(c.id);
    const m = media.get(c.mediaId);
    if (!m) { errs.push(`sobreposição ${c.id}: mídia ausente (${c.mediaId})`); continue; }
    if (!(c.inPoint >= 0) || !(c.outPoint <= m.duration + TIME_EPS)) errs.push(`sobreposição ${c.id}: pontos fora da mídia`);
    if (!(layerDuration(c) >= MIN_CLIP - TIME_EPS) || c.start < 0) errs.push(`sobreposição ${c.id}: tempo inválido`);
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
    const sp = Math.max(MIN_SPEED, Math.min(MAX_SPEED, num(c.speed, 1)));
    if (a < 0 || (b - a) / sp < MIN_CLIP - TIME_EPS) continue;
    const clip: Clip = { id: c.id.slice(0, 64), mediaId: c.mediaId.slice(0, 64), inPoint: round3(a), outPoint: round3(b), volume: Math.max(0, Math.min(2, num(c.volume, 1))) };
    if (sp !== 1) clip.speed = round3(sp);
    const half = (b - a) / sp / 2;
    const fi = Math.min(half, Math.max(0, num(c.fadeIn, 0))), fo = Math.min(half, Math.max(0, num(c.fadeOut, 0)));
    if (fi > 0) clip.fadeIn = round3(fi);
    if (fo > 0) clip.fadeOut = round3(fo);
    if (c.transition && num(c.transition.duration, 0) > 0) clip.transition = { duration: round3(Math.min(5, num(c.transition.duration, 0))) };
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
      ...(o.kind === 'text' ? { kind: 'text' as const, color: typeof o.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(o.color) ? o.color : '#ffffff', ...(o.align === 'center' ? { align: 'center' as const } : {}) } : {}),
      ...(offs ? { lineOffsets: offs } : {}),
      id: o.id.slice(0, 64), text: o.text.slice(0, 2000), start: Math.max(0, round3(num(o.start, 0))),
      duration: Math.max(MIN_CLIP, round3(num(o.duration, 3))), x: num(o.x, 24), y: num(o.y, 24),
      fontSize: Math.max(10, Math.min(72, num(o.fontSize, 22)))
    });
  }
  for (const c of Array.isArray(r.layers) ? r.layers.slice(0, MAX_LAYERS) : []) {
    if (typeof c?.id !== 'string' || typeof c?.mediaId !== 'string') continue;
    const a = num(c.inPoint, 0), b = num(c.outPoint, 0);
    if (a < 0 || b - a < MIN_CLIP - TIME_EPS) continue;
    const layer: LayerClip = {
      id: c.id.slice(0, 64), mediaId: c.mediaId.slice(0, 64), start: Math.max(0, round3(num(c.start, 0))),
      inPoint: round3(a), outPoint: round3(b), volume: Math.max(0, Math.min(2, num(c.volume, 1))),
      base: clampTransform(c.base)
    };
    if (Array.isArray(c.keyframes)) {
      const dur = b - a;
      const kfs = c.keyframes.slice(0, MAX_KEYFRAMES)
        .filter((k: any) => k && typeof k.time === 'number' && Number.isFinite(k.time))
        .map((k: any) => ({ time: round3(Math.max(0, Math.min(dur, k.time))), ...clampTransform(k) }))
        .sort((x: Keyframe, y: Keyframe) => x.time - y.time);
      // mesmo instante duas vezes: fica o último
      const uniq: Keyframe[] = [];
      for (const k of kfs) { if (uniq.length && Math.abs(uniq[uniq.length - 1].time - k.time) < TIME_EPS) uniq[uniq.length - 1] = k; else uniq.push(k); }
      if (uniq.length) layer.keyframes = uniq;
    }
    (tl.layers ??= []).push(layer);
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
