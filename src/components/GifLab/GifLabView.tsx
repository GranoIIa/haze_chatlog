import React, { useState, useRef, useEffect, useCallback, useSyncExternalStore } from 'react';
import { 
  Film, Upload, Scissors, Gauge, Download, Sparkles, AlertCircle, 
  CheckCircle2, Play, Pause, RefreshCw, Eye, X, Square, Maximize2, Clock
} from 'lucide-react';
import type { DiscordPreset } from '../../types';
import { renderChatText } from '../../utils/chatRenderer';
import { getSharedChat, subscribeSharedChat } from '../../utils/chatStore';

export type CropMode = 'original' | 'square';

export const GifLabView: React.FC = () => {
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  // Parâmetros de Trim (Corte)
  const [startTime, setStartTime] = useState<number>(0);
  const [endTime, setEndTime] = useState<number>(5);

  // Parâmetros de GIF & Presets
  const [selectedPreset, setSelectedPreset] = useState<DiscordPreset>('custom');
  const [cropMode, setCropMode] = useState<CropMode>('original');
  const [fps, setFps] = useState<number>(12);
  const [targetWidth, setTargetWidth] = useState<number>(480);
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(1);
  const [watermark, setWatermark] = useState<string>('');

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
  const [gifSizeMb, setGifSizeMb] = useState<string | null>(null);

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
    if (cropMode === 'square') {
      ctx.save();
      ctx.strokeStyle = 'rgba(52, 211, 153, 0.8)';
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(fr.x + 0.5, fr.y + 0.5, fr.w - 1, fr.h - 1);
      ctx.restore();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeChat, sharedChat, chatXPct, chatYPct, chatScalePct, videoBox, cropMode]);

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
    setGifSizeMb(null);
    setIsPlaying(false);
  }, []);

  // Metadados carregados do vídeo
  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      const dur = videoRef.current.duration || 10;
      setVideoDuration(dur);
      setStartTime(0);
      setEndTime(Math.min(5, Math.max(1, Math.floor(dur))));
    }
  };

  // Presets Rápidos para Discord com Crop 1:1 Quadrado (Feature 23)
  const applyPreset = (preset: DiscordPreset) => {
    setSelectedPreset(preset);

    if (preset === 'banner') {
      setTargetWidth(540);
      setCropMode('original');
      setFps(12);
    } else if (preset === 'avatar') {
      setTargetWidth(320);
      setCropMode('square');
      setFps(12);
    } else if (preset === 'emoji') {
      setTargetWidth(128);
      setCropMode('square');
      setFps(10);
      // Limita duração padrão para emojis garantindo < 256 KB
      if (endTime - startTime > 2.5) {
        setEndTime(Math.min(videoDuration || 10, startTime + 2.0));
      }
    } else {
      setTargetWidth(480);
      setCropMode('original');
      setFps(12);
    }
  };

  // Busca de tempo robusta com timeout de 2000ms contra travamentos (Feature 22)
  const seekVideoWithTimeout = (
    video: HTMLVideoElement,
    targetTime: number,
    timeoutMs: number = 2000
  ): Promise<void> => {
    return new Promise((resolve) => {
      const dur = video.duration && !isNaN(video.duration) ? video.duration : targetTime;
      const clamped = Math.max(0, Math.min(targetTime, dur));

      if (Math.abs(video.currentTime - clamped) < 0.005) {
        resolve();
        return;
      }

      let timer: number | null = null;
      let settled = false;

      const cleanup = () => {
        if (timer !== null) {
          clearTimeout(timer);
          timer = null;
        }
        video.removeEventListener('seeked', onSeeked);
        video.removeEventListener('error', onError);
      };

      const onSeeked = () => {
        if (!settled) {
          settled = true;
          cleanup();
          resolve();
        }
      };

      const onError = () => {
        if (!settled) {
          settled = true;
          cleanup();
          resolve();
        }
      };

      timer = window.setTimeout(() => {
        if (!settled) {
          settled = true;
          cleanup();
          resolve();
        }
      }, timeoutMs);

      video.addEventListener('seeked', onSeeked, { once: true });
      video.addEventListener('error', onError, { once: true });
      video.currentTime = clamped;
    });
  };

  // Cancelamento da conversão ativa via AbortController e terminate() (Feature 20)
  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
    setIsProcessing(false);
    setProgress(0);
    setStatusMessage('Conversão cancelada pelo usuário.');
  };

  // Conversão de Vídeo para GIF em background via Web Worker (Features 20, 21, 22, 23)
  const generateGif = async () => {
    const video = videoRef.current;
    if (!video || !videoSrc || isProcessing) return;

    // Teardown de instâncias e blobs antigos
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
    if (resultGifUrlRef.current) {
      safeRevokeUrl(resultGifUrlRef.current);
      setResultGifUrl(null);
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setIsProcessing(true);
    setProgress(0);
    setStatusMessage('Inicializando pipeline Web Worker...');
    setGifSizeMb(null);

    // Pausar vídeo durante a extração
    video.pause();
    setIsPlaying(false);

    const canvas = hiddenCanvasRef.current || document.createElement('canvas');
    hiddenCanvasRef.current = canvas;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      setIsProcessing(false);
      return;
    }

    // Cálculo das dimensões e recorte central 1:1 para presets Avatar e Emoji (Feature 23)
    const vw = video.videoWidth || 1280;
    const vh = video.videoHeight || 720;
    let outWidth = targetWidth;
    let outHeight = targetWidth;
    let sx = 0;
    let sy = 0;
    let sw = vw;
    let sh = vh;

    if (cropMode === 'square') {
      const cropSize = Math.min(vw, vh);
      sx = Math.round((vw - cropSize) / 2);
      sy = Math.round((vh - cropSize) / 2);
      sw = cropSize;
      sh = cropSize;
      outWidth = targetWidth;
      outHeight = targetWidth; // 1:1 exato
    } else {
      const aspectRatio = vh / vw;
      outHeight = Math.round(targetWidth * aspectRatio);
      sx = 0;
      sy = 0;
      sw = vw;
      sh = vh;
    }

    canvas.width = outWidth;
    canvas.height = outHeight;

    // Chat Log sobre cada quadro: renderiza numa camada transparente e reaplica em todos.
    // Com "revelar linhas", a camada é refeita só quando entra uma linha nova.
    const buildChatOverlay = (rawText: string): HTMLCanvasElement | null => {
      if (!sharedChat) return null;
      const cv = document.createElement('canvas');
      cv.width = outWidth;
      cv.height = outHeight;
      const octx = cv.getContext('2d');
      if (!octx) return null;
      const sc = (outWidth / sharedChat.refWidth) * (chatScalePct / 100);
      renderChatText(octx, outWidth, outHeight, sc, {
        ...sharedChat.style,
        rawText,
        chatPos: { x: ((chatXPct / 100) * outWidth) / sc, y: ((chatYPct / 100) * outHeight) / sc }
      });
      return cv;
    };
    const chatLines = sharedChat ? sharedChat.style.rawText.split('\n') : [];
    const chatLineIdx = chatLines.map((l, i) => (l.trim() ? i : -1)).filter(i => i >= 0);
    const revealChat = !!(includeChat && sharedChat && chatReveal && chatLineIdx.length > 1);
    let shownLines = -1;
    let chatOverlay: HTMLCanvasElement | null =
      includeChat && sharedChat && !revealChat ? buildChatOverlay(sharedChat.style.rawText) : null;

    const clipDuration = Math.max(0.2, endTime - startTime);
    const totalFrames = Math.max(1, Math.floor(clipDuration * fps));
    const frameInterval = clipDuration / totalFrames;
    const delayMs = Math.round((1000 / fps) / speedMultiplier);

    // Instanciação nativa do Web Worker (Vite 6 module worker)
    const worker = new Worker(
      new URL('./gifWorker.ts', import.meta.url),
      { type: 'module' }
    );
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent) => {
      const data = e.data;
      if (data.type === 'PROGRESS') {
        if (typeof data.progress === 'number') {
          setProgress(data.progress);
        }
      } else if (data.type === 'DONE') {
        const gifBlob: Blob = data.blob;
        const gifUrl = URL.createObjectURL(gifBlob);
        setResultGifUrl(gifUrl);
        setGifSizeMb((gifBlob.size / (1024 * 1024)).toFixed(2));
        setIsProcessing(false);
        setStatusMessage('Concluído!');
        if (workerRef.current) {
          workerRef.current.terminate();
          workerRef.current = null;
        }
      } else if (data.type === 'ERROR') {
        console.error('[GifWorker Error]:', data.error);
        setIsProcessing(false);
        setStatusMessage(`Erro: ${data.error}`);
        if (workerRef.current) {
          workerRef.current.terminate();
          workerRef.current = null;
        }
      }
    };

    worker.onerror = (err) => {
      console.error('[Worker Runtime Error]:', err);
      setIsProcessing(false);
      setStatusMessage('Falha crítica no Web Worker.');
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };

    // Iniciar encoder no Worker
    worker.postMessage({
      type: 'START',
      width: outWidth,
      height: outHeight,
      delay: delayMs,
      totalFrames
    });

    // Loop de extração de frames no thread principal e streaming zero-copy para o Worker
    try {
      for (let i = 0; i < totalFrames; i++) {
        if (abortController.signal.aborted) break;

        const frameTime = startTime + i * frameInterval;
        setStatusMessage(`Capturando quadro ${i + 1}/${totalFrames}...`);

        await seekVideoWithTimeout(video, frameTime, 2000);
        if (abortController.signal.aborted) break;

        // Renderizar frame recortado no canvas
        ctx.clearRect(0, 0, outWidth, outHeight);
        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, outWidth, outHeight);

        if (revealChat) {
          // 80% do clipe revela as linhas; o restante mostra o chat completo
          const t = Math.min(1, (i + 1) / Math.max(1, Math.floor(totalFrames * 0.8)));
          const n = Math.max(1, Math.ceil(chatLineIdx.length * t));
          if (n !== shownLines) {
            shownLines = n;
            chatOverlay = buildChatOverlay(chatLines.slice(0, chatLineIdx[n - 1] + 1).join('\n'));
          }
        }
        if (chatOverlay) ctx.drawImage(chatOverlay, 0, 0);

        // Marca d'água opcional
        if (watermark.trim()) {
          ctx.save();
          ctx.font = 'bold 12px "Inter", sans-serif';
          ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
          ctx.shadowColor = 'rgba(0,0,0,0.8)';
          ctx.shadowBlur = 4;
          ctx.fillText(watermark, 10, outHeight - 10);
          ctx.restore();
        }

        const imgData = ctx.getImageData(0, 0, outWidth, outHeight);
        const buffer = imgData.data.buffer;

        // Zero-copy transfer: a propriedade buffer do ArrayBuffer é transferida instantaneamente
        worker.postMessage(
          {
            type: 'ADD_FRAME',
            frameData: imgData,
            buffer: buffer,
            delay: delayMs
          },
          [buffer]
        );
      }

      if (!abortController.signal.aborted) {
        setStatusMessage('Comprimindo LZW e finalizando GIF...');
        worker.postMessage({ type: 'FINISH' });
      }
    } catch (err: any) {
      console.error('[Capture Loop Error]:', err);
      setIsProcessing(false);
      setStatusMessage('Erro durante a extração de frames.');
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
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

  const isEmojiPreset = selectedPreset === 'emoji';
  const durationExceedsEmoji = isEmojiPreset && (endTime - startTime) > 2.5;

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
      
      {/* Coluna Esquerda: Controles (4 cols) */}
      <div className="lg:col-span-4 space-y-4">
        
        {/* Upload de Vídeo com Drag & Drop HTML5 */}
        <div className="p-4 rounded-2xl bg-[#121722] border border-[#1E2638] shadow-md">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <Film className="w-3.5 h-3.5" /> Vídeo / Clipe de RP
            </span>
            <span className="text-[11px] font-mono text-slate-400">
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
                ? 'border-emerald-500 bg-emerald-500/10 ring-2 ring-emerald-500/30 scale-[1.01]' 
                : 'border-[#1E2638] hover:border-emerald-500/50 bg-[#0B0E14]/40 hover:bg-emerald-500/[0.02]'
            }`}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => e.target.files?.[0] && handleVideoUpload(e.target.files[0])}
              accept="video/mp4,video/webm,video/quicktime,video/*"
              className="hidden"
            />
            <div className="flex flex-col items-center gap-2">
              <div className={`p-2.5 rounded-full transition-colors ${
                isDragging 
                  ? 'bg-emerald-500/20 text-emerald-400' 
                  : 'bg-slate-800/60 text-slate-400 group-hover:text-emerald-400'
              }`}>
                <Upload className="w-5 h-5" />
              </div>
              <p className="text-xs font-medium text-slate-300">
                {isDragging ? 'Solte o arquivo de vídeo aqui...' : 'Arraste ou selecione um clipe de RP'}
              </p>
              <p className="text-[10px] text-slate-500">
                MP4, WebM • 100% no navegador sem limite de tamanho
              </p>
            </div>
          </div>
        </div>

        {/* Trim & Corte de Duração com scrub imediato */}
        <div className="p-4 rounded-2xl bg-[#121722] border border-[#1E2638] shadow-md space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <Scissors className="w-3.5 h-3.5" /> Corte de Tempo (Trim)
            </span>
            <span className="text-[11px] font-mono text-emerald-400">
              Duração: {(endTime - startTime).toFixed(1)}s
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <label className="text-slate-400 block mb-1">Início (Segundos)</label>
              <input
                type="number"
                min="0"
                max={videoDuration}
                step="0.1"
                value={startTime}
                onChange={(e) => handleStartTimeChange(parseFloat(e.target.value) || 0)}
                className="w-full px-2.5 py-1.5 rounded-lg bg-[#0B0E14] border border-[#1E2638] text-white text-xs font-mono focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-slate-400 block mb-1">Fim (Segundos)</label>
              <input
                type="number"
                min={startTime + 0.2}
                max={videoDuration || 30}
                step="0.1"
                value={endTime}
                onChange={(e) => handleEndTimeChange(parseFloat(e.target.value) || 5)}
                className="w-full px-2.5 py-1.5 rounded-lg bg-[#0B0E14] border border-[#1E2638] text-white text-xs font-mono focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Presets Rápidos Discord & Configurações de Dimensão */}
        <div className="p-4 rounded-2xl bg-[#121722] border border-[#1E2638] shadow-md space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" /> Presets Discord (1-Clique)
            </span>
            <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
              {cropMode === 'square' ? '1:1 Quadrado' : 'Original'}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            <button
              type="button"
              onClick={() => applyPreset('banner')}
              className={`p-2 rounded-lg border text-center text-xs transition-colors ${
                selectedPreset === 'banner'
                  ? 'bg-emerald-500/20 border-emerald-500 text-white'
                  : 'bg-[#0B0E14] hover:bg-slate-800 border-[#1E2638] text-slate-300'
              }`}
            >
              <div className="font-bold text-emerald-400 text-[11px]">Banner Nitro</div>
              <div className="text-[9px] text-slate-400">540p (Original)</div>
            </button>

            <button
              type="button"
              onClick={() => applyPreset('avatar')}
              className={`p-2 rounded-lg border text-center text-xs transition-colors ${
                selectedPreset === 'avatar'
                  ? 'bg-emerald-500/20 border-emerald-500 text-white'
                  : 'bg-[#0B0E14] hover:bg-slate-800 border-[#1E2638] text-slate-300'
              }`}
            >
              <div className="font-bold text-emerald-400 text-[11px]">Avatar 1:1</div>
              <div className="text-[9px] text-slate-400">320x320</div>
            </button>

            <button
              type="button"
              onClick={() => applyPreset('emoji')}
              className={`p-2 rounded-lg border text-center text-xs transition-colors ${
                selectedPreset === 'emoji'
                  ? 'bg-emerald-500/20 border-emerald-500 text-white'
                  : 'bg-[#0B0E14] hover:bg-slate-800 border-[#1E2638] text-slate-300'
              }`}
            >
              <div className="font-bold text-emerald-400 text-[11px]">Emoji 1:1</div>
              <div className="text-[9px] text-slate-400">&lt;256KB (128p)</div>
            </button>
          </div>

          {/* Aviso de Tamanho para Presets de Emoji (Feature 23) */}
          {durationExceedsEmoji && (
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-2 text-[11px] text-amber-300">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-amber-400 mt-0.5" />
              <span>
                <strong>Atenção ao limite de 256 KB:</strong> Duração atual de {(endTime - startTime).toFixed(1)}s pode exceder o limite do Discord para emojis. Recomendado: ≤ 2.5s a 10 FPS.
              </span>
            </div>
          )}

          {/* Modo de Corte / Aspect Ratio */}
          <div className="pt-1">
            <label className="text-slate-400 block mb-1 text-xs">Formato de Recorte</label>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => setCropMode('original')}
                className={`py-1.5 px-2 rounded-lg border flex items-center justify-center gap-1.5 text-xs transition-colors ${
                  cropMode === 'original'
                    ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 font-bold'
                    : 'bg-[#0B0E14] border-[#1E2638] text-slate-400 hover:text-slate-200'
                }`}
              >
                <Maximize2 className="w-3.5 h-3.5" /> Proporção Original
              </button>
              <button
                type="button"
                onClick={() => setCropMode('square')}
                className={`py-1.5 px-2 rounded-lg border flex items-center justify-center gap-1.5 text-xs transition-colors ${
                  cropMode === 'square'
                    ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 font-bold'
                    : 'bg-[#0B0E14] border-[#1E2638] text-slate-400 hover:text-slate-200'
                }`}
              >
                <Square className="w-3.5 h-3.5" /> 1:1 Quadrado
              </button>
            </div>
          </div>

          {/* FPS e Velocidade */}
          <div className="grid grid-cols-2 gap-3 text-xs pt-1">
            <div>
              <label className="text-slate-400 block mb-1">FPS (Quadros/s)</label>
              <select
                value={fps}
                onChange={(e) => setFps(parseInt(e.target.value))}
                className="w-full px-2 py-1.5 rounded-lg bg-[#0B0E14] border border-[#1E2638] text-white text-xs focus:border-emerald-500 focus:outline-none"
              >
                <option value={8}>8 FPS (Leve)</option>
                <option value={10}>10 FPS (Discord Emoji)</option>
                <option value={12}>12 FPS (Balanceado)</option>
                <option value={15}>15 FPS (Fluido)</option>
                <option value={20}>20 FPS (Alta Taxa)</option>
              </select>
            </div>

            <div>
              <label className="text-slate-400 block mb-1">Velocidade</label>
              <select
                value={speedMultiplier}
                onChange={(e) => setSpeedMultiplier(parseFloat(e.target.value))}
                className="w-full px-2 py-1.5 rounded-lg bg-[#0B0E14] border border-[#1E2638] text-white text-xs focus:border-emerald-500 focus:outline-none"
              >
                <option value={0.5}>0.5× (Slow Motion)</option>
                <option value={1}>1.0× (Normal)</option>
                <option value={1.5}>1.5× (Acelerado)</option>
                <option value={2}>2.0× (Rápido)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-slate-400 block mb-1 text-xs">Marca d'água de texto (Opcional)</label>
            <input
              type="text"
              value={watermark}
              onChange={(e) => setWatermark(e.target.value)}
              placeholder="ex: @HazeRP ou discord.gg/..."
              className="w-full px-3 py-1.5 rounded-lg bg-[#0B0E14] border border-[#1E2638] text-white text-xs focus:border-emerald-500 focus:outline-none"
            />
          </div>

          {/* Chat Log sobre o GIF */}
          <div className="pt-3 border-t border-[#1E2638] space-y-2">
            <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={includeChat}
                disabled={!sharedChat}
                onChange={(e) => {
                  setIncludeChat(e.target.checked);
                  // sincroniza com o Chat Log só na 1ª vez; depois mantém a posição que você ajustou
                  if (e.target.checked && !chatPosInitRef.current) { chatPosInitRef.current = true; syncChatPosition(); }
                }}
                className="accent-emerald-500"
              />
              <span className="font-semibold">Incluir chat do Chat Log no GIF</span>
            </label>
            {!sharedChat && (
              <p className="text-[11px] text-slate-500">Abra a aba Chat Log uma vez para carregar o chat.</p>
            )}
            {includeChat && sharedChat && (
              <div className="space-y-2">
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Usa o texto, os personagens e o estilo (fonte, contorno, fundo, censura) da aba Chat Log.
                  Arraste o texto no preview do vídeo para posicioná-lo.
                </p>
                {([
                  ['Posição X', chatXPct, 0, 95, 1, '%', setChatXPct],
                  ['Posição Y', chatYPct, 0, 95, 1, '%', setChatYPct],
                  ['Tamanho do texto', chatScalePct, 40, 400, 5, '%', setChatScalePct]
                ] as const).map(([label, value, min, max, step, unit, setter]) => (
                  <div key={label}>
                    <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                      <span>{label}</span>
                      <span className="font-mono text-slate-200">{value}{unit}</span>
                    </div>
                    <input
                      type="range" min={min} max={max} step={step} value={value} aria-label={`Chat no GIF: ${label}`}
                      onChange={(e) => setter(parseFloat(e.target.value))}
                      className="w-full accent-emerald-500 h-1 bg-slate-800 rounded cursor-pointer"
                    />
                  </div>
                ))}
                <label className="flex items-center gap-2 text-[11px] text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={chatReveal}
                    onChange={(e) => setChatReveal(e.target.checked)}
                    className="accent-emerald-500"
                  />
                  Revelar as linhas ao longo do clipe (efeito de digitação)
                </label>
                <button
                  type="button"
                  onClick={syncChatPosition}
                  className="w-full py-1.5 rounded-lg border border-[#1E2638] text-[11px] text-slate-300 hover:border-emerald-500/40"
                >
                  Usar a posição do Chat Log
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Botão de Ação & Botão de Cancelar (Feature 20) */}
        <div className="space-y-2">
          <button
            type="button"
            onClick={generateGif}
            disabled={!videoSrc || isProcessing}
            className="w-full py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all cursor-pointer"
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
            <p className="text-[11px] text-center font-mono text-slate-400">
              {statusMessage}
            </p>
          )}
        </div>

      </div>

      {/* Coluna Direita: Player & Resultado (8 cols) */}
      <div className="lg:col-span-8 flex flex-col gap-4">
        
        {/* Player de Vídeo Original com controles interativos (Feature 22) */}
        <div className="p-4 rounded-2xl bg-[#121722] border border-[#1E2638] shadow-md space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5 text-emerald-400" /> Preview do Clipe Original
            </span>
            <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1">
              <Clock className="w-3 h-3 text-emerald-400" />
              {formatTime(currentTime)} / {formatTime(videoDuration)}
            </span>
          </div>

          <div className="relative rounded-xl overflow-hidden bg-[#07090E] border border-[#1E2638] min-h-[300px] flex items-center justify-center">
            {videoSrc ? (
              <div className="relative inline-block">
              <video
                ref={videoRef}
                src={videoSrc}
                onLoadedMetadata={handleLoadedMetadata}
                onTimeUpdate={() => videoRef.current && setCurrentTime(videoRef.current.currentTime)}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onEnded={() => setIsPlaying(false)}
                className="max-h-[50vh] w-auto object-contain rounded-lg"
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
              <div className="text-center p-6 text-slate-500">
                <Film className="w-10 h-10 mx-auto mb-2 opacity-40 text-emerald-400" />
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
                  className="p-2 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/40 transition-colors"
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
                    className="w-full accent-emerald-500 cursor-pointer h-1.5 bg-[#0B0E14] rounded-lg border border-[#1E2638]"
                  />
                </div>

                <span className="text-[11px] font-mono text-slate-400 min-w-[70px] text-right">
                  {formatTime(currentTime)}
                </span>
              </div>

              {/* Indicadores Visuais da Faixa de Trim */}
              <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 px-1">
                <span>Início Trim: {formatTime(startTime)}</span>
                <span className="text-emerald-400 font-bold">Faixa Ativa: {(endTime - startTime).toFixed(1)}s</span>
                <span>Fim Trim: {formatTime(endTime)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Card do GIF Renderizado */}
        {resultGifUrl && (
          <div className="p-4 rounded-2xl bg-[#121722] border border-emerald-500/40 shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-white">
                  GIF Gerado com Sucesso!
                </span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                  {gifSizeMb} MB
                </span>
              </div>

              <a
                href={resultGifUrl}
                download={`haze-clip-${Date.now()}.gif`}
                className="px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-500/20 transition-all"
              >
                <Download className="w-4 h-4" /> Baixar GIF
              </a>
            </div>

            <div className="rounded-xl overflow-hidden bg-[#07090E] border border-[#1E2638] flex items-center justify-center p-2">
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
