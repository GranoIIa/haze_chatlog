import React, { useState, useRef, useEffect } from 'react';
import { CanvasLayer } from '../../types';
import { RP_PRESETS } from '../../utils/rpPresets';
import { RP_STICKERS } from '../../utils/rpStickers';
import { 
  Palette, Type, Image as ImageIcon, Sparkles, Layers, Eye, EyeOff, 
  Lock, Unlock, Trash2, ArrowUp, ArrowDown, Download, ShieldAlert,
  Camera, Tv, ShieldCheck, Crosshair
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

  // Dragging state inside canvas
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const selectedLayer = layers.find(l => l.id === selectedLayerId);

  // Manipular upload de imagem de fundo
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

  // Adicionar Texto Livre
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

  // Adicionar Preset de RP
  const applyPreset = (presetKey: 'bodycam' | 'weazel' | 'cctv' | 'mugshot') => {
    const preset = RP_PRESETS[presetKey];
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
      presetType: presetKey,
      presetData: { ...preset.defaultData }
    };
    setLayers(prev => [...prev, newLayer]);
    setSelectedLayerId(newLayer.id);
  };

  // Adicionar Sticker de RP
  const addSticker = (stickerId: string) => {
    const sticker = RP_STICKERS.find(s => s.id === stickerId);
    if (!sticker) return;

    const newLayer: CanvasLayer = {
      id: `sticker-${Date.now()}`,
      type: 'sticker',
      name: `Sticker: ${sticker.name}`,
      content: sticker.id,
      x: canvasDimensions.width / 2 - 100,
      y: canvasDimensions.height / 2 - 40,
      width: sticker.id === 'crime-tape' ? 500 : 120,
      height: sticker.id === 'crime-tape' ? 40 : 120,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false
    };
    setLayers(prev => [...prev, newLayer]);
    setSelectedLayerId(newLayer.id);
  };

  // Reordenar Camadas
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

  // Excluir Camada
  const deleteLayer = (id: string) => {
    setLayers(prev => prev.filter(l => l.id !== id));
    if (selectedLayerId === id) setSelectedLayerId(null);
  };

  // Desenhar todo o Canvas
  const renderCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
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
      // Grid suave
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1;
      for (let x = 0; x < canvas.width; x += 50) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += 50) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }
    }

    // 2. Renderizar Camadas ordenadas por z-index (índice do array)
    layers.forEach(layer => {
      if (!layer.visible) return;

      ctx.save();
      ctx.globalAlpha = layer.opacity;

      if (layer.type === 'preset' && layer.presetType) {
        const renderer = RP_PRESETS[layer.presetType];
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

      // Caixa de seleção se for a camada selecionada
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
  }, [layers, selectedLayerId, canvasDimensions, backgroundImage]);

  // Arraste da camada selecionada dentro do canvas
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !selectedLayer || selectedLayer.locked || selectedLayer.type === 'preset') return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;

    // Checa colisão com a camada selecionada
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

  // Exportar Arte Final
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
        
        {/* Presets de 1 Clique (O Grande Diferencial de RP) */}
        <div className="p-4 rounded-2xl bg-[#121722] border border-[#1E2638] shadow-md">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" /> Presets de 1 Clique (RP)
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => applyPreset('bodycam')}
              className="p-3 rounded-xl bg-[#0B0E14] hover:bg-slate-800/80 border border-[#1E2638] hover:border-emerald-500/50 text-left transition-all group"
            >
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs mb-1">
                <Camera className="w-4 h-4" /> Bodycam
              </div>
              <p className="text-[10px] text-slate-400 line-clamp-2">
                Overlay AXON com timestamp militar e identificação do oficial.
              </p>
            </button>

            <button
              onClick={() => applyPreset('weazel')}
              className="p-3 rounded-xl bg-[#0B0E14] hover:bg-slate-800/80 border border-[#1E2638] hover:border-amber-500/50 text-left transition-all group"
            >
              <div className="flex items-center gap-2 text-amber-400 font-bold text-xs mb-1">
                <Tv className="w-4 h-4" /> Weazel News
              </div>
              <p className="text-[10px] text-slate-400 line-clamp-2">
                Tarja de telejornal ao vivo, GC e manchete dramática.
              </p>
            </button>

            <button
              onClick={() => applyPreset('cctv')}
              className="p-3 rounded-xl bg-[#0B0E14] hover:bg-slate-800/80 border border-[#1E2638] hover:border-green-500/50 text-left transition-all group"
            >
              <div className="flex items-center gap-2 text-green-400 font-bold text-xs mb-1">
                <ShieldCheck className="w-4 h-4" /> CCTV
              </div>
              <p className="text-[10px] text-slate-400 line-clamp-2">
                Câmera de vigilância, scanlines e data retrô verde.
              </p>
            </button>

            <button
              onClick={() => applyPreset('mugshot')}
              className="p-3 rounded-xl bg-[#0B0E14] hover:bg-slate-800/80 border border-[#1E2638] hover:border-red-500/50 text-left transition-all group"
            >
              <div className="flex items-center gap-2 text-red-400 font-bold text-xs mb-1">
                <ShieldAlert className="w-4 h-4" /> Ficha Criminal
              </div>
              <p className="text-[10px] text-slate-400 line-clamp-2">
                Plaqueta de identificação de detenção policial (Mugshot).
              </p>
            </button>
          </div>
        </div>

        {/* Stickers & Assets de RP */}
        <div className="p-4 rounded-2xl bg-[#121722] border border-[#1E2638] shadow-md space-y-3">
          <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
            <Palette className="w-3.5 h-3.5" /> Stickers & Adesivos de RP
          </span>

          <div className="grid grid-cols-2 gap-2">
            {RP_STICKERS.map(sticker => (
              <button
                key={sticker.id}
                onClick={() => addSticker(sticker.id)}
                className="px-3 py-2 rounded-lg bg-[#0B0E14] hover:bg-slate-800/80 border border-[#1E2638] text-xs text-slate-300 flex items-center justify-between transition-colors"
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

        {/* Gerenciador de Camadas (Layers Panel) */}
        <div className="p-4 rounded-2xl bg-[#121722] border border-[#1E2638] shadow-md space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5" /> Camadas do Projeto
            </span>
            <span className="text-[10px] text-slate-500 font-mono">
              {layers.length} camadas
            </span>
          </div>

          <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
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
                  <span className="truncate max-w-[150px]">{layer.name}</span>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setLayers(prev => prev.map(l => l.id === layer.id ? { ...l, visible: !l.visible } : l));
                      }}
                      className="p-1 hover:text-white"
                      title={layer.visible ? 'Ocultar' : 'Mostrar'}
                    >
                      {layer.visible ? <Eye className="w-3.5 h-3.5 text-emerald-400" /> : <EyeOff className="w-3.5 h-3.5 text-slate-600" />}
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        moveLayer(layer.id, 'up');
                      }}
                      className="p-1 hover:text-white"
                      title="Subir Camada"
                    >
                      <ArrowUp className="w-3 h-3" />
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        moveLayer(layer.id, 'down');
                      }}
                      className="p-1 hover:text-white"
                      title="Descer Camada"
                    >
                      <ArrowDown className="w-3 h-3" />
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteLayer(layer.id);
                      }}
                      className="p-1 hover:text-red-400"
                      title="Excluir"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Ajustes da Camada Selecionada */}
        {selectedLayer && selectedLayer.type === 'text' && (
          <div className="p-4 rounded-2xl bg-[#121722] border border-[#1E2638] shadow-md space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
              Propriedades do Texto
            </span>
            <input
              type="text"
              value={selectedLayer.content || ''}
              onChange={(e) => {
                const val = e.target.value;
                setLayers(prev => prev.map(l => l.id === selectedLayer.id ? { ...l, content: val } : l));
              }}
              className="w-full px-3 py-1.5 rounded-lg bg-[#0B0E14] border border-[#1E2638] text-xs text-white"
            />
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <label className="text-slate-400 block mb-1">Tamanho</label>
                <input
                  type="number"
                  value={selectedLayer.fontSize || 32}
                  onChange={(e) => {
                    const sz = parseInt(e.target.value) || 20;
                    setLayers(prev => prev.map(l => l.id === selectedLayer.id ? { ...l, fontSize: sz } : l));
                  }}
                  className="w-full px-2 py-1 rounded bg-[#0B0E14] border border-[#1E2638] text-white text-xs"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Cor</label>
                <input
                  type="color"
                  value={selectedLayer.color || '#ffffff'}
                  onChange={(e) => {
                    const clr = e.target.value;
                    setLayers(prev => prev.map(l => l.id === selectedLayer.id ? { ...l, color: clr } : l));
                  }}
                  className="w-full h-7 rounded bg-[#0B0E14] border border-[#1E2638] cursor-pointer"
                />
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Coluna Direita: Viewport Canvas (8 cols) */}
      <div className="lg:col-span-8 flex flex-col gap-4">
        
        {/* Barra de Ações Superior */}
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

        {/* Viewport Principal */}
        <div className="relative rounded-2xl overflow-hidden bg-[#07090E] border border-[#1E2638] flex items-center justify-center p-2 min-h-[520px] shadow-2xl">
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
