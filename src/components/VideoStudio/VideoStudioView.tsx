import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Timeline as TimelineUI } from '@xzdarcy/react-timeline-editor';
import type { TimelineState } from '@xzdarcy/react-timeline-editor';
import type { TimelineRow, TimelineEffect } from '@xzdarcy/timeline-engine';
import '@xzdarcy/react-timeline-editor/dist/react-timeline-editor.css';
import { Clapperboard, Upload, Scissors, Undo2, Redo2, Play, Pause, Download, Trash2, VolumeX, ChevronLeft, ChevronRight, MessageSquarePlus, Save, FolderOpen } from 'lucide-react';
import {
  addClip, addOverlay, clipDuration, commit, createHistory, layout, locate, moveClip, redo, removeClip, removeOverlay,
  setClipVolume, setClipCamera, setLineStep, splitAt, totalDuration, trimClip, undo, updateOverlay, makeId, round3, MIN_CLIP, Timeline
} from '../../video/timeline';
import { buildVideoProjectBlob, parseVideoProject, matchesSaved, SavedMedia } from '../../video/videoProject';
import { openMedia, MediaError, OpenedMedia } from '../../video/mediaIO';
import { composeFrame, Drawable } from '../../video/compositor';
import { PreviewAudio } from '../../video/previewAudio';
import { exportTimeline, ExportCancelled, ExportResult } from '../../video/exporter';

const PREVIEW_W = 640;
const SIZES: Array<[string, number, number]> = [['1280×720', 1280, 720], ['1920×1080', 1920, 1080], ['854×480', 854, 480]];
const EFFECTS: Record<string, TimelineEffect> = { clip: { id: 'clip', name: 'Clipe' }, chat: { id: 'chat', name: 'Chat' } };
const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, '0')}`;


/** Bloco de clipe com arrasto próprio: solta sobre outro clipe para reordenar (a lib não reordena trilha sequencial). */
const ClipBlock: React.FC<{ id: string; thumb?: string; label: string; selected: boolean; muted: boolean; onSelect: () => void; onReorder: (toIndex: number) => void }> =
  ({ id, thumb, label, selected, muted, onSelect, onReorder }) => {
    const [dx, setDx] = useState(0);
    const start = useRef<{ x: number; moved: boolean } | null>(null);
    return (
      <div data-testid="clip-block" data-clip-id={id} style={{ backgroundImage: thumb ? `linear-gradient(90deg, rgba(0,0,0,.55), rgba(0,0,0,.15)), url(${thumb})` : undefined, backgroundSize: 'auto 100%', backgroundRepeat: 'no-repeat', transform: dx ? `translateX(${dx}px)` : undefined, zIndex: dx ? 20 : undefined, touchAction: 'none', cursor: 'grab' }}
        onPointerDown={e => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); start.current = { x: e.clientX, moved: false }; onSelect(); }}
        onPointerMove={e => { const st = start.current; if (!st) return; const d = e.clientX - st.x; if (Math.abs(d) > 4) st.moved = true; if (st.moved) setDx(d); }}
        onPointerUp={e => {
          const st = start.current; start.current = null; setDx(0);
          if (!st?.moved) return;
          const me = (e.currentTarget as HTMLElement).getBoundingClientRect();
          const target = me.left + me.width / 2 - dx + (e.clientX - st.x); // centro original + deslocamento do ponteiro
          const others = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="clip-block"]'))
            .filter(b => b.dataset.clipId !== id).map(b => { const r = b.getBoundingClientRect(); return r.left + r.width / 2; });
          onReorder(others.filter(c => c < target).length);
        }}
        onPointerCancel={() => { start.current = null; setDx(0); }}
        className={`h-full w-full px-2 flex items-center gap-1 text-[11px] truncate rounded bg-haze-accent/25 border border-haze-accent/60 select-none ${selected ? 'ring-2 ring-white' : ''}`}>
        {muted && <VolumeX className="w-3 h-3 shrink-0" />}<span className="truncate">{label}</span>
      </div>
    );
  };

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
  const [zoom, setZoom] = useState(140);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [exp, setExp] = useState<{ phase: string; pct: number } | null>(null);
  const [result, setResult] = useState<{ r: ExportResult; url: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const tlStateRef = useRef<TimelineState>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [chatText, setChatText] = useState('Ramon Mendoza diz: Precisamos conversar.');
  const [chatStart, setChatStart] = useState(0);
  const [chatDur, setChatDur] = useState(3);
  const [chatKind, setChatKind] = useState<'chat' | 'text'>('chat');
  const [chatColor, setChatColor] = useState('#ffffff');
  const [chatStep, setChatStep] = useState(0);
  // mídias do projeto aberto que ainda não foram reconectadas (clipes offline)
  const [pending, setPending] = useState<SavedMedia[]>([]);

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
        const cand = pending.find(p => matchesSaved(p, f));
        let m = await openMedia(f, cand ? cand.id : makeId('media'));
        if (cand && !matchesSaved(cand, f, m.ref.duration)) {
          // mesmo nome e tamanho, mas duração diferente: é outro arquivo; entra como mídia nova
          m.dispose();
          m = await openMedia(f, makeId('media'));
          setMessage(`"${f.name}" tem o mesmo nome mas outra duração que a do projeto; foi importado como mídia nova.`);
        } else if (cand) {
          setPending(ps => ps.filter(x => x.id !== cand.id));
        }
        mediaRef.current.set(m.ref.id, m);
        setLibrary(l => [...l, m]);
      } catch (e) {
        setMessage(e instanceof MediaError ? e.message : `Não foi possível importar "${f.name}".`);
      }
    }
  };

  // ------------------------------------------------------------ projeto .haze (vídeo)
  const savedMetas = (): SavedMedia[] => [
    ...library.map(m => ({ ...m.ref, size: m.file.size })),
    ...pending
  ];
  const saveProject = async () => {
    setMessage(null);
    const blob = await buildVideoProjectBlob(tl, savedMetas());
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'projeto-video.haze'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };
  const openProject = async (file: File | undefined) => {
    if (!file) return;
    setMessage(null);
    try {
      const p = await parseVideoProject(file);
      setPlaying(false);
      mediaRef.current.forEach(m => m.dispose());
      mediaRef.current.clear();
      setLibrary([]); setThumbs({});
      setHist(createHistory(p.timeline));
      setPending(p.media.filter(m => p.timeline.clips.some(c => c.mediaId === m.id)));
      setSelected(null); setT(0);
      if (p.warnings.length) setMessage(p.warnings.join('; ') + '.');
    } catch (e) {
      setMessage((e as Error).message || 'Não foi possível abrir o projeto.');
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

  // ------------------------------------------------------------ miniaturas dos clipes (1º quadro do trecho)
  useEffect(() => {
    let dead = false;
    (async () => {
      for (const c of tl.clips) {
        const key = `${c.mediaId}@${c.inPoint}`;
        if (thumbs[key]) continue;
        try {
          const w = await mediaRef.current.get(c.mediaId)?.video?.getCanvas(c.inPoint);
          if (!w || dead) continue;
          const cv = document.createElement('canvas'); cv.width = 96; cv.height = 54;
          const ctx = cv.getContext('2d')!; const src = w.canvas as Drawable;
          const sc = Math.max(96 / src.width, 54 / src.height);
          ctx.drawImage(src, (96 - src.width * sc) / 2, (54 - src.height * sc) / 2, src.width * sc, src.height * sc);
          const url = cv.toDataURL('image/jpeg', 0.6);
          if (!dead) setThumbs(m => ({ ...m, [key]: url }));
        } catch { /* sem miniatura: o bloco continua utilizável */ }
      }
    })();
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tl.clips, library]);

  // ------------------------------------------------------------ reprodução (relógio = relógio do áudio)
  const audioRef = useRef<PreviewAudio | null>(null);
  const [audioStatus, setAudioStatus] = useState('parado');
  const tRef = useRef(0); tRef.current = t;
  useEffect(() => {
    if (!playing || total <= 0) return;
    const pa = new PreviewAudio();
    audioRef.current = pa;
    let raf = 0; let alive = true;
    const startAt = tRef.current >= total - 0.05 ? 0 : tRef.current;
    void pa.start(tl, mediaRef.current, startAt).then(() => { if (alive) setAudioStatus('ativo'); });
    const tick = () => {
      if (!alive) return;
      const now = pa.time();
      if (now >= total) { setT(Math.max(0, total - 0.001)); setPlaying(false); return; }
      setT(now);
      setAudioStatus(`ativo · ${pa.scheduled} trechos`);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { alive = false; cancelAnimationFrame(raf); const stopT = pa.stop(); audioRef.current = null; setAudioStatus('parado'); setT(Math.min(stopT, Math.max(0, total - 0.001))); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);
  // qualquer edição durante a reprodução pausa (o áudio agendado seria da versão antiga)
  useEffect(() => { setPlaying(false); }, [tl]);

  // ------------------------------------------------------------ timeline (react-timeline-editor)
  const editorData: TimelineRow[] = useMemo(() => [
    {
      id: 'video',
      actions: placed.map(p => ({ id: p.clip.id, start: p.start, end: p.end, effectId: 'clip', flexible: true, movable: false }))
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
    if (pending.length) { setMessage(`Reconecte as mídias do projeto antes de exportar: ${pending.map(p => p.name).join(', ')}.`); return; }
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
        <div className="ml-auto flex gap-2">
          <button className={btn} data-testid="project-save" disabled={!tl.clips.length} onClick={() => void saveProject()}><Save className="w-4 h-4" /> Salvar projeto</button>
          <label className={`${btn} cursor-pointer`}><FolderOpen className="w-4 h-4" /> Abrir projeto
            <input data-testid="project-open-input" type="file" accept=".haze" className="hidden" onChange={e => { void openProject(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
        </div>
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
            {!library.length && !pending.length && <li className="text-xs text-haze-muted">Importe um ou mais vídeos para começar.</li>}
          </ul>
          {pending.length > 0 && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-xs space-y-1" data-testid="pending-media">
              <div className="font-semibold">Mídias a reconectar</div>
              {pending.map(p => <div key={p.id} className="truncate" title={p.name}>{p.name}</div>)}
              <div className="text-haze-muted">Importe os mesmos arquivos (mesmo nome e tamanho) para continuar.</div>
            </div>
          )}

          <div className="border-t border-haze-border pt-3 space-y-2">
            <div className="text-xs font-semibold flex items-center gap-1"><MessageSquarePlus className="w-3.5 h-3.5" /> Texto sobre o vídeo</div>
            <select data-testid="chat-kind" value={chatKind} onChange={e => setChatKind(e.target.value as 'chat' | 'text')} className="px-2 py-1 rounded-md bg-haze-bg border border-haze-border text-xs">
              <option value="chat">Chat do servidor (cores do Editor RP)</option>
              <option value="text">Título / legenda livre</option>
            </select>
            <textarea data-testid="chat-text" value={chatText} onChange={e => setChatText(e.target.value)} rows={3}
              className="w-full px-2 py-1 rounded-md bg-haze-bg border border-haze-border text-xs text-haze-text" />
            <div className="flex items-center gap-2 text-xs text-haze-muted">
              início <input data-testid="chat-start" type="number" step="0.1" min="0" value={chatStart} onChange={e => setChatStart(+e.target.value)} className={input} />
              duração <input data-testid="chat-duration" type="number" step="0.1" min={MIN_CLIP} value={chatDur} onChange={e => setChatDur(+e.target.value)} className={input} />
            </div>
            <div className="flex items-center gap-2 text-xs text-haze-muted">
              {chatKind === 'chat'
                ? <>uma linha a cada (s) <input data-testid="chat-step" type="number" step="0.5" min="0" value={chatStep} onChange={e => setChatStep(Math.max(0, +e.target.value))} className={input} title="0 = todas as linhas juntas" /></>
                : <>cor <input data-testid="chat-color" type="color" value={chatColor} onChange={e => setChatColor(e.target.value)} /></>}
            </div>
            <button className={btn} data-testid="chat-add" disabled={!chatText.trim()}
              onClick={() => apply(x => {
                const id = makeId('chat');
                const n = addOverlay(x, chatKind === 'text' ? { text: chatText, start: chatStart, duration: chatDur, kind: 'text', color: chatColor } : { text: chatText, start: chatStart, duration: chatDur }, id);
                return chatKind === 'chat' && chatStep > 0 ? setLineStep(n, id, chatStep) : n;
              })}>Adicionar texto</button>
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
                onChange={e => { setPlaying(false); setT(Math.max(0, Number.isFinite(+e.target.value) ? +e.target.value : 0)); }} />
            </label>
            <span className="text-[11px] text-haze-faint" data-testid="audio-status">áudio: {audioStatus}</span>
            <label className="text-xs text-haze-muted flex items-center gap-1">zoom
              <input data-testid="zoom" type="range" min="60" max="400" step="10" value={zoom} onChange={e => setZoom(+e.target.value)} />
            </label>
            <div className="ml-auto flex gap-2">
              <button className={btn} data-testid="undo" disabled={!hist.past.length} onClick={() => setHist(undo)}><Undo2 className="w-4 h-4" /> Desfazer</button>
              <button className={btn} data-testid="redo" disabled={!hist.future.length} onClick={() => setHist(redo)}><Redo2 className="w-4 h-4" /> Refazer</button>
            </div>
          </div>

          <div className="rounded-xl border border-haze-border bg-haze-panel p-2 overflow-hidden" data-testid="timeline">
            <div className="flex items-center gap-3 text-[11px] text-haze-muted px-1 pb-1"><span>Trilha 1: vídeo</span><span>Trilha 2: chat</span></div>
            {tl.clips.length === 0 && tl.overlays.length === 0
              ? <div className="h-24 flex items-center justify-center text-xs text-haze-muted">A timeline está vazia.</div>
              : <TimelineUI ref={tlStateRef} editorData={editorData} effects={EFFECTS} scale={1} scaleWidth={zoom} startLeft={16} rowHeight={34}
                  autoScroll gridSnap dragLine={false}
                  getActionRender={(action) => {
                    const isClip = action.effectId === 'clip';
                    const c = tl.clips.find(x => x.id === action.id);
                    const label = isClip ? (mediaRef.current.get(c?.mediaId ?? '')?.ref.name ?? ((pending.find(p => p.id === c?.mediaId)?.name ?? 'clipe') + ' (offline)')) : (tl.overlays.find(x => x.id === action.id)?.text ?? 'chat');
                    const sel = action.id === selected;
                    if (isClip) return <ClipBlock id={action.id} thumb={c ? thumbs[`${c.mediaId}@${c.inPoint}`] : undefined} label={label} selected={sel} muted={(c?.volume ?? 1) === 0}
                      onSelect={() => setSelected(action.id)} onReorder={(to) => apply(x => moveClip(x, action.id, to))} />;
                    return (
                      <div data-testid="chat-block" data-clip-id={action.id}
                        className="h-full w-full px-2 flex items-center text-[11px] truncate rounded bg-sky-500/25 border border-sky-400/60">
                        {label}
                      </div>
                    );
                  }}
                  onClickTimeArea={(time) => { setPlaying(false); setT(Math.max(0, time)); return undefined; }}
                  onCursorDrag={(time) => { setPlaying(false); setT(Math.max(0, time)); }}
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
              <div className="flex items-center gap-2">câmera
                <select data-testid="cam-preset" value={selClip.camera?.preset ?? 'none'} className="px-2 py-1 rounded-md bg-haze-bg border border-haze-border"
                  onChange={e => {
                    const d = new Date(); const p2 = (n: number) => String(n).padStart(2, '0');
                    const now = { date: `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`, time: `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}` };
                    apply(x => setClipCamera(x, selClip.id, e.target.value as 'none' | 'bodycam' | 'cctv' | 'noir', now));
                  }}>
                  <option value="none">Nenhuma</option><option value="bodycam">Bodycam</option><option value="cctv">CCTV</option><option value="noir">Noir</option>
                </select>
              </div>
              {selClip.camera && selClip.camera.preset !== 'noir' && (
                <div className="space-y-1" data-testid="cam-fields">
                  <div className="flex items-center gap-2">início do relógio
                    <input data-testid="cam-date" className={input} defaultValue={selClip.camera.date} key={`d-${selClip.id}-${selClip.camera.date}`}
                      onBlur={e => apply(x => setClipCamera(x, selClip.id, selClip.camera!.preset, { date: selClip.camera!.date, time: selClip.camera!.time }, { date: e.target.value }))} />
                    <input data-testid="cam-time" className={input} defaultValue={selClip.camera.time} key={`t-${selClip.id}-${selClip.camera.time}`}
                      onBlur={e => apply(x => setClipCamera(x, selClip.id, selClip.camera!.preset, { date: selClip.camera!.date, time: selClip.camera!.time }, { time: e.target.value }))} />
                  </div>
                  {selClip.camera.preset === 'bodycam'
                    ? <input data-testid="cam-officer" placeholder="Oficial (ex.: M. MENDOZA)" className="w-full px-2 py-1 rounded-md bg-haze-bg border border-haze-border" defaultValue={selClip.camera.officer ?? ''} key={`o-${selClip.id}`}
                        onBlur={e => apply(x => setClipCamera(x, selClip.id, 'bodycam', { date: selClip.camera!.date, time: selClip.camera!.time }, { officer: e.target.value }))} />
                    : <input data-testid="cam-name" placeholder="Nome da câmera" className="w-full px-2 py-1 rounded-md bg-haze-bg border border-haze-border" defaultValue={selClip.camera.camName ?? ''} key={`n-${selClip.id}`}
                        onBlur={e => apply(x => setClipCamera(x, selClip.id, 'cctv', { date: selClip.camera!.date, time: selClip.camera!.time }, { camName: e.target.value }))} />}
                </div>
              )}
              <div className="flex items-center gap-2">volume
                <input data-testid="clip-volume" type="range" min="0" max="2" step="0.1" value={selClip.volume} onChange={e => apply(x => setClipVolume(x, selClip.id, +e.target.value))} />
                <span>{Math.round(selClip.volume * 100)}%</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className={btn} data-testid="mute" onClick={() => apply(x => setClipVolume(x, selClip.id, selClip.volume === 0 ? 1 : 0))}>{selClip.volume === 0 ? 'Ativar som' : 'Silenciar'}</button>
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
