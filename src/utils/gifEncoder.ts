/**
 * Client-Side GIF Encoder (Algoritmo NeuQuant / GIF89a otimizado para o navegador)
 * Permite converter frames de vídeo capturados via Canvas diretamente em arquivo .gif sem backend.
 */

// NeuQuant Neural-Net Quantization Algorithm
class NeuQuant {
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
    // Quantização simplificada de cores para paleta de 256 cores
    const map = new Uint8Array(256 * 3);
    const step = Math.max(1, Math.floor(this.pixels.length / (256 * 4)));
    
    let colorIdx = 0;
    for (let i = 0; i < this.pixels.length && colorIdx < 256; i += step * 4) {
      map[colorIdx * 3] = this.pixels[i];     // R
      map[colorIdx * 3 + 1] = this.pixels[i + 1]; // G
      map[colorIdx * 3 + 2] = this.pixels[i + 2]; // B
      colorIdx++;
    }

    // Preenche cores restantes se houver menos de 256 cores na imagem
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

export class SimpleGifEncoder {
  private width: number;
  private height: number;
  private delay: number; // in centiseconds (1/100 s)
  private output: number[] = [];

  constructor(width: number, height: number, delayMs: number = 100) {
    this.width = width;
    this.height = height;
    this.delay = Math.round(delayMs / 10);
  }

  public start(): void {
    this.output = [];
    this.writeHeader();
  }

  private writeHeader(): void {
    // Header GIF89a
    const header = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61];
    this.output.push(...header);

    // Logical Screen Descriptor
    this.writeShort(this.width);
    this.writeShort(this.height);
    this.output.push(0x70); // 7 = 8-bit color resolution, no global color table
    this.output.push(0x00); // Background color index
    this.output.push(0x00); // Pixel aspect ratio

    // Netscape Application Block for Infinite Looping
    this.output.push(0x21, 0xff, 0x0b);
    const appStr = "NETSCAPE2.0";
    for (let i = 0; i < appStr.length; i++) this.output.push(appStr.charCodeAt(i));
    this.output.push(0x03, 0x01, 0x00, 0x00, 0x00);
  }

  public addFrame(ctx: CanvasRenderingContext2D): void {
    const imgData = ctx.getImageData(0, 0, this.width, this.height);
    const pixels = imgData.data;

    // Gerador de Paleta
    const nq = new NeuQuant(pixels, 10);
    const colormap = nq.buildColormap();

    // Graphic Control Extension (delay time, disposal)
    this.output.push(0x21, 0xf9, 0x04);
    this.output.push(0x00); // reserved
    this.writeShort(this.delay);
    this.output.push(0x00); // transparent color index
    this.output.push(0x00); // block terminator

    // Image Descriptor
    this.output.push(0x2c);
    this.writeShort(0); // Left
    this.writeShort(0); // Top
    this.writeShort(this.width);
    this.writeShort(this.height);
    this.output.push(0x87); // Local Color Table flag (1) + 256 colors (7)

    // Write Local Colormap (256 * 3 bytes)
    for (let i = 0; i < colormap.length; i++) {
      this.output.push(colormap[i]);
    }

    // Map pixels to color indices
    const indexedPixels = new Uint8Array(this.width * this.height);
    for (let i = 0, p = 0; i < pixels.length; i += 4, p++) {
      indexedPixels[p] = nq.lookup(pixels[i], pixels[i + 1], pixels[i + 2], colormap);
    }

    // LZW Compression
    this.writeLZW(indexedPixels, 8);
  }

  private writeShort(val: number): void {
    this.output.push(val & 0xff);
    this.output.push((val >> 8) & 0xff);
  }

  private writeLZW(pixels: Uint8Array, minCodeSize: number): void {
    this.output.push(minCodeSize);
    
    // Sub-blocks chunker
    const clearCode = 1 << minCodeSize;
    const eoiCode = clearCode + 1;

    let curCodeSize = minCodeSize + 1;
    let nextCode = clearCode + 2;

    const buffer: number[] = [];
    let curBits = 0;
    let curAccum = 0;

    const emitBits = (code: number, bits: number) => {
      curAccum |= code << curBits;
      curBits += bits;
      while (curBits >= 8) {
        buffer.push(curAccum & 0xff);
        curAccum >>= 8;
        curBits -= 8;
      }
    };

    emitBits(clearCode, curCodeSize);

    // Dicionário LZW simplificado
    const prefixTable: number[] = new Array(4096).fill(-1);
    const charTable: number[] = new Array(4096).fill(-1);
    const codeTable: number[] = new Array(4096).fill(-1);
    let tableSize = 0;

    let prefix = pixels[0];

    for (let i = 1; i < pixels.length; i++) {
      const c = pixels[i];
      let found = -1;

      for (let j = 0; j < tableSize; j++) {
        if (prefixTable[j] === prefix && charTable[j] === c) {
          found = codeTable[j];
          break;
        }
      }

      if (found !== -1) {
        prefix = found;
      } else {
        emitBits(prefix, curCodeSize);

        if (nextCode < 4096) {
          prefixTable[tableSize] = prefix;
          charTable[tableSize] = c;
          codeTable[tableSize] = nextCode++;
          tableSize++;

          if (nextCode > (1 << curCodeSize) && curCodeSize < 12) {
            curCodeSize++;
          }
        } else {
          // Clear dictionary when full
          emitBits(clearCode, curCodeSize);
          curCodeSize = minCodeSize + 1;
          nextCode = clearCode + 2;
          tableSize = 0;
        }
        prefix = c;
      }
    }

    emitBits(prefix, curCodeSize);
    emitBits(eoiCode, curCodeSize);

    if (curBits > 0) {
      buffer.push(curAccum & 0xff);
    }

    // Write bytes in 255-byte sub-blocks
    let idx = 0;
    while (idx < buffer.length) {
      const chunkSize = Math.min(255, buffer.length - idx);
      this.output.push(chunkSize);
      for (let k = 0; k < chunkSize; k++) {
        this.output.push(buffer[idx + k]);
      }
      idx += chunkSize;
    }

    this.output.push(0x00); // Block Terminator
  }

  public finish(): Blob {
    this.output.push(0x3b); // GIF Trailer
    return new Blob([new Uint8Array(this.output)], { type: 'image/gif' });
  }
}
