import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Timeline as TimelineUI } from '@xzdarcy/react-timeline-editor';
import type { TimelineState } from '@xzdarcy/react-timeline-editor';
import type { TimelineRow, TimelineEffect } from '@xzdarcy/timeline-engine';
import '@xzdarcy/react-timeline-editor/dist/react-timeline-editor.css';
import { Clapperboard, Upload, Scissors, Undo2, Redo2, Play, Pause, Download, Trash2, VolumeX, ChevronLeft, ChevronRight, MessageSquarePlus, Save, FolderOpen, Captions, Layers, X } from 'lucide-react';
import {
  addClip, addOverlay, clipDuration, commit, createHistory, layout, locate, moveClip, redo, removeClip, removeOverlay,
  addLayer, updateLayer, trimLayer, removeLayer, addKeyframe, removeKeyframe, evalTransform, activeLayers, activeLayerClips, layerDuration,
  setClipVolume, setClipCamera, setLineStep, setClipSpeed, setClipFades, setClipTransition, addSubtitles, snapTime, speedOf, splitAt, totalDuration, trimClip, undo, updateOverlay, makeId, round3, MIN_CLIP, Timeline
} from '../../video/timeline';
import { buildVideoProjectBlob, parseVideoProject, matchesSaved, SavedMedia } from '../../video/videoProject';
import { openMedia, MediaError, OpenedMedia } from '../../video/mediaIO';
import { composeFrame, Drawable } from '../../video/compositor';
import { PreviewAudio } from '../../video/previewAudio';
import { FramePlayer } from '../../video/framePlayer';
import { parseSrt, MAX_SRT_BYTES } from '../../video/srt';
import { computePeaks, sliceBars } from '../../video/waveform';
import { exportTimeline, ExportCancelled, ExportResult } from '../../video/exporter';
import { applyTemplate, findTemplate, EXPORT_PRESETS, findExportPreset, bitrateFor, TARGET_AUDIO_BPS } from '../../video/templates';
import { TemplatesPanel } from './TemplatesPanel';
import { GuidedFlow } from './GuidedFlow';

const PREVIEW_W = 640;
const SIZES: Array<[string, number, number]> = [['1280×720', 1280, 720], ['1920×1080', 1920, 1080], ['854×480', 854, 480]];
const EFFECTS: Record<string, TimelineEffect> = { clip: { id: 'clip', name: 'Clipe' }, layer: { id: 'layer', name: 'Sobreposição' }, chat: { id: 'chat', name: 'Chat' } };
const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, '0')}`;


/** Bloco de clipe com arrasto próprio: solta sobre outro clipe para reordenar (a lib não reordena trilha sequencial). */
const ClipBlock: React.FC<{ id: string; wave?: { peaks: Float32Array; mediaDur: number; inP: number; outP: number }; thumb?: string; label: string; selected: boolean; muted: boolean; onSelect: () => void; onReorder: (toIndex: number) => void }> =
  ({ id, wave, thumb, label, selected, muted, onSelect, onReorder }) => {
    const [dx, setDx] = useState(0);
    const cvRef = useRef<HTMLCanvasElement>(null);
    const boxRef = useRef<HTMLDivElement>(null);
    // desenha a forma de onda do trecho visível do clipe (sem custo quando não há áudio)
    useEffect(() => {
      const cv = cvRef.current, box = boxRef.current;
      if (!cv || !box || !wave) return;
      const w = Math.max(10, Math.floor(box.clientWidth)), h = 14;
      cv.width = w; cv.height = h;
      const ctx = cv.getContext('2d')!;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      const bars = sliceBars(wave.peaks, wave.mediaDur, wave.inP, wave.outP, Math.floor(w / 2));
      bars.forEach((v, i) => { const bh = Math.max(1, Math.round(v * h)); ctx.fillRect(i * 2, h - bh, 1, bh); });
    }, [wave, boxRef.current?.clientWidth]);
    const start = useRef<{ x: number; moved: boolean } | null>(null);
    return (
      <div ref={boxRef} data-testid="clip-block" data-clip-id={id} style={{ backgroundImage: thumb ? `linear-gradient(90deg, rgba(0,0,0,.55), rgba(0,0,0,.15)), url(${thumb})` : undefined, backgroundSize: 'auto 100%', backgroundRepeat: 'no-repeat', transform: dx ? `translateX(${dx}px)` : undefined, zIndex: dx ? 20 : undefined, touchAction: 'none', cursor: 'grab' }}
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
        className={`h-full w-full px-2 flex items-center gap-1 text-[11px] truncate rounded bg-haze-accent/25 border border-haze-accent/60 select-none relative ${selected ? 'ring-2 ring-white' : ''}`}>
        {muted && <VolumeX className="w-3 h-3 shrink-0" />}<span className="truncate">{label}</span>
        {wave && <canvas ref={cvRef} data-testid="waveform" className="absolute left-0 bottom-0 w-full pointer-events-none" style={{ height: 14 }} />}
      </div>
    );
  };

export interface VideoStudioViewProps {
  active?: boolean;
}

export const VideoStudioView: React.FC<VideoStudioViewProps> = ({ active = true }) => {
  const [hist, setHist] = useState(() => createHistory());
  const tl = hist.present;
  const apply = useCallback((f: (t: Timeline) => Timeline) => setHist(h => commit(h, f(h.present))), []);

  const [library, setLibrary] = useState<OpenedMedia[]>([]);
  const mediaRef = useRef(new Map<string, OpenedMedia>());
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedLayer, setSelectedLayer] = useState<string | null>(null);
  const [selectedOverlay, setSelectedOverlay] = useState<string | null>(null);
  // Avançado continua o padrão (compatibilidade); o Simples é opcional e lembrado neste navegador.
  const [uiMode, setUiMode] = useState<'simple' | 'advanced'>(() => {
    try { return localStorage.getItem('haze-video-mode-v1') === 'simple' ? 'simple' : 'advanced'; } catch { return 'advanced'; }
  });
  const changeMode = (m: 'simple' | 'advanced') => { setUiMode(m); try { localStorage.setItem('haze-video-mode-v1', m); } catch { /* sem armazenamento */ } };
  const [presetId, setPresetId] = useState<string>('custom');
  const [showTemplates, setShowTemplates] = useState(false);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [sizeIdx, setSizeIdx] = useState(0);
  const [fps, setFps] = useState(30);
  const [zoom, setZoom] = useState(140);
  const tlWrapRef = useRef<HTMLDivElement | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [peaks, setPeaks] = useState<Record<string, Float32Array>>({});
  const [exp, setExp] = useState<{ phase: string; pct: number } | null>(null);
  const [result, setResult] = useState<{ r: ExportResult; url: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const tlStateRef = useRef<TimelineState>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<PreviewAudio | null>(null);
  if (!audioRef.current) audioRef.current = new PreviewAudio();
  const seekingRef = useRef(false);

  const [chatText, setChatText] = useState('Ramon Mendoza diz: Precisamos conversar.');
  const [chatStart, setChatStart] = useState(0);
  const [chatDur, setChatDur] = useState(3);
  const [chatKind, setChatKind] = useState<'chat' | 'text'>('chat');
  const [chatColor, setChatColor] = useState('#ffffff');
  const [chatStep, setChatStep] = useState(0);
  // mídias do projeto aberto que ainda não foram reconectadas (clipes offline)
  const [pending, setPending] = useState<SavedMedia[]>([]);
  const [showExportModal, setShowExportModal] = useState(false);

  const placed = useMemo(() => layout(tl), [tl]);
  const total = totalDuration(tl);
  /** Ajusta o zoom para a montagem inteira caber na largura da timeline (automático: só reduz, nunca passa de 140). */
  const userZoomed = useRef(false);
  const fitZoom = (max = 400) => {
    const w = tlWrapRef.current?.clientWidth ?? 0;
    if (w > 0 && total > 0) setZoom(Math.max(10, Math.min(max, Math.floor((w - 16 - 32) / total))));
  };
  useEffect(() => {
    if (total > 0 && !userZoomed.current) fitZoom(140);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total]);
  const [outW, outH] = [SIZES[sizeIdx][1], SIZES[sizeIdx][2]];
  const previewH = Math.round((PREVIEW_W * outH) / outW / 2) * 2;
  const selClip = tl.clips.find(c => c.id === selected) ?? null;
  const selLayer = (tl.layers ?? []).find(l => l.id === selectedLayer) ?? null;
  const selOverlay = tl.overlays.find(o => o.id === selectedOverlay) ?? null;
  const selLayerMedia = selLayer ? mediaRef.current.get(selLayer.mediaId) : undefined;
  const selMedia = selClip ? mediaRef.current.get(selClip.mediaId) : undefined;

  useEffect(() => () => {
    abortRef.current?.abort();
    mediaRef.current.forEach(m => m.dispose());
    mediaRef.current.clear();
    audioRef.current?.dispose();
    audioRef.current = null;
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
        if (uiMode === 'simple' && !cand) { const ref = m.ref; apply(x => addClip(x, ref)); }
      } catch (e) {
        setMessage(e instanceof MediaError ? e.message : `Não foi possível importar "${f.name}".`);
      }
    }
  };

  // ------------------------------------------------------------ modelos
  const applyTemplateById = (templateId: string, picks: Record<string, string | undefined>): string[] => {
    const def = findTemplate(templateId);
    if (!def) return ['Modelo desconhecido.'];
    const d = new Date(); const p2 = (n: number) => String(n).padStart(2, '0');
    const now = { date: `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`, time: `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}` };
    const media: Record<string, ReturnType<typeof mediaRef.current.get> extends infer M ? (M extends { ref: infer R } ? R : never) | undefined : never> = {};
    for (const [slot, id] of Object.entries(picks)) media[slot] = id ? mediaRef.current.get(id)?.ref : undefined;
    const r = applyTemplate(def, media, now);
    if (r.errors.length) return r.errors;
    setPlaying(false);
    apply(() => r.timeline);
    setSelected(null); setSelectedLayer(null); setSelectedOverlay(null); setT(0);
    setShowTemplates(false);
    setMessage(`Modelo "${def.name}" aplicado. Troque os textos entre colchetes e ajuste as cenas; Desfazer volta à montagem anterior.`);
    return [];
  };

  // ------------------------------------------------------------ legendas (.srt)
  const importSrt = async (file: File | undefined) => {
    if (!file) return;
    setMessage(null);
    if (file.size > MAX_SRT_BYTES) { setMessage(`"${file.name}" é grande demais para ser uma legenda (limite de 2 MB).`); return; }
    const { cues, skipped } = parseSrt(await file.text());
    if (!cues.length) { setMessage(`Nenhuma legenda válida em "${file.name}".`); return; }
    apply(x => addSubtitles(x, cues));
    setMessage(`${cues.length} legenda(s) importada(s)${skipped ? `; ${skipped} bloco(s) inválido(s) ignorado(s)` : ''}.`);
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
      setPending(p.media.filter(m => p.timeline.clips.some(c => c.mediaId === m.id) || (p.timeline.layers ?? []).some(l => l.mediaId === m.id)));
      setSelected(null); setT(0);
      if (p.warnings.length) setMessage(p.warnings.join('; ') + '.');
    } catch (e) {
      setMessage((e as Error).message || 'Não foi possível abrir o projeto.');
    }
  };

  // ------------------------------------------------------------ preview (mesmo compositor da exportação)
  const drawSeq = useRef(0);
  const playingRef = useRef(false); playingRef.current = playing;
  useEffect(() => {
    if (!active) return;
    if (playingRef.current) return; // durante a reprodução quem desenha é o laço sequencial abaixo
    const seq = ++drawSeq.current;
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d')!;
    (async () => {
      const grab = async (mediaId: string, at: number): Promise<Drawable | null> => {
        const m = mediaRef.current.get(mediaId);
        try { return ((await m?.video?.getCanvas(at))?.canvas as Drawable) ?? null; } catch { return null; }
      };
      const activeL = activeLayers(tl, t);
      const activeC = activeLayerClips(tl, t);
      const [mainFrames, layerEntries] = await Promise.all([
        Promise.all(activeL.map(L => grab(L.clip.mediaId, L.sourceTime))),
        Promise.all(activeC.map(async A => [A.layer.id, await grab(A.layer.mediaId, A.sourceTime)] as const))
      ]);
      if (seq !== drawSeq.current) return; // resultado antigo: descarta
      const lf = new Map<string, Drawable | null>(layerEntries);
      composeFrame(ctx, cv.width, cv.height, mainFrames, tl, t, lf);
    })();
  }, [tl, t, previewH, library, active]);

  useEffect(() => {
    if (active) tlStateRef.current?.setTime(t);
  }, [t, active]);

  // ------------------------------------------------------------ forma de onda (uma vez por mídia, em segundo plano)
  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      for (const m of library) {
        if (ac.signal.aborted) return;
        if (!m.audio || peaks[m.ref.id]) continue;
        const p = await computePeaks(m, ac.signal);
        if (p && !ac.signal.aborted) setPeaks(x => ({ ...x, [m.ref.id]: p }));
      }
    })();
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [library]);

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
  const [audioStatus, setAudioStatus] = useState('parado');
  const tRef = useRef(0); tRef.current = t;
  useEffect(() => {
    if (!playing || total <= 0) return;
    const pa = audioRef.current!;
    let raf = 0; let alive = true;
    const fp = new FramePlayer();
    const cv = canvasRef.current; const ctx = cv?.getContext('2d') ?? null;
    let busy = false;

    const render = async (now: number) => {
      if (!cv || !ctx) return;
      const activeL = activeLayers(tl, now);
      const activeC = activeLayerClips(tl, now);

      // Prune imediato de geradores de clipes que já saíram do campo de visão
      const activeKeys = new Set<string>();
      for (const L of activeL) activeKeys.add('m' + L.clip.id);
      for (const A of activeC) activeKeys.add('l' + A.layer.id);
      const nextPlaced = placed.find(p => p.start > now && p.start - now <= 3.0);
      if (nextPlaced) activeKeys.add('m' + nextPlaced.clip.id);
      fp.prune(activeKeys);

      // Decodificação paralela de camadas principais e PiP
      const [main, layerEntries] = await Promise.all([
        Promise.all(activeL.map(L => fp.frameAt('m' + L.clip.id, mediaRef.current.get(L.clip.mediaId)?.video, L.sourceTime))),
        Promise.all(activeC.map(async A => [A.layer.id, await fp.frameAt('l' + A.layer.id, mediaRef.current.get(A.layer.mediaId)?.video, A.sourceTime)] as const))
      ]);

      if (!alive) return;
      // Se durante a decodificação o playhead cruzou para outro clipe principal, descarta o quadro obsoleto
      // e desenha imediatamente o quadro em cache do novo clipe se disponível.
      const currentNow = pa.time();
      const currentActive = activeLayers(tl, currentNow);
      if (currentActive.length > 0 && activeL.length > 0 && currentActive[0].clip.id !== activeL[0].clip.id) {
        const peeked = fp.peek('m' + currentActive[0].clip.id);
        if (peeked) {
          composeFrame(ctx, cv.width, cv.height, [peeked], tl, currentNow, new Map());
        }
        return render(currentNow);
      }
      const lf = new Map<string, Drawable | null>(layerEntries);
      composeFrame(ctx, cv.width, cv.height, main, tl, now, lf);
    };

    const startAt = tRef.current >= total - 0.05 ? 0 : tRef.current;
    void pa.start(tl, mediaRef.current, startAt).then(() => { if (alive) setAudioStatus('ativo'); });

    const tick = () => {
      if (!alive) return;
      const now = pa.time();
      if (now >= total) {
        setT(Math.max(0, total - 0.001));
        setPlaying(false);
        return;
      }
      setT(now);
      setAudioStatus(`ativo · ${pa.scheduled} trechos`);

      // Pré-aquecimento contínuo no tick: não bloqueado pelo busy do render
      const nextPlaced = placed.find(p => p.start > now && p.start - now <= 3.0);
      if (nextPlaced) {
        const nextMedia = mediaRef.current.get(nextPlaced.clip.mediaId);
        fp.prefetch('m' + nextPlaced.clip.id, nextMedia?.video, nextPlaced.clip.inPoint);
      }

      if (!busy) {
        busy = true;
        render(now)
          .catch(() => { /* quadro perdido: o próximo tick tenta de novo */ })
          .finally(() => { busy = false; });
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      fp.dispose();
      const stopT = pa.stop();
      setAudioStatus('parado');
      if (!seekingRef.current) {
        setT(Math.min(stopT, Math.max(0, total - 0.001)));
      }
      seekingRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);
  // qualquer edição durante a reprodução pausa (o áudio agendado seria da versão antiga)
  useEffect(() => { setPlaying(false); }, [tl]);
  // quando a aba deixa de ser ativa, pausa imediatamente a reprodução e libera o contexto de áudio
  useEffect(() => {
    if (!active) {
      if (playing) setPlaying(false);
      audioRef.current?.stop();
      PreviewAudio.closeSharedContext();
    }
  }, [active, playing]);

  // ------------------------------------------------------------ timeline (react-timeline-editor)
  const editorData: TimelineRow[] = useMemo(() => [
    {
      id: 'video',
      actions: placed.map(p => ({ id: p.clip.id, start: p.start, end: p.end, effectId: 'clip', flexible: true, movable: false }))
    },
    {
      id: 'layers',
      actions: (tl.layers ?? []).map(l => ({ id: l.id, start: l.start, end: l.start + layerDuration(l), effectId: 'layer', flexible: true, movable: true }))
    },
    {
      id: 'chat',
      actions: tl.overlays.map(o => ({ id: o.id, start: o.start, end: o.start + o.duration, effectId: 'chat', flexible: true, movable: true }))
    }
  ], [placed, tl.overlays, tl.layers]);

  const onMoveEnd = ({ action, row, start }: { action: { id: string }; row: { id: string }; start: number }) => {
    if (row.id === 'chat') apply(x => updateOverlay(x, action.id, { start: snapTime(x, start, action.id) }));
    else if (row.id === 'layers') apply(x => updateLayer(x, action.id, { start: snapTime(x, start) }));
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
    else if (row.id === 'layers') {
      const l = (tl.layers ?? []).find(q => q.id === action.id);
      const m = l && mediaRef.current.get(l.mediaId);
      if (l && m) {
        apply(x => dir === 'left'
          ? updateLayer(trimLayer(x, action.id, { inPoint: l.inPoint + (start - l.start) }, m.ref.duration), action.id, { start })
          : trimLayer(x, action.id, { outPoint: l.inPoint + (end - start) }, m.ref.duration));
      }
    } else {
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
  const startExport = async (forcePreset?: string) => {
    setMessage(null);
    if (pending.length) { setMessage(`Reconecte as mídias do projeto antes de exportar: ${pending.map(p => p.name).join(', ')}.`); return; }
    if (result) { URL.revokeObjectURL(result.url); setResult(null); }
    const ac = new AbortController();
    abortRef.current = ac;
    setExp({ phase: 'preparando', pct: 0 });
    try {
      const preset = findExportPreset(forcePreset ?? presetId);
      let opts = { width: outW, height: outH, fps } as { width: number; height: number; fps: number; videoBitrate?: number; audioBitrate?: number };
      if (preset) {
        opts = { width: preset.width, height: preset.height, fps: preset.fps };
        if (preset.targetBytes) {
          const b = bitrateFor(preset.targetBytes, Math.max(0.1, totalDuration(tl)));
          if (!b.ok) { setMessage(b.message ?? 'Não cabe nesse tamanho.'); setExp(null); abortRef.current = null; return; }
          opts.videoBitrate = b.videoBps; opts.audioBitrate = TARGET_AUDIO_BPS;
        }
      }
      const r = await exportTimeline(tl, mediaRef.current, {
        ...opts, signal: ac.signal,
        onProgress: (f, phase) => setExp({ phase, pct: Math.round(f * 100) })
      });
      setResult({ r, url: URL.createObjectURL(r.blob) });
      if (preset?.targetBytes && r.blob.size > preset.targetBytes) {
        setMessage(`O arquivo ficou com ${(r.blob.size / 1048576).toFixed(1)} MB, acima dos ${(preset.targetBytes / 1048576).toFixed(0)} MB do destino. Reduza a duração ou tente de novo.`);
      }
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
    <div className="flex-1 min-h-0 flex flex-col bg-haze-bg text-haze-text" data-testid="video-studio">
      {/* Barra superior (52 px) */}
      <header className="h-[52px] border-b border-haze-border bg-haze-panel px-4 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Clapperboard className="w-5 h-5 text-haze-accent shrink-0" />
          <h2 className="text-sm font-bold text-white shrink-0 flex items-center">
            Video Studio
            <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded border border-haze-accent/30 text-haze-accent font-mono font-medium">POC</span>
          </h2>
          <span className="text-xs text-haze-muted truncate hidden xl:inline">Arquivos ficam no seu computador.</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Alternador Simples / Avançado */}
          <nav className="flex p-0.5 rounded-lg bg-haze-bg border border-haze-border" aria-label="Modo do Video Studio">
            {(['simple', 'advanced'] as const).map(m => (
              <button key={m} data-testid={`video-mode-${m}`} aria-pressed={uiMode === m} onClick={() => changeMode(m)}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${uiMode === m ? 'bg-haze-accent-fill text-haze-on-accent' : 'text-haze-muted hover:text-white'}`}>
                {m === 'simple' ? 'Simples' : 'Avançado'}
              </button>
            ))}
          </nav>

          {/* Desfazer / Refazer (só ícones com aria-label) */}
          <div className="flex items-center gap-1 border-l border-r border-haze-border/60 px-1.5">
            <button className={btn} data-testid="undo" aria-label="Desfazer" title="Desfazer" disabled={!hist.past.length} onClick={() => setHist(undo)}>
              <Undo2 className="w-4 h-4" />
            </button>
            <button className={btn} data-testid="redo" aria-label="Refazer" title="Refazer" disabled={!hist.future.length} onClick={() => setHist(redo)}>
              <Redo2 className="w-4 h-4" />
            </button>
          </div>

          {/* Ações de projeto */}
          <button className={btn} data-testid="templates-toggle" aria-expanded={showTemplates} onClick={() => setShowTemplates(v => !v)}>
            Modelos
          </button>
          <label className={`${btn} cursor-pointer`}>
            <FolderOpen className="w-4 h-4" /> Abrir projeto
            <input data-testid="project-open-input" type="file" accept=".haze" className="hidden" onChange={e => { void openProject(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
          <button className={btn} data-testid="project-save" disabled={!tl.clips.length && !(tl.layers ?? []).length} onClick={() => void saveProject()}>
            <Save className="w-4 h-4" /> Salvar projeto
          </button>

          {/* Botão primário Exportar no canto direito */}
          <button className={primary} data-testid="export-open" onClick={() => setShowExportModal(true)}>
            <Download className="w-4 h-4" /> Exportar
          </button>
        </div>
      </header>

      {/* Alerta de erro ou mensagem */}
      {message && (
        <div role="alert" data-testid="video-message" className="mx-4 mt-2 px-3 py-2 rounded-lg border border-red-500/40 bg-red-500/10 text-xs text-red-300">
          {message}
        </div>
      )}

      {/* Painel expansível de Modelos */}
      {showTemplates && (
        <div className="mx-4 mt-2 rounded-xl border border-haze-border bg-haze-panel p-3 max-w-xl shadow-lg">
          <TemplatesPanel library={library} hasContent={tl.clips.length > 0} onApply={applyTemplateById} />
        </div>
      )}

      {/* Área Principal (3 Colunas) */}
      <div style={{ height: 'calc(100vh - 85px - 52px - 232px)', maxHeight: 'calc(100vh - 85px - 52px - 232px)' }} className="flex-1 grid grid-cols-1 lg:grid-cols-[284px_1fr_304px] items-stretch gap-3 px-3 py-2 min-w-0">
        {/* Coluna Esquerda: Biblioteca de Mídias e Textos (284 px) */}
        <section className="w-full h-full min-h-0 flex flex-col rounded-xl border border-haze-border bg-haze-panel p-3 space-y-3 overflow-y-auto">
          <label className={`${primary} cursor-pointer w-full justify-center`}>
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
                <button className={`${btn} mt-1.5 ml-1.5`} data-testid={`add-layer-${i}`} title="Entra por cima do vídeo principal, a partir do cursor"
                  onClick={() => { const id = makeId('layer'); apply(x => addLayer(x, m.ref, t, id)); setSelectedLayer(id); setSelected(null); }}><Layers className="w-3.5 h-3.5" /> Sobrepor</button>
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

          <label className={`${btn} cursor-pointer w-full justify-center`}><Captions className="w-4 h-4" /> Importar legendas (.srt)
            <input data-testid="srt-input" type="file" accept=".srt,text/plain" className="hidden" onChange={e => { void importSrt(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
          <div className="border-t border-haze-border pt-3 space-y-2">
            <div className="text-xs font-semibold flex items-center gap-1"><MessageSquarePlus className="w-3.5 h-3.5" /> Texto sobre o vídeo</div>
            <select data-testid="chat-kind" value={chatKind} onChange={e => setChatKind(e.target.value as 'chat' | 'text')} className="w-full px-2 py-1 rounded-md bg-haze-bg border border-haze-border text-xs">
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
            <button className={`${btn} w-full justify-center mb-1`} data-testid="chat-add" disabled={!chatText.trim()}
              onClick={() => apply(x => {
                const id = makeId('chat');
                const n = addOverlay(x, chatKind === 'text' ? { text: chatText, start: chatStart, duration: chatDur, kind: 'text', color: chatColor } : { text: chatText, start: chatStart, duration: chatDur }, id);
                return chatKind === 'chat' && chatStep > 0 ? setLineStep(n, id, chatStep) : n;
              })}>Adicionar texto</button>
          </div>
        </section>

        {/* Coluna Central: Player Canvas + Barra de Reprodução */}
        <section className="w-full min-w-0 h-full min-h-0 flex flex-col items-center justify-between p-2 rounded-xl border border-haze-border bg-haze-panel/30 overflow-y-auto">
          <div className="rounded-xl border border-haze-border bg-black p-2 flex justify-center items-center w-full max-w-[800px] flex-1 min-h-0 shadow-lg">
            <canvas ref={canvasRef} data-testid="video-preview" width={PREVIEW_W} height={previewH} style={{ width: PREVIEW_W, maxWidth: '100%', maxHeight: '100%', height: 'auto', objectFit: 'contain' }} />
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 mt-2 p-2 bg-haze-panel rounded-xl border border-haze-border shadow-sm shrink-0">
            <button className={btn} data-testid="play" disabled={!total} onClick={() => setPlaying(p => !p)}>
              {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />} {playing ? 'Pausar' : 'Reproduzir'}
            </button>
            <button className={btn} aria-label="Quadro anterior" disabled={!total} onClick={() => { seekingRef.current = true; setPlaying(false); setT(c => Math.max(0, round3(c - 1 / fps))); }}><ChevronLeft className="w-4 h-4" /></button>
            <button className={btn} aria-label="Próximo quadro" disabled={!total} onClick={() => { seekingRef.current = true; setPlaying(false); setT(c => Math.min(Math.max(0, total - 0.001), round3(c + 1 / fps))); }}><ChevronRight className="w-4 h-4" /></button>
            <span className="text-xs font-mono text-haze-muted px-1.5" data-testid="playhead">{fmt(t)} / {fmt(total)}</span>
            <label className="text-xs text-haze-muted flex items-center gap-1">ir para (s)
              <input data-testid="playhead-input" type="number" step="0.01" min="0" className={input} value={Number(t.toFixed(2))}
                onChange={e => {
                  seekingRef.current = true;
                  setPlaying(false);
                  setT(Math.max(0, Number.isFinite(+e.target.value) ? +e.target.value : 0));
                }} />
            </label>
            <span className="text-[11px] text-haze-faint" data-testid="audio-status">áudio: {audioStatus}</span>
          </div>
        </section>

        {/* Coluna Direita: Inspetor Contextual (304 px, Avançado) ou Fluxo Guiado (Simples) */}
        {uiMode === 'simple' ? (
          <section className="w-full h-full min-h-0 flex flex-col rounded-xl border border-haze-border bg-haze-panel p-3 overflow-y-auto">
            <GuidedFlow tl={tl} mediaOf={id => mediaRef.current.get(id)} apply={apply} presetId={presetId === 'custom' ? EXPORT_PRESETS[0].id : presetId}
              setPresetId={setPresetId} exporting={exp} result={result} onExport={() => void startExport(presetId === 'custom' ? EXPORT_PRESETS[0].id : presetId)}
              onCancel={() => abortRef.current?.abort()} />
          </section>
        ) : (
          <section className="w-full h-full min-h-0 flex flex-col rounded-xl border border-haze-border bg-haze-panel p-3 space-y-3 overflow-y-auto">
            {selLayer && selLayerMedia && (() => {
              const rel = Math.max(0, Math.min(layerDuration(selLayer), t - selLayer.start));
              const cur = evalTransform(selLayer, rel);
              const kfs = selLayer.keyframes ?? [];
              const edit = (patch: Partial<typeof cur>) => { if (!kfs.length) apply(x => updateLayer(x, selLayer.id, { base: patch })); };
              const fld = (name: 'x' | 'y' | 'scale' | 'opacity', label: string, step: string) => (
                <label className="flex items-center gap-1">{label}
                  <input data-testid={`layer-${name}`} type="number" step={step} className={input}
                    key={`${selLayer.id}-${name}-${Math.round(rel * 1000)}-${kfs.length}-${selLayer.base[name]}`} defaultValue={Number(cur[name].toFixed(3))}
                    onBlur={e => edit({ [name]: +e.target.value })} />
                </label>
              );
              const read = (n: string) => Number((document.querySelector(`[data-testid="layer-${n}"]`) as HTMLInputElement | null)?.value);
              return (
                <div className="space-y-2 text-xs border border-fuchsia-400/40 rounded-lg p-2" data-testid="layer-inspector">
                  <div className="font-semibold">Sobreposição</div>
                  <div className="truncate text-haze-muted">{selLayerMedia.ref.name} · começa em {fmt(selLayer.start)} · dura {fmt(layerDuration(selLayer))}</div>
                  <div className="grid grid-cols-2 gap-1">
                    {fld('x', 'x', '0.05')}{fld('y', 'y', '0.05')}{fld('scale', 'escala', '0.05')}{fld('opacity', 'opac.', '0.1')}
                  </div>
                  <div className="text-haze-faint">x e y = centro do quadro (0 a 1). {kfs.length ? 'Com keyframes os valores vêm deles; edite e use o botão para gravar no cursor.' : 'Sem keyframes: valores fixos.'}</div>
                  <div className="flex items-center gap-2">volume
                    <input data-testid="layer-volume" type="range" min="0" max="2" step="0.1" value={selLayer.volume} onChange={e => apply(x => updateLayer(x, selLayer.id, { volume: +e.target.value }))} />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button className={btn} data-testid="kf-add" onClick={() => apply(x => addKeyframe(x, selLayer.id, rel, { x: read('x'), y: read('y'), scale: read('scale'), opacity: read('opacity') }))}>◆ Keyframe no cursor</button>
                    <button className={btn} data-testid="layer-remove" onClick={() => { apply(x => removeLayer(x, selLayer.id)); setSelectedLayer(null); }}><Trash2 className="w-4 h-4" /> Remover</button>
                  </div>
                  {kfs.length > 0 && (
                    <ul className="space-y-1" data-testid="kf-list">
                      {kfs.map((k, i) => (
                        <li key={k.time} className="flex items-center gap-2" data-testid={`kf-${i}`}>
                          <span className="font-mono">{fmt(k.time)}</span>
                          <span className="truncate flex-1">x{k.x} y{k.y} ×{k.scale} α{k.opacity}</span>
                          <button aria-label="Remover keyframe" data-testid={`kf-remove-${i}`} className="text-haze-muted hover:text-white" onClick={() => apply(x => removeKeyframe(x, selLayer.id, k.time))}><Trash2 className="w-3.5 h-3.5" /></button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })()}
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
                <div className="flex items-center gap-2">velocidade
                  <select data-testid="speed" value={speedOf(selClip)} className="px-2 py-1 rounded-md bg-haze-bg border border-haze-border"
                    onChange={e => apply(x => setClipSpeed(x, selClip.id, +e.target.value))}>
                    {[0.25, 0.5, 0.75, 1, 1.5, 2, 4].map(v => <option key={v} value={v}>{v}×</option>)}
                  </select>
                  <span className="text-haze-faint">muda o tom</span>
                </div>
                <div className="flex items-center gap-2">fade (s) entrada
                  <input data-testid="fade-in" type="number" min="0" step="0.1" className={input} key={`fi-${selClip.id}-${selClip.fadeIn ?? 0}`} defaultValue={selClip.fadeIn ?? 0}
                    onBlur={e => apply(x => setClipFades(x, selClip.id, { fadeIn: +e.target.value }))} />
                  saída
                  <input data-testid="fade-out" type="number" min="0" step="0.1" className={input} key={`fo-${selClip.id}-${selClip.fadeOut ?? 0}`} defaultValue={selClip.fadeOut ?? 0}
                    onBlur={e => apply(x => setClipFades(x, selClip.id, { fadeOut: +e.target.value }))} />
                </div>
                <div className="flex items-center gap-2">transição (s)
                  <input data-testid="transition" type="number" min="0" max="5" step="0.1" className={input} disabled={tl.clips[0]?.id === selClip.id}
                    title={tl.clips[0]?.id === selClip.id ? 'O primeiro clipe não tem clipe anterior' : 'Fusão com o clipe anterior (0 = corte seco)'}
                    key={`tr-${selClip.id}-${selClip.transition?.duration ?? 0}`} defaultValue={selClip.transition?.duration ?? 0}
                    onBlur={e => apply(x => setClipTransition(x, selClip.id, +e.target.value))} />
                </div>
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
            <button className={`${btn} w-full justify-center`} data-testid="split" disabled={!locate(tl, t)} onClick={() => apply(x => splitAt(x, t))}><Scissors className="w-4 h-4" /> Dividir no cursor</button>
            {tl.overlays.length > 0 && (
              <ul className="text-xs space-y-1 border-t border-haze-border pt-2" data-testid="overlay-list">
                {tl.overlays.map(o => (
                  <li key={o.id} className="flex items-center gap-2"><button className={`truncate flex-1 text-left ${o.id === selectedOverlay ? 'text-white font-semibold' : ''}`} data-testid="overlay-select" onClick={() => { setSelectedOverlay(o.id); setSelectedLayer(null); }}>{fmt(o.start)} · {o.text}</button>
                    <button aria-label="Remover chat" className="text-haze-muted hover:text-white" onClick={() => apply(x => removeOverlay(x, o.id))}><Trash2 className="w-3.5 h-3.5" /></button></li>
                ))}
              </ul>
            )}

            {selOverlay && (
              <div className="space-y-1.5 text-xs border border-sky-400/40 rounded-lg p-2" data-testid="overlay-editor">
                <div className="font-semibold">Texto selecionado ({selOverlay.kind === 'text' ? 'título/legenda' : 'chat'})</div>
                <textarea data-testid="ov-text" rows={3} className="w-full px-2 py-1 rounded-md bg-haze-bg border border-haze-border" key={`t-${selOverlay.id}`} defaultValue={selOverlay.text}
                  onBlur={e => { const v = e.target.value; if (v.trim() && v !== selOverlay.text) apply(x => updateOverlay(x, selOverlay.id, { text: v, lineOffsets: undefined })); }} />
                <div className="flex items-center gap-2 flex-wrap">
                  início <input data-testid="ov-start" type="number" step="0.1" min="0" className={input} key={`s-${selOverlay.id}-${selOverlay.start}`} defaultValue={selOverlay.start}
                    onBlur={e => apply(x => updateOverlay(x, selOverlay.id, { start: +e.target.value }))} />
                  duração <input data-testid="ov-duration" type="number" step="0.1" min="0.1" className={input} key={`d-${selOverlay.id}-${selOverlay.duration}`} defaultValue={selOverlay.duration}
                    onBlur={e => apply(x => updateOverlay(x, selOverlay.id, { duration: +e.target.value }))} />
                  tamanho <input data-testid="ov-size" type="number" step="2" min="10" max="72" className={input} key={`z-${selOverlay.id}-${selOverlay.fontSize}`} defaultValue={selOverlay.fontSize}
                    onBlur={e => apply(x => updateOverlay(x, selOverlay.id, { fontSize: Math.max(10, Math.min(72, +e.target.value || 22)) }))} />
                  {selOverlay.kind === 'text' && <>cor <input data-testid="ov-color" type="color" value={selOverlay.color ?? '#ffffff'} onChange={e => apply(x => updateOverlay(x, selOverlay.id, { color: e.target.value }))} /></>}
                </div>
                <div className="text-haze-faint">Editar o texto desfaz a entrada linha a linha.</div>
              </div>
            )}
          </section>
        )}
      </div>

      {/* Linha Inferior: Timeline em largura total (Modo Avançado) */}
      {uiMode === 'advanced' && (
        <div className="w-full px-3 pb-3 shrink-0">
          <div ref={tlWrapRef} className="rounded-xl border border-haze-border bg-haze-panel p-3 h-[220px] flex flex-col justify-between" data-testid="timeline">
            <div className="flex items-center justify-between gap-3 text-[11px] text-haze-muted pb-2 border-b border-haze-border/50 shrink-0">
              <div className="flex items-center gap-3 font-medium">
                <span>Trilha 1: vídeo</span>
                <span>Trilha 2: sobreposição</span>
                <span>Trilha 3: chat</span>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-haze-muted flex items-center gap-1">zoom
                  <input data-testid="zoom" type="range" min="10" max="400" step="5" value={zoom} onChange={e => { userZoomed.current = true; setZoom(+e.target.value); }} />
                  <button className={btn} data-testid="zoom-fit" disabled={!total} onClick={() => { userZoomed.current = false; fitZoom(); }}>Ajustar</button>
                </label>
              </div>
            </div>
            {tl.clips.length === 0 && tl.overlays.length === 0 && !(tl.layers ?? []).length
              ? <div className="flex-1 flex items-center justify-center text-xs text-haze-muted">A timeline está vazia.</div>
              : <div className="pt-1.5 flex-1 min-h-0">
                  <TimelineUI ref={tlStateRef} style={{ width: '100%', height: 160 }} editorData={editorData} effects={EFFECTS} scale={1} scaleWidth={zoom} startLeft={16} rowHeight={34}
                    autoScroll gridSnap dragLine={false}
                    getActionRender={(action) => {
                      const isClip = action.effectId === 'clip';
                      const c = tl.clips.find(x => x.id === action.id);
                      const label = isClip ? (mediaRef.current.get(c?.mediaId ?? '')?.ref.name ?? ((pending.find(p => p.id === c?.mediaId)?.name ?? 'clipe') + ' (offline)')) : (tl.overlays.find(x => x.id === action.id)?.text ?? 'chat');
                      const sel = action.id === selected;
                      if (action.effectId === 'layer') {
                        const lay = (tl.layers ?? []).find(x => x.id === action.id);
                        return (
                          <div data-testid="layer-block" data-layer-id={action.id}
                            onPointerDown={() => { setSelectedLayer(action.id); setSelected(null); }}
                            className={`h-full w-full px-2 flex items-center gap-1 text-[11px] truncate rounded bg-fuchsia-500/25 border border-fuchsia-400/60 ${action.id === selectedLayer ? 'ring-2 ring-white' : ''}`}>
                            <span className="truncate">{mediaRef.current.get(lay?.mediaId ?? '')?.ref.name ?? ((pending.find(p => p.id === lay?.mediaId)?.name ?? 'sobreposição') + ' (offline)')}</span>
                            {(lay?.keyframes?.length ?? 0) > 0 && <span className="shrink-0 text-[10px]">◆{lay!.keyframes!.length}</span>}
                          </div>
                        );
                      }
                      if (isClip) return <ClipBlock id={action.id} wave={c && peaks[c.mediaId] && mediaRef.current.get(c.mediaId) ? { peaks: peaks[c.mediaId], mediaDur: mediaRef.current.get(c.mediaId)!.ref.duration, inP: c.inPoint, outP: c.outPoint } : undefined} thumb={c ? thumbs[`${c.mediaId}@${c.inPoint}`] : undefined} label={c && speedOf(c) !== 1 ? `${label} ×${speedOf(c)}` : label} selected={sel} muted={(c?.volume ?? 1) === 0}
                        onSelect={() => { setSelected(action.id); setSelectedLayer(null); }} onReorder={(to) => apply(x => moveClip(x, action.id, to))} />;
                      return (
                        <div data-testid="chat-block" data-clip-id={action.id} onPointerDown={() => { setSelectedOverlay(action.id); setSelectedLayer(null); }}
                          className="h-full w-full px-2 flex items-center text-[11px] truncate rounded bg-sky-500/25 border border-sky-400/60">
                          {label}
                        </div>
                      );
                    }}
                    onClickTimeArea={(time) => {
                      seekingRef.current = true;
                      setPlaying(false);
                      setT(Math.max(0, time));
                      return undefined;
                    }}
                    onCursorDrag={(time) => {
                      seekingRef.current = true;
                      setPlaying(false);
                      setT(Math.max(0, time));
                    }}
                    onActionMoveEnd={onMoveEnd as any}
                    onActionResizeEnd={onResizeEnd as any}
                  />
                </div>}
          </div>
        </div>
      )}

      {/* Painel / Popover de Exportação */}
      {showExportModal && (
        <aside className="fixed top-14 right-4 z-50 w-full max-w-md rounded-2xl border border-haze-border bg-haze-panel p-5 shadow-2xl space-y-4" aria-label="Painel de exportação">
            <div className="flex items-center justify-between border-b border-haze-border pb-3">
              <div className="flex items-center gap-2">
                <Download className="w-5 h-5 text-haze-accent" />
                <h3 className="text-sm font-bold text-white">Exportar Vídeo</h3>
              </div>
              <button aria-label="Fechar exportação" className="p-1 rounded-lg text-haze-muted hover:text-white hover:bg-haze-raised/40 transition-colors"
                onClick={() => setShowExportModal(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <label className="text-xs text-haze-muted block space-y-1">
                <span>Preset de exportação</span>
                <select data-testid="export-preset" value={presetId} onChange={e => setPresetId(e.target.value)} className="w-full px-2.5 py-1.5 rounded-lg bg-haze-bg border border-haze-border text-xs text-white">
                  <option value="custom">Personalizado (tamanho e fps abaixo)</option>
                  {EXPORT_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <label className="text-haze-muted block space-y-1">
                  <span>Resolução</span>
                  <select data-testid="export-size" disabled={presetId !== 'custom'} value={sizeIdx} onChange={e => setSizeIdx(+e.target.value)} className="w-full px-2.5 py-1.5 rounded-lg bg-haze-bg border border-haze-border text-xs text-white disabled:opacity-50">
                    {SIZES.map((s, i) => <option key={s[0]} value={i}>{s[0]}</option>)}
                  </select>
                </label>
                <label className="text-haze-muted block space-y-1">
                  <span>Taxa de quadros</span>
                  <select data-testid="export-fps" disabled={presetId !== 'custom'} value={fps} onChange={e => setFps(+e.target.value)} className="w-full px-2.5 py-1.5 rounded-lg bg-haze-bg border border-haze-border text-xs text-white disabled:opacity-50">
                    {[24, 30, 60].map(f => <option key={f} value={f}>{f} fps</option>)}
                  </select>
                </label>
              </div>

              <div className="pt-2">
                {!exp
                  ? <button className={`w-full justify-center ${primary}`} data-testid="export" disabled={!tl.clips.length && !(tl.layers ?? []).length} onClick={() => void startExport()}>
                      <Download className="w-4 h-4" /> Exportar vídeo
                    </button>
                  : <button className={`w-full justify-center ${btn}`} data-testid="export-cancel" onClick={() => abortRef.current?.abort()}>
                      <X className="w-4 h-4" /> Cancelar exportação
                    </button>}
              </div>

              {exp && (
                <div className="rounded-lg bg-haze-bg border border-haze-border p-3 text-xs space-y-2">
                  <div className="flex justify-between text-haze-muted" role="status" data-testid="export-status">
                    <span>{exp.phase}…</span>
                    <span className="font-mono font-bold text-haze-accent">{exp.pct}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-haze-panel rounded-full overflow-hidden">
                    <div className="h-full bg-haze-accent-fill transition-all duration-200" style={{ width: `${exp.pct}%` }} />
                  </div>
                </div>
              )}

              {result && (
                <div className="rounded-xl border border-haze-accent/30 bg-haze-accent/10 p-3 text-xs space-y-2" data-testid="export-result">
                  <div className="font-semibold text-haze-accent">Vídeo pronto para download!</div>
                  <div data-testid="export-info" className="text-haze-text">
                    {result.r.ext.toUpperCase()} · {result.r.videoCodec}{result.r.audioCodec ? ` + ${result.r.audioCodec}` : ''} · {result.r.width}×{result.r.height} · {result.r.fps} fps · {result.r.frames} quadros · {(result.r.blob.size / 1024).toFixed(0)} KB · {(result.r.elapsedMs / 1000).toFixed(1)} s
                  </div>
                  <div className="text-haze-faint text-[11px]" data-testid="export-timing">
                    decodificar {(result.r.timing.decodeMs / 1000).toFixed(1)} s · desenhar {(result.r.timing.composeMs / 1000).toFixed(1)} s · codificar {(result.r.timing.encodeMs / 1000).toFixed(1)} s · áudio {(result.r.timing.audioMs / 1000).toFixed(1)} s
                  </div>
                  <a data-testid="export-download" className={`w-full justify-center ${primary} no-underline mt-2`} href={result.url} download={`haze-video.${result.r.ext}`}>
                    <Download className="w-4 h-4" /> Baixar arquivo ({result.r.ext.toUpperCase()})
                  </a>
                </div>
              )}
            </div>
        </aside>
      )}
    </div>
  );
};
