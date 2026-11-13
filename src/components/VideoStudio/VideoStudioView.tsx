import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Timeline as TimelineUI } from '@xzdarcy/react-timeline-editor';
import type { TimelineState } from '@xzdarcy/react-timeline-editor';
import type { TimelineRow, TimelineEffect } from '@xzdarcy/timeline-engine';
import '@xzdarcy/react-timeline-editor/dist/react-timeline-editor.css';
import { Clapperboard, Upload, Scissors, Undo2, Redo2, Play, Pause, Download, Trash2, ChevronLeft, ChevronRight, MessageSquarePlus } from 'lucide-react';
import {
  addClip, addOverlay, clipDuration, commit, createHistory, layout, locate, moveClip, redo, removeClip, removeOverlay,
  setClipVolume, splitAt, totalDuration, trimClip, undo, updateOverlay, makeId, round3, MIN_CLIP, Timeline
} from '../../video/timeline';
import { openMedia, MediaError, OpenedMedia } from '../../video/mediaIO';
import { composeFrame, Drawable } from '../../video/compositor';
import { exportTimeline, ExportCancelled, ExportResult } from '../../video/exporter';

const PREVIEW_W = 640;
const SIZES: Array<[string, number, number]> = [['1280×720', 1280, 720], ['1920×1080', 1920, 1080], ['854×480', 854, 480]];
const EFFECTS: Record<string, TimelineEffect> = { clip: { id: 'clip', name: 'Clipe' }, chat: { id: 'chat', name: 'Chat' } };
const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, '0')}`;

export const VideoStudioView: React.FC = () => {
  const [hist, setHist] = useState(() => createHistory());
  const tl = hist.present;
  const apply = useCallback((f: (t: Timeline) => Timeline) => setHist(h => commit(h, f(h.present))), []);

  const [library, setLibrary] = useState<OpenedMedia[]>([]);
  const mediaRef = useRef(new Map<string, OpenedMedia>());
  const [selected, setSelected] = useState<string | null>(null);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [sizeIdx, setSizeIdx] = useState(0);
  const [fps, setFps] = useState(30);
  const [exp, setExp] = useState<{ phase: string; pct: number } | null>(null);
  const [result, setResult] = useState<{ r: ExportResult; url: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const tlStateRef = useRef<TimelineState>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [chatText, setChatText] = useState('Ramon Mendoza diz: Precisamos conversar.');
  const [chatStart, setChatStart] = useState(0);
  const [chatDur, setChatDur] = useState(3);

  const placed = useMemo(() => layout(tl), [tl]);
  const total = totalDuration(tl);
  const [outW, outH] = [SIZES[sizeIdx][1], SIZES[sizeIdx][2]];
  const previewH = Math.round((PREVIEW_W * outH) / outW / 2) * 2;
  const selClip = tl.clips.find(c => c.id === selected) ?? null;
  const selMedia = selClip ? mediaRef.current.get(selClip.mediaId) : undefined;

  useEffect(() => () => {
    abortRef.current?.abort();
    mediaRef.current.forEach(m => m.dispose());
    mediaRef.current.clear();
  }, []);
  useEffect(() => () => { if (result) URL.revokeObjectURL(result.url); }, [result]);

  // ------------------------------------------------------------ importação
  const onFiles = async (files: FileList | null) => {
    if (!files) return;
    setMessage(null);
    for (const f of Array.from(files)) {
      try {
        const m = await openMedia(f, makeId('media'));
        mediaRef.current.set(m.ref.id, m);
        setLibrary(l => [...l, m]);
      } catch (e) {
        setMessage(e instanceof MediaError ? e.message : `Não foi possível importar "${f.name}".`);
      }
    }
  };

  // ------------------------------------------------------------ preview (mesmo compositor da exportação)
  const drawSeq = useRef(0);
  useEffect(() => {
    const seq = ++drawSeq.current;
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d')!;
    (async () => {
      const hit = locate(tl, t);
      let frame: Drawable | null = null;
      if (hit) {
        const m = mediaRef.current.get(hit.clip.mediaId);
        try { frame = ((await m?.video?.getCanvas(hit.sourceTime))?.canvas as Drawable) ?? null; } catch { frame = null; }
      }
      if (seq !== drawSeq.current) return; // resultado antigo: descarta
      composeFrame(ctx, cv.width, cv.height, frame, tl, t);
    })();
  }, [tl, t, previewH, library]);

  useEffect(() => { tlStateRef.current?.setTime(t); }, [t]);

  // ------------------------------------------------------------ reprodução (preview sem áudio)
  useEffect(() => {
    if (!playing) return;
    let raf = 0; let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000; last = now;
      setT(cur => {
        const n = cur + dt;
        if (n >= total) { setPlaying(false); return total > 0 ? Math.max(0, total - 0.001) : 0; }
        return n;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, total]);

  // ------------------------------------------------------------ timeline (react-timeline-editor)
  const editorData: TimelineRow[] = useMemo(() => [
    {
      id: 'video',
      actions: placed.map(p => ({ id: p.clip.id, start: p.start, end: p.end, effectId: 'clip', flexible: true, movable: true }))
    },
    {
      id: 'chat',
      actions: tl.overlays.map(o => ({ id: o.id, start: o.start, end: o.start + o.duration, effectId: 'chat', flexible: true, movable: true }))
    }
  ], [placed, tl.overlays]);

  const onMoveEnd = ({ action, row, start }: { action: { id: string }; row: { id: string }; start: number }) => {
    if (row.id === 'chat') apply(x => updateOverlay(x, action.id, { start }));
    else {
      // nova ordem = ordenar pelos inícios, com o clipe arrastado na posição solta
      const others = placed.filter(p => p.clip.id !== action.id).map(p => ({ id: p.clip.id, s: p.start }));
      others.push({ id: action.id, s: start - 0.0001 });
      others.sort((a, b) => a.s - b.s);
      apply(x => moveClip(x, action.id, others.findIndex(o => o.id === action.id)));
    }
    return false;
  };
  const onResizeEnd = ({ action, row, start, end, dir }: { action: { id: string }; row: { id: string }; start: number; end: number; dir: string }) => {
    if (row.id === 'chat') apply(x => updateOverlay(x, action.id, { start, duration: end - start }));
    else {
      const p = placed.find(q => q.clip.id === action.id);
      const m = p && mediaRef.current.get(p.clip.mediaId);
      if (p && m) {
        apply(x => dir === 'left'
          ? trimClip(x, action.id, { inPoint: p.clip.inPoint + (start - p.start) }, m.ref.duration)
          : trimClip(x, action.id, { outPoint: p.clip.inPoint + (end - start) }, m.ref.duration));
      }
    }
    return false;
  };

  // ------------------------------------------------------------ exportação
  const startExport = async () => {
    setMessage(null);
    if (result) { URL.revokeObjectURL(result.url); setResult(null); }
    const ac = new AbortController();
    abortRef.current = ac;
    setExp({ phase: 'preparando', pct: 0 });
    try {
      const r = await exportTimeline(tl, mediaRef.current, {
        width: outW, height: outH, fps, signal: ac.signal,
        onProgress: (f, phase) => setExp({ phase, pct: Math.round(f * 100) })
      });
      setResult({ r, url: URL.createObjectURL(r.blob) });
    } catch (e) {
      setMessage(e instanceof ExportCancelled ? 'Exportação cancelada.' : (e as Error).message);
    } finally {
      setExp(null); abortRef.current = null;
    }
  };

  const btn = 'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-haze-border bg-haze-panel text-haze-text hover:bg-haze-raised/40 disabled:opacity-40 disabled:cursor-not-allowed';
  const primary = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-haze-accent-fill text-haze-on-accent disabled:opacity-40 disabled:cursor-not-allowed';
  const input = 'w-20 px-2 py-1 rounded-md bg-haze-bg border border-haze-border text-xs text-haze-text';

  return (
    <div className="max-w-[1500px] mx-auto p-4 space-y-4" data-testid="video-studio">
      <div className="flex items-center gap-2">
        <Clapperboard className="w-5 h-5 text-haze-accent" />
        <h2 className="text-sm font-bold">Video Studio <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded border border-haze-accent/30 text-haze-accent font-mono">POC</span></h2>
        <span className="text-xs text-haze-muted">Edição local: os arquivos não saem do seu computador.</span>
      </div>

      {message && <div role="alert" data-testid="video-message" className="px-3 py-2 rounded-lg border border-red-500/40 bg-red-500/10 text-xs text-red-300">{message}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)_280px] gap-4">
        {/* Biblioteca */}
        <section className="rounded-xl border border-haze-border bg-haze-panel p-3 space-y-3">
          <label className={`${primary} cursor-pointer`}>
            <Upload className="w-4 h-4" /> Importar vídeos
            <input data-testid="video-file-input" type="file" accept="video/*" multiple className="hidden"
              onChange={e => { void onFiles(e.target.files); e.target.value = ''; }} />
          </label>
          <ul className="space-y-2" data-testid="video-library">
            {library.map((m, i) => (
              <li key={m.ref.id} className="rounded-lg border border-haze-border p-2 text-xs">
                <div className="font-semibold truncate" title={m.ref.name}>{m.ref.name}</div>
                <div className="text-haze-muted">{fmt(m.ref.duration)} · {m.ref.width}×{m.ref.height} · {m.ref.hasAudio ? 'com áudio' : 'sem áudio'}</div>
                <button className={`${btn} mt-1.5`} data-testid={`add-clip-${i}`} onClick={() => apply(x => addClip(x, m.ref))}>Adicionar à timeline</button>
              </li>
            ))}
            {!library.length && <li className="text-xs text-haze-muted">Importe um ou mais vídeos para começar.</li>}
          </ul>

          <div className="border-t border-haze-border pt-3 space-y-2">
            <div className="text-xs font-semibold flex items-center gap-1"><MessageSquarePlus className="w-3.5 h-3.5" /> Chat sobre o vídeo</div>
            <textarea data-testid="chat-text" value={chatText} onChange={e => setChatText(e.target.value)} rows={3}
              className="w-full px-2 py-1 rounded-md bg-haze-bg border border-haze-border text-xs text-haze-text" />
            <div className="flex items-center gap-2 text-xs text-haze-muted">
              início <input data-testid="chat-start" type="number" step="0.1" min="0" value={chatStart} onChange={e => setChatStart(+e.target.value)} className={input} />
              duração <input data-testid="chat-duration" type="number" step="0.1" min={MIN_CLIP} value={chatDur} onChange={e => setChatDur(+e.target.value)} className={input} />
            </div>
            <button className={btn} data-testid="chat-add" disabled={!chatText.trim()}
              onClick={() => apply(x => addOverlay(x, { text: chatText, start: chatStart, duration: chatDur }))}>Adicionar chat</button>
          </div>
        </section>

        {/* Preview + timeline */}
        <section className="space-y-3 min-w-0">
          <div className="rounded-xl border border-haze-border bg-black p-2 flex justify-center">
            <canvas ref={canvasRef} data-testid="video-preview" width={PREVIEW_W} height={previewH} style={{ width: PREVIEW_W, maxWidth: '100%', height: 'auto' }} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button className={btn} data-testid="play" disabled={!total} onClick={() => setPlaying(p => !p)}>
              {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />} {playing ? 'Pausar' : 'Reproduzir'}
            </button>
            <button className={btn} aria-label="Quadro anterior" disabled={!total} onClick={() => setT(c => Math.max(0, round3(c - 1 / fps)))}><ChevronLeft className="w-4 h-4" /></button>
            <button className={btn} aria-label="Próximo quadro" disabled={!total} onClick={() => setT(c => Math.min(Math.max(0, total - 0.001), round3(c + 1 / fps)))}><ChevronRight className="w-4 h-4" /></button>
            <span className="text-xs font-mono text-haze-muted" data-testid="playhead">{fmt(t)} / {fmt(total)}</span>
            <label className="text-xs text-haze-muted flex items-center gap-1">ir para (s)
              <input data-testid="playhead-input" type="number" step="0.01" min="0" className={input} value={Number(t.toFixed(2))}
                onChange={e => setT(Math.max(0, Number.isFinite(+e.target.value) ? +e.target.value : 0))} />
            </label>
            <span className="text-[11px] text-haze-faint">(preview sem áudio no POC; o áudio entra na exportação)</span>
            <div className="ml-auto flex gap-2">
              <button className={btn} data-testid="undo" disabled={!hist.past.length} onClick={() => setHist(undo)}><Undo2 className="w-4 h-4" /> Desfazer</button>
              <button className={btn} data-testid="redo" disabled={!hist.future.length} onClick={() => setHist(redo)}><Redo2 className="w-4 h-4" /> Refazer</button>
            </div>
          </div>

          <div className="rounded-xl border border-haze-border bg-haze-panel p-2 overflow-hidden" data-testid="timeline">
            <div className="flex items-center gap-3 text-[11px] text-haze-muted px-1 pb-1"><span>Trilha 1: vídeo</span><span>Trilha 2: chat</span></div>
            {tl.clips.length === 0 && tl.overlays.length === 0
              ? <div className="h-24 flex items-center justify-center text-xs text-haze-muted">A timeline está vazia.</div>
              : <TimelineUI ref={tlStateRef} editorData={editorData} effects={EFFECTS} scale={1} scaleWidth={140} startLeft={16} rowHeight={34}
                  autoScroll gridSnap dragLine={false}
                  getActionRender={(action) => {
                    const isClip = action.effectId === 'clip';
                    const c = tl.clips.find(x => x.id === action.id);
                    const label = isClip ? (mediaRef.current.get(c?.mediaId ?? '')?.ref.name ?? 'clipe') : (tl.overlays.find(x => x.id === action.id)?.text ?? 'chat');
                    const sel = action.id === selected;
                    return (
                      <div data-testid={isClip ? 'clip-block' : 'chat-block'} data-clip-id={action.id}
                        onClick={() => isClip && setSelected(action.id)}
                        className={`h-full w-full px-2 flex items-center text-[11px] truncate rounded ${isClip ? 'bg-haze-accent/25 border border-haze-accent/60' : 'bg-sky-500/25 border border-sky-400/60'} ${sel ? 'ring-2 ring-white' : ''}`}>
                        {label}
                      </div>
                    );
                  }}
                  onClickTimeArea={(time) => { setT(Math.max(0, time)); return undefined; }}
                  onCursorDrag={(time) => setT(Math.max(0, time))}
                  onActionMoveEnd={onMoveEnd as any}
                  onActionResizeEnd={onResizeEnd as any}
                />}
          </div>
        </section>

        {/* Inspetor + exportar */}
        <section className="rounded-xl border border-haze-border bg-haze-panel p-3 space-y-3">
          <div className="text-xs font-semibold">Clipe selecionado</div>
          {selClip && selMedia ? (
            <div className="space-y-2 text-xs" data-testid="inspector">
              <div className="truncate text-haze-muted">{selMedia.ref.name}</div>
              <div className="flex items-center gap-2">entrada
                <input data-testid="trim-in" type="number" step="0.1" className={input} key={`in-${selClip.id}-${selClip.inPoint}`} defaultValue={selClip.inPoint}
                  onBlur={e => apply(x => trimClip(x, selClip.id, { inPoint: +e.target.value }, selMedia.ref.duration))} />
              </div>
              <div className="flex items-center gap-2">saída
                <input data-testid="trim-out" type="number" step="0.1" className={input} key={`out-${selClip.id}-${selClip.outPoint}`} defaultValue={selClip.outPoint}
                  onBlur={e => apply(x => trimClip(x, selClip.id, { outPoint: +e.target.value }, selMedia.ref.duration))} />
              </div>
              <div className="text-haze-muted">duração {fmt(clipDuration(selClip))}</div>
              <div className="flex items-center gap-2">volume
                <input data-testid="clip-volume" type="range" min="0" max="2" step="0.1" value={selClip.volume} onChange={e => apply(x => setClipVolume(x, selClip.id, +e.target.value))} />
                <span>{Math.round(selClip.volume * 100)}%</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className={btn} data-testid="move-left" onClick={() => apply(x => moveClip(x, selClip.id, x.clips.findIndex(c => c.id === selClip.id) - 1))}>← Antes</button>
                <button className={btn} data-testid="move-right" onClick={() => apply(x => moveClip(x, selClip.id, x.clips.findIndex(c => c.id === selClip.id) + 1))}>Depois →</button>
                <button className={btn} data-testid="remove-clip" onClick={() => { apply(x => removeClip(x, selClip.id)); setSelected(null); }}><Trash2 className="w-4 h-4" /> Remover</button>
              </div>
            </div>
          ) : <div className="text-xs text-haze-muted">Clique em um clipe da timeline.</div>}
          <button className={btn} data-testid="split" disabled={!locate(tl, t)} onClick={() => apply(x => splitAt(x, t))}><Scissors className="w-4 h-4" /> Dividir no cursor</button>
          {tl.overlays.length > 0 && (
            <ul className="text-xs space-y-1 border-t border-haze-border pt-2" data-testid="overlay-list">
              {tl.overlays.map(o => (
                <li key={o.id} className="flex items-center gap-2"><span className="truncate flex-1">{fmt(o.start)} · {o.text}</span>
                  <button aria-label="Remover chat" className="text-haze-muted hover:text-white" onClick={() => apply(x => removeOverlay(x, o.id))}><Trash2 className="w-3.5 h-3.5" /></button></li>
              ))}
            </ul>
          )}

          <div className="border-t border-haze-border pt-3 space-y-2">
            <div className="text-xs font-semibold">Exportar</div>
            <div className="flex items-center gap-2 text-xs">
              <select data-testid="export-size" value={sizeIdx} onChange={e => setSizeIdx(+e.target.value)} className="px-2 py-1 rounded-md bg-haze-bg border border-haze-border">
                {SIZES.map((s, i) => <option key={s[0]} value={i}>{s[0]}</option>)}
              </select>
              <select data-testid="export-fps" value={fps} onChange={e => setFps(+e.target.value)} className="px-2 py-1 rounded-md bg-haze-bg border border-haze-border">
                {[24, 30, 60].map(f => <option key={f} value={f}>{f} fps</option>)}
              </select>
            </div>
            {!exp
              ? <button className={primary} data-testid="export" disabled={!tl.clips.length} onClick={() => void startExport()}>Exportar vídeo</button>
              : <button className={btn} data-testid="export-cancel" onClick={() => abortRef.current?.abort()}>Cancelar</button>}
            {exp && <div className="text-xs text-haze-muted" data-testid="export-status" role="status">{exp.phase}… {exp.pct}%</div>}
            {result && (
              <div className="text-xs space-y-1" data-testid="export-result">
                <div data-testid="export-info">{result.r.ext.toUpperCase()} · {result.r.videoCodec}{result.r.audioCodec ? ` + ${result.r.audioCodec}` : ''} · {result.r.width}×{result.r.height} · {result.r.fps} fps · {result.r.frames} quadros · {(result.r.blob.size / 1024).toFixed(0)} KB · {(result.r.elapsedMs / 1000).toFixed(1)} s</div>
                <div className="text-haze-faint" data-testid="export-timing">decodificar {(result.r.timing.decodeMs / 1000).toFixed(1)} s · desenhar {(result.r.timing.composeMs / 1000).toFixed(1)} s · codificar {(result.r.timing.encodeMs / 1000).toFixed(1)} s · áudio {(result.r.timing.audioMs / 1000).toFixed(1)} s</div>
                <a data-testid="export-download" className={`${primary} no-underline`} href={result.url} download={`haze-video.${result.r.ext}`}><Download className="w-4 h-4" /> Baixar</a>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
