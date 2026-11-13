/**
 * Haze Video Studio (F1): áudio do preview. O relógio de reprodução É o relógio do áudio
 * (`AudioContext.currentTime`), então imagem e som não se afastam por construção.
 * Agenda os buffers decodificados um pouco à frente, clipe por clipe, com o volume de cada um.
 */
import { layout, totalDuration, Timeline } from './timeline';
import type { OpenedMedia } from './mediaIO';

export class PreviewAudio {
  private ctx: AudioContext | null = null;
  private baseCtx = 0;
  private baseT = 0;
  private stopped = false;
  private nodes = new Set<AudioBufferSourceNode>();
  /** Quantos buffers já foram agendados (para teste/diagnóstico). */
  scheduled = 0;

  /** Posição atual na timeline (s). */
  time(): number {
    return this.ctx ? this.baseT + (this.ctx.currentTime - this.baseCtx) : this.baseT;
  }

  async start(tl: Timeline, media: Map<string, OpenedMedia>, fromT: number): Promise<void> {
    this.stop();
    this.stopped = false;
    this.scheduled = 0;
    const ctx = new AudioContext();
    this.ctx = ctx;
    if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
    this.baseT = fromT;
    this.baseCtx = ctx.currentTime + 0.08; // pequena folga para agendar o primeiro buffer
    void this.pump(tl, media, fromT);
  }

  private async pump(tl: Timeline, media: Map<string, OpenedMedia>, fromT: number): Promise<void> {
    const ctx = this.ctx!;
    for (const p of layout(tl)) {
      if (p.end <= fromT) continue;
      const sink = media.get(p.clip.mediaId)?.audio;
      if (!sink || p.clip.volume <= 0) continue;
      const { inPoint, outPoint, volume } = p.clip;
      const srcFrom = inPoint + Math.max(0, fromT - p.start);
      try {
        for await (const { buffer, timestamp } of sink.buffers(srcFrom, outPoint)) {
          if (this.stopped) return;
          const from = Math.max(timestamp, srcFrom);
          const to = Math.min(timestamp + buffer.duration, outPoint);
          if (to - from <= 0) continue;
          const tt = p.start + (from - inPoint);                  // quando começa na timeline
          const when = this.baseCtx + (tt - this.baseT);
          // não deixa o decodificador ficar muito à frente (memória) nem agenda no passado
          while (!this.stopped && when - ctx.currentTime > 3) await new Promise(r => setTimeout(r, 100));
          if (this.stopped) return;
          const node = ctx.createBufferSource();
          node.buffer = buffer;
          const g = ctx.createGain(); g.gain.value = volume;
          node.connect(g).connect(ctx.destination);
          const startAt = Math.max(when, ctx.currentTime);
          const skip = Math.max(0, startAt - when);                // se atrasou, pula o início
          node.start(startAt, from - timestamp + skip, to - from - skip);
          node.onended = () => this.nodes.delete(node);
          this.nodes.add(node);
          this.scheduled++;
        }
      } catch { /* mídia sem áudio legível: segue em silêncio */ }
    }
  }

  stop(): number {
    const t = this.time();
    this.stopped = true;
    this.nodes.forEach(n => { try { n.stop(); } catch { /* já parou */ } });
    this.nodes.clear();
    if (this.ctx) { void this.ctx.close().catch(() => {}); this.ctx = null; }
    this.baseT = t;
    return t;
  }

  /** Para o relógio no fim da montagem. */
  ended(tl: Timeline): boolean { return this.time() >= totalDuration(tl); }
}
