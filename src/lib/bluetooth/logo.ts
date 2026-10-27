export interface LogoProcessOptions {
  preset: 'small' | 'medium' | 'large';
  scaleMode?: 'fast' | 'hd'; // 'fast' = hardware 2x (m=3, 75% fewer bytes), 'hd' = 1x (m=0)
  threshold: number; // 30 - 230, default 145
  dither: 'threshold' | 'atkinson';
  invert: boolean;
}

export interface ProcessedThermalLogo {
  previewDataUrl: string;
  rasterBase64: string;
  width: number;
  height: number;
  densityPercent: number;
  maxRowDots: number;
  byteLength: number;
}

export const LOGO_SIZE_PRESETS: Record<
  'small' | 'medium' | 'large',
  { maxWidth: number; maxHeight: number; label: string; description: string }
> = {
  small: {
    maxWidth: 144,
    maxHeight: 56,
    label: 'Compacto (144 px)',
    description: 'Ideal para íconos simples y máxima velocidad',
  },
  medium: {
    maxWidth: 176,
    maxHeight: 64,
    label: 'Estándar (176 px)',
    description: 'Tamaño óptimo para NETUM NT-1809 (Recomendado)',
  },
  large: {
    maxWidth: 208,
    maxHeight: 96,
    label: 'Amplio (208 px)',
    description: 'Para logos horizontales con texto',
  },
};

/**
 * Loads an image from a File or DataURL into an HTMLImageElement
 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo cargar la imagen seleccionada.'));
    img.src = src;
  });
}

/**
 * Normalizes an uploaded image File into a trimmed, white-backed DataURL
 * small enough to store in settings for live re-processing.
 */
export async function normalizeLogoSourceFile(file: File): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);

    const maxRefW = 320;
    const maxRefH = 200;
    let w = img.naturalWidth || img.width || 200;
    let h = img.naturalHeight || img.height || 100;

    const scale = Math.min(1, maxRefW / w, maxRefH / h);
    w = Math.max(16, Math.round(w * scale));
    h = Math.max(16, Math.round(h * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No se pudo inicializar el procesador gráfico.');

    // Fill pure white background so transparent PNGs don't turn black
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);

    // Auto-crop excess white margins around the logo
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;
    let minX = w;
    let minY = h;
    let maxX = 0;
    let maxY = 0;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        // Consider non-white if any channel is < 245
        if (r < 245 || g < 245 || b < 245) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (maxX >= minX && maxY >= minY) {
      const pad = 2;
      const cropX = Math.max(0, minX - pad);
      const cropY = Math.max(0, minY - pad);
      const cropW = Math.min(w - cropX, maxX - minX + 1 + pad * 2);
      const cropH = Math.min(h - cropY, maxY - minY + 1 + pad * 2);

      const croppedCanvas = document.createElement('canvas');
      croppedCanvas.width = cropW;
      croppedCanvas.height = cropH;
      const croppedCtx = croppedCanvas.getContext('2d');
      if (croppedCtx) {
        croppedCtx.fillStyle = '#FFFFFF';
        croppedCtx.fillRect(0, 0, cropW, cropH);
        croppedCtx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
        return croppedCanvas.toDataURL('image/png');
      }
    }

    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Processes a source image DataURL into a 1-bit monochrome thermal bitmap.
 * - In 'fast' scaleMode (default), encodes at 1/2 resolution and uses hardware 2x scaling (GS v 0 m=3),
 *   cutting byte payload by 75% (~300-450 bytes total) so the NETUM NT-1809 prints it in a single instant sweep!
 * - Limits simultaneous black dots per row so the printer never triggers thermal speed throttling.
 */
export async function processThermalLogo(
  sourceDataUrl: string,
  options: LogoProcessOptions
): Promise<ProcessedThermalLogo> {
  const img = await loadImage(sourceDataUrl);
  const presetSpec = LOGO_SIZE_PRESETS[options.preset] || LOGO_SIZE_PRESETS.medium;
  const scaleMode = options.scaleMode || 'fast';
  const isFast2x = scaleMode === 'fast';

  const srcW = img.naturalWidth || img.width || 176;
  const srcH = img.naturalHeight || img.height || 64;

  // Target physical dimensions on paper
  const targetMaxW = isFast2x ? Math.floor(presetSpec.maxWidth / 2) : presetSpec.maxWidth;
  const targetMaxH = isFast2x ? Math.floor(presetSpec.maxHeight / 2) : presetSpec.maxHeight;

  const scale = Math.min(targetMaxW / srcW, targetMaxH / srcH, 1.5);
  // Encoded width MUST be a multiple of 8 for ESC/POS GS v 0 byte alignment
  const width = Math.max(16, Math.min(targetMaxW, Math.round((srcW * scale) / 8) * 8));
  const height = Math.max(8, Math.min(targetMaxH, Math.round(srcH * (width / srcW))));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Error al crear contexto de imagen.');

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  const imgData = ctx.getImageData(0, 0, width, height);
  const rgba = imgData.data;

  // 1. Compute grayscale luminance buffer (0 = black, 255 = white)
  const lum = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = rgba[i * 4];
    const g = rgba[i * 4 + 1];
    const b = rgba[i * 4 + 2];
    const a = rgba[i * 4 + 3] / 255;
    const br = r * a + 255 * (1 - a);
    const bg = g * a + 255 * (1 - a);
    const bb = b * a + 255 * (1 - a);
    let gray = 0.299 * br + 0.587 * bg + 0.114 * bb;
    if (options.invert) {
      gray = 255 - gray;
    }
    lum[i] = gray;
  }

  // 2. Binarize to 1-bit (1 = black thermal dot, 0 = white paper)
  const bits = new Uint8Array(width * height);
  const threshold = options.threshold ?? 145;

  if (options.dither === 'atkinson') {
    const work = new Float32Array(lum);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const oldVal = work[idx];
        const isBlack = oldVal < threshold;
        const newVal = isBlack ? 0 : 255;
        bits[idx] = isBlack ? 1 : 0;
        const err = (oldVal - newVal) / 8;

        if (x + 1 < width) work[idx + 1] += err;
        if (x + 2 < width) work[idx + 2] += err;
        if (y + 1 < height) {
          if (x - 1 >= 0) work[(y + 1) * width + (x - 1)] += err;
          work[(y + 1) * width + x] += err;
          if (x + 1 < width) work[(y + 1) * width + (x + 1)] += err;
        }
        if (y + 2 < height) {
          work[(y + 2) * width + x] += err;
        }
      }
    }
  } else {
    for (let i = 0; i < width * height; i++) {
      bits[i] = lum[i] < threshold ? 1 : 0;
    }
  }

  // 3. Anti-Throttling Row Density Limiter (Protección de Velocidad NETUM NT-1809)
  // NETUM NT-1809 automatically slows down its stepper motor when >35% of dots in a row are black.
  // Keeping each row below maxSafeDots ensures the printer stays in High-Speed Stepper Mode!
  const maxSafeDots = isFast2x ? Math.floor(width * 0.42) : Math.floor(width * 0.38);
  const copyBits = new Uint8Array(bits);
  let totalBlackDots = 0;
  let maxRowDots = 0;

  for (let y = 0; y < height; y++) {
    let rowDots = 0;
    for (let x = 0; x < width; x++) {
      if (bits[y * width + x]) rowDots++;
    }

    if (rowDots > maxSafeDots) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        if (bits[idx] === 1) {
          const leftBlack = copyBits[idx - 1] === 1;
          const rightBlack = copyBits[idx + 1] === 1;
          if (leftBlack && rightBlack && (x + y) % 2 === 1) {
            bits[idx] = 0;
            rowDots--;
          }
        }
      }
    }

    if (rowDots > maxSafeDots) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (bits[idx] === 1 && (x + y) % 2 === 1) {
          bits[idx] = 0;
          rowDots--;
          if (rowDots <= maxSafeDots) break;
        }
      }
    }

    totalBlackDots += rowDots;
    if (rowDots > maxRowDots) maxRowDots = rowDots;
  }

  // 4. Trim completely empty white rows at top and bottom so no blank lines are sent
  let firstRow = 0;
  while (firstRow < height - 1) {
    let hasBlack = false;
    for (let x = 0; x < width; x++) {
      if (bits[firstRow * width + x]) {
        hasBlack = true;
        break;
      }
    }
    if (hasBlack) break;
    firstRow++;
  }

  let lastRow = height - 1;
  while (lastRow > firstRow) {
    let hasBlack = false;
    for (let x = 0; x < width; x++) {
      if (bits[lastRow * width + x]) {
        hasBlack = true;
        break;
      }
    }
    if (hasBlack) break;
    lastRow--;
  }

  const trimmedHeight = Math.max(1, lastRow - firstRow + 1);

  // 4b. Find horizontal bounding box of active 1-bit black dots and center them within `width`
  let firstCol = width;
  let lastCol = -1;
  for (let y = firstRow; y <= lastRow; y++) {
    for (let x = 0; x < width; x++) {
      if (bits[y * width + x]) {
        if (x < firstCol) firstCol = x;
        if (x > lastCol) lastCol = x;
      }
    }
  }

  if (lastCol >= firstCol) {
    const contentWidth = lastCol - firstCol + 1;
    const idealStartCol = Math.floor((width - contentWidth) / 2);
    const shiftX = idealStartCol - firstCol;
    if (shiftX !== 0) {
      const shiftedRow = new Uint8Array(width);
      for (let y = firstRow; y <= lastRow; y++) {
        shiftedRow.fill(0);
        for (let x = firstCol; x <= lastCol; x++) {
          const dstX = x + shiftX;
          if (dstX >= 0 && dstX < width) {
            shiftedRow[dstX] = bits[y * width + x];
          }
        }
        for (let x = 0; x < width; x++) {
          bits[y * width + x] = shiftedRow[x];
        }
      }
    }
  }

  // 5. Pack into 1-bit ESC/POS raster bytes (MSB = leftmost pixel)
  const bytesPerRow = width / 8;
  const raster = new Uint8Array(bytesPerRow * trimmedHeight);
  for (let y = 0; y < trimmedHeight; y++) {
    const srcY = firstRow + y;
    for (let byteIdx = 0; byteIdx < bytesPerRow; byteIdx++) {
      let byteVal = 0;
      for (let bit = 0; bit < 8; bit++) {
        const x = byteIdx * 8 + bit;
        if (bits[srcY * width + x]) {
          byteVal |= 1 << (7 - bit);
        }
      }
      raster[y * bytesPerRow + byteIdx] = byteVal;
    }
  }

  // 6. Render crisp 1-bit preview DataURL for UI and TicketPreview
  const previewCanvas = document.createElement('canvas');
  previewCanvas.width = width;
  previewCanvas.height = trimmedHeight;
  const previewCtx = previewCanvas.getContext('2d')!;
  const previewImgData = previewCtx.createImageData(width, trimmedHeight);

  for (let y = 0; y < trimmedHeight; y++) {
    const srcY = firstRow + y;
    for (let x = 0; x < width; x++) {
      const isBlack = bits[srcY * width + x] === 1;
      const dstIdx = (y * width + x) * 4;
      previewImgData.data[dstIdx] = 15;
      previewImgData.data[dstIdx + 1] = 23;
      previewImgData.data[dstIdx + 2] = 42;
      previewImgData.data[dstIdx + 3] = isBlack ? 255 : 0;
    }
  }
  previewCtx.putImageData(previewImgData, 0, 0);
  const previewDataUrl = previewCanvas.toDataURL('image/png');

  // Encode raster Uint8Array to base64
  let binary = '';
  for (let i = 0; i < raster.length; i++) {
    binary += String.fromCharCode(raster[i]);
  }
  const rasterBase64 = typeof btoa === 'function' ? btoa(binary) : '';

  const densityPercent = Math.round((totalBlackDots / (width * trimmedHeight)) * 100);

  return {
    previewDataUrl,
    rasterBase64,
    width,
    height: trimmedHeight,
    densityPercent,
    maxRowDots,
    byteLength: raster.length,
  };
}

/**
 * Decodes a base64-encoded raster buffer back into a Uint8Array
 */
export function decodeRasterBase64(base64: string): Uint8Array {
  if (!base64 || typeof atob !== 'function') return new Uint8Array(0);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
