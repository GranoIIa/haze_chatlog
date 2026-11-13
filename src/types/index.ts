// 'chatlog' é o Editor RP unificado (Chat Log + elementos de Canvas)
export type ActiveTab = 'chatlog' | 'giflab' | 'video';

export interface Character {
  id: string;
  name: string;
  color: string;
  prefix?: string;
}

export interface ChatLineSegment {
  text: string;
  isCensored?: boolean;
}

export type ChatLineType = 
  | 'me' 
  | 'do' 
  | 'ame' 
  | 'ooc' 
  | 'radio' 
  | 'dep' 
  | 'phone' 
  | 'dispatch'
  | 'white' 
  | 'yellow' 
  | 'green' 
  | 'blue' 
  | 'system' 
  | 'grey' 
  | 'darkgrey' 
  | 'empty';

export interface ParsedLine {
  id?: string;
  rawText: string;
  type: ChatLineType;
  timestamp?: string;
  speaker?: string;
  messageText?: string;
  colorOverride?: string;
  segments: ChatLineSegment[];
}

// Canvas Layers System (Canva Clone)
export type PresetType = 'bodycam' | 'weazel' | 'cctv' | 'mugshot' | 'flir' | 'dashcam';
export type LayerType = 'text' | 'sticker' | 'preset' | 'image' | 'shape';

export interface LayerShadow {
  color: string;
  blur: number;
  offsetX: number;
  offsetY: number;
}

export interface CanvasLayer {
  id: string;
  type: LayerType;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  visible: boolean;
  locked?: boolean;
  /** false = desenhado abaixo do texto do chat (padrão: acima) */
  aboveChat?: boolean;
  blendMode?: GlobalCompositeOperation;
  
  // Text & Content properties
  text?: string;
  content?: string; // Text content, sticker id, or image src (kept for compatibility with older saved layers)
  color?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string;
  backgroundColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
  shadow?: LayerShadow;
  
  // Media / URLs
  stickerUrl?: string;
  imageUrl?: string;

  // Specific preset data
  presetType?: PresetType;
  presetData?: Record<string, any>;
}

// Video to GIF Settings & Presets (Ezgif)
export type DiscordPreset = 'banner' | 'avatar' | 'emoji' | 'custom';

export interface GifExportSettings {
  startTime: number;
  endTime: number;
  fps: number;
  width: number;
  height: number;
  quality: number; // 1 to 30 (NeuQuant sampling / compression quality)
  speed: number;
  reverse?: boolean;
  dither?: boolean;
  preset?: DiscordPreset;
  watermarkText?: string;
}

// Web Worker GIF Pipeline Message Protocol (docs/PROJECT.md § Interface Contracts)
export interface GifEncodeJob {
  type: 'START' | 'ADD_FRAME' | 'FINISH' | 'ABORT';
  width?: number;
  height?: number;
  delay?: number;
  frameData?: ImageData; // Transferable
  /** START: número de cores por quadro (2–256) */
  colors?: number;
  /** START: o worker interrompe se o GIF passar deste tamanho (bytes) */
  maxBytes?: number;
}

export interface GifWorkerMessage {
  type: 'PROGRESS' | 'DONE' | 'ERROR';
  progress?: number;
  blob?: Blob;
  error?: string;
  /** PROGRESS/ERROR: tamanho atual do GIF em bytes */
  bytes?: number;
  /** ERROR: 'OUTPUT_LIMIT' quando o arquivo passou do limite pedido */
  code?: 'OUTPUT_LIMIT';
}

// Censor Regions & Visual Anonymization System
export type CensorType = 'solid' | 'mosaic' | 'blur';
export type CensorShape = 'rect' | 'brush';
export type CensorScope = 'final' | 'background';

export interface CensorPoint {
  x: number;
  y: number;
}

export interface CensorRegion {
  id: string;
  type: CensorType;
  shape: CensorShape;
  scope?: CensorScope; // 'final' (default - cobre tudo) | 'background'
  x: number;
  y: number;
  width: number;
  height: number;
  radius?: number; // Para pincel circular
  points?: CensorPoint[]; // Traço contínuo de pincelada
  intensity?: number; // Bloco do mosaico ou raio do blur (ex: 12)
}
