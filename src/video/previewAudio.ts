/**
 * Haze Video Studio: áudio do preview e relógio mestre de reprodução.
 * 
 * O relógio mestre prioriza o hardware de áudio (`AudioContext.currentTime`)
 * com fallback transparente para monotonic wall-clock (`performance.now()`)
 * quando a timeline não possui áudio, autoplay está suspenso ou Web Audio está indisponível.
 *
 * M2: Reutilização persistente de AudioContext compartilhado para não esgotar recursos de hardware
 * e inicialização síncrona de baseT eliminando qualquer glitch para 0:00.
 */
import { audioItems, speedOf, totalDuration, Timeline } from './timeline';
import type { OpenedMedia } from './mediaIO';

export class PreviewAudio {
  // Contexto reutilizado para prevenir estafa de hardware (limite de 6 AudioContexts no Chromium)
  private static sharedCtx: AudioContext | null = null;

  private ctx: AudioContext | null = null;
  private baseCtx = 0;
  private baseT = 0;
  private startWallTime = 0;
  private stopped = true;
  private useWallClock = false;
  private runId = 0;
  private nodes = new Set<AudioBufferSourceNode>();
  private activeGains = new Set<GainNode>();

  /** Quantos buffers já foram agendados (para teste/diagnóstico). */
  scheduled = 0;

  /** Obtém ou cria contexto de áudio reutilizável. */
  private getOrCreateContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!PreviewAudio.sharedCtx || PreviewAudio.sharedCtx.state === 'closed') {
      try {
        PreviewAudio.sharedCtx = new AudioCtx();
      } catch {
        return null;
      }
    }
    return PreviewAudio.sharedCtx;
  }

  /**
   * Posição atual na timeline (s).
   * Monotônica, garantida contra recuo para 0:00 e imune a stalls de autoplay.
   */
  time(): number {
    if (this.stopped) {
      return this.baseT;
    }

    // Se o AudioContext está ativo e sincronizado, usa o relógio do hardware
    if (!this.useWallClock && this.ctx && this.ctx.state === 'running' && this.baseCtx > 0) {
      const elapsed = this.ctx.currentTime - this.baseCtx;
      // Garante que o tempo nunca recua antes de baseT durante a folga de agendamento (lead time)
      return this.baseT + Math.max(0, elapsed);
    }

    // Fallback monotônico via wall-clock (performance.now)
    const wallElapsed = (performance.now() / 1000) - this.startWallTime;
    return this.baseT + Math.max(0, wallElapsed);
  }

  /**
   * Inicia a reprodução a partir de fromT.
   * Inicialização 100% síncrona de baseT e startWallTime para eliminar qualquer glitch no 1º frame do RAF.
   */
  async start(tl: Timeline, media: Map<string, OpenedMedia>, fromT: number): Promise<void> {
    // Para qualquer reprodução anterior
    this.stop();
    const currentRun = ++this.runId;
    this.stopped = false;
    this.scheduled = 0;

    // SÍNCRONO: Ancoragem imediata para que qualquer chamada a time() no mesmo tick retorne fromT
    this.baseT = fromT;
    this.baseCtx = 0;
    this.startWallTime = performance.now() / 1000;
    this.useWallClock = false;

    const ctx = this.getOrCreateContext();
    this.ctx = ctx;

    if (!ctx) {
      this.useWallClock = true;
      return;
    }

    // Se o contexto estiver suspenso (ex: política de autoplay do navegador), tenta reativar
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {
        // Autoplay bloqueado: fallback para wall-clock
        this.useWallClock = true;
      }
    }

    // Se foi interrompido (stop chamado) durante o await, aborta imediatamente
    if (this.stopped || this.runId !== currentRun) {
      return;
    }

    if (ctx.state === 'running') {
      // Calibra a âncora do áudio: 80ms de folga de agendamento para evitar estalos (pops)
      this.baseCtx = ctx.currentTime + 0.08;
      // Re-ancora o wall-clock para sincronia fina
      this.startWallTime = performance.now() / 1000;
      void this.pump(tl, media, fromT, currentRun);
    } else {
      this.useWallClock = true;
    }
  }

  private async pump(tl: Timeline, media: Map<string, OpenedMedia>, fromT: number, runId: number): Promise<void> {
    const ctx = this.ctx;
    if (!ctx || this.stopped || this.runId !== runId) return;

    for (const p of audioItems(tl)) {
      if (this.stopped || this.runId !== runId) return;
      if (p.end <= fromT) continue;
      const sink = media.get(p.clip.mediaId)?.audio;
      if (!sink || p.clip.volume <= 0) continue;

      const { inPoint, outPoint, volume } = p.clip;
      const sp = speedOf(p.clip);
      const srcFrom = inPoint + Math.max(0, fromT - p.start) * sp;

      let cg: GainNode;
      try {
        cg = ctx.createGain();
        cg.connect(ctx.destination);
        this.activeGains.add(cg);
      } catch {
        // Contexto pode ter sido fechado ou falhado
        return;
      }

      const tIn = this.baseCtx + (p.start - this.baseT);
      const tOut = this.baseCtx + (p.end - this.baseT);

      // Web Audio: valores de tempo no passado são travados em ctx.currentTime
      const safeIn = Math.max(ctx.currentTime, tIn);
      const safeOut = Math.max(ctx.currentTime, tOut);

      try {
        if (p.audioFadeIn > 0 && tIn + p.audioFadeIn > safeIn) {
          cg.gain.setValueAtTime(0, safeIn);
          cg.gain.linearRampToValueAtTime(volume, tIn + p.audioFadeIn);
        } else {
          cg.gain.setValueAtTime(volume, safeIn);
        }
        if (p.audioFadeOut > 0 && tOut > safeOut) {
          const fadeStart = Math.max(safeOut, tOut - p.audioFadeOut);
          cg.gain.setValueAtTime(volume, fadeStart);
          cg.gain.linearRampToValueAtTime(0, tOut);
        }
      } catch {
        // Fallback defensivo para setValueAtTime
      }

      try {
        for await (const { buffer, timestamp } of sink.buffers(srcFrom, outPoint)) {
          if (this.stopped || this.runId !== runId) return;
          const from = Math.max(timestamp, srcFrom);
          const to = Math.min(timestamp + buffer.duration, outPoint);
          if (to - from <= 0) continue;

          const tt = p.start + (from - inPoint) / sp;
          const when = this.baseCtx + (tt - this.baseT);

          // Limite de lookahead de 6 segundos para controle de memória
          while (!this.stopped && this.runId === runId && when - ctx.currentTime > 6) {
            await new Promise(r => setTimeout(r, 100));
          }
          if (this.stopped || this.runId !== runId) return;

          const node = ctx.createBufferSource();
          node.buffer = buffer;
          node.playbackRate.value = sp;
          node.connect(cg);

          const startAt = Math.max(when, ctx.currentTime);
          const skip = Math.max(0, (startAt - when) * sp);
          const dur = to - from - skip;
          if (dur <= 0) continue; // Evita RangeError em durações não positivas

          node.start(startAt, from - timestamp + skip, dur);
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
    this.runId++;

    this.nodes.forEach(n => {
      try { n.stop(); } catch { /* já parou */ }
      try { n.disconnect(); } catch { /* já desconectado */ }
    });
    this.nodes.clear();

    this.activeGains.forEach(g => {
      try { g.disconnect(); } catch { /* já desconectado */ }
    });
    this.activeGains.clear();

    // Reuso de AudioContext: não fecha nem nulifica this.ctx aqui
    this.baseT = t;
    this.baseCtx = 0;
    return t;
  }

  /** Libera recursos permanentemente ao desmontar a visualização. */
  dispose(): void {
    this.stop();
  }

  /** Para o relógio no fim da montagem. */
  ended(tl: Timeline): boolean {
    return this.time() >= totalDuration(tl);
  }
}
