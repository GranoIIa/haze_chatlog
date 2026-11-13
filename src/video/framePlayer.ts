/**
 * Leitura SEQUENCIAL de quadros para a reprodução do preview.
 *
 * Pedir um quadro avulso (getCanvas) a cada tick obriga o decodificador a voltar ao último
 * quadro-chave e decodificar até o instante pedido, o que em vídeo de jogo (GOP longo) leva
 * mais que a duração de um quadro. Aqui cada fonte tem um iterador que só avança: o custo
 * por quadro é o de decodificar um quadro.
 */
import type { CanvasSink } from 'mediabunny';
import type { Drawable } from './compositor';

interface W { canvas: unknown; timestamp: number }
interface State { it: AsyncGenerator<W, void, unknown>; cur: W | null; nxt: W | null }

export class FramePlayer {
  private st = new Map<string, State>();
  /** Se o instante pedido passar disto além do quadro seguinte, reabre o iterador (salto/seek). */
  private static readonly JUMP = 1.5;

  async frameAt(key: string, sink: CanvasSink | null | undefined, s: number): Promise<Drawable | null> {
    if (!sink) return null;
    let g = this.st.get(key);
    const ahead = g ? (g.nxt ?? g.cur)?.timestamp ?? -1 : -1;
    if (!g || !g.cur || s < g.cur.timestamp - 0.001 || s > ahead + FramePlayer.JUMP) {
      if (g) void g.it.return(undefined).catch(() => { /* já encerrado */ });
      const it = sink.canvases(Math.max(0, s)) as AsyncGenerator<W, void, unknown>;
      const cur = (await it.next()).value ?? null;
      const nxt = cur ? ((await it.next()).value ?? null) : null;
      g = { it, cur, nxt };
      this.st.set(key, g);
    }
    while (g.nxt && g.nxt.timestamp <= s) {
      g.cur = g.nxt;
      g.nxt = (await g.it.next()).value ?? null;
    }
    return (g.cur?.canvas as Drawable) ?? null;
  }

  dispose(): void {
    for (const g of this.st.values()) void g.it.return(undefined).catch(() => { /* já encerrado */ });
    this.st.clear();
  }
}
