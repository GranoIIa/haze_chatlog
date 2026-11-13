import React, { useState, useRef, useEffect, useCallback, useSyncExternalStore } from 'react';
import { 
  Film, Upload, Scissors, Gauge, Download, Sparkles, AlertCircle, 
  CheckCircle2, Play, Pause, RefreshCw, Eye, X, Square, Maximize2, Clock
} from 'lucide-react';
import { renderChatText } from '../../utils/chatRenderer';
import { getSharedChat, subscribeSharedChat, requestChatText, requestChatStyle, requestSetBackground } from '../../utils/chatStore';
import { DialogPanel } from '../ChatLog/panels/DialogPanel';
import { EditorSection } from '../ChatLog/EditorSection';
import { clampGifSize, GIF_RESOLUTION_PRESETS, GIF_MIN_RES, GIF_MAX_RES } from '../../utils/gifFrame';
import type { FitMode } from '../../utils/editorSettings';
import { estimateCost, suggestLighter, formatBytes, type Suggestion } from '../../utils/gifBudget';
import {
  DEFAULT_GIF_SETTINGS, GIF_PROFILES, GIF_QUALITY_LABELS, MAX_SMART_ATTEMPTS, applyProfile, applyQuality, clampColors,
  nextLighter, outputDims, setCustomSize, withManual, type GifProfileId, type GifSettings
} from '../../utils/gifSettings';
import { exportGif, SeekFailure } from './gifExport';
import { loadAndApplyAllCustomFonts, type CustomFontMeta } from '../../utils/customFontStorage';

export type CropMode = 'original' | 'square';

export interface GifLabViewProps {
  onNavigateToChatLog?: () => void;
}

export const GifLabView: React.FC<GifLabViewProps> = ({ onNavigateToChatLog }) => {
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);

  // Parâmetros de Trim (Corte)
  const [startTime, setStartTime] = useState<number>(0);
  const [endTime, setEndTime] = useState<number>(5);

  // Parâmetros de GIF & Presets
  // Configuração única e tipada do GIF (perfil, qualidade, enquadramento, FPS, velocidade, cores)
  const [cfg, setCfg] = useState<GifSettings>(DEFAULT_GIF_SETTINGS);
  const [customW, setCustomW] = useState<string>('1280');
  const [customH, setCustomH] = useState<string>('720');
  const [smartExport, setSmartExport] = useState<boolean>(true);
  const [heavyOk, setHeavyOk] = useState<boolean>(false);
  const [videoNative, setVideoNative] = useState<{ w: number; h: number }>({ w: 1280, h: 720 });
  // valores derivados (o resto do componente lê estes nomes)
  const outSize = cfg.frame.kind === 'size' ? cfg.frame.size : null;
  const fitMode: FitMode = cfg.frame.kind === 'size' ? cfg.frame.fit : 'cover';
  const cropMode: CropMode = cfg.frame.kind === 'width' ? cfg.frame.crop : 'original';
  const targetWidth = cfg.frame.kind === 'width' ? cfg.frame.width : 480;
  const fps = cfg.fps;
  void fps;
  const [watermark, setWatermark] = useState<string>('');
  const [customFonts, setCustomFonts] = useState<CustomFontMeta[]>([]);

  useEffect(() => {
    let mounted = true;
    loadAndApplyAllCustomFonts().then(metas => {
      if (mounted) setCustomFonts(metas);
    }).catch(() => {});
    return () => { mounted = false; };
  }, []);

  // Chat Log sobre o GIF: usa o texto e o estilo criados na aba Chat Log
  const sharedChat = useSyncExternalStore(subscribeSharedChat, getSharedChat);
  const [includeChat, setIncludeChat] = useState<boolean>(false);
  const [chatReveal, setChatReveal] = useState<boolean>(false); // linhas aparecem uma a uma ao longo do clipe
  const [chatXPct, setChatXPct] = useState<number>(3);   // posição do chat em % do quadro
  const [chatYPct, setChatYPct] = useState<number>(6);
  const [chatScalePct, setChatScalePct] = useState<number>(100); // multiplicador do tamanho do texto
  const [videoBox, setVideoBox] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const chatDragRef = useRef<{ offX: number; offY: number } | null>(null);
  const chatPosInitRef = useRef<boolean>(false);

  // Diálogos e ações editáveis aqui: o texto é o MESMO do Editor RP (alterações vão e voltam)
  const [chatDraft, setChatDraft] = useState<string>('');
  const [gifActiveCharId, setGifActiveCharId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState<boolean>(true);
  const sharedRawText = sharedChat?.style.rawText;
  useEffect(() => {
    // mudanças vindas do Editor (digitação, desfazer, abrir projeto) entram no rascunho local
    if (sharedRawText !== undefined && sharedRawText !== chatDraft) setChatDraft(sharedRawText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedRawText]);
  const onChatTextChange = (text: string) => {
    setChatDraft(text);          // atualiza na hora (sem pulo do cursor)
    requestChatText(text);       // e avisa o Editor, que é o dono do texto
  };

  // Posição do chat no GIF = mesma posição relativa do canvas do Chat Log
  const syncChatPosition = () => {
    if (!sharedChat) return;
    setChatXPct(Math.round((sharedChat.style.chatPos.x / sharedChat.refWidth) * 1000) / 10);
    setChatYPct(Math.round((sharedChat.style.chatPos.y / sharedChat.refHeight) * 1000) / 10);
  };

  // Processamento e Worker
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [resultGifUrl, setResultGifUrl] = useState<string | null>(null);
  const [result, setResult] = useState<{
    bytes: number; width: number; height: number; frames: number; seconds: number; used: string;
    target: { bytes: number; met: boolean } | null; attempts: Array<{ label: string; bytes?: number }>;
  } | null>(null);

  // Ergonomia: Drag and Drop
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragCounterRef = useRef<number>(0);

  // Refs de controle de ciclo de vida
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hiddenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const videoSrcRef = useRef<string | null>(null);
  const resultGifUrlRef = useRef<string | null>(null);

  // Manter refs sincronizadas para cleanup no unmount
  useEffect(() => {
    videoSrcRef.current = videoSrc;
  }, [videoSrc]);

  useEffect(() => {
    resultGifUrlRef.current = resultGifUrl;
  }, [resultGifUrl]);

  // Mede o vídeo exibido para alinhar a camada de preview do chat
  useEffect(() => {
    const v = videoRef.current;
    if (!v) { setVideoBox({ w: 0, h: 0 }); return; }
    const measure = () => setVideoBox({ w: v.clientWidth, h: v.clientHeight });
    measure();
    v.addEventListener('loadedmetadata', measure);
    const ro = new ResizeObserver(measure);
    ro.observe(v);
    return () => { v.removeEventListener('loadedmetadata', measure); ro.disconnect(); };
  }, [videoSrc]);

  // Área do quadro final dentro do vídeo exibido (no modo 1:1 é o recorte central)
  const previewFrame = () => {
    const { w, h } = videoBox;
    if (outSize) return { x: 0, y: 0, w, h }; // o preview já tem a proporção e o ajuste da saída
    if (cropMode === 'square') {
      const side = Math.min(w, h);
      return { x: (w - side) / 2, y: (h - side) / 2, w: side, h: side };
    }
    return { x: 0, y: 0, w, h };
  };

  // Desenha o chat sobre o preview do vídeo (mesma função usada nos quadros do GIF)
  useEffect(() => {
    const cv = overlayRef.current;
    if (!cv) return;
    cv.width = videoBox.w;
    cv.height = videoBox.h;
    const ctx = cv.getContext('2d');
    if (!ctx || !videoBox.w || !videoBox.h) return;
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (!includeChat || !sharedChat) return;
    const fr = previewFrame();
    const sc = (fr.w / sharedChat.refWidth) * (chatScalePct / 100);
    ctx.save();
    ctx.translate(fr.x, fr.y);
    ctx.beginPath();
    ctx.rect(0, 0, fr.w, fr.h);
    ctx.clip();
    renderChatText(ctx, fr.w, fr.h, sc, {
      ...sharedChat.style,
      chatPos: { x: ((chatXPct / 100) * fr.w) / sc, y: ((chatYPct / 100) * fr.h) / sc }
    });
    ctx.restore();
    if (cropMode === 'square' && !outSize) {
      ctx.save();
      ctx.strokeStyle = 'rgba(52, 211, 153, 0.8)';
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(fr.x + 0.5, fr.y + 0.5, fr.w - 1, fr.h - 1);
      ctx.restore();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeChat, sharedChat, chatXPct, chatYPct, chatScalePct, videoBox, cropMode, outSize]);

  const chatPointerPct = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const cv = overlayRef.current!;
    const rect = cv.getBoundingClientRect();
    const fr = previewFrame();
    const px = (e.clientX - rect.left) * (cv.width / rect.width) - fr.x;
    const py = (e.clientY - rect.top) * (cv.height / rect.height) - fr.y;
    return { x: (px / fr.w) * 100, y: (py / fr.h) * 100 };
  };

  const onChatPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!includeChat || e.button !== 0) return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
    const p = chatPointerPct(e);
    chatDragRef.current = { offX: p.x - chatXPct, offY: p.y - chatYPct };
  };
  const onChatPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = chatDragRef.current;
    if (!d) return;
    const p = chatPointerPct(e);
    setChatXPct(Math.round(Math.max(0, Math.min(95, p.x - d.offX)) * 10) / 10);
    setChatYPct(Math.round(Math.max(0, Math.min(95, p.y - d.offY)) * 10) / 10);
  };
  const onChatPointerEnd = () => { chatDragRef.current = null; };

  // Função utilitária para revogação segura de Object URLs (Feature 21)
  const safeRevokeUrl = (url: string | null) => {
    if (url && typeof url === 'string' && url.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // Ignora erros caso o URL já tenha sido revogado
      }
    }
  };

  // Teardown completo no unmount (Feature 21)
  useEffect(() => {
    return () => {
      safeRevokeUrl(videoSrcRef.current);
      safeRevokeUrl(resultGifUrlRef.current);
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
      if (hiddenCanvasRef.current) {
        hiddenCanvasRef.current.width = 0;
        hiddenCanvasRef.current.height = 0;
      }
    };
  }, []);

  // Pausar reprodução do vídeo automaticamente quando a aba fica oculta (Feature 21)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && videoRef.current && !videoRef.current.paused) {
        videoRef.current.pause();
        setIsPlaying(false);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Upload seguro de vídeo com limpeza de URLs anteriores (Feature 21 & Ergonomics)
  const handleVideoUpload = useCallback((file: File) => {
    if (!file.type.startsWith('video/')) return;

    // Revoga URLs anteriores antes de alocar novo
    safeRevokeUrl(videoSrcRef.current);
    safeRevokeUrl(resultGifUrlRef.current);

    const url = URL.createObjectURL(file);
    setVideoSrc(url);
    setResultGifUrl(null);
    setResult(null);
    setIsPlaying(false);
  }, []);

  // Metadados carregados do vídeo
  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      const dur = videoRef.current.duration || 10;
      setVideoDuration(dur);
      setVideoNative({ w: videoRef.current.videoWidth || 1280, h: videoRef.current.videoHeight || 720 });
      setStartTime(0);
      setEndTime(Math.min(5, Math.max(1, Math.floor(dur))));
    }
  };

  // Perfis (Emoji / Avatar / Banner / RP Forum / Personalizado): aplicam enquadramento, FPS e cores no nível atual
  const chooseProfile = (id: GifProfileId) => {
    setCfg(c => applyProfile(c, id));
    setHeavyOk(false);
    const pr = id === 'custom' ? null : GIF_PROFILES[id];
    if (pr?.maxSeconds && endTime - startTime > pr.maxSeconds) {
      setEndTime(Math.min(videoDuration || 10, startTime + 2.0)); // trecho curto para caber no limite (como já era no preset Emoji)
    }
  };
  const setCrop = (crop: 'original' | 'square') =>
    setCfg(c => withManual(c, { frame: { kind: 'width', width: c.frame.kind === 'width' ? c.frame.width : 480, crop } }));
  const applySuggestion = (patch: Suggestion['patch']) => {
    if (patch.w && patch.h) setCfg(c => setCustomSize(c, patch.w!, patch.h!));
    if (patch.fps) setCfg(c => withManual(c, { fps: patch.fps! }));
    if (patch.colors) setCfg(c => withManual(c, { colors: patch.colors! }));
    if (patch.durationS) setEndTime(Math.min(videoDuration || 10, startTime + patch.durationS));
    setHeavyOk(false);
  };

  // Cancelamento da conversão ativa: o AbortSignal termina o worker e libera os canvases (ver gifExport.ts)
  const handleCancel = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsProcessing(false);
    setProgress(0);
    setStatusMessage('Conversão cancelada pelo usuário.');
  };

  const describeSettings = (s: GifSettings, v: { w: number; h: number }) => {
    const d = outputDims(s, v.w, v.h);
    return `${d.w}×${d.h}, ${s.fps} FPS, ${s.colors} cores`;
  };

  // Conversão de vídeo para GIF: captura no thread principal, codificação no Web Worker.
  // Com Smart Export e um alvo de tamanho, tenta configurações cada vez mais leves e MEDE o arquivo de cada tentativa.
  const generateGif = async () => {
    const video = videoRef.current;
    if (!video || !videoSrc || isProcessing) return;
    if (cost?.level === 'blocked') return;
    if (cost?.level === 'heavy' && !heavyOk) {
      setStatusMessage('Configuração pesada: marque "Entendo o risco" ou reduza as configurações.');
      return;
    }

    if (resultGifUrlRef.current) {
      safeRevokeUrl(resultGifUrlRef.current);
      setResultGifUrl(null);
      setResultBlob(null);
    }
    setResult(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsProcessing(true);
    setProgress(0);
    setStatusMessage('Preparando a conversão...');

    video.pause();
    setIsPlaying(false);

    const chat = includeChat && sharedChat ? {
      fullText: sharedChat.style.rawText,
      reveal: chatReveal,
      build: (w: number, h: number, text: string) => {
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        const octx = cv.getContext('2d');
        if (!octx) return null;
        const sc = (w / sharedChat.refWidth) * (chatScalePct / 100);
        renderChatText(octx, w, h, sc, {
          ...sharedChat.style,
          rawText: text,
          chatPos: { x: ((chatXPct / 100) * w) / sc, y: ((chatYPct / 100) * h) / sc }
        });
        return cv;
      }
    } : null;

    const targetBytes = smartExport && profile?.target ? profile.target.bytes : undefined;
    const base = cfg;
    let cur = cfg;
    const log: Array<{ label: string; bytes?: number }> = [];

    try {
      for (let attempt = 1; attempt <= MAX_SMART_ATTEMPTS; attempt++) {
        const last = attempt === MAX_SMART_ATTEMPTS || !targetBytes || !nextLighter(cur, base);
        // na última tentativa possível, gera o arquivo mesmo acima do alvo (e informa o tamanho medido)
        const limit = targetBytes && !last ? targetBytes : undefined;
        const label = describeSettings(cur, videoNative);
        setStatusMessage(attempt > 1 ? `Tentativa ${attempt}: ${label}...` : 'Capturando quadros...');
        const outcome = await exportGif({
          video, settings: cur, startTime, endTime, chat, watermark, signal: controller.signal, maxBytes: limit,
          onProgress: ({ frame, total, bytes, phase }) => {
            setProgress(Math.round((frame / total) * 100));
            setStatusMessage(phase === 'finish' ? 'Finalizando GIF...' : `${attempt > 1 ? `Tentativa ${attempt} · ` : ''}Quadro ${frame}/${total}${bytes ? ` · ${formatBytes(bytes)}` : ''}`);
          }
        });

        if (outcome.status === 'aborted') { setStatusMessage('Conversão cancelada pelo usuário.'); return; }
        if (outcome.status === 'too-large') {
          log.push({ label, bytes: outcome.bytes });
          const next = nextLighter(cur, base);
          if (next) { cur = next; continue; }
          continue; // sem mais reduções: a próxima volta é a última e gera sem limite
        }
        if (limit && outcome.bytes > limit) {
          // passou do alvo por poucos bytes (ex.: finalizador do GIF): conta como tentativa fracassada
          log.push({ label, bytes: outcome.bytes });
          const next = nextLighter(cur, base);
          if (next) { cur = next; continue; }
        }
        // pronto: o tamanho abaixo é o do arquivo gerado (medido)
        log.push({ label, bytes: outcome.bytes });
        const url = URL.createObjectURL(outcome.blob);
        setResultGifUrl(url);
        setResultBlob(outcome.blob);
        setResult({
          bytes: outcome.bytes, width: outcome.width, height: outcome.height, frames: outcome.frames,
          seconds: outcome.durationMs / 1000, used: describeSettings(cur, videoNative),
          target: targetBytes ? { bytes: targetBytes, met: outcome.bytes <= targetBytes } : null,
          attempts: log
        });
        setProgress(100);
        setStatusMessage('Concluído!');
        return;
      }
    } catch (err: any) {
      console.error('[GIF export]', err);
      setStatusMessage(
        err instanceof SeekFailure
          ? `Falha no quadro ${err.frame}/${err.total}: ${err.reason}. Tente um intervalo menor ou um vídeo MP4 (H.264).`
          : `Erro: ${err?.message || 'durante a extração de frames.'}`
      );
    } finally {
      abortControllerRef.current = null;
      setIsProcessing(false);
    }
  };

  // Controles de Play / Pause interativos (Feature 22)
  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    }
  };

  // Enviar GIF cortado para a tela de colagem do Editor RP e trocar de aba
  const handleSendToEditorRp = () => {
    if (!resultBlob) return;
    requestSetBackground({
      blob: resultBlob,
      name: `haze-clip-${Date.now()}.gif`,
      isGif: true,
      gifMeta: {
        duration: result?.seconds || Math.max(0.2, endTime - startTime),
        frames: result?.frames || Math.max(1, Math.round((endTime - startTime) * cfg.fps)),
        fps: cfg.fps,
        width: result?.width || 480,
        height: result?.height || 260
      }
    });
    onNavigateToChatLog?.();
  };

  // Formatação de tempo em MM:SS.s (Feature 22)
  const formatTime = (seconds: number): string => {
    if (isNaN(seconds) || seconds < 0) return '00:00.0';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const tenths = Math.floor((seconds % 1) * 10);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${tenths}`;
  };

  // Scrubber de linha do tempo interativo (Feature 22)
  const handleTimelineScrub = (newTime: number) => {
    setCurrentTime(newTime);
    if (videoRef.current) {
      videoRef.current.currentTime = newTime;
    }
  };

  // Atualizar preview ao alterar pontos de corte (Feature 22)
  const handleStartTimeChange = (val: number) => {
    const clamped = Math.max(0, Math.min(val, endTime - 0.2));
    setStartTime(clamped);
    if (videoRef.current) {
      videoRef.current.currentTime = clamped;
      setCurrentTime(clamped);
    }
  };

  const handleEndTimeChange = (val: number) => {
    const maxDur = videoDuration || 30;
    const clamped = Math.min(maxDur, Math.max(val, startTime + 0.2));
    setEndTime(clamped);
    if (videoRef.current) {
      videoRef.current.currentTime = clamped;
      setCurrentTime(clamped);
    }
  };

  // Handlers para Drag and Drop HTML5 com contador anti-flicker (Ergonomics)
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDragging(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('video/')) {
      handleVideoUpload(file);
    }
  };

  const profile = cfg.profile === 'custom' ? null : GIF_PROFILES[cfg.profile];
  const dims = outputDims(cfg, videoNative.w, videoNative.h);
  const costInput = {
    w: dims.w, h: dims.h, fps: cfg.fps, durationS: endTime - startTime, speed: cfg.speed, colors: cfg.colors,
    withChat: includeChat && !!sharedChat
  };
  const cost = videoSrc ? estimateCost(costInput) : null;
  const suggestions = cost && cost.level !== 'ok' ? suggestLighter(costInput) : [];

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
      
      {/* Coluna Esquerda: Controles (4 cols) */}
      <div className="lg:col-span-4 space-y-4">
        
        {/* Upload de Vídeo com Drag & Drop HTML5 */}
        <div className="p-4 rounded-2xl bg-haze-panel border border-haze-border shadow-md">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-haze-text flex items-center gap-1.5">
              <Film className="w-3.5 h-3.5" /> Vídeo / Clipe de RP
            </span>
            <span className="text-xs font-mono text-haze-muted">
              {videoDuration > 0 ? `${videoDuration.toFixed(1)}s` : 'MP4, WebM'}
            </span>
          </div>

          <div
            onClick={() => fileInputRef.current?.click()}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`group cursor-pointer border-2 border-dashed rounded-xl p-4 text-center transition-all ${
              isDragging 
                ? 'border-haze-accent bg-haze-accent/10 ring-2 ring-haze-accent/30 scale-[1.01]' 
                : 'border-haze-border hover:border-haze-accent/50 bg-haze-field/40 hover:bg-haze-accent/[0.02]'
            }`}
          >
            <input
              type="file"
              ref={fileInputRef}
              data-testid="video-input"
              onChange={(e) => e.target.files?.[0] && handleVideoUpload(e.target.files[0])}
              accept="video/mp4,video/webm,video/quicktime,video/*"
              className="hidden"
            />
            <div className="flex flex-col items-center gap-2">
              <div className={`p-2.5 rounded-full transition-colors ${
                isDragging 
                  ? 'bg-haze-accent/20 text-haze-accent' 
                  : 'bg-haze-raised/60 text-haze-muted group-hover:text-haze-accent-hover'
              }`}>
                <Upload className="w-5 h-5" />
              </div>
              <p className="text-xs font-medium text-haze-soft">
                {isDragging ? 'Solte o arquivo de vídeo aqui...' : 'Arraste ou selecione um clipe de RP'}
              </p>
              <p className="text-[11px] text-haze-faint">
                MP4, WebM • 100% no navegador sem limite de tamanho
              </p>
            </div>
          </div>
        </div>

        {/* Trim & Corte de Duração com scrub imediato */}
        <div className="p-4 rounded-2xl bg-haze-panel border border-haze-border shadow-md space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-haze-text flex items-center gap-1.5">
              <Scissors className="w-3.5 h-3.5" /> Corte de Tempo (Trim)
            </span>
            <span className="text-xs font-mono text-haze-accent">
              Duração: {(endTime - startTime).toFixed(1)}s
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <label className="text-haze-muted block mb-1">Início (Segundos)</label>
              <input
                type="number"
                min="0"
                max={videoDuration}
                step="0.1"
                value={startTime}
                onChange={(e) => handleStartTimeChange(parseFloat(e.target.value) || 0)}
                className="w-full px-2.5 py-1.5 rounded-lg bg-haze-field border border-haze-border text-white text-xs font-mono focus:border-haze-accent focus:outline-none"
              />
            </div>

            <div>
              <label className="text-haze-muted block mb-1">Fim (Segundos)</label>
              <input
                type="number"
                min={startTime + 0.2}
                max={videoDuration || 30}
                step="0.1"
                value={endTime}
                onChange={(e) => handleEndTimeChange(parseFloat(e.target.value) || 5)}
                className="w-full px-2.5 py-1.5 rounded-lg bg-haze-field border border-haze-border text-white text-xs font-mono focus:border-haze-accent focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Smart Export: perfil, qualidade, resolução e custo */}
        <div className="p-4 rounded-2xl bg-haze-panel border border-haze-border shadow-md space-y-3" data-testid="gif-export-settings">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-haze-text flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" /> Perfil de exportação
            </span>
            <span className="text-[11px] uppercase font-mono px-1.5 py-0.5 rounded bg-haze-raised text-haze-muted" data-testid="gif-profile-badge">
              {cfg.profile === 'custom' ? 'Personalizado' : `${GIF_PROFILES[cfg.profile].label}${cfg.tweaked ? ' (ajustado)' : ''}`}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Perfil do GIF">
            {(['emoji', 'avatar', 'banner', 'forum'] as const).map(id => (
              <button
                key={id}
                type="button"
                aria-pressed={cfg.profile === id}
                onClick={() => chooseProfile(id)}
                className={`p-2 rounded-lg border text-center text-xs transition-colors ${
                  cfg.profile === id
                    ? 'bg-haze-accent/20 border-haze-accent text-white'
                    : 'bg-haze-field hover:bg-haze-raised border-haze-border text-haze-soft'
                }`}
              >
                <div className="font-bold text-haze-accent text-xs">{GIF_PROFILES[id].label}</div>
                <div className="text-[11px] text-haze-muted">{GIF_PROFILES[id].hint}</div>
              </button>
            ))}
            <button
              type="button"
              aria-pressed={cfg.profile === 'custom'}
              onClick={() => chooseProfile('custom')}
              className={`p-2 rounded-lg border text-center text-xs transition-colors ${
                cfg.profile === 'custom'
                  ? 'bg-haze-accent/20 border-haze-accent text-white'
                  : 'bg-haze-field hover:bg-haze-raised border-haze-border text-haze-soft'
              }`}
            >
              <div className="font-bold text-haze-accent text-xs">Personalizado</div>
              <div className="text-[11px] text-haze-muted">Você define tudo</div>
            </button>
          </div>

          {cfg.profile !== 'custom' && (
            <div className="space-y-1.5">
              <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Nível de qualidade">
                {(['quality', 'balanced', 'compact'] as const).map(q => (
                  <button
                    key={q}
                    type="button"
                    aria-pressed={cfg.quality === q}
                    title={GIF_QUALITY_LABELS[q].hint}
                    onClick={() => setCfg(c => applyQuality(c, q))}
                    className={`py-1.5 rounded-lg text-xs border transition-colors ${
                      cfg.quality === q ? 'bg-haze-accent/15 text-haze-accent border-haze-accent/50' : 'border-haze-border text-haze-soft hover:border-haze-accent/30'
                    }`}
                  >
                    {GIF_QUALITY_LABELS[q].label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-haze-faint">{GIF_QUALITY_LABELS[cfg.quality].hint}.</p>
            </div>
          )}

          {profile?.target && (
            <div className="space-y-1.5" data-testid="gif-target">
              <label className="flex items-center gap-2 text-xs text-haze-text cursor-pointer">
                <input type="checkbox" checked={smartExport} onChange={(e) => setSmartExport(e.target.checked)} className="accent-haze-accent" />
                <span className="font-semibold">Smart Export: caber em {formatBytes(profile.target.bytes)}</span>
              </label>
              <p className="text-xs text-haze-faint leading-relaxed">
                {profile.target.note} Verificado em {profile.target.verifiedOn}; as regras podem mudar. O tamanho do arquivo final é sempre medido.
                {' '}<a href={profile.target.source} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-haze-accent-hover">Fonte</a>
              </p>
            </div>
          )}

          {profile && profile.maxSeconds && (endTime - startTime) > profile.maxSeconds && (
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-2 text-xs text-amber-300">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-amber-400 mt-0.5" />
              <span>
                Trecho de {(endTime - startTime).toFixed(1)}s: para este perfil o recomendado é até {profile.maxSeconds}s (a 10 FPS). Quanto mais longo, mais difícil caber no limite.
              </span>
            </div>
          )}

          {/* Modo de Corte / Aspect Ratio (só quando a saída segue a largura escolhida) */}
          {cfg.frame.kind === 'width' && (
            <div className="pt-1">
              <label className="text-haze-muted block mb-1 text-xs">Formato de Recorte</label>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setCrop('original')}
                  className={`py-1.5 px-2 rounded-lg border flex items-center justify-center gap-1.5 text-xs transition-colors ${
                    cropMode === 'original'
                      ? 'bg-haze-accent/20 border-haze-accent text-haze-accent font-bold'
                      : 'bg-haze-field border-haze-border text-haze-muted hover:text-haze-text'
                  }`}
                >
                  <Maximize2 className="w-3.5 h-3.5" /> Proporção Original
                </button>
                <button
                  type="button"
                  onClick={() => setCrop('square')}
                  className={`py-1.5 px-2 rounded-lg border flex items-center justify-center gap-1.5 text-xs transition-colors ${
                    cropMode === 'square'
                      ? 'bg-haze-accent/20 border-haze-accent text-haze-accent font-bold'
                      : 'bg-haze-field border-haze-border text-haze-muted hover:text-haze-text'
                  }`}
                >
                  <Square className="w-3.5 h-3.5" /> 1:1 Quadrado
                </button>
              </div>
              <div className="mt-2">
                <div className="flex justify-between text-xs text-haze-muted mb-1">
                  <span>Largura do GIF</span>
                  <span className="font-mono text-haze-text">{targetWidth}px</span>
                </div>
                <input
                  type="range" min={64} max={1280} step={16} value={targetWidth} aria-label="Largura do GIF"
                  onChange={(e) => setCfg(c => withManual(c, { frame: { kind: 'width', width: parseInt(e.target.value, 10), crop: cropMode } }))}
                  className="w-full accent-haze-accent h-1 bg-haze-raised rounded cursor-pointer"
                />
              </div>
            </div>
          )}

          {/* Resolução e adaptação (mesma função do Editor RP) */}
          <div className="pt-3 border-t border-haze-border space-y-2" data-testid="gif-resolution">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-haze-text">Resolução &amp; Adaptação</span>
              <span className="text-xs font-mono text-haze-soft">{outSize ? `${outSize.w}×${outSize.h}` : 'Original'}</span>
            </div>
            <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Resolução do GIF">
              {GIF_RESOLUTION_PRESETS.map(pr => {
                const active = pr.size === null ? outSize === null : outSize?.w === pr.size.w && outSize?.h === pr.size.h;
                return (
                  <button
                    key={pr.label} type="button" aria-pressed={active}
                    onClick={() => {
                      if (pr.size) { setCfg(c => setCustomSize(c, pr.size!.w, pr.size!.h)); setCustomW(String(pr.size.w)); setCustomH(String(pr.size.h)); }
                      else setCrop('original');
                    }}
                    className={`py-1.5 rounded-lg text-xs border transition-colors ${
                      active ? 'bg-haze-accent/15 text-haze-accent border-haze-accent/50' : 'border-haze-border text-haze-soft hover:border-haze-accent/30'
                    }`}
                  >
                    {pr.label}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number" min={GIF_MIN_RES} max={GIF_MAX_RES} value={customW} aria-label="Largura personalizada do GIF"
                onChange={(e) => setCustomW(e.target.value)}
                className="w-full p-1.5 rounded-lg bg-haze-field border border-haze-border text-xs text-haze-text font-mono"
              />
              <span className="text-haze-faint text-xs">×</span>
              <input
                type="number" min={GIF_MIN_RES} max={GIF_MAX_RES} value={customH} aria-label="Altura personalizada do GIF"
                onChange={(e) => setCustomH(e.target.value)}
                className="w-full p-1.5 rounded-lg bg-haze-field border border-haze-border text-xs text-haze-text font-mono"
              />
              <button
                type="button"
                onClick={() => {
                  const next = clampGifSize(parseInt(customW, 10), parseInt(customH, 10));
                  if (!next) return;
                  setCfg(c => setCustomSize(c, next.w, next.h)); setCustomW(String(next.w)); setCustomH(String(next.h));
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-haze-accent/50 text-haze-accent hover:bg-haze-accent/10"
              >
                Aplicar
              </button>
            </div>
            <p className="text-xs text-haze-faint">Máximo {GIF_MAX_RES}px por lado. Tamanhos grandes geram GIFs pesados.</p>
            <div>
              <span className="text-xs text-haze-muted block mb-1">Modo de adaptação do vídeo</span>
              <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Modo de adaptação do vídeo">
                {([['cover', 'Cover'], ['contain', 'Contain'], ['blur', 'Contain + desfoque'], ['stretch', 'Esticar']] as const).map(([key, label]) => (
                  <button
                    key={key} type="button" aria-pressed={fitMode === key} disabled={!outSize}
                    onClick={() => setCfg(c => c.frame.kind === 'size' ? withManual(c, { frame: { ...c.frame, fit: key } }) : c)}
                    className={`py-1.5 rounded-lg text-xs border transition-colors disabled:opacity-40 ${
                      fitMode === key ? 'bg-haze-accent/15 text-haze-accent border-haze-accent/50' : 'border-haze-border text-haze-soft hover:border-haze-accent/30'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {!outSize && <p className="text-xs text-haze-faint mt-1">Escolha uma resolução para usar o modo de adaptação.</p>}
            </div>
          </div>

          {/* FPS, Velocidade e Cores */}
          <div className="grid grid-cols-3 gap-3 text-xs pt-1">
            <div>
              <label className="text-haze-muted block mb-1">FPS (Quadros/s)</label>
              <select
                value={cfg.fps}
                onChange={(e) => setCfg(c => withManual(c, { fps: parseInt(e.target.value, 10) }))}
                className="w-full px-2 py-1.5 rounded-lg bg-haze-field border border-haze-border text-white text-xs focus:border-haze-accent focus:outline-none"
              >
                {[6, 8, 10, 12, 15, 20].map(v => <option key={v} value={v}>{v} FPS{v === 8 ? ' (Leve)' : v === 10 ? ' (Discord Emoji)' : v === 12 ? ' (Balanceado)' : v === 15 ? ' (Fluido)' : v === 20 ? ' (Alta Taxa)' : ''}</option>)}
              </select>
            </div>

            <div>
              <label className="text-haze-muted block mb-1">Velocidade</label>
              <select
                value={cfg.speed}
                onChange={(e) => setCfg(c => withManual(c, { speed: parseFloat(e.target.value) }))}
                className="w-full px-2 py-1.5 rounded-lg bg-haze-field border border-haze-border text-white text-xs focus:border-haze-accent focus:outline-none"
              >
                <option value={0.5}>0.5× (Slow Motion)</option>
                <option value={1}>1.0× (Normal)</option>
                <option value={1.5}>1.5× (Acelerado)</option>
                <option value={2}>2.0× (Rápido)</option>
              </select>
            </div>

            <div>
              <label className="text-haze-muted block mb-1">Cores</label>
              <select
                aria-label="Cores do GIF"
                value={cfg.colors}
                onChange={(e) => setCfg(c => withManual(c, { colors: clampColors(parseInt(e.target.value, 10)) }))}
                className="w-full px-2 py-1.5 rounded-lg bg-haze-field border border-haze-border text-white text-xs focus:border-haze-accent focus:outline-none"
              >
                {[256, 128, 64, 32, 16].map(v => <option key={v} value={v}>{v} cores{v === 256 ? ' (máx.)' : ''}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-haze-muted block mb-1 text-xs">Marca d'água de texto (Opcional)</label>
            <input
              type="text"
              value={watermark}
              onChange={(e) => setWatermark(e.target.value)}
              placeholder="ex: @HazeRP ou discord.gg/..."
              className="w-full px-3 py-1.5 rounded-lg bg-haze-field border border-haze-border text-white text-xs focus:border-haze-accent focus:outline-none"
            />
          </div>

          {/* Orçamento: estimativa antes de converter */}
          <div
            data-testid="gif-budget"
            data-level={cost?.level ?? 'none'}
            className={`p-3 rounded-xl border text-xs space-y-1.5 ${
              !cost ? 'border-haze-border text-haze-faint'
              : cost.level === 'ok' ? 'border-haze-border bg-haze-field text-haze-soft'
              : cost.level === 'heavy' ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
              : 'border-red-500/40 bg-red-500/10 text-red-200'
            }`}
          >
            {!cost ? <span>Carregue um vídeo para ver a estimativa de tamanho e desempenho.</span> : (
              <>
                <div className="font-semibold text-haze-text">
                  {cost.frames} quadros · {dims.w}×{dims.h} · cerca de {Math.max(1, Math.round(cost.seconds))} s para converter
                </div>
                <div>
                  GIF estimado: ~{formatBytes(cost.outputBytes)} <span className="text-haze-faint">(estimativa; o tamanho real é medido no fim)</span> · memória de pico: ~{Math.round(cost.peakRamBytes / 1048576)} MB
                </div>
                {profile?.target && cost.outputBytes > profile.target.bytes && (
                  <div>Pode passar de {formatBytes(profile.target.bytes)}.{smartExport ? ' O Smart Export vai reduzir qualidade o necessário.' : ' Ative o Smart Export para ajustar sozinho.'}</div>
                )}
                {cost.level !== 'ok' && (
                  <div className="space-y-1.5">
                    <div className="font-semibold">
                      {cost.level === 'blocked' ? 'Configuração pesada demais: reduza antes de converter.' : 'Configuração pesada: pode deixar o navegador lento.'}
                      {' '}({cost.reasons.join('; ')})
                    </div>
                    {suggestions.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {suggestions.map(sg => (
                          <button key={sg.label} type="button" onClick={() => applySuggestion(sg.patch)}
                            className="px-2 py-1 rounded-lg border border-current/40 hover:bg-white/10">
                            {sg.label}
                          </button>
                        ))}
                      </div>
                    )}
                    {cost.level === 'heavy' && (
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={heavyOk} onChange={(e) => setHeavyOk(e.target.checked)} className="accent-haze-accent" />
                        Entendo o risco e quero converter assim mesmo
                      </label>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Chat Log sobre o GIF */}
          <div className="pt-3 border-t border-haze-border space-y-2">
            <label className="flex items-center gap-2 text-xs text-haze-text cursor-pointer">
              <input
                type="checkbox"
                checked={includeChat}
                disabled={!sharedChat}
                onChange={(e) => {
                  setIncludeChat(e.target.checked);
                  // sincroniza com o Chat Log só na 1ª vez; depois mantém a posição que você ajustou
                  if (e.target.checked && !chatPosInitRef.current) { chatPosInitRef.current = true; syncChatPosition(); }
                }}
                className="accent-haze-accent"
              />
              <span className="font-semibold">Incluir chat do Chat Log no GIF</span>
            </label>
            {!sharedChat && (
              <p className="text-xs text-haze-faint">Abra a aba Chat Log uma vez para carregar o chat.</p>
            )}
            {includeChat && sharedChat && (
              <div className="space-y-2">
                <p className="text-xs text-haze-faint leading-relaxed">
                  Usa o texto, os personagens e o estilo (fonte, contorno, fundo, censura) da aba Chat Log.
                  Arraste o texto no preview do vídeo para posicioná-lo.
                </p>
                {([
                  ['Posição X', chatXPct, 0, 95, 1, '%', setChatXPct],
                  ['Posição Y', chatYPct, 0, 95, 1, '%', setChatYPct],
                  ['Escala do chat no vídeo', chatScalePct, 40, 400, 5, '%', setChatScalePct]
                ] as const).map(([label, value, min, max, step, unit, setter]) => (
                  <div key={label}>
                    <div className="flex justify-between text-xs text-haze-muted mb-1">
                      <span>{label}</span>
                      <span className="font-mono text-haze-text">{value}{unit}</span>
                    </div>
                    <input
                      type="range" min={min} max={max} step={step} value={value} aria-label={`Chat no GIF: ${label}`}
                      onChange={(e) => setter(parseFloat(e.target.value))}
                      className="w-full accent-haze-accent h-1 bg-haze-raised rounded cursor-pointer"
                    />
                  </div>
                ))}
                <label className="flex items-center gap-2 text-xs text-haze-soft cursor-pointer">
                  <input
                    type="checkbox"
                    checked={chatReveal}
                    onChange={(e) => setChatReveal(e.target.checked)}
                    className="accent-haze-accent"
                  />
                  Revelar as linhas ao longo do clipe (efeito de digitação)
                </label>
                <button
                  type="button"
                  onClick={syncChatPosition}
                  className="w-full py-1.5 rounded-lg border border-haze-border text-xs text-haze-soft hover:border-haze-accent/40"
                >
                  Usar a posição do Chat Log
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Diálogos & Ações: o mesmo texto do Editor RP, editável aqui */}
        {sharedChat ? (
          <div data-testid="gif-dialog-panel">
          <EditorSection id="gif-dialogos" title="Diálogos e ações" open={dialogOpen} onToggle={() => setDialogOpen(v => !v)}>
            <DialogPanel
              value={chatDraft}
              onChange={onChatTextChange}
              characters={sharedChat.style.characters}
              activeCharId={gifActiveCharId}
              onActiveCharChange={setGifActiveCharId}
              showCharacters
            />
            <div className="p-3 rounded-xl bg-haze-field border border-haze-border space-y-2 text-xs" data-testid="gif-text-style">
              <span className="font-semibold text-haze-text">Texto: fonte e estilo</span>
              <select
                aria-label="Família da fonte"
                value={sharedChat.style.fontFamily}
                onChange={(e) => requestChatStyle({ fontFamily: e.target.value })}
                className="w-full p-2 rounded-lg bg-haze-panel border border-haze-border text-xs text-haze-text focus:outline-none focus:border-haze-accent"
              >
                <optgroup label="Fontes Padrão">
                  {[
                    ['Arial, Helvetica, sans-serif', 'Arial / GTA Standard'],
                    ['ChaletLondonNineteenSixty, Arial, sans-serif', 'Chalet London (GTA V, se instalada)'],
                    ['"JetBrains Mono", monospace', 'JetBrains Mono (Logs / OOC)'],
                    ['"Trebuchet MS", sans-serif', 'Trebuchet MS'],
                    ['Impact, sans-serif', 'Impact'],
                    ['Georgia, serif', 'Georgia']
                  ].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </optgroup>
                {customFonts.length > 0 && (
                  <optgroup label="Fontes Personalizadas (PC)">
                    {customFonts.map(f => (
                      <option key={f.id} value={f.name}>
                        {f.name} ({f.fileName})
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              {([
                ['Tamanho da fonte', sharedChat.style.fontSize, 12, 48, 1, 'px', (n: number) => requestChatStyle({ fontSize: n })],
                ['Espaçamento entre linhas', sharedChat.style.lineHeightFactor, 1.1, 2.2, 0.05, 'x', (n: number) => requestChatStyle({ lineHeightFactor: n })]
              ] as const).map(([label, value, min, max, step, unit, setter]) => (
                <div key={label}>
                  <div className="flex justify-between text-haze-muted mb-1">
                    <span>{label}</span>
                    <span className="font-mono text-haze-text">{unit === 'x' ? value.toFixed(2) : value}{unit}</span>
                  </div>
                  <input
                    type="range" min={min} max={max} step={step} value={value} aria-label={label}
                    onChange={(e) => setter(parseFloat(e.target.value))}
                    className="w-full accent-haze-accent h-1 bg-haze-raised rounded cursor-pointer"
                  />
                </div>
              ))}
              <label className="flex items-center gap-2 text-haze-soft cursor-pointer">
                <input type="checkbox" checked={sharedChat.style.strokeEnabled}
                  onChange={(e) => requestChatStyle({ strokeEnabled: e.target.checked })} className="accent-haze-accent" />
                Contorno
              </label>
              <label className="flex items-center gap-2 text-haze-soft cursor-pointer">
                <input type="checkbox" checked={sharedChat.style.bgEnabled}
                  onChange={(e) => requestChatStyle({ bgEnabled: e.target.checked })} className="accent-haze-accent" />
                Fundo atrás do texto
              </label>
            </div>
            <p className="text-xs text-haze-faint leading-relaxed px-1">
              Este é o mesmo texto da aba Editor RP: o que você muda aqui também muda lá.
              {includeChat ? '' : ' Marque "Incluir chat do Chat Log no GIF" nas opções acima para vê-lo no vídeo.'}
            </p>
          </EditorSection>
          </div>
        ) : (
          <div className="p-4 rounded-2xl bg-haze-panel border border-haze-border text-xs text-haze-faint">
            Diálogos &amp; Ações: abra a aba Editor RP uma vez para carregar o chat.
          </div>
        )}

        {/* Botão de Ação & Botão de Cancelar (Feature 20) */}
        <div className="space-y-2">
          <button
            type="button"
            onClick={generateGif}
            disabled={!videoSrc || isProcessing || cost?.level === 'blocked'}
            className="w-full py-3 px-4 rounded-xl bg-haze-accent-fill hover:bg-haze-accent-fill-hover disabled:opacity-50 disabled:cursor-not-allowed text-haze-on-accent font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg shadow-haze-accent/20 transition-all cursor-pointer"
          >
            {isProcessing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Processando ({progress}%)...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Converter Vídeo para GIF</span>
              </>
            )}
          </button>

          {isProcessing && (
            <button
              type="button"
              onClick={handleCancel}
              className="w-full py-2 px-3 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/40 text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            >
              <X className="w-3.5 h-3.5" /> Cancelar Conversão
            </button>
          )}

          {statusMessage && (
            <p className="text-xs text-center font-mono text-haze-muted">
              {statusMessage}
            </p>
          )}
        </div>

      </div>

      {/* Coluna Direita: Player & Resultado (8 cols) */}
      <div className="lg:col-span-8 flex flex-col gap-4">
        
        {/* Player de Vídeo Original com controles interativos (Feature 22) */}
        <div className="p-4 rounded-2xl bg-haze-panel border border-haze-border shadow-md space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-haze-soft flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5 text-haze-accent" /> Preview do Clipe Original
            </span>
            <span className="text-xs font-mono text-haze-muted flex items-center gap-1">
              <Clock className="w-3 h-3 text-haze-accent" />
              {formatTime(currentTime)} / {formatTime(videoDuration)}
            </span>
          </div>

          <div className="relative rounded-xl overflow-hidden bg-haze-stage border border-haze-border min-h-[300px] flex items-center justify-center">
            {videoSrc ? (
              <div
                className="relative inline-block"
                style={outSize ? { aspectRatio: `${outSize.w} / ${outSize.h}`, width: `min(100%, calc(50vh * ${outSize.w / outSize.h}))`, display: 'block' } : undefined}
                data-testid="gif-preview-frame"
              >
              <video
                ref={videoRef}
                src={videoSrc}
                onLoadedMetadata={handleLoadedMetadata}
                onTimeUpdate={() => videoRef.current && setCurrentTime(videoRef.current.currentTime)}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onEnded={() => setIsPlaying(false)}
                className={outSize ? 'w-full h-full rounded-lg' : 'max-h-[50vh] w-auto object-contain rounded-lg'}
                style={outSize ? { objectFit: fitMode === 'stretch' ? 'fill' : fitMode === 'blur' ? 'contain' : fitMode, background: '#000' } : undefined}
              />
              <canvas
                ref={overlayRef}
                onPointerDown={onChatPointerDown}
                onPointerMove={onChatPointerMove}
                onPointerUp={onChatPointerEnd}
                onPointerCancel={onChatPointerEnd}
                aria-label="Chat sobre o vídeo (arraste para posicionar)"
                style={{ touchAction: 'none', pointerEvents: includeChat ? 'auto' : 'none' }}
                className={`absolute inset-0 w-full h-full rounded-lg ${includeChat ? 'cursor-grab active:cursor-grabbing' : ''}`}
              />
              </div>
            ) : (
              <div className="text-center p-6 text-haze-faint">
                <Film className="w-10 h-10 mx-auto mb-2 opacity-40 text-haze-accent" />
                <p className="text-xs">Faça upload ou arraste um vídeo para iniciar.</p>
              </div>
            )}
          </div>

          {/* Barra de Controles e Scrubber da Linha do Tempo (Feature 22) */}
          {videoSrc && (
            <div className="pt-2 space-y-2">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={togglePlay}
                  className="p-2 rounded-lg bg-haze-accent/20 hover:bg-haze-accent/30 text-haze-accent border border-haze-accent/40 transition-colors"
                  title={isPlaying ? 'Pausar' : 'Reproduzir'}
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>

                <div className="flex-1 flex items-center gap-2">
                  <input
                    type="range"
                    min="0"
                    max={videoDuration || 10}
                    step="0.05"
                    value={currentTime}
                    onChange={(e) => handleTimelineScrub(parseFloat(e.target.value) || 0)}
                    className="w-full accent-haze-accent cursor-pointer h-1.5 bg-haze-field rounded-lg border border-haze-border"
                  />
                </div>

                <span className="text-xs font-mono text-haze-muted min-w-[70px] text-right">
                  {formatTime(currentTime)}
                </span>
              </div>

              {/* Indicadores Visuais da Faixa de Trim */}
              <div className="flex items-center justify-between text-[11px] font-mono text-haze-faint px-1">
                <span>Início Trim: {formatTime(startTime)}</span>
                <span className="text-haze-accent font-bold">Faixa Ativa: {(endTime - startTime).toFixed(1)}s</span>
                <span>Fim Trim: {formatTime(endTime)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Card do GIF Renderizado */}
        {resultGifUrl && (
          <div className="p-4 rounded-2xl bg-haze-panel border border-haze-accent/40 shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-haze-accent" />
                <span className="text-xs font-bold uppercase tracking-wider text-white">
                  GIF Gerado com Sucesso!
                </span>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-haze-accent/20 text-haze-accent" data-testid="gif-result-size">
                  {result ? formatBytes(result.bytes) : ''}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  data-testid="send-to-editor-rp-btn"
                  onClick={handleSendToEditorRp}
                  title="Envia o GIF para o Editor RP e abre a tela para adicionar falas, filtros, câmeras e camadas"
                  className="px-4 py-1.5 rounded-lg border border-haze-accent text-haze-accent hover:bg-haze-accent/15 font-bold text-xs flex items-center gap-1.5 shadow-md shadow-haze-accent/10 transition-all cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" /> Editar no Editor RP
                </button>

                <a
                  href={resultGifUrl}
                  download={`haze-clip-${Date.now()}.gif`}
                  className="px-4 py-1.5 rounded-lg bg-haze-accent-fill hover:bg-haze-accent-fill-hover text-haze-on-accent font-bold text-xs flex items-center gap-1.5 shadow-md shadow-haze-accent/20 transition-all"
                >
                  <Download className="w-4 h-4" /> Baixar GIF
                </a>
              </div>
            </div>

            {result && (
              <div className="space-y-1.5 text-xs" data-testid="gif-result-meta">
                <div className="text-haze-soft font-mono">
                  {result.width}×{result.height} · {result.frames} quadros · convertido em {result.seconds.toFixed(1)} s · {result.used}
                </div>
                {result.target && (
                  <div className={`p-2.5 rounded-xl border ${result.target.met ? 'border-haze-accent/40 bg-haze-accent/10 text-haze-accent' : 'border-amber-500/40 bg-amber-500/10 text-amber-300'}`}>
                    {result.target.met
                      ? `Dentro do limite: ${formatBytes(result.bytes)} (limite ${formatBytes(result.target.bytes)}, medido no arquivo final).`
                      : `Acima do limite: o arquivo ficou com ${formatBytes(result.bytes)} e o limite é ${formatBytes(result.target.bytes)}. Reduza o trecho, a resolução ou use o nível Compacto.`}
                  </div>
                )}
                {result.attempts.length > 1 && (
                  <details className="text-haze-faint">
                    <summary className="cursor-pointer">Tentativas ({result.attempts.length})</summary>
                    <ul className="mt-1 space-y-0.5 font-mono">
                      {result.attempts.map((a, i) => <li key={i}>{i + 1}. {a.label}: {a.bytes ? (i === result.attempts.length - 1 ? `resultado ${formatBytes(a.bytes)}` : `passou de ${formatBytes(a.bytes)}`) : '—'}</li>)}
                    </ul>
                  </details>
                )}
              </div>
            )}

            <div className="rounded-xl overflow-hidden bg-haze-stage border border-haze-border flex items-center justify-center p-2">
              <img
                src={resultGifUrl}
                alt="GIF Result"
                className="max-h-[45vh] w-auto object-contain rounded-lg shadow-lg"
              />
            </div>
          </div>
        )}

      </div>

    </div>
  );
};
