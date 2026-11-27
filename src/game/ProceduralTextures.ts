import * as THREE from 'three';

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  return [canvas, ctx];
}

function finalizeColorTexture(
  canvas: HTMLCanvasElement,
  maxAnisotropy: number,
  repeatX = 1,
  repeatY = 1,
  isLinearData = false
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = isLinearData ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  tex.anisotropy = Math.max(1, Math.min(maxAnisotropy, 8));
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  if (repeatX !== 1 || repeatY !== 1) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
  }
  tex.needsUpdate = true;
  return tex;
}

/**
 * Crisp helipad asphalt/concrete pad with vibrant yellow safety ring and high-contrast "H".
 */
export type HelipadTextureVariant =
  | 'standard'
  | 'base'
  | 'hospital'
  | 'snow'
  | 'oilrig'
  | 'forest'
  | 'desert'
  | 'beach';

export function createHelipadTexture(
  maxAnisotropy: number,
  variant: HelipadTextureVariant = 'standard',
  companyName = 'ROTOR OPS'
): THREE.CanvasTexture {
  const size = 512;
  const [canvas, ctx] = makeCanvas(size, size);
  drawHelipadCanvas(ctx, size, variant, companyName);
  return finalizeColorTexture(canvas, maxAnisotropy);
}

export function drawHelipadCanvas(
  ctx: CanvasRenderingContext2D,
  size: number,
  variant: HelipadTextureVariant,
  companyName = 'ROTOR OPS'
): void {
  ctx.fillStyle =
    variant === 'oilrig'
      ? '#2b3945'
      : variant === 'snow'
        ? '#455464'
        : variant === 'forest'
          ? '#2f4037'
          : variant === 'desert'
            ? '#524034'
            : variant === 'beach'
              ? '#3d4c59'
              : variant === 'base'
                ? '#3d4754'
                : '#353e4a';
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
  ctx.lineWidth = 3;
  for (let i = 64; i < size; i += 64) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(size, i);
    ctx.stroke();
  }

  ctx.strokeStyle =
    variant === 'oilrig'
      ? '#fb923c'
      : variant === 'snow'
        ? '#7dd3fc'
        : variant === 'forest'
          ? '#4ade80'
          : variant === 'desert'
            ? '#f59e0b'
            : variant === 'beach'
              ? '#38bdf8'
              : '#facc15';
  ctx.lineWidth = 10;
  ctx.setLineDash([28, 18]);
  ctx.strokeRect(22, 22, size - 44, size - 44);
  ctx.setLineDash([]);

  const cx = size / 2;
  const cy = size / 2;
  ctx.fillStyle =
    variant === 'oilrig'
      ? '#163b36'
      : variant === 'forest'
        ? '#1d3326'
        : variant === 'desert'
          ? '#3b2c22'
          : variant === 'beach'
            ? '#1d384a'
            : variant === 'hospital'
              ? '#2c3542'
              : '#28303b';
  ctx.beginPath();
  ctx.arc(cx, cy, 188, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle =
    variant === 'forest'
      ? '#4ade80'
      : variant === 'beach'
        ? '#38bdf8'
        : variant === 'oilrig'
          ? '#facc15'
          : '#fbbf24';
  ctx.lineWidth = 24;
  ctx.beginPath();
  ctx.arc(cx, cy, 168, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(cx, cy, 144, 0, Math.PI * 2);
  ctx.stroke();

  if (variant === 'hospital') {
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(cx - 108, cy - 36, 216, 72);
    ctx.fillRect(cx - 36, cy - 108, 72, 216);
  }

  ctx.fillStyle =
    variant === 'hospital' || variant === 'oilrig' || variant === 'beach'
      ? '#ffffff'
      : '#fde047';
  const hW = 112;
  const hH = 152;
  const bar = 28;
  ctx.fillRect(cx - hW / 2, cy - hH / 2, bar, hH);
  ctx.fillRect(cx + hW / 2 - bar, cy - hH / 2, bar, hH);
  ctx.fillRect(cx - hW / 2, cy - bar / 2, hW, bar);

  if (variant === 'base') {
    ctx.fillStyle = '#f8fafc';
    const label = `${companyName.slice(0, 18)} HQ`;
    const fontSize = label.length > 16 ? 22 : 26;
    ctx.font = `700 ${fontSize}px "Chakra Petch", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(label, cx, size - 40);
  } else if (variant === 'oilrig') {
    ctx.fillStyle = '#fef08a';
    ctx.font = '700 24px "Chakra Petch", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('OFFSHORE ALPHA', cx, size - 40);
  } else if (variant === 'snow') {
    ctx.fillStyle = '#e0f2fe';
    ctx.font = '700 24px "Chakra Petch", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ALPINE RESCUE', cx, size - 40);
  } else if (variant === 'forest') {
    ctx.fillStyle = '#bbf7d0';
    ctx.font = '700 24px "Chakra Petch", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('BASE FLORESTAL', cx, size - 40);
  } else if (variant === 'desert') {
    ctx.fillStyle = '#fde68a';
    ctx.font = '700 24px "Chakra Petch", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('POSTO CÂNION', cx, size - 40);
  } else if (variant === 'beach') {
    ctx.fillStyle = '#bae6fd';
    ctx.font = '700 24px "Chakra Petch", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('COSTA DO SOL', cx, size - 40);
  }
}

/**
 * Stylized modern low-poly building facade albedo + rich organic night-window emissive map.
 * Supports a deterministic variantSeed so neighboring buildings have unique lit/unlit patterns.
 */
export function createFacadeTextures(
  maxAnisotropy: number,
  baseHex: string,
  windowHex: string,
  accentHex: string,
  style: 'office' | 'residential' | 'hospital' | 'civic' | 'tower',
  variantSeed = 0
): {
  map: THREE.CanvasTexture;
  emissiveMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
} {
  const size = 512;
  const [canvas, ctx] = makeCanvas(size, size);
  const [emCanvas, emCtx] = makeCanvas(size, size);
  const [roughCanvas, roughCtx] = makeCanvas(size, size);

  // Day base wall, dark night emissive base & matte wall roughness (0.78 -> ~200/255)
  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, size, size);

  emCtx.fillStyle = '#000000';
  emCtx.fillRect(0, 0, size, size);

  const wallRoughVal = style === 'tower' ? 165 : style === 'office' ? 185 : 212;
  roughCtx.fillStyle = `rgb(${wallRoughVal}, ${wallRoughVal}, ${wallRoughVal})`;
  roughCtx.fillRect(0, 0, size, size);

  // Subtle vertical architectural pilasters/ribs for crisp modern skyline read
  ctx.fillStyle = 'rgba(255, 255, 255, 0.10)';
  ctx.fillRect(0, 0, 18, size);
  ctx.fillStyle = 'rgba(15, 23, 42, 0.14)';
  ctx.fillRect(size - 18, 0, 18, size);

  const rows = style === 'tower' ? 15 : style === 'office' ? 12 : 10;
  const cols = style === 'residential' ? 4 : style === 'tower' ? 6 : 5;
  const rowH = size / rows;
  const colW = size / cols;

  // Deterministic hash helper for natural lit/unlit window clusters
  const hash = (r: number, c: number, salt: number): number => {
    let n = (r * 374761393 + c * 668265263 + (variantSeed + salt) * 1442695041) | 0;
    n = (n ^ (n >>> 13)) * 1274126177;
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };

  for (let r = 0; r < rows; r++) {
    const y = r * rowH;

    // Ground floor lobby band (warmly illuminated at night + glossy glass front)
    if (r === rows - 1) {
      ctx.fillStyle = accentHex;
      ctx.fillRect(0, y, size, rowH);
      ctx.fillStyle = '#182738';
      ctx.fillRect(32, y + 9, size - 64, rowH - 13);
      roughCtx.fillStyle = 'rgb(30, 30, 30)';
      roughCtx.fillRect(32, y + 9, size - 64, rowH - 13);

      // Lobby glass mullions
      ctx.fillStyle = accentHex;
      ctx.fillRect(168, y + 9, 12, rowH - 13);
      ctx.fillRect(332, y + 9, 12, rowH - 13);
      roughCtx.fillStyle = `rgb(${wallRoughVal}, ${wallRoughVal}, ${wallRoughVal})`;
      roughCtx.fillRect(168, y + 9, 12, rowH - 13);
      roughCtx.fillRect(332, y + 9, 12, rowH - 13);

      emCtx.fillStyle = '#ffd68a';
      emCtx.fillRect(40, y + 13, 120, rowH - 19);
      emCtx.fillRect(188, y + 13, 136, rowH - 19);
      emCtx.fillRect(352, y + 13, 120, rowH - 19);
      continue;
    }

    // Horizontal floor slab / spandrel ledge
    ctx.fillStyle = style === 'tower' ? 'rgba(15, 23, 42, 0.24)' : 'rgba(15, 23, 42, 0.13)';
    ctx.fillRect(0, y, size, style === 'tower' ? 4 : 3);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.fillRect(0, y + 3, size, 2);

    // Hospital red cross accent floor
    if (style === 'hospital' && r === 1) {
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(0, y + 5, size, rowH - 10);
      emCtx.fillStyle = '#ff4b4b';
      emCtx.fillRect(20, y + 9, size - 40, rowH - 18);
      continue;
    }

    // Floor occupancy bias (some office floors mostly lit for late shift, others mostly dark)
    const floorBias = hash(r, 99, 17);
    const floorActive = style === 'office' || style === 'tower' ? floorBias > 0.28 : true;
    const glassRoughVal = style === 'tower' ? 28 : style === 'office' ? 38 : 52;

    for (let c = 0; c < cols; c++) {
      const x = c * colW;
      const padX = style === 'tower' ? 8 : 13;
      const padY = style === 'tower' ? 5 : 8;
      const winW = colW - padX * 2;
      const winH = rowH - padY * 2;

      // Recessed window sill & architectural frame
      ctx.fillStyle = 'rgba(15, 23, 42, 0.42)';
      ctx.fillRect(x + padX - 3, y + padY - 2, winW + 6, winH + 4);

      const hVal = hash(r, c, 3);
      const toneVal = hash(r, c, 29);

      // Day glass color with subtle sky/sunset reflection variation
      ctx.fillStyle =
        hVal < 0.14
          ? '#8ec0de'
          : hVal < 0.30
            ? '#5293b8'
            : windowHex;
      ctx.fillRect(x + padX, y + padY, winW, winH);

      // Glossy low-roughness glass pane in roughnessMap for realistic sunset reflection
      roughCtx.fillStyle = `rgb(${glassRoughVal}, ${glassRoughVal}, ${glassRoughVal})`;
      roughCtx.fillRect(x + padX, y + padY, winW, winH);

      // Crisp diagonal daylight glass specular glint
      ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
      ctx.beginPath();
      ctx.moveTo(x + padX, y + padY);
      ctx.lineTo(x + padX + winW * 0.56, y + padY);
      ctx.lineTo(x + padX, y + padY + winH * 0.62);
      ctx.closePath();
      ctx.fill();

      // Fine architectural window mullion / residential balcony rail
      if (style === 'residential') {
        ctx.fillStyle = 'rgba(15, 23, 42, 0.32)';
        ctx.fillRect(x + padX, y + padY + winH * 0.62, winW, 2);
      } else if (style === 'office' || style === 'civic' || style === 'tower') {
        ctx.fillStyle = 'rgba(15, 23, 42, 0.26)';
        ctx.fillRect(x + padX + winW * 0.49, y + padY, 3, winH);
      }

      // Organic night window illumination: realistic mix of lit warm/cool/dim & unlit dark windows
      const litChance =
        style === 'hospital'
          ? 0.78
          : style === 'tower'
            ? floorActive
              ? 0.58
              : 0.12
            : style === 'office'
              ? floorActive
                ? 0.52
                : 0.15
              : 0.48;

      if (hVal < litChance) {
        if (style === 'hospital') {
          emCtx.fillStyle = toneVal > 0.35 ? '#fff2d1' : '#d7ecff';
        } else if (toneVal < 0.14) {
          emCtx.fillStyle = '#bfe3ff';
        } else if (toneVal < 0.34) {
          emCtx.fillStyle = '#996f34';
        } else if (toneVal < 0.68) {
          emCtx.fillStyle = '#ffcb6b';
        } else {
          emCtx.fillStyle = '#fff0c2';
        }

        const blindFrac = style === 'residential' && toneVal > 0.78 ? 0.55 : 1.0;
        emCtx.fillRect(
          x + padX,
          y + padY + winH * (1 - blindFrac),
          winW,
          winH * blindFrac
        );
      }
    }
  }

  return {
    map: finalizeColorTexture(canvas, maxAnisotropy, 1, 1, false),
    emissiveMap: finalizeColorTexture(emCanvas, maxAnisotropy, 1, 1, false),
    roughnessMap: finalizeColorTexture(roughCanvas, maxAnisotropy, 1, 1, true),
  };
}

/**
 * Draws the customizable Company Name onto the Coastal Airbase Hangar sign board canvas.
 */
export function drawHangarSignCanvas(ctx: CanvasRenderingContext2D, companyName: string): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.fillStyle = '#152236';
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = '#e63946';
  ctx.fillRect(0, 0, w, 14);
  ctx.fillRect(0, h - 14, w, 14);

  const label = (companyName || 'ROTOR OPS').trim().toUpperCase().slice(0, 22);
  const fontSize = label.length > 16 ? 34 : label.length > 12 ? 42 : 52;
  ctx.fillStyle = '#f8fafc';
  ctx.font = `700 ${fontSize}px "Chakra Petch", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, w / 2, h / 2 + 2);
}

/**
 * Hangar sign board texture for Coastal Airbase HQ.
 */
export function createHangarSignTexture(
  maxAnisotropy: number,
  companyName = 'ROTOR OPS'
): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(512, 128);
  drawHangarSignCanvas(ctx, companyName);
  return finalizeColorTexture(canvas, maxAnisotropy);
}

/**
 * Soft radial drop shadow + crisp circular landing reticle projected below the helicopter.
 */
export function createLandingMarkerTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 256;
  const [canvas, ctx] = makeCanvas(size, size);
  const cx = size / 2;
  const cy = size / 2;

  const grad = ctx.createRadialGradient(cx, cy, 8, cx, cy, 98);
  grad.addColorStop(0, 'rgba(8, 15, 28, 0.62)');
  grad.addColorStop(0.55, 'rgba(8, 15, 28, 0.28)');
  grad.addColorStop(1, 'rgba(8, 15, 28, 0.0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, 100, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.lineWidth = 6;
  ctx.setLineDash([20, 12]);
  ctx.beginPath();
  ctx.arc(cx, cy, 112, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(cx - 24, cy);
  ctx.lineTo(cx - 8, cy);
  ctx.moveTo(cx + 8, cy);
  ctx.lineTo(cx + 24, cy);
  ctx.moveTo(cx, cy - 24);
  ctx.lineTo(cx, cy - 8);
  ctx.moveTo(cx, cy + 8);
  ctx.lineTo(cx, cy + 24);
  ctx.stroke();

  return finalizeColorTexture(canvas, maxAnisotropy);
}

/**
 * Translucent streaked rotor motion-blur disc texture for high-RPM main and tail rotors.
 */
export function createRotorBlurTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 256;
  const [canvas, ctx] = makeCanvas(size, size);
  const cx = size / 2;
  const cy = size / 2;

  // Base soft motion disc
  const grad = ctx.createRadialGradient(cx, cy, 14, cx, cy, 124);
  grad.addColorStop(0, 'rgba(30, 41, 59, 0.08)');
  grad.addColorStop(0.58, 'rgba(30, 41, 59, 0.20)');
  grad.addColorStop(0.84, 'rgba(51, 65, 85, 0.26)');
  grad.addColorStop(0.91, 'rgba(250, 204, 21, 0.42)');
  grad.addColorStop(0.96, 'rgba(250, 204, 21, 0.56)');
  grad.addColorStop(1, 'rgba(250, 204, 21, 0.0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, 124, 0, Math.PI * 2);
  ctx.fill();

  // Radial swept blade motion wedges so spinning disc reads as genuine high-speed rotation
  const sectors = 4;
  for (let i = 0; i < sectors; i++) {
    const startA = (i * Math.PI * 2) / sectors;
    const endA = startA + 0.58;
    const sweepGrad = ctx.createRadialGradient(cx, cy, 18, cx, cy, 122);
    sweepGrad.addColorStop(0, 'rgba(15, 23, 42, 0.0)');
    sweepGrad.addColorStop(0.45, 'rgba(15, 23, 42, 0.26)');
    sweepGrad.addColorStop(0.85, 'rgba(15, 23, 42, 0.34)');
    sweepGrad.addColorStop(0.95, 'rgba(253, 224, 71, 0.48)');
    sweepGrad.addColorStop(1, 'rgba(253, 224, 71, 0.0)');

    ctx.fillStyle = sweepGrad;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, 122, startA, endA);
    ctx.closePath();
    ctx.fill();
  }

  // Subtle concentric rotor sheen ring
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, 94, 0, Math.PI * 2);
  ctx.stroke();

  return finalizeColorTexture(canvas, maxAnisotropy);
}
