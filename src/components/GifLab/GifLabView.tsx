import React, { useState, useRef, useEffect } from 'react';
import { SimpleGifEncoder } from '../../utils/gifEncoder';
import { 
  Film, Upload, Scissors, Gauge, Download, Sparkles, AlertCircle, 
  CheckCircle2, Play, Pause, RefreshCw, Eye
} from 'lucide-react';

export const GifLabView: React.FC = () => {
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  // Parâmetros de Trim (Corte)
  const [startTime, setStartTime] = useState<number>(0);
  const [endTime, setEndTime] = useState<number>(5);

  // Parâmetros de GIF
  const [fps, setFps] = useState<number>(12);
  const [targetWidth, setTargetWidth] = useState<number>(480);
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(1);
  const [watermark, setWatermark] = useState<string>('');

  // Processamento
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [resultGifUrl, setResultGifUrl] = useState<string | null>(null);
  const [gifSizeMb, setGifSizeMb] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hiddenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Manipular upload de vídeo
  const handleVideoUpload = (file: File) => {
    if (!file.type.startsWith('video/')) return;
    const url = URL.createObjectURL(file);
    setVideoSrc(url);
    setResultGifUrl(null);
    setGifSizeMb(null);
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      const dur = videoRef.current.duration || 10;
      setVideoDuration(dur);
      setStartTime(0);
      setEndTime(Math.min(5, Math.floor(dur)));
    }
  };

  // Presets Rápidos para Discord
  const applyDiscordPreset = (preset: 'banner' | 'avatar' | 'emoji') => {
    if (preset === 'banner') {
      setTargetWidth(540);
      setFps(12);
    } else if (preset === 'avatar') {
      setTargetWidth(320);
      setFps(12);
    } else if (preset === 'emoji') {
      setTargetWidth(128);
      setFps(10);
    }
  };

  // Conversão de Vídeo para GIF no Navegador
  const generateGif = async () => {
    const video = videoRef.current;
    if (!video || !videoSrc) return;

    setIsProcessing(true);
    setProgress(0);
    setResultGifUrl(null);

    const canvas = hiddenCanvasRef.current || document.createElement('canvas');
    hiddenCanvasRef.current = canvas;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    // Calcular proporção e dimensões
    const aspectRatio = (video.videoHeight || 720) / (video.videoWidth || 1280);
    const outWidth = targetWidth;
    const outHeight = Math.round(targetWidth * aspectRatio);

    canvas.width = outWidth;
    canvas.height = outHeight;

    const clipDuration = Math.max(0.5, endTime - startTime);
    const totalFrames = Math.floor(clipDuration * fps);
    const frameInterval = clipDuration / totalFrames;
    const delayMs = Math.round((1000 / fps) / speedMultiplier);

    const encoder = new SimpleGifEncoder(outWidth, outHeight, delayMs);
    encoder.start();

    // Capturar cada frame do vídeo pausando e buscando o timestamp exato
    const captureFrameAt = (time: number): Promise<void> => {
      return new Promise((resolve) => {
        video.currentTime = time;
        const onSeeked = () => {
          video.removeEventListener('seeked', onSeeked);
          ctx.drawImage(video, 0, 0, outWidth, outHeight);

          // Marca d'água opcional
          if (watermark.trim()) {
            ctx.font = 'bold 12px "Inter", sans-serif';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
            ctx.shadowColor = 'rgba(0,0,0,0.8)';
            ctx.shadowBlur = 4;
            ctx.fillText(watermark, 10, outHeight - 10);
          }

          encoder.addFrame(ctx);
          resolve();
        };
        video.addEventListener('seeked', onSeeked);
      });
    };

    video.pause();

    for (let i = 0; i < totalFrames; i++) {
      const frameTime = startTime + i * frameInterval;
      await captureFrameAt(frameTime);
      setProgress(Math.round(((i + 1) / totalFrames) * 100));
    }

    const gifBlob = encoder.finish();
    const gifUrl = URL.createObjectURL(gifBlob);
    setResultGifUrl(gifUrl);
    setGifSizeMb((gifBlob.size / (1024 * 1024)).toFixed(2));
    setIsProcessing(false);
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play();
      setIsPlaying(true);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
      
      {/* Coluna Esquerda: Controles (4 cols) */}
      <div className="lg:col-span-4 space-y-4">
        
        {/* Upload de Vídeo */}
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
            className="group cursor-pointer border-2 border-dashed border-[#1E2638] hover:border-emerald-500/50 rounded-xl p-4 text-center transition-all bg-[#0B0E14]/40 hover:bg-emerald-500/[0.02]"
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => e.target.files?.[0] && handleVideoUpload(e.target.files[0])}
              accept="video/*"
              className="hidden"
            />
            <div className="flex flex-col items-center gap-2">
              <div className="p-2.5 rounded-full bg-slate-800/60 text-slate-400 group-hover:text-emerald-400 transition-colors">
                <Upload className="w-5 h-5" />
              </div>
              <p className="text-xs font-medium text-slate-300">
                Selecione um clipe de ação ou tiroteio
              </p>
              <p className="text-[10px] text-slate-500">
                Processamento 100% no seu navegador sem limite de tamanho
              </p>
            </div>
          </div>
        </div>

        {/* Trim & Corte de Duração */}
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
                step="0.5"
                value={startTime}
                onChange={(e) => setStartTime(Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-full px-2.5 py-1.5 rounded-lg bg-[#0B0E14] border border-[#1E2638] text-white text-xs font-mono"
              />
            </div>

            <div>
              <label className="text-slate-400 block mb-1">Fim (Segundos)</label>
              <input
                type="number"
                min={startTime + 0.5}
                max={videoDuration || 30}
                step="0.5"
                value={endTime}
                onChange={(e) => setEndTime(Math.min(videoDuration || 30, parseFloat(e.target.value) || 5))}
                className="w-full px-2.5 py-1.5 rounded-lg bg-[#0B0E14] border border-[#1E2638] text-white text-xs font-mono"
              />
            </div>
          </div>
        </div>

        {/* Presets Rápidos Discord & Otimização */}
        <div className="p-4 rounded-2xl bg-[#121722] border border-[#1E2638] shadow-md space-y-3">
          <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" /> Presets de 1 Clique (Discord)
          </span>

          <div className="grid grid-cols-3 gap-1.5">
            <button
              onClick={() => applyDiscordPreset('banner')}
              className="p-2 rounded-lg bg-[#0B0E14] hover:bg-slate-800 border border-[#1E2638] text-center text-xs text-slate-300 transition-colors"
            >
              <div className="font-bold text-emerald-400 text-[11px]">Banner Nitro</div>
              <div className="text-[9px] text-slate-500">&lt;10MB (540p)</div>
            </button>

            <button
              onClick={() => applyDiscordPreset('avatar')}
              className="p-2 rounded-lg bg-[#0B0E14] hover:bg-slate-800 border border-[#1E2638] text-center text-xs text-slate-300 transition-colors"
            >
              <div className="font-bold text-emerald-400 text-[11px]">Avatar</div>
              <div className="text-[9px] text-slate-500">&lt;8MB (320p)</div>
            </button>

            <button
              onClick={() => applyDiscordPreset('emoji')}
              className="p-2 rounded-lg bg-[#0B0E14] hover:bg-slate-800 border border-[#1E2638] text-center text-xs text-slate-300 transition-colors"
            >
              <div className="font-bold text-emerald-400 text-[11px]">Emoji</div>
              <div className="text-[9px] text-slate-500">&lt;256KB (128p)</div>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs pt-1">
            <div>
              <label className="text-slate-400 block mb-1">FPS (Quadros/s)</label>
              <select
                value={fps}
                onChange={(e) => setFps(parseInt(e.target.value))}
                className="w-full px-2 py-1.5 rounded-lg bg-[#0B0E14] border border-[#1E2638] text-white text-xs"
              >
                <option value={8}>8 FPS (Leve)</option>
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
                className="w-full px-2 py-1.5 rounded-lg bg-[#0B0E14] border border-[#1E2638] text-white text-xs"
              >
                <option value={0.5}>0.5× (Slow Motion)</option>
                <option value={1}>1.0× (Normal)</option>
                <option value={1.5}>1.5× (Acelerado)</option>
                <option value={2}>2.0× (Fast)</option>
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
              className="w-full px-3 py-1.5 rounded-lg bg-[#0B0E14] border border-[#1E2638] text-white text-xs"
            />
          </div>
        </div>

        {/* Botão de Ação */}
        <button
          onClick={generateGif}
          disabled={!videoSrc || isProcessing}
          className="w-full py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all"
        >
          {isProcessing ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Gerando GIF ({progress}%)...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              <span>Converter Vídeo para GIF</span>
            </>
          )}
        </button>

      </div>

      {/* Coluna Direita: Player & Resultado (8 cols) */}
      <div className="lg:col-span-8 flex flex-col gap-4">
        
        {/* Player de Vídeo Original */}
        <div className="p-4 rounded-2xl bg-[#121722] border border-[#1E2638] shadow-md space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5 text-emerald-400" /> Preview do Clipe Original
            </span>
          </div>

          <div className="relative rounded-xl overflow-hidden bg-[#07090E] border border-[#1E2638] min-h-[300px] flex items-center justify-center">
            {videoSrc ? (
              <video
                ref={videoRef}
                src={videoSrc}
                onLoadedMetadata={handleLoadedMetadata}
                onTimeUpdate={() => videoRef.current && setCurrentTime(videoRef.current.currentTime)}
                controls
                className="max-h-[50vh] w-auto object-contain rounded-lg"
              />
            ) : (
              <div className="text-center p-6 text-slate-500">
                <Film className="w-10 h-10 mx-auto mb-2 opacity-40 text-emerald-400" />
                <p className="text-xs">Faça upload de um vídeo na barra lateral para iniciar.</p>
              </div>
            )}
          </div>
        </div>

        {/* Card do GIF Renderizado */}
        {resultGifUrl && (
          <div className="p-4 rounded-2xl bg-[#121722] border border-emerald-500/40 shadow-xl space-y-3 animate-fade-in">
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
