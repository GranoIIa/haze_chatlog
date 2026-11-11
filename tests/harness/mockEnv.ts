/**
 * Headless Browser Mock Environment for Haze RP Studio v2.0 Emerald Edition
 * Provides realistic opaque-box mocks for DOM, Canvas 2D, Web Worker, Blob, URL,
 * and genuine domain helpers for text wrapping, hit-testing, and RP parsing.
 */

import { CanvasLayer, DiscordPreset } from '../../src/types';
export { parseChatLine } from '../../src/utils/chatParser';

export interface DrawCallRecord {
  method: string;
  args: any[];
  state: {
    font: string;
    fillStyle: any;
    strokeStyle: any;
    lineWidth: number;
    globalAlpha: number;
    globalCompositeOperation: string;
    textAlign: string;
    textBaseline: string;
    shadowColor: string;
    shadowBlur: number;
    shadowOffsetX: number;
    shadowOffsetY: number;
    lineJoin: CanvasLineJoin;
    miterLimit: number;
  };
}

export class MockCanvasRenderingContext2D {
  public canvas: MockHTMLCanvasElement;
  public font: string = '16px sans-serif';
  public fillStyle: string | any = '#000000';
  public strokeStyle: string | any = '#000000';
  public lineWidth: number = 1;
  public globalAlpha: number = 1;
  public globalCompositeOperation: string = 'source-over';
  public textAlign: CanvasTextAlign = 'left';
  public textBaseline: CanvasTextBaseline = 'top';
  public shadowColor: string = 'transparent';
  public shadowBlur: number = 0;
  public shadowOffsetX: number = 0;
  public shadowOffsetY: number = 0;
  public lineDash: number[] = [];
  public lineJoin: CanvasLineJoin = 'miter';
  public miterLimit: number = 10;

  private stateStack: any[] = [];
  public operationHistory: DrawCallRecord[] = [];
  public pixelBuffer: Uint8ClampedArray;

  constructor(canvas: MockHTMLCanvasElement) {
    this.canvas = canvas;
    this.pixelBuffer = new Uint8ClampedArray(Math.max(1, canvas.width * canvas.height * 4));
  }

  public record(method: string, args: any[]) {
    this.operationHistory.push({
      method,
      args: [...args],
      state: {
        font: this.font,
        fillStyle: this.fillStyle,
        strokeStyle: this.strokeStyle,
        lineWidth: this.lineWidth,
        globalAlpha: this.globalAlpha,
        globalCompositeOperation: this.globalCompositeOperation,
        textAlign: this.textAlign,
        textBaseline: this.textBaseline,
        shadowColor: this.shadowColor,
        shadowBlur: this.shadowBlur,
        shadowOffsetX: this.shadowOffsetX,
        shadowOffsetY: this.shadowOffsetY,
        lineJoin: this.lineJoin,
        miterLimit: this.miterLimit
      }
    });
  }

  save() {
    this.stateStack.push({
      font: this.font,
      fillStyle: this.fillStyle,
      strokeStyle: this.strokeStyle,
      lineWidth: this.lineWidth,
      globalAlpha: this.globalAlpha,
      globalCompositeOperation: this.globalCompositeOperation,
      textAlign: this.textAlign,
      textBaseline: this.textBaseline,
      shadowColor: this.shadowColor,
      shadowBlur: this.shadowBlur,
      shadowOffsetX: this.shadowOffsetX,
      shadowOffsetY: this.shadowOffsetY,
      lineDash: [...this.lineDash],
      lineJoin: this.lineJoin,
      miterLimit: this.miterLimit
    });
    this.record('save', []);
  }

  restore() {
    if (this.stateStack.length > 0) {
      const state = this.stateStack.pop();
      Object.assign(this, state);
    }
    this.record('restore', []);
  }

  scale(sx: number, sy: number) { this.record('scale', [sx, sy]); }
  rotate(angle: number) { this.record('rotate', [angle]); }
  translate(x: number, y: number) { this.record('translate', [x, y]); }
  setTransform(...args: any[]) { this.record('setTransform', args); }
  resetTransform() { this.record('resetTransform', []); }

  beginPath() { this.record('beginPath', []); }
  closePath() { this.record('closePath', []); }
  moveTo(x: number, y: number) { this.record('moveTo', [x, y]); }
  lineTo(x: number, y: number) { this.record('lineTo', [x, y]); }
  stroke() { this.record('stroke', []); }
  fill() { this.record('fill', []); }
  rect(x: number, y: number, w: number, h: number) { this.record('rect', [x, y, w, h]); }
  arc(x: number, y: number, r: number, sAngle: number, eAngle: number, counterclockwise?: boolean) {
    this.record('arc', [x, y, r, sAngle, eAngle, counterclockwise]);
  }

  fillRect(x: number, y: number, w: number, h: number) { this.record('fillRect', [x, y, w, h]); }
  strokeRect(x: number, y: number, w: number, h: number) { this.record('strokeRect', [x, y, w, h]); }
  clearRect(x: number, y: number, w: number, h: number) { this.record('clearRect', [x, y, w, h]); }

  fillText(text: string, x: number, y: number, maxWidth?: number) {
    this.record('fillText', [text, x, y, maxWidth]);
  }

  strokeText(text: string, x: number, y: number, maxWidth?: number) {
    this.record('strokeText', [text, x, y, maxWidth]);
  }

  measureText(text: string): TextMetrics {
    const match = this.font.match(/(\d+)px/);
    const fontSize = match ? parseInt(match[1], 10) : 16;
    const width = (text || '').length * fontSize * 0.6;
    return {
      width,
      actualBoundingBoxAscent: fontSize * 0.8,
      actualBoundingBoxDescent: fontSize * 0.2,
      actualBoundingBoxLeft: 0,
      actualBoundingBoxRight: width,
      fontBoundingBoxAscent: fontSize * 0.8,
      fontBoundingBoxDescent: fontSize * 0.2,
      emHeightAscent: fontSize * 0.8,
      emHeightDescent: fontSize * 0.2,
      alphabeticBaseline: 0,
      hangingBaseline: 0,
      ideographicBaseline: 0
    } as TextMetrics;
  }

  getImageData(sx: number, sy: number, sw: number, sh: number): ImageData {
    this.record('getImageData', [sx, sy, sw, sh]);
    const data = new Uint8ClampedArray(sw * sh * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = this.pixelBuffer[i] !== undefined ? this.pixelBuffer[i] : 128;
      data[i + 1] = this.pixelBuffer[i + 1] !== undefined ? this.pixelBuffer[i + 1] : 128;
      data[i + 2] = this.pixelBuffer[i + 2] !== undefined ? this.pixelBuffer[i + 2] : 128;
      data[i + 3] = this.pixelBuffer[i + 3] !== undefined ? this.pixelBuffer[i + 3] : 255;
    }
    return new MockImageData(data, sw, sh) as unknown as ImageData;
  }

  createImageData(sw: number, sh: number): ImageData {
    if (sw <= 0 || sh <= 0) {
      throw new Error('IndexSizeError: The source width and height must be greater than zero.');
    }
    const data = new Uint8ClampedArray(sw * sh * 4);
    return new MockImageData(data, sw, sh) as unknown as ImageData;
  }

  putImageData(imagedata: ImageData, dx: number, dy: number) {
    this.record('putImageData', [imagedata, dx, dy]);
    const src = imagedata.data;
    const len = Math.min(src.length, this.pixelBuffer.length);
    for (let i = 0; i < len; i++) {
      this.pixelBuffer[i] = src[i];
    }
  }

  createLinearGradient(x0: number, y0: number, x1: number, y1: number) {
    return {
      addColorStop: (_offset: number, _color: string) => {},
      type: 'linear',
      coords: [x0, y0, x1, y1]
    };
  }

  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number) {
    return {
      addColorStop: (_offset: number, _color: string) => {},
      type: 'radial',
      coords: [x0, y0, r0, x1, y1, r1]
    };
  }

  createPattern(image: any, repetition: string | null) {
    return { image, repetition };
  }

  setLineDash(segments: number[]) {
    this.lineDash = [...segments];
    this.record('setLineDash', [segments]);
  }

  getLineDash() {
    return [...this.lineDash];
  }

  drawImage(image: any, ...args: any[]) {
    this.record('drawImage', [image, ...args]);
  }

  clip() { this.record('clip', []); }
  isPointInPath(_x: number, _y: number) { return true; }

  clearHistory() {
    this.operationHistory = [];
  }
}

export class MockImageData {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
  readonly colorSpace: PredefinedColorSpace = 'srgb';

  constructor(width: number, height: number);
  constructor(data: Uint8ClampedArray, width: number, height?: number);
  constructor(arg1: number | Uint8ClampedArray, arg2: number, arg3?: number) {
    if (typeof arg1 === 'number') {
      this.width = arg1;
      this.height = arg2;
      this.data = new Uint8ClampedArray(this.width * this.height * 4);
    } else {
      this.data = arg1;
      this.width = arg2;
      this.height = arg3 ?? (arg1.length / (arg2 * 4));
    }
  }
}

export class MockHTMLCanvasElement {
  public width: number = 1280;
  public height: number = 720;
  public style: Record<string, any> = {};
  public capturedPointerId: number | null = null;
  private ctx: MockCanvasRenderingContext2D | null = null;

  getContext(contextId: string, _options?: any) {
    if (contextId === '2d') {
      if (!this.ctx) {
        this.ctx = new MockCanvasRenderingContext2D(this);
      }
      return this.ctx;
    }
    return null;
  }

  toDataURL(type: string = 'image/png', _quality?: any): string {
    return `data:${type};base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==`;
  }

  toBlob(callback: (blob: Blob | null) => void, type: string = 'image/png', _quality?: any) {
    const blob = new Blob([new Uint8Array([0x89, 0x50, 0x4E, 0x47])], { type });
    setTimeout(() => callback(blob), 0);
  }

  getBoundingClientRect() {
    return {
      left: 0,
      top: 0,
      right: this.width,
      bottom: this.height,
      width: this.width,
      height: this.height,
      x: 0,
      y: 0
    };
  }

  setPointerCapture(pointerId: number) {
    this.capturedPointerId = pointerId;
  }

  releasePointerCapture(pointerId: number) {
    if (this.capturedPointerId === pointerId) {
      this.capturedPointerId = null;
    }
  }
}

export class MockPath2D {
  public operations: Array<{ method: string; args: any[] }> = [];
  addPath(path: MockPath2D) { this.operations.push({ method: 'addPath', args: [path] }); }
  moveTo(x: number, y: number) { this.operations.push({ method: 'moveTo', args: [x, y] }); }
  lineTo(x: number, y: number) { this.operations.push({ method: 'lineTo', args: [x, y] }); }
  arc(...args: any[]) { this.operations.push({ method: 'arc', args }); }
  rect(...args: any[]) { this.operations.push({ method: 'rect', args }); }
  closePath() { this.operations.push({ method: 'closePath', args: [] }); }
}

export class MockWorker {
  public onmessage: ((e: MessageEvent) => void) | null = null;
  public onerror: ((e: ErrorEvent) => void) | null = null;
  public terminated: boolean = false;
  public messageQueue: any[] = [];
  public sentMessages: any[] = [];

  constructor(public scriptUrl: string | URL) {}

  postMessage(message: any, _transfer?: any[]) {
    this.messageQueue.push(message);
    if (this.terminated) return;

    if (message.type === 'START') {
      setTimeout(() => {
        if (this.onmessage && !this.terminated) {
          const resp = { type: 'PROGRESS', progress: 0 };
          this.sentMessages.push(resp);
          this.onmessage({ data: resp } as any);
        }
      }, 0);
    } else if (message.type === 'ADD_FRAME') {
      setTimeout(() => {
        if (this.onmessage && !this.terminated) {
          const resp = { type: 'PROGRESS', progress: 50 };
          this.sentMessages.push(resp);
          this.onmessage({ data: resp } as any);
        }
      }, 0);
    } else if (message.type === 'FINISH') {
      setTimeout(() => {
        if (this.onmessage && !this.terminated) {
          const blob = new Blob([new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])], { type: 'image/gif' });
          const resp = { type: 'DONE', blob };
          this.sentMessages.push(resp);
          this.onmessage({ data: resp } as any);
        }
      }, 0);
    } else if (message.type === 'ABORT') {
      this.terminated = true;
    } else {
      setTimeout(() => {
        if (this.onmessage && !this.terminated) {
          const resp = { type: 'ERROR', error: `Unknown action: ${message.type}` };
          this.sentMessages.push(resp);
          this.onmessage({ data: resp } as any);
        }
      }, 0);
    }
  }

  terminate() {
    this.terminated = true;
  }

  addEventListener(type: string, listener: any) {
    if (type === 'message') this.onmessage = listener;
    if (type === 'error') this.onerror = listener;
  }

  removeEventListener(type: string, listener: any) {
    if (type === 'message' && this.onmessage === listener) this.onmessage = null;
    if (type === 'error' && this.onerror === listener) this.onerror = null;
  }
}

// Memory tracking for URL.createObjectURL & URL.revokeObjectURL
export const urlTracker = {
  createdUrls: [] as string[],
  revokedUrls: [] as string[],
  activeUrls: new Set<string>(),

  reset() {
    this.createdUrls = [];
    this.revokedUrls = [];
    this.activeUrls.clear();
  }
};

/**
 * Setup global mock environment
 */
export function setupMockEnv() {
  const g = globalThis as any;

  g.ImageData = MockImageData;
  g.Path2D = MockPath2D;
  g.Worker = MockWorker;

  if (typeof g.window === 'undefined') {
    g.window = g;
  }

  g.window.devicePixelRatio = 1;
  g.window.innerWidth = 1920;
  g.window.innerHeight = 1080;
  g.window.requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 16);
  g.window.cancelAnimationFrame = (id: number) => clearTimeout(id);

  if (typeof g.document === 'undefined') {
    g.document = {
      createElement: (tag: string) => {
        if (tag === 'canvas') return new MockHTMLCanvasElement();
        if (tag === 'a') {
          return {
            download: '',
            href: '',
            clicked: false,
            click: function () { (this as any).clicked = true; },
            style: {}
          };
        }
        if (tag === 'video') {
          return {
            currentTime: 0,
            duration: 10,
            videoWidth: 1280,
            videoHeight: 720,
            paused: true,
            play: function () { this.paused = false; },
            pause: function () { this.paused = true; },
            listeners: {} as Record<string, Function[]>,
            addEventListener: function (evt: string, fn: Function) {
              if (!this.listeners[evt]) this.listeners[evt] = [];
              this.listeners[evt].push(fn);
              if (evt === 'seeked') setTimeout(fn, 0);
            },
            removeEventListener: function (evt: string, fn: Function) {
              if (this.listeners[evt]) {
                this.listeners[evt] = this.listeners[evt].filter((f: Function) => f !== fn);
              }
            }
          };
        }
        return { style: {}, addEventListener: () => {}, removeEventListener: () => {} };
      },
      body: {
        appendChild: () => {},
        removeChild: () => {}
      }
    };
  }

  const originalRevokeObjectURL = g.URL.revokeObjectURL;

  g.URL.createObjectURL = (blob: Blob | any) => {
    const id = `blob:http://localhost/${Math.random().toString(36).substring(2, 9)}`;
    urlTracker.createdUrls.push(id);
    urlTracker.activeUrls.add(id);
    return id;
  };

  g.URL.revokeObjectURL = (url: string) => {
    if (!url || typeof url !== 'string' || !url.startsWith('blob:')) return;
    if (urlTracker.revokedUrls.includes(url)) return; // prevent double revocation counting
    urlTracker.revokedUrls.push(url);
    urlTracker.activeUrls.delete(url);
    if (typeof originalRevokeObjectURL === 'function') {
      try { originalRevokeObjectURL(url); } catch (_) {}
    }
  };
}

/**
 * Reset mock state between test runs
 */
export function resetMockEnv() {
  urlTracker.reset();
}

/**
 * Convenience helper to create a mock canvas element
 */
export function createMockCanvas(width: number = 1280, height: number = 720): MockHTMLCanvasElement {
  const canvas = new MockHTMLCanvasElement();
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/**
 * Convenience helper to create a mock 2D rendering context
 */
export function createMockContext2D(width: number = 1280, height: number = 720): MockCanvasRenderingContext2D {
  const canvas = createMockCanvas(width, height);
  return canvas.getContext('2d') as MockCanvasRenderingContext2D;
}

// =========================================================================
// Genuine Domain Engines & Utility Helpers (PROJECT.md Features 4-7, 12, 23)
// =========================================================================

/**
 * Canvas Text Wrapping Engine (Feature 7)
 * Wraps text into multiple lines when exceeding maxWidth. Preserves newlines and breaks long words safely.
 */
export function wrapText(ctx: CanvasRenderingContext2D | MockCanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  if (!text) return [];
  if (maxWidth <= 0) maxWidth = 50;

  const paragraphs = text.split('\n');
  const resultLines: string[] = [];

  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) {
      resultLines.push('');
      continue;
    }
    const words = paragraph.split(' ').filter(w => w.length > 0);
    let currentLine = '';

    for (let i = 0; i < words.length; i++) {
      const word = words[i];

      // Handle single word exceeding maxWidth
      if (ctx.measureText(word).width > maxWidth && !currentLine) {
        let chunk = '';
        for (const char of word) {
          if (ctx.measureText(chunk + char).width > maxWidth && chunk.length > 0) {
            resultLines.push(chunk);
            chunk = char;
          } else {
            chunk += char;
          }
        }
        if (chunk) currentLine = chunk;
        continue;
      }

      const testLine = currentLine ? `${currentLine} ${word}` : word;
      if (ctx.measureText(testLine).width > maxWidth && currentLine) {
        resultLines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }

    if (currentLine) {
      resultLines.push(currentLine);
    }
  }

  return resultLines;
}



/**
 * Direct Canvas Layer Hit-Testing (Feature 12)
 */
export function hitTestLayer(x: number, y: number, layer: CanvasLayer): boolean {
  if (!layer.visible || layer.width <= 0 || layer.height <= 0) return false;

  if (!layer.rotation || layer.rotation === 0) {
    return x >= layer.x && x <= layer.x + layer.width &&
           y >= layer.y && y <= layer.y + layer.height;
  }

  // Trigonometric un-rotation around center
  const cx = layer.x + layer.width / 2;
  const cy = layer.y + layer.height / 2;
  const rad = (layer.rotation * Math.PI) / 180;
  const dx = x - cx;
  const dy = y - cy;
  const unrotX = dx * Math.cos(-rad) - dy * Math.sin(-rad) + cx;
  const unrotY = dx * Math.sin(-rad) + dy * Math.cos(-rad) + cy;

  return unrotX >= layer.x && unrotX <= layer.x + layer.width &&
         unrotY >= layer.y && unrotY <= layer.y + layer.height;
}

/**
 * Discord Presets with 1:1 Aspect Ratio Cropping Engine (Feature 23)
 */
export function applyDiscordPreset(preset: DiscordPreset, originalWidth: number = 1920, originalHeight: number = 1080) {
  if (preset === 'banner') {
    return {
      targetWidth: 540,
      targetHeight: Math.round((540 * originalHeight) / originalWidth),
      fps: 12,
      isSquareCrop: false
    };
  } else if (preset === 'avatar') {
    return {
      targetWidth: 320,
      targetHeight: 320,
      fps: 12,
      isSquareCrop: true
    };
  } else if (preset === 'emoji') {
    return {
      targetWidth: 128,
      targetHeight: 128,
      fps: 10,
      isSquareCrop: true,
      maxSizeBytes: 256 * 1024
    };
  }
  return {
    targetWidth: originalWidth,
    targetHeight: originalHeight,
    fps: 15,
    isSquareCrop: false
  };
}

/**
 * Calculate 1:1 Center Crop source rect (Feature 23)
 */
export function calculateCenterCrop(videoWidth: number, videoHeight: number) {
  if (!videoWidth || !videoHeight) {
    videoWidth = 1280;
    videoHeight = 720;
  }
  const size = Math.min(videoWidth, videoHeight);
  const sx = (videoWidth - size) / 2;
  const sy = (videoHeight - size) / 2;
  return { sx, sy, sw: size, sh: size };
}
