import { useEffect, useState } from 'react';
import { VISUAL_PRESETS } from '../../utils/visualPresets';
import {
  ThumbCache, runThumbJob, renderBase, renderVisualThumb, thumbKey, type ThumbFrame
} from '../../utils/visualThumb';

type Thumbs = Record<string, string>;
export type ThumbStatus = 'none' | 'loading' | 'ready' | 'error';

/** Cache entre trocas Simples ↔ Avançado: só guarda Data URLs pequenas, no máximo 4 conjuntos. */
const cache = new ThumbCache<Thumbs>(4);

/** Telemetria leve (leitura em testes e medições): quantas gerações completas e quanto tempo levaram. */
export interface ThumbStats { generations: number; cacheHits: number; lastMs: number; lastFailed: number }
const stats: ThumbStats = { generations: 0, cacheHits: 0, lastMs: 0, lastFailed: 0 };
if (typeof window !== 'undefined') (window as unknown as { __hazeThumbStats?: ThumbStats }).__hazeThumbStats = stats;

/**
 * Miniaturas dos visuais para a foto atual. Só depende da foto e do enquadramento (não do texto do chat).
 * O que é devolvido sempre pertence à foto/enquadramento atuais: resultado de outra foto nunca aparece.
 */
export function useVisualThumbs(src: string | null, frame: ThumbFrame): { thumbs: Thumbs; status: ThumbStatus } {
  const key = src ? thumbKey(src, frame) : null;
  const [state, setState] = useState<{ key: string | null; thumbs: Thumbs; status: ThumbStatus }>({ key: null, thumbs: {}, status: 'none' });

  useEffect(() => {
    if (!src || !key) { setState({ key: null, thumbs: {}, status: 'none' }); return; }
    const hit = cache.get(key);
    if (hit) { stats.cacheHits++; setState({ key, thumbs: hit, status: 'ready' }); return; }

    let stale = false;
    setState({ key, thumbs: {}, status: 'loading' });
    const img = new Image();
    img.onerror = () => { if (!stale) setState({ key, thumbs: {}, status: 'error' }); };
    img.onload = () => {
      if (stale) return;
      let base: HTMLCanvasElement;
      try { base = renderBase(img, frame); } catch { setState({ key, thumbs: {}, status: 'error' }); return; }
      const t0 = performance.now();
      const acc: Thumbs = {};
      runThumbJob({
        ids: VISUAL_PRESETS.map(v => v.id),
        render: (id) => renderVisualThumb(base, VISUAL_PRESETS.find(v => v.id === id)!),
        isStale: () => stale,
        onThumb: (id, url) => { acc[id] = url; setState({ key, thumbs: { ...acc }, status: 'loading' }); }
      }).then(r => {
        img.onload = img.onerror = null;
        img.src = ''; // solta a foto grande
        base.width = base.height = 0;
        if (r.cancelled) return;
        stats.generations++;
        stats.lastMs = Math.round(performance.now() - t0);
        stats.lastFailed = r.failed;
        if (r.done > 0) cache.set(key, acc);
        setState({ key, thumbs: { ...acc }, status: r.done > 0 ? 'ready' : 'error' });
      });
    };
    img.src = src;
    return () => { stale = true; img.onload = img.onerror = null; };
    // frame entra pela chave: só muda quando foto/enquadramento mudam
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // nunca devolve miniaturas de outra foto/enquadramento, nem por um quadro
  return state.key === key && key ? { thumbs: state.thumbs, status: state.status } : { thumbs: {}, status: key ? 'loading' : 'none' };
}
