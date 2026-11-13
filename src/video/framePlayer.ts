/**
 * Leitura SEQUENCIAL de quadros para a reprodução do preview.
 *
 * Pedir um quadro avulso (getCanvas) a cada tick obriga o decodificador a voltar ao último
 * quadro-chave e decodificar até o instante pedido, o que em vídeo de jogo (GOP longo) leva
 * mais que a duração de um quadro. Aqui cada fonte tem um iterador que só avança: o custo
 * por quadro é o de decodificar um quadro.
 *
 * Adicionado lock/serialização por chave (stream) para evitar que chamadas concorrentes
 * de ticks ou seeks rápidos acionem sink.canvases() simultaneamente.
 */
import type { CanvasSink } from 'mediabunny';
import type { Drawable } from './compositor';

interface W { canvas: unknown; timestamp: number }
interface State {
  it: AsyncGenerator<W, void, unknown>;
  cur: W | null;
  nxt: W | null;
  pendingOp: Promise<void> | null;
}

export class FramePlayer {
  private st = new Map<string, State>();
  /** Se o instante pedido passar disto além do quadro seguinte, reabre o iterador (salto/seek). */
  private static readonly JUMP = 1.5;

  async frameAt(key: string, sink: CanvasSink | null | undefined, s: number): Promise<Drawable | null> {
    if (!sink) return null;

    let g = this.st.get(key);

    // Serialização: aguarda a operação anterior da mesma stream concluir para evitar acesso concorrente ao sink
    while (g?.pendingOp) {
      await g.pendingOp.catch(() => {});
      g = this.st.get(key);
    }

    const ahead = g ? (g.nxt ?? g.cur)?.timestamp ?? -1 : -1;
    const shouldReset = !g || !g.cur || s < g.cur.timestamp - 0.001 || s > ahead + FramePlayer.JUMP;

    let resolveOp!: () => void;
    const opPromise = new Promise<void>(resolve => { resolveOp = resolve; });

    if (g) {
      g.pendingOp = opPromise;
    } else {
      this.st.set(key, { it: null as any, cur: null, nxt: null, pendingOp: opPromise });
    }

    try {
      if (shouldReset) {
        if (g?.it) {
          void g.it.return(undefined).catch(() => { /* já encerrado */ });
        }
        const it = sink.canvases(Math.max(0, s)) as AsyncGenerator<W, void, unknown>;
        const cur = (await it.next()).value ?? null;
        const nxt = cur ? ((await it.next()).value ?? null) : null;
        g = { it, cur, nxt, pendingOp: opPromise };
        this.st.set(key, g);
      }

      while (g && g.nxt && g.nxt.timestamp <= s) {
        g.cur = g.nxt;
        g.nxt = (await g.it.next()).value ?? null;
      }
    } finally {
      const curState = this.st.get(key);
      if (curState && curState.pendingOp === opPromise) {
        curState.pendingOp = null;
      }
      resolveOp();
    }

    const finalState = this.st.get(key);
    return (finalState?.cur?.canvas as Drawable) ?? null;
  }

  dispose(): void {
    for (const g of this.st.values()) {
      if (g.it) void g.it.return(undefined).catch(() => { /* já encerrado */ });
    }
    this.st.clear();
  }
}
