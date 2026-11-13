/**
 * Haze Video Studio (F1/M2): áudio do preview. O relógio de reprodução É o relógio do áudio
 * (`AudioContext.currentTime`), então imagem e som não se afastam por construção.
 * Agenda os buffers decodificados um pouco à frente, clipe por clipe, com o volume de cada um.
 *
 * M2: Reutilização persistente de AudioContext compartilhado para não esgotar recursos de hardware
 * e relógio mestre monotônico de áudio prevenindo jitter e saltos para 0:00.
 */
import { audioItems, speedOf, totalDuration, Timeline } from './timeline';
import type { OpenedMedia } from './mediaIO';

export class PreviewAudio {
  // AudioContext estático compartilhado - reutilizado para evitar exaustão de canais no navegador
  private static sharedCtx: AudioContext | null = null;

  private static getSharedContext(): AudioContext {
    if (!PreviewAudio.sharedCtx || PreviewAudio.sharedCtx.state === 'closed') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      PreviewAudio.sharedCtx = new AudioCtx();
    }
    return PreviewAudio.sharedCtx;
  }

  private ctx: AudioContext | null = null;
  private baseCtx = 0;
  private baseT = 0;
  private stopped = false;
  private isPlaying = false;
  private nodes = new Set<AudioBufferSourceNode>();
  private gainNodes = new Set<GainNode>();
  /** Quantos buffers já foram agendados (para teste/diagnóstico). */
  scheduled = 0;

  /** Posição atual na timeline (s) com garantia monotônica sem recuo para 0. */
  time(): number {
    if (!this.ctx || !this.isPlaying) return this.baseT;
    const elapsed = this.ctx.currentTime - this.baseCtx;
    return this.baseT + Math.max(0, elapsed);
  }

  async start(tl: Timeline, media: Map<string, OpenedMedia>, fromT: number): Promise<void> {
    this.stop();
    this.stopped = false;
    this.isPlaying = true;
    this.scheduled = 0;

    const ctx = PreviewAudio.getSharedContext();
    this.ctx = ctx;

    if (ctx.state === 'suspended') {
      await ctx.resume().catch(() => {});
    }

    this.baseT = fromT;
    // Captura baseCtx com folga de segurança após o resume estar pronto
    this.baseCtx = ctx.currentTime + 0.08;

    void this.pump(tl, media, fromT);
  }

  private async pump(tl: Timeline, media: Map<string, OpenedMedia>, fromT: number): Promise<void> {
    const ctx = this.ctx;
    if (!ctx) return;

    for (const p of audioItems(tl)) {
      if (p.end <= fromT) continue;
      const sink = media.get(p.clip.mediaId)?.audio;
      if (!sink || p.clip.volume <= 0) continue;
      const { inPoint, outPoint, volume } = p.clip;
      const sp = speedOf(p.clip);
      const srcFrom = inPoint + Math.max(0, fromT - p.start) * sp;

      // um ganho por clipe: volume + entrada/saída gradual + fusão da transição (rampas de áudio efetivas)
      const cg = ctx.createGain();
      cg.connect(ctx.destination);
      this.gainNodes.add(cg);

      const tIn = this.baseCtx + (p.start - this.baseT);
      const tOut = this.baseCtx + (p.end - this.baseT);

      if (p.audioFadeIn > 0) {
        cg.gain.setValueAtTime(0, tIn);
        cg.gain.linearRampToValueAtTime(volume, tIn + p.audioFadeIn);
      } else {
        cg.gain.setValueAtTime(volume, tIn);
      }

      if (p.audioFadeOut > 0) {
        cg.gain.setValueAtTime(volume, tOut - p.audioFadeOut);
        cg.gain.linearRampToValueAtTime(0, tOut);
      }

      try {
        for await (const { buffer, timestamp } of sink.buffers(srcFrom, outPoint)) {
          if (this.stopped) return;
          const from = Math.max(timestamp, srcFrom);
          const to = Math.min(timestamp + buffer.duration, outPoint);
          if (to - from <= 0) continue;
          const tt = p.start + (from - inPoint) / sp;             // quando começa na timeline
          const when = this.baseCtx + (tt - this.baseT);
          // não deixa o decodificador ficar muito à frente (memória) nem agenda no passado
          while (!this.stopped && when - ctx.currentTime > 6) {
            await new Promise(r => setTimeout(r, 100));
          }
          if (this.stopped) return;

          const node = ctx.createBufferSource();
          node.buffer = buffer;
          node.playbackRate.value = sp;                           // velocidade (muda o tom, igual à exportação)
          node.connect(cg);

          const startAt = Math.max(when, ctx.currentTime);
          const skip = Math.max(0, (startAt - when) * sp);        // se atrasou, pula o início (em tempo da mídia)
          node.start(startAt, from - timestamp + skip, to - from - skip);

          node.onended = () => {
            this.nodes.delete(node);
            try { node.disconnect(); } catch {}
          };
          this.nodes.add(node);
          this.scheduled++;
        }
      } catch {
        /* mídia sem áudio legível: segue em silêncio */
      }
    }
  }

  stop(): number {
    const t = this.time();
    this.stopped = true;
    this.isPlaying = false;

    this.nodes.forEach(n => {
      try {
        n.stop();
        n.disconnect();
      } catch { /* já parou */ }
    });
    this.nodes.clear();

    this.gainNodes.forEach(g => {
      try { g.disconnect(); } catch {}
    });
    this.gainNodes.clear();

    // Mantém o contexto vivo para reutilização, apenas suspendendo se necessário
    this.baseT = t;
    return t;
  }

  /** Para o relógio no fim da montagem. */
  ended(tl: Timeline): boolean {
    return this.time() >= totalDuration(tl);
  }
}
