import React, { useState, useRef, useEffect } from 'react';
import { Character, ParsedLine } from '../../types';
import { parseChatLine, CHAT_COLORS, CHAR_COLORS } from '../../utils/chatParser';
import { 
  PhotoAdjustments, DEFAULT_ADJUSTMENTS, applyPhotoAdjustments 
} from '../../utils/photoFilters';
import { 
  Upload, Download, Plus, Trash2, Eye, Sparkles, Sliders, Type, 
  Layers, RefreshCw, Move, Clapperboard, Focus, Sun, Contrast, Droplets,
  Flame, Zap
} from 'lucide-react';

export const ChatLogView: React.FC = () => {
  // Estado da Imagem
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number }>({ width: 1280, height: 720 });
  const [darkening, setDarkening] = useState<number>(0.15);

  // Ajustes de Imagem / Retoque Fotográfico (Estilo Photoshop na GPU/Canvas)
  const [adjustments, setAdjustments] = useState<PhotoAdjustments>({ ...DEFAULT_ADJUSTMENTS });

  // Estado do Chat
  const [rawText, setRawText] = useState<string>(
    "* Mike Johnson saca um cigarro do bolso e acende com um isqueiro prata.\n" +
    "> A fumaça densa sobe lentamente enquanto ele observa o movimento da rua.\n" +
    "Mike Johnson diz: A gente não tem muito tempo até eles perceberem o sumiço da carga.\n" +
    "(( Sarah Miller: Me dá 2 minutos que estou terminando de puxar os logs. ))\n" +
    "$ [TRANSAÇÃO] Você transferiu $15.000 para Mike Johnson."
  );

  // Configurações de Tipografia e Estilo
  const [fontSize, setFontSize] = useState<number>(20);
  const [fontFamily, setFontFamily] = useState<string>("Arial, Helvetica, sans-serif");
  const [bgEnabled, setBgEnabled] = useState<boolean>(true);
  const [bgColor, setBgColor] = useState<string>("#000000");
  const [bgOpacity, setBgOpacity] = useState<number>(0.65);
  const [maxWidthPercent, setMaxWidthPercent] = useState<number>(85);
  const [shadowEnabled, setShadowEnabled] = useState<boolean>(true);

  // Posicionamento do Chat (Drag & Drop)
  const [chatPos, setChatPos] = useState<{ x: number; y: number }>({ x: 40, y: 50 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Personagens
  const [characters, setCharacters] = useState<Character[]>([
    { id: '1', name: 'Mike Johnson', color: '#38bdf8' },
    { id: '2', name: 'Sarah Miller', color: '#fb7185' }
  ]);
  const [newCharName, setNewCharName] = useState<string>('');

  // Refs de Canvas
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const loadedImageRef = useRef<HTMLImageElement | null>(null);

  // Carregar imagem padrão ou manipulada
  const handleImageUpload = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      const img = new Image();
      img.onload = () => {
        loadedImageRef.current = img;
        setImageDimensions({ width: img.naturalWidth || 1280, height: img.naturalHeight || 720 });
        setImageSrc(result);
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
  };

  // Suporte a colar da área de transferência (Ctrl + V)
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (e.clipboardData?.files.length) {
        const file = e.clipboardData.files[0];
        handleImageUpload(file);
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  const addCharacter = () => {
    if (!newCharName.trim()) return;
    const randomColor = CHAR_COLORS[characters.length % CHAR_COLORS.length];
    setCharacters([...characters, { id: Date.now().toString(), name: newCharName.trim(), color: randomColor }]);
    setNewCharName('');
  };

  const removeCharacter = (id: string) => {
    setCharacters(characters.filter(c => c.id !== id));
  };

  const insertCharSpeech = (charName: string) => {
    setRawText(prev => prev + `\n${charName} diz: `);
  };

  // Renderizar a Cena Completa
  const drawScene = (ctx: CanvasRenderingContext2D, width: number, height: number, scale: number = 1) => {
    ctx.clearRect(0, 0, width, height);

    // 1. Desenhar Fundo
    if (loadedImageRef.current) {
      ctx.drawImage(loadedImageRef.current, 0, 0, width, height);
    } else {
      const grad = ctx.createLinearGradient(0, 0, width, height);
      grad.addColorStop(0, '#10141e');
      grad.addColorStop(1, '#080a10');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      ctx.strokeStyle = '#1e2638';
      ctx.lineWidth = 1;
      for (let x = 0; x < width; x += 40 * scale) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
      }
      for (let y = 0; y < height; y += 40 * scale) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
      }
    }

    // 2. Aplicar Ajustes Fotográficos de Cor e Shaders
    applyPhotoAdjustments(ctx, width, height, adjustments);

    // 3. Escurecimento da Cena
    if (darkening > 0) {
      ctx.fillStyle = `rgba(0, 0, 0, ${darkening})`;
      ctx.fillRect(0, 0, width, height);
    }

    // 4. Renderizar Linhas do Chat
    const lines = rawText.split('\n');
    const scaledFontSize = Math.round(fontSize * scale);
    const lineHeight = Math.round(scaledFontSize * 1.55);
    const padX = Math.round(scaledFontSize * 0.4);
    const padY = Math.round(scaledFontSize * 0.2);

    ctx.font = `bold ${scaledFontSize}px ${fontFamily}`;
    ctx.textBaseline = 'top';

    const maxW = Math.round((width * maxWidthPercent) / 100);
    const startX = Math.round(chatPos.x * scale);
    let curY = Math.round(chatPos.y * scale);

    lines.forEach((line) => {
      if (!line.trim()) {
        curY += Math.round(lineHeight * 0.6);
        return;
      }

      const parsed = parseChatLine(line);
      let textColor = CHAT_COLORS[parsed.type] || '#ffffff';

      characters.forEach(char => {
        if (line.includes(`${char.name} diz:`)) {
          textColor = char.color;
        }
      });

      const metrics = ctx.measureText(parsed.rawText);
      const textWidth = Math.min(metrics.width, maxW);

      if (bgEnabled && bgOpacity > 0) {
        ctx.save();
        ctx.fillStyle = bgColor;
        ctx.globalAlpha = bgOpacity;
        ctx.fillRect(startX - padX, curY - padY, textWidth + padX * 2, scaledFontSize + padY * 2);
        ctx.restore();
      }

      if (shadowEnabled) {
        ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
        ctx.shadowBlur = 3 * scale;
        ctx.shadowOffsetX = 1.5 * scale;
        ctx.shadowOffsetY = 1.5 * scale;
      } else {
        ctx.shadowColor = 'transparent';
      }

      ctx.fillStyle = textColor;
      ctx.fillText(parsed.rawText, startX, curY, maxW);

      curY += lineHeight;
    });
  };

  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    canvas.width = imageDimensions.width;
    canvas.height = imageDimensions.height;
    drawScene(ctx, imageDimensions.width, imageDimensions.height, 1);
  }, [
    imageSrc, imageDimensions, darkening, adjustments, rawText, fontSize, fontFamily,
    bgEnabled, bgColor, bgOpacity, maxWidthPercent, shadowEnabled,
    chatPos, characters
  ]);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;

    setIsDragging(true);
    setDragOffset({ x: mouseX - chatPos.x, y: mouseY - chatPos.y });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging) return;
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;

    setChatPos({
      x: Math.max(10, Math.min(canvas.width - 50, mouseX - dragOffset.x)),
      y: Math.max(10, Math.min(canvas.height - 50, mouseY - dragOffset.y))
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  const exportImage = () => {
    const exportCanvas = document.createElement('canvas');
    const scale = 2;
    exportCanvas.width = imageDimensions.width * scale;
    exportCanvas.height = imageDimensions.height * scale;

    const ctx = exportCanvas.getContext('2d');
    if (!ctx) return;

    drawScene(ctx, exportCanvas.width, exportCanvas.height, scale);

    const link = document.createElement('a');
    link.download = `haze-chatlog-${Date.now()}.png`;
    link.href = exportCanvas.toDataURL('image/png');
    link.click();
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
      
      {/* Coluna da Esquerda: Controles (4 cols) */}
      <div className="lg:col-span-4 space-y-4">
        
        {/* Painel de Upload de Fundo */}
        <div className="p-4 rounded-2xl bg-[#121722] border border-[#1E2638] shadow-md">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <Upload className="w-3.5 h-3.5" /> Fundo da Cena
            </span>
            <span className="text-[11px] font-mono text-slate-400">
              {imageDimensions.width}×{imageDimensions.height}px
            </span>
          </div>

          <div
            onClick={() => fileInputRef.current?.click()}
            className="group cursor-pointer border-2 border-dashed border-[#1E2638] hover:border-emerald-500/50 rounded-xl p-4 text-center transition-all bg-[#0B0E14]/40 hover:bg-emerald-500/[0.02]"
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => e.target.files?.[0] && handleImageUpload(e.target.files[0])}
              accept="image/*"
              className="hidden"
            />
            <div className="flex flex-col items-center gap-2">
              <div className="p-2.5 rounded-full bg-slate-800/60 text-slate-400 group-hover:text-emerald-400 transition-colors">
                <Upload className="w-5 h-5" />
              </div>
              <p className="text-xs font-medium text-slate-300">
                Clique ou arraste um print do RP
              </p>
              <p className="text-[10px] text-slate-500">
                PNG, JPG, WebP ou cole com <kbd className="px-1 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[9px]">Ctrl+V</kbd>
              </p>
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-[#1E2638] flex items-center justify-between text-xs">
            <span className="text-slate-400">Escurecimento</span>
            <div className="flex items-center gap-2 w-1/2">
              <input
                type="range"
                min="0"
                max="0.8"
                step="0.05"
                value={darkening}
                onChange={(e) => setDarkening(parseFloat(e.target.value))}
                className="w-full accent-emerald-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
              <span className="font-mono text-slate-300 text-[11px] w-8 text-right">
                {Math.round(darkening * 100)}%
              </span>
            </div>
          </div>
        </div>

        {/* Laboratório Fotográfico (Retoque de Imagem estilo Photoshop) */}
        <div className="p-4 rounded-2xl bg-[#121722] border border-[#1E2638] shadow-md space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5" /> Retoque Fotográfico (Color Grading)
            </span>
            <button
              onClick={() => setAdjustments({ ...DEFAULT_ADJUSTMENTS })}
              className="text-[10px] text-slate-400 hover:text-emerald-400"
            >
              Resetar
            </button>
          </div>

          {/* Color Grading Presets */}
          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={() => setAdjustments(prev => ({ ...prev, colorPreset: 'golden-hour' }))}
              className={`px-2.5 py-1.5 rounded-lg border text-left text-xs transition-all ${
                adjustments.colorPreset === 'golden-hour'
                  ? 'border-amber-500 bg-amber-500/15 text-amber-300 font-semibold'
                  : 'border-[#1E2638] bg-[#0B0E14] text-slate-400 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-1.5"><Sun className="w-3.5 h-3.5 text-amber-400" /> Golden Hour</div>
            </button>

            <button
              onClick={() => setAdjustments(prev => ({ ...prev, colorPreset: 'midnight-neon' }))}
              className={`px-2.5 py-1.5 rounded-lg border text-left text-xs transition-all ${
                adjustments.colorPreset === 'midnight-neon'
                  ? 'border-sky-500 bg-sky-500/15 text-sky-300 font-semibold'
                  : 'border-[#1E2638] bg-[#0B0E14] text-slate-400 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-1.5"><Zap className="w-3.5 h-3.5 text-sky-400" /> Midnight Neon</div>
            </button>

            <button
              onClick={() => setAdjustments(prev => ({ ...prev, colorPreset: 'grit-crime' }))}
              className={`px-2.5 py-1.5 rounded-lg border text-left text-xs transition-all ${
                adjustments.colorPreset === 'grit-crime'
                  ? 'border-red-500 bg-red-500/15 text-red-300 font-semibold'
                  : 'border-[#1E2638] bg-[#0B0E14] text-slate-400 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-1.5"><Contrast className="w-3.5 h-3.5 text-red-400" /> Grit &amp; Crime</div>
            </button>

            <button
              onClick={() => setAdjustments(prev => ({ ...prev, colorPreset: 'vintage-90s' }))}
              className={`px-2.5 py-1.5 rounded-lg border text-left text-xs transition-all ${
                adjustments.colorPreset === 'vintage-90s'
                  ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300 font-semibold'
                  : 'border-[#1E2638] bg-[#0B0E14] text-slate-400 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-1.5"><Flame className="w-3.5 h-3.5 text-emerald-400" /> San Andreas 90s</div>
            </button>
          </div>

          {/* Sliders de Ajuste Fino */}
          <div className="space-y-2 pt-1 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Brilho</span>
              <div className="flex items-center gap-2 w-1/2">
                <input
                  type="range" min="-50" max="50" value={adjustments.brightness}
                  onChange={(e) => setAdjustments(prev => ({ ...prev, brightness: parseInt(e.target.value) }))}
                  className="w-full accent-emerald-500 h-1 bg-slate-800 rounded cursor-pointer"
                />
                <span className="font-mono text-[10px] w-6 text-right text-slate-300">{adjustments.brightness}</span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-400">Contraste</span>
              <div className="flex items-center gap-2 w-1/2">
                <input
                  type="range" min="-50" max="50" value={adjustments.contrast}
                  onChange={(e) => setAdjustments(prev => ({ ...prev, contrast: parseInt(e.target.value) }))}
                  className="w-full accent-emerald-500 h-1 bg-slate-800 rounded cursor-pointer"
                />
                <span className="font-mono text-[10px] w-6 text-right text-slate-300">{adjustments.contrast}</span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-400">Nitidez (Sharpen)</span>
              <div className="flex items-center gap-2 w-1/2">
                <input
                  type="range" min="0" max="100" value={adjustments.sharpen}
                  onChange={(e) => setAdjustments(prev => ({ ...prev, sharpen: parseInt(e.target.value) }))}
                  className="w-full accent-emerald-500 h-1 bg-slate-800 rounded cursor-pointer"
                />
                <span className="font-mono text-[10px] w-6 text-right text-slate-300">{adjustments.sharpen}%</span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-400">Depth of Field (Bokeh)</span>
              <div className="flex items-center gap-2 w-1/2">
                <input
                  type="range" min="0" max="100" value={adjustments.depthOfField}
                  onChange={(e) => setAdjustments(prev => ({ ...prev, depthOfField: parseInt(e.target.value) }))}
                  className="w-full accent-emerald-500 h-1 bg-slate-800 rounded cursor-pointer"
                />
                <span className="font-mono text-[10px] w-6 text-right text-slate-300">{adjustments.depthOfField}%</span>
              </div>
            </div>
          </div>

          {/* Letterbox de Cinema */}
          <div className="pt-2 border-t border-[#1E2638] flex items-center justify-between text-xs">
            <button
              onClick={() => setAdjustments(prev => ({ ...prev, letterbox: !prev.letterbox }))}
              className={`w-full py-2 px-3 rounded-xl border flex items-center justify-center gap-2 transition-all font-semibold ${
                adjustments.letterbox
                  ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                  : 'bg-[#0B0E14] border-[#1E2638] text-slate-400 hover:text-white'
              }`}
            >
              <Clapperboard className="w-4 h-4" />
              <span>{adjustments.letterbox ? 'Letterbox 21:9 Ativo (Barras de Cinema)' : 'Ativar Letterbox 21:9 (Cinema)'}</span>
            </button>
          </div>
        </div>

        {/* Editor de Texto do Chat */}
        <div className="p-4 rounded-2xl bg-[#121722] border border-[#1E2638] shadow-md space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <Type className="w-3.5 h-3.5" /> Diálogos & Ações
            </span>
            <span className="text-[10px] text-slate-500">
              * /me, &gt; /ame, $ din, (( ooc ))
            </span>
          </div>

          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            rows={6}
            className="w-full p-3 rounded-xl bg-[#0B0E14] border border-[#1E2638] text-xs font-mono text-slate-200 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all resize-y"
            placeholder="Digite ou cole as falas do chat aqui..."
          />

          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setRawText(prev => prev + '\n* Ele(a) ')}
              className="px-2 py-1 rounded bg-[#2c1d3b] hover:bg-[#3d2752] text-[#cc99ff] text-[10px] font-semibold transition-colors"
            >
              * /me
            </button>
            <button
              onClick={() => setRawText(prev => prev + '\n> Uma sensação de ')}
              className="px-2 py-1 rounded bg-[#2c1d3b] hover:bg-[#3d2752] text-[#cc99ff] text-[10px] font-semibold transition-colors"
            >
              &gt; /ame
            </button>
            <button
              onClick={() => setRawText(prev => prev + '\n(( OOC: ')}
              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 text-[10px] font-semibold transition-colors"
            >
              (( OOC ))
            </button>
            <button
              onClick={() => setRawText(prev => prev + '\n$ Transação: ')}
              className="px-2 py-1 rounded bg-amber-950/60 hover:bg-amber-900/60 text-amber-400 text-[10px] font-semibold transition-colors"
            >
              $ Transação
            </button>
          </div>
        </div>

        {/* Gerenciador de Personagens */}
        <div className="p-4 rounded-2xl bg-[#121722] border border-[#1E2638] shadow-md space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5" /> Personagens da Cena
            </span>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={newCharName}
              onChange={(e) => setNewCharName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addCharacter()}
              placeholder="Nome do personagem..."
              className="flex-1 px-3 py-1.5 rounded-lg bg-[#0B0E14] border border-[#1E2638] text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
            />
            <button
              onClick={addCharacter}
              className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-xs flex items-center gap-1 transition-all"
            >
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5 pt-1">
            {characters.map((char) => (
              <div
                key={char.id}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs transition-all"
                style={{ borderColor: `${char.color}40`, backgroundColor: `${char.color}15`, color: char.color }}
              >
                <button
                  onClick={() => insertCharSpeech(char.name)}
                  className="font-medium hover:underline text-[11px]"
                  title="Clique para adicionar fala"
                >
                  {char.name}
                </button>
                <button
                  onClick={() => removeCharacter(char.id)}
                  className="opacity-60 hover:opacity-100 hover:text-red-400 ml-1"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Coluna da Direita: Preview Interativo Canvas (8 cols) */}
      <div className="lg:col-span-8 flex flex-col gap-4">
        
        {/* Barra Superior do Canvas */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-[#121722] border border-[#1E2638]">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Move className="w-4 h-4 text-emerald-400" />
            <span>Arraste com o mouse para posicionar o chat</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setChatPos({ x: 40, y: 50 })}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center gap-1.5 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Reset Posição
            </button>
            <button
              onClick={exportImage}
              className="px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-emerald-500/20 transition-all"
            >
              <Download className="w-4 h-4" /> Exportar 2× Ultra HD
            </button>
          </div>
        </div>

        {/* Viewport do Canvas */}
        <div className="relative rounded-2xl overflow-hidden bg-[#07090E] border border-[#1E2638] flex items-center justify-center p-2 min-h-[520px] shadow-2xl">
          <canvas
            ref={previewCanvasRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            className="max-w-full max-h-[75vh] object-contain rounded-lg cursor-grab active:cursor-grabbing shadow-lg"
          />

          {!imageSrc && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none p-6 text-center">
              <div className="p-4 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mb-3">
                <Sparkles className="w-8 h-8" />
              </div>
              <h3 className="text-sm font-bold text-white mb-1">
                Visualização Interativa de Chat Log &amp; Retoque
              </h3>
              <p className="text-xs text-slate-400 max-w-sm">
                Arraste um print do seu jogo para cá ou cole com Ctrl+V.
                Use os controles de retoque fotográfico para dar aspecto de cinema.
              </p>
            </div>
          )}
        </div>

      </div>

    </div>
  );
};
