import React, { useState, useRef, useEffect } from 'react';
import { CanvasLayer } from '../../types';
import { RP_PRESETS } from '../../utils/rpPresets';
import { RP_STICKERS } from '../../utils/rpStickers';
import { PhotoAdjustments, DEFAULT_ADJUSTMENTS, applyPhotoAdjustments } from '../../utils/photoFilters';
import { 
  Palette, Type, Image as ImageIcon, Sparkles, Layers, Eye, EyeOff, 
  Trash2, ArrowUp, ArrowDown, Download, ShieldAlert,
  Camera, Tv, ShieldCheck, Crosshair, Plane, Car, Sliders, Clapperboard,
  Lock, Unlock, Copy, RotateCcw, Upload, Plus, AlignLeft, AlignCenter, AlignRight,
  ChevronsUp, ChevronsDown
} from 'lucide-react';

type DragMode = 'move' | 'resize-nw' | 'resize-ne' | 'resize-se' | 'resize-sw' | 'rotate' | null;

interface DragState {
  mode: DragMode;
  startX: number;
  startY: number;
  layerStartX: number;
  layerStartY: number;
  layerStartW: number;
  layerStartH: number;
  layerStartRot: number;
  anchorWorldX: number;
  anchorWorldY: number;
}

const BLEND_MODES: { label: string; value: GlobalCompositeOperation }[] = [
  { label: 'Normal', value: 'source-over' },
  { label: 'Screen (Divisão)', value: 'screen' },
  { label: 'Multiply (Multiplicação)', value: 'multiply' },
  { label: 'Overlay (Sobreposição)', value: 'overlay' },
  { label: 'Lighten (Clarear)', value: 'lighten' },
  { label: 'Darken (Escurecer)', value: 'darken' },
  { label: 'Color Dodge (Subexposição)', value: 'color-dodge' },
  { label: 'Color Burn (Superexposição)', value: 'color-burn' },
  { label: 'Hard Light (Luz Direta)', value: 'hard-light' },
  { label: 'Difference (Diferença)', value: 'difference' },
];

const FONT_FAMILIES = [
  { label: 'Inter (Moderno)', value: 'Inter, sans-serif' },
  { label: 'Share Tech Mono (Militar / Bodycam)', value: '"Share Tech Mono", monospace' },
  { label: 'JetBrains Mono (Código / Terminal)', value: '"JetBrains Mono", monospace' },
  { label: 'Oswald (Jornal / Manchete)', value: '"Oswald", sans-serif' },
  { label: 'Impact (Destaque)', value: 'Impact, sans-serif' },
];

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

  // Retoque Fotográfico & Filtros de Roleplay
  const [adjustments, setAdjustments] = useState<PhotoAdjustments>({ ...DEFAULT_ADJUSTMENTS });

  // Estado de Arraste e Transformação
  const [isDragging, setIsDragging] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imageFileInputRef = useRef<HTMLInputElement | null>(null);

  // Cache offscreen para o fundo filtrado (Feature 16)
  const bgBufferRef = useRef<{
    canvas: HTMLCanvasElement | null;
    key: string;
  }>({ canvas: null, key: '' });

  // Cache de imagens flutuantes e gerenciamento de Blob URLs (Feature 14)
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const blobUrlsRef = useRef<Set<string>>(new Set());

  // Estado da máquina de interação com handles (Features 12, 15)
  const dragStateRef = useRef<DragState>({
    mode: null,
    startX: 0,
    startY: 0,
    layerStartX: 0,
    layerStartY: 0,
    layerStartW: 0,
    layerStartH: 0,
    layerStartRot: 0,
    anchorWorldX: 0,
    anchorWorldY: 0
  });

  const selectedLayer = layers.find(l => l.id === selectedLayerId);

  // Limpeza de recursos na desmontagem
  useEffect(() => {
    const urls = blobUrlsRef.current;
    return () => {
      urls.forEach(url => URL.revokeObjectURL(url));
      urls.clear();
      imageCacheRef.current.clear();
    };
  }, []);

  // Upload de imagem de fundo
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

  // Upload e inserção de camada flutuante de imagem / selo / distintivo (Feature 14)
  const addImageLayer = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const objectUrl = URL.createObjectURL(file);
    blobUrlsRef.current.add(objectUrl);

    const img = new Image();
    img.onload = () => {
      imageCacheRef.current.set(objectUrl, img);
      const maxDim = 320;
      let w = img.naturalWidth || 200;
      let h = img.naturalHeight || 200;
      if (w > maxDim || h > maxDim) {
        const scale = Math.min(maxDim / w, maxDim / h);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }

      const newLayer: CanvasLayer = {
        id: `image-${Date.now()}`,
        type: 'image',
        name: file.name ? file.name.replace(/\.[^/.]+$/, '').slice(0, 18) : 'Imagem Flutuante',
        imageUrl: objectUrl,
        content: objectUrl,
        x: Math.round(canvasDimensions.width / 2 - w / 2),
        y: Math.round(canvasDimensions.height / 2 - h / 2),
        width: w,
        height: h,
        rotation: 0,
        opacity: 1,
        visible: true,
        locked: false,
        blendMode: 'source-over'
      };
      setLayers(prev => [...prev, newLayer]);
      setSelectedLayerId(newLayer.id);
    };
    img.src = objectUrl;
  };

  const addTextLayer = () => {
    const defaultText = 'DIGITE SEU TEXTO AQUI';
    const newLayer: CanvasLayer = {
      id: `text-${Date.now()}`,
      type: 'text',
      name: 'Texto Customizado',
      text: defaultText,
      content: defaultText,
      x: Math.round(canvasDimensions.width / 2 - 150),
      y: Math.round(canvasDimensions.height / 2 - 25),
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
      presetType: presetKey,
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
      x: Math.round(canvasDimensions.width / 2 - defaultW / 2),
      y: Math.round(canvasDimensions.height / 2 - defaultH / 2),
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

  // Reordenação de Camadas (Z-Order)
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

  const bringLayerToFront = (id: string) => {
    const idx = layers.findIndex(l => l.id === id);
    if (idx === -1 || idx === layers.length - 1) return;
    const layer = layers[idx];
    setLayers(prev => [...prev.filter(l => l.id !== id), layer]);
  };

  const sendLayerToBack = (id: string) => {
    const idx = layers.findIndex(l => l.id === id);
    if (idx === -1 || idx === 0) return;
    const layer = layers[idx];
    setLayers(prev => [layer, ...prev.filter(l => l.id !== id)]);
  };

  const duplicateLayer = (id: string) => {
    const layer = layers.find(l => l.id === id);
    if (!layer) return;
    const clone: CanvasLayer = {
      ...layer,
      id: `${layer.type}-${Date.now()}`,
      name: `${layer.name} (Cópia)`,
      x: layer.x + 20,
      y: layer.y + 20,
      presetData: layer.presetData ? { ...layer.presetData } : undefined
    };
    setLayers(prev => [...prev, clone]);
    setSelectedLayerId(clone.id);
  };

  const deleteLayer = (id: string) => {
    const layerToDelete = layers.find(l => l.id === id);
    if (layerToDelete?.imageUrl && layerToDelete.imageUrl.startsWith('blob:')) {
      URL.revokeObjectURL(layerToDelete.imageUrl);
      blobUrlsRef.current.delete(layerToDelete.imageUrl);
      imageCacheRef.current.delete(layerToDelete.imageUrl);
    }
    setLayers(prev => prev.filter(l => l.id !== id));
    if (selectedLayerId === id) setSelectedLayerId(null);
  };

  // Atualização reativa de propriedades da camada selecionada
  const updateSelectedLayer = (updates: Partial<CanvasLayer>) => {
    if (!selectedLayerId) return;
    setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, ...updates } : l));
  };

  const updatePresetDataField = (field: string, value: any) => {
    if (!selectedLayerId || !selectedLayer?.presetData) return;
    setLayers(prev => prev.map(l => l.id === selectedLayerId ? {
      ...l,
      presetData: { ...l.presetData, [field]: value }
    } : l));
  };

  // Gerador de Chave Determinística de Cache de Fundo (Feature 16)
  const getBackgroundCacheKey = (
    w: number,
    h: number,
    bg: HTMLImageElement | null,
    adj: PhotoAdjustments
  ): string => {
    return [
      w,
      h,
      bg ? bg.src : 'nobg',
      adj.brightness,
      adj.contrast,
      adj.saturation,
      adj.warmth,
      adj.sharpen,
      adj.depthOfField,
      adj.vignette,
      adj.grain,
      adj.letterbox,
      adj.colorPreset
    ].join('|');
  };

  // Resolvedor de buffer offscreen de fundo filtrado
  const getFilteredBackgroundCanvas = (
    width: number,
    height: number,
    bgImage: HTMLImageElement | null,
    adj: PhotoAdjustments
  ): HTMLCanvasElement => {
    const currentKey = getBackgroundCacheKey(width, height, bgImage, adj);

    if (bgBufferRef.current.canvas && bgBufferRef.current.key === currentKey) {
      return bgBufferRef.current.canvas; // Cache HIT (< 0.2ms)
    }

    // Cache MISS -> recomputa offscreen
    let offscreen = bgBufferRef.current.canvas;
    if (!offscreen) {
      offscreen = document.createElement('canvas');
      bgBufferRef.current.canvas = offscreen;
    }

    if (offscreen.width !== width) offscreen.width = width;
    if (offscreen.height !== height) offscreen.height = height;

    const offCtx = offscreen.getContext('2d', { willReadFrequently: true });
    if (offCtx) {
      offCtx.clearRect(0, 0, width, height);

      // 1. Renderiza imagem base ou grid de blueprint
      if (bgImage) {
        offCtx.drawImage(bgImage, 0, 0, width, height);
      } else {
        offCtx.fillStyle = '#0f172a';
        offCtx.fillRect(0, 0, width, height);
        offCtx.strokeStyle = '#1e293b';
        offCtx.lineWidth = 1;
        for (let x = 0; x < width; x += 50) {
          offCtx.beginPath();
          offCtx.moveTo(x, 0);
          offCtx.lineTo(x, height);
          offCtx.stroke();
        }
        for (let y = 0; y < height; y += 50) {
          offCtx.beginPath();
          offCtx.moveTo(0, y);
          offCtx.lineTo(width, y);
          offCtx.stroke();
        }
      }

      // 2. Aplica filtros fotográficos pesados no buffer offscreen
      applyPhotoAdjustments(offCtx, width, height, adj);
    }

    bgBufferRef.current.key = currentKey;
    return offscreen;
  };

  // Motor Central de Renderização do Canvas (60 FPS)
  const renderCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Evita realocação incondicional do surface backbuffer da GPU
    if (canvas.width !== canvasDimensions.width) canvas.width = canvasDimensions.width;
    if (canvas.height !== canvasDimensions.height) canvas.height = canvasDimensions.height;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Blit do Fundo Filtrado Cacheado (< 0.2ms)
    const bgBuffer = getFilteredBackgroundCanvas(
      canvas.width,
      canvas.height,
      backgroundImage,
      adjustments
    );
    ctx.drawImage(bgBuffer, 0, 0);

    // 2. Renderização de Camadas com Matriz de Transformação Central
    layers.forEach(layer => {
      if (!layer.visible) return;

      ctx.save();
      ctx.globalAlpha = layer.opacity ?? 1;
      if (layer.blendMode) {
        ctx.globalCompositeOperation = layer.blendMode;
      }

      if (layer.type === 'preset' && layer.presetType) {
        // Presets cinematográficos de tela cheia
        const renderer = (RP_PRESETS as any)[layer.presetType];
        if (renderer) {
          renderer.draw(ctx, canvas.width, canvas.height, layer.presetData || {});
        }
      } else {
        // Camadas em primeiro plano: transformação baseada no pivô central
        const halfW = layer.width / 2;
        const halfH = layer.height / 2;
        const cx = layer.x + halfW;
        const cy = layer.y + halfH;

        ctx.translate(cx, cy);
        if (layer.rotation) {
          ctx.rotate((layer.rotation * Math.PI) / 180);
        }

        // Renderização de Imagem Flutuante (Feature 14)
        if (layer.type === 'image') {
          const url = layer.imageUrl || layer.content;
          if (url) {
            let img = imageCacheRef.current.get(url);
            if (!img) {
              img = new Image();
              img.onload = () => renderCanvas();
              img.src = url;
              imageCacheRef.current.set(url, img);
            } else if (img.complete && img.naturalWidth > 0) {
              ctx.drawImage(img, -halfW, -halfH, layer.width, layer.height);
            }
          }
        } else if (layer.type === 'sticker' && layer.content) {
          // Adesivos e marcadores forenses
          const sticker = RP_STICKERS.find(s => s.id === layer.content);
          if (sticker) {
            sticker.draw(ctx, -halfW, -halfH, layer.width, layer.height);
          }
        } else if (layer.type === 'text') {
          // Camada de Texto com suporte a alinhamento e contorno
          const textToDraw = layer.text ?? layer.content ?? '';
          ctx.font = `${layer.fontWeight || 'bold'} ${layer.fontSize || 32}px ${layer.fontFamily || 'Inter, sans-serif'}`;
          
          const align = (layer as any).textAlign || 'center';
          ctx.textAlign = align;
          ctx.textBaseline = 'middle';

          let textDrawX = 0;
          if (align === 'left') textDrawX = -halfW + 8;
          else if (align === 'right') textDrawX = halfW - 8;

          if (layer.shadow) {
            ctx.shadowColor = layer.shadow.color;
            ctx.shadowBlur = layer.shadow.blur;
            ctx.shadowOffsetX = layer.shadow.offsetX;
            ctx.shadowOffsetY = layer.shadow.offsetY;
          }

          if (layer.strokeWidth && layer.strokeWidth > 0 && layer.strokeColor) {
            ctx.strokeStyle = layer.strokeColor;
            ctx.lineWidth = layer.strokeWidth;
            ctx.strokeText(textToDraw, textDrawX, 0);
          }

          ctx.fillStyle = layer.color || '#ffffff';
          ctx.fillText(textToDraw, textDrawX, 0);
        }

        // Bounding Box e Alças de Transformação da Camada Ativa (Feature 15)
        if (layer.id === selectedLayerId) {
          // Bounding Box tracejado esmeralda
          ctx.strokeStyle = '#10b981';
          ctx.lineWidth = 2;
          ctx.setLineDash([6, 4]);
          ctx.strokeRect(-halfW, -halfH, layer.width, layer.height);
          ctx.setLineDash([]);

          // Alça de Rotação (28px acima do topo-centro com linha conectora)
          ctx.strokeStyle = '#10b981';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(0, -halfH);
          ctx.lineTo(0, -halfH - 28);
          ctx.stroke();

          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(0, -halfH - 28, 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          // 4 Alças de redimensionamento nos cantos (quadrados 8x8 brancos com borda esmeralda)
          const handleSize = 8;
          const hHalf = handleSize / 2;
          const corners = [
            { x: -halfW, y: -halfH }, // nw
            { x: halfW, y: -halfH },  // ne
            { x: halfW, y: halfH },   // se
            { x: -halfW, y: halfH }    // sw
          ];

          ctx.fillStyle = '#ffffff';
          ctx.strokeStyle = '#10b981';
          ctx.lineWidth = 1.5;

          corners.forEach(corner => {
            ctx.fillRect(corner.x - hHalf, corner.y - hHalf, handleSize, handleSize);
            ctx.strokeRect(corner.x - hHalf, corner.y - hHalf, handleSize, handleSize);
          });
        }
      }

      ctx.restore();
    });
  };

  useEffect(() => {
    renderCanvas();
  }, [layers, selectedLayerId, canvasDimensions, backgroundImage, adjustments]);

  // Conversão de coordenadas da viewport do cliente para o espaço de pixels do canvas
  const getCanvasCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  };

  // Teste de colisão de alças de controle (Feature 15)
  const hitTestHandles = (layer: CanvasLayer, mx: number, my: number): DragMode => {
    if (layer.type === 'preset' || layer.locked) return null;

    const halfW = layer.width / 2;
    const halfH = layer.height / 2;
    const cx = layer.x + halfW;
    const cy = layer.y + halfH;
    const dx = mx - cx;
    const dy = my - cy;

    const rad = ((layer.rotation || 0) * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    // Coordenadas locais relativas ao centro com rotação inversa
    const lx = dx * cos + dy * sin;
    const ly = -dx * sin + dy * cos;

    const handleRadius = 10;

    // 1. Alça de rotação (0, -halfH - 28)
    const rotDistSq = Math.pow(lx, 2) + Math.pow(ly - (-halfH - 28), 2);
    if (rotDistSq <= Math.pow(handleRadius + 4, 2)) {
      return 'rotate';
    }

    // 2. Alças de canto
    if (Math.abs(lx - (-halfW)) <= handleRadius && Math.abs(ly - (-halfH)) <= handleRadius) return 'resize-nw';
    if (Math.abs(lx - halfW) <= handleRadius && Math.abs(ly - (-halfH)) <= handleRadius) return 'resize-ne';
    if (Math.abs(lx - halfW) <= handleRadius && Math.abs(ly - halfH) <= handleRadius) return 'resize-se';
    if (Math.abs(lx - (-halfW)) <= handleRadius && Math.abs(ly - halfH) <= handleRadius) return 'resize-sw';

    // 3. Corpo da camada
    if (Math.abs(lx) <= halfW && Math.abs(ly) <= halfH) return 'move';

    return null;
  };

  // Teste de colisão do corpo da camada com rotação inversa (Feature 12)
  const hitTestLayerBody = (layer: CanvasLayer, mx: number, my: number): boolean => {
    if (!layer.visible || layer.locked || layer.type === 'preset') return false;

    const halfW = layer.width / 2;
    const halfH = layer.height / 2;
    const cx = layer.x + halfW;
    const cy = layer.y + halfH;
    const dx = mx - cx;
    const dy = my - cy;

    const rad = ((layer.rotation || 0) * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    const lx = dx * cos + dy * sin;
    const ly = -dx * sin + dy * cos;

    return Math.abs(lx) <= halfW && Math.abs(ly) <= halfH;
  };

  // Event Handlers com Pointer Events & Pointer Capture (Feature 17)
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const { x: mx, y: my } = getCanvasCoords(e);

    // 1. Checa se clicou nas alças da camada selecionada
    if (selectedLayer && selectedLayer.type !== 'preset' && !selectedLayer.locked) {
      const handleMode = hitTestHandles(selectedLayer, mx, my);
      if (handleMode && handleMode !== 'move') {
        e.currentTarget.setPointerCapture?.(e.pointerId);
        setIsDragging(true);

        const rad = ((selectedLayer.rotation || 0) * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const halfW = selectedLayer.width / 2;
        const halfH = selectedLayer.height / 2;
        const cx = selectedLayer.x + halfW;
        const cy = selectedLayer.y + halfH;

        // Âncora oposta no espaço local
        let locOx = 0;
        let locOy = 0;
        if (handleMode === 'resize-se') { locOx = -halfW; locOy = -halfH; }
        else if (handleMode === 'resize-sw') { locOx = halfW; locOy = -halfH; }
        else if (handleMode === 'resize-ne') { locOx = -halfW; locOy = halfH; }
        else if (handleMode === 'resize-nw') { locOx = halfW; locOy = halfH; }

        // Converte a âncora oposta para coordenadas mundiais invariantes
        const anchorWorldX = cx + locOx * cos - locOy * sin;
        const anchorWorldY = cy + locOx * sin + locOy * cos;

        dragStateRef.current = {
          mode: handleMode,
          startX: mx,
          startY: my,
          layerStartX: selectedLayer.x,
          layerStartY: selectedLayer.y,
          layerStartW: selectedLayer.width,
          layerStartH: selectedLayer.height,
          layerStartRot: selectedLayer.rotation || 0,
          anchorWorldX,
          anchorWorldY
        };
        return;
      }
    }

    // 2. Hit-testing direto em ordem Z-reversa (Feature 12)
    let hitLayer: CanvasLayer | null = null;
    for (let i = layers.length - 1; i >= 0; i--) {
      const l = layers[i];
      if (hitTestLayerBody(l, mx, my)) {
        hitLayer = l;
        break;
      }
    }

    if (hitLayer) {
      e.currentTarget.setPointerCapture?.(e.pointerId);
      setSelectedLayerId(hitLayer.id);
      setIsDragging(true);

      dragStateRef.current = {
        mode: 'move',
        startX: mx,
        startY: my,
        layerStartX: hitLayer.x,
        layerStartY: hitLayer.y,
        layerStartW: hitLayer.width,
        layerStartH: hitLayer.height,
        layerStartRot: hitLayer.rotation || 0,
        anchorWorldX: 0,
        anchorWorldY: 0
      };
    } else {
      // Clique em área vazia -> desseleciona
      setSelectedLayerId(null);
      setIsDragging(false);
      dragStateRef.current = {
        mode: null,
        startX: 0,
        startY: 0,
        layerStartX: 0,
        layerStartY: 0,
        layerStartW: 0,
        layerStartH: 0,
        layerStartRot: 0,
        anchorWorldX: 0,
        anchorWorldY: 0
      };
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const { x: mx, y: my } = getCanvasCoords(e);
    const drag = dragStateRef.current;

    if (isDragging && drag.mode && selectedLayerId) {
      const targetLayer = layers.find(l => l.id === selectedLayerId);
      if (!targetLayer || targetLayer.locked) return;

      if (drag.mode === 'move') {
        const deltaX = mx - drag.startX;
        const deltaY = my - drag.startY;
        const newX = Math.round(drag.layerStartX + deltaX);
        const newY = Math.round(drag.layerStartY + deltaY);

        setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, x: newX, y: newY } : l));
      } else if (drag.mode === 'rotate') {
        const cx = targetLayer.x + targetLayer.width / 2;
        const cy = targetLayer.y + targetLayer.height / 2;
        const dx = mx - cx;
        const dy = my - cy;

        const angleRad = Math.atan2(dy, dx);
        let angleDeg = (angleRad * 180) / Math.PI + 90;
        angleDeg = ((Math.round(angleDeg) % 360) + 360) % 360;

        // Snapping em passos de 15 graus com Shift
        if (e.shiftKey) {
          angleDeg = Math.round(angleDeg / 15) * 15;
        }

        setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, rotation: angleDeg } : l));
      } else if (
        drag.mode === 'resize-se' ||
        drag.mode === 'resize-sw' ||
        drag.mode === 'resize-ne' ||
        drag.mode === 'resize-nw'
      ) {
        // Redimensionamento com Âncora Oposta Invariante (Feature 15)
        const rad = ((drag.layerStartRot || 0) * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);

        const ax = drag.anchorWorldX;
        const ay = drag.anchorWorldY;

        const dx = mx - ax;
        const dy = my - ay;

        // Projeção no espaço local dos eixos da camada
        const projX = dx * cos + dy * sin;
        const projY = -dx * sin + dy * cos;

        let newW = targetLayer.width;
        let newH = targetLayer.height;
        let cxNew = ax;
        let cyNew = ay;

        if (drag.mode === 'resize-se') {
          newW = Math.max(20, Math.round(projX));
          newH = Math.max(20, Math.round(projY));
          cxNew = ax + cos * (newW / 2) - sin * (newH / 2);
          cyNew = ay + sin * (newW / 2) + cos * (newH / 2);
        } else if (drag.mode === 'resize-sw') {
          newW = Math.max(20, Math.round(-projX));
          newH = Math.max(20, Math.round(projY));
          cxNew = ax - cos * (newW / 2) - sin * (newH / 2);
          cyNew = ay - sin * (newW / 2) + cos * (newH / 2);
        } else if (drag.mode === 'resize-ne') {
          newW = Math.max(20, Math.round(projX));
          newH = Math.max(20, Math.round(-projY));
          cxNew = ax + cos * (newW / 2) + sin * (newH / 2);
          cyNew = ay + sin * (newW / 2) - cos * (newH / 2);
        } else if (drag.mode === 'resize-nw') {
          newW = Math.max(20, Math.round(-projX));
          newH = Math.max(20, Math.round(-projY));
          cxNew = ax - cos * (newW / 2) + sin * (newH / 2);
          cyNew = ay - sin * (newW / 2) - cos * (newH / 2);
        }

        const newX = Math.round(cxNew - newW / 2);
        const newY = Math.round(cyNew - newH / 2);

        setLayers(prev => prev.map(l => l.id === selectedLayerId ? {
          ...l,
          x: newX,
          y: newY,
          width: newW,
          height: newH
        } : l));
      }
    } else {
      // Atualização de cursor dinâmico no hover
      let cursor = 'default';
      if (selectedLayer && selectedLayer.type !== 'preset' && !selectedLayer.locked) {
        const mode = hitTestHandles(selectedLayer, mx, my);
        if (mode === 'rotate') cursor = 'grab';
        else if (mode === 'resize-nw' || mode === 'resize-se') cursor = 'nwse-resize';
        else if (mode === 'resize-ne' || mode === 'resize-sw') cursor = 'nesw-resize';
        else if (mode === 'move') cursor = 'move';
      }

      if (cursor === 'default') {
        for (let i = layers.length - 1; i >= 0; i--) {
          if (hitTestLayerBody(layers[i], mx, my)) {
            cursor = 'pointer';
            break;
          }
        }
      }

      canvas.style.cursor = cursor;
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    setIsDragging(false);
    dragStateRef.current = {
      mode: null,
      startX: 0,
      startY: 0,
      layerStartX: 0,
      layerStartY: 0,
      layerStartW: 0,
      layerStartH: 0,
      layerStartRot: 0,
      anchorWorldX: 0,
      anchorWorldY: 0
    };
  };

  // Drag-and-Drop HTML5 no Container do Canvas (Feature 17)
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type.startsWith('image/')) {
        if (!backgroundImage) {
          handleBgUpload(file);
        } else {
          addImageLayer(file);
        }
      }
    }
  };

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
      
      {/* Coluna Esquerda: Ferramentas, Inspetor e Camadas (4 cols) */}
      <div className="lg:col-span-4 space-y-4 max-h-[calc(100vh-100px)] overflow-y-auto pr-1">
        
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
              <p className="text-[10px] text-slate-400">Timestamp militar e oficial.</p>
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
                <Plane className="w-3.5 h-3.5" /> FLIR Águia
              </div>
              <p className="text-[10px] text-slate-400">Visão aérea térmica com mira.</p>
            </button>

            <button
              onClick={() => applyPreset('dashcam')}
              className="p-2.5 rounded-xl bg-[#0B0E14] hover:bg-slate-800/80 border border-[#1E2638] hover:border-yellow-500/50 text-left transition-all"
            >
              <div className="flex items-center gap-1.5 text-yellow-400 font-bold text-xs mb-0.5">
                <Car className="w-3.5 h-3.5" /> Dashcam Viatura
              </div>
              <p className="text-[10px] text-slate-400">Radar de velocidade e viatura.</p>
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

        {/* Retoque da Foto & Color Grading */}
        <div className="p-4 rounded-2xl bg-[#121722] border border-[#1E2638] shadow-md space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5" /> Ajustes Fotográficos &amp; Foco
            </span>
            <button
              onClick={() => setAdjustments({ ...DEFAULT_ADJUSTMENTS })}
              className="text-[10px] text-slate-400 hover:text-emerald-400 transition-colors"
            >
              Resetar
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-slate-400 block mb-1">Brilho ({adjustments.brightness})</span>
              <input
                type="range" min="-50" max="50" value={adjustments.brightness}
                onChange={(e) => setAdjustments(prev => ({ ...prev, brightness: parseInt(e.target.value) }))}
                className="w-full accent-emerald-500 h-1 bg-slate-800 rounded cursor-pointer"
              />
            </div>
            <div>
              <span className="text-slate-400 block mb-1">Contraste ({adjustments.contrast})</span>
              <input
                type="range" min="-50" max="50" value={adjustments.contrast}
                onChange={(e) => setAdjustments(prev => ({ ...prev, contrast: parseInt(e.target.value) }))}
                className="w-full accent-emerald-500 h-1 bg-slate-800 rounded cursor-pointer"
              />
            </div>
            <div>
              <span className="text-slate-400 block mb-1">Saturação ({adjustments.saturation})</span>
              <input
                type="range" min="-50" max="50" value={adjustments.saturation}
                onChange={(e) => setAdjustments(prev => ({ ...prev, saturation: parseInt(e.target.value) }))}
                className="w-full accent-emerald-500 h-1 bg-slate-800 rounded cursor-pointer"
              />
            </div>
            <div>
              <span className="text-slate-400 block mb-1">Temperatura ({adjustments.warmth})</span>
              <input
                type="range" min="-50" max="50" value={adjustments.warmth}
                onChange={(e) => setAdjustments(prev => ({ ...prev, warmth: parseInt(e.target.value) }))}
                className="w-full accent-emerald-500 h-1 bg-slate-800 rounded cursor-pointer"
              />
            </div>
            <div>
              <span className="text-slate-400 block mb-1">Nitidez / Sharpen ({adjustments.sharpen}%)</span>
              <input
                type="range" min="0" max="100" value={adjustments.sharpen}
                onChange={(e) => setAdjustments(prev => ({ ...prev, sharpen: parseInt(e.target.value) }))}
                className="w-full accent-emerald-500 h-1 bg-slate-800 rounded cursor-pointer"
              />
            </div>
            <div>
              <span className="text-slate-400 block mb-1">Depth of Field ({adjustments.depthOfField}%)</span>
              <input
                type="range" min="0" max="100" value={adjustments.depthOfField}
                onChange={(e) => setAdjustments(prev => ({ ...prev, depthOfField: parseInt(e.target.value) }))}
                className="w-full accent-emerald-500 h-1 bg-slate-800 rounded cursor-pointer"
              />
            </div>
            <div>
              <span className="text-slate-400 block mb-1">Vinheta Suave ({adjustments.vignette}%)</span>
              <input
                type="range" min="0" max="100" value={adjustments.vignette}
                onChange={(e) => setAdjustments(prev => ({ ...prev, vignette: parseInt(e.target.value) }))}
                className="w-full accent-emerald-500 h-1 bg-slate-800 rounded cursor-pointer"
              />
            </div>
            <div>
              <span className="text-slate-400 block mb-1">Granulação Filme ({adjustments.grain}%)</span>
              <input
                type="range" min="0" max="100" value={adjustments.grain}
                onChange={(e) => setAdjustments(prev => ({ ...prev, grain: parseInt(e.target.value) }))}
                className="w-full accent-emerald-500 h-1 bg-slate-800 rounded cursor-pointer"
              />
            </div>
          </div>

          <div className="pt-1">
            <span className="text-slate-400 text-xs block mb-1">Preset de Color Grading</span>
            <select
              value={adjustments.colorPreset}
              onChange={(e) => setAdjustments(prev => ({ ...prev, colorPreset: e.target.value as any }))}
              className="w-full bg-[#0B0E14] border border-[#1E2638] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
            >
              <option value="none">Nenhum (Cores Naturais)</option>
              <option value="golden-hour">Golden Hour (Pôr do Sol)</option>
              <option value="midnight-neon">Midnight Neon (Noturno Los Santos)</option>
              <option value="grit-crime">Grit &amp; Crime (Dramático Policial)</option>
              <option value="vintage-90s">Vintage Anos 90 (Nostalgia)</option>
            </select>
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

        {/* Adesivos, Texto, Imagem e Fundo */}
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

          <div className="pt-2 grid grid-cols-3 gap-2">
            <button
              onClick={addTextLayer}
              className="py-2 px-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white flex items-center justify-center gap-1.5 transition-colors"
            >
              <Type className="w-3.5 h-3.5 text-emerald-400" /> Texto
            </button>

            <button
              onClick={() => imageFileInputRef.current?.click()}
              className="py-2 px-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white flex items-center justify-center gap-1.5 transition-colors"
            >
              <Plus className="w-3.5 h-3.5 text-emerald-400" /> Imagem
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="py-2 px-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white flex items-center justify-center gap-1.5 transition-colors"
            >
              <ImageIcon className="w-3.5 h-3.5 text-emerald-400" /> Fundo
            </button>

            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => e.target.files?.[0] && handleBgUpload(e.target.files[0])}
              accept="image/*"
              className="hidden"
            />
            <input
              type="file"
              ref={imageFileInputRef}
              onChange={(e) => e.target.files?.[0] && addImageLayer(e.target.files[0])}
              accept="image/*"
              className="hidden"
            />
          </div>
        </div>

        {/* Inspetor de Propriedades da Camada (Feature 13) */}
        <div className="p-4 rounded-2xl bg-[#121722] border border-[#1E2638] shadow-md space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5" /> Inspetor de Propriedades
            </span>
            {selectedLayer && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-emerald-400 border border-slate-700">
                {selectedLayer.type.toUpperCase()}
              </span>
            )}
          </div>

          {selectedLayer ? (
            <div className="space-y-3">
              {/* Controles Universais */}
              <div className="space-y-2 text-xs">
                <div>
                  <span className="text-slate-400 block mb-1">Nome da Camada</span>
                  <input
                    type="text"
                    value={selectedLayer.name}
                    onChange={(e) => updateSelectedLayer({ name: e.target.value })}
                    className="w-full bg-[#0B0E14] border border-[#1E2638] rounded-lg px-2.5 py-1 text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-slate-400 block mb-1">Opacidade ({Math.round(selectedLayer.opacity * 100)}%)</span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={Math.round(selectedLayer.opacity * 100)}
                      onChange={(e) => updateSelectedLayer({ opacity: parseInt(e.target.value) / 100 })}
                      className="w-full accent-emerald-500 h-1 bg-slate-800 rounded cursor-pointer"
                    />
                  </div>

                  <div>
                    <span className="text-slate-400 block mb-1">Modo de Mesclagem</span>
                    <select
                      value={selectedLayer.blendMode || 'source-over'}
                      onChange={(e) => updateSelectedLayer({ blendMode: e.target.value as GlobalCompositeOperation })}
                      className="w-full bg-[#0B0E14] border border-[#1E2638] rounded-lg px-2 py-1 text-white text-[11px] focus:outline-none focus:border-emerald-500"
                    >
                      {BLEND_MODES.map(mode => (
                        <option key={mode.value} value={mode.value}>{mode.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Ações Rápidas da Camada */}
                <div className="flex items-center gap-1.5 pt-1">
                  <button
                    onClick={() => updateSelectedLayer({ locked: !selectedLayer.locked })}
                    className={`flex-1 py-1 px-2 rounded-lg border text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors ${
                      selectedLayer.locked
                        ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                        : 'bg-[#0B0E14] border-[#1E2638] text-slate-400 hover:text-white'
                    }`}
                  >
                    {selectedLayer.locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                    <span>{selectedLayer.locked ? 'Travado' : 'Travar'}</span>
                  </button>

                  <button
                    onClick={() => updateSelectedLayer({ visible: !selectedLayer.visible })}
                    className={`flex-1 py-1 px-2 rounded-lg border text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors ${
                      selectedLayer.visible
                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                        : 'bg-[#0B0E14] border-[#1E2638] text-slate-400 hover:text-white'
                    }`}
                  >
                    {selectedLayer.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                    <span>{selectedLayer.visible ? 'Visível' : 'Oculto'}</span>
                  </button>

                  <button
                    onClick={() => duplicateLayer(selectedLayer.id)}
                    className="p-1.5 rounded-lg bg-[#0B0E14] border border-[#1E2638] text-slate-400 hover:text-emerald-400 transition-colors"
                    title="Duplicar Camada"
                  >
                    <Copy className="w-3 h-3" />
                  </button>

                  <button
                    onClick={() => bringLayerToFront(selectedLayer.id)}
                    className="p-1.5 rounded-lg bg-[#0B0E14] border border-[#1E2638] text-slate-400 hover:text-white transition-colors"
                    title="Trazer para Frente"
                  >
                    <ChevronsUp className="w-3 h-3" />
                  </button>

                  <button
                    onClick={() => sendLayerToBack(selectedLayer.id)}
                    className="p-1.5 rounded-lg bg-[#0B0E14] border border-[#1E2638] text-slate-400 hover:text-white transition-colors"
                    title="Enviar para Trás"
                  >
                    <ChevronsDown className="w-3 h-3" />
                  </button>

                  <button
                    onClick={() => deleteLayer(selectedLayer.id)}
                    className="p-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-colors"
                    title="Excluir Camada"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* Controles Específicos para Camada de Texto */}
              {selectedLayer.type === 'text' && (
                <div className="space-y-2 pt-2 border-t border-[#1E2638] text-xs">
                  <div>
                    <span className="text-slate-400 block mb-1">Conteúdo do Texto</span>
                    <textarea
                      rows={2}
                      value={selectedLayer.text ?? selectedLayer.content ?? ''}
                      onChange={(e) => updateSelectedLayer({ text: e.target.value, content: e.target.value })}
                      className="w-full bg-[#0B0E14] border border-[#1E2638] rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-slate-400 block mb-1">Família da Fonte</span>
                      <select
                        value={selectedLayer.fontFamily || 'Inter, sans-serif'}
                        onChange={(e) => updateSelectedLayer({ fontFamily: e.target.value })}
                        className="w-full bg-[#0B0E14] border border-[#1E2638] rounded-lg px-2 py-1 text-white text-[11px] focus:outline-none focus:border-emerald-500"
                      >
                        {FONT_FAMILIES.map(f => (
                          <option key={f.value} value={f.value}>{f.label}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <span className="text-slate-400 block mb-1">Tamanho ({selectedLayer.fontSize || 32}px)</span>
                      <input
                        type="range"
                        min="12"
                        max="120"
                        value={selectedLayer.fontSize || 32}
                        onChange={(e) => updateSelectedLayer({ fontSize: parseInt(e.target.value) })}
                        className="w-full accent-emerald-500 h-1 bg-slate-800 rounded cursor-pointer"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-slate-400 block mb-1">Cor do Texto</span>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="color"
                          value={selectedLayer.color || '#ffffff'}
                          onChange={(e) => updateSelectedLayer({ color: e.target.value })}
                          className="w-7 h-7 rounded border border-[#1E2638] bg-transparent cursor-pointer p-0"
                        />
                        <input
                          type="text"
                          value={selectedLayer.color || '#ffffff'}
                          onChange={(e) => updateSelectedLayer({ color: e.target.value })}
                          className="w-full bg-[#0B0E14] border border-[#1E2638] rounded px-1.5 py-1 text-white text-[11px] font-mono"
                        />
                      </div>
                    </div>

                    <div>
                      <span className="text-slate-400 block mb-1">Contorno ({selectedLayer.strokeWidth || 0}px)</span>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="color"
                          value={selectedLayer.strokeColor || '#000000'}
                          onChange={(e) => updateSelectedLayer({ strokeColor: e.target.value })}
                          className="w-7 h-7 rounded border border-[#1E2638] bg-transparent cursor-pointer p-0"
                        />
                        <input
                          type="range"
                          min="0"
                          max="10"
                          value={selectedLayer.strokeWidth || 0}
                          onChange={(e) => updateSelectedLayer({ strokeWidth: parseInt(e.target.value) })}
                          className="w-full accent-emerald-500 h-1 bg-slate-800 rounded cursor-pointer"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <span className="text-slate-400 block mb-1">Alinhamento</span>
                    <div className="flex rounded-lg border border-[#1E2638] overflow-hidden bg-[#0B0E14]">
                      {(['left', 'center', 'right'] as const).map((align) => {
                        const currentAlign = (selectedLayer as any).textAlign || 'center';
                        return (
                          <button
                            key={align}
                            onClick={() => updateSelectedLayer({ textAlign: align } as any)}
                            className={`flex-1 py-1 flex items-center justify-center transition-colors ${
                              currentAlign === align ? 'bg-emerald-500/20 text-emerald-400 font-bold' : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            {align === 'left' && <AlignLeft className="w-3.5 h-3.5" />}
                            {align === 'center' && <AlignCenter className="w-3.5 h-3.5" />}
                            {align === 'right' && <AlignRight className="w-3.5 h-3.5" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Controles Específicos para Camadas de Imagem e Adesivo */}
              {(selectedLayer.type === 'image' || selectedLayer.type === 'sticker') && (
                <div className="space-y-2 pt-2 border-t border-[#1E2638] text-xs">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-slate-400 block mb-1">Largura ({selectedLayer.width}px)</span>
                      <input
                        type="range"
                        min="20"
                        max="800"
                        value={selectedLayer.width}
                        onChange={(e) => updateSelectedLayer({ width: parseInt(e.target.value) })}
                        className="w-full accent-emerald-500 h-1 bg-slate-800 rounded cursor-pointer"
                      />
                    </div>
                    <div>
                      <span className="text-slate-400 block mb-1">Altura ({selectedLayer.height}px)</span>
                      <input
                        type="range"
                        min="20"
                        max="800"
                        value={selectedLayer.height}
                        onChange={(e) => updateSelectedLayer({ height: parseInt(e.target.value) })}
                        className="w-full accent-emerald-500 h-1 bg-slate-800 rounded cursor-pointer"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-slate-400">Rotação ({selectedLayer.rotation || 0}°)</span>
                      <button
                        onClick={() => updateSelectedLayer({ rotation: 0 })}
                        className="text-[10px] text-emerald-400 hover:underline flex items-center gap-0.5"
                      >
                        <RotateCcw className="w-2.5 h-2.5" /> Resetar 0°
                      </button>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="360"
                      value={selectedLayer.rotation || 0}
                      onChange={(e) => updateSelectedLayer({ rotation: parseInt(e.target.value) })}
                      className="w-full accent-emerald-500 h-1 bg-slate-800 rounded cursor-pointer"
                    />
                  </div>
                </div>
              )}

              {/* Controles Específicos para Presets de RP */}
              {selectedLayer.type === 'preset' && selectedLayer.presetData && (
                <div className="space-y-2 pt-2 border-t border-[#1E2638] text-xs">
                  <span className="text-emerald-400 font-bold block mb-1">Dados do Preset de RP</span>

                  {selectedLayer.presetType === 'bodycam' && (
                    <>
                      <div>
                        <span className="text-slate-400 block mb-0.5">Nome e Distintivo do Oficial</span>
                        <input
                          type="text"
                          value={selectedLayer.presetData.officerName || ''}
                          onChange={(e) => updatePresetDataField('officerName', e.target.value)}
                          className="w-full bg-[#0B0E14] border border-[#1E2638] rounded px-2 py-1 text-white"
                        />
                      </div>
                      <div>
                        <span className="text-slate-400 block mb-0.5">Departamento / Lotação</span>
                        <input
                          type="text"
                          value={selectedLayer.presetData.department || ''}
                          onChange={(e) => updatePresetDataField('department', e.target.value)}
                          className="w-full bg-[#0B0E14] border border-[#1E2638] rounded px-2 py-1 text-white"
                        />
                      </div>
                      <div className="flex items-center justify-between pt-1">
                        <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!selectedLayer.presetData.showDate}
                            onChange={(e) => updatePresetDataField('showDate', e.target.checked)}
                            className="accent-emerald-500 rounded"
                          />
                          <span>Exibir Data/Hora (UTC)</span>
                        </label>
                        <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!selectedLayer.presetData.recDot}
                            onChange={(e) => updatePresetDataField('recDot', e.target.checked)}
                            className="accent-emerald-500 rounded"
                          />
                          <span>Ponto ● REC</span>
                        </label>
                      </div>
                    </>
                  )}

                  {selectedLayer.presetType === 'weazel' && (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-slate-400 block mb-0.5">Tag GC</span>
                          <input
                            type="text"
                            value={selectedLayer.presetData.tag || ''}
                            onChange={(e) => updatePresetDataField('tag', e.target.value)}
                            className="w-full bg-[#0B0E14] border border-[#1E2638] rounded px-2 py-1 text-white"
                          />
                        </div>
                        <div>
                          <span className="text-slate-400 block mb-0.5">Localidade</span>
                          <input
                            type="text"
                            value={selectedLayer.presetData.location || ''}
                            onChange={(e) => updatePresetDataField('location', e.target.value)}
                            className="w-full bg-[#0B0E14] border border-[#1E2638] rounded px-2 py-1 text-white"
                          />
                        </div>
                      </div>
                      <div>
                        <span className="text-slate-400 block mb-0.5">Manchete Principal</span>
                        <textarea
                          rows={2}
                          value={selectedLayer.presetData.headline || ''}
                          onChange={(e) => updatePresetDataField('headline', e.target.value)}
                          className="w-full bg-[#0B0E14] border border-[#1E2638] rounded px-2 py-1 text-white"
                        />
                      </div>
                      <div>
                        <span className="text-slate-400 block mb-0.5">Sub-Manchete / Ticker</span>
                        <textarea
                          rows={2}
                          value={selectedLayer.presetData.subHeadline || ''}
                          onChange={(e) => updatePresetDataField('subHeadline', e.target.value)}
                          className="w-full bg-[#0B0E14] border border-[#1E2638] rounded px-2 py-1 text-white"
                        />
                      </div>
                    </>
                  )}

                  {selectedLayer.presetType === 'flir' && (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-slate-400 block mb-0.5">Unidade / Callsign</span>
                          <input
                            type="text"
                            value={selectedLayer.presetData.unitName || ''}
                            onChange={(e) => updatePresetDataField('unitName', e.target.value)}
                            className="w-full bg-[#0B0E14] border border-[#1E2638] rounded px-2 py-1 text-white"
                          />
                        </div>
                        <div>
                          <span className="text-slate-400 block mb-0.5">Velocidade Alvo</span>
                          <input
                            type="text"
                            value={selectedLayer.presetData.targetSpeed || ''}
                            onChange={(e) => updatePresetDataField('targetSpeed', e.target.value)}
                            className="w-full bg-[#0B0E14] border border-[#1E2638] rounded px-2 py-1 text-white"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-slate-400 block mb-0.5">Altitude</span>
                          <input
                            type="text"
                            value={selectedLayer.presetData.altitude || ''}
                            onChange={(e) => updatePresetDataField('altitude', e.target.value)}
                            className="w-full bg-[#0B0E14] border border-[#1E2638] rounded px-2 py-1 text-white"
                          />
                        </div>
                        <div>
                          <span className="text-slate-400 block mb-0.5">Rumo / Bússola</span>
                          <input
                            type="text"
                            value={selectedLayer.presetData.heading || ''}
                            onChange={(e) => updatePresetDataField('heading', e.target.value)}
                            className="w-full bg-[#0B0E14] border border-[#1E2638] rounded px-2 py-1 text-white"
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {selectedLayer.presetType === 'dashcam' && (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-slate-400 block mb-0.5">Agência Policial</span>
                          <input
                            type="text"
                            value={selectedLayer.presetData.agency || ''}
                            onChange={(e) => updatePresetDataField('agency', e.target.value)}
                            className="w-full bg-[#0B0E14] border border-[#1E2638] rounded px-2 py-1 text-white"
                          />
                        </div>
                        <div>
                          <span className="text-slate-400 block mb-0.5">Prefixo da Viatura</span>
                          <input
                            type="text"
                            value={selectedLayer.presetData.patrolUnit || ''}
                            onChange={(e) => updatePresetDataField('patrolUnit', e.target.value)}
                            className="w-full bg-[#0B0E14] border border-[#1E2638] rounded px-2 py-1 text-white"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-slate-400 block mb-0.5">Velocidade Viatura</span>
                          <input
                            type="text"
                            value={selectedLayer.presetData.patrolSpeed || ''}
                            onChange={(e) => updatePresetDataField('patrolSpeed', e.target.value)}
                            className="w-full bg-[#0B0E14] border border-[#1E2638] rounded px-2 py-1 text-white"
                          />
                        </div>
                        <div>
                          <span className="text-slate-400 block mb-0.5">Velocidade Alvo</span>
                          <input
                            type="text"
                            value={selectedLayer.presetData.targetSpeed || ''}
                            onChange={(e) => updatePresetDataField('targetSpeed', e.target.value)}
                            className="w-full bg-[#0B0E14] border border-[#1E2638] rounded px-2 py-1 text-white"
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {selectedLayer.presetType === 'cctv' && (
                    <>
                      <div>
                        <span className="text-slate-400 block mb-0.5">Identificação da Câmera</span>
                        <input
                          type="text"
                          value={selectedLayer.presetData.camName || ''}
                          onChange={(e) => updatePresetDataField('camName', e.target.value)}
                          className="w-full bg-[#0B0E14] border border-[#1E2638] rounded px-2 py-1 text-white"
                        />
                      </div>
                      <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer pt-1">
                        <input
                          type="checkbox"
                          checked={!!selectedLayer.presetData.showDate}
                          onChange={(e) => updatePresetDataField('showDate', e.target.checked)}
                          className="accent-emerald-500 rounded"
                        />
                        <span>Exibir Data/Hora no Topo</span>
                      </label>
                    </>
                  )}

                  {selectedLayer.presetType === 'mugshot' && (
                    <>
                      <div>
                        <span className="text-slate-400 block mb-0.5">Departamento Policial</span>
                        <input
                          type="text"
                          value={selectedLayer.presetData.policeDept || ''}
                          onChange={(e) => updatePresetDataField('policeDept', e.target.value)}
                          className="w-full bg-[#0B0E14] border border-[#1E2638] rounded px-2 py-1 text-white"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-slate-400 block mb-0.5">Nome do Suspeito</span>
                          <input
                            type="text"
                            value={selectedLayer.presetData.suspectName || ''}
                            onChange={(e) => updatePresetDataField('suspectName', e.target.value)}
                            className="w-full bg-[#0B0E14] border border-[#1E2638] rounded px-2 py-1 text-white"
                          />
                        </div>
                        <div>
                          <span className="text-slate-400 block mb-0.5">Booking ID</span>
                          <input
                            type="text"
                            value={selectedLayer.presetData.bookingId || ''}
                            onChange={(e) => updatePresetDataField('bookingId', e.target.value)}
                            className="w-full bg-[#0B0E14] border border-[#1E2638] rounded px-2 py-1 text-white"
                          />
                        </div>
                      </div>
                      <div>
                        <span className="text-slate-400 block mb-0.5">Artigos Penais / Enquadramento</span>
                        <textarea
                          rows={2}
                          value={selectedLayer.presetData.charges || ''}
                          onChange={(e) => updatePresetDataField('charges', e.target.value)}
                          className="w-full bg-[#0B0E14] border border-[#1E2638] rounded px-2 py-1 text-white"
                        />
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-500 italic py-2">
              Nenhuma camada selecionada. Clique em um elemento no canvas ou na lista abaixo para editar.
            </p>
          )}
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
                      title={layer.visible ? 'Ocultar' : 'Exibir'}
                    >
                      {layer.visible ? <Eye className="w-3.5 h-3.5 text-emerald-400" /> : <EyeOff className="w-3.5 h-3.5 text-slate-600" />}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); moveLayer(layer.id, 'up'); }}
                      className="p-1 hover:text-white"
                      title="Subir Camada"
                    >
                      <ArrowUp className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); moveLayer(layer.id, 'down'); }}
                      className="p-1 hover:text-white"
                      title="Descer Camada"
                    >
                      <ArrowDown className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteLayer(layer.id); }}
                      className="p-1 hover:text-red-400"
                      title="Excluir Camada"
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
            <span>RP Canvas Studio — Clique para selecionar camadas, arraste ou rotacione pelas alças</span>
          </div>

          <button
            onClick={exportCanvasImage}
            className="px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-emerald-500/20 transition-all"
          >
            <Download className="w-4 h-4" /> Exportar Imagem PNG
          </button>
        </div>

        {/* Container do Canvas com Drag-and-Drop HTML5 e Feedback Visual (Feature 17) */}
        <div 
          onDragOver={handleDragOver}
          onDragEnter={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`relative rounded-2xl overflow-hidden bg-[#07090E] border transition-all flex items-center justify-center p-2 min-h-[540px] shadow-2xl ${
            isDragOver ? 'border-emerald-500 ring-4 ring-emerald-500/20' : 'border-[#1E2638]'
          }`}
        >
          {isDragOver && (
            <div className="absolute inset-0 bg-emerald-950/70 backdrop-blur-sm z-30 flex flex-col items-center justify-center gap-3 text-emerald-400 font-bold pointer-events-none">
              <Upload className="w-12 h-12 animate-bounce" />
              <span className="text-sm uppercase tracking-wider">
                Solte a imagem para carregar {backgroundImage ? 'como nova camada' : 'como plano de fundo'}
              </span>
            </div>
          )}

          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            style={{ touchAction: 'none' }}
            className="max-w-full max-h-[75vh] object-contain rounded-lg shadow-lg"
          />
        </div>

      </div>

    </div>
  );
};
