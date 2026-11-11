/**
 * Modelo único e tipado das configurações do GIF (substitui os estados soltos selectedPreset / cropMode /
 * outSize / fitMode / targetWidth / fps / speedMultiplier, que podiam ficar incompatíveis entre si).
 *
 * Regras:
 *  - escolher um PERFIL aplica o enquadramento, FPS e cores daquele perfil no nível de qualidade atual;
 *  - ajustar um valor manualmente (tamanho, FPS, cores) muda SÓ aquele valor: o perfil continua escolhido
 *    (com o alvo de tamanho dele) e a configuração é marcada como `tweaked` ("ajustado");
 *  - escolher "custom" não muda nada: só deixa de impor os valores e o alvo de um perfil.
 */
import type { FitMode } from './editorSettings';
import { GIF_MAX_RES, GIF_MIN_RES, type GifOutSize } from './gifFrame';

export type GifProfileId = 'custom' | 'emoji' | 'avatar' | 'banner' | 'forum';
export type GifQuality = 'quality' | 'balanced' | 'compact';

export type GifFrameSpec =
  | { kind: 'width'; width: number; crop: 'original' | 'square' }
  | { kind: 'size'; size: GifOutSize; fit: FitMode };

export interface GifSettings {
  profile: GifProfileId;
  quality: GifQuality;
  frame: GifFrameSpec;
  fps: number;
  speed: number;
  colors: number; // 2–256
  /** true quando algum valor do perfil foi ajustado à mão */
  tweaked: boolean;
}

export interface SizeTarget {
  bytes: number;
  /** fonte oficial consultada */
  source: string;
  verifiedOn: string;
  note: string;
}

interface TierValues { frame: GifFrameSpec; fps: number; colors: number }
export interface GifProfile {
  id: GifProfileId;
  label: string;
  hint: string;
  tiers: Record<GifQuality, TierValues>;
  /** duração máxima recomendada (s) — o perfil encurta o trecho se passar */
  maxSeconds?: number;
  target: SizeTarget | null;
}

const W = (width: number, crop: 'original' | 'square' = 'original'): GifFrameSpec => ({ kind: 'width', width, crop });

/**
 * Limites de plataforma: conferidos em fontes oficiais em 2026-11-11 e podem mudar — por isso ficam como
 * DADOS aqui (um só lugar) e o app SEMPRE mede o arquivo final antes de dizer que o limite foi cumprido.
 */
export const GIF_PROFILES: Record<Exclude<GifProfileId, 'custom'>, GifProfile> = {
  emoji: {
    id: 'emoji', label: 'Discord Emoji', hint: 'Quadrado, até 256 KB',
    maxSeconds: 2.5,
    tiers: {
      quality:  { frame: W(128, 'square'), fps: 12, colors: 256 },
      balanced: { frame: W(128, 'square'), fps: 10, colors: 256 },
      compact:  { frame: W(96, 'square'),  fps: 8,  colors: 128 }
    },
    target: {
      bytes: 256 * 1024,
      source: 'https://docs.discord.com/developers/resources/emoji',
      verifiedOn: '2026-11-11',
      note: 'Emoji e emoji animado: no máximo 256 KiB (documentação para desenvolvedores do Discord).'
    }
  },
  avatar: {
    id: 'avatar', label: 'Discord Avatar', hint: 'Quadrado 1:1, nitidez',
    tiers: {
      quality:  { frame: W(512, 'square'), fps: 15, colors: 256 },
      balanced: { frame: W(320, 'square'), fps: 12, colors: 256 },
      compact:  { frame: W(256, 'square'), fps: 10, colors: 128 }
    },
    target: {
      bytes: 10 * 1024 * 1024,
      source: 'https://discord.com/blog/discord-profile-tips-from-design-professionals',
      verifiedOn: '2026-11-11',
      note: 'Orientação do Discord: imagem ou GIF abaixo de 10 MB (avatar de GIF exige Nitro). Avatar por servidor: 8 MB (Central de Ajuda).'
    }
  },
  banner: {
    id: 'banner', label: 'Discord Banner', hint: 'Proporção original, 680 px ou mais',
    tiers: {
      quality:  { frame: W(960), fps: 15, colors: 256 },
      balanced: { frame: W(680), fps: 12, colors: 256 },
      compact:  { frame: W(680), fps: 10, colors: 128 }
    },
    target: {
      bytes: 10 * 1024 * 1024,
      source: 'https://support.discord.com/hc/en-us/articles/4403147417623-Custom-Profiles',
      verifiedOn: '2026-11-11',
      note: 'Banner: PNG, JPG ou GIF animado abaixo de 10 MB, mínimo 680×240 (GIF animado exige Nitro).'
    }
  },
  forum: {
    id: 'forum', label: 'RP Forum', hint: 'Qualidade e texto legível',
    tiers: {
      quality:  { frame: W(1280), fps: 15, colors: 256 },
      balanced: { frame: W(960),  fps: 12, colors: 256 },
      compact:  { frame: W(720),  fps: 10, colors: 128 }
    },
    target: null // cada fórum tem seu limite: o app informa o tamanho medido
  }
};

export const GIF_QUALITY_LABELS: Record<GifQuality, { label: string; hint: string }> = {
  quality: { label: 'Qualidade', hint: 'Prioriza fidelidade visual' },
  balanced: { label: 'Equilibrado', hint: 'Qualidade, tamanho e velocidade' },
  compact: { label: 'Compacto', hint: 'Prioriza compartilhar' }
};

export const DEFAULT_GIF_SETTINGS: GifSettings = {
  profile: 'custom', quality: 'balanced', frame: W(480), fps: 12, speed: 1, colors: 256, tweaked: false
};

export const clampColors = (n: number) => Math.min(256, Math.max(2, Math.round(Number.isFinite(n) ? n : 256)));

/** Aplica um perfil (e nível de qualidade) sem mexer na velocidade escolhida. */
export const applyProfile = (s: GifSettings, profile: GifProfileId, quality: GifQuality = s.quality): GifSettings => {
  if (profile === 'custom') return { ...s, profile: 'custom', quality, tweaked: false };
  const t = GIF_PROFILES[profile].tiers[quality];
  return { ...s, profile, quality, frame: t.frame, fps: t.fps, colors: t.colors, tweaked: false };
};

/** Troca o nível de qualidade: só faz algo dentro de um perfil. */
export const applyQuality = (s: GifSettings, quality: GifQuality): GifSettings =>
  s.profile === 'custom' ? { ...s, quality } : applyProfile(s, s.profile, quality);

/** Ajuste manual: muda só o que foi pedido, mantém o perfil (e o alvo) e marca como "ajustado". */
export const withManual = (s: GifSettings, patch: Partial<Omit<GifSettings, 'profile' | 'tweaked'>>): GifSettings =>
  ({ ...s, ...patch, tweaked: s.profile !== 'custom' });

export const setCustomSize = (s: GifSettings, w: number, h: number, fit: FitMode = s.frame.kind === 'size' ? s.frame.fit : 'cover'): GifSettings => {
  const c = (n: number) => Math.min(GIF_MAX_RES, Math.max(GIF_MIN_RES, Math.round(n)));
  return withManual(s, { frame: { kind: 'size', size: { w: c(w), h: c(h) }, fit } });
};

/** Dimensões finais do quadro para um vídeo de entrada (as mesmas que computeGifFrame produz). */
export const outputDims = (s: GifSettings, vw: number, vh: number): { w: number; h: number } => {
  if (s.frame.kind === 'size') return { w: s.frame.size.w, h: s.frame.size.h };
  if (s.frame.crop === 'square') return { w: s.frame.width, h: s.frame.width };
  return { w: s.frame.width, h: Math.max(1, Math.round(s.frame.width * (vh / vw))) };
};

// ---------------------------------------------------------------- Smart Export

/** Pisos de cada nível: o Smart Export nunca reduz além disso. */
const FLOORS: Record<GifQuality, { colors: number; scale: number; fpsMin: number }> = {
  quality:  { colors: 128, scale: 0.9, fpsMin: 10 },
  balanced: { colors: 64,  scale: 0.75, fpsMin: 8 },
  compact:  { colors: 32,  scale: 0.5, fpsMin: 6 }
};

const scaleFrame = (f: GifFrameSpec, k: number): GifFrameSpec => {
  const c = (n: number) => Math.max(GIF_MIN_RES, Math.round(n * k));
  return f.kind === 'width' ? { ...f, width: c(f.width) } : { ...f, size: { w: c(f.size.w), h: c(f.size.h) } };
};

/**
 * Próxima configuração mais leve (uma etapa por vez, da menos para a mais perceptível), respeitando os
 * pisos do nível. Retorna null quando não há mais o que reduzir. O perfil não muda.
 */
export const nextLighter = (s: GifSettings, base: GifSettings = s): GifSettings | null => {
  const fl = FLOORS[s.quality];
  const baseScale = (f: GifFrameSpec) => (f.kind === 'width' ? f.width : f.size.w);
  const scaleNow = baseScale(s.frame) / baseScale(base.frame);
  if (s.colors > 128 && fl.colors <= 128) return { ...s, colors: 128 };
  if (s.fps > fl.fpsMin) { const f = Math.max(fl.fpsMin, Math.round(s.fps * 0.8)); if (f < s.fps) return { ...s, fps: f }; }
  if (s.colors > 64 && fl.colors <= 64) return { ...s, colors: 64 };
  if (scaleNow * 0.85 >= fl.scale - 1e-6) return { ...s, frame: scaleFrame(s.frame, 0.85) };
  if (s.colors > 32 && fl.colors <= 32) return { ...s, colors: 32 };
  if (scaleNow * 0.85 >= fl.scale - 1e-6) return { ...s, frame: scaleFrame(s.frame, 0.85) };
  return null;
};

export const MAX_SMART_ATTEMPTS = 6;
