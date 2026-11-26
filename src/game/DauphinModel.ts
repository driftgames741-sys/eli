import * as THREE from 'three';
import { createLandingMarkerTexture, createRotorBlurTexture } from './ProceduralTextures';
import { BAMBI_CABLE_LENGTH, SEARCHLIGHT_SPOT_ANGLE, type HelicopterRig } from './HelicopterModel';

interface LoftStation {
  z: number;
  yCenter: number;
  halfWidth: number;
  halfHeightTop: number;
  halfHeightBot: number;
  /** Superellipse exponent (>2 gives fuller cabin flanks with smooth rounded chines) */
  roundness: number;
  /** Slight flat-bottom keel flattening (0..1) */
  bellyFlat: number;
}

/**
 * Generates a smooth, doubly-curved lofted BufferGeometry from cross-section stations along Z.
 * Zero flat/boxy faces — produces authentic smooth aerospace curvature with analytical vertex normals.
 */
function buildLoftedHullGeometry(
  stations: LoftStation[],
  radialSegments = 36,
  capFront = true,
  capBack = true
): THREE.BufferGeometry {
  const numStations = stations.length;
  const ringVerts = radialSegments + 1;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const zMin = stations[0].z;
  const zMax = stations[numStations - 1].z;
  const zSpan = Math.max(0.0001, zMax - zMin);

  for (let s = 0; s < numStations; s++) {
    const st = stations[s];
    const v = (st.z - zMin) / zSpan;
    const exp = 2 / Math.max(1.2, st.roundness);

    for (let r = 0; r <= radialSegments; r++) {
      const u = r / radialSegments;
      const theta = u * Math.PI * 2;
      const c = Math.cos(theta);
      const sn = Math.sin(theta);

      // Smooth super-ellipse cross-section
      const sx = Math.sign(c) * Math.pow(Math.abs(c), exp);
      const syRaw = Math.sign(sn) * Math.pow(Math.abs(sn), exp);

      const x = sx * st.halfWidth;
      let yOff = syRaw >= 0 ? syRaw * st.halfHeightTop : syRaw * st.halfHeightBot;

      // Subtle aerodynamic belly keel flattening without sharp creases
      if (syRaw < 0 && st.bellyFlat > 0) {
        const flatBlend = Math.pow(Math.abs(syRaw), 2.4) * st.bellyFlat;
        yOff = THREE.MathUtils.lerp(yOff, -st.halfHeightBot * 0.88, flatBlend * 0.45);
      }

      positions.push(x, st.yCenter + yOff, st.z);
      uvs.push(u, v);
    }
  }

  for (let s = 0; s < numStations - 1; s++) {
    for (let r = 0; r < radialSegments; r++) {
      const a = s * ringVerts + r;
      const b = a + 1;
      const c = (s + 1) * ringVerts + r;
      const d = c + 1;
      // Outward-facing CCW winding (since Z increases with station index)
      indices.push(a, c, b);
      indices.push(b, c, d);
    }
  }

  if (capFront) {
    const st0 = stations[0];
    const centerIdx = positions.length / 3;
    positions.push(0, st0.yCenter, st0.z);
    uvs.push(0.5, 0);
    for (let r = 0; r < radialSegments; r++) {
      indices.push(centerIdx, r, r + 1);
    }
  }

  if (capBack) {
    const lastIdx = numStations - 1;
    const stN = stations[lastIdx];
    const centerIdx = positions.length / 3;
    positions.push(0, stN.yCenter, stN.z);
    uvs.push(0.5, 1);
    const base = lastIdx * ringVerts;
    for (let r = 0; r < radialSegments; r++) {
      indices.push(centerIdx, base + r + 1, base + r);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Generates a curved surface patch hugging the fuselage cross-section between angle/Z bounds.
 * Used for flush doubly-curved cockpit windshield, side windows, and transparent FDMA livery decals.
 */
function buildHullConformPatch(
  stations: LoftStation[],
  thetaStart: number,
  thetaEnd: number,
  outwardOffset: number,
  uSegments = 16,
  flipU = false
): THREE.BufferGeometry {
  const numStations = stations.length;
  const cols = uSegments + 1;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let s = 0; s < numStations; s++) {
    const st = stations[s];
    const vStation = s / Math.max(1, numStations - 1);
    const exp = 2 / Math.max(1.2, st.roundness);

    for (let i = 0; i <= uSegments; i++) {
      const t = i / uSegments;
      const theta = THREE.MathUtils.lerp(thetaStart, thetaEnd, t);
      const c = Math.cos(theta);
      const sn = Math.sin(theta);

      const sx = Math.sign(c) * Math.pow(Math.abs(c), exp);
      const syRaw = Math.sign(sn) * Math.pow(Math.abs(sn), exp);

      const x = sx * (st.halfWidth + outwardOffset);
      let yOff =
        syRaw >= 0
          ? syRaw * (st.halfHeightTop + outwardOffset)
          : syRaw * (st.halfHeightBot + outwardOffset);

      if (syRaw < 0 && st.bellyFlat > 0) {
        const flatBlend = Math.pow(Math.abs(syRaw), 2.4) * st.bellyFlat;
        yOff = THREE.MathUtils.lerp(yOff, -(st.halfHeightBot + outwardOffset) * 0.88, flatBlend * 0.45);
      }

      positions.push(x, st.yCenter + yOff, st.z);
      // Map U along longitudinal Z (vStation) and V across vertical arc (t)
      uvs.push(flipU ? 1 - vStation : vStation, t);
    }
  }

  for (let s = 0; s < numStations - 1; s++) {
    for (let i = 0; i < uSegments; i++) {
      const a = s * cols + i;
      const b = a + 1;
      const c = (s + 1) * cols + i;
      const d = c + 1;
      if (thetaEnd >= thetaStart) {
        indices.push(a, c, b);
        indices.push(b, c, d);
      } else {
        indices.push(a, b, c);
        indices.push(b, d, c);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/** Smooth Catmull-Rom-like interpolation helper along fuselage stations */
function sampleStationAtZ(stations: LoftStation[], z: number): LoftStation {
  if (z <= stations[0].z) return { ...stations[0], z };
  const last = stations[stations.length - 1];
  if (z >= last.z) return { ...last, z };

  for (let i = 0; i < stations.length - 1; i++) {
    const a = stations[i];
    const b = stations[i + 1];
    if (z >= a.z && z <= b.z) {
      const t = (z - a.z) / Math.max(0.0001, b.z - a.z);
      const sm = t * t * (3 - 2 * t);
      return {
        z,
        yCenter: THREE.MathUtils.lerp(a.yCenter, b.yCenter, sm),
        halfWidth: THREE.MathUtils.lerp(a.halfWidth, b.halfWidth, sm),
        halfHeightTop: THREE.MathUtils.lerp(a.halfHeightTop, b.halfHeightTop, sm),
        halfHeightBot: THREE.MathUtils.lerp(a.halfHeightBot, b.halfHeightBot, sm),
        roundness: THREE.MathUtils.lerp(a.roundness, b.roundness, sm),
        bellyFlat: THREE.MathUtils.lerp(a.bellyFlat, b.bellyFlat, sm),
      };
    }
  }
  return { ...last, z };
}

function createGlowTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 1, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
  grad.addColorStop(0.28, 'rgba(255, 255, 255, 0.72)');
  grad.addColorStop(0.6, 'rgba(255, 255, 255, 0.18)');
  grad.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Generates crisp transparent FDMA rescue livery decals (white aerodynamic sweep stripe,
 * "FDMA" agency lettering, Japanese Fire/Disaster emblem & "JA01FD" registration).
 * Supports both 'left' (nose on left) and 'right' (nose on right) so every text reads
 * left-to-right while graphics stay 100% symmetric on both flanks of the fuselage.
 */
function createFuselageDecalTexture(
  maxAnisotropy: number,
  flank: 'left' | 'right'
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 384;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const isRight = flank === 'right';
  const mapX = (x: number) => (isRight ? canvas.width - x : x);

  // Flowing aerodynamic white rescue stripe sweeping across lower cabin toward tail boom
  ctx.save();
  if (isRight) {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.fillStyle = '#f8fafc';
  ctx.beginPath();
  ctx.moveTo(28, 286);
  ctx.quadraticCurveTo(320, 272, 640, 236);
  ctx.quadraticCurveTo(835, 214, 1005, 198);
  ctx.lineTo(1005, 236);
  ctx.quadraticCurveTo(830, 255, 645, 280);
  ctx.quadraticCurveTo(325, 318, 28, 326);
  ctx.closePath();
  ctx.fill();

  // Thin crisp upper pinstripe above main white band
  ctx.fillStyle = 'rgba(248, 250, 252, 0.92)';
  ctx.beginPath();
  ctx.moveTo(64, 266);
  ctx.quadraticCurveTo(340, 254, 648, 218);
  ctx.quadraticCurveTo(835, 196, 995, 182);
  ctx.lineTo(995, 190);
  ctx.quadraticCurveTo(835, 204, 648, 226);
  ctx.quadraticCurveTo(340, 262, 64, 274);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Subtle gold/crimson FDMA rescue crest emblem on mid-forward flank
  ctx.save();
  const ex = mapX(270);
  const ey = 294;
  ctx.fillStyle = '#c81018';
  ctx.beginPath();
  ctx.arc(ex, ey, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = 3.5;
  ctx.stroke();
  ctx.fillStyle = '#facc15';
  ctx.beginPath();
  ctx.moveTo(ex, ey - 13);
  ctx.lineTo(ex + 9, ey + 9);
  ctx.lineTo(ex, ey + 4);
  ctx.lineTo(ex - 9, ey + 9);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Bold "FDMA" agency lettering embedded crisply along the white stripe (always L-to-R)
  ctx.save();
  ctx.font = '900 44px "Inter", "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#b91c1c';
  ctx.fillText('FDMA', mapX(395), 289);
  ctx.restore();

  // Crisp "JA01FD" registration near upper-rear fuselage / turbine section (always L-to-R)
  ctx.save();
  ctx.font = '800 36px "JetBrains Mono", "Consolas", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
  ctx.shadowBlur = 4;
  ctx.fillText('JA01FD', mapX(795), 128);

  // Subtle agency sub-stencil below registration
  ctx.font = '700 17px "Inter", Arial, sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.fillText('FDMA RESCUE', mapX(795), 158);
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(maxAnisotropy, 8);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Generates transparent tail-fin livery decal ("AS365N3" + sleek diagonal white stripe).
 */
function createTailFinDecalTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Sleek white speed-chevron accent across vertical fin
  ctx.fillStyle = '#f8fafc';
  ctx.beginPath();
  ctx.moveTo(48, 206);
  ctx.lineTo(440, 146);
  ctx.lineTo(458, 166);
  ctx.lineTo(66, 226);
  ctx.closePath();
  ctx.fill();

  // Crisp "AS365N3" model designation
  ctx.font = '900 54px "Inter", "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
  ctx.shadowBlur = 4;
  ctx.fillText('AS365N3', 256, 98);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(maxAnisotropy, 8);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Creates a rounded-rectangle THREE.Shape centered at (0, 0) for smooth cabin windows.
 */
function createRoundedRectShape(w: number, h: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  const hw = w * 0.5;
  const hh = h * 0.5;
  const cr = Math.min(r, hw * 0.9, hh * 0.9);
  s.moveTo(-hw + cr, -hh);
  s.lineTo(hw - cr, -hh);
  s.quadraticCurveTo(hw, -hh, hw, -hh + cr);
  s.lineTo(hw, hh - cr);
  s.quadraticCurveTo(hw, hh, hw - cr, hh);
  s.lineTo(-hw + cr, hh);
  s.quadraticCurveTo(-hw, hh, -hw, hh - cr);
  s.lineTo(-hw, -hh + cr);
  s.quadraticCurveTo(-hw, -hh, -hw + cr, -hh);
  return s;
}

/**
 * Builds the detailed, curved aerospace **AS365 N3 Dauphin (Resgate — FDMA JA01FD)** helicopter rig:
 * - Zero BoxGeometry on the fuselage: sculpted lofted dolphin body, glossy white radome nose,
 *   aerodynamic roof turbine cowling with twin frontal air intakes & twin dark metallic exhausts.
 * - Reflective doubly-curved windshield & rounded cabin windows revealing subtle interior seats/console.
 * - Tapered aerodynamic tail boom, airfoil horizontal stabilizer with dual canted endplates,
 *   and iconic ducted Fenestron tail rotor (real cutout circular shroud + 10 fast-spinning blades).
 * - Detailed 4-blade main rotor with rounded red Starflex cap & high-visibility white blade stripes.
 * - Right-side external rescue hoist pod (wired to the actual Winch Rescue cable anchor).
 * - Automatically retracting/deploying tricycle wheeled landing gear (twin nose wheels + 2 main wheels).
 * - Glossy clearcoat FDMA rescue crimson paint (#c81018) with crisp CanvasTexture markings.
 */
export function createDauphinAS365Rig(maxAnisotropy: number): HelicopterRig {
  const root = new THREE.Group();
  root.name = 'AS365_N3_Dauphin';
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };

  // === MATERIALS (Mirror-Gloss Clearcoat Rescue Crimson + Physical Smoked Glass) ===
  const DEFAULT_PRIMARY = 0xc81018;
  const DEFAULT_SECONDARY = 0xf8fafc;
  const DEFAULT_ACCENT = 0xfacc15;

  const primaryMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: DEFAULT_PRIMARY,
      roughness: 0.18,
      metalness: 0.15,
      clearcoat: 1.0,
      clearcoatRoughness: 0.12,
      flatShading: false,
    })
  );

  const secondaryMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: DEFAULT_SECONDARY,
      roughness: 0.15,
      metalness: 0.08,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1,
      flatShading: false,
    })
  );

  const accentMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: DEFAULT_ACCENT,
      roughness: 0.24,
      metalness: 0.18,
      clearcoat: 0.85,
      clearcoatRoughness: 0.16,
    })
  );

  const cockpitGlassMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x091624,
      roughness: 0.08,
      metalness: 0.2,
      clearcoat: 1.0,
      clearcoatRoughness: 0.06,
      opacity: 0.75,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );

  const darkMetalMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x202938,
      roughness: 0.36,
      metalness: 0.76,
    })
  );

  const exhaustMetalMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x2b323d,
      roughness: 0.3,
      metalness: 0.88,
    })
  );

  const chromeMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xdbe4ef,
      roughness: 0.16,
      metalness: 0.92,
    })
  );

  const tireMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x161a20,
      roughness: 0.88,
      metalness: 0.06,
    })
  );

  const interiorDarkMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x101722,
      roughness: 0.88,
      metalness: 0.1,
    })
  );

  const seatFabricMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x2a3648,
      roughness: 0.82,
      metalness: 0.08,
    })
  );

  const exhaustBoreMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x070a0f,
      roughness: 0.96,
      metalness: 0.15,
    })
  );

  const bladeMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x1c232e,
      roughness: 0.44,
      metalness: 0.32,
    })
  );

  const bladeStripeMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.28,
      metalness: 0.1,
    })
  );

  const orangeBucketMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.42, metalness: 0.08 })
  );
  const bucketWaterMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.14, metalness: 0.2 })
  );

  // Aviation lights
  const beaconMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 2.6,
      roughness: 0.12,
    })
  );
  const navGreenMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x22c55e,
      emissive: 0x22c55e,
      emissiveIntensity: 2.2,
      roughness: 0.18,
    })
  );
  const navRedMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0xef4444,
      emissiveIntensity: 2.2,
      roughness: 0.18,
    })
  );
  const landingLightMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xfffef0,
      emissive: 0xfff6cf,
      emissiveIntensity: 3.4,
      roughness: 0.1,
    })
  );
  const searchlightBulbMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xfffbeb,
      emissive: 0xfef3c7,
      emissiveIntensity: 0,
      roughness: 0.15,
    })
  );

  const glowTex = createGlowTexture();
  textures.push(glowTex);

  // === 1. SCULPTED AERODYNAMIC FUSELAGE (SMOOTH LOFTED DOLPHIN PROFILE, ZERO BOXES) ===
  // Master aerodynamic profile along Z (nose at -4.35 -> rear fuselage transition at +2.65)
  const fullProfileStations: LoftStation[] = [
    { z: -4.35, yCenter: 1.02, halfWidth: 0.06, halfHeightTop: 0.05, halfHeightBot: 0.05, roundness: 2.0, bellyFlat: 0.0 },
    { z: -4.22, yCenter: 1.04, halfWidth: 0.26, halfHeightTop: 0.18, halfHeightBot: 0.16, roundness: 2.0, bellyFlat: 0.0 },
    { z: -3.95, yCenter: 1.08, halfWidth: 0.50, halfHeightTop: 0.30, halfHeightBot: 0.25, roundness: 2.1, bellyFlat: 0.1 },
    { z: -3.55, yCenter: 1.13, halfWidth: 0.72, halfHeightTop: 0.39, halfHeightBot: 0.34, roundness: 2.2, bellyFlat: 0.25 },
    { z: -3.12, yCenter: 1.19, halfWidth: 0.88, halfHeightTop: 0.47, halfHeightBot: 0.42, roundness: 2.35, bellyFlat: 0.45 },
    { z: -2.65, yCenter: 1.28, halfWidth: 0.99, halfHeightTop: 0.60, halfHeightBot: 0.52, roundness: 2.55, bellyFlat: 0.65 },
    { z: -2.10, yCenter: 1.38, halfWidth: 1.06, halfHeightTop: 0.76, halfHeightBot: 0.64, roundness: 2.75, bellyFlat: 0.78 },
    { z: -1.45, yCenter: 1.46, halfWidth: 1.10, halfHeightTop: 0.86, halfHeightBot: 0.72, roundness: 2.85, bellyFlat: 0.85 },
    { z: -0.60, yCenter: 1.49, halfWidth: 1.12, halfHeightTop: 0.88, halfHeightBot: 0.74, roundness: 2.9, bellyFlat: 0.88 },
    { z: 0.45, yCenter: 1.49, halfWidth: 1.12, halfHeightTop: 0.87, halfHeightBot: 0.74, roundness: 2.85, bellyFlat: 0.85 },
    { z: 1.25, yCenter: 1.50, halfWidth: 1.04, halfHeightTop: 0.82, halfHeightBot: 0.70, roundness: 2.65, bellyFlat: 0.7 },
    { z: 1.85, yCenter: 1.56, halfWidth: 0.80, halfHeightTop: 0.68, halfHeightBot: 0.56, roundness: 2.35, bellyFlat: 0.35 },
    { z: 2.45, yCenter: 1.66, halfWidth: 0.52, halfHeightTop: 0.48, halfHeightBot: 0.40, roundness: 2.1, bellyFlat: 0.1 },
    { z: 2.85, yCenter: 1.72, halfWidth: 0.38, halfHeightTop: 0.38, halfHeightBot: 0.33, roundness: 2.0, bellyFlat: 0.0 },
  ];

  // 1A. Bright Glossy White Radome Nose Cone (z = -4.35 .. -3.12)
  const radomeStations: LoftStation[] = [];
  for (let i = 0; i <= 10; i++) {
    const z = THREE.MathUtils.lerp(-4.35, -3.12, i / 10);
    radomeStations.push(sampleStationAtZ(fullProfileStations, z));
  }
  const radomeMesh = new THREE.Mesh(
    trackGeo(buildLoftedHullGeometry(radomeStations, 36, true, false)),
    secondaryMat
  );
  radomeMesh.castShadow = true;
  radomeMesh.receiveShadow = true;
  bodyGroup.add(radomeMesh);

  // Subtle dark weather-radar seam ring & pitot probes on nose
  const seamRingGeo = trackGeo(new THREE.TorusGeometry(0.68, 0.014, 8, 32));
  const seamRing = new THREE.Mesh(seamRingGeo, darkMetalMat);
  seamRing.position.set(0, 1.19, -3.12);
  seamRing.scale.set(1.3, 0.66, 1.0);
  bodyGroup.add(seamRing);

  for (const side of [-1, 1]) {
    const pitot = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.012, 0.018, 0.34, 8)),
      chromeMat
    );
    pitot.rotation.x = Math.PI / 2;
    pitot.position.set(side * 0.42, 1.12, -3.72);
    bodyGroup.add(pitot);
  }

  // 1B. Main Glossy Rescue Crimson Fuselage Body (z = -3.14 .. +2.85)
  const mainHullStations: LoftStation[] = [];
  for (let i = 0; i <= 26; i++) {
    const z = THREE.MathUtils.lerp(-3.14, 2.85, i / 26);
    mainHullStations.push(sampleStationAtZ(fullProfileStations, z));
  }
  const mainHullMesh = new THREE.Mesh(
    trackGeo(buildLoftedHullGeometry(mainHullStations, 40, false, true)),
    primaryMat
  );
  mainHullMesh.castShadow = true;
  mainHullMesh.receiveShadow = true;
  bodyGroup.add(mainHullMesh);

  // 1C. Aerodynamic Main Wheel-Well Cheek Sponsons (smooth curved fairings along lower rear flanks)
  const sponsonStations: LoftStation[] = [
    { z: -0.15, yCenter: 0.96, halfWidth: 0.04, halfHeightTop: 0.04, halfHeightBot: 0.04, roundness: 2.0, bellyFlat: 0 },
    { z: 0.25, yCenter: 0.96, halfWidth: 0.28, halfHeightTop: 0.24, halfHeightBot: 0.22, roundness: 2.2, bellyFlat: 0.2 },
    { z: 0.85, yCenter: 0.96, halfWidth: 0.36, halfHeightTop: 0.28, halfHeightBot: 0.26, roundness: 2.3, bellyFlat: 0.35 },
    { z: 1.45, yCenter: 1.00, halfWidth: 0.30, halfHeightTop: 0.24, halfHeightBot: 0.22, roundness: 2.1, bellyFlat: 0.2 },
    { z: 1.98, yCenter: 1.12, halfWidth: 0.04, halfHeightTop: 0.04, halfHeightBot: 0.04, roundness: 2.0, bellyFlat: 0 },
  ];
  const sponsonGeo = trackGeo(buildLoftedHullGeometry(sponsonStations, 20, true, true));
  for (const side of [-1, 1]) {
    const sponson = new THREE.Mesh(sponsonGeo, primaryMat);
    sponson.position.x = side * 0.96;
    sponson.castShadow = true;
    sponson.receiveShadow = true;
    bodyGroup.add(sponson);
  }

  // 1D. Sculpted Roof Turbine Cowling / Doghouse (smooth curved lofted housing behind rotor mast)
  const cowlingStations: LoftStation[] = [
    { z: -1.42, yCenter: 2.18, halfWidth: 0.08, halfHeightTop: 0.06, halfHeightBot: 0.05, roundness: 2.0, bellyFlat: 0 },
    { z: -1.12, yCenter: 2.26, halfWidth: 0.56, halfHeightTop: 0.30, halfHeightBot: 0.16, roundness: 2.3, bellyFlat: 0.2 },
    { z: -0.58, yCenter: 2.34, halfWidth: 0.74, halfHeightTop: 0.42, halfHeightBot: 0.22, roundness: 2.4, bellyFlat: 0.3 },
    { z: 0.25, yCenter: 2.35, halfWidth: 0.76, halfHeightTop: 0.42, halfHeightBot: 0.24, roundness: 2.4, bellyFlat: 0.3 },
    { z: 1.15, yCenter: 2.28, halfWidth: 0.64, halfHeightTop: 0.35, halfHeightBot: 0.22, roundness: 2.2, bellyFlat: 0.2 },
    { z: 1.95, yCenter: 2.12, halfWidth: 0.42, halfHeightTop: 0.26, halfHeightBot: 0.18, roundness: 2.0, bellyFlat: 0.1 },
    { z: 2.75, yCenter: 1.92, halfWidth: 0.22, halfHeightTop: 0.14, halfHeightBot: 0.12, roundness: 2.0, bellyFlat: 0 },
    { z: 3.35, yCenter: 1.82, halfWidth: 0.04, halfHeightTop: 0.04, halfHeightBot: 0.04, roundness: 2.0, bellyFlat: 0 },
  ];
  const cowlingMesh = new THREE.Mesh(
    trackGeo(buildLoftedHullGeometry(cowlingStations, 28, true, true)),
    primaryMat
  );
  cowlingMesh.castShadow = true;
  cowlingMesh.receiveShadow = true;
  bodyGroup.add(cowlingMesh);

  // Twin Frontal Air Intakes + Twin Dark Metallic Swept Side Exhausts
  const intakeShellGeo = trackGeo(new THREE.CylinderGeometry(0.18, 0.24, 0.72, 18));
  intakeShellGeo.rotateX(Math.PI / 2);
  const intakeLipGeo = trackGeo(new THREE.TorusGeometry(0.18, 0.028, 10, 20));
  const intakeBoreGeo = trackGeo(new THREE.CircleGeometry(0.165, 18));

  const exhaustNozzleGeo = trackGeo(new THREE.CylinderGeometry(0.17, 0.21, 0.78, 18, 1, true));
  exhaustNozzleGeo.rotateX(Math.PI / 2);
  const exhaustRimGeo = trackGeo(new THREE.TorusGeometry(0.17, 0.02, 8, 18));
  const exhaustBoreGeo = trackGeo(new THREE.CircleGeometry(0.16, 16));

  for (const side of [-1, 1]) {
    // Sculpted frontal turbine intake pod
    const intake = new THREE.Mesh(intakeShellGeo, darkMetalMat);
    intake.position.set(side * 0.46, 2.42, -0.82);
    intake.rotation.y = side * -0.1;
    intake.castShadow = true;
    bodyGroup.add(intake);

    const intakeLip = new THREE.Mesh(intakeLipGeo, chromeMat);
    intakeLip.position.set(side * 0.49, 2.42, -1.17);
    intakeLip.rotation.y = side * -0.1;
    bodyGroup.add(intakeLip);

    const intakeBore = new THREE.Mesh(intakeBoreGeo, exhaustBoreMat);
    intakeBore.position.set(side * 0.49, 2.42, -1.16);
    intakeBore.rotation.y = Math.PI + side * -0.1;
    bodyGroup.add(intakeBore);

    // Swept dark metallic turbine exhaust nozzle exiting aft-outboard
    const exhaustGroup = new THREE.Group();
    exhaustGroup.position.set(side * 0.56, 2.34, 1.56);
    exhaustGroup.rotation.y = side * 0.34;
    exhaustGroup.rotation.x = 0.06;

    const nozzle = new THREE.Mesh(exhaustNozzleGeo, exhaustMetalMat);
    nozzle.material.side = THREE.DoubleSide;
    exhaustGroup.add(nozzle);

    const rim = new THREE.Mesh(exhaustRimGeo, darkMetalMat);
    rim.position.z = 0.39;
    exhaustGroup.add(rim);

    const bore = new THREE.Mesh(exhaustBoreGeo, exhaustBoreMat);
    bore.position.z = 0.36;
    exhaustGroup.add(bore);

    bodyGroup.add(exhaustGroup);
  }

  // === 2. REFLECTIVE CURVED WINDSHIELD, ROUNDED WINDOWS & INTERIOR SILHOUETTE ===
  const cockpitHideOnFirstPerson: THREE.Object3D[] = [];

  // Subtle dark interior cockpit cavity + sculpted pilot seats & glare shield visible through glass
  const interiorCore = new THREE.Mesh(
    trackGeo(new THREE.SphereGeometry(0.84, 20, 14)),
    interiorDarkMat
  );
  interiorCore.scale.set(1.06, 0.72, 1.48);
  interiorCore.position.set(0, 1.58, -1.45);
  bodyGroup.add(interiorCore);
  cockpitHideOnFirstPerson.push(interiorCore);

  // Curved dashboard glare-shield silhouette
  const dashSilhouette = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.68, 0.78, 0.24, 16, 1, false, -Math.PI * 0.5, Math.PI)),
    seatFabricMat
  );
  dashSilhouette.scale.set(1.1, 1.0, 0.75);
  dashSilhouette.position.set(0, 1.46, -2.18);
  bodyGroup.add(dashSilhouette);
  cockpitHideOnFirstPerson.push(dashSilhouette);

  // 2 sculpted pilot seat backs + headrests visible softly behind curved windshield
  const seatBackGeo = trackGeo(new THREE.CapsuleGeometry(0.18, 0.38, 6, 12));
  const headrestGeo = trackGeo(new THREE.SphereGeometry(0.12, 10, 8));
  for (const sx of [-0.34, 0.34]) {
    const seatBack = new THREE.Mesh(seatBackGeo, seatFabricMat);
    seatBack.position.set(sx, 1.66, -1.35);
    seatBack.rotation.x = -0.16;
    bodyGroup.add(seatBack);
    cockpitHideOnFirstPerson.push(seatBack);

    const head = new THREE.Mesh(headrestGeo, darkMetalMat);
    head.position.set(sx, 2.02, -1.30);
    head.scale.set(1.05, 0.9, 0.72);
    bodyGroup.add(head);
    cockpitHideOnFirstPerson.push(head);
  }

  // Doubly-curved wrap-around front windshield hugging the sculpted nose-to-brow profile
  const windshieldStations: LoftStation[] = [];
  for (let i = 0; i <= 10; i++) {
    const z = THREE.MathUtils.lerp(-2.96, -1.28, i / 10);
    windshieldStations.push(sampleStationAtZ(fullProfileStations, z));
  }
  const windshieldPatchGeo = trackGeo(
    buildHullConformPatch(windshieldStations, Math.PI * 0.14, Math.PI * 0.86, 0.022, 22, false)
  );
  const windshieldMesh = new THREE.Mesh(windshieldPatchGeo, cockpitGlassMat);
  windshieldMesh.renderOrder = 2;
  bodyGroup.add(windshieldMesh);
  cockpitHideOnFirstPerson.push(windshieldMesh);

  // Sleek curved center windshield mullion + twin curved A-pillars (TubeGeometry along hull curve)
  const buildHullCurve = (theta: number, zStart: number, zEnd: number, offset: number): THREE.CatmullRomCurve3 => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 8; i++) {
      const z = THREE.MathUtils.lerp(zStart, zEnd, i / 8);
      const st = sampleStationAtZ(fullProfileStations, z);
      const exp = 2 / Math.max(1.2, st.roundness);
      const c = Math.cos(theta);
      const sn = Math.sin(theta);
      const sx = Math.sign(c) * Math.pow(Math.abs(c), exp);
      const sy = Math.sign(sn) * Math.pow(Math.abs(sn), exp);
      pts.push(
        new THREE.Vector3(
          sx * (st.halfWidth + offset),
          st.yCenter + sy * (st.halfHeightTop + offset),
          z
        )
      );
    }
    return new THREE.CatmullRomCurve3(pts);
  };

  const centerMullionCurve = buildHullCurve(Math.PI * 0.5, -2.96, -1.28, 0.028);
  const centerMullion = new THREE.Mesh(
    trackGeo(new THREE.TubeGeometry(centerMullionCurve, 14, 0.024, 8, false)),
    darkMetalMat
  );
  bodyGroup.add(centerMullion);
  cockpitHideOnFirstPerson.push(centerMullion);

  for (const thetaPillar of [Math.PI * 0.16, Math.PI * 0.84]) {
    const pillarCurve = buildHullCurve(thetaPillar, -2.86, -1.28, 0.028);
    const pillarMesh = new THREE.Mesh(
      trackGeo(new THREE.TubeGeometry(pillarCurve, 14, 0.026, 8, false)),
      darkMetalMat
    );
    bodyGroup.add(pillarMesh);
    cockpitHideOnFirstPerson.push(pillarMesh);
  }

  // Wide Rounded Side Cabin Windows (3 contoured rounded windows per side: cockpit door, sliding door, rear cabin)
  const sideWinConfigs = [
    { z: -1.48, w: 0.78, h: 0.62, r: 0.16, y: 1.72 },
    { z: -0.48, w: 0.98, h: 0.64, r: 0.16, y: 1.73 },
    { z: 0.56, w: 0.84, h: 0.58, r: 0.16, y: 1.73 },
  ];

  for (const cfg of sideWinConfigs) {
    const winShape = createRoundedRectShape(cfg.w, cfg.h, cfg.r);
    const frameShape = createRoundedRectShape(cfg.w + 0.07, cfg.h + 0.07, cfg.r + 0.02);

    const winGeo = trackGeo(
      new THREE.ExtrudeGeometry(winShape, {
        depth: 0.03,
        bevelEnabled: true,
        bevelThickness: 0.014,
        bevelSize: 0.012,
        bevelSegments: 3,
        curveSegments: 12,
      })
    );
    winGeo.center();

    const frameGeo = trackGeo(
      new THREE.ExtrudeGeometry(frameShape, {
        depth: 0.022,
        bevelEnabled: true,
        bevelThickness: 0.012,
        bevelSize: 0.01,
        bevelSegments: 2,
        curveSegments: 12,
      })
    );
    frameGeo.center();

    const stAtZ = sampleStationAtZ(fullProfileStations, cfg.z);
    const syNorm = Math.min(0.92, Math.abs(cfg.y - stAtZ.yCenter) / Math.max(0.1, stAtZ.halfHeightTop));
    const flushX =
      stAtZ.halfWidth *
      Math.pow(Math.max(0.12, 1 - Math.pow(syNorm, stAtZ.roundness)), 1 / stAtZ.roundness);

    for (const side of [-1, 1]) {
      const frameMesh = new THREE.Mesh(frameGeo, darkMetalMat);
      frameMesh.rotation.order = 'YXZ';
      frameMesh.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
      frameMesh.rotation.x = -0.11; // Hugs upper cabin tumblehome curvature
      frameMesh.position.set(side * (flushX - 0.008), cfg.y, cfg.z);
      bodyGroup.add(frameMesh);

      const glassPane = new THREE.Mesh(winGeo, cockpitGlassMat);
      glassPane.rotation.order = 'YXZ';
      glassPane.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
      glassPane.rotation.x = -0.11;
      glassPane.position.set(side * (flushX + 0.008), cfg.y, cfg.z);
      glassPane.renderOrder = 2;
      bodyGroup.add(glassPane);
    }
  }

  // First-person Cockpit interior dashboard (visible ONLY in Cockpit camera mode)
  const cockpitDashGroup = new THREE.Group();
  cockpitDashGroup.visible = false;
  const dashMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.78, metalness: 0.22 })
  );
  const avionicsCyanMat = trackMat(new THREE.MeshBasicMaterial({ color: 0x38bdf8 }));
  const avionicsGreenMat = trackMat(new THREE.MeshBasicMaterial({ color: 0x34d399 }));

  const fpGlare = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.76, 0.84, 0.16, 20, 1, false, -Math.PI * 0.5, Math.PI)),
    dashMat
  );
  fpGlare.scale.set(1.0, 1.0, 0.52);
  fpGlare.position.set(0, 1.56, -2.55);
  cockpitDashGroup.add(fpGlare);

  const mfdLeft = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(0.30, 0.10)), avionicsCyanMat);
  mfdLeft.position.set(-0.26, 1.60, -2.28);
  mfdLeft.rotation.x = -0.32;
  cockpitDashGroup.add(mfdLeft);

  const mfdRight = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(0.30, 0.10)), avionicsGreenMat);
  mfdRight.position.set(0.26, 1.60, -2.28);
  mfdRight.rotation.x = -0.32;
  cockpitDashGroup.add(mfdRight);

  for (const side of [-1, 1]) {
    const fpPillar = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.026, 0.03, 0.86, 8)),
      dashMat
    );
    fpPillar.position.set(side * 0.78, 1.98, -2.42);
    fpPillar.rotation.x = 0.56;
    fpPillar.rotation.z = side * 0.14;
    cockpitDashGroup.add(fpPillar);
  }
  bodyGroup.add(cockpitDashGroup);

  const cockpitCamLocalPos = new THREE.Vector3(0, 1.92, -1.96);

  // === 3. TRANSPARENT CANVAS TEXTURE LIVERY DECALS ("FDMA", "JA01FD", "AS365N3") ===
  const fuselageDecalTexLeft = createFuselageDecalTexture(maxAnisotropy, 'left');
  const fuselageDecalTexRight = createFuselageDecalTexture(maxAnisotropy, 'right');
  textures.push(fuselageDecalTexLeft, fuselageDecalTexRight);

  const fuselageDecalMatLeft = trackMat(
    new THREE.MeshStandardMaterial({
      map: fuselageDecalTexLeft,
      transparent: true,
      alphaTest: 0.04,
      roughness: 0.22,
      metalness: 0.08,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      side: THREE.DoubleSide,
    })
  );
  const fuselageDecalMatRight = trackMat(
    new THREE.MeshStandardMaterial({
      map: fuselageDecalTexRight,
      transparent: true,
      alphaTest: 0.04,
      roughness: 0.22,
      metalness: 0.08,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      side: THREE.DoubleSide,
    })
  );

  const decalStations: LoftStation[] = [];
  for (let i = 0; i <= 18; i++) {
    const z = THREE.MathUtils.lerp(-2.55, 2.32, i / 18);
    decalStations.push(sampleStationAtZ(fullProfileStations, z));
  }

  // Right (+X) fuselage decal patch (u = 1 at nose, u = 0 at tail -> reads left-to-right!)
  const rightDecalGeo = trackGeo(
    buildHullConformPatch(decalStations, -Math.PI * 0.24, Math.PI * 0.24, 0.018, 14, true)
  );
  const rightDecal = new THREE.Mesh(rightDecalGeo, fuselageDecalMatRight);
  rightDecal.renderOrder = 3;
  bodyGroup.add(rightDecal);

  // Left (-X) fuselage decal patch (u = 0 at nose, u = 1 at tail -> reads left-to-right!)
  const leftDecalGeo = trackGeo(
    buildHullConformPatch(decalStations, Math.PI * 1.24, Math.PI * 0.76, 0.018, 14, false)
  );
  const leftDecal = new THREE.Mesh(leftDecalGeo, fuselageDecalMatLeft);
  leftDecal.renderOrder = 3;
  bodyGroup.add(leftDecal);

  // === 4. TAPERED TAIL BOOM, AIRFOIL HORIZONTAL STABILIZER & ICONIC FENESTRON ===
  const tailBoomLen = 3.85;
  const tailBoomStartZ = 2.42;
  const tailBoomCenterZ = tailBoomStartZ + tailBoomLen * 0.5;
  const tailBoomGeo = trackGeo(new THREE.CylinderGeometry(0.22, 0.44, tailBoomLen, 24));
  tailBoomGeo.rotateX(Math.PI / 2);
  tailBoomGeo.scale(0.84, 1.0, 1.0); // Sleek oval aerodynamic tail boom cross-section
  const tailBoom = new THREE.Mesh(tailBoomGeo, primaryMat);
  tailBoom.position.set(0, 1.76, tailBoomCenterZ);
  tailBoom.rotation.x = -0.025;
  tailBoom.castShadow = true;
  tailBoom.receiveShadow = true;
  bodyGroup.add(tailBoom);

  // White racing/rescue band continuing onto mid tail boom
  const tailBandGeo = trackGeo(new THREE.CylinderGeometry(0.32, 0.35, 0.55, 24));
  tailBandGeo.rotateX(Math.PI / 2);
  tailBandGeo.scale(0.855, 1.01, 1.0);
  const tailBand = new THREE.Mesh(tailBandGeo, secondaryMat);
  tailBand.position.set(0, 1.75, 3.68);
  bodyGroup.add(tailBand);

  // Airfoil Horizontal Stabilizer spanning across tail boom + Dual Swept Endplate Fins
  const airfoilShape = new THREE.Shape();
  airfoilShape.moveTo(-0.42, 0);
  airfoilShape.quadraticCurveTo(-0.22, 0.075, 0.05, 0.055);
  airfoilShape.quadraticCurveTo(0.28, 0.032, 0.42, 0);
  airfoilShape.quadraticCurveTo(0.28, -0.032, 0.05, -0.055);
  airfoilShape.quadraticCurveTo(-0.22, -0.075, -0.42, 0);

  const hStabSpan = 3.16;
  const hStabGeo = trackGeo(
    new THREE.ExtrudeGeometry(airfoilShape, {
      depth: hStabSpan,
      bevelEnabled: true,
      bevelThickness: 0.03,
      bevelSize: 0.02,
      bevelSegments: 3,
      curveSegments: 14,
    })
  );
  hStabGeo.center();
  hStabGeo.rotateY(-Math.PI / 2); // Span along X, thick airfoil leading edge facing -Z
  const hStab = new THREE.Mesh(hStabGeo, primaryMat);
  hStab.position.set(0, 1.76, 4.78);
  hStab.castShadow = true;
  bodyGroup.add(hStab);

  // Swept Aerodynamic Endplates at both horizontal stabilizer tips
  const endplateShape = new THREE.Shape();
  endplateShape.moveTo(-0.36, -0.34);
  endplateShape.lineTo(0.24, -0.30);
  endplateShape.quadraticCurveTo(0.42, 0.05, 0.48, 0.44);
  endplateShape.lineTo(0.06, 0.44);
  endplateShape.quadraticCurveTo(-0.26, 0.04, -0.36, -0.34);

  const endplateGeo = trackGeo(
    new THREE.ExtrudeGeometry(endplateShape, {
      depth: 0.045,
      bevelEnabled: true,
      bevelThickness: 0.018,
      bevelSize: 0.016,
      bevelSegments: 3,
      curveSegments: 10,
    })
  );
  endplateGeo.center();
  endplateGeo.rotateY(-Math.PI / 2);

  for (const side of [-1, 1]) {
    const ep = new THREE.Mesh(endplateGeo, primaryMat);
    ep.position.set(side * (hStabSpan * 0.5 + 0.02), 1.84, 4.82);
    ep.rotation.z = side * -0.08;
    ep.castShadow = true;
    bodyGroup.add(ep);

    // Crisp white leading accent strip on endplate
    const epTip = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.028, 0.028, 0.72, 8)),
      secondaryMat
    );
    epTip.position.set(side * (hStabSpan * 0.5 + 0.02), 1.86, 4.58);
    epTip.rotation.x = 0.42;
    bodyGroup.add(epTip);
  }

  // === ICONIC FENESTRON DUCTED TAIL FIN (Real Circular Hole Cutout + Swept Fin + 10 Blades) ===
  const fenCenterY = 1.92;
  const fenCenterZ = 6.32;
  const fenHoleRadius = 0.56;

  // 2D side silhouette in (u = Z offset, v = Y offset) centered on the Fenestron duct
  const finShape = new THREE.Shape();
  finShape.moveTo(-0.84, -0.36);
  finShape.quadraticCurveTo(-0.56, -0.78, 0.04, -0.82); // Rounded bottom shroud lip
  finShape.quadraticCurveTo(0.66, -0.78, 0.84, -0.18);  // Rounded aft shroud curve
  finShape.quadraticCurveTo(1.06, 0.62, 1.32, 1.56);    // Swept trailing edge of vertical fin
  finShape.quadraticCurveTo(1.26, 1.72, 1.02, 1.70);    // Smooth rounded fin tip
  finShape.lineTo(0.46, 1.66);                          // Fin crest
  finShape.quadraticCurveTo(-0.08, 1.05, -0.58, 0.42);  // Swept leading edge flowing into tail boom
  finShape.quadraticCurveTo(-0.88, 0.06, -0.84, -0.36);

  // Punch the real circular Fenestron duct opening right through the tail fin!
  const fenHole = new THREE.Path();
  fenHole.absarc(0, 0, fenHoleRadius, 0, Math.PI * 2, true);
  finShape.holes.push(fenHole);

  const finDepth = 0.16;
  const fenFinGeo = trackGeo(
    new THREE.ExtrudeGeometry(finShape, {
      depth: finDepth,
      bevelEnabled: true,
      bevelThickness: 0.09,
      bevelSize: 0.065,
      bevelSegments: 5,
      curveSegments: 24,
    })
  );
  // Center thickness along local Z then rotate so local X -> world +Z and local Z -> world X
  fenFinGeo.translate(0, 0, -finDepth * 0.5);
  fenFinGeo.rotateY(-Math.PI / 2);

  const fenFinMesh = new THREE.Mesh(fenFinGeo, primaryMat);
  fenFinMesh.position.set(0, fenCenterY, fenCenterZ);
  fenFinMesh.castShadow = true;
  fenFinMesh.receiveShadow = true;
  bodyGroup.add(fenFinMesh);

  // Smooth inner metallic shroud liner ring + rounded duct lip torus
  const ductLinerGeo = trackGeo(new THREE.CylinderGeometry(fenHoleRadius - 0.01, fenHoleRadius - 0.01, 0.28, 28, 1, true));
  ductLinerGeo.rotateZ(Math.PI / 2);
  const ductLiner = new THREE.Mesh(ductLinerGeo, darkMetalMat);
  ductLiner.material.side = THREE.DoubleSide;
  ductLiner.position.set(0, fenCenterY, fenCenterZ);
  bodyGroup.add(ductLiner);

  for (const side of [-1, 1]) {
    const lipTorus = new THREE.Mesh(
      trackGeo(new THREE.TorusGeometry(fenHoleRadius + 0.01, 0.036, 10, 28)),
      primaryMat
    );
    lipTorus.rotation.y = Math.PI / 2;
    lipTorus.position.set(side * 0.125, fenCenterY, fenCenterZ);
    bodyGroup.add(lipTorus);
  }

  // Ventral tail bumper skeg under Fenestron duct
  const skegShape = new THREE.Shape();
  skegShape.moveTo(-0.46, 0.08);
  skegShape.lineTo(0.24, 0.06);
  skegShape.quadraticCurveTo(0.18, -0.34, -0.14, -0.38);
  skegShape.quadraticCurveTo(-0.38, -0.24, -0.46, 0.08);
  const skegGeo = trackGeo(
    new THREE.ExtrudeGeometry(skegShape, {
      depth: 0.05,
      bevelEnabled: true,
      bevelThickness: 0.02,
      bevelSize: 0.018,
      bevelSegments: 2,
    })
  );
  skegGeo.translate(0, 0, -0.025);
  skegGeo.rotateY(-Math.PI / 2);
  const skegMesh = new THREE.Mesh(skegGeo, secondaryMat);
  skegMesh.position.set(0, fenCenterY - 0.72, fenCenterZ - 0.05);
  bodyGroup.add(skegMesh);

  // "AS365N3" Tail Fin Decals on both flanks of the upper swept fin
  const tailDecalTex = createTailFinDecalTexture(maxAnisotropy);
  textures.push(tailDecalTex);
  const tailDecalMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: tailDecalTex,
      transparent: true,
      alphaTest: 0.04,
      roughness: 0.24,
      metalness: 0.08,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    })
  );
  const tailDecalGeo = trackGeo(new THREE.PlaneGeometry(0.92, 0.46));
  for (const side of [-1, 1]) {
    const finDecal = new THREE.Mesh(tailDecalGeo, tailDecalMat);
    finDecal.position.set(side * 0.165, fenCenterY + 1.05, fenCenterZ + 0.56);
    finDecal.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    finDecal.renderOrder = 3;
    bodyGroup.add(finDecal);
  }

  // Static Fenestron gearbox stator vanes (3 slender arms holding the central hub)
  const statorGeo = trackGeo(new THREE.CylinderGeometry(0.022, 0.026, fenHoleRadius * 0.96, 8));
  for (let i = 0; i < 3; i++) {
    const ang = (i * Math.PI * 2) / 3 + 0.45;
    const stator = new THREE.Mesh(statorGeo, darkMetalMat);
    stator.position.set(
      -0.06,
      fenCenterY + Math.cos(ang) * fenHoleRadius * 0.48,
      fenCenterZ + Math.sin(ang) * fenHoleRadius * 0.48
    );
    stator.rotation.x = ang;
    bodyGroup.add(stator);
  }

  // Spinning Fenestron 10-Blade Rotor Assembly inside the circular shroud
  const tailRotorGroup = new THREE.Group();
  tailRotorGroup.position.set(0.02, fenCenterY, fenCenterZ);
  bodyGroup.add(tailRotorGroup);

  const fenHubGeo = trackGeo(new THREE.CylinderGeometry(0.145, 0.145, 0.22, 16));
  fenHubGeo.rotateZ(Math.PI / 2);
  const fenHub = new THREE.Mesh(fenHubGeo, darkMetalMat);
  tailRotorGroup.add(fenHub);

  const fenSpinner = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.13, 12, 10)), primaryMat);
  fenSpinner.scale.set(0.65, 1, 1);
  fenSpinner.position.x = 0.11;
  tailRotorGroup.add(fenSpinner);

  // 10 short asymmetrical Fenestron blades (real AS365 N3 trademark anti-noise staggered spacing!)
  const fenBladeCount = 10;
  const fenBladeGeo = trackGeo(new THREE.CapsuleGeometry(0.026, 0.34, 4, 8));
  fenBladeGeo.scale(0.32, 1.0, 1.35);
  for (let i = 0; i < fenBladeCount; i++) {
    const stagger = (i % 2 === 0 ? 0.04 : -0.04);
    const ang = (i * Math.PI * 2) / fenBladeCount + stagger;
    const bPivot = new THREE.Group();
    bPivot.rotation.x = ang;

    const blade = new THREE.Mesh(fenBladeGeo, bladeMat);
    blade.position.set(0, 0.33, 0);
    blade.rotation.y = 0.28; // Collective pitch twist
    bPivot.add(blade);
    tailRotorGroup.add(bPivot);
  }

  const blurTex = createRotorBlurTexture(maxAnisotropy);
  textures.push(blurTex);

  const tailBlurMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: blurTex,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  const tailRotorBlur = new THREE.Mesh(
    trackGeo(new THREE.CircleGeometry(fenHoleRadius - 0.03, 28)),
    tailBlurMat
  );
  tailRotorBlur.rotation.y = Math.PI / 2;
  tailRotorGroup.add(tailRotorBlur);

  // === 5. DETAILED 4-BLADE MAIN ROTOR (ROUNDED RED STARFLEX CAP + WHITE STRIPED BLADES) ===
  const mastX = 0;
  const mastZ = -0.18;
  const mastBaseY = 2.68;

  const mastCollar = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.24, 0.34, 0.26, 20)),
    darkMetalMat
  );
  mastCollar.position.set(mastX, mastBaseY, mastZ);
  bodyGroup.add(mastCollar);

  const mastShaft = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.14, 0.16, 0.52, 16)),
    chromeMat
  );
  mastShaft.position.set(mastX, mastBaseY + 0.32, mastZ);
  mastShaft.castShadow = true;
  bodyGroup.add(mastShaft);

  // Cyclic swashplate + 4 pitch-control pushrods
  const swashplate = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.32, 0.32, 0.08, 20)),
    darkMetalMat
  );
  swashplate.position.set(mastX, mastBaseY + 0.24, mastZ);
  bodyGroup.add(swashplate);

  const pushrodGeo = trackGeo(new THREE.CylinderGeometry(0.018, 0.018, 0.34, 6));
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    const rod = new THREE.Mesh(pushrodGeo, chromeMat);
    rod.position.set(mastX + Math.cos(a) * 0.24, mastBaseY + 0.38, mastZ + Math.sin(a) * 0.24);
    bodyGroup.add(rod);
  }

  const mainRotorGroup = new THREE.Group();
  mainRotorGroup.position.set(mastX, mastBaseY + 0.56, mastZ);
  bodyGroup.add(mainRotorGroup);

  // Starflex composite hub + iconic rounded glossy red upper cap (LatheGeometry)
  const hubBase = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.42, 0.34, 0.16, 24)),
    darkMetalMat
  );
  mainRotorGroup.add(hubBase);

  const capPoints = [
    new THREE.Vector2(0.0, 0.24),
    new THREE.Vector2(0.16, 0.23),
    new THREE.Vector2(0.32, 0.18),
    new THREE.Vector2(0.43, 0.09),
    new THREE.Vector2(0.46, 0.0),
  ];
  const rotorCap = new THREE.Mesh(trackGeo(new THREE.LatheGeometry(capPoints, 28)), primaryMat);
  rotorCap.position.y = 0.06;
  rotorCap.castShadow = true;
  mainRotorGroup.add(rotorCap);

  // 4 Long Slender Aerodynamic Main Rotor Blades (dark gray-black + high-visibility white stripes)
  const bladeLen = 5.55;
  const bladeSection = new THREE.Shape();
  bladeSection.moveTo(-0.14, 0);
  bladeSection.quadraticCurveTo(-0.08, 0.026, 0.04, 0.018);
  bladeSection.lineTo(0.14, 0);
  bladeSection.lineTo(0.04, -0.015);
  bladeSection.quadraticCurveTo(-0.08, -0.022, -0.14, 0);

  const bladeExtrudeGeo = trackGeo(
    new THREE.ExtrudeGeometry(bladeSection, {
      depth: bladeLen,
      bevelEnabled: false,
      curveSegments: 6,
    })
  );

  const stripeExtrudeGeo = trackGeo(
    new THREE.ExtrudeGeometry(bladeSection, {
      depth: 0.34,
      bevelEnabled: false,
      curveSegments: 6,
    })
  );
  stripeExtrudeGeo.scale(1.03, 1.18, 1.0);

  const gripGeo = trackGeo(new THREE.CylinderGeometry(0.075, 0.095, 0.52, 10));
  gripGeo.rotateX(Math.PI / 2);

  for (let i = 0; i < 4; i++) {
    const bladePivot = new THREE.Group();
    bladePivot.rotation.y = (i * Math.PI) / 2;

    const grip = new THREE.Mesh(gripGeo, darkMetalMat);
    grip.position.set(0, 0, 0.38);
    bladePivot.add(grip);

    const blade = new THREE.Mesh(bladeExtrudeGeo, bladeMat);
    blade.position.set(0, 0, 0.54);
    blade.rotation.z = -0.05; // Slight aerodynamic pitch angle
    blade.castShadow = true;
    bladePivot.add(blade);

    // Dual crisp high-visibility white stripes on each blade
    const stripeInner = new THREE.Mesh(stripeExtrudeGeo, bladeStripeMat);
    stripeInner.position.set(0, 0, bladeLen - 0.55);
    stripeInner.rotation.z = -0.05;
    bladePivot.add(stripeInner);

    const stripeTip = new THREE.Mesh(stripeExtrudeGeo, bladeStripeMat);
    stripeTip.position.set(0, 0, bladeLen + 0.16);
    stripeTip.rotation.z = -0.05;
    bladePivot.add(stripeTip);

    mainRotorGroup.add(bladePivot);
  }

  // Smooth translucent rotor motion-blur disc
  const blurMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: blurTex,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  const mainRotorBlur = new THREE.Mesh(
    trackGeo(new THREE.CircleGeometry(bladeLen + 0.56, 40)),
    blurMat
  );
  mainRotorBlur.rotation.x = -Math.PI / 2;
  mainRotorBlur.position.y = -0.015;
  mainRotorGroup.add(mainRotorBlur);

  // === 6. EXTERNAL RIGHT-SIDE RESCUE HOIST POD (GUINCHO LATERAL — ACIMA DA PORTA DIREITA) ===
  const hoistGroup = new THREE.Group();
  hoistGroup.position.set(1.06, 2.08, -0.35);
  bodyGroup.add(hoistGroup);

  // Curved tubular support bracket arching from upper right fuselage frame
  const hoistArmCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.16, 0.06, -0.22),
    new THREE.Vector3(0.08, 0.14, -0.10),
    new THREE.Vector3(0.28, 0.10, 0.02),
  ]);
  const hoistArm = new THREE.Mesh(
    trackGeo(new THREE.TubeGeometry(hoistArmCurve, 12, 0.036, 10, false)),
    darkMetalMat
  );
  hoistGroup.add(hoistArm);

  const hoistStrutRear = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.028, 0.028, 0.44, 8)),
    darkMetalMat
  );
  hoistStrutRear.position.set(0.04, 0.0, 0.16);
  hoistStrutRear.rotation.z = 1.18;
  hoistStrutRear.rotation.y = 0.45;
  hoistGroup.add(hoistStrutRear);

  // Aerodynamic cylindrical rescue hoist motor pod (glossy red + white band)
  const hoistPodGeo = trackGeo(new THREE.CapsuleGeometry(0.145, 0.42, 8, 16));
  hoistPodGeo.rotateX(Math.PI / 2);
  const hoistPod = new THREE.Mesh(hoistPodGeo, primaryMat);
  hoistPod.position.set(0.28, 0.08, 0.0);
  hoistPod.castShadow = true;
  hoistGroup.add(hoistPod);

  const hoistBand = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.15, 0.15, 0.09, 16)),
    secondaryMat
  );
  hoistBand.rotation.x = Math.PI / 2;
  hoistBand.position.set(0.28, 0.08, 0.04);
  hoistGroup.add(hoistBand);

  // Pulley fairlead housing & stowed rescue hook at hoist exit
  const fairlead = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.065, 0.08, 0.12, 12)),
    chromeMat
  );
  fairlead.position.set(0.32, -0.08, -0.12);
  hoistGroup.add(fairlead);

  const stowedHook = new THREE.Mesh(
    trackGeo(new THREE.TorusGeometry(0.042, 0.014, 8, 14, Math.PI * 1.45)),
    accentMat
  );
  stowedHook.position.set(0.32, -0.18, -0.12);
  hoistGroup.add(stowedHook);

  // Exact world-convertible anchor where the rescue winch cable exits when pressing [R]
  const winchAnchor = new THREE.Object3D();
  winchAnchor.position.set(0.32, -0.14, -0.12);
  hoistGroup.add(winchAnchor);

  // === 7. RETRACTABLE TRICYCLE WHEELED LANDING GEAR (1 TWIN NOSE + 2 MAIN WHEELS) ===
  const buildAircraftWheel = (outerRadius: number, tireTube: number): THREE.Group => {
    const wg = new THREE.Group();
    const tire = new THREE.Mesh(
      trackGeo(new THREE.TorusGeometry(outerRadius - tireTube, tireTube, 12, 22)),
      tireMat
    );
    tire.rotation.y = Math.PI / 2;
    tire.castShadow = true;
    wg.add(tire);

    const rim = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(outerRadius - tireTube * 1.35, outerRadius - tireTube * 1.35, tireTube * 1.35, 16)),
      chromeMat
    );
    rim.rotation.z = Math.PI / 2;
    wg.add(rim);

    const hubCap = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(outerRadius * 0.24, outerRadius * 0.24, tireTube * 1.55, 12)),
      darkMetalMat
    );
    hubCap.rotation.z = Math.PI / 2;
    wg.add(hubCap);
    return wg;
  };

  // 7A. Retractable Twin Nose Wheel Assembly (pivots smoothly aft into nose bay)
  const noseGearPivot = new THREE.Group();
  noseGearPivot.position.set(0, 0.84, -2.56);
  bodyGroup.add(noseGearPivot);

  const noseUpperLeg = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.055, 0.048, 0.42, 12)),
    darkMetalMat
  );
  noseUpperLeg.position.set(0, -0.22, 0);
  noseGearPivot.add(noseUpperLeg);

  const noseOleo = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.036, 0.036, 0.34, 10)),
    chromeMat
  );
  noseOleo.position.set(0, -0.46, 0);
  noseGearPivot.add(noseOleo);

  const noseAxle = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.026, 0.026, 0.34, 10)),
    chromeMat
  );
  noseAxle.rotation.z = Math.PI / 2;
  noseAxle.position.set(0, -0.62, 0);
  noseGearPivot.add(noseAxle);

  for (const side of [-1, 1]) {
    const nWheel = buildAircraftWheel(0.22, 0.075);
    nWheel.position.set(side * 0.135, -0.62, 0);
    noseGearPivot.add(nWheel);
  }

  // Twin hinged nose wheel-well bay doors
  const noseDoorGeo = trackGeo(new THREE.CylinderGeometry(0.16, 0.16, 0.56, 8, 1, false, 0, Math.PI * 0.45));
  noseDoorGeo.rotateX(Math.PI / 2);
  const noseDoors: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const doorPivot = new THREE.Group();
    doorPivot.position.set(side * 0.24, 0.80, -2.35);
    const doorMesh = new THREE.Mesh(noseDoorGeo, primaryMat);
    doorMesh.position.set(side * -0.08, -0.04, 0);
    doorMesh.rotation.z = side > 0 ? 0.5 : -0.5;
    doorPivot.add(doorMesh);
    bodyGroup.add(doorPivot);
    noseDoors.push(doorPivot);
  }

  // 7B. Retractable Left & Right Main Landing Gear Assemblies (fold inward/upward into cheek sponsons)
  const mainGearPivots: Array<{ side: number; pivot: THREE.Group; door: THREE.Group }> = [];
  const mainDoorGeo = trackGeo(new THREE.CapsuleGeometry(0.12, 0.44, 4, 10));
  mainDoorGeo.scale(0.25, 1.0, 1.0);

  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.94, 0.82, 0.92);
    bodyGroup.add(pivot);

    const upperStrut = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.062, 0.054, 0.44, 12)),
      darkMetalMat
    );
    upperStrut.position.set(side * 0.08, -0.22, 0);
    upperStrut.rotation.z = side * 0.24;
    pivot.add(upperStrut);

    const lowerOleo = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.042, 0.042, 0.34, 10)),
      chromeMat
    );
    lowerOleo.position.set(side * 0.14, -0.44, 0);
    lowerOleo.rotation.z = side * 0.12;
    pivot.add(lowerOleo);

    const mainWheel = buildAircraftWheel(0.27, 0.095);
    mainWheel.position.set(side * 0.20, -0.55, 0);
    pivot.add(mainWheel);

    const doorPivot = new THREE.Group();
    doorPivot.position.set(side * 1.18, 0.82, 0.92);
    const doorMesh = new THREE.Mesh(mainDoorGeo, primaryMat);
    doorMesh.position.set(0, -0.22, 0);
    doorPivot.add(doorMesh);
    bodyGroup.add(doorPivot);

    mainGearPivots.push({ side, pivot, door: doorPivot });
  }

  let gearDeployState = 1.0; // 1 = deployed (touching y = 0), 0 = retracted flush inside fuselage

  const applyGearPose = (deploy: number) => {
    const retracted = 1 - deploy;
    // Nose gear swings aft cleanly into forward fuselage bay
    noseGearPivot.rotation.x = -retracted * 1.48;
    noseGearPivot.position.y = 0.84 + retracted * 0.16;
    noseGearPivot.scale.setScalar(THREE.MathUtils.lerp(0.62, 1.0, deploy));
    noseGearPivot.visible = deploy > 0.05;

    for (let i = 0; i < noseDoors.length; i++) {
      const side = i === 0 ? -1 : 1;
      noseDoors[i].rotation.z = side * deploy * 0.95;
    }

    // Main gear legs fold inward & upward into the curved cheek sponsons
    for (let i = 0; i < mainGearPivots.length; i++) {
      const { side, pivot, door } = mainGearPivots[i];
      pivot.rotation.z = side * -retracted * 1.42;
      pivot.position.y = 0.82 + retracted * 0.14;
      pivot.scale.setScalar(THREE.MathUtils.lerp(0.58, 1.0, deploy));
      pivot.visible = deploy > 0.05;
      door.rotation.z = side * deploy * 0.72;
    }
  };
  applyGearPose(1.0);

  // === 8. FINAL DETAILS: NOSE LANDING LIGHT, SLENDER ANTENNAS & AVIATION NAV/STROBE LIGHTS ===
  // Warm bright Landing Light recessed under nose chin
  const landingLampHousing = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.11, 0.14, 0.18, 14)),
    darkMetalMat
  );
  landingLampHousing.rotation.x = Math.PI / 2 + 0.14;
  landingLampHousing.position.set(0, 0.86, -3.56);
  bodyGroup.add(landingLampHousing);

  const landingLampLens = new THREE.Mesh(
    trackGeo(new THREE.SphereGeometry(0.095, 12, 10)),
    landingLightMat
  );
  landingLampLens.position.set(0, 0.85, -3.64);
  bodyGroup.add(landingLampLens);

  const landingLampGlowMat = trackMat(
    new THREE.SpriteMaterial({
      map: glowTex,
      color: 0xfff4c2,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  const landingLampGlow = new THREE.Sprite(landingLampGlowMat);
  landingLampGlow.position.set(0, 0.85, -3.70);
  landingLampGlow.scale.set(1.25, 1.25, 1);
  bodyGroup.add(landingLampGlow);

  // Slender belly & tail antennas (VHF whip, towel-bar ADF loop, dorsal fin antenna)
  const bellyBladeAntenna = new THREE.Mesh(
    trackGeo(new THREE.ConeGeometry(0.032, 0.34, 8)),
    darkMetalMat
  );
  bellyBladeAntenna.scale.set(0.32, 1.0, 1.45);
  bellyBladeAntenna.rotation.x = Math.PI - 0.32;
  bellyBladeAntenna.position.set(0, 0.60, 0.45);
  bodyGroup.add(bellyBladeAntenna);

  const tailWhipAntenna = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.012, 0.02, 0.62, 6)),
    darkMetalMat
  );
  tailWhipAntenna.position.set(0, 1.28, 3.45);
  tailWhipAntenna.rotation.x = -0.58;
  bodyGroup.add(tailWhipAntenna);

  const towelBarCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 1.44, 2.75),
    new THREE.Vector3(0, 1.30, 2.95),
    new THREE.Vector3(0, 1.32, 4.05),
    new THREE.Vector3(0, 1.54, 4.25),
  ]);
  const towelBar = new THREE.Mesh(
    trackGeo(new THREE.TubeGeometry(towelBarCurve, 14, 0.015, 6, false)),
    darkMetalMat
  );
  bodyGroup.add(towelBar);

  const dorsalVhf = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.014, 0.024, 0.58, 6)),
    darkMetalMat
  );
  dorsalVhf.position.set(0, 2.52, 1.88);
  dorsalVhf.rotation.x = -0.35;
  bodyGroup.add(dorsalVhf);

  // Streamlined Port Red (-X) & Starboard Green (+X) Navigation Lights on Sponson Flanks
  let navRedGlow!: THREE.Sprite;
  let navGreenGlow!: THREE.Sprite;

  for (const side of [-1, 1]) {
    const navFairing = new THREE.Mesh(
      trackGeo(new THREE.CapsuleGeometry(0.07, 0.22, 6, 10)),
      darkMetalMat
    );
    navFairing.rotation.x = Math.PI / 2;
    navFairing.position.set(side * 1.28, 1.04, 0.52);
    bodyGroup.add(navFairing);

    const navBulb = new THREE.Mesh(
      trackGeo(new THREE.SphereGeometry(0.09, 10, 8)),
      side < 0 ? navRedMat : navGreenMat
    );
    navBulb.position.set(side * 1.34, 1.04, 0.42);
    bodyGroup.add(navBulb);

    const navGlowMat = trackMat(
      new THREE.SpriteMaterial({
        map: glowTex,
        color: side < 0 ? 0xff4444 : 0x22ff66,
        transparent: true,
        opacity: 0.38,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    const navGlow = new THREE.Sprite(navGlowMat);
    navGlow.position.copy(navBulb.position);
    navGlow.scale.set(1.65, 1.65, 1);
    bodyGroup.add(navGlow);
    if (side < 0) navRedGlow = navGlow;
    else navGreenGlow = navGlow;
  }

  // Anti-collision Strobe Beacon atop the swept Fenestron vertical tail fin
  const beaconLightMesh = new THREE.Mesh(
    trackGeo(new THREE.SphereGeometry(0.11, 10, 8)),
    beaconMat
  );
  beaconLightMesh.position.set(0, fenCenterY + 1.72, fenCenterZ + 0.88);
  bodyGroup.add(beaconLightMesh);

  const beaconGlowMat = trackMat(
    new THREE.SpriteMaterial({
      map: glowTex,
      color: 0xffffff,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  const beaconGlow = new THREE.Sprite(beaconGlowMat);
  beaconGlow.position.copy(beaconLightMesh.position);
  beaconGlow.scale.set(2.3, 2.3, 1);
  bodyGroup.add(beaconGlow);

  // === 9. 360° ARTICULATED NOSE SEARCHLIGHT GIMBAL (COMPATIBLE WITH KEY [L]) ===
  const gimbalMountPos = new THREE.Vector3(0.28, 0.68, -2.92);

  const gimbalBase = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.16, 0.20, 0.14, 12)),
    darkMetalMat
  );
  gimbalBase.position.set(gimbalMountPos.x, gimbalMountPos.y + 0.10, gimbalMountPos.z);
  bodyGroup.add(gimbalBase);

  const searchlightGimbal = new THREE.Group();
  searchlightGimbal.position.copy(gimbalMountPos);
  bodyGroup.add(searchlightGimbal);

  const housingGeo = trackGeo(new THREE.CylinderGeometry(0.15, 0.22, 0.38, 12));
  housingGeo.rotateX(-Math.PI / 2);
  const searchHousing = new THREE.Mesh(housingGeo, darkMetalMat);
  searchHousing.position.set(0, 0, 0.04);
  searchlightGimbal.add(searchHousing);

  const searchBulb = new THREE.Mesh(
    trackGeo(new THREE.SphereGeometry(0.16, 10, 8)),
    searchlightBulbMat
  );
  searchBulb.position.set(0, 0, 0.22);
  searchlightGimbal.add(searchBulb);

  const searchlight = new THREE.SpotLight(0xfff5d6, 0, 310, SEARCHLIGHT_SPOT_ANGLE, 0.28, 0.82);
  searchlight.position.set(0, 0, 0.24);
  searchlightGimbal.add(searchlight);

  const searchlightTarget = new THREE.Object3D();
  searchlightTarget.position.set(0, -18, -32);
  searchlight.target = searchlightTarget;

  const coneGeo = trackGeo(new THREE.ConeGeometry(1, 1, 24, 1, true));
  coneGeo.translate(0, -0.5, 0);
  coneGeo.rotateX(-Math.PI / 2);
  const coneMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xfff3c4,
      transparent: true,
      opacity: 0.09,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    })
  );
  const searchlightCone = new THREE.Mesh(coneGeo, coneMat);
  searchlightCone.visible = false;
  searchlightCone.frustumCulled = false;

  // === 10. VENTRAL NOZZLE & BAMBI BUCKET (COMPATIBLE WITH KEY [B]) ===
  const bellyNozzleAnchor = new THREE.Object3D();
  bellyNozzleAnchor.position.set(0, 0.56, 0.05);
  bodyGroup.add(bellyNozzleAnchor);

  const bucketPivot = new THREE.Group();
  bucketPivot.visible = false;

  const hookRing = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.13, 0.13, 0.2, 10)),
    darkMetalMat
  );
  hookRing.position.y = -0.1;
  bucketPivot.add(hookRing);

  const mainCableLen = BAMBI_CABLE_LENGTH - 1.65;
  const cableMesh = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.036, 0.036, mainCableLen, 6)),
    darkMetalMat
  );
  cableMesh.position.y = -mainCableLen / 2 - 0.1;
  bucketPivot.add(cableMesh);

  const bridleY = -mainCableLen - 0.1;
  const strapGeo = trackGeo(new THREE.CylinderGeometry(0.024, 0.024, 1.35, 6));
  for (let i = 0; i < 4; i++) {
    const ang = (i * Math.PI) / 2 + Math.PI / 4;
    const strap = new THREE.Mesh(strapGeo, accentMat);
    strap.position.set(Math.cos(ang) * 0.48, bridleY - 0.56, Math.sin(ang) * 0.48);
    strap.rotation.z = Math.cos(ang) * 0.62;
    strap.rotation.x = -Math.sin(ang) * 0.62;
    bucketPivot.add(strap);
  }

  const bucketCenterY = -BAMBI_CABLE_LENGTH;
  const bucketBody = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(1.02, 0.58, 1.48, 16)),
    orangeBucketMat
  );
  bucketBody.position.y = bucketCenterY;
  bucketBody.castShadow = true;
  bucketPivot.add(bucketBody);

  const bucketRim = new THREE.Mesh(
    trackGeo(new THREE.TorusGeometry(1.02, 0.085, 8, 20)),
    accentMat
  );
  bucketRim.rotation.x = Math.PI / 2;
  bucketRim.position.y = bucketCenterY + 0.72;
  bucketPivot.add(bucketRim);

  const bucketBand = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.86, 0.76, 0.24, 16)),
    accentMat
  );
  bucketBand.position.y = bucketCenterY + 0.05;
  bucketPivot.add(bucketBand);

  const dumpValve = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.32, 0.24, 0.32, 12)),
    darkMetalMat
  );
  dumpValve.position.y = bucketCenterY - 0.82;
  bucketPivot.add(dumpValve);

  const bucketWaterMesh = new THREE.Mesh(
    trackGeo(new THREE.CircleGeometry(0.94, 16)),
    bucketWaterMat
  );
  bucketWaterMesh.rotation.x = -Math.PI / 2;
  bucketWaterMesh.position.y = bucketCenterY + 0.66;
  bucketWaterMesh.visible = false;
  bucketPivot.add(bucketWaterMesh);

  const bucketNozzleAnchor = new THREE.Object3D();
  bucketNozzleAnchor.position.set(0, bucketCenterY - 0.95, 0);
  bucketPivot.add(bucketNozzleAnchor);

  // === 11. GROUND-PROJECTED CONTACT SHADOW & LANDING GUIDE RING ===
  const markerTex = createLandingMarkerTexture(maxAnisotropy);
  textures.push(markerTex);
  const landingMarkerMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: markerTex,
      color: 0xffffff,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    })
  );
  const landingMarker = new THREE.Mesh(
    trackGeo(new THREE.PlaneGeometry(7.8, 7.8)),
    landingMarkerMat
  );
  landingMarker.rotation.x = -Math.PI / 2;
  landingMarker.renderOrder = 6;

  return {
    helicopterId: 'wren',
    hasIntegratedTank: false,
    root,
    bodyGroup,
    mainRotorGroup,
    mainRotorBlur,
    tailRotorGroup,
    tailRotorBlur,
    beaconLightMesh,
    beaconMat,
    beaconGlow,
    navRedMat,
    navGreenMat,
    navRedGlow,
    navGreenGlow,
    searchlightGimbal,
    searchlight,
    searchlightTarget,
    searchlightCone,
    searchlightBulbMat,
    landingMarker,
    landingMarkerMat,
    bucketPivot,
    bucketWaterMesh,
    bucketNozzleAnchor,
    bellyNozzleAnchor,
    winchAnchor,
    cockpitCamLocalPos,
    updateLandingGear: (dt: number, deployTarget: number) => {
      const next =
        dt <= 0
          ? THREE.MathUtils.clamp(deployTarget, 0, 1)
          : THREE.MathUtils.damp(gearDeployState, deployTarget, 2.8, dt);
      if (Math.abs(next - gearDeployState) > 0.0005 || dt <= 0) {
        gearDeployState = next;
        applyGearPose(gearDeployState);
      }
    },
    applyLivery: (primaryHex, secondaryHex, accentHex) => {
      primaryMat.color.setHex(primaryHex ?? DEFAULT_PRIMARY);
      secondaryMat.color.setHex(secondaryHex ?? DEFAULT_SECONDARY);
      accentMat.color.setHex(accentHex ?? DEFAULT_ACCENT);
    },
    setCockpitView: (active) => {
      cockpitDashGroup.visible = active;
      for (let i = 0; i < cockpitHideOnFirstPerson.length; i++) {
        cockpitHideOnFirstPerson[i].visible = !active;
      }
    },
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
    },
  };
}
