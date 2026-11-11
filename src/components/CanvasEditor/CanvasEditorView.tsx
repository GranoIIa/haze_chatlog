import React, { useState, useRef, useEffect } from 'react';
import { CanvasLayer } from '../../types';
import { RP_PRESETS } from '../../utils/rpPresets';
import { RP_STICKERS } from '../../utils/rpStickers';
import { PhotoAdjustments, DEFAULT_ADJUSTMENTS, applyPhotoAdjustments } from '../../utils/photoFilters';
import { 
  Palette, Type, Image as ImageIcon, Sparkles, Layers, Eye, EyeOff, 
  Trash2, ArrowUp, ArrowDown, Download, ShieldAlert,
  Camera, Tv, ShieldCheck, Crosshair, Plane, Car, Sliders, Clapperboard, Sun
} from 'lucide-react';

export const CanvasEditorView: React.FC = () => {
  const [layers, setLayers] = useState<CanvasLayer[]>([
    {
      id: 'bg-layer',
      type: 'preset',
      name: 'Preset: Bodycam Policial',
      x: 0,
      y: 0,
      width: 1280,
      height: 720,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      presetType: 'bodycam',
      presetData: { ...RP_PRESETS.bodycam.defaultData }
    }
  ]);

  const [selectedLayerId, setSelectedLayerId] = useState<string | null>('bg-layer');
  const [canvasDimensions, setCanvasDimensions] = useState<{ width: number; height: number }>({ width: 1280, height: 720 });
  const [backgroundImage, setBackgroundImage] = useState<HTMLImageElement | null>(null);

  // Retoque Fotográfico
  const [adjustments, setAdjustments] = useState<PhotoAdjustments>({ ...DEFAULT_ADJUSTMENTS });

  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const selectedLayer = layers.find(l => l.id === selectedLayerId);

  const handleBgUpload = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        setBackgroundImage(img);
        setCanvasDimensions({ width: img.naturalWidth || 1280, height: img.naturalHeight || 720 });
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const addTextLayer = () => {
    const newLayer: CanvasLayer = {
      id: `text-${Date.now()}`,
      type: 'text',
      name: 'Texto Customizado',
      content: 'DIGITE SEU TEXTO AQUI',
      x: canvasDimensions.width / 2 - 150,
      y: canvasDimensions.height / 2 - 20,
      width: 300,
      height: 50,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      fontSize: 32,
      fontFamily: 'Inter, sans-serif',
      color: '#ffffff',
      fontWeight: 'bold',
      shadow: { color: 'rgba(0,0,0,0.8)', blur: 6, offsetX: 2, offsetY: 2 }
    };
    setLayers(prev => [...prev, newLayer]);
    setSelectedLayerId(newLayer.id);
  };

  const applyPreset = (presetKey: 'bodycam' | 'weazel' | 'flir' | 'dashcam' | 'cctv' | 'mugshot') => {
    const preset = (RP_PRESETS as any)[presetKey];
    if (!preset) return;

    const newLayer: CanvasLayer = {
      id: `preset-${Date.now()}`,
      type: 'preset',
      name: `Preset: ${preset.name}`,
      x: 0,
      y: 0,
      width: canvasDimensions.width,
      height: canvasDimensions.height,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      presetType: presetKey as any,
      presetData: { ...preset.defaultData }
    };
    setLayers(prev => [...prev, newLayer]);
    setSelectedLayerId(newLayer.id);
  };

  const addSticker = (stickerId: string) => {
    const sticker = RP_STICKERS.find(s => s.id === stickerId);
    if (!sticker) return;

    let defaultW = 120;
    let defaultH = 120;
    if (sticker.id === 'crime-tape') {
      defaultW = 550;
      defaultH = 45;
    } else if (sticker.id === 'censored-bar') {
      defaultW = 280;
      defaultH = 50;
    } else if (sticker.id.startsWith('evidence-marker')) {
      defaultW = 80;
      defaultH = 90;
    }

    const newLayer: CanvasLayer = {
      id: `sticker-${Date.now()}`,
      type: 'sticker',
      name: `Adesivo: ${sticker.name}`,
      content: sticker.id,
      x: canvasDimensions.width / 2 - defaultW / 2,
      y: canvasDimensions.height / 2 - defaultH / 2,
      width: defaultW,
      height: defaultH,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false
    };
    setLayers(prev => [...prev, newLayer]);
    setSelectedLayerId(newLayer.id);
  };

  const moveLayer = (id: string, direction: 'up' | 'down') => {
    const idx = layers.findIndex(l => l.id === id);
    if (idx === -1) return;
    if (direction === 'up' && idx < layers.length - 1) {
      const copy = [...layers];
      [copy[idx], copy[idx + 1]] = [copy[idx + 1], copy[idx]];
      setLayers(copy);
    } else if (direction === 'down' && idx > 0) {
      const copy = [...layers];
      [copy[idx], copy[idx - 1]] = [copy[idx - 1], copy[idx]];
      setLayers(copy);
    }
  };

  const deleteLayer = (id: string) => {
    setLayers(prev => prev.filter(l => l.id !== id));
    if (selectedLayerId === id) setSelectedLayerId(null);
  };

  const renderCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    canvas.width = canvasDimensions.width;
    canvas.height = canvasDimensions.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Fundo
    if (backgroundImage) {
      ctx.drawImage(backgroundImage, 0, 0, canvas.width, canvas.height);
    } else {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1;
      for (let x = 0; x < canvas.width; x += 50) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += 50) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
      }
    }

    // 2. Retoque Fotográfico na Foto de Fundo
    applyPhotoAdjustments(ctx, canvas.width, canvas.height, adjustments);

    // 3. Renderizar Camadas
    layers.forEach(layer => {
      if (!layer.visible) return;

      ctx.save();
      ctx.globalAlpha = layer.opacity;

      if (layer.type === 'preset' && layer.presetType) {
        const renderer = (RP_PRESETS as any)[layer.presetType];
        if (renderer) {
          renderer.draw(ctx, canvas.width, canvas.height, layer.presetData || {});
        }
      } else if (layer.type === 'sticker' && layer.content) {
        const sticker = RP_STICKERS.find(s => s.id === layer.content);
        if (sticker) {
          sticker.draw(ctx, layer.x, layer.y, layer.width, layer.height);
        }
      } else if (layer.type === 'text' && layer.content) {
        ctx.font = `${layer.fontWeight || 'bold'} ${layer.fontSize || 32}px ${layer.fontFamily || 'Inter'}`;
        ctx.fillStyle = layer.color || '#ffffff';
        if (layer.shadow) {
          ctx.shadowColor = layer.shadow.color;
          ctx.shadowBlur = layer.shadow.blur;
          ctx.shadowOffsetX = layer.shadow.offsetX;
          ctx.shadowOffsetY = layer.shadow.offsetY;
        }
        ctx.fillText(layer.content, layer.x, layer.y + (layer.fontSize || 32));
      }

      if (layer.id === selectedLayerId && layer.type !== 'preset') {
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(layer.x - 4, layer.y - 4, layer.width + 8, layer.height + 8);
      }

      ctx.restore();
    });
  };

  useEffect(() => {
    renderCanvas();
  }, [layers, selectedLayerId, canvasDimensions, backgroundImage, adjustments]);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !selectedLayer || selectedLayer.locked || selectedLayer.type === 'preset') return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;

    if (
      mouseX >= selectedLayer.x - 10 &&
      mouseX <= selectedLayer.x + selectedLayer.width + 10 &&
      mouseY >= selectedLayer.y - 10 &&
      mouseY <= selectedLayer.y + selectedLayer.height + 10
    ) {
      setIsDragging(true);
      setDragStart({ x: mouseX - selectedLayer.x, y: mouseY - selectedLayer.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging || !selectedLayer) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;

    const newX = mouseX - dragStart.x;
    const newY = mouseY - dragStart.y;

    setLayers(prev => prev.map(l => l.id === selectedLayer.id ? { ...l, x: newX, y: newY } : l));
  };

  const handleMouseUp = () => setIsDragging(false);

  const exportCanvasImage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `haze-rp-canvas-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
      
      {/* Coluna Esquerda: Ferramentas & Presets (4 cols) */}
      <div className="lg:col-span-4 space-y-4">
        
        {/* Presets de 1 Clique (RP) */}
        <div className="p-4 rounded-2xl bg-[#121722] border border-[#1E2638] shadow-md">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" /> Presets Cinemáticos de RP
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => applyPreset('bodycam')}
              className="p-2.5 rounded-xl bg-[#0B0E14] hover:bg-slate-800/80 border border-[#1E2638] hover:border-emerald-500/50 text-left transition-all"
            >
              <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-xs mb-0.5">
                <Camera className="w-3.5 h-3.5" /> Bodycam AXON
              </div>
              <p className="text-[10px] text-slate-400">Timestamp militar e nome do oficial.</p>
            </button>

            <button
              onClick={() => applyPreset('weazel')}
              className="p-2.5 rounded-xl bg-[#0B0E14] hover:bg-slate-800/80 border border-[#1E2638] hover:border-amber-500/50 text-left transition-all"
            >
              <div className="flex items-center gap-1.5 text-amber-400 font-bold text-xs mb-0.5">
                <Tv className="w-3.5 h-3.5" /> Weazel News
              </div>
              <p className="text-[10px] text-slate-400">Tarja de telejornal ao vivo e GC.</p>
            </button>

            <button
              onClick={() => applyPreset('flir')}
              className="p-2.5 rounded-xl bg-[#0B0E14] hover:bg-slate-800/80 border border-[#1E2638] hover:border-sky-500/50 text-left transition-all"
            >
              <div className="flex items-center gap-1.5 text-sky-400 font-bold text-xs mb-0.5">
                <Plane className="w-3.5 h-3.5" /> FLIR Águia (Helicóptero)
              </div>
              <p className="text-[10px] text-slate-400">Visão aérea térmica com tracking.</p>
            </button>

            <button
              onClick={() => applyPreset('dashcam')}
              className="p-2.5 rounded-xl bg-[#0B0E14] hover:bg-slate-800/80 border border-[#1E2638] hover:border-yellow-500/50 text-left transition-all"
            >
              <div className="flex items-center gap-1.5 text-yellow-400 font-bold text-xs mb-0.5">
                <Car className="w-3.5 h-3.5" /> Dashcam Viatura
              </div>
              <p className="text-[10px] text-slate-400">Câmera de viatura com radar de velocidade.</p>
            </button>

            <button
              onClick={() => applyPreset('cctv')}
              className="p-2.5 rounded-xl bg-[#0B0E14] hover:bg-slate-800/80 border border-[#1E2638] hover:border-green-500/50 text-left transition-all"
            >
              <div className="flex items-center gap-1.5 text-green-400 font-bold text-xs mb-0.5">
                <ShieldCheck className="w-3.5 h-3.5" /> CCTV Segurança
              </div>
              <p className="text-[10px] text-slate-400">Câmera de vigilância e scanlines.</p>
            </button>

            <button
              onClick={() => applyPreset('mugshot')}
              className="p-2.5 rounded-xl bg-[#0B0E14] hover:bg-slate-800/80 border border-[#1E2638] hover:border-red-500/50 text-left transition-all"
            >
              <div className="flex items-center gap-1.5 text-red-400 font-bold text-xs mb-0.5">
                <ShieldAlert className="w-3.5 h-3.5" /> Ficha Criminal
              </div>
              <p className="text-[10px] text-slate-400">Plaqueta policial de detenção.</p>
            </button>
          </div>
        </div>

        {/* Retoque da Foto (Photoshop no Navegador) */}
        <div className="p-4 rounded-2xl bg-[#121722] border border-[#1E2638] shadow-md space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5" /> Ajustes Fotográficos &amp; Foco
            </span>
            <button
              onClick={() => setAdjustments({ ...DEFAULT_ADJUSTMENTS })}
              className="text-[10px] text-slate-400 hover:text-emerald-400"
            >
              Resetar
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-slate-400 block mb-1">Brilho</span>
              <input
                type="range" min="-50" max="50" value={adjustments.brightness}
                onChange={(e) => setAdjustments(prev => ({ ...prev, brightness: parseInt(e.target.value) }))}
                className="w-full accent-emerald-500 h-1 bg-slate-800 rounded cursor-pointer"
              />
            </div>
            <div>
              <span className="text-slate-400 block mb-1">Contraste</span>
              <input
                type="range" min="-50" max="50" value={adjustments.contrast}
                onChange={(e) => setAdjustments(prev => ({ ...prev, contrast: parseInt(e.target.value) }))}
                className="w-full accent-emerald-500 h-1 bg-slate-800 rounded cursor-pointer"
              />
            </div>
            <div>
              <span className="text-slate-400 block mb-1">Nitidez (Sharpen)</span>
              <input
                type="range" min="0" max="100" value={adjustments.sharpen}
                onChange={(e) => setAdjustments(prev => ({ ...prev, sharpen: parseInt(e.target.value) }))}
                className="w-full accent-emerald-500 h-1 bg-slate-800 rounded cursor-pointer"
              />
            </div>
            <div>
              <span className="text-slate-400 block mb-1">Depth of Field (Bokeh)</span>
              <input
                type="range" min="0" max="100" value={adjustments.depthOfField}
                onChange={(e) => setAdjustments(prev => ({ ...prev, depthOfField: parseInt(e.target.value) }))}
                className="w-full accent-emerald-500 h-1 bg-slate-800 rounded cursor-pointer"
              />
            </div>
          </div>

          <button
            onClick={() => setAdjustments(prev => ({ ...prev, letterbox: !prev.letterbox }))}
            className={`w-full py-1.5 px-3 rounded-lg border flex items-center justify-center gap-1.5 text-xs font-semibold transition-all ${
              adjustments.letterbox
                ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                : 'bg-[#0B0E14] border-[#1E2638] text-slate-400 hover:text-white'
            }`}
          >
            <Clapperboard className="w-3.5 h-3.5" />
            <span>{adjustments.letterbox ? 'Letterbox 21:9 Ativo' : 'Letterbox 21:9 de Cinema'}</span>
          </button>
        </div>

        {/* Stickers & Adesivos Forenses */}
        <div className="p-4 rounded-2xl bg-[#121722] border border-[#1E2638] shadow-md space-y-3">
          <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
            <Palette className="w-3.5 h-3.5" /> Adesivos &amp; Marcadores Forenses
          </span>

          <div className="grid grid-cols-2 gap-2">
            {RP_STICKERS.map(sticker => (
              <button
                key={sticker.id}
                onClick={() => addSticker(sticker.id)}
                className="px-2.5 py-1.5 rounded-lg bg-[#0B0E14] hover:bg-slate-800/80 border border-[#1E2638] text-xs text-slate-300 flex items-center justify-between transition-colors"
              >
                <span className="truncate">{sticker.name}</span>
                <span className="text-[10px] text-emerald-400 font-mono">+Add</span>
              </button>
            ))}
          </div>

          <div className="pt-2 flex gap-2">
            <button
              onClick={addTextLayer}
              className="flex-1 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white flex items-center justify-center gap-1.5 transition-colors"
            >
              <Type className="w-4 h-4 text-emerald-400" /> Inserir Texto
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white flex items-center justify-center gap-1.5 transition-colors"
            >
              <ImageIcon className="w-4 h-4 text-emerald-400" /> Fundo
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => e.target.files?.[0] && handleBgUpload(e.target.files[0])}
              accept="image/*"
              className="hidden"
            />
          </div>
        </div>

        {/* Gerenciador de Camadas */}
        <div className="p-4 rounded-2xl bg-[#121722] border border-[#1E2638] shadow-md space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5" /> Camadas ({layers.length})
            </span>
          </div>

          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {[...layers].reverse().map((layer) => {
              const isSelected = layer.id === selectedLayerId;
              return (
                <div
                  key={layer.id}
                  onClick={() => setSelectedLayerId(layer.id)}
                  className={`flex items-center justify-between p-2 rounded-lg text-xs cursor-pointer transition-all border ${
                    isSelected
                      ? 'bg-emerald-500/10 border-emerald-500/50 text-white font-medium'
                      : 'bg-[#0B0E14] border-[#1E2638] text-slate-400 hover:bg-slate-800/40'
                  }`}
                >
                  <span className="truncate max-w-[140px]">{layer.name}</span>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setLayers(prev => prev.map(l => l.id === layer.id ? { ...l, visible: !l.visible } : l));
                      }}
                      className="p-1 hover:text-white"
                    >
                      {layer.visible ? <Eye className="w-3.5 h-3.5 text-emerald-400" /> : <EyeOff className="w-3.5 h-3.5 text-slate-600" />}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); moveLayer(layer.id, 'up'); }}
                      className="p-1 hover:text-white"
                    >
                      <ArrowUp className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); moveLayer(layer.id, 'down'); }}
                      className="p-1 hover:text-white"
                    >
                      <ArrowDown className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteLayer(layer.id); }}
                      className="p-1 hover:text-red-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* Coluna Direita: Viewport Canvas (8 cols) */}
      <div className="lg:col-span-8 flex flex-col gap-4">
        
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-[#121722] border border-[#1E2638]">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Crosshair className="w-4 h-4 text-emerald-400" />
            <span>Editor Multicamadas de RP — Arraste elementos para posicionar</span>
          </div>

          <button
            onClick={exportCanvasImage}
            className="px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-emerald-500/20 transition-all"
          >
            <Download className="w-4 h-4" /> Exportar Imagem PNG
          </button>
        </div>

        <div className="relative rounded-2xl overflow-hidden bg-[#07090E] border border-[#1E2638] flex items-center justify-center p-2 min-h-[540px] shadow-2xl">
          <canvas
            ref={canvasRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            className="max-w-full max-h-[75vh] object-contain rounded-lg shadow-lg cursor-crosshair"
          />
        </div>

      </div>

    </div>
  );
};
