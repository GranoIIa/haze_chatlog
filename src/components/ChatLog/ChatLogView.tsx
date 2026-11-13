import React, { useState, useRef, useEffect } from 'react';
import { Character, ParsedLine } from '../../types';
import { CHAR_COLORS } from '../../utils/chatParser';
import { renderChatText } from '../../utils/chatRenderer';
import { SimplePanel } from './panels/SimplePanel';
import { applyVisual, findVisual, inferVisual } from '../../utils/visualPresets';
import { useCharacterDetection } from './useCharacterDetection';
import { publishChat, subscribeChatTextRequests, subscribeChatStyleRequests, subscribeBackgroundRequests, type BackgroundRequest } from '../../utils/chatStore';
import type { CanvasLayer } from '../../types';
import { RP_PRESETS } from '../../utils/rpPresets';
import { RP_STICKERS } from '../../utils/rpStickers';
import {
  drawCanvasLayer, drawLayerHandles, hitTestHandles, hitTestLayerBody, startHandleDrag, applyLayerDrag,
  EMPTY_DRAG, LayerDragState
} from '../../utils/canvasLayerRenderer';
import { CanvasLayersSidebar, PresetKey } from '../RpElements/CanvasLayersSidebar';
import { CameraPanel } from './panels/CameraPanel';
import { DialogPanel } from './panels/DialogPanel';
import {
  EditorSection, SectionId, SECTION_IDS, loadOpenSections, saveOpenSections
} from './EditorSection';
import { LightingPanel } from './panels/LightingPanel';
import { 
  PhotoAdjustments, DEFAULT_ADJUSTMENTS, applyPhotoAdjustments 
} from '../../utils/photoFilters';
import { 
  Upload, Download, Plus, Trash2, Sparkles, Sliders, Type, 
  Layers, RefreshCw, Move, Clapperboard, Sun, Contrast,
  Flame, Zap, Shield, EyeOff, Palette, Crop, MousePointer2, Lightbulb, Copy, Play, Pause, Film
} from 'lucide-react';

import { STORAGE_KEY, loadSaved, RESOLUTION_PRESETS, MIN_RES, MAX_RES, drawFittedImage, fitGeometry, isFitMode, sanitizeCanvasLayers, num, bool, str, type FitMode, type MouseTool, type ImageLayer } from '../../utils/editorSettings';
import { DEFAULT_LIGHTING, LIGHT_SOURCES, LIGHT_BLENDS, LIGHTING_PRESETS, LIGHT_POSITIONS, hexToRgba, sanitizeLighting, drawPhotographicLight, drawLightGizmo, type LightSource, type Lighting } from '../../utils/lighting';
import { NO_EFFECTS, DEFAULT_CAMERA, CAMERA_PRESET_EFFECTS, EFFECT_LABELS, sanitizeCamera, getNoiseCanvas, applyFilmEffects, drawCameraOverlay, type CameraPreset, type EffectKey, type CameraState } from '../../utils/cameraFx';
import {
  saveLayersToDb, loadLayersFromDb, clearLayersDb, saveBackgroundToDb, loadBackgroundFromDb
} from '../../utils/layerStorage';
import {
  buildProjectBlob, parseProjectFile, ProjectError, ProjectScene, ProjectAsset, PROJECT_EXTENSION,
  sanitizeCensorRegions
} from '../../utils/projectFile';
import { decodeGif, type DecodedFrame } from '../../utils/gifDecoder';
import {
  drawAllCensorRegions, createBrushCensorRegion, appendPointToBrushRegion,
  getCensorBoundingBox, burnInCensorshipOnCanvas
} from '../../utils/censorRenderer';
import type { CensorRegion, CensorType, CensorShape, CensorScope } from '../../types';

export const ChatLogView: React.FC = () => {
  // Container Ref para escopo de eventos globais (ex: paste em abas inativas)
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Configurações restauradas do localStorage (lidas uma única vez)
  const [saved] = useState<Record<string, any>>(loadSaved);
  const [fontsVersion, setFontsVersion] = useState(0); // incrementa quando fontes web terminam de carregar

  // Modo de trabalho: foto individual ou lote (ZIP)
  const [mode, setMode] = useState<'single' | 'batch'>('single');
  // Modo Simples (padrão: foto → chat → visual → salvar) ou Avançado (todas as seções)
  const [uiMode, setUiModeState] = useState<'simple' | 'advanced'>(() => {
    try { return localStorage.getItem('haze-ui-mode-v1') === 'advanced' ? 'advanced' : 'simple'; } catch (_) { return 'simple'; }
  });
  const setUiMode = (m: 'simple' | 'advanced') => {
    setUiModeState(m);
    try { localStorage.setItem('haze-ui-mode-v1', m); } catch (_) { /* sem armazenamento */ }
  };
  const [batchFiles, setBatchFiles] = useState<File[]>([]);
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);
  const batchInputRef = useRef<HTMLInputElement | null>(null);

  // Estado da Imagem
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [bgId, setBgId] = useState<string | null>(null);   // identifica a foto de fundo atual (histórico e projeto)
  const [bgReady, setBgReady] = useState(false);           // true depois de restaurar a foto salva
  const bgBlobs = useRef<Map<string, Blob>>(new Map());    // fotos já usadas na sessão (para desfazer)
  const bgNames = useRef<Map<string, string>>(new Map());
  const storedBgId = useRef<string | null>(null);          // foto já gravada no IndexedDB
  const projectInputRef = useRef<HTMLInputElement | null>(null);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number }>({ width: 1280, height: 720 });
  const [darkening, setDarkening] = useState<number>(num(saved.darkening, 0.15));
  const [isDraggingFile, setIsDraggingFile] = useState<boolean>(false);

  // Suporte a GIF animado no fundo da cena
  const [isGif, setIsGif] = useState<boolean>(false);
  const [isGifPlaying, setIsGifPlaying] = useState<boolean>(true);
  const [gifMeta, setGifMeta] = useState<BackgroundRequest['gifMeta'] | null>(null);
  const [isExportingGif, setIsExportingGif] = useState<boolean>(false);
  const [gifExportProgress, setGifExportProgress] = useState<number>(0);

  // Quadros decodificados do GIF para animação em tempo real e exportação
  const [gifFrames, setGifFrames] = useState<DecodedFrame[]>([]);
  const gifFramesRef = useRef<DecodedFrame[]>([]);
  gifFramesRef.current = gifFrames;
  const currentFrameIdxRef = useRef<number>(0);
  const gifLoadGenRef = useRef<number>(0);
  const gifAbortControllerRef = useRef<AbortController | null>(null);

  const processGifBlob = async (blob: Blob) => {
    // Cancela eventual decodificação anterior ainda em andamento
    if (gifAbortControllerRef.current) {
      gifAbortControllerRef.current.abort();
    }
    const abortCtrl = new AbortController();
    gifAbortControllerRef.current = abortCtrl;
    const currentGen = ++gifLoadGenRef.current;

    try {
      const decoded = await decodeGif(blob, { signal: abortCtrl.signal });

      // Se um novo upload foi iniciado enquanto este decodificava, descarta e limpa
      if (currentGen !== gifLoadGenRef.current || abortCtrl.signal.aborted) {
        if (decoded?.frames) {
          decoded.frames.forEach(f => {
            if ('close' in f.image && typeof (f.image as any).close === 'function') {
              (f.image as any).close();
            }
          });
        }
        return;
      }

      if (decoded && decoded.frames.length > 0) {
        // Libera bitmaps anteriores da memória da GPU
        gifFramesRef.current.forEach(f => {
          if ('close' in f.image && typeof (f.image as any).close === 'function') {
            (f.image as any).close();
          }
        });
        gifFramesRef.current = decoded.frames;
        setGifFrames(decoded.frames);
        currentFrameIdxRef.current = 0;
        setIsGif(true);
        setImageDimensions({ width: decoded.width, height: decoded.height });
        setGifMeta(prev => ({
          duration: decoded.totalDurationMs / 1000,
          frames: decoded.frames.length,
          fps: Math.round(1000 / (decoded.totalDurationMs / decoded.frames.length)) || 12,
          width: decoded.width,
          height: decoded.height,
          ...(prev || {})
        }));
      }
    } catch (e) {
      if (!abortCtrl.signal.aborted) {
        console.warn('[processGifBlob] Erro ao decodificar:', e);
      }
    }
  };

  // Ajustes de Imagem / Retoque Fotográfico (Estilo Photoshop na GPU/Canvas)
  const [adjustments, setAdjustments] = useState<PhotoAdjustments>({
    ...DEFAULT_ADJUSTMENTS,
    ...(saved.adjustments && typeof saved.adjustments === 'object' ? saved.adjustments : {})
  });

  // Estado do Chat
  const [rawText, setRawText] = useState<string>(
    typeof saved.rawText === 'string' ? saved.rawText :
    "[14:23:45] * Mike Johnson saca um cigarro do bolso e acende com um isqueiro prata.\n" +
    "> A fumaça densa sobe lentamente enquanto ele observa o movimento da rua.\n" +
    "Mike Johnson diz: A gente não tem muito tempo até eles descobrirem a senha ||4892-OMEGA|| do cofre.\n" +
    "(( Sarah Miller: Me dá 2 minutos que estou terminando de puxar os logs. ))\n" +
    "$ [TRANSAÇÃO] Você transferiu $15.000 para Mike Johnson."
  );

  // Configurações de Tipografia e Estilo (Features 8, 9, 10)
  const [fontSize, setFontSize] = useState<number>(num(saved.fontSize, 20));
  const [fontFamily, setFontFamily] = useState<string>(str(saved.fontFamily, "Arial, Helvetica, sans-serif"));
  const [lineHeightFactor, setLineHeightFactor] = useState<number>(num(saved.lineHeightFactor, 1.55));
  const [strokeEnabled, setStrokeEnabled] = useState<boolean>(bool(saved.strokeEnabled, true));
  const [strokeWidth, setStrokeWidth] = useState<number>(num(saved.strokeWidth, 2));
  const [strokeColor, setStrokeColor] = useState<string>(str(saved.strokeColor, "#000000"));
  const [bgEnabled, setBgEnabled] = useState<boolean>(bool(saved.bgEnabled, true));
  const [bgColor, setBgColor] = useState<string>(str(saved.bgColor, "#000000"));
  const [bgOpacity, setBgOpacity] = useState<number>(num(saved.bgOpacity, 0.65));
  const [maxWidthPercent, setMaxWidthPercent] = useState<number>(num(saved.maxWidthPercent, 85));
  const [shadowEnabled, setShadowEnabled] = useState<boolean>(bool(saved.shadowEnabled, false));
  const [censorStyle, setCensorStyle] = useState<'mosaic' | 'solid'>(saved.censorStyle === 'solid' ? 'solid' : 'mosaic');
  const [showTimestamps, setShowTimestamps] = useState<boolean>(bool(saved.showTimestamps, true));

  // Posicionamento do Chat (Drag & Drop com Pointer Events)
  const [chatPos, setChatPos] = useState<{ x: number; y: number }>({
    x: num(saved.chatPos?.x, 40),
    y: num(saved.chatPos?.y, 50)
  });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Resolução de saída e enquadramento da foto (null = tamanho original da foto)
  const [outputRes, setOutputRes] = useState<{ w: number; h: number } | null>(
    saved.outputRes && num(saved.outputRes.w, 0) >= MIN_RES && num(saved.outputRes.h, 0) >= MIN_RES
      ? { w: Math.min(MAX_RES, saved.outputRes.w), h: Math.min(MAX_RES, saved.outputRes.h) }
      : null
  );
  const [fitMode, setFitMode] = useState<FitMode>(isFitMode(saved.fitMode) ? saved.fitMode : 'cover');
  const [panX, setPanX] = useState<number>(num(saved.panX, 0));
  const [panY, setPanY] = useState<number>(num(saved.panY, 0));
  const [zoom, setZoom] = useState<number>(num(saved.zoom, 100));
  const [customW, setCustomW] = useState<string>(String(outputRes?.w ?? 1920));
  const [customH, setCustomH] = useState<string>(String(outputRes?.h ?? 1080));

  // Personagens
  const [characters, setCharacters] = useState<Character[]>(
    Array.isArray(saved.characters) && saved.characters.every((c: any) => c && typeof c.id === 'string' && typeof c.name === 'string' && typeof c.color === 'string')
      ? saved.characters
      : [
          { id: '1', name: 'Mike Johnson', color: '#38bdf8' },
          { id: '2', name: 'Sarah Miller', color: '#fb7185' }
        ]
  );
  const [newCharName, setNewCharName] = useState<string>('');
  const [activeCharId, setActiveCharId] = useState<string | null>(null);

  // Camadas de imagem (as imagens ficam num mapa; só os metadados vão ao estado)
  const [layers, setLayers] = useState<ImageLayer[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const layerImgs = useRef<Map<string, HTMLImageElement>>(new Map());
  const layerBlobs = useRef<Map<string, Blob>>(new Map());      // blobId -> arquivo original
  const storedBlobIds = useRef<Set<string>>(new Set());          // arquivos já gravados no IndexedDB
  const layersLoaded = useRef(false);                            // evita sobrescrever o salvo antes de carregar
  const layerDragRef = useRef<{ id: string; offX: number; offY: number } | null>(null);
  const layerInputRef = useRef<HTMLInputElement | null>(null);

  // Iluminação: configurações persistidas + modo de posicionar a luz no preview
  const [lighting, setLighting] = useState<Lighting>(() => sanitizeLighting(saved.lighting));
  const [camera, setCamera] = useState<CameraState>(() => sanitizeCamera(saved.camera));
  // Ferramenta do mouse no preview: texto do chat, enquadrar foto, mover camada ou posicionar luz
  const [mouseTool, setMouseTool] = useState<MouseTool>('chat');
  const lightEdit = mouseTool === 'light';
  const photoDragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const lightDragRef = useRef<'main' | 'secondary' | null>(null);
  const patchLighting = (patch: Partial<Lighting>) => setLighting(prev => ({ ...prev, ...patch }));

  // Elementos de RP no mesmo canvas: presets cinemáticos, adesivos e texto (vindos do antigo Canvas Studio)
  const [canvasLayers, setCanvasLayers] = useState<CanvasLayer[]>(() => sanitizeCanvasLayers(saved.canvasLayers));
  const [selectedCanvasLayerId, setSelectedCanvasLayerId] = useState<string | null>(null);
  const canvasDragRef = useRef<{ id: string; state: LayerDragState } | null>(null);

  // Ferramenta de Censura Visual & Anonimização (Regiões de Tarja Preta, Mosaico e Blur)
  const [censorRegions, setCensorRegions] = useState<CensorRegion[]>(() => {
    return Array.isArray(saved.censorRegions) ? sanitizeCensorRegions(saved.censorRegions) : [];
  });
  const [censorType, setCensorType] = useState<CensorType>('solid');
  const [censorShape, setCensorShape] = useState<CensorShape>('brush');
  const [censorScope, setCensorScope] = useState<CensorScope>('final');
  const [censorBrushRadius, setCensorBrushRadius] = useState<number>(20);
  const [censorIntensity, setCensorIntensity] = useState<number>(12);
  const activeCensorIdRef = useRef<string | null>(null);
  const censorRectStartRef = useRef<{ x: number; y: number } | null>(null);

  const newCanvasLayerId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

  const applyPreset = (key: PresetKey) => {
    const preset = (RP_PRESETS as any)[key];
    if (!preset) return;
    const layer: CanvasLayer = {
      id: newCanvasLayerId('preset'), type: 'preset', name: `Preset: ${preset.name}`,
      x: 0, y: 0, width: canvasDims.width, height: canvasDims.height,
      rotation: 0, opacity: 1, visible: true, locked: false,
      presetType: key, presetData: { ...preset.defaultData }
    };
    setCanvasLayers(prev => [...prev, layer]);
    setSelectedCanvasLayerId(layer.id);
    setSelectedLayerId(null);
  };

  const addSticker = (stickerId: string) => {
    const sticker = RP_STICKERS.find(st => st.id === stickerId);
    if (!sticker) return;
    let w = 120;
    let h = 120;
    if (sticker.id === 'crime-tape') { w = 550; h = 45; }
    else if (sticker.id === 'censored-bar') { w = 280; h = 50; }
    else if (sticker.id.startsWith('evidence-marker')) { w = 80; h = 90; }
    const layer: CanvasLayer = {
      id: newCanvasLayerId('sticker'), type: 'sticker', name: `Adesivo: ${sticker.name}`, content: sticker.id,
      x: Math.round(canvasDims.width / 2 - w / 2), y: Math.round(canvasDims.height / 2 - h / 2),
      width: w, height: h, rotation: 0, opacity: 1, visible: true, locked: false
    };
    setCanvasLayers(prev => [...prev, layer]);
    setSelectedCanvasLayerId(layer.id);
    setSelectedLayerId(null);
  };

  const addTextLayer = () => {
    const text = 'DIGITE SEU TEXTO AQUI';
    const layer: CanvasLayer = {
      id: newCanvasLayerId('text'), type: 'text', name: 'Texto Customizado', text, content: text,
      x: Math.round(canvasDims.width / 2 - 150), y: Math.round(canvasDims.height / 2 - 25),
      width: 300, height: 50, rotation: 0, opacity: 1, visible: true, locked: false,
      fontSize: 32, fontFamily: 'Inter, sans-serif', color: '#ffffff', fontWeight: 'bold',
      shadow: { color: 'rgba(0,0,0,0.8)', blur: 6, offsetX: 2, offsetY: 2 }
    };
    setCanvasLayers(prev => [...prev, layer]);
    setSelectedCanvasLayerId(layer.id);
    setSelectedLayerId(null);
  };

  const moveCanvasLayer = (id: string, direction: 'up' | 'down') =>
    setCanvasLayers(prev => {
      const i = prev.findIndex(l => l.id === id);
      const j = direction === 'up' ? i + 1 : i - 1;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const bringCanvasLayerToFront = (id: string) =>
    setCanvasLayers(prev => {
      const l = prev.find(x => x.id === id);
      return l ? [...prev.filter(x => x.id !== id), l] : prev;
    });

  const sendCanvasLayerToBack = (id: string) =>
    setCanvasLayers(prev => {
      const l = prev.find(x => x.id === id);
      return l ? [l, ...prev.filter(x => x.id !== id)] : prev;
    });

  const duplicateCanvasLayer = (id: string) => {
    const src = canvasLayers.find(l => l.id === id);
    if (!src) return;
    const clone: CanvasLayer = {
      ...src, id: newCanvasLayerId(src.type), name: `${src.name} (Cópia)`,
      x: src.x + 20, y: src.y + 20,
      presetData: src.presetData ? { ...src.presetData } : undefined
    };
    setCanvasLayers(prev => [...prev, clone]);
    setSelectedCanvasLayerId(clone.id);
  };

  const deleteCanvasLayer = (id: string) => {
    setCanvasLayers(prev => prev.filter(l => l.id !== id));
    setSelectedCanvasLayerId(cur => (cur === id ? null : cur));
  };

  const updateSelectedCanvasLayer = (updates: Partial<CanvasLayer>) => {
    if (!selectedCanvasLayerId) return;
    setCanvasLayers(prev => prev.map(l => (l.id === selectedCanvasLayerId ? { ...l, ...updates } : l)));
  };

  const updateCanvasPresetField = (field: string, value: any) => {
    if (!selectedCanvasLayerId) return;
    setCanvasLayers(prev => prev.map(l =>
      l.id === selectedCanvasLayerId ? { ...l, presetData: { ...l.presetData, [field]: value } } : l
    ));
  };
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Dimensão final do canvas: resolução escolhida ou tamanho original da foto
  const canvasDims = outputRes ? { width: outputRes.w, height: outputRes.h } : imageDimensions;

  // Troca a resolução mantendo o chat na mesma posição relativa
  const changeResolution = (next: { w: number; h: number } | null) => {
    const nw = next ? next.w : imageDimensions.width;
    const nh = next ? next.h : imageDimensions.height;
    const ratioX = nw / canvasDims.width;
    const ratioY = nh / canvasDims.height;
    setChatPos(p => ({ x: Math.round(p.x * ratioX), y: Math.round(p.y * ratioY) }));
    setCanvasLayers(prev => prev.map(l => l.type === 'preset'
      ? { ...l, width: nw, height: nh }
      : { ...l, x: Math.round(l.x * ratioX), y: Math.round(l.y * ratioY), width: Math.max(1, Math.round(l.width * ratioX)), height: Math.max(1, Math.round(l.height * ratioY)) }));
    setOutputRes(next);
    if (next) { setCustomW(String(next.w)); setCustomH(String(next.h)); }
  };

  const applyCustomResolution = () => {
    const w = Math.round(Number(customW));
    const h = Math.round(Number(customH));
    if (!isFinite(w) || !isFinite(h)) return;
    changeResolution({
      w: Math.min(MAX_RES, Math.max(MIN_RES, w)),
      h: Math.min(MAX_RES, Math.max(MIN_RES, h))
    });
  };

  const resetFraming = () => { setPanX(0); setPanY(0); setZoom(100); };

  /** Deslocamento da foto já limitado ao que cabe no quadro atual. */
  const effectivePan = () => {
    const img = loadedImageRef.current;
    if (!img) return { panX, panY };
    const g = fitGeometry(img.naturalWidth || img.width, img.naturalHeight || img.height, canvasDims.width, canvasDims.height, fitMode, panX, panY, zoom);
    return { panX: g.panX, panY: g.panY };
  };
  // trocar o modo recomeça do enquadramento padrão (o ajuste antigo não faz sentido no modo novo)
  const chooseFitMode = (m: FitMode) => { if (m !== fitMode) { setFitMode(m); setPanX(0); setPanY(0); setZoom(100); } };

  // Refs de Canvas e Imagem
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const loadedImageRef = useRef<HTMLImageElement | null>(null);
  const currentBlobUrlRef = useRef<string | null>(null);

  // Define a foto de fundo a partir de um arquivo (libera a URL da foto anterior)
  const setBackgroundFromBlob = (blob: Blob, id: string, onLoaded?: () => void) => {
    if (currentBlobUrlRef.current) {
      URL.revokeObjectURL(currentBlobUrlRef.current);
      currentBlobUrlRef.current = null;
    }
    const objectUrl = URL.createObjectURL(blob);
    currentBlobUrlRef.current = objectUrl;

    const img = new Image();
    img.onload = () => {
      if (currentBlobUrlRef.current !== objectUrl) return; // chegou outra foto depois
      loadedImageRef.current = img;
      setImageDimensions({ width: img.naturalWidth || 1280, height: img.naturalHeight || 720 });
      setImageSrc(objectUrl);
      setBgId(id);
      onLoaded?.();
    };
    img.onerror = () => {
      if (currentBlobUrlRef.current === objectUrl) {
        URL.revokeObjectURL(objectUrl);
        currentBlobUrlRef.current = null;
      }
    };
    img.src = objectUrl;
  };

  // Define a foto de fundo com uma imagem já decodificada (abrir projeto): tudo no mesmo instante
  const setBackgroundDecoded = (blob: Blob, id: string, img: HTMLImageElement) => {
    if (currentBlobUrlRef.current) URL.revokeObjectURL(currentBlobUrlRef.current);
    const objectUrl = URL.createObjectURL(blob);
    currentBlobUrlRef.current = objectUrl;
    loadedImageRef.current = img;
    setImageDimensions({ width: img.naturalWidth || 1280, height: img.naturalHeight || 720 });
    setImageSrc(objectUrl);
    setBgId(id);
  };

  const handleImageUpload = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const isGifFile = file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif');
    setIsGif(isGifFile);
    if (!isGifFile) {
      setGifMeta(null);
      gifFramesRef.current.forEach(f => {
        if ('close' in f.image && typeof (f.image as any).close === 'function') (f.image as any).close();
      });
      gifFramesRef.current = [];
      setGifFrames([]);
    }
    const id = `BG${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    bgBlobs.current.set(id, file);
    bgNames.current.set(id, file.name || 'fundo');
    setBackgroundFromBlob(file, id);
    if (isGifFile) {
      processGifBlob(file);
    }
  };

  const clearBackground = () => {
    if (gifAbortControllerRef.current) {
      gifAbortControllerRef.current.abort();
    }
    if (currentBlobUrlRef.current) {
      URL.revokeObjectURL(currentBlobUrlRef.current);
      currentBlobUrlRef.current = null;
    }
    gifFramesRef.current.forEach(f => {
      if ('close' in f.image && typeof (f.image as any).close === 'function') (f.image as any).close();
    });
    gifFramesRef.current = [];
    setGifFrames([]);
    currentFrameIdxRef.current = 0;
    loadedImageRef.current = null;
    setImageSrc(null);
    setBgId(null);
    setIsGif(false);
    setGifMeta(null);
    setImageDimensions({ width: 1280, height: 720 });
  };

  // Limpeza de recursos ao desmontar componente
  useEffect(() => {
    return () => {
      if (gifAbortControllerRef.current) {
        gifAbortControllerRef.current.abort();
      }
      if (currentBlobUrlRef.current) {
        URL.revokeObjectURL(currentBlobUrlRef.current);
        currentBlobUrlRef.current = null;
      }
      gifFramesRef.current.forEach(f => {
        if ('close' in f.image && typeof (f.image as any).close === 'function') (f.image as any).close();
      });
      gifFramesRef.current = [];
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

  /** Detecção de personagens do Modo Simples (automática para nomes inequívocos, revisão para os ambíguos). */
  const detection = useCharacterDetection(characters, setCharacters);

  const removeCharacter = (id: string) => {
    setCharacters(characters.filter(c => c.id !== id));
    if (activeCharId === id) setActiveCharId(null);
  };

  // Insere texto na posição do cursor do editor (substitui a seleção).
  // Prefixos de linha ganham uma quebra antes se o cursor estiver no meio de uma linha.
  const insertAtCursor = (text: string, startOfLine: boolean = true) => {
    const ta = textareaRef.current;
    const s = ta ? ta.selectionStart : rawText.length;
    const e = ta ? ta.selectionEnd : rawText.length;
    const ins = startOfLine && s > 0 && rawText[s - 1] !== '\n' ? '\n' + text : text;
    setRawText(rawText.slice(0, s) + ins + rawText.slice(e));
    const caret = s + ins.length;
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  };

  // Personagem ativo: o selecionado, ou o primeiro da lista
  const activeChar = characters.find(c => c.id === activeCharId) ?? characters[0];

  // Fala do personagem ativo com o tom escolhido (normal, sussurrando, gritando, baixo...)
  const insertSpeech = (tone: string, charName?: string) => {
    const name = charName ?? activeChar?.name ?? 'Personagem';
    insertAtCursor(`${name} diz (${tone}): `);
  };

  const insertCharSpeech = (charName: string) => {
    const c = characters.find(ch => ch.name === charName);
    if (c) setActiveCharId(c.id);
    insertSpeech('normal', charName);
  };


  // ---- Camadas de imagem (logos, molduras, marcas d'água) ----
  const layerRect = (l: ImageLayer, img: HTMLImageElement, W: number, H: number) => {
    const iw = img.naturalWidth || img.width || 1;
    const ih = img.naturalHeight || img.height || 1;
    const w = (l.widthPct / 100) * W;
    return { cx: l.cx * W, cy: l.cy * H, w, h: (w * ih) / iw };
  };

  const drawLayers = (ctx: CanvasRenderingContext2D, W: number, H: number, above: boolean) => {
    for (const l of layers) {
      if (!!l.aboveChat !== above || !l.visible) continue;
      const img = layerImgs.current.get(l.id);
      if (!img) continue;
      const r = layerRect(l, img, W, H);
      ctx.save();
      ctx.globalAlpha = Math.min(1, Math.max(0, l.opacity));
      ctx.translate(r.cx, r.cy);
      ctx.rotate((l.rotation * Math.PI) / 180);
      ctx.drawImage(img, -r.w / 2, -r.h / 2, r.w, r.h);
      ctx.restore();
    }
  };

  // Camada mais ao topo sob o ponteiro (considera rotação)
  const hitTestLayer = (px: number, py: number, W: number, H: number): ImageLayer | null => {
    for (let i = layers.length - 1; i >= 0; i--) {
      const l = layers[i];
      const img = layerImgs.current.get(l.id);
      if (!img || !l.visible) continue;
      const r = layerRect(l, img, W, H);
      const a = (-l.rotation * Math.PI) / 180;
      const dx = px - r.cx;
      const dy = py - r.cy;
      const lx = dx * Math.cos(a) - dy * Math.sin(a);
      const ly = dx * Math.sin(a) + dy * Math.cos(a);
      if (Math.abs(lx) <= r.w / 2 && Math.abs(ly) <= r.h / 2) return l;
    }
    return null;
  };

  const MAX_LAYERS = 20;

  const addLayerFiles = (list: FileList | File[]) => {
    const files = Array.from(list).filter(f => f.type.startsWith('image/'));
    files.forEach(file => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const id = `L${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
        const blobId = `B${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
        layerImgs.current.set(id, img);
        layerBlobs.current.set(blobId, file);
        setLayers(prev => prev.length >= MAX_LAYERS ? prev : [
          ...prev,
          {
            id, blobId, name: file.name, cx: 0.5, cy: 0.5, widthPct: 30, rotation: 0,
            opacity: 1, aboveChat: false, visible: true
          }
        ]);
        setSelectedLayerId(id);
      };
      img.onerror = () => URL.revokeObjectURL(url);
      img.src = url;
    });
  };

  const updateLayer = (id: string, patch: Partial<ImageLayer>) =>
    setLayers(prev => prev.map(l => (l.id === id ? { ...l, ...patch } : l)));

  const removeLayer = (id: string) => {
    setLayers(prev => prev.filter(l => l.id !== id));
    // a imagem fica no mapa enquanto houver cópia (duplicatas compartilham o mesmo elemento)
    setSelectedLayerId(cur => (cur === id ? null : cur));
  };

  const duplicateLayer = (id: string) => {
    setLayers(prev => {
      if (prev.length >= MAX_LAYERS) return prev;
      const i = prev.findIndex(l => l.id === id);
      const src = prev[i];
      const img = layerImgs.current.get(id);
      if (!src || !img) return prev;
      const nid = `L${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      layerImgs.current.set(nid, img);
      setSelectedLayerId(nid);
      const copy = { ...src, id: nid, name: `${src.name} (cópia)`, cx: Math.min(1, src.cx + 0.03), cy: Math.min(1, src.cy + 0.03) };
      return [...prev.slice(0, i + 1), copy, ...prev.slice(i + 1)];
    });
  };

  const moveLayerOrder = (id: string, dir: -1 | 1) =>
    setLayers(prev => {
      const i = prev.findIndex(l => l.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  // Renderizar a Cena Completa no Canvas (Engine Multiline + Stroke + Mosaico)
  const drawScene = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    scale: number = 1,
    bg?: CanvasImageSource | null
  ) => {
    ctx.clearRect(0, 0, width, height);

    // 1. Desenhar Fundo (bg explícito é usado pelo modo Lote ou pelo quadro atual do GIF)
    const currentGifFrame = (isGif && gifFramesRef.current.length > 0)
      ? gifFramesRef.current[currentFrameIdxRef.current]?.image
      : null;
    const bgImage = bg === undefined ? (currentGifFrame || loadedImageRef.current) : bg;
    if (bgImage) {
      drawFittedImage(ctx, bgImage, width, height, fitMode, panX, panY, zoom);
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

    // 2.1 Efeitos de filme (P&B, vintage, vinheta, granulado...)
    applyFilmEffects(ctx, width, height, camera.effects);

    // 3. Escurecimento da Cena
    if (darkening > 0) {
      ctx.fillStyle = `rgba(0, 0, 0, ${darkening})`;
      ctx.fillRect(0, 0, width, height);
    }

    // 3.01 Censura na foto de fundo original (apenas para regiões configuradas com scope: 'background')
    drawAllCensorRegions(ctx, width, height, censorRegions, 'background', scale);

    // 3.0 Iluminação colorida sobre a cena (antes das camadas e do texto)
    drawPhotographicLight(ctx, width, height, lighting);

    // 3.05 HUD da câmera (Bodycam, CCTV, Noite Fria)
    drawCameraOverlay(ctx, width, height, camera, activeChar?.name ?? '');

    // 3.1 Camadas de imagem abaixo do chat
    drawLayers(ctx, width, height, false);
    canvasLayers.filter(l => l.aboveChat === false).forEach(l => drawCanvasLayer(ctx, l, width, height, scale));

    // 4. Texto do chat (renderizador compartilhado com o GIF Lab)
    renderChatText(ctx, width, height, scale, {
      rawText, characters, fontSize, fontFamily, lineHeightFactor, strokeEnabled, strokeWidth,
      strokeColor, bgEnabled, bgColor, bgOpacity, maxWidthPercent, shadowEnabled, censorStyle,
      showTimestamps, chatPos
    });

    // 5. Camadas de imagem acima do chat
    drawLayers(ctx, width, height, true);

    // 6. Elementos de RP (presets, adesivos, texto) por cima de tudo
    canvasLayers.filter(l => l.aboveChat !== false).forEach(l => drawCanvasLayer(ctx, l, width, height, scale));

    // 7. Censura da composição final (Top-Level) — cobre chatlogs, stickers e elementos sobrepostos
    drawAllCensorRegions(ctx, width, height, censorRegions, 'final', scale);
  };

  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    canvas.width = canvasDims.width;
    canvas.height = canvasDims.height;
    const currentBg = (isGif && gifFramesRef.current.length > 0)
      ? gifFramesRef.current[currentFrameIdxRef.current]?.image
      : loadedImageRef.current;
    drawScene(ctx, canvasDims.width, canvasDims.height, 1, currentBg);

    // Retículos da luz enquanto o modo "posicionar luz" está ativo
    if (lightEdit && lighting.enabled) {
      const k = Math.max(1, canvas.width / 1000);
      drawLightGizmo(ctx, (lighting.x / 100) * canvas.width, (lighting.y / 100) * canvas.height, lighting.color, 'Luz principal', k);
      if (lighting.sourceType === 'duotone') {
        drawLightGizmo(ctx, (lighting.secondaryX / 100) * canvas.width, (lighting.secondaryY / 100) * canvas.height, lighting.secondaryColor, 'Luz de recorte', k);
      }
    }

    // Alças da camada de RP selecionada (só no preview)
    const selCL = canvasLayers.find(l => l.id === selectedCanvasLayerId);
    if (selCL) drawLayerHandles(ctx, selCL);

    // Contorno tracejado da camada selecionada (só no preview, nunca no export)
    const sel = layers.find(l => l.id === selectedLayerId);
    const selImg = sel ? layerImgs.current.get(sel.id) : undefined;
    if (sel && selImg) {
      const r = layerRect(sel, selImg, canvas.width, canvas.height);
      ctx.save();
      ctx.translate(r.cx, r.cy);
      ctx.rotate((sel.rotation * Math.PI) / 180);
      ctx.strokeStyle = '#34d399';
      ctx.lineWidth = Math.max(2, canvas.width / 600);
      ctx.setLineDash([10, 6]);
      ctx.strokeRect(-r.w / 2, -r.h / 2, r.w, r.h);
      ctx.restore();
    }
  }, [
    layers, selectedLayerId, lightEdit, activeCharId, selectedCanvasLayerId, fontsVersion,
    imageSrc, imageDimensions, outputRes, fitMode, panX, panY, zoom, lighting, camera, canvasLayers, darkening, adjustments, rawText, fontSize, fontFamily,
    lineHeightFactor, strokeEnabled, strokeWidth, strokeColor,
    bgEnabled, bgColor, bgOpacity, maxWidthPercent, shadowEnabled,
    censorStyle, showTimestamps, chatPos, characters, canvasDims.width, canvasDims.height,
    isGif, gifFrames, censorRegions
  ]);

  // Outros módulos (GIF Lab) podem editar o texto do chat: este componente é o dono do estado
  useEffect(() => subscribeChatTextRequests(text => setRawText(text.slice(0, 200_000))), []);
  // ...e o estilo (fonte, tamanho, contorno, fundo) ajustado no GIF Lab
  useEffect(() => subscribeChatStyleRequests(p => {
    if (p.fontSize !== undefined) setFontSize(Math.min(48, Math.max(12, Math.round(p.fontSize))));
    if (p.fontFamily !== undefined) setFontFamily(p.fontFamily);
    if (p.lineHeightFactor !== undefined) setLineHeightFactor(Math.min(2.2, Math.max(1.1, p.lineHeightFactor)));
    if (p.strokeEnabled !== undefined) setStrokeEnabled(p.strokeEnabled);
    if (p.strokeWidth !== undefined) setStrokeWidth(Math.min(6, Math.max(1, p.strokeWidth)));
    if (p.bgEnabled !== undefined) setBgEnabled(p.bgEnabled);
    if (p.bgOpacity !== undefined) setBgOpacity(Math.min(1, Math.max(0, p.bgOpacity)));
  }), []);

  // Recebe imagem de fundo enviada de outros módulos (ex.: GIF cortado no GIF Lab)
  useEffect(() => {
    return subscribeBackgroundRequests(({ blob, name, isGif: reqIsGif, gifMeta: reqMeta }) => {
      const isGifType = reqIsGif ?? (blob.type === 'image/gif' || name.toLowerCase().endsWith('.gif'));
      setIsGif(isGifType);
      setIsGifPlaying(true);
      if (reqMeta) {
        setGifMeta(reqMeta);
      }
      const file = new File([blob], name, { type: blob.type || 'image/gif' });
      handleImageUpload(file);
      if (isGifType) {
        processGifBlob(blob);
      }
    });
  }, []);

  // Loop de animação contínua no canvas quando um GIF animado está no fundo
  useEffect(() => {
    if (!isGif || !isGifPlaying) return;
    let animId: number;
    let lastFrameTime = performance.now();

    const loop = (now: number) => {
      const frames = gifFramesRef.current;
      if (frames.length > 0) {
        const curIdx = currentFrameIdxRef.current;
        const curFrame = frames[curIdx] || frames[0];
        const duration = curFrame?.durationMs || (1000 / (gifMeta?.fps || 12));

        if (now - lastFrameTime >= duration) {
          lastFrameTime = now;
          const nextIdx = (curIdx + 1) % frames.length;
          currentFrameIdxRef.current = nextIdx;

          const canvas = previewCanvasRef.current;
          if (canvas) {
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (ctx) {
              drawScene(ctx, canvasDims.width, canvasDims.height, 1, frames[nextIdx].image);
              if (lightEdit && lighting.enabled) {
                const k = Math.max(1, canvas.width / 1000);
                drawLightGizmo(ctx, (lighting.x / 100) * canvas.width, (lighting.y / 100) * canvas.height, lighting.color, 'Luz principal', k);
              }
            }
          }
        }
      } else {
        // Fallback enquanto os frames decodificam ou em navegadores sem ImageDecoder
        const canvas = previewCanvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (ctx) {
            drawScene(ctx, canvasDims.width, canvasDims.height, 1);
            if (lightEdit && lighting.enabled) {
              const k = Math.max(1, canvas.width / 1000);
              drawLightGizmo(ctx, (lighting.x / 100) * canvas.width, (lighting.y / 100) * canvas.height, lighting.color, 'Luz principal', k);
            }
          }
        }
      }
      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [
    isGif, isGifPlaying, gifMeta, gifFrames,
    layers, selectedLayerId, lightEdit, activeCharId, selectedCanvasLayerId, fontsVersion,
    imageSrc, imageDimensions, outputRes, fitMode, panX, panY, zoom, lighting, camera, canvasLayers, darkening, adjustments, rawText, fontSize, fontFamily,
    lineHeightFactor, strokeEnabled, strokeWidth, strokeColor,
    bgEnabled, bgColor, bgOpacity, maxWidthPercent, shadowEnabled,
    censorStyle, showTimestamps, chatPos, characters, canvasDims.width, canvasDims.height
  ]);

  // Publica o chat atual (texto + estilo) para outros módulos, como o GIF Lab
  useEffect(() => {
    publishChat({
      style: {
        rawText, characters, fontSize, fontFamily, lineHeightFactor, strokeEnabled, strokeWidth,
        strokeColor, bgEnabled, bgColor, bgOpacity, maxWidthPercent, shadowEnabled, censorStyle,
        showTimestamps, chatPos
      },
      refWidth: canvasDims.width,
      refHeight: canvasDims.height
    });
  }, [
    rawText, characters, fontSize, fontFamily, lineHeightFactor, strokeEnabled, strokeWidth,
    strokeColor, bgEnabled, bgColor, bgOpacity, maxWidthPercent, shadowEnabled, censorStyle,
    showTimestamps, chatPos, canvasDims.width, canvasDims.height
  ]);

  // Salva configurações (sem a imagem) com debounce de 400ms
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          darkening, adjustments, rawText, fontSize, fontFamily, lineHeightFactor,
          strokeEnabled, strokeWidth, strokeColor, bgEnabled, bgColor, bgOpacity,
          maxWidthPercent, shadowEnabled, censorStyle, showTimestamps, chatPos, characters,
          outputRes, fitMode, panX, panY, zoom, lighting, camera, canvasLayers,
          censorRegions
        }));
      } catch (_) { /* storage bloqueado ou cheio: segue sem persistir */ }
    }, 400);
    return () => clearTimeout(t);
  }, [
    darkening, adjustments, rawText, fontSize, fontFamily, lineHeightFactor,
    strokeEnabled, strokeWidth, strokeColor, bgEnabled, bgColor, bgOpacity,
    maxWidthPercent, shadowEnabled, censorStyle, showTimestamps, chatPos, characters,
    outputRes, fitMode, panX, panY, zoom, lighting, camera, canvasLayers,
    censorRegions
  ]);

  // ---- Projeto (.haze): salva e reabre a cena inteira, sem rasterizar nada ----
  const exportProject = async () => {
    try {
      const { layers: imgLayers, bgId: currentBg, ...scene } = snapshotRef.current;
      const assets = new Map<string, ProjectAsset>();
      let background: { assetId: string; name: string } | null = null;

      const bgBlob = currentBg ? bgBlobs.current.get(currentBg) : undefined;
      if (currentBg && bgBlob) {
        const name = bgNames.current.get(currentBg) ?? 'fundo';
        assets.set(currentBg, { id: currentBg, name, mime: bgBlob.type, blob: bgBlob });
        background = { assetId: currentBg, name };
      }
      for (const l of imgLayers) {
        const blob = layerBlobs.current.get(l.blobId);
        if (blob && !assets.has(l.blobId)) assets.set(l.blobId, { id: l.blobId, name: l.name, mime: blob.type, blob });
      }

      const out = await buildProjectBlob({
        scene: scene as unknown as ProjectScene,
        background,
        imageLayers: imgLayers.filter(l => assets.has(l.blobId)),
        assets
      });
      const url = URL.createObjectURL(out);
      const link = document.createElement('a');
      const d = new Date();
      const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
      link.download = `haze-projeto-${stamp}${PROJECT_EXTENSION}`;
      link.href = url;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      showNotice('Projeto salvo! Abra-o depois em "Abrir projeto".');
    } catch (err) {
      showNotice('Não foi possível salvar o projeto.', 'error');
    }
  };

  const importProject = async (file: File) => {
    try {
      // 1) lê e valida tudo ANTES de mexer na sessão atual
      const data = await parseProjectFile(file);
      const decoded = new Map<string, HTMLImageElement>();
      for (const asset of data.assets.values()) {
        decoded.set(asset.id, await loadImageFromFile(asset.blob as File).catch(() => {
          throw new ProjectError(`A imagem "${asset.name}" do projeto está corrompida.`);
        }));
      }
      if (!window.confirm('Abrir este projeto substitui o que está no editor agora. Continuar?')) return;

      // 2) aplica
      layerBlobs.current.clear();
      layerImgs.current.clear();
      storedBlobIds.current.clear();
      data.imageLayers.forEach(l => {
        const asset = data.assets.get(l.blobId)!;
        layerBlobs.current.set(l.blobId, asset.blob);
        layerImgs.current.set(l.id, decoded.get(l.blobId)!);
      });
      if (data.background) {
        const a = data.assets.get(data.background.assetId)!;
        bgBlobs.current.set(a.id, a.blob);
        bgNames.current.set(a.id, data.background.name);
      }
      setLayers([]);
      applySnapshot(JSON.stringify({
        ...data.scene,
        layers: data.imageLayers,
        bgId: data.background ? data.background.assetId : null
      }), { skipBackground: true });
      if (data.background) {
        const a = data.assets.get(data.background.assetId)!;
        setBackgroundDecoded(a.blob, a.id, decoded.get(a.id)!);
      } else {
        clearBackground();
      }
      setSelectedLayerId(null);
      setSelectedCanvasLayerId(null);
      resetHistory();
      if (data.warnings.length) {
        showNotice(`Projeto aberto com avisos: ${data.warnings.join('; ')}.`, 'error');
      } else {
        showNotice('Projeto aberto!');
      }
    } catch (err) {
      showNotice(err instanceof ProjectError ? err.message : 'Não foi possível abrir o projeto.', 'error');
    }
  };

  const clearSavedData = async () => {
    if (!window.confirm('Apagar as configurações e camadas salvas e restaurar o padrão?')) return;
    try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
    await clearLayersDb();
    window.location.reload();
  };

  // ---- Modo Lote (ZIP) ----
  const addBatchFiles = (list: FileList | File[]) => {
    const imgs = Array.from(list).filter(f => f.type.startsWith('image/'));
    if (imgs.length === 0) return;
    setBatchError(null);
    setBatchFiles(prev => [...prev, ...imgs]);
  };

  const loadImageFromFile = (file: File) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(file.name)); };
      img.src = url;
    });

  const canvasToBlob = (canvas: HTMLCanvasElement) =>
    new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error('toBlob falhou'))), 'image/png')
    );

  // Aplica as configurações atuais a cada foto. Posição e tamanho do texto
  // são proporcionais à largura do preview atual.
  const generateBatchZip = async () => {
    if (batchFiles.length === 0 || batchProgress) return;
    setBatchError(null);
    setBatchProgress({ done: 0, total: batchFiles.length });
    const failed: string[] = [];
    try {
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      const refW = canvasDims.width || 1280;
      const used = new Set<string>();

      for (let i = 0; i < batchFiles.length; i++) {
        const file = batchFiles[i];
        try {
          const img = await loadImageFromFile(file);
          const w = outputRes ? outputRes.w : (img.naturalWidth || 1280);
          const h = outputRes ? outputRes.h : (img.naturalHeight || 720);
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (!ctx) throw new Error('sem contexto 2D');
          drawScene(ctx, w, h, w / refW, img);
          const blob = await canvasToBlob(canvas);

          const base = file.name.replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '_') || 'foto';
          let name = `${base}_chatlog.png`;
          for (let n = 2; used.has(name); n++) name = `${base}_chatlog_${n}.png`;
          used.add(name);
          zip.file(name, blob);
          canvas.width = 0; canvas.height = 0; // libera memória
        } catch (_) {
          failed.push(file.name);
        }
        setBatchProgress({ done: i + 1, total: batchFiles.length });
        await new Promise(r => setTimeout(r, 0)); // deixa a UI respirar
      }

      if (used.size === 0) throw new Error('Nenhuma imagem pôde ser processada.');
      const out = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(out);
      const link = document.createElement('a');
      link.download = `haze-chatlog-lote-${Date.now()}.zip`;
      link.href = url;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      if (failed.length) setBatchError(`${failed.length} arquivo(s) falharam: ${failed.join(', ')}`);
    } catch (err) {
      setBatchError(err instanceof Error ? err.message : 'Erro ao gerar o ZIP.');
    } finally {
      setBatchProgress(null);
    }
  };

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

    // Ferramenta "Censura": inicia traço de pincel ou retângulo
    if (mouseTool === 'censor') {
      const id = `censor-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      activeCensorIdRef.current = id;
      setIsDragging(true);

      if (censorShape === 'brush') {
        const newRegion = createBrushCensorRegion(
          id, censorType, censorScope, pointerX, pointerY, censorBrushRadius, censorIntensity
        );
        setCensorRegions(prev => [...prev, newRegion]);
      } else {
        censorRectStartRef.current = { x: pointerX, y: pointerY };
        const newRegion: CensorRegion = {
          id,
          type: censorType,
          shape: 'rect',
          scope: censorScope,
          x: pointerX,
          y: pointerY,
          width: 0,
          height: 0,
          intensity: censorIntensity
        };
        setCensorRegions(prev => [...prev, newRegion]);
      }
      return;
    }

    // Modo "posicionar luz": arrasta a luz principal (ou a de recorte, se estiver mais perto)
    if (mouseTool === 'light') {
      if (!lighting.enabled) return;
      const W = canvas.width;
      const H = canvas.height;
      let which: 'main' | 'secondary' = 'main';
      if (lighting.sourceType === 'duotone') {
        const dMain = Math.hypot(pointerX - (lighting.x / 100) * W, pointerY - (lighting.y / 100) * H);
        const dSec = Math.hypot(pointerX - (lighting.secondaryX / 100) * W, pointerY - (lighting.secondaryY / 100) * H);
        if (dSec < dMain) which = 'secondary';
      }
      lightDragRef.current = which;
      layerDragRef.current = null;
      setIsDragging(true);
      patchLighting(which === 'main'
        ? { x: Math.max(0, Math.min(100, (pointerX / W) * 100)), y: Math.max(0, Math.min(100, (pointerY / H) * 100)) }
        : { secondaryX: Math.max(0, Math.min(100, (pointerX / W) * 100)), secondaryY: Math.max(0, Math.min(100, (pointerY / H) * 100)) });
      return;
    }

    // Ferramenta "Enquadrar foto": arrastar desloca a foto dentro da resolução (pan)
    if (mouseTool === 'photo') {
      const eff = effectivePan(); // parte do deslocamento que realmente aparece (sem "folga" invisível)
      photoDragRef.current = { x: pointerX, y: pointerY, panX: eff.panX, panY: eff.panY };
      layerDragRef.current = null;
      lightDragRef.current = null;
      setIsDragging(true);
      return;
    }

    // Elementos (adesivos, presets, texto, imagens): na ferramenta "Mover camada" clique seleciona e arrasta
    // (clique no vazio deseleciona). Na ferramenta "Texto chat" (padrão) também: clicar num elemento o move,
    // clicar fora dele arrasta o chat, e Alt força arrastar o chat por cima de um elemento.
    if (mouseTool === 'layer' || (mouseTool === 'chat' && !e.altKey)) {
      // a) alças (redimensionar/girar) do elemento de RP selecionado
      const selRP = canvasLayers.find(l => l.id === selectedCanvasLayerId);
      if (selRP) {
        const mode = hitTestHandles(selRP, pointerX, pointerY);
        if (mode && mode !== 'move') {
          canvasDragRef.current = { id: selRP.id, state: startHandleDrag(selRP, mode, pointerX, pointerY) };
          layerDragRef.current = null;
          setIsDragging(true);
          return;
        }
      }
      // b) corpo de um elemento de RP (do topo para baixo)
      for (let i = canvasLayers.length - 1; i >= 0; i--) {
        const l = canvasLayers[i];
        if (hitTestLayerBody(l, pointerX, pointerY)) {
          setSelectedCanvasLayerId(l.id);
          setSelectedLayerId(null);
          canvasDragRef.current = {
            id: l.id,
            state: { ...EMPTY_DRAG, mode: 'move', startX: pointerX, startY: pointerY, layerStartX: l.x, layerStartY: l.y, layerStartW: l.width, layerStartH: l.height, layerStartRot: l.rotation || 0 }
          };
          layerDragRef.current = null;
          setIsDragging(true);
          return;
        }
      }
      canvasDragRef.current = null;
      // c) camadas de imagem
      const hit = hitTestLayer(pointerX, pointerY, canvas.width, canvas.height);
      if (hit) {
        setSelectedLayerId(hit.id);
        setSelectedCanvasLayerId(null);
        layerDragRef.current = {
          id: hit.id,
          offX: pointerX - hit.cx * canvas.width,
          offY: pointerY - hit.cy * canvas.height
        };
        setIsDragging(true);
        return;
      }
      setSelectedLayerId(null);
      setSelectedCanvasLayerId(null);
      if (mouseTool === 'layer') return;
      // ferramenta "Texto chat": clique fora de qualquer elemento segue para o arrasto do chat
    }

    // Ferramenta "Texto chat" (padrão): arrasta o bloco de texto
    layerDragRef.current = null;
    lightDragRef.current = null;
    photoDragRef.current = null;
    canvasDragRef.current = null;
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

    if (mouseTool === 'censor' && activeCensorIdRef.current) {
      const activeId = activeCensorIdRef.current;
      if (censorShape === 'brush') {
        setCensorRegions(prev => prev.map(reg => {
          if (reg.id !== activeId) return reg;
          return appendPointToBrushRegion(reg, pointerX, pointerY, 3);
        }));
      } else if (censorShape === 'rect' && censorRectStartRef.current) {
        const start = censorRectStartRef.current;
        const rx = Math.min(start.x, pointerX);
        const ry = Math.min(start.y, pointerY);
        const rw = Math.abs(pointerX - start.x);
        const rh = Math.abs(pointerY - start.y);
        setCensorRegions(prev => prev.map(reg => {
          if (reg.id !== activeId) return reg;
          return { ...reg, x: rx, y: ry, width: rw, height: rh };
        }));
      }
      return;
    }

    const cd = canvasDragRef.current;
    if (cd) {
      const target = canvasLayers.find(l => l.id === cd.id);
      if (target && !target.locked) {
        const changes = applyLayerDrag(target, cd.state, pointerX, pointerY, e.shiftKey);
        if (changes) setCanvasLayers(prev => prev.map(l => (l.id === cd.id ? { ...l, ...changes } : l)));
      }
      return;
    }

    const pd = photoDragRef.current;
    if (pd) {
      const img = loadedImageRef.current;
      const nx = pd.panX + ((pointerX - pd.x) / canvas.width) * 100;
      const ny = pd.panY + ((pointerY - pd.y) / canvas.height) * 100;
      if (img) {
        const g = fitGeometry(img.naturalWidth || img.width, img.naturalHeight || img.height, canvas.width, canvas.height, fitMode, nx, ny, zoom);
        setPanX(Math.round(g.panX * 10) / 10); setPanY(Math.round(g.panY * 10) / 10);
      } else {
        setPanX(Math.round(Math.max(-100, Math.min(100, nx)))); setPanY(Math.round(Math.max(-100, Math.min(100, ny))));
      }
      return;
    }

    if (lightDragRef.current) {
      const px = Math.max(0, Math.min(100, (pointerX / canvas.width) * 100));
      const py = Math.max(0, Math.min(100, (pointerY / canvas.height) * 100));
      patchLighting(lightDragRef.current === 'main' ? { x: px, y: py } : { secondaryX: px, secondaryY: py });
      return;
    }

    const ld = layerDragRef.current;
    if (ld) {
      updateLayer(ld.id, {
        cx: Math.max(0, Math.min(1, (pointerX - ld.offX) / canvas.width)),
        cy: Math.max(0, Math.min(1, (pointerY - ld.offY) / canvas.height))
      });
      return;
    }

    setChatPos({
      x: Math.max(0, Math.min(canvas.width - 100, pointerX - dragOffset.x)),
      y: Math.max(0, Math.min(canvas.height - 50, pointerY - dragOffset.y))
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDragging) return;
    if (mouseTool === 'censor') {
      if (censorShape === 'rect' && activeCensorIdRef.current) {
        const id = activeCensorIdRef.current;
        setCensorRegions(prev => prev.filter(r => (r.id === id ? r.width >= 4 && r.height >= 4 : true)));
      }
      activeCensorIdRef.current = null;
      censorRectStartRef.current = null;
      setIsDragging(false);
      if (previewCanvasRef.current?.hasPointerCapture(e.pointerId)) {
        try { previewCanvasRef.current.releasePointerCapture(e.pointerId); } catch (_) {}
      }
      return;
    }
    layerDragRef.current = null;
    lightDragRef.current = null;
    photoDragRef.current = null;
    canvasDragRef.current = null;
    setIsDragging(false);
    if (previewCanvasRef.current?.hasPointerCapture(e.pointerId)) {
      try {
        previewCanvasRef.current.releasePointerCapture(e.pointerId);
      } catch (_) {}
    }
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDragging) return;
    activeCensorIdRef.current = null;
    censorRectStartRef.current = null;
    layerDragRef.current = null;
    lightDragRef.current = null;
    photoDragRef.current = null;
    canvasDragRef.current = null;
    setIsDragging(false);
    if (previewCanvasRef.current?.hasPointerCapture(e.pointerId)) {
      try {
        previewCanvasRef.current.releasePointerCapture(e.pointerId);
      } catch (_) {}
    }
  };

  // Exportação Segura 2x com Canvas toBlob
  // Renderiza a cena final em 2× e devolve o PNG (usado por Exportar e Copiar)
  const renderExportBlob = (): Promise<Blob> =>
    new Promise((resolve, reject) => {
      const exportCanvas = document.createElement('canvas');
      const scale = 2;
      exportCanvas.width = canvasDims.width * scale;
      exportCanvas.height = canvasDims.height * scale;

      const ctx = exportCanvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas indisponível')); return; }

      drawScene(ctx, exportCanvas.width, exportCanvas.height, scale);
      exportCanvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Falha ao gerar a imagem'))),
        'image/png'
      );
    });

  const exportImage = async () => {
    try {
      const blob = await renderExportBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = `haze-chatlog-${Date.now()}.png`;
      link.href = url;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Não foi possível exportar.', 'error');
    }
  };

  // Só o chat: PNG transparente no tamanho da cena (2×), para levar ao Photopea e outros editores.
  // Mantém o tamanho da cena de propósito: ao colocar sobre a foto original, o texto cai exatamente onde está no preview.
  const exportChatOnly = async () => {
    try {
      const scale = 2;
      const cv = document.createElement('canvas');
      cv.width = canvasDims.width * scale;
      cv.height = canvasDims.height * scale;
      const ctx = cv.getContext('2d');
      if (!ctx) throw new Error('Canvas indisponível');
      renderChatText(ctx, cv.width, cv.height, scale, {
        rawText, characters, fontSize, fontFamily, lineHeightFactor, strokeEnabled, strokeWidth,
        strokeColor, bgEnabled, bgColor, bgOpacity, maxWidthPercent, shadowEnabled, censorStyle,
        showTimestamps, chatPos
      });
      const blob: Blob = await new Promise((res, rej) => cv.toBlob(b => (b ? res(b) : rej(new Error('Falha ao gerar a imagem'))), 'image/png'));
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = `haze-chat-transparente-${Date.now()}.png`;
      link.href = url;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      showNotice('Chat exportado com fundo transparente.');
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Não foi possível exportar o chat.', 'error');
    }
  };

  // Exportação de GIF animado completo editado no Editor RP
  const exportGifFromChatLog = async () => {
    if (isExportingGif) return;
    setIsExportingGif(true);
    setGifExportProgress(0);

    let worker: Worker | null = null;
    let urlToRevoke: string | null = null;

    try {
      const frames = gifFramesRef.current;
      const fps = gifMeta?.fps || 12;
      const defaultIntervalMs = 1000 / fps;
      const totalFrames = frames.length > 0
        ? frames.length
        : Math.max(1, Math.round(Math.min(10, Math.max(0.5, gifMeta?.duration || 3)) * fps));

      const exportW = Math.min(800, canvasDims.width);
      const exportH = Math.round((exportW / canvasDims.width) * canvasDims.height);
      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = exportW;
      exportCanvas.height = exportH;
      const expCtx = exportCanvas.getContext('2d', { willReadFrequently: true });
      if (!expCtx) throw new Error('Canvas indisponível para renderização');

      // Instancia o worker e registra os listeners ANTES de qualquer envio de quadros
      worker = new Worker(new URL('../GifLab/gifWorker.ts', import.meta.url), { type: 'module' });

      let workerError: Error | null = null;
      let onDoneResolve: ((blob: Blob) => void) | null = null;
      let onDoneReject: ((err: Error) => void) | null = null;

      const finishPromise = new Promise<Blob>((resolve, reject) => {
        onDoneResolve = resolve;
        onDoneReject = reject;
      });

      worker.onmessage = (e: MessageEvent) => {
        const d = e.data;
        if (d.type === 'DONE' || d.type === 'BLOB') {
          onDoneResolve?.(d.blob);
        } else if (d.type === 'ERROR') {
          const err = new Error(d.error || 'Erro na codificação do GIF');
          workerError = err;
          onDoneReject?.(err);
        }
      };

      worker.onerror = (evt) => {
        const err = new Error(evt.message || 'Falha no Web Worker do GIF');
        workerError = err;
        onDoneReject?.(err);
      };

      // Inicializa o encoder passando o delay em milissegundos (o SimpleGifEncoder faz a conversão interna correta)
      worker.postMessage({
        type: 'START',
        width: exportW,
        height: exportH,
        delay: Math.round(defaultIntervalMs),
        colors: 128,
        totalFrames
      });

      // Envia os frames com verificação precoce de erros
      for (let f = 0; f < totalFrames; f++) {
        if (workerError) throw workerError;

        const frameSource = frames.length > 0 ? frames[f].image : undefined;
        // Delay em milissegundos (sem dupla divisão por 10; mínimo 20 ms)
        const frameDelayMs = frames.length > 0
          ? Math.max(20, Math.round(frames[f].durationMs))
          : Math.max(20, Math.round(defaultIntervalMs));

        drawScene(expCtx, exportW, exportH, exportW / canvasDims.width, frameSource);
        const imgData = expCtx.getImageData(0, 0, exportW, exportH);

        worker.postMessage({
          type: 'ADD_FRAME',
          buffer: imgData.data.buffer,
          delay: frameDelayMs
        }, [imgData.data.buffer]);

        setGifExportProgress(Math.round(((f + 1) / totalFrames) * 95));
        await new Promise(r => setTimeout(r, 8));
      }

      if (workerError) throw workerError;

      // Solicita término e aguarda resolução segura do Blob
      worker.postMessage({ type: 'FINISH' });
      const gifBlob = await finishPromise;

      setGifExportProgress(100);

      const url = URL.createObjectURL(gifBlob);
      urlToRevoke = url;
      const link = document.createElement('a');
      link.href = url;
      link.download = `haze-rp-edit-${Date.now()}.gif`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showNotice('GIF animado editado exportado com sucesso!');
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Não foi possível exportar o GIF.', 'error');
    } finally {
      if (worker) {
        try { worker.terminate(); } catch (_) { /* já finalizado */ }
      }
      if (urlToRevoke) {
        const toRevoke = urlToRevoke;
        setTimeout(() => URL.revokeObjectURL(toRevoke), 10000);
      }
      setIsExportingGif(false);
      setGifExportProgress(0);
    }
  };

  // Aviso curto (toast) para feedback de ações
  const [notice, setNotice] = useState<{ text: string; kind: 'ok' | 'error' } | null>(null);
  const noticeTimer = useRef<number | undefined>(undefined);
  const showNotice = (text: string, kind: 'ok' | 'error' = 'ok') => {
    setNotice({ text, kind });
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 2600);
  };
  useEffect(() => () => window.clearTimeout(noticeTimer.current), []);

  // Descarta o histórico (ex.: após restaurar do armazenamento ou abrir um projeto)
  const resetHistory = () => {
    pastRef.current = [];
    futureRef.current = [];
    committedRef.current = null;
    syncHistCount();
  };

  // Restaura a foto de fundo salva ao abrir o app
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const bg = await loadBackgroundFromDb();
        if (cancelled) return;
        if (bg && !loadedImageRef.current) {
          bgBlobs.current.set(bg.id, bg.blob);
          bgNames.current.set(bg.id, 'fundo');
          storedBgId.current = bg.id;
          const isGifBlob = bg.blob.type === 'image/gif';
          if (isGifBlob) {
            setIsGif(true);
            processGifBlob(bg.blob);
          }
          setBackgroundFromBlob(bg.blob, bg.id, resetHistory);
        }
      } catch (_) {
        /* sem IndexedDB: a foto só vale nesta sessão */
      } finally {
        if (!cancelled) setBgReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Salva a foto de fundo (com debounce) quando ela muda
  useEffect(() => {
    if (!bgReady) return;
    const t = setTimeout(() => {
      const blob = bgId ? bgBlobs.current.get(bgId) ?? null : null;
      saveBackgroundToDb(bgId, blob, storedBgId).catch((err) => {
        if (err instanceof Error && err.message === 'IndexedDB indisponível') return;
        showNotice(err?.name === 'QuotaExceededError'
          ? 'Armazenamento cheio: a foto de fundo não foi salva neste navegador.'
          : 'Não foi possível salvar a foto de fundo.', 'error');
      });
    }, 500);
    return () => clearTimeout(t);
  }, [bgId, bgReady]);

  // Restaura as camadas salvas ao abrir o app
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { layers: savedLayers, blobs } = await loadLayersFromDb();
        if (cancelled) return;
        const imgsByBlob = new Map<string, HTMLImageElement>();
        for (const [blobId, blob] of blobs) {
          const url = URL.createObjectURL(blob);
          try {
            imgsByBlob.set(blobId, await new Promise<HTMLImageElement>((res, rej) => {
              const i = new Image();
              i.onload = () => res(i);
              i.onerror = () => rej(new Error('imagem inválida'));
              i.src = url;
            }));
          } catch (_) { /* arquivo corrompido: ignora essa camada */ }
          finally { URL.revokeObjectURL(url); }
        }
        if (cancelled) return;
        const ok = savedLayers.filter(l => imgsByBlob.has(l.blobId));
        blobs.forEach((b, id) => { layerBlobs.current.set(id, b); storedBlobIds.current.add(id); });
        ok.forEach(l => layerImgs.current.set(l.id, imgsByBlob.get(l.blobId)!));
        if (ok.length) { setLayers(prev => (prev.length ? prev : ok)); resetHistory(); }
      } catch (_) {
        /* sem IndexedDB (ex.: janela privada): o app segue sem salvar camadas */
      } finally {
        if (!cancelled) layersLoaded.current = true;
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Salva as camadas (com debounce) sempre que a lista muda
  useEffect(() => {
    if (!layersLoaded.current) return;
    const t = setTimeout(() => {
      saveLayersToDb(layers, layerBlobs.current, storedBlobIds.current).catch((err) => {
        if (err instanceof Error && err.message === 'IndexedDB indisponível') return;
        const full = err?.name === 'QuotaExceededError';
        showNotice(full ? 'Armazenamento cheio: as camadas não foram salvas.' : 'Não foi possível salvar as camadas.', 'error');
      });
    }, 500);
    return () => clearTimeout(t);
  }, [layers]);

  // Copia a imagem final (PNG 2×) para a área de transferência.
  // Passa a Promise do blob ao ClipboardItem para manter o gesto do usuário válido durante a renderização.
  const copyImage = async () => {
    if (!navigator.clipboard || typeof ClipboardItem === 'undefined') {
      showNotice('Este navegador não permite copiar imagens. Use Exportar.', 'error');
      return;
    }
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': renderExportBlob() })]);
      showNotice('Imagem copiada! Cole com Ctrl+V.');
    } catch (err) {
      const denied = err instanceof DOMException && err.name === 'NotAllowedError';
      showNotice(
        denied ? 'Permissão negada para copiar. Libere o acesso à área de transferência ou use Exportar.' : 'Não foi possível copiar a imagem. Use Exportar.',
        'error'
      );
    }
  };

  // ---- Desfazer / Refazer (snapshots das configurações, com debounce) ----
  const snapshot = {
    darkening, adjustments, rawText, fontSize, fontFamily, lineHeightFactor,
    strokeEnabled, strokeWidth, strokeColor, bgEnabled, bgColor, bgOpacity,
    maxWidthPercent, shadowEnabled, censorStyle, showTimestamps, chatPos, characters,
    outputRes, fitMode, panX, panY, zoom, lighting, camera, canvasLayers,
    layers, bgId, censorRegions
  };
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;

  const pastRef = useRef<string[]>([]);
  const futureRef = useRef<string[]>([]);
  const committedRef = useRef<string | null>(null);
  const [histCount, setHistCount] = useState({ past: 0, future: 0 });
  const [showShortcuts, setShowShortcuts] = useState(false);

  // Modo foco (esconde os controles) e medida da área do preview para ajustar o canvas
  const [focusMode, setFocusMode] = useState(false);

  // Fontes web (JetBrains Mono, Oswald...) carregam sob demanda e o canvas não redesenha sozinho:
  // força o carregamento e redesenha quando terminarem, para o preview bater com o export.
  useEffect(() => {
    const fonts = (document as any).fonts as FontFaceSet | undefined;
    if (!fonts) return;
    const bump = () => setFontsVersion(v => v + 1);
    ['"JetBrains Mono"', '"Share Tech Mono"', 'Oswald', 'Inter'].forEach(f => {
      fonts.load(`bold 16px ${f}`).then(bump).catch(() => {});
    });
    fonts.ready.then(bump).catch(() => {});
    fonts.addEventListener?.('loadingdone', bump);
    return () => fonts.removeEventListener?.('loadingdone', bump);
  }, []);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [viewSize, setViewSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const measure = () => setViewSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const HISTORY_LIMIT = 100;

  // Roda do mouse: zoom da foto (ferramenta Foto) ou tamanho da camada selecionada (ferramenta Camada)
  useEffect(() => {
    const cv = previewCanvasRef.current;
    if (!cv) return;
    const onWheel = (e: WheelEvent) => {
      const f = e.deltaY < 0 ? 1.08 : 1 / 1.08;
      if (mouseTool === 'photo') {
        e.preventDefault();
        setZoom(z => Math.round(Math.max(25, Math.min(400, z * f))));
      } else if (mouseTool === 'layer' && selectedCanvasLayerId) {
        e.preventDefault();
        setCanvasLayers(prev => prev.map(l => {
          if (l.id !== selectedCanvasLayerId || l.type === 'preset' || l.locked) return l;
          const w = Math.max(20, Math.round(l.width * f));
          const h = Math.max(20, Math.round(l.height * f));
          return { ...l, width: w, height: h, x: Math.round(l.x - (w - l.width) / 2), y: Math.round(l.y - (h - l.height) / 2) };
        }));
      } else if (mouseTool === 'layer' && selectedLayerId) {
        e.preventDefault();
        setLayers(prev => prev.map(l =>
          l.id === selectedLayerId ? { ...l, widthPct: Math.max(2, Math.min(200, l.widthPct * f)) } : l
        ));
      }
    };
    cv.addEventListener('wheel', onWheel, { passive: false });
    return () => cv.removeEventListener('wheel', onWheel);
  }, [mouseTool, selectedLayerId, selectedCanvasLayerId]);

  const syncHistCount = () => setHistCount({ past: pastRef.current.length, future: futureRef.current.length });

  // Registra mudanças 500ms após o usuário parar (agrupa arrastes de slider e digitação)
  useEffect(() => {
    // Ponto de partida do histórico: adotado na hora (sem esperar o debounce), para que uma edição
    // feita logo depois de abrir o app ou um projeto já possa ser desfeita.
    if (committedRef.current === null) {
      committedRef.current = JSON.stringify(snapshotRef.current);
      return;
    }
    const t = setTimeout(() => {
      const cur = JSON.stringify(snapshotRef.current);
      if (committedRef.current === null) { committedRef.current = cur; return; }
      if (cur === committedRef.current) return;
      pastRef.current.push(committedRef.current);
      if (pastRef.current.length > HISTORY_LIMIT) pastRef.current.shift();
      futureRef.current = [];
      committedRef.current = cur;
      syncHistCount();
    }, 500);
    return () => clearTimeout(t);
  }, [
    darkening, adjustments, rawText, fontSize, fontFamily, lineHeightFactor,
    strokeEnabled, strokeWidth, strokeColor, bgEnabled, bgColor, bgOpacity,
    maxWidthPercent, shadowEnabled, censorStyle, showTimestamps, chatPos, characters,
    outputRes, fitMode, panX, panY, zoom, lighting, camera, canvasLayers, layers, bgId, censorRegions
  ]);

  const applySnapshot = (json: string, opts?: { skipBackground?: boolean }) => {
    const s = JSON.parse(json);
    setDarkening(s.darkening); setAdjustments(s.adjustments); setRawText(s.rawText);
    setFontSize(s.fontSize); setFontFamily(s.fontFamily); setLineHeightFactor(s.lineHeightFactor);
    setStrokeEnabled(s.strokeEnabled); setStrokeWidth(s.strokeWidth); setStrokeColor(s.strokeColor);
    setBgEnabled(s.bgEnabled); setBgColor(s.bgColor); setBgOpacity(s.bgOpacity);
    setMaxWidthPercent(s.maxWidthPercent); setShadowEnabled(s.shadowEnabled);
    setCensorStyle(s.censorStyle); setShowTimestamps(s.showTimestamps);
    setChatPos(s.chatPos); setCharacters(s.characters);
    setOutputRes(s.outputRes); setFitMode(s.fitMode);
    setPanX(s.panX); setPanY(s.panY); setZoom(s.zoom);
    setLighting(sanitizeLighting(s.lighting));
    setCamera(sanitizeCamera(s.camera));
    const restoredCanvasLayers = sanitizeCanvasLayers(s.canvasLayers);
    setCanvasLayers(restoredCanvasLayers);
    setSelectedCanvasLayerId(cur => (cur && restoredCanvasLayers.some(l => l.id === cur) ? cur : null));

    if (Array.isArray(s.censorRegions)) {
      setCensorRegions(sanitizeCensorRegions(s.censorRegions));
    } else {
      setCensorRegions([]);
    }

    // camadas de imagem (só as que ainda têm a imagem carregada na sessão)
    const restoredLayers: ImageLayer[] = Array.isArray(s.layers)
      ? s.layers.filter((l: any) => l && typeof l.id === 'string' && layerImgs.current.has(l.id))
      : [];
    setLayers(restoredLayers);
    setSelectedLayerId(cur => (cur && restoredLayers.some(l => l.id === cur) ? cur : null));

    // foto de fundo
    const targetBg: string | null = typeof s.bgId === 'string' ? s.bgId : null;
    if (!opts?.skipBackground && targetBg !== snapshotRef.current.bgId) {
      const blob = targetBg ? bgBlobs.current.get(targetBg) : undefined;
      if (targetBg && blob) setBackgroundFromBlob(blob, targetBg);
      else clearBackground();
    }
    if (s.outputRes) { setCustomW(String(s.outputRes.w)); setCustomH(String(s.outputRes.h)); }
  };

  // Antes de desfazer/refazer, grava como passo qualquer mudança ainda pendente no debounce
  const flushPending = () => {
    const cur = JSON.stringify(snapshotRef.current);
    if (committedRef.current !== null && cur !== committedRef.current) {
      pastRef.current.push(committedRef.current);
      futureRef.current = [];
      committedRef.current = cur;
    }
  };

  const undo = () => {
    flushPending();
    const prev = pastRef.current.pop();
    if (prev === undefined || committedRef.current === null) { syncHistCount(); return; }
    futureRef.current.push(committedRef.current);
    committedRef.current = prev;
    applySnapshot(prev);
    syncHistCount();
  };

  const redo = () => {
    flushPending();
    const next = futureRef.current.pop();
    if (next === undefined || committedRef.current === null) { syncHistCount(); return; }
    pastRef.current.push(committedRef.current);
    committedRef.current = next;
    applySnapshot(next);
    syncHistCount();
  };

  const nudgeChat = (dx: number, dy: number) => {
    setChatPos(p => ({
      x: Math.max(0, Math.min(canvasDims.width - 100, p.x + dx)),
      y: Math.max(0, Math.min(canvasDims.height - 50, p.y + dy))
    }));
  };

  // Atalhos globais (só quando a aba do Chat Log está visível)
  const deleteSelectedLayer = () => {
    if (selectedCanvasLayerId) deleteCanvasLayer(selectedCanvasLayerId);
    else if (selectedLayerId) removeLayer(selectedLayerId);
  };
  const shortcutsRef = useRef({ undo, redo, exportImage, copyImage, nudgeChat, insertCharSpeech, characters, deleteSelectedLayer });
  shortcutsRef.current = { undo, redo, exportImage, copyImage, nudgeChat, insertCharSpeech, characters, deleteSelectedLayer };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = containerRef.current;
      if (!el || el.offsetParent === null || el.closest('.hidden')) return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      const isText = tag === 'TEXTAREA' || tag === 'SELECT' ||
        (tag === 'INPUT' && !['range', 'checkbox', 'radio', 'button', 'file', 'color'].includes((t as HTMLInputElement).type)) ||
        !!t?.isContentEditable;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      const s = shortcutsRef.current;

      if (mod && k === 's') { e.preventDefault(); s.exportImage(); return; }
      if (e.key === 'Escape') { setShowShortcuts(false); setFocusMode(false); return; }
      if (isText) return;
      if (!mod && !e.altKey && k === 'f') { setFocusMode(v => !v); return; }
      if (!mod && !e.altKey && /^[1-5]$/.test(e.key)) {
        setMouseTool((['chat', 'photo', 'layer', 'light', 'censor'] as const)[parseInt(e.key) - 1]);
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && t === previewCanvasRef.current) {
        e.preventDefault();
        s.deleteSelectedLayer();
        return;
      } // em campos de texto o Ctrl+Z nativo do navegador continua valendo

      // Ctrl+C copia a imagem final, exceto se houver texto selecionado na página
      if (mod && k === 'c' && !e.shiftKey && !e.altKey && !window.getSelection()?.toString()) {
        e.preventDefault();
        s.copyImage();
        return;
      }
      if (mod && k === 'z' && !e.shiftKey) { e.preventDefault(); s.undo(); return; }
      if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); s.redo(); return; }
      if (e.altKey && /^[1-9]$/.test(e.key)) {
        const c = s.characters[parseInt(e.key) - 1];
        if (c) { e.preventDefault(); s.insertCharSpeech(c.name); }
        return;
      }
      // Setas movem o chat só com o canvas focado (clique nele), para não travar a rolagem da página
      if (!mod && !e.altKey && e.key.startsWith('Arrow') && t === previewCanvasRef.current) {
        const step = e.shiftKey ? 10 : 1;
        const d: Record<string, [number, number]> = {
          ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step]
        };
        e.preventDefault();
        s.nudgeChat(d[e.key][0], d[e.key][1]);
        return;
      }
      if (e.key === '?' ) { setShowShortcuts(v => !v); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ---- Seções recolhíveis do painel ----
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(loadOpenSections);
  useEffect(() => { saveOpenSections(openSections); }, [openSections]);
  const toggleSection = (id: SectionId) => setOpenSections(prev => ({ ...prev, [id]: !prev[id] }));
  const setAllSections = (open: boolean) =>
    setOpenSections(Object.fromEntries(SECTION_IDS.map(id => [id, open])));
  const sectionProps = (id: SectionId) => ({ id, open: !!openSections[id], onToggle: toggleSection });

  /** Cartão de personagens: usado na seção do Modo Avançado e no passo 2 do Modo Simples. */
  const charactersCard = (
    <div className="p-4 rounded-2xl bg-haze-panel border border-haze-border shadow-md space-y-3">
      <div className="flex items-center justify-between">
        <span className="section-title text-xs font-semibold uppercase tracking-wider text-haze-text flex items-center gap-1.5">
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
          aria-label="Nome do personagem"
          className="flex-1 px-3 py-1.5 rounded-lg bg-haze-field border border-haze-border text-xs text-haze-text focus:outline-none focus:border-haze-accent"
        />
        <button
          onClick={addCharacter}
          className="px-3 py-1.5 rounded-lg bg-haze-accent-fill hover:bg-haze-accent-fill-hover text-haze-on-accent font-bold text-xs flex items-center gap-1 transition-all"
        >
          <Plus className="w-3.5 h-3.5" /> Add
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5 pt-1">
        {characters.map((char) => (
          <div
            key={char.id}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs transition-all"
            style={{
              borderColor: char.id === activeChar?.id ? char.color : `${char.color}40`,
              backgroundColor: `${char.color}${char.id === activeChar?.id ? '30' : '15'}`,
              color: char.color,
              boxShadow: char.id === activeChar?.id ? `0 0 0 1px ${char.color}` : undefined
            }}
          >
            <button
              onClick={() => insertCharSpeech(char.name)}
              aria-pressed={char.id === activeChar?.id}
              className="font-medium hover:underline text-xs"
              title="Define como personagem ativo e insere a fala"
            >
              {char.name}
            </button>
            <button
              onClick={() => removeCharacter(char.id)}
              aria-label={`Remover ${char.name}`}
              className="opacity-60 hover:opacity-100 hover:text-red-400 ml-1"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  const sidebarProps = {
    layers: canvasLayers,
    setLayers: setCanvasLayers,
    selectedLayerId: selectedCanvasLayerId,
    setSelectedLayerId: (id: string | null) => { setSelectedCanvasLayerId(id); if (id) setSelectedLayerId(null); },
    applyPreset,
    addSticker,
    addTextLayer,
    moveLayer: moveCanvasLayer,
    bringLayerToFront: bringCanvasLayerToFront,
    sendLayerToBack: sendCanvasLayerToBack,
    duplicateLayer: duplicateCanvasLayer,
    deleteLayer: deleteCanvasLayer,
    updateSelectedLayer: updateSelectedCanvasLayer,
    updatePresetDataField: updateCanvasPresetField
  };

  return (
    <div ref={containerRef} className="max-w-[1800px] mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

      {/* Aviso de feedback (copiar/exportar) */}
      <div aria-live="polite" role="status" className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
        {notice && (
          <div className={`px-4 py-2 rounded-xl text-xs font-semibold shadow-xl border ${
            notice.kind === 'ok'
              ? 'bg-haze-accent-fill text-haze-on-accent border-haze-accent'
              : 'bg-rose-950 text-rose-200 border-rose-500/50'
          }`}>
            {notice.text}
          </div>
        )}
      </div>
      
      {/* Coluna da Esquerda: Controles (4 cols) */}
      <div className={focusMode ? 'hidden' : 'lg:col-span-4 xl:col-span-3 space-y-4 min-w-0'}>

        {/* Modo Simples / Avançado */}
        <div role="group" aria-label="Nível do editor" className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-haze-panel border border-haze-border">
          {([['simple', 'Simples'], ['advanced', 'Avançado']] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={uiMode === key}
              onClick={() => setUiMode(key)}
              title={key === 'simple' ? 'Foto, chat e um visual: o essencial' : 'Todas as seções: câmera, luz, camadas, tipografia…'}
              className={`py-2 rounded-lg text-xs font-semibold transition-colors ${
                uiMode === key ? 'bg-haze-accent/15 text-haze-accent border border-haze-accent/40' : 'text-haze-muted hover:text-haze-text border border-transparent'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {uiMode === 'simple' && mode === 'single' && (
          <SimplePanel
            hasPhoto={!!imageSrc}
            photoSrc={imageSrc}
            onPickPhoto={() => fileInputRef.current?.click()}
            text={rawText}
            onText={(t) => setRawText(t.slice(0, 200_000))}
            visualId={inferVisual({ camera, lighting, adjustments })?.id ?? null}
            onVisual={(id) => {
              const v = findVisual(id);
              if (!v) return;
              const next = applyVisual(v, { camera, lighting });
              setCamera(next.camera); setLighting(next.lighting); setAdjustments(next.adjustments);
            }}
            onExport={exportImage}
            onExportChat={exportChatOnly}
            onCopy={copyImage}
            isGif={isGif}
            onExportGif={exportGifFromChatLog}
            isExportingGif={isExportingGif}
            gifExportProgress={gifExportProgress}
            charactersCard={charactersCard}
            characters={characters}
            activeCharId={activeCharId}
            onActiveCharChange={setActiveCharId}
            detection={detection}
            frame={{ w: canvasDims.width, h: canvasDims.height, fit: fitMode, panX, panY, zoom, darkening }}
          />
        )}

        {/* Alternador de modo: Foto individual / Lote (ZIP) */}
        <div role="tablist" aria-label="Modo de trabalho" className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-haze-panel border border-haze-border">
          {([['single', 'Foto individual'], ['batch', 'Lote (ZIP)']] as const).map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={mode === key}
              onClick={() => setMode(key)}
              className={`py-2 rounded-lg text-xs font-semibold transition-colors ${
                mode === key ? 'bg-haze-accent/15 text-haze-accent border border-haze-accent/40' : 'text-haze-muted hover:text-haze-text border border-transparent'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Desfazer / Refazer / Atalhos */}
        <div className="flex items-center gap-2">
          <button
            onClick={undo}
            disabled={histCount.past === 0}
            aria-label="Desfazer (Ctrl+Z)"
            title="Desfazer (Ctrl+Z)"
            className="flex-1 py-1.5 rounded-lg text-xs border border-haze-border text-haze-soft hover:border-haze-accent/40 disabled:opacity-35 disabled:cursor-not-allowed"
          >
            ↶ Desfazer{histCount.past ? ` (${histCount.past})` : ''}
          </button>
          <button
            onClick={redo}
            disabled={histCount.future === 0}
            aria-label="Refazer (Ctrl+Y)"
            title="Refazer (Ctrl+Y)"
            className="flex-1 py-1.5 rounded-lg text-xs border border-haze-border text-haze-soft hover:border-haze-accent/40 disabled:opacity-35 disabled:cursor-not-allowed"
          >
            Refazer ↷
          </button>
          <button
            onClick={() => setShowShortcuts(v => !v)}
            aria-expanded={showShortcuts}
            aria-label="Atalhos de teclado"
            title="Atalhos de teclado (?)"
            className="px-3 py-1.5 rounded-lg text-xs border border-haze-border text-haze-soft hover:border-haze-accent/40"
          >
            ⌨
          </button>
        </div>

        {/* Projeto: salvar e abrir a cena inteira */}
        <input
          ref={projectInputRef}
          data-testid="project-input"
          type="file"
          accept=".haze,.zip,application/zip"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) importProject(f); }}
        />
        <div className="flex items-center gap-2">
          <button
            onClick={exportProject}
            title="Salva a cena inteira (foto, camadas, chat, ajustes) num arquivo .haze editável"
            className="flex-1 py-1.5 rounded-lg text-xs font-semibold border border-haze-accent/40 text-haze-accent hover:bg-haze-accent/10"
          >
            💾 Salvar projeto
          </button>
          <button
            onClick={() => projectInputRef.current?.click()}
            title="Abre um arquivo .haze salvo antes"
            className="flex-1 py-1.5 rounded-lg text-xs font-semibold border border-haze-border text-haze-soft hover:border-haze-accent/40"
          >
            📂 Abrir projeto
          </button>
        </div>

        {showShortcuts && (
          <div role="region" aria-label="Atalhos de teclado" className="p-3 rounded-xl bg-haze-panel border border-haze-accent/30 text-xs text-haze-soft space-y-1">
            {[
              ['Ctrl+Z', 'Desfazer (fora de campos de texto)'],
              ['Ctrl+Y / Ctrl+Shift+Z', 'Refazer'],
              ['Ctrl+S', 'Exportar PNG 2×'],
              ['Ctrl+C (fora de campos de texto)', 'Copiar imagem final'],
              ['Alt+1…9', 'Inserir fala do personagem nº'],
              ['Setas (canvas focado)', 'Mover o chat 1px (Shift = 10px)'],
              ['Ctrl+V', 'Colar print como fundo'],
              ['Del (canvas focado)', 'Remover a camada selecionada'],
              ['1 / 2 / 3 / 4', 'Ferramenta: Texto, Foto, Camada, Luz'],
              ['Alt + arrastar', 'Mover o chat por cima de um elemento'],
              ['Roda do mouse', 'Zoom da foto ou tamanho da camada'],
              ['F', 'Modo foco (preview maior)'],
              ['?', 'Mostrar/ocultar esta lista'],
              ['Esc', 'Fechar / sair do modo foco']
            ].map(([k, d]) => (
              <div key={k} className="flex justify-between gap-3">
                <kbd className="px-1.5 py-0.5 rounded bg-haze-raised border border-haze-border-strong font-mono text-[11px] whitespace-nowrap">{k}</kbd>
                <span className="text-right">{d}</span>
              </div>
            ))}
          </div>
        )}

        {mode === 'batch' && (
          <div className="p-4 rounded-2xl bg-haze-panel border border-haze-border shadow-md space-y-3">
            <span className="section-title text-xs font-semibold uppercase tracking-wider text-haze-text">Lote de fotos</span>
            <p className="text-xs text-haze-muted leading-relaxed">
              Aplica o chat e os ajustes atuais a todas as fotos e baixa um .zip. Posição e tamanho do texto
              acompanham o preview ({canvasDims.width}px de largura).{' '}
              {outputRes ? `Todas saem em ${outputRes.w}×${outputRes.h}.` : 'Cada foto sai na resolução original.'}
            </p>
            <input
              ref={batchInputRef}
              data-testid="batch-input"
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              onChange={(e) => { if (e.target.files) addBatchFiles(e.target.files); e.target.value = ''; }}
            />
            <div
              onClick={() => batchInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
              onDrop={(e) => { e.preventDefault(); addBatchFiles(e.dataTransfer.files); }}
              className="cursor-pointer border-2 border-dashed border-haze-border hover:border-haze-accent/50 rounded-xl p-4 text-center text-xs text-haze-soft"
            >
              Clique ou arraste várias fotos
            </div>

            {batchFiles.length > 0 && (
              <ul className="max-h-40 overflow-y-auto space-y-1 text-xs text-haze-soft">
                {batchFiles.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 px-2 py-1 rounded bg-haze-field">
                    <span className="truncate">{f.name}</span>
                    <button
                      aria-label={`Remover ${f.name}`}
                      disabled={!!batchProgress}
                      onClick={() => setBatchFiles(prev => prev.filter((_, j) => j !== i))}
                      className="text-haze-faint hover:text-rose-400 disabled:opacity-40"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {batchProgress && (
              <div>
                <div className="h-1.5 rounded bg-haze-raised overflow-hidden">
                  <div className="h-full bg-haze-accent-fill transition-all" style={{ width: `${(batchProgress.done / batchProgress.total) * 100}%` }} />
                </div>
                <p className="mt-1 text-xs text-haze-muted">{batchProgress.done}/{batchProgress.total} processadas</p>
              </div>
            )}
            {batchError && <p role="alert" className="text-xs text-rose-400">{batchError}</p>}

            <div className="flex gap-2">
              <button
                onClick={generateBatchZip}
                disabled={batchFiles.length === 0 || !!batchProgress}
                className="flex-1 py-2 rounded-lg text-xs font-bold bg-haze-accent-fill text-black disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {batchProgress ? 'Gerando…' : `Gerar ZIP (${batchFiles.length})`}
              </button>
              <button
                onClick={() => { setBatchFiles([]); setBatchError(null); }}
                disabled={batchFiles.length === 0 || !!batchProgress}
                className="px-3 py-2 rounded-lg text-xs border border-haze-border text-haze-soft disabled:opacity-40"
              >
                Limpar
              </button>
            </div>
          </div>
        )}

        <button
          onClick={clearSavedData}
          className="w-full text-xs text-haze-faint hover:text-haze-soft underline-offset-2 hover:underline"
        >
          Restaurar configurações padrão
        </button>

        {/* Seções do Editor RP (na ordem do fluxo de trabalho); no Modo Simples ficam montadas, só escondidas */}
        <div className={uiMode === 'simple' ? 'hidden' : 'space-y-4'} data-testid="advanced-sections">
        <div className="flex items-center justify-between text-xs text-haze-faint px-1">
          <span>Seções do editor</span>
          <span className="flex items-center gap-3">
            <button type="button" onClick={() => setAllSections(true)} className="hover:text-haze-accent-hover underline-offset-2 hover:underline">Expandir tudo</button>
            <button type="button" onClick={() => setAllSections(false)} className="hover:text-haze-accent-hover underline-offset-2 hover:underline">Recolher tudo</button>
          </span>
        </div>

        <EditorSection {...sectionProps('fundo')} title="Fundo da cena" badge={`${canvasDims.width}×${canvasDims.height}px`}>
        <div className="p-4 rounded-2xl bg-haze-panel border border-haze-border shadow-md">
          <div className="flex items-center justify-between mb-3">
            <span className="section-title text-xs font-semibold uppercase tracking-wider text-haze-text flex items-center gap-1.5">
              <Upload className="w-3.5 h-3.5" /> Fundo da Cena
            </span>
            <span className="section-badge text-xs font-mono text-haze-muted">
              {canvasDims.width}×{canvasDims.height}px
            </span>
          </div>

          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`group cursor-pointer border-2 border-dashed rounded-xl p-4 text-center transition-all ${
              isDraggingFile 
                ? 'border-haze-accent bg-haze-accent/10 ring-2 ring-haze-accent/30' 
                : 'border-haze-border hover:border-haze-accent/50 bg-haze-field/40 hover:bg-haze-accent/[0.02]'
            }`}
          >
            <input
              type="file"
              ref={fileInputRef}
              data-testid="bg-input"
              onChange={(e) => e.target.files?.[0] && handleImageUpload(e.target.files[0])}
              accept="image/*"
              className="hidden"
            />
            <div className="flex flex-col items-center gap-2">
              <div className="p-2.5 rounded-full bg-haze-raised/60 text-haze-muted group-hover:text-haze-accent-hover transition-colors">
                <Upload className="w-5 h-5" />
              </div>
              <p className="text-xs font-medium text-haze-soft">
                Clique ou arraste um print do RP
              </p>
              <p className="text-[11px] text-haze-faint">
                PNG, JPG, WebP ou cole com <kbd className="px-1 py-0.5 rounded bg-haze-raised border border-haze-border-strong font-mono text-[11px]">Ctrl+V</kbd>
              </p>
            </div>
          </div>

          {imageSrc && (
            <button
              onClick={clearBackground}
              className="mt-2 w-full py-1 rounded-lg text-xs text-haze-muted hover:text-rose-300 border border-haze-border hover:border-rose-500/40"
            >
              Remover foto de fundo
            </button>
          )}

          <div className="mt-3 pt-3 border-t border-haze-border flex items-center justify-between text-xs">
            <span className="text-haze-muted">Escurecimento</span>
            <div className="flex items-center gap-2 w-1/2">
              <input
                type="range"
                min="0"
                max="0.8"
                step="0.05"
                value={darkening}
                onChange={(e) => setDarkening(parseFloat(e.target.value))}
                className="w-full accent-haze-accent h-1.5 bg-haze-raised rounded-lg cursor-pointer"
              />
              <span className="font-mono text-haze-soft text-xs w-8 text-right">
                {Math.round(darkening * 100)}%
              </span>
            </div>
          </div>
        </div>
        </EditorSection>

        <EditorSection {...sectionProps('resolucao')} title="Resolução e adaptação" badge={outputRes ? `${outputRes.w}×${outputRes.h}` : 'Original'}>
        <div className="p-4 rounded-2xl bg-haze-panel border border-haze-border shadow-md space-y-3">
          <div className="flex items-center justify-between">
            <span className="section-title text-xs font-semibold uppercase tracking-wider text-haze-text">Resolução &amp; Adaptação</span>
            <span className="section-badge text-xs font-mono text-haze-soft">
              {outputRes ? `${outputRes.w}×${outputRes.h}` : 'Original'}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Resolução de exportação">
            {RESOLUTION_PRESETS.map(p => {
              const active = p.size === null
                ? outputRes === null
                : outputRes?.w === p.size.w && outputRes?.h === p.size.h;
              return (
                <button
                  key={p.label}
                  aria-pressed={active}
                  onClick={() => changeResolution(p.size)}
                  className={`py-1.5 rounded-lg text-xs border transition-colors ${
                    active ? 'bg-haze-accent/15 text-haze-accent border-haze-accent/50' : 'border-haze-border text-haze-soft hover:border-haze-accent/30'
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="number" min={MIN_RES} max={MAX_RES} value={customW} aria-label="Largura personalizada"
              onChange={(e) => setCustomW(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && applyCustomResolution()}
              className="w-full p-1.5 rounded-lg bg-haze-field border border-haze-border text-xs text-haze-text font-mono"
            />
            <span className="text-haze-faint text-xs">×</span>
            <input
              type="number" min={MIN_RES} max={MAX_RES} value={customH} aria-label="Altura personalizada"
              onChange={(e) => setCustomH(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && applyCustomResolution()}
              className="w-full p-1.5 rounded-lg bg-haze-field border border-haze-border text-xs text-haze-text font-mono"
            />
            <button
              onClick={applyCustomResolution}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-haze-accent/50 text-haze-accent hover:bg-haze-accent/10"
            >
              Aplicar
            </button>
          </div>

          <div data-testid="fit-modes">
            <span className="text-xs text-haze-muted block mb-1">Modo de adaptação da foto</span>
            <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Modo de adaptação">
              {([
                ['cover', 'Cover', 'Preenche o quadro, recortando o excesso'],
                ['contain', 'Contain', 'Mostra a foto inteira, com faixas pretas'],
                ['blur', 'Contain + desfoque', 'Foto inteira; as faixas usam a própria foto desfocada'],
                ['stretch', 'Esticar', 'Ocupa o quadro todo (pode deformar)']
              ] as const).map(([key, label, hint]) => (
                <button
                  key={key}
                  title={hint}
                  aria-pressed={fitMode === key}
                  disabled={!outputRes}
                  onClick={() => chooseFitMode(key)}
                  className={`py-1.5 rounded-lg text-xs border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                    fitMode === key ? 'bg-haze-accent/15 text-haze-accent border-haze-accent/50' : 'border-haze-border text-haze-soft hover:border-haze-accent/30'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-xs text-haze-faint mt-1.5 leading-relaxed">
              {outputRes
                ? { cover: 'Preenche o quadro, recortando o excesso.', contain: 'Mostra a foto inteira, com faixas pretas.', blur: 'Foto inteira; as faixas usam a própria foto desfocada.', stretch: 'Ocupa o quadro todo (pode deformar a foto).' }[fitMode]
                : 'Com a resolução "Original" o quadro tem o tamanho da foto, então não há o que adaptar. Escolha uma resolução acima.'}
            </p>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-haze-border text-xs" data-testid="framing-readout">
            <span className="text-haze-muted">
              Enquadramento: zoom <span className="font-mono text-haze-text">{zoom}%</span>
              {(Math.round(effectivePan().panX) !== 0 || Math.round(effectivePan().panY) !== 0) && <> · deslocada <span className="font-mono text-haze-text">{Math.round(effectivePan().panX)}%, {Math.round(effectivePan().panY)}%</span></>}
            </span>
            <button
              type="button"
              onClick={resetFraming}
              disabled={zoom === 100 && panX === 0 && panY === 0}
              className="px-2.5 py-1 rounded-lg border border-haze-border text-haze-soft hover:border-haze-accent/40 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Centralizar foto
            </button>
          </div>
          <p className="text-xs text-haze-faint leading-relaxed">Para mover ou dar zoom, use a ferramenta "Enquadrar foto" (tecla 2): arraste a foto e use a roda do mouse.</p>
        </div>
        </EditorSection>

        <EditorSection {...sectionProps('personagens')} title="Personagens da cena" badge={`${characters.length}`}>
        {charactersCard}
        </EditorSection>

        <EditorSection {...sectionProps('dialogos')} title="Diálogos e ações">
          <DialogPanel
            testId="editor-dialog"
            value={rawText}
            onChange={setRawText}
            characters={characters}
            activeCharId={activeCharId}
            onActiveCharChange={setActiveCharId}
            textareaRef={textareaRef}
          />
        </EditorSection>

        <EditorSection {...sectionProps('camera')} title="Câmera RP e efeitos" badge={({ none: 'Padrão', bodycam: 'Bodycam', cctv: 'CCTV', noir: 'Noite Fria' } as const)[camera.preset]}>
          <CameraPanel camera={camera} setCamera={setCamera} activeCharName={activeChar?.name} />
        </EditorSection>

        <EditorSection {...sectionProps('retoque')} title="Retoque fotográfico">
        <div className="p-4 rounded-2xl bg-haze-panel border border-haze-border shadow-md space-y-3">
          <div className="flex items-center justify-between">
            <span className="section-title text-xs font-semibold uppercase tracking-wider text-haze-text flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5" /> Retoque Fotográfico (Color Grading)
            </span>
            <button
              onClick={() => setAdjustments({ ...DEFAULT_ADJUSTMENTS })}
              className="text-[11px] text-haze-muted hover:text-haze-accent-hover"
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
                  : 'border-haze-border bg-haze-field text-haze-muted hover:text-white'
              }`}
            >
              <div className="flex items-center gap-1.5"><Sun className="w-3.5 h-3.5 text-amber-400" /> Golden Hour</div>
            </button>

            <button
              onClick={() => setAdjustments(prev => ({ ...prev, colorPreset: 'midnight-neon' }))}
              className={`px-2.5 py-1.5 rounded-lg border text-left text-xs transition-all ${
                adjustments.colorPreset === 'midnight-neon'
                  ? 'border-sky-500 bg-sky-500/15 text-sky-300 font-semibold'
                  : 'border-haze-border bg-haze-field text-haze-muted hover:text-white'
              }`}
            >
              <div className="flex items-center gap-1.5"><Zap className="w-3.5 h-3.5 text-sky-400" /> Midnight Neon</div>
            </button>

            <button
              onClick={() => setAdjustments(prev => ({ ...prev, colorPreset: 'grit-crime' }))}
              className={`px-2.5 py-1.5 rounded-lg border text-left text-xs transition-all ${
                adjustments.colorPreset === 'grit-crime'
                  ? 'border-red-500 bg-red-500/15 text-red-300 font-semibold'
                  : 'border-haze-border bg-haze-field text-haze-muted hover:text-white'
              }`}
            >
              <div className="flex items-center gap-1.5"><Contrast className="w-3.5 h-3.5 text-red-400" /> Grit &amp; Crime</div>
            </button>

            <button
              onClick={() => setAdjustments(prev => ({ ...prev, colorPreset: 'vintage-90s' }))}
              className={`px-2.5 py-1.5 rounded-lg border text-left text-xs transition-all ${
                adjustments.colorPreset === 'vintage-90s'
                  ? 'border-haze-accent bg-haze-accent/15 text-haze-accent font-semibold'
                  : 'border-haze-border bg-haze-field text-haze-muted hover:text-white'
              }`}
            >
              <div className="flex items-center gap-1.5"><Flame className="w-3.5 h-3.5 text-haze-accent" /> San Andreas 90s</div>
            </button>
          </div>

          {/* Sliders de Ajuste Fino */}
          <div className="space-y-2 pt-1 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-haze-muted">Brilho</span>
              <div className="flex items-center gap-2 w-1/2">
                <input
                  type="range" min="-50" max="50" value={adjustments.brightness}
                  onChange={(e) => setAdjustments(prev => ({ ...prev, brightness: parseInt(e.target.value) }))}
                  className="w-full accent-haze-accent h-1 bg-haze-raised rounded cursor-pointer"
                />
                <span className="font-mono text-[11px] w-6 text-right text-haze-soft">{adjustments.brightness}</span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-haze-muted">Contraste</span>
              <div className="flex items-center gap-2 w-1/2">
                <input
                  type="range" min="-50" max="50" value={adjustments.contrast}
                  onChange={(e) => setAdjustments(prev => ({ ...prev, contrast: parseInt(e.target.value) }))}
                  className="w-full accent-haze-accent h-1 bg-haze-raised rounded cursor-pointer"
                />
                <span className="font-mono text-[11px] w-6 text-right text-haze-soft">{adjustments.contrast}</span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-haze-muted">Nitidez (Sharpen)</span>
              <div className="flex items-center gap-2 w-1/2">
                <input
                  type="range" min="0" max="100" value={adjustments.sharpen}
                  onChange={(e) => setAdjustments(prev => ({ ...prev, sharpen: parseInt(e.target.value) }))}
                  className="w-full accent-haze-accent h-1 bg-haze-raised rounded cursor-pointer"
                />
                <span className="font-mono text-[11px] w-6 text-right text-haze-soft">{adjustments.sharpen}%</span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-haze-muted">Depth of Field (Bokeh)</span>
              <div className="flex items-center gap-2 w-1/2">
                <input
                  type="range" min="0" max="100" value={adjustments.depthOfField}
                  onChange={(e) => setAdjustments(prev => ({ ...prev, depthOfField: parseInt(e.target.value) }))}
                  className="w-full accent-haze-accent h-1 bg-haze-raised rounded cursor-pointer"
                />
                <span className="font-mono text-[11px] w-6 text-right text-haze-soft">{adjustments.depthOfField}%</span>
              </div>
            </div>
          </div>

          {/* Letterbox de Cinema */}
          <div className="pt-2 border-t border-haze-border flex items-center justify-between text-xs">
            <button
              onClick={() => setAdjustments(prev => ({ ...prev, letterbox: !prev.letterbox }))}
              className={`w-full py-2 px-3 rounded-xl border flex items-center justify-center gap-2 transition-all font-semibold ${
                adjustments.letterbox
                  ? 'bg-haze-accent/20 border-haze-accent text-haze-accent'
                  : 'bg-haze-field border-haze-border text-haze-muted hover:text-white'
              }`}
            >
              <Clapperboard className="w-4 h-4" />
              <span>{adjustments.letterbox ? 'Letterbox 21:9 Ativo (Barras de Cinema)' : 'Ativar Letterbox 21:9 (Cinema)'}</span>
            </button>
          </div>
        </div>
        </EditorSection>

        <EditorSection {...sectionProps('rp')} title="Elementos de RP · presets e texto">
          <CanvasLayersSidebar part="presets" {...sidebarProps} />
        </EditorSection>

        <EditorSection {...sectionProps('adesivos')} title="Adesivos e marcadores">
          <CanvasLayersSidebar part="stickers" {...sidebarProps} />
        </EditorSection>

        <EditorSection {...sectionProps('tipografia')} title="Tipografia">
        <div className="p-4 rounded-2xl bg-haze-panel border border-haze-border shadow-md space-y-3">
          <div className="flex items-center justify-between">
            <span className="section-title text-xs font-semibold uppercase tracking-wider text-haze-text flex items-center gap-1.5">
              <Type className="w-3.5 h-3.5" /> Tipografia &amp; Estilo do Chat
            </span>
          </div>

          {/* Fonte & Família */}
          <div className="space-y-2 text-xs">
            <div>
              <label className="text-xs text-haze-muted block mb-1">Família da Fonte</label>
              <select
                value={fontFamily}
                onChange={(e) => setFontFamily(e.target.value)}
                className="w-full p-2 rounded-lg bg-haze-field border border-haze-border text-xs text-haze-text focus:outline-none focus:border-haze-accent"
              >
                <option value="Arial, Helvetica, sans-serif">Arial / GTA Standard</option>
                <option value="ChaletLondonNineteenSixty, Arial, sans-serif">Chalet London (GTA V, se estiver instalada)</option>
                <option value='"JetBrains Mono", monospace'>JetBrains Mono (Logs / OOC)</option>
                <option value='"Trebuchet MS", sans-serif'>Trebuchet MS</option>
                <option value="Impact, sans-serif">Impact</option>
                <option value="Georgia, serif">Georgia</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="flex justify-between text-xs text-haze-muted mb-1">
                  <span>Tamanho</span>
                  <span className="font-mono text-haze-text">{fontSize}px</span>
                </div>
                <input
                  type="range"
                  min="12"
                  max="48"
                  value={fontSize}
                  onChange={(e) => setFontSize(parseInt(e.target.value))}
                  className="w-full accent-haze-accent h-1 bg-haze-raised rounded cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs text-haze-muted mb-1">
                  <span>Espaçamento</span>
                  <span className="font-mono text-haze-text">{lineHeightFactor.toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  min="1.1"
                  max="2.2"
                  step="0.05"
                  value={lineHeightFactor}
                  onChange={(e) => setLineHeightFactor(parseFloat(e.target.value))}
                  className="w-full accent-haze-accent h-1 bg-haze-raised rounded cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Contorno GTA & Sombra */}
          <div className="pt-2 border-t border-haze-border space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer text-haze-soft">
                <input
                  type="checkbox"
                  checked={strokeEnabled}
                  onChange={(e) => setStrokeEnabled(e.target.checked)}
                  className="rounded bg-haze-raised border-haze-border-strong text-haze-accent focus:ring-0"
                />
                <Shield className="w-3.5 h-3.5 text-haze-accent" />
                <span>Contorno Autêntico GTA</span>
              </label>

              {strokeEnabled && (
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={strokeColor}
                    onChange={(e) => setStrokeColor(e.target.value)}
                    className="w-6 h-6 rounded border border-haze-border-strong bg-transparent cursor-pointer"
                    title="Cor do contorno"
                  />
                  <span className="font-mono text-[11px] text-haze-muted">{strokeWidth}px</span>
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
                className="w-full accent-haze-accent h-1 bg-haze-raised rounded cursor-pointer"
              />
            )}
          </div>

          {/* Fundo do Chat (Highlight Boxes) */}
          <div className="pt-2 border-t border-haze-border space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer text-haze-soft">
                <input
                  type="checkbox"
                  checked={bgEnabled}
                  onChange={(e) => setBgEnabled(e.target.checked)}
                  className="rounded bg-haze-raised border-haze-border-strong text-haze-accent focus:ring-0"
                />
                <Palette className="w-3.5 h-3.5 text-haze-accent" />
                <span>Caixa de Fundo (Highlight)</span>
              </label>

              {bgEnabled && (
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={bgColor}
                    onChange={(e) => setBgColor(e.target.value)}
                    className="w-6 h-6 rounded border border-haze-border-strong bg-transparent cursor-pointer"
                    title="Cor do fundo"
                  />
                  <span className="font-mono text-[11px] text-haze-muted">{Math.round(bgOpacity * 100)}%</span>
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
                className="w-full accent-haze-accent h-1 bg-haze-raised rounded cursor-pointer"
              />
            )}
          </div>

          {/* Largura Máxima, Estilo de Censura e Timestamps */}
          <div className="pt-2 border-t border-haze-border space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-haze-muted">Largura Máx. Chat</span>
              <div className="flex items-center gap-2 w-1/2">
                <input
                  type="range"
                  min="40"
                  max="100"
                  step="5"
                  value={maxWidthPercent}
                  onChange={(e) => setMaxWidthPercent(parseInt(e.target.value))}
                  className="w-full accent-haze-accent h-1 bg-haze-raised rounded cursor-pointer"
                />
                <span className="font-mono text-[11px] text-haze-soft w-8 text-right">{maxWidthPercent}%</span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-haze-muted">Estilo de Censura</span>
              <div className="flex gap-1">
                <button
                  onClick={() => setCensorStyle('mosaic')}
                  className={`px-2 py-1 rounded text-xs font-medium transition-all ${
                    censorStyle === 'mosaic'
                      ? 'bg-haze-accent/20 text-haze-accent border border-haze-accent/40'
                      : 'bg-haze-field text-haze-muted border border-haze-border'
                  }`}
                >
                  Mosaico
                </button>
                <button
                  onClick={() => setCensorStyle('solid')}
                  className={`px-2 py-1 rounded text-xs font-medium transition-all ${
                    censorStyle === 'solid'
                      ? 'bg-haze-accent/20 text-haze-accent border border-haze-accent/40'
                      : 'bg-haze-field text-haze-muted border border-haze-border'
                  }`}
                >
                  Tarja Preta
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 cursor-pointer text-haze-soft">
                <input
                  type="checkbox"
                  checked={showTimestamps}
                  onChange={(e) => setShowTimestamps(e.target.checked)}
                  className="rounded bg-haze-raised border-haze-border-strong text-haze-accent focus:ring-0"
                />
                <EyeOff className="w-3.5 h-3.5 text-haze-muted" />
                <span>Exibir Timestamps [HH:MM:SS]</span>
              </label>
            </div>
          </div>
        </div>
        </EditorSection>

        <EditorSection {...sectionProps('iluminacao')} title="Iluminação" badge={lighting.enabled ? 'ATIVA' : 'desligada'}>
          <LightingPanel lighting={lighting} patchLighting={patchLighting} mouseTool={mouseTool} setMouseTool={setMouseTool} />
        </EditorSection>

        <EditorSection {...sectionProps('camadas')} title="Camadas e overlays" badge={`${layers.length} camada${layers.length === 1 ? '' : 's'}`}>
        <div className="p-4 rounded-2xl bg-haze-panel border border-haze-border shadow-md space-y-3">
          <div className="flex items-center justify-between">
            <span className="section-title text-xs font-semibold uppercase tracking-wider text-haze-text">Camadas &amp; Overlays</span>
            <span className="section-badge text-xs font-mono text-haze-soft">{layers.length} camada{layers.length === 1 ? '' : 's'}</span>
          </div>

          <input
            ref={layerInputRef}
            data-testid="layer-input"
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => { if (e.target.files) addLayerFiles(e.target.files); e.target.value = ''; }}
          />
          <button
            onClick={() => layerInputRef.current?.click()}
            disabled={layers.length >= MAX_LAYERS}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
            onDrop={(e) => { e.preventDefault(); addLayerFiles(e.dataTransfer.files); }}
            className="w-full py-2 rounded-lg border border-dashed border-haze-border hover:border-haze-accent/50 text-xs text-haze-soft disabled:opacity-40"
          >
            + Adicionar camada de imagem
          </button>

          {layers.length === 0 ? (
            <p className="text-xs text-haze-faint leading-relaxed">
              Sobreponha logos, molduras, marcas d'água ou fotos secundárias (PNG com transparência funciona melhor).
              Use a ferramenta Mover camada (3) na barra do preview para arrastá-las; a roda do mouse muda o tamanho. As camadas ficam salvas neste navegador.
            </p>
          ) : (
            <ul className="space-y-1" aria-label="Lista de camadas (a de cima é a última da lista)">
              {[...layers].reverse().map((l) => {
                const selected = l.id === selectedLayerId;
                return (
                  <li
                    key={l.id}
                    className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-xs ${
                      selected ? 'border-haze-accent/60 bg-haze-accent/10' : 'border-haze-border bg-haze-field'
                    }`}
                  >
                    <button
                      onClick={() => updateLayer(l.id, { visible: !l.visible })}
                      aria-label={l.visible ? `Ocultar ${l.name}` : `Mostrar ${l.name}`}
                      title={l.visible ? 'Ocultar' : 'Mostrar'}
                      className="px-1 text-haze-muted hover:text-haze-text"
                    >
                      {l.visible ? '👁' : '—'}
                    </button>
                    <button
                      onClick={() => setSelectedLayerId(selected ? null : l.id)}
                      aria-pressed={selected}
                      className="flex-1 min-w-0 text-left truncate text-haze-text"
                      title={l.name}
                    >
                      {l.name}
                    </button>
                    <button onClick={() => moveLayerOrder(l.id, 1)} aria-label={`Subir ${l.name}`} title="Trazer para frente" className="px-1 text-haze-muted hover:text-haze-text">↑</button>
                    <button onClick={() => moveLayerOrder(l.id, -1)} aria-label={`Descer ${l.name}`} title="Enviar para trás" className="px-1 text-haze-muted hover:text-haze-text">↓</button>
                    <button onClick={() => duplicateLayer(l.id)} aria-label={`Duplicar ${l.name}`} title="Duplicar" className="px-1 text-haze-muted hover:text-haze-text">⧉</button>
                    <button onClick={() => removeLayer(l.id)} aria-label={`Remover ${l.name}`} title="Remover" className="px-1 text-haze-faint hover:text-rose-400">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {(() => {
            const sel = layers.find(l => l.id === selectedLayerId);
            if (!sel) return null;
            return (
              <div className="space-y-2 pt-2 border-t border-haze-border">
                {([
                  ['Tamanho (largura)', Math.round(sel.widthPct), 2, 200, '%', (v: number) => updateLayer(sel.id, { widthPct: v })],
                  ['Rotação', Math.round(sel.rotation), -180, 180, '°', (v: number) => updateLayer(sel.id, { rotation: v })],
                  ['Opacidade', Math.round(sel.opacity * 100), 0, 100, '%', (v: number) => updateLayer(sel.id, { opacity: v / 100 })],
                  ['Posição X', Math.round(sel.cx * 100), 0, 100, '%', (v: number) => updateLayer(sel.id, { cx: v / 100 })],
                  ['Posição Y', Math.round(sel.cy * 100), 0, 100, '%', (v: number) => updateLayer(sel.id, { cy: v / 100 })]
                ] as const).map(([label, value, min, max, unit, onChange]) => (
                  <div key={label}>
                    <div className="flex justify-between text-xs text-haze-muted mb-1">
                      <span>{label}</span>
                      <span className="font-mono text-haze-text">{value}{unit}</span>
                    </div>
                    <input
                      type="range" min={min} max={max} value={value} aria-label={label}
                      onChange={(e) => onChange(parseInt(e.target.value))}
                      className="w-full accent-haze-accent h-1 bg-haze-raised rounded cursor-pointer"
                    />
                  </div>
                ))}
                <label className="flex items-center gap-2 text-xs text-haze-soft cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sel.aboveChat}
                    onChange={(e) => updateLayer(sel.id, { aboveChat: e.target.checked })}
                    className="accent-haze-accent"
                  />
                  Desenhar acima do texto do chat
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    onClick={() => updateLayer(sel.id, { cx: 0.5, cy: 0.5 })}
                    className="py-1.5 rounded-lg border border-haze-border text-xs text-haze-soft hover:border-haze-accent/40"
                  >
                    Centralizar
                  </button>
                  <button
                    onClick={() => updateLayer(sel.id, { widthPct: 100, cx: 0.5, rotation: 0 })}
                    className="py-1.5 rounded-lg border border-haze-border text-xs text-haze-soft hover:border-haze-accent/40"
                  >
                    Ajustar à largura
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
        </EditorSection>

        <EditorSection {...sectionProps('inspetor')} title="Inspetor de propriedades" badge={`${canvasLayers.length} elemento${canvasLayers.length === 1 ? '' : 's'}`}>
          <CanvasLayersSidebar part="inspector" {...sidebarProps} />
        </EditorSection>

        <EditorSection {...sectionProps('salvar')} title="Salvar e exportar">
          <div className="p-4 rounded-2xl bg-haze-panel border border-haze-border shadow-md space-y-2.5">
            {isGif && (
              <button
                type="button"
                onClick={exportGifFromChatLog}
                disabled={isExportingGif}
                className="w-full py-2.5 px-3 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white flex items-center justify-center gap-2 shadow-lg shadow-purple-500/25 transition-all disabled:opacity-50"
              >
                <Film className="w-4 h-4" /> {isExportingGif ? `Gerando GIF animado (${gifExportProgress}%)...` : 'Baixar GIF Animado Editado'}
              </button>
            )}
            <button
              type="button"
              onClick={exportImage}
              className="w-full py-2.5 px-3 rounded-xl text-xs font-bold bg-haze-accent-fill hover:bg-haze-accent-fill-hover text-haze-on-accent flex items-center justify-center gap-2 shadow-lg shadow-haze-accent/20 transition-all"
            >
              <Download className="w-4 h-4" /> Baixar imagem (PNG)
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={copyImage}
                title="Copia a imagem para a área de transferência (Ctrl+C)"
                className="py-2 px-2.5 rounded-lg text-xs border border-haze-border text-haze-soft hover:border-haze-accent/40 bg-haze-field hover:bg-haze-raised transition-colors flex items-center justify-center gap-1.5"
              >
                <Copy className="w-3.5 h-3.5" /> Copiar imagem
              </button>
              <button
                type="button"
                onClick={exportChatOnly}
                title="Baixa só o texto do chat, com fundo transparente (para editar no Photopea)"
                className="py-2 px-2.5 rounded-lg text-xs border border-haze-border text-haze-soft hover:border-haze-accent/40 bg-haze-field hover:bg-haze-raised transition-colors flex items-center justify-center gap-1.5"
              >
                <Layers className="w-3.5 h-3.5" /> Só o chat (PNG)
              </button>
            </div>
            <button
              type="button"
              onClick={exportProject}
              title="Salva a cena inteira (foto, camadas, chat, ajustes) num arquivo .haze editável"
              className="w-full py-1.5 rounded-lg text-xs font-semibold border border-haze-accent/40 text-haze-accent hover:bg-haze-accent/10 transition-colors flex items-center justify-center gap-1.5"
            >
              💾 Salvar projeto (.haze)
            </button>
          </div>
        </EditorSection>
        </div>

      </div>

      {/* Coluna da Direita: Preview Interativo Canvas (8 cols) */}
      <div className={`${focusMode ? 'lg:col-span-12' : 'lg:col-span-8 xl:col-span-9'} flex flex-col gap-4 min-w-0 lg:sticky lg:top-4 order-first lg:order-none`}>

        {/* Barra Superior do Canvas */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-haze-panel border border-haze-border">
          <div className="flex flex-col gap-1.5 min-w-0">
            <div role="toolbar" aria-label="Ferramenta do mouse" className="flex flex-wrap items-center gap-1">
              <span className="text-[11px] uppercase tracking-wider text-haze-faint mr-1">Mouse</span>
              {([
                ['chat', 'Texto chat', '1', 'Arrastar move o chat; clicar num adesivo ou camada move o elemento (Alt = mover o chat por cima)', Type],
                ['photo', 'Enquadrar foto', '2', 'Arrastar desloca a foto; a roda dá zoom', Crop],
                ['layer', 'Mover camada', '3', 'Arrastar move a camada; a roda muda o tamanho', MousePointer2],
                ['light', 'Posicionar luz', '4', 'Arrastar move a luz (ative a iluminação)', Lightbulb],
                ['censor', 'Censurar Imagem', '5', 'Tarja preta, mosaico ou blur sobre a foto ou composição final', EyeOff]
              ] as const).map(([key, label, hotkey, tip, Icon]) => (
                <button
                  key={key}
                  onClick={() => setMouseTool(key)}
                  aria-pressed={mouseTool === key}
                  title={`${tip} (${hotkey})`}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs transition-colors ${
                    mouseTool === key
                      ? 'bg-haze-accent-fill text-haze-on-accent border-haze-accent font-semibold'
                      : 'border-haze-border text-haze-soft hover:border-haze-border-strong hover:text-haze-text'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" aria-hidden />
                  {label}
                </button>
              ))}
            </div>
            <span className="text-xs text-haze-faint flex items-center gap-1.5">
              <Move className="w-3.5 h-3.5 text-haze-accent shrink-0" />
              {mouseTool === 'chat' && 'Arraste para posicionar o chat · clique num adesivo ou camada para movê-lo (Alt = chat por cima)'}
              {mouseTool === 'photo' && (
                <>
                  Arraste para enquadrar a foto · roda do mouse = zoom
                  <button type="button" onClick={resetFraming} className="ml-2 underline underline-offset-2 hover:text-haze-accent-hover">Centralizar foto</button>
                </>
              )}
              {mouseTool === 'layer' && (layers.length ? 'Clique numa camada para selecionar e arrastar · roda = tamanho' : 'Adicione uma camada no painel à esquerda')}
              {mouseTool === 'light' && (lighting.enabled ? 'Arraste para posicionar a luz' : 'Ative a iluminação no painel para usar esta ferramenta')}
              {mouseTool === 'censor' && (
                <>
                  <span>
                    Arraste no canvas para censurar com {censorShape === 'brush' ? 'pincel' : 'retângulo'} ({censorType === 'solid' ? 'tarja sólida' : censorType === 'mosaic' ? 'mosaico' : 'blur'}) · Alcance: {censorScope === 'final' ? 'composição final (top-level)' : 'apenas foto de fundo'}
                  </span>
                  {censorRegions.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setCensorRegions(prev => prev.slice(0, -1))}
                      className="ml-2 underline underline-offset-2 hover:text-haze-accent-hover"
                    >
                      Desfazer última censura
                    </button>
                  )}
                </>
              )}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {isGif && (
              <button
                type="button"
                onClick={() => setIsGifPlaying(p => !p)}
                title={isGifPlaying ? "Pausar animação do GIF" : "Reproduzir animação do GIF"}
                className="px-2.5 py-1.5 rounded-lg bg-haze-accent/15 border border-haze-accent/40 text-haze-accent text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                {isGifPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                <span>{isGifPlaying ? "Pausar GIF" : "Play GIF"}</span>
              </button>
            )}
            {isGif && (
              <button
                type="button"
                onClick={exportGifFromChatLog}
                disabled={isExportingGif}
                title="Exporta a cena editada completa como GIF animado"
                className="px-3.5 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-purple-500/20 transition-all disabled:opacity-50 cursor-pointer"
              >
                <Film className="w-4 h-4" /> {isExportingGif ? `Exportando ${gifExportProgress}%` : 'Baixar GIF Editado'}
              </button>
            )}
            <button
              onClick={() => setFocusMode(v => !v)}
              aria-pressed={focusMode}
              title="Modo foco: esconde os controles e amplia o preview (F)"
              className="px-3 py-1.5 rounded-lg bg-haze-raised hover:bg-haze-raised-hover text-haze-soft text-xs transition-colors"
            >
              {focusMode ? '⤡ Mostrar controles' : '⤢ Modo foco'}
            </button>
            <button
              onClick={() => setChatPos({ x: 40, y: 50 })}
              className="px-3 py-1.5 rounded-lg bg-haze-raised hover:bg-haze-raised-hover text-haze-soft text-xs flex items-center gap-1.5 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Reset Posição
            </button>
            <button
              onClick={copyImage}
              title="Copia o PNG 2× para a área de transferência (Ctrl+C)"
              className="px-3 py-1.5 rounded-lg bg-haze-raised hover:bg-haze-raised-hover text-haze-soft text-xs transition-colors"
            >
              ⧉ Copiar imagem
            </button>
            <button
              onClick={exportChatOnly}
              title="Baixa só o texto do chat, com fundo transparente e no tamanho da cena (para editar no Photopea)"
              className="px-3 py-1.5 rounded-lg bg-haze-raised hover:bg-haze-raised-hover text-haze-soft text-xs transition-colors"
            >
              Só o chat (PNG)
            </button>
            <button
              onClick={exportImage}
              className="px-4 py-1.5 rounded-lg bg-haze-accent-fill hover:bg-haze-accent-fill-hover text-haze-on-accent font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-haze-accent/20 transition-all"
            >
              <Download className="w-4 h-4" /> Exportar 2× Ultra HD
            </button>
          </div>
        </div>

        {/* Painel Contextual da Ferramenta de Censura (quando mouseTool === 'censor') */}
        {mouseTool === 'censor' && (
          <div className="p-3 rounded-xl bg-haze-panel border border-haze-accent/40 shadow-md flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1">
                <span className="text-haze-muted font-medium mr-1">Modo:</span>
                <button
                  type="button"
                  onClick={() => setCensorType('solid')}
                  className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                    censorType === 'solid'
                      ? 'bg-haze-accent-fill text-haze-on-accent border-haze-accent font-semibold'
                      : 'border-haze-border text-haze-soft hover:text-haze-text hover:border-haze-border-strong'
                  }`}
                  title="Tarja preta 100% opaca — recomendada para anonimização irreversível de dados sensíveis"
                >
                  🛡️ Tarja Preta
                </button>
                <button
                  type="button"
                  onClick={() => setCensorType('mosaic')}
                  className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                    censorType === 'mosaic'
                      ? 'bg-haze-accent-fill text-haze-on-accent border-haze-accent font-semibold'
                      : 'border-haze-border text-haze-soft hover:text-haze-text hover:border-haze-border-strong'
                  }`}
                >
                  Mosaico
                </button>
                <button
                  type="button"
                  onClick={() => setCensorType('blur')}
                  className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                    censorType === 'blur'
                      ? 'bg-haze-accent-fill text-haze-on-accent border-haze-accent font-semibold'
                      : 'border-haze-border text-haze-soft hover:text-haze-text hover:border-haze-border-strong'
                  }`}
                >
                  Blur
                </button>
              </div>

              <div className="flex items-center gap-1 border-l border-haze-border pl-3">
                <span className="text-haze-muted font-medium mr-1">Formato:</span>
                <button
                  type="button"
                  onClick={() => setCensorShape('brush')}
                  className={`px-2 py-1 rounded text-xs font-medium border transition-colors ${
                    censorShape === 'brush'
                      ? 'bg-haze-accent-fill text-haze-on-accent border-haze-accent font-semibold'
                      : 'border-haze-border text-haze-soft hover:text-haze-text hover:border-haze-border-strong'
                  }`}
                >
                  🖌️ Pincel Livre
                </button>
                <button
                  type="button"
                  onClick={() => setCensorShape('rect')}
                  className={`px-2 py-1 rounded text-xs font-medium border transition-colors ${
                    censorShape === 'rect'
                      ? 'bg-haze-accent-fill text-haze-on-accent border-haze-accent font-semibold'
                      : 'border-haze-border text-haze-soft hover:text-haze-text hover:border-haze-border-strong'
                  }`}
                >
                  ⬛ Retângulo
                </button>
              </div>

              <div className="flex items-center gap-1 border-l border-haze-border pl-3">
                <span className="text-haze-muted font-medium mr-1">Alcance:</span>
                <button
                  type="button"
                  onClick={() => setCensorScope('final')}
                  className={`px-2 py-1 rounded text-xs font-medium border transition-colors ${
                    censorScope === 'final'
                      ? 'bg-haze-accent/20 text-haze-accent border-haze-accent/40 font-semibold'
                      : 'border-haze-border text-haze-soft hover:text-haze-text'
                  }`}
                  title="Cobre toda a imagem final (foto, chatlog, HUD e adesivos) para segurança contra vazamentos"
                >
                  Topo (Composição Final)
                </button>
                <button
                  type="button"
                  onClick={() => setCensorScope('background')}
                  className={`px-2 py-1 rounded text-xs font-medium border transition-colors ${
                    censorScope === 'background'
                      ? 'bg-haze-accent/20 text-haze-accent border-haze-accent/40 font-semibold'
                      : 'border-haze-border text-haze-soft hover:text-haze-text'
                  }`}
                  title="Aplica a censura somente na foto de fundo, mantendo chat e adesivos legíveis por cima"
                >
                  Apenas Foto Fundo
                </button>
              </div>

              {censorShape === 'brush' && (
                <div className="flex items-center gap-1.5 border-l border-haze-border pl-3">
                  <span className="text-haze-muted">Raio:</span>
                  <input
                    type="range"
                    min="6"
                    max="60"
                    value={censorBrushRadius}
                    onChange={e => setCensorBrushRadius(parseInt(e.target.value))}
                    className="w-16 accent-haze-accent h-1 bg-haze-raised rounded cursor-pointer"
                  />
                  <span className="font-mono text-[10px] text-haze-soft">{censorBrushRadius}px</span>
                </div>
              )}

              {censorType !== 'solid' && (
                <div className="flex items-center gap-1.5 border-l border-haze-border pl-3">
                  <span className="text-haze-muted">Força:</span>
                  <input
                    type="range"
                    min="4"
                    max="32"
                    value={censorIntensity}
                    onChange={e => setCensorIntensity(parseInt(e.target.value))}
                    className="w-16 accent-haze-accent h-1 bg-haze-raised rounded cursor-pointer"
                  />
                  <span className="font-mono text-[10px] text-haze-soft">{censorIntensity}px</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] text-haze-muted">
                {censorRegions.length} {censorRegions.length === 1 ? 'região' : 'regiões'}
              </span>
              {censorRegions.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => setCensorRegions(prev => prev.slice(0, -1))}
                    className="px-2.5 py-1 text-xs text-haze-soft hover:text-haze-text rounded border border-haze-border hover:bg-haze-raised transition-colors"
                    title="Desfazer última censura (ou Ctrl+Z)"
                  >
                    Desfazer
                  </button>
                  <button
                    type="button"
                    onClick={() => setCensorRegions([])}
                    className="px-2.5 py-1 text-xs text-rose-400 hover:text-rose-300 rounded border border-rose-500/30 hover:bg-rose-500/10 transition-colors"
                    title="Limpar todas as censuras"
                  >
                    Limpar Tudo
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Viewport do Canvas com Drag & Drop */}
        <div
          ref={viewportRef}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`relative rounded-2xl overflow-hidden bg-haze-stage border transition-colors flex items-center justify-center p-2 h-[60vh] lg:h-[calc(100vh-9.5rem)] min-h-[360px] shadow-2xl ${
            isDraggingFile ? 'border-haze-accent ring-2 ring-haze-accent/30' : 'border-haze-border'
          }`}
        >
          <canvas
            ref={previewCanvasRef}
            data-testid="preview-canvas"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            tabIndex={0}
            aria-label="Preview do chat log. Setas movem o texto, Shift acelera."
            style={{
              touchAction: 'none',
              // Ajusta à área disponível (reduz ou amplia até 2×) mantendo a proporção
              ...(viewSize.w > 0 ? (() => {
                const k = Math.min((viewSize.w - 16) / canvasDims.width, (viewSize.h - 16) / canvasDims.height, 2);
                return { width: Math.max(1, Math.floor(canvasDims.width * k)), height: Math.max(1, Math.floor(canvasDims.height * k)) };
              })() : {})
            }}
            className={`rounded-lg shadow-lg ${mouseTool === 'light' || mouseTool === 'censor' ? 'cursor-crosshair' : mouseTool === 'photo' ? 'cursor-move' : mouseTool === 'layer' ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'}`}
          />

          {!imageSrc && canvasLayers.length === 0 && layers.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none p-6 text-center">
              <div className="p-4 rounded-full bg-haze-accent/10 border border-haze-accent/20 text-haze-accent mb-3">
                <Sparkles className="w-8 h-8" />
              </div>
              <h3 className="text-sm font-bold text-white mb-1">
                Visualização Interativa de Chat Log &amp; Retoque
              </h3>
              <p className="text-xs text-haze-muted max-w-sm">
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
