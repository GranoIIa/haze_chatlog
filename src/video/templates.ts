/**
 * Haze Video Studio (F4): modelos de montagem e presets de destino. Tudo puro (sem DOM).
 * Um modelo NÃO é um vídeo pronto: é um esqueleto (ordem das cenas, transições, presets de câmera,
 * textos de exemplo). Ao aplicar, vira uma timeline comum, 100% editável e desfazível; os textos
 * entram com o conteúdo de exemplo entre colchetes para o jogador trocar.
 */
import {
  addClip, addOverlay, emptyTimeline, layout, makeId, round3, setClipCamera, setClipFades, setClipTransition, setLineStep,
  totalDuration, trimClip, MIN_CLIP, MediaRef, Timeline, ClipCamera
} from './timeline';

export interface TemplateSlot {
  id: string;
  label: string;
  hint: string;
  /** Pelo menos uma cena marcada como obrigatória precisa de mídia. */
  required?: boolean;
  camera?: ClipCamera['preset'];
  /** Usa só o começo da mídia (s). Bom para cortes rápidos de trailer. */
  maxSeconds?: number;
}

export interface TemplateText {
  kind: 'text' | 'chat';
  text: string;
  /** Ancorado numa cena: `from: 'start'` conta do início dela, `'end'` conta do fim (offset negativo = antes do fim). */
  slot?: string; from?: 'start' | 'end'; offset: number;
  duration: number;
  x?: number; y?: number; fontSize?: number; color?: string; align?: 'left' | 'center';
  /** Só para chat: segundos entre uma linha e a próxima. */
  lineStep?: number;
}

export interface TemplateDef {
  id: string;
  name: string;
  description: string;
  slots: TemplateSlot[];
  /** Fusão entre cenas (s); 0 = corte seco. */
  transition: number;
  fadeIn: number; fadeOut: number;
  texts: TemplateText[];
}

const TITLE = { kind: 'text' as const, align: 'center' as const, x: 0, fontSize: 44, color: '#ffffff' };
const LOWER = { kind: 'text' as const, align: 'left' as const, x: 40, fontSize: 28 };

export const TEMPLATES: TemplateDef[] = [
  {
    id: 'documentario', name: 'Documentário', description: 'Abertura com título, cenas com fusão e encerramento.',
    slots: [
      { id: 'abertura', label: 'Abertura', hint: 'A cena que abre o filme', required: true },
      { id: 'cena1', label: 'Cena 1', hint: 'Desenvolvimento' },
      { id: 'cena2', label: 'Cena 2', hint: 'Desenvolvimento' },
      { id: 'final', label: 'Encerramento', hint: 'Última cena' }
    ],
    transition: 0.8, fadeIn: 1, fadeOut: 1.2,
    texts: [
      { ...TITLE, text: '[TÍTULO DO DOCUMENTÁRIO]', slot: 'abertura', from: 'start', offset: 0.8, duration: 3.5, y: 300 },
      { ...TITLE, fontSize: 24, text: 'Uma produção de [SEU GRUPO]', slot: 'abertura', from: 'start', offset: 1.4, duration: 2.9, y: 360 },
      { ...TITLE, text: 'FIM', slot: 'final', from: 'end', offset: -3, duration: 2.5, y: 300 }
    ]
  },
  {
    id: 'reportagem', name: 'Reportagem', description: 'Manchete e identificação do repórter sobre as imagens.',
    slots: [
      { id: 'materia', label: 'Matéria', hint: 'Imagens principais', required: true },
      { id: 'entrevista', label: 'Entrevista', hint: 'Fala do entrevistado' },
      { id: 'cidade', label: 'Imagens da cidade', hint: 'Cobertura de apoio' }
    ],
    transition: 0.5, fadeIn: 0, fadeOut: 0.8,
    texts: [
      { ...LOWER, text: '[MANCHETE DA REPORTAGEM]', slot: 'materia', from: 'start', offset: 0.6, duration: 5, y: 600, color: '#ffffff' },
      { ...LOWER, fontSize: 22, text: 'NOTÍCIAS AO VIVO · [CANAL]', slot: 'materia', from: 'start', offset: 0.6, duration: 5, y: 560, color: '#ff4d4d' },
      { ...LOWER, text: '[NOME DO REPÓRTER]', slot: 'entrevista', from: 'start', offset: 0.8, duration: 4, y: 600, color: '#ffffff' }
    ]
  },
  {
    id: 'registro-policial', name: 'Registro policial', description: 'Imagens de bodycam com HUD, relógio e diálogo do chat.',
    slots: [
      { id: 'bodycam1', label: 'Bodycam: cena 1', hint: 'Abordagem ou início da ocorrência', required: true, camera: 'bodycam' },
      { id: 'bodycam2', label: 'Bodycam: cena 2', hint: 'Continuação (opcional)', camera: 'bodycam' },
      { id: 'cctv', label: 'Câmera de segurança', hint: 'Imagem de apoio (opcional)', camera: 'cctv' }
    ],
    transition: 0, fadeIn: 0, fadeOut: 0,
    texts: [
      { kind: 'chat', text: 'Policial diz: Parado! Mãos onde eu possa ver!\nSuspeito diz (baixo): Calma, eu não fiz nada.\n/me levanta as mãos devagar.', slot: 'bodycam1', from: 'start', offset: 1, duration: 9, x: 24, y: 96, fontSize: 22, lineStep: 2.5 }
    ]
  },
  {
    id: 'trailer-personagem', name: 'Trailer de personagem', description: 'Cortes rápidos em tom noir e título final.',
    slots: [
      { id: 'cena1', label: 'Cena 1', hint: 'Impacto inicial', required: true, camera: 'noir', maxSeconds: 4 },
      { id: 'cena2', label: 'Cena 2', hint: 'Personagem em ação', camera: 'noir', maxSeconds: 4 },
      { id: 'cena3', label: 'Cena 3', hint: 'Clímax', camera: 'noir', maxSeconds: 4 }
    ],
    transition: 0.3, fadeIn: 0.8, fadeOut: 1,
    texts: [
      { ...TITLE, text: '[NOME DO PERSONAGEM]', slot: 'cena3', from: 'end', offset: -2.8, duration: 2.4, y: 300, fontSize: 52 },
      { ...TITLE, fontSize: 22, text: '[FRASE DE EFEITO]', slot: 'cena1', from: 'start', offset: 0.8, duration: 2.4, y: 330 }
    ]
  },
  {
    id: 'divulgacao-empresa', name: 'Divulgação de empresa', description: 'Nome do negócio, serviços e contato.',
    slots: [
      { id: 'fachada', label: 'Fachada / apresentação', hint: 'Mostre o local', required: true },
      { id: 'servico', label: 'Serviço ou produto', hint: 'O que vocês oferecem' },
      { id: 'contato', label: 'Contato', hint: 'Fecho do anúncio' }
    ],
    transition: 0.6, fadeIn: 0.6, fadeOut: 0.8,
    texts: [
      { ...TITLE, text: '[NOME DA EMPRESA]', slot: 'fachada', from: 'start', offset: 0.8, duration: 3.5, y: 300, fontSize: 50 },
      { ...LOWER, text: '[SERVIÇOS · PREÇOS]', slot: 'servico', from: 'start', offset: 0.6, duration: 4, y: 600, color: '#ffffff' },
      { ...TITLE, fontSize: 30, text: 'Fale conosco: [CONTATO / ENDEREÇO]', slot: 'contato', from: 'end', offset: -4, duration: 3.5, y: 560 }
    ]
  },
  {
    id: 'cena-faccao', name: 'Cena de facção', description: 'Cenas com chat narrando o encontro, em tom noir.',
    slots: [
      { id: 'cena1', label: 'Cena 1', hint: 'Encontro', required: true, camera: 'noir' },
      { id: 'cena2', label: 'Cena 2', hint: 'Conversa', camera: 'noir' },
      { id: 'cena3', label: 'Cena 3', hint: 'Desfecho', camera: 'noir' }
    ],
    transition: 0.5, fadeIn: 0.8, fadeOut: 1,
    texts: [
      { kind: 'chat', text: '[Nome 1] diz: Precisamos conversar.\n/me retira o celular do bolso.\n[Nome 2] diz (baixo): Entendi.', slot: 'cena1', from: 'start', offset: 1.2, duration: 8, x: 24, y: 24, fontSize: 22, lineStep: 2.5 }
    ]
  },
  {
    id: 'entrevista', name: 'Entrevista', description: 'Entrevista com identificação do convidado.',
    slots: [
      { id: 'entrevista', label: 'Entrevista', hint: 'Gravação principal', required: true },
      { id: 'corte', label: 'Imagens de apoio', hint: 'Cortes para cobrir a fala' }
    ],
    transition: 0.4, fadeIn: 0.6, fadeOut: 0.8,
    texts: [
      { ...LOWER, text: '[NOME DO ENTREVISTADO]', slot: 'entrevista', from: 'start', offset: 1, duration: 4.5, y: 590, color: '#ffffff' },
      { ...LOWER, fontSize: 22, text: '[CARGO / ORGANIZAÇÃO]', slot: 'entrevista', from: 'start', offset: 1, duration: 4.5, y: 630, color: '#d0d0d0' }
    ]
  }
];

export const findTemplate = (id: string): TemplateDef | undefined => TEMPLATES.find(t => t.id === id);

export interface ApplyResult {
  timeline: Timeline;
  /** Cenas que receberam mídia, na ordem. */
  used: string[];
  /** Cenas sem mídia (puladas). */
  skipped: string[];
  /** Textos que não puderam ser posicionados (cena âncora sem mídia e sem clipe de reserva). */
  errors: string[];
}

/**
 * Monta a timeline do modelo com as mídias escolhidas (uma por cena; cenas vazias são puladas).
 * Retorna `errors` se nenhuma cena obrigatória recebeu mídia.
 */
export function applyTemplate(
  def: TemplateDef, picks: Record<string, MediaRef | undefined>, now: { date: string; time: string }
): ApplyResult {
  let tl = emptyTimeline();
  const used: string[] = [], skipped: string[] = [], errors: string[] = [];
  const clipOfSlot = new Map<string, string>();
  for (const slot of def.slots) {
    const m = picks[slot.id];
    if (!m) { skipped.push(slot.id); continue; }
    const id = makeId('clip');
    tl = addClip(tl, m, id);
    if (slot.maxSeconds && slot.maxSeconds < m.duration) tl = trimClip(tl, id, { outPoint: slot.maxSeconds }, m.duration);
    if (slot.camera) tl = setClipCamera(tl, id, slot.camera, now);
    clipOfSlot.set(slot.id, id); used.push(slot.id);
  }
  const required = def.slots.filter(s => s.required);
  if (required.length && !required.some(s => used.includes(s.id))) {
    errors.push('Escolha um vídeo para ' + required.map(s => `"${s.label}"`).join(' ou ') + '.');
    return { timeline: emptyTimeline(), used: [], skipped: def.slots.map(s => s.id), errors };
  }
  if (!tl.clips.length) { errors.push('Nenhuma cena recebeu vídeo.'); return { timeline: tl, used, skipped, errors }; }

  if (def.transition > 0) for (let i = 1; i < tl.clips.length; i++) tl = setClipTransition(tl, tl.clips[i].id, def.transition);
  if (def.fadeIn > 0) tl = setClipFades(tl, tl.clips[0].id, { fadeIn: def.fadeIn });
  if (def.fadeOut > 0) tl = setClipFades(tl, tl.clips[tl.clips.length - 1].id, { fadeOut: def.fadeOut });

  const placed = layout(tl);
  const total = totalDuration(tl);
  for (const tx of def.texts) {
    // cena âncora ausente: usa a primeira (início) ou a última (fim) cena que existe
    const anchorId = (tx.slot && clipOfSlot.get(tx.slot)) || (tx.from === 'end' ? tl.clips[tl.clips.length - 1].id : tl.clips[0].id);
    const p = placed.find(q => q.clip.id === anchorId);
    if (!p) { errors.push(`Não foi possível posicionar o texto "${tx.text.slice(0, 20)}".`); continue; }
    let start = tx.from === 'end' ? p.end + tx.offset : p.start + tx.offset;
    start = Math.max(0, Math.min(start, Math.max(0, total - MIN_CLIP)));
    const duration = Math.max(MIN_CLIP, Math.min(tx.duration, total - start));
    const oid = makeId('txt');
    tl = addOverlay(tl, {
      text: tx.text, start: round3(start), duration: round3(duration), x: tx.x, y: tx.y, fontSize: tx.fontSize,
      ...(tx.kind === 'text' ? { kind: 'text' as const, color: tx.color, align: tx.align } : {})
    }, oid);
    if (tx.kind === 'chat' && tx.lineStep && tx.lineStep > 0) {
      // com mídia curta as falas se apertam para caberem todas (mínimo de 0,5 s entre elas)
      const n = tx.text.split(String.fromCharCode(10)).filter(l => l.trim()).length;
      const room = duration - 1;
      const step = n > 1 && (n - 1) * tx.lineStep > room ? Math.max(0.5, room / (n - 1)) : tx.lineStep;
      tl = setLineStep(tl, oid, step);
    }
  }
  return { timeline: tl, used, skipped, errors };
}

// ---------------------------------------------------------------- presets de destino

export interface ExportPreset {
  id: string;
  label: string;
  note: string;
  width: number; height: number; fps: number;
  /** Tamanho máximo desejado do arquivo (bytes); ausente = qualidade máxima, sem limite. */
  targetBytes?: number;
}

const MB = 1024 * 1024;
export const EXPORT_PRESETS: ExportPreset[] = [
  { id: 'discord', label: 'Discord / chat (até 10 MB)', note: '854×480, 24 fps. Os limites de cada plataforma mudam: confira o seu.', width: 854, height: 480, fps: 24, targetBytes: 10 * MB },
  { id: 'forum', label: 'Fórum / leve (até 25 MB)', note: '1280×720, 30 fps.', width: 1280, height: 720, fps: 30, targetBytes: 25 * MB },
  { id: 'hq', label: 'Alta qualidade (1080p, sem limite de tamanho)', note: '1920×1080, 30 fps.', width: 1920, height: 1080, fps: 30 }
];
export const findExportPreset = (id: string): ExportPreset | undefined => EXPORT_PRESETS.find(p => p.id === id);

export const TARGET_AUDIO_BPS = 96_000;
export const MIN_VIDEO_BPS = 150_000;

/**
 * Bitrate de vídeo para caber em `targetBytes`: 90% do orçamento (margem para o contêiner e para o
 * encoder passar um pouco), menos o áudio. `ok = false` quando o vídeo é longo demais para o tamanho.
 */
export function bitrateFor(targetBytes: number, seconds: number): { videoBps: number; ok: boolean; message?: string } {
  if (!(seconds > 0) || !(targetBytes > 0)) return { videoBps: MIN_VIDEO_BPS, ok: false, message: 'Duração ou tamanho inválidos.' };
  const raw = Math.floor((targetBytes * 8 * 0.9) / seconds - TARGET_AUDIO_BPS);
  if (raw < MIN_VIDEO_BPS) {
    return { videoBps: MIN_VIDEO_BPS, ok: false, message: 'O vídeo é longo demais para esse tamanho: reduza a duração ou escolha outro destino.' };
  }
  return { videoBps: raw, ok: true };
}
