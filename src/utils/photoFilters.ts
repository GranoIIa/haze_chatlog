/**
 * Motor Matemático de Processamento de Imagem para Roleplay
 * Implementa filtros de alta performance direto no Canvas/ImageData:
 * - Brilho, Contraste, Saturação, Temperatura (Color Grading)
 * - Smart Sharpen (Convolução 3x3)
 * - Depth of Field (Simulador de Bokeh / Desfoque Radial)
 * - Cinematic Letterbox (Barras Anamórficas 21:9)
 * - Tarja de Censura / Pixelate
 */

export interface PhotoAdjustments {
  brightness: number; // -100 to 100 (0 default)
  contrast: number;   // -100 to 100 (0 default)
  saturation: number; // -100 to 100 (0 default)
  warmth: number;     // -100 to 100 (0 default: negative = cool, positive = warm)
  sharpen: number;    // 0 to 100 (0 default)
  depthOfField: number; // 0 to 100 (0 default, bokeh nas bordas)
  vignette: number;   // 0 to 100 (0 default, vinheta escura nas bordas)
  grain: number;      // 0 to 100 (0 default, granulação de filme)
  letterbox: boolean; // 21:9 cinematic black bars
  colorPreset: 'none' | 'golden-hour' | 'midnight-neon' | 'grit-crime' | 'vintage-90s';
}

export const DEFAULT_ADJUSTMENTS: PhotoAdjustments = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  warmth: 0,
  sharpen: 0,
  depthOfField: 0,
  vignette: 0,
  grain: 0,
  letterbox: false,
  colorPreset: 'none'
};

export function applyPhotoAdjustments(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  adjustments: PhotoAdjustments
) {
  // 1. Processamento de Pixels (ImageData) para Brilho, Contraste, Saturação, Warmth, Grain e Sharpen
  const hasPixelAdjustments = 
    adjustments.brightness !== 0 ||
    adjustments.contrast !== 0 ||
    adjustments.saturation !== 0 ||
    adjustments.warmth !== 0 ||
    adjustments.colorPreset !== 'none' ||
    adjustments.grain > 0 ||
    adjustments.sharpen > 0;

  if (hasPixelAdjustments) {
    const imgData = ctx.getImageData(0, 0, width, height);
    const d = imgData.data;

    // Fatores matemáticos
    const b = adjustments.brightness * 1.5; // -150 a 150
    const cFactor = (259 * (adjustments.contrast + 255)) / (255 * (259 - adjustments.contrast));
    const sFactor = (adjustments.saturation + 100) / 100;
    const wFactor = adjustments.warmth * 0.5;

    // Presets de Color Grading
    let presetR = 0, presetG = 0, presetB = 0;
    let presetContrast = 1;
    if (adjustments.colorPreset === 'golden-hour') {
      presetR = 25;
      presetG = 12;
      presetB = -10;
    } else if (adjustments.colorPreset === 'midnight-neon') {
      presetR = -15;
      presetG = 5;
      presetB = 25;
    } else if (adjustments.colorPreset === 'grit-crime') {
      presetContrast = 1.25;
      presetR = -5;
      presetG = -5;
      presetB = -5;
    } else if (adjustments.colorPreset === 'vintage-90s') {
      presetR = 20;
      presetG = 15;
      presetB = -15;
    }

    const hasGrain = adjustments.grain > 0;
    const grainFactor = (adjustments.grain / 100) * 35;

    for (let i = 0; i < d.length; i += 4) {
      let r = d[i];
      let g = d[i + 1];
      let bVal = d[i + 2];

      // Brightness
      r += b;
      g += b;
      bVal += b;

      // Contrast
      r = cFactor * (r - 128) + 128;
      g = cFactor * (g - 128) + 128;
      bVal = cFactor * (bVal - 128) + 128;

      // Warmth (Temperatura de cor)
      r += wFactor;
      bVal -= wFactor;

      // Color Preset offsets
      r = (r + presetR) * presetContrast;
      g = (g + presetG) * presetContrast;
      bVal = (bVal + presetB) * presetContrast;

      // Saturation (Rec. 709 Luminance)
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * bVal;
      let finalR = lum + (r - lum) * sFactor;
      let finalG = lum + (g - lum) * sFactor;
      let finalB = lum + (bVal - lum) * sFactor;

      if (adjustments.colorPreset === 'grit-crime') {
        // Redução adicional de saturação para ar dramático
        finalR = lum * 0.4 + finalR * 0.6;
        finalG = lum * 0.4 + finalG * 0.6;
        finalB = lum * 0.4 + finalB * 0.6;
      }

      // Procedural Film Grain Noise
      if (hasGrain) {
        const noise = (Math.random() - 0.5) * grainFactor;
        finalR += noise;
        finalG += noise;
        finalB += noise;
      }

      d[i] = Math.max(0, Math.min(255, finalR));
      d[i + 1] = Math.max(0, Math.min(255, finalG));
      d[i + 2] = Math.max(0, Math.min(255, finalB));
    }

    // Smart Sharpen (Convolução Laplaciana com Strides Otimizados)
    if (adjustments.sharpen > 0) {
      const k = (adjustments.sharpen / 100) * 0.4;
      const copy = new Uint8ClampedArray(d);
      const w = width;
      const h = height;

      for (let y = 1; y < h - 1; y++) {
        const rowPrev = (y - 1) * w;
        const rowCurr = y * w;
        const rowNext = (y + 1) * w;

        for (let x = 1; x < w - 1; x++) {
          const idx = (rowCurr + x) << 2;
          const upIdx = (rowPrev + x) << 2;
          const downIdx = (rowNext + x) << 2;
          const leftIdx = (rowCurr + x - 1) << 2;
          const rightIdx = (rowCurr + x + 1) << 2;

          for (let c = 0; c < 3; c++) {
            const center = copy[idx + c];
            const laplacian = center * 4 - copy[upIdx + c] - copy[downIdx + c] - copy[leftIdx + c] - copy[rightIdx + c];
            d[idx + c] = Math.max(0, Math.min(255, center + laplacian * k));
          }
        }
      }
    }

    ctx.putImageData(imgData, 0, 0);
  }

  // 2. Simulador de Depth of Field (Desfoque de Fundo / Bokeh Suave)
  if (adjustments.depthOfField > 0) {
    ctx.save();
    const blurIntensity = Math.round((adjustments.depthOfField / 100) * 8);

    // Duplica o canvas em baixa resolução com desfoque nas bordas
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tCtx = tempCanvas.getContext('2d');
    if (tCtx) {
      tCtx.filter = `blur(${blurIntensity}px)`;
      tCtx.drawImage(ctx.canvas, 0, 0);

      // Máscara radial: Centro nítido, bordas desfocadas
      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = width;
      maskCanvas.height = height;
      const mCtx = maskCanvas.getContext('2d');
      if (mCtx) {
        const radGrad = mCtx.createRadialGradient(
          width / 2, height / 2, width * 0.2,
          width / 2, height / 2, width * 0.65
        );
        radGrad.addColorStop(0, 'rgba(0,0,0,0)');
        radGrad.addColorStop(1, 'rgba(0,0,0,1)');
        mCtx.fillStyle = radGrad;
        mCtx.fillRect(0, 0, width, height);

        tCtx.globalCompositeOperation = 'destination-in';
        tCtx.drawImage(maskCanvas, 0, 0);

        ctx.drawImage(tempCanvas, 0, 0);
      }
    }
    ctx.restore();
  }

  // 3. Radial Vignette (Vinheta de Borda)
  if (adjustments.vignette > 0) {
    ctx.save();
    const cx = width / 2;
    const cy = height / 2;
    const r1 = Math.min(width, height) * 0.35;
    const r2 = Math.hypot(width, height) / 2;
    const grad = ctx.createRadialGradient(cx, cy, r1, cx, cy, r2);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    grad.addColorStop(1, `rgba(0, 0, 0, ${(adjustments.vignette / 100) * 0.85})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  // 4. Cinematic Letterbox (Barras Anamórficas 21:9)
  if (adjustments.letterbox) {
    ctx.save();
    const barHeight = Math.round(height * 0.12);
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, barHeight); // Top Bar
    ctx.fillRect(0, height - barHeight, width, barHeight); // Bottom Bar
    ctx.restore();
  }
}
