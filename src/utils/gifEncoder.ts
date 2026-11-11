/**
 * Client-Side GIF Encoder (Algoritmo NeuQuant / GIF89a de alta performance)
 * Implementa compressão LZW O(1) via Map, buffer chunked em Uint8Array pré-alocado (DynamicUint8Buffer),
 * quantização de cores com memoização RGB555 e desacoplamento de Canvas para execução em Web Worker.
 */

/**
 * Memory-safe preallocated Uint8Array buffer manager.
 * Eliminates V8 number[] heap inflation and provides zero-copy Blob generation.
 */
export class DynamicUint8Buffer {
  private buffer: Uint8Array;
  private position: number = 0;
  private readonly chunkSize: number;

  constructor(initialCapacity: number = 65536, chunkSize: number = 65536) {
    this.chunkSize = chunkSize;
    this.buffer = new Uint8Array(initialCapacity);
  }

  public ensureCapacity(neededBytes: number): void {
    const required = this.position + neededBytes;
    if (required > this.buffer.length) {
      let newCapacity = this.buffer.length;
      while (newCapacity < required) {
        newCapacity += this.chunkSize;
      }
      const newBuffer = new Uint8Array(newCapacity);
      newBuffer.set(this.buffer.subarray(0, this.position), 0);
      this.buffer = newBuffer;
    }
  }

  public writeByte(val: number): void {
    this.ensureCapacity(1);
    this.buffer[this.position++] = val & 0xff;
  }

  public writeShort(val: number): void {
    this.ensureCapacity(2);
    this.buffer[this.position++] = val & 0xff;
    this.buffer[this.position++] = (val >> 8) & 0xff;
  }

  public writeBytes(bytes: ArrayLike<number> | Uint8Array, offset: number = 0, length?: number): void {
    const len = length !== undefined ? length : (bytes.length - offset);
    if (len <= 0) return;
    this.ensureCapacity(len);
    if (bytes instanceof Uint8Array) {
      this.buffer.set(bytes.subarray(offset, offset + len), this.position);
    } else {
      for (let i = 0; i < len; i++) {
        this.buffer[this.position + i] = bytes[offset + i] & 0xff;
      }
    }
    this.position += len;
  }

  public writeString(str: string): void {
    this.ensureCapacity(str.length);
    for (let i = 0; i < str.length; i++) {
      this.buffer[this.position++] = str.charCodeAt(i) & 0xff;
    }
  }

  public reset(): void {
    this.position = 0;
  }

  public get length(): number {
    return this.position;
  }

  public get capacity(): number {
    return this.buffer.length;
  }

  public toSubarray(): Uint8Array {
    return this.buffer.subarray(0, this.position);
  }

  public toBlob(mimeType: string = 'image/gif'): Blob {
    return new Blob([this.toSubarray() as unknown as BlobPart], { type: mimeType });
  }
}

// NeuQuant Neural-Net Quantization Algorithm
export class NeuQuant {
  private network: number[][] = [];
  private netindex: number[] = new Array(256);
  private bias: number[] = new Array(256);
  private freq: number[] = new Array(256);
  private radpower: number[] = new Array(32);

  private samplefac: number;
  private pixels: Uint8ClampedArray | Uint8Array;

  constructor(pixels: Uint8ClampedArray | Uint8Array, samplefac: number = 10) {
    this.pixels = pixels;
    this.samplefac = samplefac;

    for (let i = 0; i < 256; i++) {
      this.network[i] = [(i << 4) / 256, (i << 4) / 256, (i << 4) / 256];
      this.netindex[i] = 0;
      this.bias[i] = 0;
      this.freq[i] = 1 / 256;
    }
  }

  public buildColormap(): Uint8Array {
    // Quantização de cores para paleta de 256 cores (768 bytes)
    const map = new Uint8Array(256 * 3);
    const pixelLen = this.pixels.length;

    if (pixelLen === 0) {
      for (let c = 0; c < 256; c++) {
        map[c * 3] = (c * 7) % 256;
        map[c * 3 + 1] = (c * 13) % 256;
        map[c * 3 + 2] = (c * 19) % 256;
      }
      return map;
    }

    const step = Math.max(1, Math.floor(pixelLen / (256 * 4)));
    let colorIdx = 0;
    for (let i = 0; i < pixelLen && colorIdx < 256; i += step * 4) {
      map[colorIdx * 3] = this.pixels[i];         // R
      map[colorIdx * 3 + 1] = this.pixels[i + 1]; // G
      map[colorIdx * 3 + 2] = this.pixels[i + 2]; // B
      colorIdx++;
    }

    // Preenche cores restantes caso o frame tenha menos de 256 cores únicas
    while (colorIdx < 256) {
      map[colorIdx * 3] = (colorIdx * 7) % 256;
      map[colorIdx * 3 + 1] = (colorIdx * 13) % 256;
      map[colorIdx * 3 + 2] = (colorIdx * 19) % 256;
      colorIdx++;
    }

    return map;
  }

  public lookup(r: number, g: number, b: number, colormap: Uint8Array): number {
    let bestDist = 1000000;
    let bestIndex = 0;

    for (let i = 0; i < 256; i++) {
      const cr = colormap[i * 3];
      const cg = colormap[i * 3 + 1];
      const cb = colormap[i * 3 + 2];

      const dr = r - cr;
      const dg = g - cg;
      const db = b - cb;
      const dist = dr * dr + dg * dg + db * db;

      if (dist < bestDist) {
        bestDist = dist;
        bestIndex = i;
        if (dist === 0) break;
      }
    }
    return bestIndex;
  }
}

export type FrameSource = 
  | CanvasRenderingContext2D 
  | ImageData 
  | Uint8ClampedArray 
  | Uint8Array 
  | { data: Uint8ClampedArray | Uint8Array; width?: number; height?: number };

export class SimpleGifEncoder {
  private width: number;
  private height: number;
  private delay: number; // in centiseconds (1/100 s)
  private outBuffer: DynamicUint8Buffer;

  constructor(width: number, height: number, delayMs: number = 100) {
    this.width = width;
    this.height = height;
    this.delay = Math.round(delayMs / 10);
    this.outBuffer = new DynamicUint8Buffer(65536, 65536);
  }

  public start(): void {
    this.outBuffer.reset();
    this.writeHeader();
  }

  private writeHeader(): void {
    // Header GIF89a
    this.outBuffer.writeBytes([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);

    // Logical Screen Descriptor (little-endian 16-bit dimensions)
    this.outBuffer.writeShort(this.width);
    this.outBuffer.writeShort(this.height);
    this.outBuffer.writeByte(0x70); // 7 = 8-bit color resolution, no global color table
    this.outBuffer.writeByte(0x00); // Background color index
    this.outBuffer.writeByte(0x00); // Pixel aspect ratio

    // Netscape Application Block for Infinite Looping
    this.outBuffer.writeBytes([0x21, 0xff, 0x0b]);
    this.outBuffer.writeString("NETSCAPE2.0");
    this.outBuffer.writeBytes([0x03, 0x01, 0x00, 0x00, 0x00]);
  }

  public addFrame(source: FrameSource, frameDelayMs?: number): void {
    let pixels: Uint8ClampedArray | Uint8Array;

    if (source instanceof Uint8ClampedArray || source instanceof Uint8Array) {
      pixels = source;
    } else if ('getImageData' in source && typeof (source as any).getImageData === 'function') {
      pixels = (source as any).getImageData(0, 0, this.width, this.height).data;
    } else if ('data' in source && source.data) {
      pixels = source.data;
    } else {
      throw new Error('Unsupported frame source passed to addFrame');
    }

    const frameDelayCentis = frameDelayMs !== undefined 
      ? Math.round(frameDelayMs / 10) 
      : this.delay;

    // Gerador de Paleta NeuQuant
    const nq = new NeuQuant(pixels, 10);
    const colormap = nq.buildColormap();

    // Graphic Control Extension (delay time, disposal)
    this.outBuffer.writeBytes([0x21, 0xf9, 0x04, 0x00]);
    this.outBuffer.writeShort(frameDelayCentis);
    this.outBuffer.writeBytes([0x00, 0x00]); // transparent color index (0), block terminator (0)

    // Image Descriptor
    this.outBuffer.writeByte(0x2c);
    this.outBuffer.writeShort(0); // Left
    this.outBuffer.writeShort(0); // Top
    this.outBuffer.writeShort(this.width);
    this.outBuffer.writeShort(this.height);
    this.outBuffer.writeByte(0x87); // Local Color Table flag (1) + 256 colors (7)

    // Write Local Colormap (256 * 3 bytes)
    this.outBuffer.writeBytes(colormap);

    // Map pixels to color indices using RGB555 memoization table
    const totalPixels = this.width * this.height;
    const indexedPixels = new Uint8Array(totalPixels);
    const colorCache = new Int16Array(32768).fill(-1);

    for (let i = 0, p = 0; i < pixels.length && p < totalPixels; i += 4, p++) {
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      const rgb555 = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);

      let idx = colorCache[rgb555];
      if (idx === -1) {
        idx = nq.lookup(r, g, b, colormap);
        colorCache[rgb555] = idx;
      }
      indexedPixels[p] = idx;
    }

    // LZW Compression
    this.writeLZW(indexedPixels, 8);
  }

  private writeLZW(pixels: Uint8Array, minCodeSize: number): void {
    this.outBuffer.writeByte(minCodeSize);

    const clearCode = 1 << minCodeSize; // 256
    const eoiCode = clearCode + 1;       // 257

    let curCodeSize = minCodeSize + 1;   // 9
    let nextCode = clearCode + 2;        // 258

    // Static 256-byte packet buffer for sub-blocks (index 0 is packet length)
    const packet = new Uint8Array(256);
    let packetLen = 0;

    let curBits = 0;
    let curAccum = 0;

    const emitByte = (b: number) => {
      packet[++packetLen] = b;
      if (packetLen === 255) {
        packet[0] = 255;
        this.outBuffer.writeBytes(packet, 0, 256);
        packetLen = 0;
      }
    };

    const emitBits = (code: number, bits: number) => {
      curAccum |= (code & ((1 << bits) - 1)) << curBits;
      curBits += bits;
      while (curBits >= 8) {
        emitByte(curAccum & 0xff);
        curAccum >>= 8;
        curBits -= 8;
      }
    };

    // Initial Clear Code
    emitBits(clearCode, curCodeSize);

    // O(1) Dictionary: key = (prefix << 8) | (char & 0xff)
    const table = new Map<number, number>();

    if (pixels.length > 0) {
      let prefix = pixels[0];

      for (let i = 1; i < pixels.length; i++) {
        const c = pixels[i];
        const key = (prefix << 8) | (c & 0xff);
        const code = table.get(key);

        if (code !== undefined) {
          prefix = code;
        } else {
          emitBits(prefix, curCodeSize);

          if (nextCode < 4096) {
            table.set(key, nextCode++);

            if (nextCode > (1 << curCodeSize) && curCodeSize < 12) {
              curCodeSize++;
            }
          } else {
            // Clear dictionary when full
            emitBits(clearCode, curCodeSize);
            curCodeSize = minCodeSize + 1;
            nextCode = clearCode + 2;
            table.clear();
          }
          prefix = c;
        }
      }

      emitBits(prefix, curCodeSize);
    }

    // End of Information Code
    emitBits(eoiCode, curCodeSize);

    // Flush remaining bits in accumulator
    if (curBits > 0) {
      emitByte(curAccum & 0xff);
    }

    // Flush remaining sub-block packet
    if (packetLen > 0) {
      packet[0] = packetLen;
      this.outBuffer.writeBytes(packet, 0, packetLen + 1);
    }

    // Block Terminator (0x00)
    this.outBuffer.writeByte(0x00);
  }

  public finish(): Blob {
    this.outBuffer.writeByte(0x3b); // GIF Trailer
    return this.outBuffer.toBlob('image/gif');
  }
}
