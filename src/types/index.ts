export type ActiveTab = 'chatlog' | 'canvas' | 'giflab';

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

export interface ParsedLine {
  type: 'me' | 'ame' | 'white' | 'yellow' | 'green' | 'blue' | 'system' | 'ooc' | 'grey' | 'darkgrey' | 'empty';
  rawText: string;
  segments: ChatLineSegment[];
  speaker?: string;
  colorOverride?: string;
}

// Canvas Layers System (Canva Clone)
export type LayerType = 'image' | 'text' | 'shape' | 'sticker' | 'preset';

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
  locked: boolean;
  
  // Custom properties based on type
  content?: string; // Text content or image src or sticker id
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string;
  color?: string;
  backgroundColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
  shadow?: {
    color: string;
    blur: number;
    offsetX: number;
    offsetY: number;
  };
  
  // Specific preset data
  presetType?: 'bodycam' | 'weazel' | 'cctv' | 'mugshot';
  presetData?: Record<string, any>;
}

// Video to GIF Settings (Ezgif)
export interface GifExportSettings {
  startTime: number;
  endTime: number;
  fps: number;
  width: number;
  height: number;
  quality: number; // 1 to 30 (lower is better in gifshot)
  speed: number;
  reverse: boolean;
  dither: boolean;
  watermarkText?: string;
}
