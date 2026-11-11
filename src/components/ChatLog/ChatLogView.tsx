import React, { useState, useRef, useEffect } from 'react';
import { Character, ParsedLine } from '../../types';
import { parseChatLine, splitCensoredSegments, CHAT_COLORS, CHAR_COLORS } from '../../utils/chatParser';
import { 
  PhotoAdjustments, DEFAULT_ADJUSTMENTS, applyPhotoAdjustments 
} from '../../utils/photoFilters';
import { 
  Upload, Download, Plus, Trash2, Sparkles, Sliders, Type, 
  Layers, RefreshCw, Move, Clapperboard, Sun, Contrast,
  Flame, Zap, Shield, EyeOff, Palette
} from 'lucide-react';

interface RenderToken {
  text: string;
  isCensored: boolean;
  color: string;
}

interface RenderRow {
  tokens: Array<{
    text: string;
    isCensored: boolean;
    color: string;
    width: number;
  }>;
  totalWidth: number;
}

export const ChatLogView: React.FC = () => {
  // Container Ref para escopo de eventos globais (ex: paste em abas inativas)
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Estado da Imagem
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number }>({ width: 1280, height: 720 });
  const [darkening, setDarkening] = useState<number>(0.15);
  const [isDraggingFile, setIsDraggingFile] = useState<boolean>(false);

  // Ajustes de Imagem / Retoque Fotográfico (Estilo Photoshop na GPU/Canvas)
  const [adjustments, setAdjustments] = useState<PhotoAdjustments>({ ...DEFAULT_ADJUSTMENTS });

  // Estado do Chat
  const [rawText, setRawText] = useState<string>(
    "[14:23:45] * Mike Johnson saca um cigarro do bolso e acende com um isqueiro prata.\n" +
    "> A fumaça densa sobe lentamente enquanto ele observa o movimento da rua.\n" +
    "Mike Johnson diz: A gente não tem muito tempo até eles descobrirem a senha ||4892-OMEGA|| do cofre.\n" +
    "(( Sarah Miller: Me dá 2 minutos que estou terminando de puxar os logs. ))\n" +
    "$ [TRANSAÇÃO] Você transferiu $15.000 para Mike Johnson."
  );

  // Configurações de Tipografia e Estilo (Features 8, 9, 10)
  const [fontSize, setFontSize] = useState<number>(20);
  const [fontFamily, setFontFamily] = useState<string>("Arial, Helvetica, sans-serif");
  const [lineHeightFactor, setLineHeightFactor] = useState<number>(1.55);
  const [strokeEnabled, setStrokeEnabled] = useState<boolean>(true);
  const [strokeWidth, setStrokeWidth] = useState<number>(2);
  const [strokeColor, setStrokeColor] = useState<string>("#000000");
  const [bgEnabled, setBgEnabled] = useState<boolean>(true);
  const [bgColor, setBgColor] = useState<string>("#000000");
  const [bgOpacity, setBgOpacity] = useState<number>(0.65);
  const [maxWidthPercent, setMaxWidthPercent] = useState<number>(85);
  const [shadowEnabled, setShadowEnabled] = useState<boolean>(false);
  const [censorStyle, setCensorStyle] = useState<'mosaic' | 'solid'>('mosaic');
  const [showTimestamps, setShowTimestamps] = useState<boolean>(true);

  // Posicionamento do Chat (Drag & Drop com Pointer Events)
  const [chatPos, setChatPos] = useState<{ x: number; y: number }>({ x: 40, y: 50 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Personagens
  const [characters, setCharacters] = useState<Character[]>([
    { id: '1', name: 'Mike Johnson', color: '#38bdf8' },
    { id: '2', name: 'Sarah Miller', color: '#fb7185' }
  ]);
  const [newCharName, setNewCharName] = useState<string>('');

  // Refs de Canvas e Imagem
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const loadedImageRef = useRef<HTMLImageElement | null>(null);
  const currentBlobUrlRef = useRef<string | null>(null);

  // Carregar imagem de forma segura com createObjectURL e liberação prévia
  const handleImageUpload = (file: File) => {
    if (!file.type.startsWith('image/')) return;

    if (currentBlobUrlRef.current) {
      URL.revokeObjectURL(currentBlobUrlRef.current);
      currentBlobUrlRef.current = null;
    }

    const objectUrl = URL.createObjectURL(file);
    currentBlobUrlRef.current = objectUrl;

    const img = new Image();
    img.onload = () => {
      loadedImageRef.current = img;
      setImageDimensions({ width: img.naturalWidth || 1280, height: img.naturalHeight || 720 });
      setImageSrc(objectUrl);
    };
    img.onerror = () => {
      if (currentBlobUrlRef.current === objectUrl) {
        URL.revokeObjectURL(objectUrl);
        currentBlobUrlRef.current = null;
      }
    };
    img.src = objectUrl;
  };

  // Limpeza de recursos ao desmontar componente
  useEffect(() => {
    return () => {
      if (currentBlobUrlRef.current) {
        URL.revokeObjectURL(currentBlobUrlRef.current);
        currentBlobUrlRef.current = null;
      }
      loadedImageRef.current = null;
    };
  }, []);

  // Suporte a colar da área de transferência (Ctrl + V) isolado por aba ativa
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (!containerRef.current) return;
      if (containerRef.current.offsetParent === null || containerRef.current.closest('.hidden')) {
        return;
      }

      if (e.clipboardData?.files && e.clipboardData.files.length > 0) {
        const file = e.clipboardData.files[0];
        if (file.type.startsWith('image/')) {
          e.preventDefault();
          handleImageUpload(file);
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  // Handlers de Drag & Drop HTML5 para upload de arquivo
  const handleDragOver = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    if (!isDraggingFile) setIsDraggingFile(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDraggingFile(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type.startsWith('image/')) {
        handleImageUpload(file);
      }
    }
  };

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

  // Renderizar a Cena Completa no Canvas (Engine Multiline + Stroke + Mosaico)
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

    // 4. Configurar Tipografia & Escalas
    const clampedFontSize = Math.min(Math.max(10, fontSize), 72);
    const scaledFontSize = Math.round(clampedFontSize * scale);
    const lineHeight = Math.round(scaledFontSize * lineHeightFactor);
    const padX = Math.round(scaledFontSize * 0.4);
    const padY = Math.round(scaledFontSize * 0.2);

    ctx.font = `bold ${scaledFontSize}px ${fontFamily}`;
    ctx.textBaseline = 'top';

    const clampedMaxWidthPercent = Math.min(Math.max(30, maxWidthPercent), 100);
    const maxW = Math.round((width * clampedMaxWidthPercent) / 100);
    const startX = Math.round(chatPos.x * scale);
    let curY = Math.round(chatPos.y * scale);

    const lines = rawText.split('\n');

    lines.forEach((line) => {
      if (!line.trim()) {
        curY += Math.round(lineHeight * 0.6);
        return;
      }

      const parsed: ParsedLine = parseChatLine(line);
      const lineDefaultColor = CHAT_COLORS[parsed.type] || '#ffffff';

      // 4.1 Montagem dos Tokens da Linha (Timestamp + Speaker Tag + Conteúdo Redigido)
      const sourceTokens: RenderToken[] = [];

      // Timestamp [HH:MM:SS]
      if (showTimestamps && parsed.timestamp) {
        sourceTokens.push({
          text: `${parsed.timestamp} `,
          isCensored: false,
          color: '#94a3b8'
        });
      }

      // Identificação e coloração do Speaker
      let matchedChar: Character | undefined;
      if (parsed.speaker) {
        matchedChar = characters.find(
          c => c.name.toLowerCase() === parsed.speaker?.toLowerCase()
        );
      }

      // Linha de fala com speaker identificado (ex: "Mike Johnson diz:")
      const textToScan = parsed.rawText.replace(/^(\[[0-2]\d:[0-5]\d(?::[0-5]\d)?\]|\([0-2]\d:[0-5]\d(?::[0-5]\d)?\))\s*/, '');
      const speechPrefixMatch = textToScan.match(/^(.+?\s+(?:diz(?:\s*\([^)]*\))?|grita|sussurra)\s*:\s*)/i);

      if (speechPrefixMatch) {
        const prefixStr = speechPrefixMatch[1];
        const speakerColor = matchedChar ? matchedChar.color : lineDefaultColor;
        sourceTokens.push({
          text: prefixStr,
          isCensored: false,
          color: speakerColor
        });

        // Diálogo subsequente
        const dialogueBody = parsed.messageText !== undefined ? parsed.messageText : textToScan.substring(prefixStr.length);
        const dialogueSegments = splitCensoredSegments(dialogueBody);
        dialogueSegments.forEach(seg => {
          sourceTokens.push({
            text: seg.text,
            isCensored: !!seg.isCensored,
            color: lineDefaultColor
          });
        });
      } else if (textToScan.startsWith('*') && parsed.speaker) {
        // Ação RP com personagem identificado
        const speakerColor = matchedChar ? matchedChar.color : lineDefaultColor;
        const actionPrefix = `* ${parsed.speaker} `;
        sourceTokens.push({
          text: actionPrefix,
          isCensored: false,
          color: speakerColor
        });

        const actionRest = textToScan.substring(actionPrefix.length);
        const actionSegments = splitCensoredSegments(actionRest);
        actionSegments.forEach(seg => {
          sourceTokens.push({
            text: seg.text,
            isCensored: !!seg.isCensored,
            color: lineDefaultColor
          });
        });
      } else {
        // Demais linhas (ações /me padrão, comandos de rádio, OOC, banco)
        parsed.segments.forEach(seg => {
          sourceTokens.push({
            text: seg.text,
            isCensored: !!seg.isCensored,
            color: lineDefaultColor
          });
        });
      }

      // 4.2 Quebra de Linha em Fileiras (Word-Wrap Multi-Row Engine)
      const rows: RenderRow[] = [];
      let currentRowTokens: Array<{ text: string; isCensored: boolean; color: string; width: number }> = [];
      let currentRowWidth = 0;

      const pushCurrentRow = () => {
        if (currentRowTokens.length > 0) {
          rows.push({ tokens: currentRowTokens, totalWidth: currentRowWidth });
          currentRowTokens = [];
          currentRowWidth = 0;
        }
      };

      for (const token of sourceTokens) {
        if (token.isCensored) {
          const textW = ctx.measureText(token.text).width;
          const blockW = Math.max(textW, scaledFontSize * 1.2);

          if (currentRowWidth + blockW > maxW && currentRowTokens.length > 0) {
            pushCurrentRow();
          }

          currentRowTokens.push({
            text: token.text,
            isCensored: true,
            color: token.color,
            width: blockW
          });
          currentRowWidth += blockW;
        } else {
          const words = token.text.split(/(\s+)/);
          for (const word of words) {
            if (!word) continue;
            const wordW = ctx.measureText(word).width;

            // Palavra única que excede a largura total permitida
            if (wordW > maxW && currentRowTokens.length === 0 && word.trim().length > 0) {
              let chunk = '';
              for (const ch of word) {
                const chunkW = ctx.measureText(chunk + ch).width;
                if (chunkW > maxW && chunk.length > 0) {
                  const w = ctx.measureText(chunk).width;
                  currentRowTokens.push({ text: chunk, isCensored: false, color: token.color, width: w });
                  currentRowWidth += w;
                  pushCurrentRow();
                  chunk = ch;
                } else {
                  chunk += ch;
                }
              }
              if (chunk) {
                const w = ctx.measureText(chunk).width;
                currentRowTokens.push({ text: chunk, isCensored: false, color: token.color, width: w });
                currentRowWidth += w;
              }
              continue;
            }

            if (currentRowWidth + wordW > maxW && currentRowTokens.length > 0 && word.trim().length > 0) {
              pushCurrentRow();
            }

            currentRowTokens.push({
              text: word,
              isCensored: false,
              color: token.color,
              width: wordW
            });
            currentRowWidth += wordW;
          }
        }
      }

      pushCurrentRow();

      // 4.3 Renderização das Fileiras no Canvas
      rows.forEach((row) => {
        // Fundo independente por fileira (eliminando bug de caixa única)
        if (bgEnabled && bgOpacity > 0 && row.totalWidth > 0) {
          ctx.save();
          ctx.fillStyle = bgColor;
          ctx.globalAlpha = Math.min(Math.max(0, bgOpacity), 1);
          ctx.fillRect(
            startX - padX,
            curY - padY,
            row.totalWidth + padX * 2,
            scaledFontSize + padY * 2
          );
          ctx.restore();
        }

        let tokenX = startX;

        row.tokens.forEach((t) => {
          if (t.isCensored) {
            // Renderização de Censura (Mosaico procedural ou Tarja sólida)
            if (censorStyle === 'mosaic') {
              const grainSize = Math.max(3, Math.round(4 * scale));
              const cols = Math.ceil(t.width / grainSize);
              const rowsCount = Math.ceil(scaledFontSize / grainSize);
              ctx.save();
              for (let c = 0; c < cols; c++) {
                for (let r = 0; r < rowsCount; r++) {
                  const hash = Math.sin((tokenX + c * 17) * 12.9898 + (curY + r * 31) * 78.233) * 43758.5453;
                  const rand = hash - Math.floor(hash);
                  const shade = Math.floor(35 + rand * 85);
                  ctx.fillStyle = `rgb(${shade}, ${shade}, ${shade})`;
                  ctx.fillRect(
                    tokenX + c * grainSize,
                    curY + r * grainSize,
                    Math.min(grainSize, t.width - c * grainSize),
                    Math.min(grainSize, scaledFontSize - r * grainSize)
                  );
                }
              }
              ctx.restore();
            } else {
              // Tarja sólida preta
              ctx.save();
              ctx.fillStyle = '#000000';
              ctx.fillRect(tokenX, curY, t.width, scaledFontSize);
              ctx.restore();
            }
          } else {
            // Renderização de Texto com Contorno Autêntico de GTA
            const sanitizedStrokeWidth = Math.min(Math.max(0, strokeWidth), 8);
            const scaledStroke = Math.max(0, Math.round(sanitizedStrokeWidth * scale));

            if (strokeEnabled && scaledStroke > 0) {
              ctx.save();
              ctx.strokeStyle = strokeColor;
              ctx.lineWidth = scaledStroke;
              ctx.lineJoin = 'miter';
              ctx.miterLimit = 2;
              if (shadowEnabled) {
                ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
                ctx.shadowBlur = 3 * scale;
                ctx.shadowOffsetX = 1.5 * scale;
                ctx.shadowOffsetY = 1.5 * scale;
              }
              ctx.strokeText(t.text, tokenX, curY);
              ctx.restore();
            }

            ctx.save();
            ctx.shadowColor = 'transparent';
            ctx.fillStyle = t.color;
            ctx.fillText(t.text, tokenX, curY);
            ctx.restore();
          }

          tokenX += t.width;
        });

        curY += lineHeight;
      });
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
    lineHeightFactor, strokeEnabled, strokeWidth, strokeColor,
    bgEnabled, bgColor, bgOpacity, maxWidthPercent, shadowEnabled,
    censorStyle, showTimestamps, chatPos, characters
  ]);

  // Handlers de Arrastar com HTML5 Pointer Capture
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    const canvas = previewCanvasRef.current;
    if (!canvas) return;

    try {
      canvas.setPointerCapture(e.pointerId);
    } catch (_) {}

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const pointerX = (e.clientX - rect.left) * scaleX;
    const pointerY = (e.clientY - rect.top) * scaleY;

    setIsDragging(true);
    setDragOffset({ x: pointerX - chatPos.x, y: pointerY - chatPos.y });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDragging) return;
    const canvas = previewCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const pointerX = (e.clientX - rect.left) * scaleX;
    const pointerY = (e.clientY - rect.top) * scaleY;

    setChatPos({
      x: Math.max(0, Math.min(canvas.width - 100, pointerX - dragOffset.x)),
      y: Math.max(0, Math.min(canvas.height - 50, pointerY - dragOffset.y))
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDragging) return;
    setIsDragging(false);
    if (previewCanvasRef.current?.hasPointerCapture(e.pointerId)) {
      try {
        previewCanvasRef.current.releasePointerCapture(e.pointerId);
      } catch (_) {}
    }
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDragging) return;
    setIsDragging(false);
    if (previewCanvasRef.current?.hasPointerCapture(e.pointerId)) {
      try {
        previewCanvasRef.current.releasePointerCapture(e.pointerId);
      } catch (_) {}
    }
  };

  // Exportação Segura 2x com Canvas toBlob
  const exportImage = () => {
    const exportCanvas = document.createElement('canvas');
    const scale = 2;
    exportCanvas.width = imageDimensions.width * scale;
    exportCanvas.height = imageDimensions.height * scale;

    const ctx = exportCanvas.getContext('2d');
    if (!ctx) return;

    drawScene(ctx, exportCanvas.width, exportCanvas.height, scale);

    exportCanvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = `haze-chatlog-${Date.now()}.png`;
      link.href = url;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    }, 'image/png');
  };

  return (
    <div ref={containerRef} className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
      
      {/* Coluna da Esquerda: Controles (4 cols) */}
      <div className="lg:col-span-4 space-y-4">
        
        {/* Painel de Upload de Fundo com Drag & Drop */}
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
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`group cursor-pointer border-2 border-dashed rounded-xl p-4 text-center transition-all ${
              isDraggingFile 
                ? 'border-emerald-400 bg-emerald-500/10 ring-2 ring-emerald-500/30' 
                : 'border-[#1E2638] hover:border-emerald-500/50 bg-[#0B0E14]/40 hover:bg-emerald-500/[0.02]'
            }`}
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

        {/* Painel de Tipografia & Estilo do Chat (Feature 10) */}
        <div className="p-4 rounded-2xl bg-[#121722] border border-[#1E2638] shadow-md space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <Type className="w-3.5 h-3.5" /> Tipografia &amp; Estilo do Chat
            </span>
          </div>

          {/* Fonte & Família */}
          <div className="space-y-2 text-xs">
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Família da Fonte</label>
              <select
                value={fontFamily}
                onChange={(e) => setFontFamily(e.target.value)}
                className="w-full p-2 rounded-lg bg-[#0B0E14] border border-[#1E2638] text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              >
                <option value="Arial, Helvetica, sans-serif">Arial / GTA Standard</option>
                <option value="ChaletLondonNineteenSixty, Arial, sans-serif">Chalet London (GTA V)</option>
                <option value='"JetBrains Mono", monospace'>JetBrains Mono (Logs / OOC)</option>
                <option value='"Trebuchet MS", sans-serif'>Trebuchet MS</option>
                <option value="Impact, sans-serif">Impact</option>
                <option value="Georgia, serif">Georgia</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                  <span>Tamanho</span>
                  <span className="font-mono text-slate-200">{fontSize}px</span>
                </div>
                <input
                  type="range"
                  min="12"
                  max="48"
                  value={fontSize}
                  onChange={(e) => setFontSize(parseInt(e.target.value))}
                  className="w-full accent-emerald-500 h-1 bg-slate-800 rounded cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                  <span>Espaçamento</span>
                  <span className="font-mono text-slate-200">{lineHeightFactor.toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  min="1.1"
                  max="2.2"
                  step="0.05"
                  value={lineHeightFactor}
                  onChange={(e) => setLineHeightFactor(parseFloat(e.target.value))}
                  className="w-full accent-emerald-500 h-1 bg-slate-800 rounded cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Contorno GTA & Sombra */}
          <div className="pt-2 border-t border-[#1E2638] space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                <input
                  type="checkbox"
                  checked={strokeEnabled}
                  onChange={(e) => setStrokeEnabled(e.target.checked)}
                  className="rounded bg-slate-800 border-slate-700 text-emerald-500 focus:ring-0"
                />
                <Shield className="w-3.5 h-3.5 text-emerald-400" />
                <span>Contorno Autêntico GTA</span>
              </label>

              {strokeEnabled && (
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={strokeColor}
                    onChange={(e) => setStrokeColor(e.target.value)}
                    className="w-6 h-6 rounded border border-slate-700 bg-transparent cursor-pointer"
                    title="Cor do contorno"
                  />
                  <span className="font-mono text-[10px] text-slate-400">{strokeWidth}px</span>
                </div>
              )}
            </div>

            {strokeEnabled && (
              <input
                type="range"
                min="1"
                max="6"
                step="0.5"
                value={strokeWidth}
                onChange={(e) => setStrokeWidth(parseFloat(e.target.value))}
                className="w-full accent-emerald-500 h-1 bg-slate-800 rounded cursor-pointer"
              />
            )}
          </div>

          {/* Fundo do Chat (Highlight Boxes) */}
          <div className="pt-2 border-t border-[#1E2638] space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                <input
                  type="checkbox"
                  checked={bgEnabled}
                  onChange={(e) => setBgEnabled(e.target.checked)}
                  className="rounded bg-slate-800 border-slate-700 text-emerald-500 focus:ring-0"
                />
                <Palette className="w-3.5 h-3.5 text-emerald-400" />
                <span>Caixa de Fundo (Highlight)</span>
              </label>

              {bgEnabled && (
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={bgColor}
                    onChange={(e) => setBgColor(e.target.value)}
                    className="w-6 h-6 rounded border border-slate-700 bg-transparent cursor-pointer"
                    title="Cor do fundo"
                  />
                  <span className="font-mono text-[10px] text-slate-400">{Math.round(bgOpacity * 100)}%</span>
                </div>
              )}
            </div>

            {bgEnabled && (
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={bgOpacity}
                onChange={(e) => setBgOpacity(parseFloat(e.target.value))}
                className="w-full accent-emerald-500 h-1 bg-slate-800 rounded cursor-pointer"
              />
            )}
          </div>

          {/* Largura Máxima, Estilo de Censura e Timestamps */}
          <div className="pt-2 border-t border-[#1E2638] space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Largura Máx. Chat</span>
              <div className="flex items-center gap-2 w-1/2">
                <input
                  type="range"
                  min="40"
                  max="100"
                  step="5"
                  value={maxWidthPercent}
                  onChange={(e) => setMaxWidthPercent(parseInt(e.target.value))}
                  className="w-full accent-emerald-500 h-1 bg-slate-800 rounded cursor-pointer"
                />
                <span className="font-mono text-[10px] text-slate-300 w-8 text-right">{maxWidthPercent}%</span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-slate-400">Estilo de Censura</span>
              <div className="flex gap-1">
                <button
                  onClick={() => setCensorStyle('mosaic')}
                  className={`px-2 py-1 rounded text-[11px] font-medium transition-all ${
                    censorStyle === 'mosaic'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-[#0B0E14] text-slate-400 border border-[#1E2638]'
                  }`}
                >
                  Mosaico
                </button>
                <button
                  onClick={() => setCensorStyle('solid')}
                  className={`px-2 py-1 rounded text-[11px] font-medium transition-all ${
                    censorStyle === 'solid'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-[#0B0E14] text-slate-400 border border-[#1E2638]'
                  }`}
                >
                  Tarja Preta
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                <input
                  type="checkbox"
                  checked={showTimestamps}
                  onChange={(e) => setShowTimestamps(e.target.checked)}
                  className="rounded bg-slate-800 border-slate-700 text-emerald-500 focus:ring-0"
                />
                <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                <span>Exibir Timestamps [HH:MM:SS]</span>
              </label>
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
              <Type className="w-3.5 h-3.5" /> Diálogos &amp; Ações
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
            <button
              onClick={() => setRawText(prev => prev + '\n||CENSURADO|| ')}
              className="px-2 py-1 rounded bg-red-950/60 hover:bg-red-900/60 text-red-300 text-[10px] font-semibold transition-colors"
            >
              ||Censura||
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
            <span>Arraste com o ponteiro para posicionar o chat</span>
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

        {/* Viewport do Canvas com Drag & Drop */}
        <div 
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`relative rounded-2xl overflow-hidden bg-[#07090E] border transition-colors flex items-center justify-center p-2 min-h-[520px] shadow-2xl ${
            isDraggingFile ? 'border-emerald-400 ring-2 ring-emerald-500/30' : 'border-[#1E2638]'
          }`}
        >
          <canvas
            ref={previewCanvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            style={{ touchAction: 'none' }}
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
                Use os controles de tipografia e retoque fotográfico para dar aspecto de cinema.
              </p>
            </div>
          )}
        </div>

      </div>

    </div>
  );
};
