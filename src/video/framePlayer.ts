/**
 * Leitura SEQUENCIAL de quadros para a reprodução do preview.
 *
 * Pedir um quadro avulso (getCanvas) a cada tick obriga o decodificador a voltar ao último
 * quadro-chave e decodificar até o instante pedido, o que em vídeo de jogo (GOP longo) leva
 * mais que a duração de um quadro. Aqui cada fonte tem um iterador que só avança: o custo
 * por quadro é o de decodificar um quadro.
 *
 * Arquitetura blindada contra concorrência:
 * - Fila de promessas estrita por chave (elimina thundering herd e corridas assíncronas);
 * - Guard de descarte (isDisposed + epoch) para evitar ressurreição pós-dispose;
 * - Limite de catch-up (máx 8 quadros) e JUMP de 0.35s para evitar congelamento da main thread;
 * - Teardown limpo e seguro de iteradores antigos via it.return();
 * - Prune de geradores inativos para manter decodificadores hardware dentro dos limites do navegador.
 */
import type { CanvasSink } from 'mediabunny';
import type { Drawable } from './compositor';

interface W { canvas: unknown; timestamp: number }
interface State {
  it: AsyncGenerator<W, void, unknown>;
  cur: W | null;
  nxt: W | null;
}

export class FramePlayer {
  private st = new Map<string, State>();
  private queues = new Map<string, Promise<unknown>>();
  private isDisposed = false;
  private epoch = 0;

  /** Se o instante pedido passar disto além do quadro seguinte, reabre o iterador (salto/seek). */
  private static readonly JUMP = 0.35;
  /** Número máximo de quadros a decodificar sequencialmente em um tick antes de forçar re-seek direto. */
  private static readonly MAX_CATCHUP_FRAMES = 8;

  async frameAt(key: string, sink: CanvasSink | null | undefined, s: number): Promise<Drawable | null> {
    if (this.isDisposed || !sink) return null;

    const myEpoch = this.epoch;
    const prev = this.queues.get(key) ?? Promise.resolve();

    const currentTask: Promise<Drawable | null> = prev.catch(() => {}).then(async () => {
      if (this.isDisposed || myEpoch !== this.epoch) return null;
      return this.step(key, sink, s, myEpoch);
    });

    this.queues.set(key, currentTask);
    return currentTask;
  }

  private async step(key: string, sink: CanvasSink, s: number, currentEpoch: number): Promise<Drawable | null> {
    let g = this.st.get(key);
    const ahead = g ? (g.nxt ?? g.cur)?.timestamp ?? -1 : -1;
    const shouldReset = !g || !g.cur || s < g.cur.timestamp - 0.001 || s > ahead + FramePlayer.JUMP;

    try {
      if (shouldReset) {
        if (g?.it) {
          try { await g.it.return(undefined); } catch { /* ignore */ }
        }
        if (this.isDisposed || currentEpoch !== this.epoch) return null;

        const it = sink.canvases(Math.max(0, s)) as AsyncGenerator<W, void, unknown>;
        const curRes = await it.next();
        const cur = curRes?.value ?? null;
        if (this.isDisposed || currentEpoch !== this.epoch) {
          try { await it.return(undefined); } catch { /* ignore */ }
          return null;
        }

        const nxtRes = cur ? await it.next() : null;
        const nxt = nxtRes?.value ?? null;
        if (this.isDisposed || currentEpoch !== this.epoch) {
          try { await it.return(undefined); } catch { /* ignore */ }
          return null;
        }

        g = { it, cur, nxt };
        this.st.set(key, g);
      }

      let catchUpCount = 0;
      while (g && g.nxt && g.nxt.timestamp <= s) {
        if (g.cur && g.nxt.timestamp <= g.cur.timestamp) {
          // O gerador não está avançando no tempo (timestamps duplicados ou congelados)
          break;
        }
        catchUpCount++;
        if (catchUpCount > FramePlayer.MAX_CATCHUP_FRAMES) {
          // Salto excessivo detectado no meio da reprodução: aborta iteração e reabre direto
          try { await g.it.return(undefined); } catch { /* ignore */ }
          if (this.isDisposed || currentEpoch !== this.epoch) return null;

          const it = sink.canvases(Math.max(0, s)) as AsyncGenerator<W, void, unknown>;
          const curRes = await it.next();
          const cur = curRes?.value ?? null;
          if (this.isDisposed || currentEpoch !== this.epoch) {
            try { await it.return(undefined); } catch { /* ignore */ }
            return null;
          }

          const nxtRes = cur ? await it.next() : null;
          const nxt = nxtRes?.value ?? null;
          if (this.isDisposed || currentEpoch !== this.epoch) {
            try { await it.return(undefined); } catch { /* ignore */ }
            return null;
          }

          g = { it, cur, nxt };
          this.st.set(key, g);
          break;
        }

        g.cur = g.nxt;
        const nxtRes = await g.it.next();
        g.nxt = nxtRes?.value ?? null;
        if (this.isDisposed || currentEpoch !== this.epoch) return null;
      }
    } catch {
      // Falha de decodificação pontual: limpa o estado corrompido para regenerar no próximo tick
      if (g?.it) {
        try { await g.it.return(undefined); } catch { /* ignore */ }
      }
      this.st.delete(key);
      return null;
    }

    if (this.isDisposed || currentEpoch !== this.epoch) return null;
    const finalState = this.st.get(key);
    return (finalState?.cur?.canvas as Drawable) ?? null;
  }

  /**
   * Encerra e remove iteradores de clipes que já saíram da janela de exibição atual,
   * prevenindo o esgotamento de decodificadores WebCodecs no navegador.
   */
  prune(activeKeys: Set<string>): void {
    if (this.isDisposed) return;
    for (const [key, g] of this.st.entries()) {
      if (!activeKeys.has(key)) {
        if (g.it) {
          void g.it.return(undefined).catch(() => { /* já encerrado */ });
        }
        this.st.delete(key);
        this.queues.delete(key);
      }
    }
  }

  dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    this.epoch++;

    for (const g of this.st.values()) {
      if (g.it) {
        void g.it.return(undefined).catch(() => { /* já encerrado */ });
      }
    }
    this.st.clear();
    this.queues.clear();
  }
}
