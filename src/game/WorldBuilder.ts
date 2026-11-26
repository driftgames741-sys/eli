import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  AIRBASE_CENTER,
  BEACH_PAD_POS,
  BEACH_PIERS,
  BUILDING_SPECS,
  DAM_PAD_X,
  DAM_PAD_Z,
  DAM_ROTATION_Y,
  DAM_X,
  DAM_Z,
  DESERT_MESAS,
  DESERT_PAD_POS,
  DESERT_REGION,
  FARM_PAD_POS,
  FARM_REGION,
  FOREST_CAMP_POS,
  FOREST_OUTPOST_CABINS,
  FOREST_PAD_POS,
  FOREST_REGION,
  FOREST_RIVERS,
  getBeachSectorWeight,
  getCoastBiome,
  getDesertWeight,
  getFarmWeight,
  getForestWeight,
  getIslandCoastRadius,
  getLakeDistanceFactor,
  getLakeWobble,
  getRiverSample,
  getSnowWeight,
  getTerrainHeight,
  LAKE_CENTER_X,
  LAKE_CENTER_Z,
  LAKE_RADIUS_X,
  LAKE_RADIUS_Z,
  LAKE_WATER_LEVEL,
  LIGHTHOUSE_POS,
  OCEAN_LEVEL,
  OIL_RIGS,
  PARK_POND_POS,
  PARK_RECT,
  PORT_QUAY_POS,
  RADAR_PEAK_POS,
  RESORT_HOTELS,
  SKI_BASE_POS,
  SNOW_PEAK_POS,
  SNOW_PEAKS,
  SOLAR_PAD_POS,
  SOLAR_STATION_POS,
  STADIUM_POS,
  URBAN_BOUNDS,
  URBAN_EW_AXES,
  URBAN_NS_AXES,
  WIND_TURBINES,
} from './WorldData';
import {
  createFacadeTextures,
  createHangarSignTexture,
  createHelipadTexture,
  drawHangarSignCanvas,
  drawHelipadCanvas,
} from './ProceduralTextures';
import { SpatialLODManager } from './SpatialLOD';
import type { GraphicsQuality, HelipadData, WeatherMode } from './types';

export interface WorldHandles {
  root: THREE.Group;
  raycastTargets: THREE.Object3D[];
  oceanUniforms: { uTime: { value: number }; uWaveAmp: { value: number } };
  radarDish: THREE.Object3D;
  windsock: THREE.Object3D;
  cloudsGroup: THREE.Group;
  dispatchBeacon: THREE.Group;
  updateDynamicProps: (
    elapsed: number,
    dt: number,
    nightFactor: number,
    duskFactor: number,
    weather: WeatherMode,
    heliX: number,
    heliY: number,
    heliZ: number,
    lightningFlash?: number,
    sunDir?: THREE.Vector3,
    cameraPos?: THREE.Vector3,
    cameraFrustum?: THREE.Frustum,
    camForward?: THREE.Vector3
  ) => void;
  setDispatchTarget: (pad: HelipadData | null) => void;
  setCompanyName: (companyName: string) => void;
  setGraphicsQuality: (quality: GraphicsQuality) => void;
  dispose: () => void;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildCoastalIslandWorld(
  helipads: HelipadData[],
  maxAnisotropy: number,
  initialCompanyName = 'ROTOR OPS'
): WorldHandles {
  const root = new THREE.Group();
  const raycastTargets: THREE.Object3D[] = [];
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
  const trackTex = <T extends THREE.Texture>(t: T): T => {
    textures.push(t);
    return t;
  };

  // GTA-style Spatial LOD & Frustum Culling Manager (foliage chunks + city/port/biome detail layers)
  const spatialLOD = new SpatialLODManager();
  let currentQuality: GraphicsQuality = 'high';
  const _tmpCullSphere = new THREE.Sphere();

  // Static geometry batching helpers (drastically slashes GPU draw calls in City & Port)
  const _batchMat4 = new THREE.Matrix4();
  const _batchQuat = new THREE.Quaternion();
  const _batchPos = new THREE.Vector3();
  const _batchScale = new THREE.Vector3(1, 1, 1);
  const _batchEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  const _batchColor = new THREE.Color();

  const pushTransformedGeo = (
    bucket: THREE.BufferGeometry[],
    geo: THREE.BufferGeometry,
    x: number,
    y: number,
    z: number,
    rx = 0,
    ry = 0,
    rz = 0,
    sx = 1,
    sy = 1,
    sz = 1,
    vertexColorHex?: number
  ) => {
    _batchPos.set(x, y, z);
    _batchEuler.set(rx, ry, rz, 'YXZ');
    _batchQuat.setFromEuler(_batchEuler);
    _batchScale.set(sx, sy, sz);
    _batchMat4.compose(_batchPos, _batchQuat, _batchScale);
    geo.applyMatrix4(_batchMat4);
    if (vertexColorHex !== undefined) {
      _batchColor.setHex(vertexColorHex);
      const count = geo.attributes.position.count;
      const colors = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        colors[i * 3] = _batchColor.r;
        colors[i * 3 + 1] = _batchColor.g;
        colors[i * 3 + 2] = _batchColor.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    }
    bucket.push(geo);
  };

  const mergeNormalizedGeos = (
    geos: THREE.BufferGeometry[],
    withVertexColor = false
  ): THREE.BufferGeometry | null => {
    if (geos.length === 0) return null;
    const prepared: THREE.BufferGeometry[] = [];
    for (let i = 0; i < geos.length; i++) {
      const src = geos[i];
      const g = src.index ? src.toNonIndexed() : src;
      for (const key of Object.keys(g.attributes)) {
        if (
          key !== 'position' &&
          key !== 'normal' &&
          key !== 'uv' &&
          !(withVertexColor && key === 'color')
        ) {
          g.deleteAttribute(key);
        }
      }
      if (!g.attributes.normal) g.computeVertexNormals();
      if (!g.attributes.uv) {
        const count = g.attributes.position.count;
        g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
      }
      prepared.push(g);
      if (g !== src) src.dispose();
    }
    const merged = mergeGeometries(prepared, false);
    for (let i = 0; i < prepared.length; i++) {
      prepared[i].dispose();
    }
    if (!merged) return null;
    merged.computeBoundingBox();
    merged.computeBoundingSphere();
    return trackGeo(merged);
  };

  // Shared instanced pools for all helipad perimeter lights & aviation red warning beacons
  const padBeaconCoordsA: Array<{ x: number; y: number; z: number }> = [];
  const padBeaconCoordsB: Array<{ x: number; y: number; z: number }> = [];
  const skyRedBeaconCoords: Array<{ x: number; y: number; z: number; r: number }> = [];

  // Night-illuminated material collections updated smoothly by nightFactor (0..1)
  const nightWindowMats: THREE.MeshStandardMaterial[] = [];
  const padBeaconMatA = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.9,
      roughness: 0.25,
    })
  );
  const padBeaconMatB = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      emissive: 0x38bdf8,
      emissiveIntensity: 0.9,
      roughness: 0.25,
    })
  );

  // === 1. 2x MEGA-EXPANDED TERRAIN MESH (5-Biome Giant Island + Rivers + Farm + Varied Coastlines) ===
  const terrainSize = 5400;
  const terrainSegs = 280;
  const terrainGeo = trackGeo(
    new THREE.PlaneGeometry(terrainSize, terrainSize, terrainSegs, terrainSegs)
  );
  terrainGeo.rotateX(-Math.PI / 2);

  const posAttr = terrainGeo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(posAttr.count * 3);

  // Calibrated matte biome colors (no daytime blow-out)
  const cBeachSand = new THREE.Color(0xd7b77c);
  const cMeadow = new THREE.Color(0x427f38);
  const cFarmPasture = new THREE.Color(0x558a3a);
  const cFarmSoil = new THREE.Color(0x7c5c3b);
  const cPark = new THREE.Color(0x397f36);
  const cForestDeep = new THREE.Color(0x23542b);
  const cForestHill = new THREE.Color(0x2f6835);
  const cRiverBank = new THREE.Color(0x4f6845);
  const cCliffRock = new THREE.Color(0x525d66);
  const cSeawallSlate = new THREE.Color(0x596573);
  const cAlpineRock = new THREE.Color(0x47576b);
  const cSnow = new THREE.Color(0xdce6f0);
  const cSnowBlue = new THREE.Color(0xb8d0ea);
  const cDesertSand = new THREE.Color(0xc8894c);
  const cDesertOchre = new THREE.Color(0xb8723a);
  const cMesaRed = new THREE.Color(0x9e4b2c);
  const cMesaTop = new THREE.Color(0xb3643b);
  const cBed = new THREE.Color(0x2b5f6a);
  const cUrban = new THREE.Color(0x5c6874);
  const tmpColor = new THREE.Color();

  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);
    const y = getTerrainHeight(x, z);
    posAttr.setY(i, y);

    const dist = Math.hypot(x, z);
    const angle = Math.atan2(z, x);
    const coastR = getIslandCoastRadius(angle);
    const coastBiome = getCoastBiome(angle);
    const beachW = getBeachSectorWeight(angle);
    const snowW = getSnowWeight(x, z);
    const desertW = getDesertWeight(x, z);
    const forestW = getForestWeight(x, z);
    const farmW = getFarmWeight(x, z);
    const lakeFactor = getLakeDistanceFactor(x, z);
    const riverSample = getRiverSample(x, z);

    const inPark =
      x >= PARK_RECT.minX - 6 &&
      x <= PARK_RECT.maxX + 6 &&
      z >= PARK_RECT.minZ - 6 &&
      z <= PARK_RECT.maxZ + 6;
    const inUrban =
      x > URBAN_BOUNDS.minX - 24 &&
      x < URBAN_BOUNDS.maxX + 24 &&
      z > URBAN_BOUNDS.minZ - 24 &&
      z < URBAN_BOUNDS.maxZ + 24 &&
      y > 2.4 &&
      y < 3.8;
    const inPortApron = x > -1045 && x < -775 && z > -335 && z < 320 && y > 2.0 && y < 4.5;

    const nearCoast = dist > coastR - 58;

    if (lakeFactor < 1.0 && y < LAKE_WATER_LEVEL + 0.5) {
      tmpColor.copy(cBed);
    } else if (riverSample.inside && y < riverSample.waterY + 0.6) {
      tmpColor.copy(cBed);
    } else if (riverSample.carveFactor > 0.25 && y < riverSample.waterY + 3.2) {
      tmpColor.copy(cRiverBank);
    } else if (y < -0.5) {
      // Submerged seabed
      tmpColor.copy(beachW > 0.35 ? cBeachSand : cBed).lerp(cBed, beachW > 0.35 ? 0.45 : 1.0);
    } else if (beachW > 0.32 && dist > coastR - 415 && y < 6.4) {
      // ONLY Costa do Sol South-East bay gets golden beach sand
      const sandPurity = THREE.MathUtils.clamp(beachW * (1 - (y - 1.5) / 5.5), 0, 1);
      tmpColor.copy(cMeadow).lerp(cBeachSand, Math.max(0.55, sandPurity));
    } else if (nearCoast && coastBiome === 'port') {
      // Gray concrete/slate harbor edge next to city
      tmpColor.copy(cSeawallSlate);
    } else if (nearCoast && coastBiome === 'snow') {
      // Steep dark rocky alpine sea cliffs with snow dusting higher up
      tmpColor.copy(y > 22 ? cSnowBlue : cAlpineRock);
    } else if (nearCoast && coastBiome === 'desert') {
      // Steep terracotta / sandstone desert coastal cliffs
      tmpColor.copy(cMesaRed).lerp(cDesertOchre, 0.35);
    } else if (nearCoast && coastBiome === 'forest') {
      // Steep dark gray rocky coastal cliffs below dense forest
      tmpColor.copy(y > 14 ? cForestDeep : cCliffRock);
    } else if (snowW > 0.22 && y > 32.0) {
      const snowBlend = THREE.MathUtils.clamp((y - 32.0) / 18, 0, 1);
      tmpColor.copy(cSnowBlue).lerp(cSnow, snowBlend);
    } else if (snowW > 0.22 && y > 18.0) {
      const frost = THREE.MathUtils.clamp((y - 18.0) / 14, 0, 1);
      tmpColor.copy(cAlpineRock).lerp(cSnowBlue, frost * 0.78);
    } else if (inPark) {
      tmpColor.copy(cPark);
    } else if (inUrban || inPortApron) {
      tmpColor.copy(cUrban);
    } else if (farmW > 0.35) {
      // Fertile Fazenda Vale Verde pasture & tilled plantation beds
      const inCropPlot =
        x > FARM_REGION.x - 10 &&
        x < FARM_REGION.x + 125 &&
        z > FARM_REGION.z - 90 &&
        z < FARM_REGION.z + 90;
      tmpColor.copy(inCropPlot ? cFarmSoil : cFarmPasture);
      if (farmW < 0.75) {
        tmpColor.lerp(cForestHill, 1 - (farmW - 0.35) / 0.4);
      }
    } else if (desertW > 0.22) {
      // Arid orange/ochre sand dunes & reddish sandstone canyon mesas
      const mesaFactor = THREE.MathUtils.clamp((y - 22.0) / 12.0, 0, 1);
      const duneTint = 0.5 + 0.5 * Math.sin(x * 0.018 + z * 0.012);
      tmpColor.copy(cDesertSand).lerp(cDesertOchre, duneTint * 0.65);
      if (mesaFactor > 0.05) {
        const isMesaCap = y > 32.0;
        tmpColor.lerp(isMesaCap ? cMesaTop : cMesaRed, mesaFactor * 0.88);
      }
      if (desertW < 0.65) {
        tmpColor.lerp(cMeadow, 1 - (desertW - 0.22) / 0.43);
      }
    } else if (forestW > 0.2) {
      // Dense eastern forest rich dark green over rolling hills & ridges
      const hillShade = THREE.MathUtils.clamp((y - 10) / 34, 0, 1);
      tmpColor.copy(cForestHill).lerp(cForestDeep, hillShade * 0.78 + 0.18);
      if (y > 46) tmpColor.lerp(cCliffRock, 0.26);
    } else if (y > 32) {
      tmpColor.copy(cCliffRock).lerp(cForestHill, 0.35);
    } else if (y > 12) {
      tmpColor.copy(cForestHill);
    } else {
      tmpColor.copy(cMeadow);
    }

    const jitter = Math.sin(x * 0.08) * Math.cos(z * 0.09) * 0.026;
    colors[i * 3] = THREE.MathUtils.clamp(tmpColor.r + jitter, 0, 1);
    colors[i * 3 + 1] = THREE.MathUtils.clamp(tmpColor.g + jitter, 0, 1);
    colors[i * 3 + 2] = THREE.MathUtils.clamp(tmpColor.b + jitter, 0, 1);
  }

  terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  terrainGeo.computeVertexNormals();

  const terrainMat = trackMat(
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.94,
      metalness: 0.0,
      flatShading: true,
    })
  );
  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.receiveShadow = true;
  root.add(terrainMesh);

  // === 2. STYLIZED ANIMATED SPECULAR OCEAN (Expanded 36000m Infinite Horizon beyond Oil Rigs) + COASTLINE FOAM ===
  const oceanUniforms = {
    uTime: { value: 0 },
    uWaveAmp: { value: 1.0 },
    uSunDir: { value: new THREE.Vector3(0.5, 0.72, 0.48).normalize() },
    uSunGlintStrength: { value: 1.0 },
    uSunGlintColor: { value: new THREE.Color(0xfff5e0) },
  };
  const oceanGeo = trackGeo(new THREE.PlaneGeometry(36000, 36000, 192, 192));
  oceanGeo.rotateX(-Math.PI / 2);

  const oceanMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x0b96cf,
      roughness: 0.08,
      metalness: 0.22,
      flatShading: true,
    })
  );
  oceanMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = oceanUniforms.uTime;
    shader.uniforms.uWaveAmp = oceanUniforms.uWaveAmp;
    shader.uniforms.uSunDir = oceanUniforms.uSunDir;
    shader.uniforms.uSunGlintStrength = oceanUniforms.uSunGlintStrength;
    shader.uniforms.uSunGlintColor = oceanUniforms.uSunGlintColor;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
      uniform float uTime;
      uniform float uWaveAmp;
      varying vec3 vOceanWorldPos;`
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      float waveSpeed = 1.0 + (uWaveAmp - 1.0) * 0.85;
      float t = uTime * waveSpeed;
      float w1 = sin(position.x * 0.022 + t * 1.25) * cos(position.z * 0.019 + t * 0.95);
      float w2 = sin((position.x - position.z) * 0.015 - t * 0.92);
      float w3 = cos((position.x + position.z) * 0.038 + t * 1.85) * 0.44;
      transformed.y += (w1 * 0.52 + w2 * 0.34 + w3 * 0.24) * uWaveAmp;
      vOceanWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
      uniform float uTime;
      uniform vec3 uSunDir;
      uniform float uSunGlintStrength;
      uniform vec3 uSunGlintColor;
      varying vec3 vOceanWorldPos;`
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `if (uSunGlintStrength > 0.01) {
        vec3 viewDirW = normalize(cameraPosition - vOceanWorldPos);
        float nx = cos(vOceanWorldPos.x * 0.13 + uTime * 1.85) * 0.095 + sin((vOceanWorldPos.x - vOceanWorldPos.z) * 0.26 - uTime * 2.35) * 0.06;
        float nz = sin(vOceanWorldPos.z * 0.15 - uTime * 1.6) * 0.095 + cos((vOceanWorldPos.x + vOceanWorldPos.z) * 0.22 + uTime * 2.05) * 0.06;
        vec3 waveN = normalize(vec3(nx, 1.0, nz));
        vec3 sunL = normalize(uSunDir);
        vec3 halfV = normalize(sunL + viewDirW);
        float ndh = max(dot(waveN, halfV), 0.0);
        float fresnel = pow(1.0 - max(dot(waveN, viewDirW), 0.0), 3.0);
        float tightGlint = pow(ndh, 175.0) * 2.4;
        float broadGlint = pow(ndh, 26.0) * 0.36;
        float shimmer = 0.72 + 0.28 * sin(vOceanWorldPos.x * 0.34 + vOceanWorldPos.z * 0.28 + uTime * 4.1);
        outgoingLight += uSunGlintColor * (tightGlint * shimmer + broadGlint) * (0.48 + fresnel * 0.85) * uSunGlintStrength;
      }
      #include <opaque_fragment>`
    );
  };

  const oceanMesh = new THREE.Mesh(oceanGeo, oceanMat);
  oceanMesh.position.y = OCEAN_LEVEL;
  oceanMesh.receiveShadow = true;
  root.add(oceanMesh);

  // Subtle animated white coastal surf foam ribbon (wider surf on Costa do Sol beach, tighter on rocky cliffs)
  const coastFoamSegs = 280;
  const coastFoamPositions = new Float32Array((coastFoamSegs + 1) * 2 * 3);
  const coastFoamIndices: number[] = [];
  for (let i = 0; i <= coastFoamSegs; i++) {
    const theta = -Math.PI + (i / coastFoamSegs) * Math.PI * 2;
    const baseR = getIslandCoastRadius(theta);
    const bw = getBeachSectorWeight(theta);
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);
    const rInner = baseR - (3.5 + bw * 5.5);
    const rOuter = baseR + (4.5 + bw * 4.5);

    const v0 = i * 2;
    const v1 = v0 + 1;
    coastFoamPositions[v0 * 3] = cosT * rInner;
    coastFoamPositions[v0 * 3 + 1] = 0;
    coastFoamPositions[v0 * 3 + 2] = sinT * rInner;
    coastFoamPositions[v1 * 3] = cosT * rOuter;
    coastFoamPositions[v1 * 3 + 1] = 0;
    coastFoamPositions[v1 * 3 + 2] = sinT * rOuter;

    if (i < coastFoamSegs) {
      coastFoamIndices.push(v0, v1, v0 + 2, v1, v1 + 2, v0 + 2);
    }
  }
  const coastFoamGeo = trackGeo(new THREE.BufferGeometry());
  coastFoamGeo.setAttribute('position', new THREE.BufferAttribute(coastFoamPositions, 3));
  coastFoamGeo.setIndex(coastFoamIndices);
  coastFoamGeo.computeVertexNormals();

  const shorelineFoamMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xe6f7ff,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  const coastFoamMesh = new THREE.Mesh(coastFoamGeo, shorelineFoamMat);
  coastFoamMesh.position.y = OCEAN_LEVEL + 0.2;
  root.add(coastFoamMesh);

  // === 3. ANIMATED INTERIOR RESERVOIR LAKE (Eastern Forest Highlands, 360° Closed Basin) ===
  const lakeRings = 9;
  const lakeSectors = 60;
  const lakeVertCount = 1 + lakeRings * lakeSectors;
  const lakePosArr = new Float32Array(lakeVertCount * 3);
  const lakeIndices: number[] = [];

  lakePosArr[0] = 0;
  lakePosArr[1] = 0;
  lakePosArr[2] = 0;

  for (let r = 1; r <= lakeRings; r++) {
    const frac = (r / lakeRings) * 1.04;
    for (let s = 0; s < lakeSectors; s++) {
      const ang = (s / lakeSectors) * Math.PI * 2;
      const wobbleScale = getLakeWobble(ang) * frac;
      const idx = 1 + (r - 1) * lakeSectors + s;
      lakePosArr[idx * 3] = Math.cos(ang) * LAKE_RADIUS_X * wobbleScale;
      lakePosArr[idx * 3 + 1] = 0;
      lakePosArr[idx * 3 + 2] = Math.sin(ang) * LAKE_RADIUS_Z * wobbleScale;
    }
  }
  for (let s = 0; s < lakeSectors; s++) {
    const next = (s + 1) % lakeSectors;
    lakeIndices.push(0, 1 + next, 1 + s);
  }
  for (let r = 1; r < lakeRings; r++) {
    const ringA = 1 + (r - 1) * lakeSectors;
    const ringB = 1 + r * lakeSectors;
    for (let s = 0; s < lakeSectors; s++) {
      const next = (s + 1) % lakeSectors;
      const a0 = ringA + s;
      const a1 = ringA + next;
      const b0 = ringB + s;
      const b1 = ringB + next;
      lakeIndices.push(a0, a1, b1, a0, b1, b0);
    }
  }
  const lakeGeo = trackGeo(new THREE.BufferGeometry());
  lakeGeo.setAttribute('position', new THREE.BufferAttribute(lakePosArr, 3));
  lakeGeo.setIndex(lakeIndices);
  lakeGeo.computeVertexNormals();

  const lakeMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x16a8bf,
      roughness: 0.08,
      metalness: 0.22,
      flatShading: true,
    })
  );
  lakeMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = oceanUniforms.uTime;
    shader.uniforms.uWaveAmp = oceanUniforms.uWaveAmp;
    shader.uniforms.uSunDir = oceanUniforms.uSunDir;
    shader.uniforms.uSunGlintStrength = oceanUniforms.uSunGlintStrength;
    shader.uniforms.uSunGlintColor = oceanUniforms.uSunGlintColor;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
      uniform float uTime;
      uniform float uWaveAmp;
      varying vec3 vLakeWorldPos;`
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      float nr = length(vec2(position.x / ${LAKE_RADIUS_X.toFixed(1)}, position.z / ${LAKE_RADIUS_Z.toFixed(1)}));
      float damp = clamp(1.0 - smoothstep(0.75, 0.96, nr), 0.0, 1.0);
      float lakeSpeed = 1.0 + (uWaveAmp - 1.0) * 0.72;
      float lt = uTime * lakeSpeed;
      float ripple = sin(position.x * 0.09 + lt * 2.0) * cos(position.z * 0.10 - lt * 1.55)
        + sin((position.x + position.z) * 0.13 + lt * 2.5) * 0.35;
      transformed.y += ripple * 0.23 * damp * uWaveAmp;
      vLakeWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
      uniform float uTime;
      uniform vec3 uSunDir;
      uniform float uSunGlintStrength;
      uniform vec3 uSunGlintColor;
      varying vec3 vLakeWorldPos;`
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `if (uSunGlintStrength > 0.01) {
        vec3 viewDirW = normalize(cameraPosition - vLakeWorldPos);
        float nx = cos(vLakeWorldPos.x * 0.22 + uTime * 1.9) * 0.075;
        float nz = sin(vLakeWorldPos.z * 0.24 - uTime * 1.7) * 0.075;
        vec3 waveN = normalize(vec3(nx, 1.0, nz));
        vec3 sunL = normalize(uSunDir);
        vec3 halfV = normalize(sunL + viewDirW);
        float ndh = max(dot(waveN, halfV), 0.0);
        outgoingLight += uSunGlintColor * (pow(ndh, 160.0) * 1.85 + pow(ndh, 28.0) * 0.25) * uSunGlintStrength;
      }
      #include <opaque_fragment>`
    );
  };
  const lakeMesh = new THREE.Mesh(lakeGeo, lakeMat);
  lakeMesh.position.set(LAKE_CENTER_X, LAKE_WATER_LEVEL, LAKE_CENTER_Z);
  lakeMesh.receiveShadow = true;
  root.add(lakeMesh);

  // Subtle reservoir shoreline foam edge
  const lakeFoamPositions = new Float32Array((lakeSectors + 1) * 2 * 3);
  const lakeFoamIndices: number[] = [];
  for (let s = 0; s <= lakeSectors; s++) {
    const ang = ((s % lakeSectors) / lakeSectors) * Math.PI * 2;
    const w = getLakeWobble(ang);
    const cosA = Math.cos(ang);
    const sinA = Math.sin(ang);
    const v0 = s * 2;
    const v1 = v0 + 1;
    lakeFoamPositions[v0 * 3] = cosA * LAKE_RADIUS_X * w * 0.94;
    lakeFoamPositions[v0 * 3 + 1] = 0;
    lakeFoamPositions[v0 * 3 + 2] = sinA * LAKE_RADIUS_Z * w * 0.94;
    lakeFoamPositions[v1 * 3] = cosA * LAKE_RADIUS_X * w * 0.995;
    lakeFoamPositions[v1 * 3 + 1] = 0;
    lakeFoamPositions[v1 * 3 + 2] = sinA * LAKE_RADIUS_Z * w * 0.995;
    if (s < lakeSectors) {
      lakeFoamIndices.push(v0, v1, v0 + 2, v1, v1 + 2, v0 + 2);
    }
  }
  const lakeFoamGeo = trackGeo(new THREE.BufferGeometry());
  lakeFoamGeo.setAttribute('position', new THREE.BufferAttribute(lakeFoamPositions, 3));
  lakeFoamGeo.setIndex(lakeFoamIndices);
  const lakeFoamMesh = new THREE.Mesh(lakeFoamGeo, shorelineFoamMat);
  lakeFoamMesh.position.set(LAKE_CENTER_X, LAKE_WATER_LEVEL + 0.08, LAKE_CENTER_Z);
  root.add(lakeFoamMesh);

  // === 3A. TWO SINUOUS ANIMATED FOREST RIVERS (Usable for Bambi Bucket & Firekite Water Scooping!) ===
  const riverMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x16a8bf,
      roughness: 0.08,
      metalness: 0.22,
      flatShading: false,
      side: THREE.DoubleSide,
    })
  );
  riverMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = oceanUniforms.uTime;
    shader.uniforms.uSunDir = oceanUniforms.uSunDir;
    shader.uniforms.uSunGlintStrength = oceanUniforms.uSunGlintStrength;
    shader.uniforms.uSunGlintColor = oceanUniforms.uSunGlintColor;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
      varying vec3 vRiverWorldPos;`
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      vRiverWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
      uniform float uTime;
      uniform vec3 uSunDir;
      uniform float uSunGlintStrength;
      uniform vec3 uSunGlintColor;
      varying vec3 vRiverWorldPos;`
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `if (uSunGlintStrength > 0.01) {
        vec3 viewDirW = normalize(cameraPosition - vRiverWorldPos);
        float flow = uTime * 2.8;
        float nx = cos(vRiverWorldPos.x * 0.24 - flow) * 0.085 + sin(vRiverWorldPos.z * 0.31 + flow * 0.8) * 0.05;
        float nz = sin(vRiverWorldPos.z * 0.24 - flow) * 0.085;
        vec3 waveN = normalize(vec3(nx, 1.0, nz));
        vec3 halfV = normalize(normalize(uSunDir) + viewDirW);
        float ndh = max(dot(waveN, halfV), 0.0);
        outgoingLight += uSunGlintColor * (pow(ndh, 145.0) * 1.9 + pow(ndh, 24.0) * 0.24) * uSunGlintStrength;
      }
      #include <opaque_fragment>`
    );
  };

  for (const river of FOREST_RIVERS) {
    const pts = river.points;
    const halfW = river.width * 0.64; // slightly wider than carved bed so water tucks seamlessly into banks
    const rPos = new Float32Array(pts.length * 2 * 3);
    const rIndices: number[] = [];

    for (let i = 0; i < pts.length; i++) {
      const prev = pts[Math.max(0, i - 1)];
      const next = pts[Math.min(pts.length - 1, i + 1)];
      let tx = next.x - prev.x;
      let tz = next.z - prev.z;
      const tLen = Math.hypot(tx, tz) || 1;
      tx /= tLen;
      tz /= tLen;
      // Perpendicular normal in XZ plane
      const nx = -tz;
      const nz = tx;

      const v0 = i * 2;
      const v1 = v0 + 1;
      rPos[v0 * 3] = pts[i].x - nx * halfW;
      rPos[v0 * 3 + 1] = pts[i].waterY;
      rPos[v0 * 3 + 2] = pts[i].z - nz * halfW;
      rPos[v1 * 3] = pts[i].x + nx * halfW;
      rPos[v1 * 3 + 1] = pts[i].waterY;
      rPos[v1 * 3 + 2] = pts[i].z + nz * halfW;

      if (i < pts.length - 1) {
        rIndices.push(v0, v1, v0 + 2, v1, v1 + 2, v0 + 2);
      }
    }
    const riverGeo = trackGeo(new THREE.BufferGeometry());
    riverGeo.setAttribute('position', new THREE.BufferAttribute(rPos, 3));
    riverGeo.setIndex(rIndices);
    riverGeo.computeVertexNormals();
    const riverMesh = new THREE.Mesh(riverGeo, riverMat);
    riverMesh.receiveShadow = true;
    root.add(riverMesh);
  }

  // Shared Architectural Materials (high roughness for crisp daytime readability)
  const concreteMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x9aa8b8, roughness: 0.92, metalness: 0.0 })
  );
  const darkConcreteMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x4f5d6e, roughness: 0.94, metalness: 0.0 })
  );
  const foamMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xcbe9f8, roughness: 0.52, metalness: 0.0 })
  );
  const timberMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x723e1d, roughness: 0.92, metalness: 0.0 })
  );
  const warmTimberMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x99653a, roughness: 0.9, metalness: 0.0 })
  );
  const sandstoneMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xb5673b, roughness: 0.94, metalness: 0.0 })
  );
  const chaletWindowMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      emissive: 0xffc864,
      emissiveIntensity: 0,
      roughness: 0.22,
    })
  );
  nightWindowMats.push(chaletWindowMat);

  // Concrete Dam anchored deeply into the south-western embankment of the eastern reservoir
  const damGroup = new THREE.Group();
  damGroup.position.set(DAM_X, 0, DAM_Z);
  damGroup.rotation.y = DAM_ROTATION_Y;

  const damWall = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(46, 23.0, 10.2)), concreteMat);
  damWall.position.set(0, 10.5, 0);
  damWall.castShadow = true;
  damWall.receiveShadow = true;
  damGroup.add(damWall);
  raycastTargets.push(damWall);

  for (let i = -2; i <= 2; i++) {
    const buttress = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(2.9, 21.5, 7.8)),
      darkConcreteMat
    );
    buttress.position.set(i * 8.6, 9.8, 5.6);
    buttress.rotation.x = -0.24;
    buttress.castShadow = true;
    damGroup.add(buttress);
  }

  for (const sx of [-4.4, 4.4]) {
    const chute = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(5.8, 18.4, 1.4)), foamMat);
    chute.position.set(sx, 10.8, 6.4);
    chute.rotation.x = -0.32;
    damGroup.add(chute);
  }

  const damRoad = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(48, 0.9, 11.2)), darkConcreteMat);
  damRoad.position.set(0, 22.05, 0);
  damRoad.receiveShadow = true;
  damGroup.add(damRoad);

  for (const pz of [-5.3, 5.3]) {
    const parapet = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(48, 1.05, 0.55)), concreteMat);
    parapet.position.set(0, 22.95, pz);
    damGroup.add(parapet);
  }
  root.add(damGroup);

  // Helper to register blinking night-landing perimeter beacons into 2 InstancedMeshes (instead of 112+ draw calls)
  const beaconBulbGeo = trackGeo(new THREE.BoxGeometry(0.68, 0.58, 0.68));
  const addHelipadPerimeterLights = (
    parent: THREE.Object3D,
    localX: number,
    localY: number,
    localZ: number,
    halfSpan: number
  ) => {
    const baseX = parent.position.x + localX;
    const baseY = parent.position.y + localY;
    const baseZ = parent.position.z + localZ;
    const positions = [
      [-halfSpan, -halfSpan],
      [halfSpan, -halfSpan],
      [halfSpan, halfSpan],
      [-halfSpan, halfSpan],
      [0, -halfSpan],
      [0, halfSpan],
      [-halfSpan, 0],
      [halfSpan, 0],
    ];
    positions.forEach(([ox, oz], idx) => {
      const target = idx % 2 === 0 ? padBeaconCoordsA : padBeaconCoordsB;
      target.push({ x: baseX + ox, y: baseY, z: baseZ + oz });
    });
  };

  // === 3B. 2x EXPANDED WEST HARBOR SEAWALL, CONTAINER PORT TERMINAL (6 CRANES + 2 WAREHOUSES + 2 SHIPS) ===
  const portGroup = new THREE.Group();
  const bobbingVessels: Array<{ group: THREE.Object3D; baseY: number; phase: number; amp: number }> = [];

  // Merged Concrete seawall segments hugging the 2x West Harbor Bay coastline (40 draw calls -> 1!)
  const seawallGeos: THREE.BufferGeometry[] = [];
  const seawallSteps = 40;
  const seawallStartAng = 2.58;
  const seawallEndAng = Math.PI * 2 - 2.48; // wraps through PI cleanly
  for (let i = 0; i < seawallSteps; i++) {
    const a0 = THREE.MathUtils.lerp(seawallStartAng, seawallEndAng, i / seawallSteps);
    const a1 = THREE.MathUtils.lerp(seawallStartAng, seawallEndAng, (i + 1) / seawallSteps);
    const r0 = getIslandCoastRadius(a0) - 7;
    const r1 = getIslandCoastRadius(a1) - 7;
    const x0 = Math.cos(a0) * r0;
    const z0 = Math.sin(a0) * r0;
    const x1 = Math.cos(a1) * r1;
    const z1 = Math.sin(a1) * r1;
    const len = Math.hypot(x1 - x0, z1 - z0) + 2.4;
    pushTransformedGeo(
      seawallGeos,
      new THREE.BoxGeometry(len, 5.6, 8.2),
      (x0 + x1) * 0.5,
      1.2,
      (z0 + z1) * 0.5,
      0,
      -Math.atan2(z1 - z0, x1 - x0),
      0
    );
  }
  const mergedSeawallGeo = mergeNormalizedGeos(seawallGeos);
  if (mergedSeawallGeo) {
    const seawallMesh = new THREE.Mesh(mergedSeawallGeo, concreteMat);
    seawallMesh.receiveShadow = true;
    seawallMesh.castShadow = false;
    portGroup.add(seawallMesh);
  }

  // Main Concrete Port Quay jutting into West Harbor Bay (126m x 430m — 2x expanded)
  const quaySlab = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(126, 5.4, 430)), darkConcreteMat);
  quaySlab.position.set(PORT_QUAY_POS.x + 28, PORT_QUAY_POS.dockY - 2.7, PORT_QUAY_POS.z);
  quaySlab.receiveShadow = true;
  quaySlab.castShadow = true;
  portGroup.add(quaySlab);
  raycastTargets.push(quaySlab);

  const quayEdge = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(2.6, 0.72, 430)),
    trackMat(new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.85, metalness: 0.0 }))
  );
  quayEdge.position.set(PORT_QUAY_POS.x - 34, PORT_QUAY_POS.dockY + 0.15, PORT_QUAY_POS.z);
  portGroup.add(quayEdge);

  // Two Large Port Logistics Warehouses (North & South Terminal)
  const portWarehouseMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x7a8a9c, roughness: 0.9, metalness: 0.0 })
  );
  const portWarehouseGeo = trackGeo(new THREE.BoxGeometry(44, 12.5, 80));
  for (const wz of [-155, 135]) {
    const wh = new THREE.Mesh(portWarehouseGeo, portWarehouseMat);
    wh.position.set(-926, 3.0 + 6.25, wz);
    wh.castShadow = true;
    wh.receiveShadow = true;
    portGroup.add(wh);
    raycastTargets.push(wh);
  }

  // Six Tall Red/White Gantry Container Cranes merged into 2 draw calls (42 draw calls -> 2!)
  const craneRedMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xc2382c, roughness: 0.76, metalness: 0.15 })
  );
  const skyRedBeaconMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xff2a2a,
      emissive: 0xff1e1e,
      emissiveIntensity: 1.4,
      roughness: 0.2,
    })
  );
  const craneRedGeos: THREE.BufferGeometry[] = [];
  const craneApexGeos: THREE.BufferGeometry[] = [];
  for (const dz of [-195, -125, -55, 25, 95, 165]) {
    const cx = PORT_QUAY_POS.x - 14;
    const cy = PORT_QUAY_POS.dockY;
    const cz = PORT_QUAY_POS.z + dz;
    for (const lx of [-6.8, 6.8]) {
      for (const lz of [-5.4, 5.4]) {
        pushTransformedGeo(
          craneRedGeos,
          new THREE.BoxGeometry(1.6, 28, 1.6),
          cx + lx,
          cy + 14,
          cz + lz
        );
      }
    }
    pushTransformedGeo(craneRedGeos, new THREE.BoxGeometry(48, 3.0, 12.2), cx - 9, cy + 26.5, cz);
    pushTransformedGeo(craneApexGeos, new THREE.BoxGeometry(11.0, 4.6, 8.6), cx + 1, cy + 29.8, cz);
    skyRedBeaconCoords.push({ x: cx + 1, y: cy + 32.8, z: cz, r: 0.65 });
  }
  const mergedCraneRedGeo = mergeNormalizedGeos(craneRedGeos);
  if (mergedCraneRedGeo) {
    const cranesRedMesh = new THREE.Mesh(mergedCraneRedGeo, craneRedMat);
    cranesRedMesh.castShadow = true;
    cranesRedMesh.receiveShadow = true;
    portGroup.add(cranesRedMesh);
  }
  const mergedCraneApexGeo = mergeNormalizedGeos(craneApexGeos);
  if (mergedCraneApexGeo) {
    const cranesApexMesh = new THREE.Mesh(mergedCraneApexGeo, concreteMat);
    cranesApexMesh.castShadow = false;
    cranesApexMesh.receiveShadow = true;
    portGroup.add(cranesApexMesh);
  }

  // Instanced Colorful Stacked Shipping Containers on the 2x Port Apron (1 draw call, no shadow overhead!)
  const containerGeo = trackGeo(new THREE.BoxGeometry(4.2, 3.2, 11.5));
  const containerInstMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.86, metalness: 0.05 })
  );
  const containerPalette = [0x2b6cb0, 0xc53030, 0xd69e2e, 0x2f855a, 0xdd6b20, 0x4a5568, 0x0e7490];
  const containerPlacements: Array<{ x: number; y: number; z: number; color: number }> = [];
  let cIdx = 0;
  for (const cx of [-994, -985, -976, -967, -958]) {
    for (let cz = -205; cz <= 185; cz += 17) {
      if (Math.abs(cz + 20) < 16) continue; // central access lane
      const stackH = 1 + ((cIdx * 3) % 3);
      for (let tier = 0; tier < stackH; tier++) {
        containerPlacements.push({
          x: cx,
          y: PORT_QUAY_POS.dockY + 1.6 + tier * 3.24,
          z: cz,
          color: containerPalette[(cIdx + tier) % containerPalette.length],
        });
      }
      cIdx++;
    }
  }
  const portContainerInst = new THREE.InstancedMesh(
    containerGeo,
    containerInstMat,
    containerPlacements.length
  );
  portContainerInst.castShadow = false;
  portContainerInst.receiveShadow = true;
  const tmpPortDummy = new THREE.Object3D();
  const tmpPortColor = new THREE.Color();
  containerPlacements.forEach((cp, idx) => {
    tmpPortDummy.position.set(cp.x, cp.y, cp.z);
    tmpPortDummy.rotation.set(0, 0, 0);
    tmpPortDummy.scale.setScalar(1);
    tmpPortDummy.updateMatrix();
    portContainerInst.setMatrixAt(idx, tmpPortDummy.matrix);
    tmpPortColor.setHex(cp.color);
    portContainerInst.setColorAt(idx, tmpPortColor);
  });
  portContainerInst.instanceMatrix.needsUpdate = true;
  if (portContainerInst.instanceColor) portContainerInst.instanceColor.needsUpdate = true;
  portContainerInst.computeBoundingSphere();
  portGroup.add(portContainerInst);

  // Two Moored 82m Container Cargo Ships berthed alongside the 2x West Port Quay
  const shipHullMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x7f1d1d, roughness: 0.72, metalness: 0.12 })
  );
  const shipUpperHullMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.78, metalness: 0.15 })
  );
  const shipBridgeMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xdbe4ee, roughness: 0.85, metalness: 0.0 })
  );
  const shipLowerHullGeo = trackGeo(new THREE.BoxGeometry(17.5, 4.8, 76));
  const shipFreeboardGeo = trackGeo(new THREE.BoxGeometry(18.0, 3.0, 77));
  const shipBowGeo = trackGeo(new THREE.CylinderGeometry(0.4, 12.2, 7.8, 4));
  shipBowGeo.rotateY(Math.PI / 4);
  const shipBridgeGeo = trackGeo(new THREE.BoxGeometry(15.2, 12.2, 12.0));
  const shipBridgeWinGeo = trackGeo(new THREE.BoxGeometry(15.5, 2.6, 8.8));
  const shipFunnelGeo = trackGeo(new THREE.BoxGeometry(4.4, 5.6, 4.8));
  const shipBeaconGeo = trackGeo(new THREE.SphereGeometry(0.58, 8, 8));

  for (const [shipIdx, shipDz] of [-110, 95].entries()) {
    const cargoShipGroup = new THREE.Group();
    cargoShipGroup.position.set(PORT_QUAY_POS.x - 59, OCEAN_LEVEL, PORT_QUAY_POS.z + shipDz);
    if (shipIdx === 1) cargoShipGroup.rotation.y = Math.PI;

    const shipLowerHull = new THREE.Mesh(shipLowerHullGeo, shipHullMat);
    shipLowerHull.position.set(0, 1.4, 0);
    shipLowerHull.castShadow = true;
    shipLowerHull.receiveShadow = true;
    cargoShipGroup.add(shipLowerHull);
    raycastTargets.push(shipLowerHull);

    const shipFreeboard = new THREE.Mesh(shipFreeboardGeo, shipUpperHullMat);
    shipFreeboard.position.set(0, 5.2, 0);
    shipFreeboard.castShadow = true;
    shipFreeboard.receiveShadow = true;
    cargoShipGroup.add(shipFreeboard);

    const shipBow = new THREE.Mesh(shipBowGeo, shipUpperHullMat);
    shipBow.position.set(0, 3.1, -41.5);
    shipBow.scale.set(0.95, 1, 1.45);
    cargoShipGroup.add(shipBow);

    const shipBridge = new THREE.Mesh(shipBridgeGeo, shipBridgeMat);
    shipBridge.position.set(0, 12.4, 27.5);
    shipBridge.castShadow = true;
    shipBridge.receiveShadow = true;
    cargoShipGroup.add(shipBridge);
    raycastTargets.push(shipBridge);

    const shipBridgeWin = new THREE.Mesh(shipBridgeWinGeo, chaletWindowMat);
    shipBridgeWin.position.set(0, 16.2, 27.5);
    cargoShipGroup.add(shipBridgeWin);

    const shipFunnel = new THREE.Mesh(shipFunnelGeo, craneRedMat);
    shipFunnel.position.set(0, 20.8, 30.0);
    cargoShipGroup.add(shipFunnel);

    const shipMastBeacon = new THREE.Mesh(shipBeaconGeo, skyRedBeaconMat);
    shipMastBeacon.position.set(0, 24.2, 30.0);
    cargoShipGroup.add(shipMastBeacon);

    const shipContInst = new THREE.InstancedMesh(containerGeo, containerInstMat, 24);
    shipContInst.castShadow = false;
    shipContInst.receiveShadow = true;
    let scIdx = 0;
    for (const sx of [-4.8, 0, 4.8]) {
      for (const sz of [-26, -12, 2, 16]) {
        for (let tier = 0; tier < 2; tier++) {
          tmpPortDummy.position.set(sx, 8.2 + tier * 3.25, sz);
          tmpPortDummy.rotation.set(0, 0, 0);
          tmpPortDummy.scale.setScalar(1);
          tmpPortDummy.updateMatrix();
          shipContInst.setMatrixAt(scIdx, tmpPortDummy.matrix);
          tmpPortColor.setHex(
            containerPalette[(scIdx * 2 + tier + shipIdx * 3) % containerPalette.length]
          );
          shipContInst.setColorAt(scIdx, tmpPortColor);
          scIdx++;
        }
      }
    }
    shipContInst.instanceMatrix.needsUpdate = true;
    if (shipContInst.instanceColor) shipContInst.instanceColor.needsUpdate = true;
    shipContInst.computeBoundingSphere();
    cargoShipGroup.add(shipContInst);

    portGroup.add(cargoShipGroup);
    bobbingVessels.push({
      group: cargoShipGroup,
      baseY: OCEAN_LEVEL,
      phase: 0.4 + shipIdx * 1.9,
      amp: 0.18,
    });
  }
  root.add(portGroup);

  // === 4. COASTAL AIRBASE HQ (West Coast Plateau) ===
  const baseGroundY = getTerrainHeight(AIRBASE_CENTER.x, AIRBASE_CENTER.z);
  const airbaseGroup = new THREE.Group();
  airbaseGroup.position.set(AIRBASE_CENTER.x, baseGroundY, AIRBASE_CENTER.z);
  root.add(airbaseGroup);

  const apronMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x47525e, roughness: 0.92, metalness: 0.0 })
  );
  const apron = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(92, 0.3, 66)), apronMat);
  apron.position.set(-4, 0.06, -4);
  apron.receiveShadow = true;
  airbaseGroup.add(apron);

  const basePadTex = trackTex(createHelipadTexture(maxAnisotropy, 'base', initialCompanyName));
  const basePadMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: basePadTex,
      roughness: 0.88,
      metalness: 0.0,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    })
  );
  const basePadSlab = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(26, 0.35, 26)), basePadMat);
  basePadSlab.position.set(0, 0.175, 0);
  basePadSlab.receiveShadow = true;
  airbaseGroup.add(basePadSlab);

  addHelipadPerimeterLights(airbaseGroup, 0, 0.48, 0, 12.2);

  // Composite Hangar
  const hangarGroup = new THREE.Group();
  hangarGroup.position.set(-31, 0.2, -9);

  const hangarWallMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xbac5d2, roughness: 0.88, metalness: 0.0 })
  );
  const hangarRoofMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xb92c30, roughness: 0.82, metalness: 0.0 })
  );
  const hangarInteriorMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      emissive: 0xffc86b,
      emissiveIntensity: 0,
      roughness: 0.92,
      metalness: 0.0,
    })
  );
  nightWindowMats.push(hangarInteriorMat);

  const hangarBody = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(20, 8.6, 24)), hangarWallMat);
  hangarBody.position.y = 4.3;
  hangarBody.castShadow = true;
  hangarBody.receiveShadow = true;
  hangarGroup.add(hangarBody);
  raycastTargets.push(hangarBody);

  const hangarBay = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.6, 6.8, 16)), hangarInteriorMat);
  hangarBay.position.set(10.05, 3.4, 0);
  hangarGroup.add(hangarBay);

  const hangarRoof = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(10.8, 10.8, 25.4, 4, 1, false, Math.PI / 4)),
    hangarRoofMat
  );
  hangarRoof.rotation.x = Math.PI / 2;
  hangarRoof.scale.set(1.05, 1, 0.35);
  hangarRoof.position.y = 8.7;
  hangarRoof.castShadow = true;
  hangarGroup.add(hangarRoof);

  const signTex = trackTex(createHangarSignTexture(maxAnisotropy, initialCompanyName));
  const signMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: signTex,
      emissiveMap: signTex,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0,
      roughness: 0.72,
      metalness: 0.0,
    })
  );
  nightWindowMats.push(signMat);

  const signBoard = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.35, 2.4, 11.5)), signMat);
  signBoard.position.set(10.22, 8.2, 0);
  hangarGroup.add(signBoard);
  airbaseGroup.add(hangarGroup);

  // Control Tower
  const towerGroup = new THREE.Group();
  towerGroup.position.set(23, 0.2, -22);

  const towerShaft = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(6.8, 13.5, 6.8)), concreteMat);
  towerShaft.position.y = 6.75;
  towerShaft.castShadow = true;
  towerShaft.receiveShadow = true;
  towerGroup.add(towerShaft);
  raycastTargets.push(towerShaft);

  const towerDeck = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(10.4, 1.4, 10.4)), hangarRoofMat);
  towerDeck.position.y = 14.0;
  towerDeck.castShadow = true;
  towerGroup.add(towerDeck);

  const towerGlassMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x163854,
      emissive: 0xffd27d,
      emissiveIntensity: 0,
      roughness: 0.14,
      metalness: 0.65,
    })
  );
  nightWindowMats.push(towerGlassMat);

  const towerCab = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(5.6, 4.6, 3.6, 6)), towerGlassMat);
  towerCab.position.y = 16.4;
  towerCab.castShadow = true;
  towerGroup.add(towerCab);

  const towerCap = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(6.0, 6.0, 0.9, 6)), concreteMat);
  towerCap.position.y = 18.6;
  towerCap.castShadow = true;
  towerGroup.add(towerCap);

  const radarDish = new THREE.Group();
  radarDish.position.set(0, 19.8, 0);
  const radarMast = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.25, 0.3, 1.4, 6)),
    darkConcreteMat
  );
  radarDish.add(radarMast);
  const radarBar = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(4.2, 0.65, 0.45)), hangarRoofMat);
  radarBar.position.y = 0.85;
  radarDish.add(radarBar);
  towerGroup.add(radarDish);
  airbaseGroup.add(towerGroup);

  const fuelTankMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xe5b818, roughness: 0.45, metalness: 0.18 })
  );
  for (const tz of [12, 18]) {
    const tank = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(2.1, 2.1, 7.6, 12)), fuelTankMat);
    tank.rotation.z = Math.PI / 2;
    tank.position.set(-28, 2.3, tz);
    tank.castShadow = true;
    airbaseGroup.add(tank);
  }

  const windsockPole = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.14, 0.18, 8.5, 6)),
    concreteMat
  );
  windsockPole.position.set(24, 4.25, 16);
  windsockPole.castShadow = true;
  airbaseGroup.add(windsockPole);

  const windsock = new THREE.Group();
  windsock.position.set(24, 8.2, 16);
  const sockCone = new THREE.Mesh(
    trackGeo(new THREE.ConeGeometry(0.75, 3.4, 8)),
    trackMat(new THREE.MeshStandardMaterial({ color: 0xe86812, roughness: 0.68 }))
  );
  sockCone.rotation.z = -Math.PI / 2;
  sockCone.position.x = 1.7;
  windsock.add(sockCone);
  airbaseGroup.add(windsock);

  // === 5. EXPANDED URBAN ROAD GRID (6x5 Avenues) & CENTRAL PARK ===
  const urbanY = 3.04;
  const roadMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x2b3646,
      roughness: 0.95,
      metalness: 0.0,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    })
  );
  const stripeMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xfef08a,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    })
  );

  const isValidUrbanRoadSample = (x: number, z: number, halfW: number): boolean => {
    if (
      x < URBAN_BOUNDS.minX + 4 ||
      x > URBAN_BOUNDS.maxX - 4 ||
      z < URBAN_BOUNDS.minZ + 4 ||
      z > URBAN_BOUNDS.maxZ - 4
    ) {
      return false;
    }
    if (getLakeDistanceFactor(x, z) < 1.52) return false;
    if (Math.hypot(x - DAM_X, z - DAM_Z) < 42) return false;
    if (
      x >= PARK_RECT.minX - 1 &&
      x <= PARK_RECT.maxX + 1 &&
      z >= PARK_RECT.minZ - 1 &&
      z <= PARK_RECT.maxZ + 1
    ) {
      return false;
    }

    const hCenter = getTerrainHeight(x, z);
    const h1 = getTerrainHeight(x - halfW, z - halfW);
    const h2 = getTerrainHeight(x + halfW, z - halfW);
    const h3 = getTerrainHeight(x - halfW, z + halfW);
    const h4 = getTerrainHeight(x + halfW, z + halfW);

    const minH = Math.min(hCenter, h1, h2, h3, h4);
    const maxH = Math.max(hCenter, h1, h2, h3, h4);

    if (minH < 2.72 || maxH > 3.32) return false;
    if (maxH - minH > 0.25) return false;
    return true;
  };

  const mergedRoadGeos: THREE.BufferGeometry[] = [];
  const mergedStripeGeos: THREE.BufferGeometry[] = [];

  const addValidatedRoadAxis = (
    axis: 'ns' | 'ew',
    fixedCoord: number,
    rangeMin: number,
    rangeMax: number,
    yOffset: number
  ) => {
    const step = 4;
    const roadWidth = 11;
    const halfW = roadWidth * 0.5;
    let spanStart: number | null = null;

    const flushSpan = (spanEnd: number) => {
      if (spanStart === null) return;
      const spanLen = spanEnd - spanStart;
      if (spanLen >= 10) {
        const mid = (spanStart + spanEnd) * 0.5;
        const w = axis === 'ns' ? roadWidth : spanLen;
        const d = axis === 'ns' ? spanLen : roadWidth;
        pushTransformedGeo(
          mergedRoadGeos,
          new THREE.PlaneGeometry(w, d),
          axis === 'ns' ? fixedCoord : mid,
          urbanY + yOffset,
          axis === 'ns' ? mid : fixedCoord,
          -Math.PI / 2,
          0,
          0
        );

        const stripeLen = Math.max(2, spanLen - 4);
        const sw = axis === 'ns' ? 0.45 : stripeLen;
        const sd = axis === 'ns' ? stripeLen : 0.45;
        pushTransformedGeo(
          mergedStripeGeos,
          new THREE.PlaneGeometry(sw, sd),
          axis === 'ns' ? fixedCoord : mid,
          urbanY + yOffset + 0.03,
          axis === 'ns' ? mid : fixedCoord,
          -Math.PI / 2,
          0,
          0
        );
      }
      spanStart = null;
    };

    for (let pos = rangeMin; pos <= rangeMax; pos += step) {
      const sampleX = axis === 'ns' ? fixedCoord : pos;
      const sampleZ = axis === 'ns' ? pos : fixedCoord;
      if (isValidUrbanRoadSample(sampleX, sampleZ, halfW)) {
        if (spanStart === null) spanStart = pos;
      } else {
        flushSpan(pos - step);
      }
    }
    flushSpan(rangeMax);
  };

  const roadMinX = URBAN_NS_AXES[0] - 8;
  const roadMaxX = URBAN_NS_AXES[URBAN_NS_AXES.length - 1] + 8;
  const roadMinZ = URBAN_EW_AXES[0] - 8;
  const roadMaxZ = URBAN_EW_AXES[URBAN_EW_AXES.length - 1] + 8;

  for (const ax of URBAN_NS_AXES) {
    addValidatedRoadAxis('ns', ax, roadMinZ, roadMaxZ, 0);
  }
  for (const sz of URBAN_EW_AXES) {
    addValidatedRoadAxis('ew', sz, roadMinX, roadMaxX, 0.01);
  }

  const allRoadsGeo = mergeNormalizedGeos(mergedRoadGeos);
  if (allRoadsGeo) {
    const allRoadsMesh = new THREE.Mesh(allRoadsGeo, roadMat);
    allRoadsMesh.receiveShadow = true;
    allRoadsMesh.castShadow = false;
    root.add(allRoadsMesh);
  }
  const allStripesGeo = mergeNormalizedGeos(mergedStripeGeos);
  if (allStripesGeo) {
    const allStripesMesh = new THREE.Mesh(allStripesGeo, stripeMat);
    allStripesMesh.castShadow = false;
    root.add(allStripesMesh);
  }

  // === 5A. GRAND URBAN PARK: ORNAMENTAL LAKE + FOOTBRIDGE + ARENA CENTRAL STADIUM ===
  const parkW = PARK_RECT.maxX - PARK_RECT.minX;
  const parkD = PARK_RECT.maxZ - PARK_RECT.minZ;
  const parkCx = (PARK_RECT.minX + PARK_RECT.maxX) / 2;
  const parkCz = (PARK_RECT.minZ + PARK_RECT.maxZ) / 2;

  const parkLawn = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(parkW, 0.25, parkD)),
    trackMat(new THREE.MeshStandardMaterial({ color: 0x3b8238, roughness: 0.94, metalness: 0.0 }))
  );
  parkLawn.position.set(parkCx, 3.05, parkCz);
  parkLawn.receiveShadow = true;
  root.add(parkLawn);

  const pathMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xbfaf90, roughness: 0.94, metalness: 0.0 })
  );
  const pathH = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(parkW - 8, 0.3, 4.4)), pathMat);
  pathH.position.set(parkCx, 3.08, parkCz);
  pathH.receiveShadow = true;
  root.add(pathH);

  const pathDiv = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(4.4, 0.3, parkD - 8)), pathMat);
  pathDiv.position.set(-4, 3.08, parkCz);
  pathDiv.receiveShadow = true;
  root.add(pathDiv);

  // Ornamental Park Lake (West Half of Park) + Wooden Footbridge + Center Fountain
  const pondRimGeo = trackGeo(new THREE.CylinderGeometry(1, 1.04, 0.45, 24));
  const pondRim = new THREE.Mesh(pondRimGeo, concreteMat);
  pondRim.position.set(PARK_POND_POS.x, 3.22, PARK_POND_POS.z);
  pondRim.scale.set(PARK_POND_POS.rx, 1, PARK_POND_POS.rz);
  pondRim.receiveShadow = true;
  root.add(pondRim);

  const pondWater = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.95, 0.95, 0.48, 24)), lakeMat);
  pondWater.position.set(PARK_POND_POS.x, 3.28, PARK_POND_POS.z);
  pondWater.scale.set(PARK_POND_POS.rx, 1, PARK_POND_POS.rz);
  root.add(pondWater);

  const footbridgeDeck = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(PARK_POND_POS.rx * 2.08, 0.45, 3.6)),
    warmTimberMat
  );
  footbridgeDeck.position.set(PARK_POND_POS.x, 4.1, PARK_POND_POS.z);
  footbridgeDeck.castShadow = true;
  root.add(footbridgeDeck);

  for (const rz of [-1.65, 1.65]) {
    const rail = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(PARK_POND_POS.rx * 2.04, 0.95, 0.22)),
      timberMat
    );
    rail.position.set(PARK_POND_POS.x, 4.7, PARK_POND_POS.z + rz);
    root.add(rail);
  }

  const fountainSpire = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(1.1, 4.2, 8)), foamMat);
  fountainSpire.position.set(PARK_POND_POS.x, 5.4, PARK_POND_POS.z - 12);
  root.add(fountainSpire);

  // Urban Stadium ("Arena Central") on the East Half of the Grand Park
  const stadiumGroup = new THREE.Group();
  stadiumGroup.position.set(STADIUM_POS.x, 3.06, STADIUM_POS.z);
  const stadScaleX = STADIUM_POS.rx / 36;
  const stadScaleZ = STADIUM_POS.rz / 36;

  const stadiumOuterMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xb8c3cf, roughness: 0.9, metalness: 0.0 })
  );
  const stadiumSeatsMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x334e68, roughness: 0.92, metalness: 0.0 })
  );
  const stadiumRoofMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xd9e2ec, roughness: 0.86, metalness: 0.0 })
  );
  const pitchMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x2f8f3b, roughness: 0.95, metalness: 0.0 })
  );
  const pitchLineMat = trackMat(new THREE.MeshBasicMaterial({ color: 0xf1f5f9 }));
  const stadiumFloodMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      emissive: 0xfff8dc,
      emissiveIntensity: 0,
      roughness: 0.2,
    })
  );

  // Outer Stadium Bowl Wall (open-ended cylinder scaled into oval)
  const bowlOuter = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(35.5, 34.0, 14.5, 28, 1, true)),
    stadiumOuterMat
  );
  bowlOuter.position.y = 7.25;
  bowlOuter.scale.set(stadScaleX, 1, stadScaleZ);
  bowlOuter.castShadow = true;
  bowlOuter.receiveShadow = true;
  stadiumGroup.add(bowlOuter);
  raycastTargets.push(bowlOuter);

  // Stepped Seating Ring & Overhanging Canopy Roof
  const seatsTier = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(34.2, 23.0, 12.2, 28, 1, true)),
    stadiumSeatsMat
  );
  seatsTier.material.side = THREE.DoubleSide;
  seatsTier.position.y = 6.2;
  seatsTier.scale.set(stadScaleX, 1, stadScaleZ);
  stadiumGroup.add(seatsTier);

  const roofRimGeo = trackGeo(new THREE.RingGeometry(24.5, 36.2, 28));
  roofRimGeo.rotateX(-Math.PI / 2);
  const roofRim = new THREE.Mesh(roofRimGeo, stadiumRoofMat);
  roofRim.material.side = THREE.DoubleSide;
  roofRim.position.y = 14.8;
  roofRim.scale.set(stadScaleX, 1, stadScaleZ);
  roofRim.castShadow = true;
  roofRim.receiveShadow = true;
  stadiumGroup.add(roofRim);

  // Football / Soccer Pitch + White Markings (scaled for expanded Arena Central)
  const pitchMesh = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(58, 0.35, 82)), pitchMat);
  pitchMesh.position.y = 0.2;
  pitchMesh.receiveShadow = true;
  stadiumGroup.add(pitchMesh);

  const midLine = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(52, 0.08, 0.65)), pitchLineMat);
  midLine.position.y = 0.42;
  stadiumGroup.add(midLine);

  const centerCircleGeo = trackGeo(new THREE.RingGeometry(6.4, 7.1, 24));
  centerCircleGeo.rotateX(-Math.PI / 2);
  const centerCircle = new THREE.Mesh(centerCircleGeo, pitchLineMat);
  centerCircle.position.y = 0.44;
  stadiumGroup.add(centerCircle);

  // 4 Tall Corner Floodlight Towers
  for (const [fx, fz] of [
    [-40, -50],
    [40, -50],
    [-40, 50],
    [40, 50],
  ]) {
    const fMast = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.46, 0.8, 30, 6)),
      darkConcreteMat
    );
    fMast.position.set(fx, 15, fz);
    fMast.castShadow = true;
    stadiumGroup.add(fMast);

    const fHead = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(6.6, 3.2, 1.3)), stadiumFloodMat);
    fHead.position.set(fx, 30.4, fz);
    fHead.lookAt(STADIUM_POS.x, 3.5, STADIUM_POS.z);
    stadiumGroup.add(fHead);
  }
  root.add(stadiumGroup);

  // === 5B. INSTANCED WARM AVENUE STREETLAMPS (auto-lit at Dusk & Night) ===
  const streetLampPositions: Array<{ x: number; z: number; rotY: number }> = [];

  const isNearIntersection = (x: number, z: number): boolean => {
    for (const ax of URBAN_NS_AXES) {
      for (const sz of URBAN_EW_AXES) {
        if (Math.abs(x - ax) < 10.5 && Math.abs(z - sz) < 10.5) return true;
      }
    }
    return false;
  };
  const overlapsBuilding = (x: number, z: number): boolean => {
    for (const b of BUILDING_SPECS) {
      if (
        Math.abs(x - b.x) < b.width * 0.5 + 1.8 &&
        Math.abs(z - b.z) < b.depth * 0.5 + 1.8
      ) {
        return true;
      }
    }
    return false;
  };

  for (const ax of URBAN_NS_AXES) {
    let sideToggle = 1;
    for (let z = roadMinZ + 10; z <= roadMaxZ - 10; z += 44) {
      if (!isValidUrbanRoadSample(ax, z, 5.5)) continue;
      if (isNearIntersection(ax, z)) continue;
      const lx = ax + sideToggle * 6.4;
      sideToggle = -sideToggle;
      if (overlapsBuilding(lx, z)) continue;
      const ty = getTerrainHeight(lx, z);
      if (Math.abs(ty - 3.0) > 0.35) continue;
      streetLampPositions.push({ x: lx, z, rotY: sideToggle > 0 ? 0 : Math.PI });
    }
  }
  for (const sz of URBAN_EW_AXES) {
    let sideToggle = 1;
    for (let x = roadMinX + 10; x <= roadMaxX - 10; x += 46) {
      if (!isValidUrbanRoadSample(x, sz, 5.5)) continue;
      if (isNearIntersection(x, sz)) continue;
      const lz = sz + sideToggle * 6.4;
      sideToggle = -sideToggle;
      if (overlapsBuilding(x, lz)) continue;
      const ty = getTerrainHeight(x, lz);
      if (Math.abs(ty - 3.0) > 0.35) continue;
      streetLampPositions.push({ x, z: lz, rotY: sideToggle > 0 ? Math.PI / 2 : -Math.PI / 2 });
    }
  }

  const lampCount = streetLampPositions.length;
  const lampPoleMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.65, metalness: 0.55 })
  );
  const lampBulbMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xfff3d1,
      emissive: 0xffb84d,
      emissiveIntensity: 0.0,
      roughness: 0.2,
    })
  );
  const lampGlowPoolMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xffc66e,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );

  // Split streetlamps into 2x2 urban spatial quadrants so distant/out-of-view lamps cull aggressively
  const urbanMidX = (URBAN_BOUNDS.minX + URBAN_BOUNDS.maxX) * 0.5;
  const urbanMidZ = (URBAN_BOUNDS.minZ + URBAN_BOUNDS.maxZ) * 0.5;
  const getCityQuadIdx = (x: number, z: number): number =>
    (x >= urbanMidX ? 1 : 0) + (z >= urbanMidZ ? 2 : 0);

  if (lampCount > 0) {
    const poleGeo = trackGeo(new THREE.CylinderGeometry(0.11, 0.16, 6.4, 6));
    poleGeo.translate(0, 3.2, 0);
    const bulbGeo = trackGeo(new THREE.SphereGeometry(0.42, 7, 7));
    bulbGeo.translate(0, 6.45, 0);
    const poolGeo = trackGeo(new THREE.CircleGeometry(4.6, 14));
    poolGeo.rotateX(-Math.PI / 2);

    const lampQuads: Array<Array<{ x: number; z: number; rotY: number }>> = [[], [], [], []];
    for (let i = 0; i < streetLampPositions.length; i++) {
      const lp = streetLampPositions[i];
      lampQuads[getCityQuadIdx(lp.x, lp.z)].push(lp);
    }

    const lampDummy = new THREE.Object3D();
    for (let q = 0; q < 4; q++) {
      const qLamps = lampQuads[q];
      if (qLamps.length === 0) continue;

      const poleInst = new THREE.InstancedMesh(poleGeo, lampPoleMat, qLamps.length);
      const bulbInst = new THREE.InstancedMesh(bulbGeo, lampBulbMat, qLamps.length);
      const poolInst = new THREE.InstancedMesh(poolGeo, lampGlowPoolMat, qLamps.length);

      qLamps.forEach((lp, idx) => {
        lampDummy.position.set(lp.x, urbanY - 0.02, lp.z);
        lampDummy.rotation.set(0, lp.rotY, 0);
        lampDummy.scale.setScalar(1);
        lampDummy.updateMatrix();
        poleInst.setMatrixAt(idx, lampDummy.matrix);
        bulbInst.setMatrixAt(idx, lampDummy.matrix);

        lampDummy.position.set(lp.x, urbanY + 0.07, lp.z);
        lampDummy.rotation.set(0, 0, 0);
        lampDummy.updateMatrix();
        poolInst.setMatrixAt(idx, lampDummy.matrix);
      });

      poleInst.instanceMatrix.needsUpdate = true;
      bulbInst.instanceMatrix.needsUpdate = true;
      poolInst.instanceMatrix.needsUpdate = true;
      poleInst.castShadow = false;
      bulbInst.castShadow = false;
      poolInst.castShadow = false;
      poleInst.computeBoundingSphere();
      bulbInst.computeBoundingSphere();
      poolInst.computeBoundingSphere();
      root.add(poleInst, bulbInst, poolInst);

      if (poleInst.boundingSphere) {
        spatialLOD.addDetailLayer(poleInst, poleInst.boundingSphere.clone(), 540, 450);
        // Night bulbs & light pools stay off during clear daylight (0 draw cost!) and glow up to 620m at night
        spatialLOD.addDetailLayer(bulbInst, poleInst.boundingSphere.clone(), 620, 480, true);
        spatialLOD.addDetailLayer(poolInst, poleInst.boundingSphere.clone(), 540, 450, true);
      }
    }
  }

  // === 6. EXPANDED CITY BUILDINGS — MERGED & INSTANCED BY MATERIAL (~2,000 draw calls -> ~24 draw calls!) ===
  const standardPadTex = trackTex(createHelipadTexture(maxAnisotropy, 'standard'));
  const hospitalPadTex = trackTex(createHelipadTexture(maxAnisotropy, 'hospital'));

  const sharedStandardPadMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: standardPadTex,
      roughness: 0.88,
      metalness: 0.0,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    })
  );
  const sharedHospitalPadMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: hospitalPadTex,
      roughness: 0.88,
      metalness: 0.0,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    })
  );
  const roofConcreteMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x546272, roughness: 0.92, metalness: 0.0 })
  );
  const rooftopWoodTankMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x9a6b43, roughness: 0.88, metalness: 0.0 })
  );
  const rooftopMetalMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x8f9eb0, roughness: 0.62, metalness: 0.3 })
  );
  const rooftopFanMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.78, metalness: 0.25 })
  );
  const podiumInstMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0.0 })
  );
  const crownGlassVertexMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness: 0.32,
      metalness: 0.38,
    })
  );

  const facadeMatCache = new Map<string, THREE.MeshStandardMaterial>();
  const facadeGeoBuckets = new Map<THREE.MeshStandardMaterial, THREE.BufferGeometry[]>();
  const getFacadeMat = (
    color: number,
    accent: number,
    style: 'office' | 'residential' | 'hospital' | 'civic' | 'tower',
    variantSeed: number
  ) => {
    const key = `${color}_${accent}_${style}_${variantSeed % 3}`;
    let m = facadeMatCache.get(key);
    if (!m) {
      const baseHex = `#${color.toString(16).padStart(6, '0')}`;
      const accentHex = `#${accent.toString(16).padStart(6, '0')}`;
      const winHex = style === 'tower' ? '#38bdf8' : style === 'hospital' ? '#93c5fd' : '#475569';
      const pair = createFacadeTextures(
        maxAnisotropy,
        baseHex,
        winHex,
        accentHex,
        style,
        variantSeed
      );
      trackTex(pair.map);
      trackTex(pair.emissiveMap);

      m = trackMat(
        new THREE.MeshStandardMaterial({
          map: pair.map,
          emissiveMap: pair.emissiveMap,
          emissive: new THREE.Color(0xffffff),
          emissiveIntensity: 0,
          roughness: style === 'tower' ? 0.86 : 0.92,
          metalness: 0.0,
        })
      );
      facadeMatCache.set(key, m);
      facadeGeoBuckets.set(m, []);
      nightWindowMats.push(m);
    }
    return m;
  };

  // Push 4 vertical facade quads matching BoxGeometry side UV orientation 1-to-1 (skips hidden bottom face!)
  const pushTowerWallQuads = (
    bucket: THREE.BufferGeometry[],
    cx: number,
    cy: number,
    cz: number,
    w: number,
    h: number,
    d: number
  ) => {
    pushTransformedGeo(bucket, new THREE.PlaneGeometry(w, h), cx, cy, cz + d * 0.5, 0, 0, 0);
    pushTransformedGeo(bucket, new THREE.PlaneGeometry(w, h), cx, cy, cz - d * 0.5, 0, Math.PI, 0);
    pushTransformedGeo(bucket, new THREE.PlaneGeometry(d, h), cx + w * 0.5, cy, cz, 0, Math.PI * 0.5, 0);
    pushTransformedGeo(bucket, new THREE.PlaneGeometry(d, h), cx - w * 0.5, cy, cz, 0, -Math.PI * 0.5, 0);
  };

  const cityRoofCapGeos: THREE.BufferGeometry[] = [];
  const cityPadStdGeos: THREE.BufferGeometry[] = [];
  const cityPadHospGeos: THREE.BufferGeometry[] = [];
  const cityCrownGlassGeos: THREE.BufferGeometry[] = [];
  const cityCrownCollarGeos: THREE.BufferGeometry[] = [];
  // Major skyscraper spires remain visible as part of the main city skyline silhouette
  const citySkyscraperSpireGeos: THREE.BufferGeometry[] = [];

  // Small rooftop details (parapets, HVAC, water tanks, small antennas, fans) partitioned into 2x2 quadrants
  // so they automatically hide beyond ~390m while preserving the iconic skyscraper silhouettes!
  const quadParapetGeos: THREE.BufferGeometry[][] = [[], [], [], []];
  const quadSmallMetalGeos: THREE.BufferGeometry[][] = [[], [], [], []];
  const quadWoodTankGeos: THREE.BufferGeometry[][] = [[], [], [], []];
  const quadDarkDetailGeos: THREE.BufferGeometry[][] = [[], [], [], []];
  const quadFanGeos: THREE.BufferGeometry[][] = [[], [], [], []];

  // 1 InstancedMesh for ALL building podiums (1 draw call + 1 material for the entire city!)
  const unitPodiumGeo = trackGeo(new THREE.BoxGeometry(1, 1, 1));
  const podiumInst = new THREE.InstancedMesh(unitPodiumGeo, podiumInstMat, BUILDING_SPECS.length);
  podiumInst.castShadow = true;
  podiumInst.receiveShadow = true;
  const bDummy = new THREE.Object3D();
  const bCol = new THREE.Color();

  BUILDING_SPECS.forEach((b, bIdx) => {
    const groundY = getTerrainHeight(b.x, b.z);
    const qIdx = getCityQuadIdx(b.x, b.z);

    // Podium instance
    bDummy.position.set(b.x, groundY + 1.6, b.z);
    bDummy.rotation.set(0, 0, 0);
    bDummy.scale.set(b.width + 1.2, 3.2, b.depth + 1.2);
    bDummy.updateMatrix();
    podiumInst.setMatrixAt(bIdx, bDummy.matrix);
    bCol.setHex(b.accentColor);
    podiumInst.setColorAt(bIdx, bCol);

    // Tower side facades (merged per shared facade material) + roof cap
    const facadeMat = getFacadeMat(b.color, b.accentColor, b.style, bIdx + 1);
    const facadeBucket = facadeGeoBuckets.get(facadeMat)!;
    pushTowerWallQuads(facadeBucket, b.x, groundY + b.height * 0.5, b.z, b.width, b.height, b.depth);
    pushTransformedGeo(
      cityRoofCapGeos,
      new THREE.PlaneGeometry(b.width, b.depth),
      b.x,
      groundY + b.height,
      b.z,
      -Math.PI * 0.5,
      0,
      0
    );

    if (b.hasHelipad) {
      const padSize = Math.min(b.width, b.depth) - 2.4;
      pushTransformedGeo(
        b.style === 'hospital' ? cityPadHospGeos : cityPadStdGeos,
        new THREE.BoxGeometry(padSize, 0.34, padSize),
        b.x,
        groundY + b.height + 0.17,
        b.z
      );
      addHelipadPerimeterLights(root, b.x, groundY + b.height + 0.48, b.z, padSize / 2 - 0.55);
    } else {
      const parapetH = 0.85;
      const pThick = 0.65;
      const py = groundY + b.height + parapetH * 0.5;
      pushTransformedGeo(quadParapetGeos[qIdx], new THREE.BoxGeometry(b.width + 0.2, parapetH, pThick), b.x, py, b.z - b.depth * 0.5 + pThick * 0.5);
      pushTransformedGeo(quadParapetGeos[qIdx], new THREE.BoxGeometry(b.width + 0.2, parapetH, pThick), b.x, py, b.z + b.depth * 0.5 - pThick * 0.5);
      pushTransformedGeo(quadParapetGeos[qIdx], new THREE.BoxGeometry(pThick, parapetH, b.depth - pThick), b.x - b.width * 0.5 + pThick * 0.5, py, b.z);
      pushTransformedGeo(quadParapetGeos[qIdx], new THREE.BoxGeometry(pThick, parapetH, b.depth - pThick), b.x + b.width * 0.5 - pThick * 0.5, py, b.z);

      const hvacW = b.width * 0.34;
      const hvacD = b.depth * 0.3;
      const hvacX = b.x + b.width * 0.18;
      const hvacZ = b.z - b.depth * 0.16;
      pushTransformedGeo(quadSmallMetalGeos[qIdx], new THREE.BoxGeometry(hvacW, 2.0, hvacD), hvacX, groundY + b.height + 1.0, hvacZ);
      pushTransformedGeo(quadFanGeos[qIdx], new THREE.CylinderGeometry(hvacW * 0.24, hvacW * 0.24, 0.25, 8), hvacX, groundY + b.height + 2.05, hvacZ);
      pushTransformedGeo(quadDarkDetailGeos[qIdx], new THREE.BoxGeometry(3.2, 1.5, 2.6), b.x - b.width * 0.22, groundY + b.height + 0.75, b.z - b.depth * 0.22);

      if (b.style === 'residential' || bIdx % 2 === 0) {
        const tankX = b.x + b.width * 0.22;
        const tankZ = b.z + b.depth * 0.22;
        pushTransformedGeo(quadDarkDetailGeos[qIdx], new THREE.CylinderGeometry(1.15, 1.45, 1.6, 6), tankX, groundY + b.height + 0.8, tankZ);
        pushTransformedGeo(
          b.style === 'residential' ? quadWoodTankGeos[qIdx] : quadSmallMetalGeos[qIdx],
          new THREE.CylinderGeometry(1.55, 1.55, 2.5, 8),
          tankX,
          groundY + b.height + 2.8,
          tankZ
        );
        pushTransformedGeo(quadDarkDetailGeos[qIdx], new THREE.ConeGeometry(1.72, 0.95, 8), tankX, groundY + b.height + 4.5, tankZ);
      }

      if (b.crownStyle && b.crownStyle !== 'flat') {
        const sH = b.spireHeight ?? 26;
        if (b.crownStyle === 'pyramid') {
          const pyrH = sH * 0.58;
          const pyrRadius = Math.min(b.width, b.depth) * 0.62;
          pushTransformedGeo(
            cityCrownGlassGeos,
            new THREE.ConeGeometry(pyrRadius, pyrH, 4),
            b.x,
            groundY + b.height + pyrH * 0.5,
            b.z,
            0,
            Math.PI / 4,
            0,
            1,
            1,
            1,
            b.accentColor
          );
          const tipSpireH = sH * 0.55;
          pushTransformedGeo(
            citySkyscraperSpireGeos,
            new THREE.CylinderGeometry(0.14, 0.42, tipSpireH, 6),
            b.x,
            groundY + b.height + pyrH + tipSpireH * 0.45,
            b.z
          );
          skyRedBeaconCoords.push({
            x: b.x,
            y: groundY + b.height + pyrH + tipSpireH * 0.94,
            z: b.z,
            r: 0.68,
          });
        } else if (b.crownStyle === 'stepped_spire') {
          const t1H = sH * 0.28;
          const t2H = sH * 0.24;
          pushTowerWallQuads(
            facadeBucket,
            b.x,
            groundY + b.height + t1H * 0.5,
            b.z,
            b.width * 0.72,
            t1H,
            b.depth * 0.72
          );
          pushTransformedGeo(
            cityRoofCapGeos,
            new THREE.PlaneGeometry(b.width * 0.72, b.depth * 0.72),
            b.x,
            groundY + b.height + t1H,
            b.z,
            -Math.PI * 0.5,
            0,
            0
          );
          pushTransformedGeo(
            cityCrownGlassGeos,
            new THREE.BoxGeometry(b.width * 0.44, t2H, b.depth * 0.44),
            b.x,
            groundY + b.height + t1H + t2H * 0.5,
            b.z,
            0,
            0,
            0,
            1,
            1,
            1,
            b.accentColor
          );
          const mastH = sH * 0.65;
          pushTransformedGeo(
            citySkyscraperSpireGeos,
            new THREE.CylinderGeometry(0.16, 0.65, mastH, 6),
            b.x,
            groundY + b.height + t1H + t2H + mastH * 0.5,
            b.z
          );
          skyRedBeaconCoords.push({
            x: b.x,
            y: groundY + b.height + t1H + t2H + mastH + 0.4,
            z: b.z,
            r: 0.72,
          });
        } else if (b.crownStyle === 'needle') {
          const crownTierH = sH * 0.34;
          pushTransformedGeo(
            cityCrownGlassGeos,
            new THREE.CylinderGeometry(b.width * 0.22, b.width * 0.58, crownTierH, 4),
            b.x,
            groundY + b.height + crownTierH * 0.5,
            b.z,
            0,
            Math.PI / 4,
            0,
            1,
            1,
            1,
            b.accentColor
          );
          pushTransformedGeo(
            cityCrownCollarGeos,
            new THREE.BoxGeometry(b.width * 0.52, 1.4, b.depth * 0.52),
            b.x,
            groundY + b.height + crownTierH * 0.35,
            b.z
          );
          const needleH = sH * 0.85;
          pushTransformedGeo(
            citySkyscraperSpireGeos,
            new THREE.CylinderGeometry(0.15, 0.85, needleH, 8),
            b.x,
            groundY + b.height + crownTierH + needleH * 0.46,
            b.z
          );
          skyRedBeaconCoords.push({
            x: b.x,
            y: groundY + b.height + crownTierH + needleH * 0.92,
            z: b.z,
            r: 0.84,
          });
        }
      } else if (b.height >= 26) {
        const antH = b.height >= 48 ? 14.0 : 8.5;
        const antX = b.x - b.width * 0.24;
        const antZ = b.z + b.depth * 0.22;
        pushTransformedGeo(
          quadSmallMetalGeos[qIdx],
          new THREE.CylinderGeometry(0.11, 0.24, antH, 6),
          antX,
          groundY + b.height + antH * 0.5,
          antZ
        );
        pushTransformedGeo(
          quadSmallMetalGeos[qIdx],
          new THREE.BoxGeometry(2.2, 0.14, 0.14),
          antX,
          groundY + b.height + antH * 0.72,
          antZ
        );
        skyRedBeaconCoords.push({ x: antX, y: groundY + b.height + antH + 0.35, z: antZ, r: 0.48 });
      }
    }
  });

  // Finalize instanced podiums & merged city batches
  podiumInst.instanceMatrix.needsUpdate = true;
  if (podiumInst.instanceColor) podiumInst.instanceColor.needsUpdate = true;
  podiumInst.computeBoundingSphere();
  root.add(podiumInst);
  raycastTargets.push(podiumInst);

  facadeGeoBuckets.forEach((geos, mat) => {
    const merged = mergeNormalizedGeos(geos);
    if (!merged) return;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
    raycastTargets.push(mesh);
  });

  const mergedRoofCaps = mergeNormalizedGeos(cityRoofCapGeos);
  if (mergedRoofCaps) {
    const m = new THREE.Mesh(mergedRoofCaps, roofConcreteMat);
    m.receiveShadow = true;
    m.castShadow = false;
    root.add(m);
    raycastTargets.push(m);
  }
  const mergedStdPads = mergeNormalizedGeos(cityPadStdGeos);
  if (mergedStdPads) {
    const m = new THREE.Mesh(mergedStdPads, sharedStandardPadMat);
    m.receiveShadow = true;
    m.castShadow = false;
    root.add(m);
    raycastTargets.push(m);
  }
  const mergedHospPads = mergeNormalizedGeos(cityPadHospGeos);
  if (mergedHospPads) {
    const m = new THREE.Mesh(mergedHospPads, sharedHospitalPadMat);
    m.receiveShadow = true;
    m.castShadow = false;
    root.add(m);
    raycastTargets.push(m);
  }
  const mergedCrowns = mergeNormalizedGeos(cityCrownGlassGeos, true);
  if (mergedCrowns) {
    const m = new THREE.Mesh(mergedCrowns, crownGlassVertexMat);
    m.castShadow = true;
    m.receiveShadow = true;
    root.add(m);
  }
  const mergedCollars = mergeNormalizedGeos(cityCrownCollarGeos);
  if (mergedCollars) {
    const m = new THREE.Mesh(mergedCollars, chaletWindowMat);
    m.castShadow = false;
    root.add(m);
  }
  const mergedSpires = mergeNormalizedGeos(citySkyscraperSpireGeos);
  if (mergedSpires) {
    const m = new THREE.Mesh(mergedSpires, rooftopMetalMat);
    m.castShadow = false;
    m.receiveShadow = true;
    root.add(m);
  }

  // Build 4 spatial quadrant small-detail groups (hidden > 390m while preserving skyscraper silhouettes!)
  for (let q = 0; q < 4; q++) {
    const quadGroup = new THREE.Group();
    const quadBox = new THREE.Box3();
    let hasAny = false;

    const addQuadMesh = (geos: THREE.BufferGeometry[], mat: THREE.Material, receive = true) => {
      const merged = mergeNormalizedGeos(geos);
      if (!merged) return;
      const m = new THREE.Mesh(merged, mat);
      m.castShadow = false;
      m.receiveShadow = receive;
      quadGroup.add(m);
      if (merged.boundingBox) quadBox.union(merged.boundingBox);
      hasAny = true;
    };

    addQuadMesh(quadParapetGeos[q], concreteMat, true);
    addQuadMesh(quadSmallMetalGeos[q], rooftopMetalMat, true);
    addQuadMesh(quadWoodTankGeos[q], rooftopWoodTankMat, true);
    addQuadMesh(quadDarkDetailGeos[q], darkConcreteMat, true);
    addQuadMesh(quadFanGeos[q], rooftopFanMat, false);

    if (hasAny) {
      root.add(quadGroup);
      const qSphere = new THREE.Sphere();
      quadBox.getBoundingSphere(qSphere);
      spatialLOD.addDetailLayer(quadGroup, qSphere, 540, 450);
    }
  }

  // === 6B. DAM OVERLOOK HELIPAD (H-05) & DENSE FOREST BASE ("Base Florestal", FLO-1) ===
  const damPad = helipads.find((h) => h.id === 'pad_dam');
  if (damPad) {
    const damPadPlinth = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(21.2, 3.6, 21.2)),
      darkConcreteMat
    );
    damPadPlinth.position.set(damPad.x, damPad.y - 2.35, damPad.z);
    damPadPlinth.castShadow = true;
    damPadPlinth.receiveShadow = true;
    root.add(damPadPlinth);

    const damPadMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: standardPadTex,
        roughness: 0.88,
        metalness: 0.0,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      })
    );
    const damPadSlab = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(20, 0.9, 20)), damPadMat);
    damPadSlab.position.set(damPad.x, damPad.y - 0.45, damPad.z);
    damPadSlab.castShadow = true;
    damPadSlab.receiveShadow = true;
    root.add(damPadSlab);
    raycastTargets.push(damPadSlab);
    addHelipadPerimeterLights(root, damPad.x, damPad.y + 0.28, damPad.z, 9.2);
  }

  // Dense Forest Ranger Base Helipad (FLO-1) + Ranger Cabin + Tall Wooden Fire Lookout Tower
  const forestPad = helipads.find((h) => h.id === 'pad_forest_base');
  if (forestPad) {
    const forestPadTex = trackTex(createHelipadTexture(maxAnisotropy, 'forest'));
    const forestPadMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: forestPadTex,
        roughness: 0.88,
        metalness: 0.0,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      })
    );
    const fPlinth = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(22.4, 3.4, 22.4)), darkConcreteMat);
    fPlinth.position.set(forestPad.x, forestPad.y - 2.2, forestPad.z);
    fPlinth.receiveShadow = true;
    root.add(fPlinth);

    const fSlab = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(21, 0.9, 21)), forestPadMat);
    fSlab.position.set(forestPad.x, forestPad.y - 0.45, forestPad.z);
    fSlab.castShadow = true;
    fSlab.receiveShadow = true;
    root.add(fSlab);
    raycastTargets.push(fSlab);
    addHelipadPerimeterLights(root, forestPad.x, forestPad.y + 0.28, forestPad.z, 9.8);

    const forestGroundY = getTerrainHeight(FOREST_PAD_POS.x, FOREST_PAD_POS.z);
    const forestRoofMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0x265432, roughness: 0.88, metalness: 0.0 })
    );

    // Ranger Station Timber Cabin
    const rangerCabin = new THREE.Group();
    rangerCabin.position.set(FOREST_PAD_POS.x + 21, forestGroundY, FOREST_PAD_POS.z - 4);
    const cabinBody = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(13, 4.8, 15)), timberMat);
    cabinBody.position.y = 2.4;
    cabinBody.castShadow = true;
    cabinBody.receiveShadow = true;
    rangerCabin.add(cabinBody);
    raycastTargets.push(cabinBody);

    const cabinRoof = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(10.8, 4.2, 4)), forestRoofMat);
    cabinRoof.rotation.y = Math.PI / 4;
    cabinRoof.scale.set(1.05, 1, 1.15);
    cabinRoof.position.y = 6.8;
    cabinRoof.castShadow = true;
    rangerCabin.add(cabinRoof);

    const cabinWin = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(13.25, 1.8, 8.8)), chaletWindowMat);
    cabinWin.position.y = 2.7;
    rangerCabin.add(cabinWin);
    root.add(rangerCabin);

    // Tall 26m Wood & Steel-Braced Fire Lookout Watchtower
    const lookoutG = new THREE.Group();
    lookoutG.position.set(FOREST_PAD_POS.x - 19, forestGroundY, FOREST_PAD_POS.z - 17);
    const watchSteelMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.65, metalness: 0.45 })
    );
    for (const lx of [-2.8, 2.8]) {
      for (const lz of [-2.8, 2.8]) {
        const post = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.28, 0.5, 20.5, 6)), timberMat);
        post.position.set(lx, 10.25, lz);
        post.castShadow = true;
        lookoutG.add(post);
      }
    }
    for (const braceY of [6.5, 13.5]) {
      const collar = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(6.0, 0.45, 6.0)), watchSteelMat);
      collar.position.y = braceY;
      lookoutG.add(collar);
    }
    const lookoutDeck = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(8.4, 0.75, 8.4)), warmTimberMat);
    lookoutDeck.position.y = 20.5;
    lookoutDeck.castShadow = true;
    lookoutG.add(lookoutDeck);

    const lookoutCab = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(5.8, 3.6, 5.8)), chaletWindowMat);
    lookoutCab.position.y = 22.6;
    lookoutG.add(lookoutCab);
    raycastTargets.push(lookoutCab);

    const lookoutRoof = new THREE.Mesh(
      trackGeo(new THREE.ConeGeometry(5.8, 2.6, 4)),
      trackMat(new THREE.MeshStandardMaterial({ color: 0xb92c30, roughness: 0.85, metalness: 0.0 }))
    );
    lookoutRoof.rotation.y = Math.PI / 4;
    lookoutRoof.position.y = 25.6;
    lookoutG.add(lookoutRoof);

    const lookoutBeacon = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.48, 8, 8)), skyRedBeaconMat);
    lookoutBeacon.position.y = 27.1;
    lookoutG.add(lookoutBeacon);
    root.add(lookoutG);

    // 2 Additional Forest Guard Cabins in scenic forest clearings
    for (const oc of FOREST_OUTPOST_CABINS) {
      const ocy = getTerrainHeight(oc.x, oc.z);
      const outCab = new THREE.Group();
      outCab.position.set(oc.x, ocy, oc.z);
      outCab.rotation.y = oc.rotY;

      const body = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(9.2, 4.0, 10.6)), timberMat);
      body.position.y = 2.0;
      body.castShadow = true;
      body.receiveShadow = true;
      outCab.add(body);
      raycastTargets.push(body);

      const roof = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(7.8, 3.4, 4)), forestRoofMat);
      roof.rotation.y = Math.PI / 4;
      roof.scale.set(1.05, 1, 1.15);
      roof.position.y = 5.6;
      roof.castShadow = true;
      outCab.add(roof);

      const win = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(9.45, 1.4, 5.8)), chaletWindowMat);
      win.position.y = 2.3;
      outCab.add(win);

      const porch = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(9.4, 0.4, 3.2)), warmTimberMat);
      porch.position.set(0, 0.35, 6.4);
      outCab.add(porch);
      root.add(outCab);
    }
  }

  // Forest Campsite Clearing (4 Colorful A-frame Tents, Log Benches & Flickering Campfire)
  const campY = getTerrainHeight(FOREST_CAMP_POS.x, FOREST_CAMP_POS.z);
  const campGroup = new THREE.Group();
  campGroup.position.set(FOREST_CAMP_POS.x, campY, FOREST_CAMP_POS.z);

  const tentColors = [0xea580c, 0x0ea5e9, 0xeab308, 0x10b981];
  const tentGeo = trackGeo(new THREE.CylinderGeometry(0.1, 2.6, 2.8, 3));
  tentGeo.rotateY(Math.PI / 6);
  const tentOffsets: Array<[number, number, number]> = [
    [-7.5, -5.5, 0.7],
    [7.8, -5.0, -0.8],
    [-6.8, 6.8, 2.2],
    [7.2, 6.2, -2.3],
  ];
  tentOffsets.forEach(([tx, tz, rot], idx) => {
    const tMat = trackMat(
      new THREE.MeshStandardMaterial({ color: tentColors[idx % tentColors.length], roughness: 0.9, metalness: 0.0 })
    );
    const tent = new THREE.Mesh(tentGeo, tMat);
    tent.position.set(tx, 1.25, tz);
    tent.rotation.y = rot;
    tent.scale.set(1.05, 1, 1.55);
    tent.castShadow = true;
    campGroup.add(tent);
  });

  // Seating logs around campfire
  for (let l = 0; l < 3; l++) {
    const la = (l / 3) * Math.PI * 2 + 0.35;
    const log = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.32, 0.36, 3.2, 6)), timberMat);
    log.rotation.z = Math.PI / 2;
    log.rotation.y = la + Math.PI / 2;
    log.position.set(Math.cos(la) * 3.1, 0.32, Math.sin(la) * 3.1);
    campGroup.add(log);
  }

  // Campfire stone ring + animated flickering flames + warm night PointLight
  const firePitRing = new THREE.Mesh(
    trackGeo(new THREE.TorusGeometry(1.15, 0.24, 6, 12)),
    darkConcreteMat
  );
  firePitRing.rotation.x = Math.PI / 2;
  firePitRing.position.y = 0.22;
  campGroup.add(firePitRing);

  const campfireFlames: THREE.Mesh[] = [];
  const campFlameOuterMat = trackMat(new THREE.MeshBasicMaterial({ color: 0xff6b1a }));
  const campFlameInnerMat = trackMat(new THREE.MeshBasicMaterial({ color: 0xfde047 }));
  const cfOuter = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(0.82, 2.1, 6)), campFlameOuterMat);
  cfOuter.position.y = 1.05;
  campGroup.add(cfOuter);
  campfireFlames.push(cfOuter);

  const cfInner = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(0.45, 1.45, 5)), campFlameInnerMat);
  cfInner.position.y = 0.8;
  campGroup.add(cfInner);
  campfireFlames.push(cfInner);

  // Zero-cost additive warm campfire glow halo (replaces PointLight for max GPU FPS)
  const campfireGlowMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xff8a2b,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  const campfireGlow = new THREE.Mesh(
    trackGeo(new THREE.SphereGeometry(3.4, 10, 8)),
    campfireGlowMat
  );
  campfireGlow.position.set(0, 1.8, 0);
  campGroup.add(campfireGlow);
  root.add(campGroup);

  // === 6B-2. FARM & PLANTATION ZONE ("Fazenda Vale Verde", FAZ-1) ===
  const farmPad = helipads.find((h) => h.id === 'pad_farm_verde');
  if (farmPad) {
    const farmPadTex = trackTex(createHelipadTexture(maxAnisotropy, 'forest'));
    const farmPadMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: farmPadTex,
        roughness: 0.88,
        metalness: 0.0,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      })
    );
    const fmPlinth = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(22.4, 2.8, 22.4)), darkConcreteMat);
    fmPlinth.position.set(farmPad.x, farmPad.y - 1.9, farmPad.z);
    fmPlinth.receiveShadow = true;
    root.add(fmPlinth);

    const fmSlab = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(21, 0.85, 21)), farmPadMat);
    fmSlab.position.set(farmPad.x, farmPad.y - 0.42, farmPad.z);
    fmSlab.castShadow = true;
    fmSlab.receiveShadow = true;
    root.add(fmSlab);
    raycastTargets.push(fmSlab);
    addHelipadPerimeterLights(root, farmPad.x, farmPad.y + 0.28, farmPad.z, 9.8);
  }

  const farmGroup = new THREE.Group();
  farmGroup.position.set(FARM_REGION.x, FARM_REGION.groundY, FARM_REGION.z);

  const barnRedMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xa62626, roughness: 0.86, metalness: 0.0 })
  );
  const barnTrimMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xe6ecf2, roughness: 0.88, metalness: 0.0 })
  );
  const siloMetalMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xb0becb, roughness: 0.42, metalness: 0.55 })
  );

  // Classic Red Barn with Pitched Roof & White Trim
  const barnGroup = new THREE.Group();
  barnGroup.position.set(-38, 0, -51);
  const barnBody = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(26, 8.4, 20)), barnRedMat);
  barnBody.position.y = 4.2;
  barnBody.castShadow = true;
  barnBody.receiveShadow = true;
  barnGroup.add(barnBody);
  raycastTargets.push(barnBody);

  const barnRoof = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(14.5, 14.5, 27.6, 3)),
    darkConcreteMat
  );
  barnRoof.rotation.z = Math.PI / 2;
  barnRoof.scale.set(0.56, 1, 1.0);
  barnRoof.position.y = 10.6;
  barnRoof.castShadow = true;
  barnGroup.add(barnRoof);

  const barnDoor = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(8.5, 5.8, 0.4)), barnTrimMat);
  barnDoor.position.set(0, 2.9, 10.1);
  barnGroup.add(barnDoor);

  const barnWin = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(26.3, 1.5, 11.0)), chaletWindowMat);
  barnWin.position.y = 5.4;
  barnGroup.add(barnWin);
  farmGroup.add(barnGroup);

  // 3 Metallic Grain Silos beside the Red Barn
  for (let s = 0; s < 3; s++) {
    const sx = -15 + s * 10.5;
    const sz = -54;
    const siloCyl = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(4.2, 4.2, 14.5, 14)),
      siloMetalMat
    );
    siloCyl.position.set(sx, 7.25, sz);
    siloCyl.castShadow = true;
    siloCyl.receiveShadow = true;
    farmGroup.add(siloCyl);
    raycastTargets.push(siloCyl);

    const siloDome = new THREE.Mesh(
      trackGeo(new THREE.SphereGeometry(4.2, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5)),
      siloMetalMat
    );
    siloDome.position.set(sx, 14.5, sz);
    farmGroup.add(siloDome);
  }

  // Geometric Green & Golden Plantation Crop Rows (1 InstancedMesh draw call!)
  const cropRowGeo = trackGeo(new THREE.BoxGeometry(5.2, 1.15, 36));
  const cropRowMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.94, metalness: 0.0 })
  );
  const cropRows: Array<{ x: number; z: number; color: number; scaleY: number }> = [];
  const cropPalette = [0x4c8c30, 0x5c9e38, 0xc9a236, 0xd9b343, 0x3b7a2c, 0xb88f28];
  let plotIdx = 0;
  for (const plotZ of [-62, -16, 30, 74]) {
    const plotColor = cropPalette[plotIdx % cropPalette.length];
    const plotH = plotIdx % 2 === 0 ? 1.15 : 0.85;
    for (let cx = -4; cx <= 118; cx += 7.6) {
      cropRows.push({ x: cx, z: plotZ, color: plotColor, scaleY: plotH });
    }
    plotIdx++;
  }
  const cropInst = new THREE.InstancedMesh(cropRowGeo, cropRowMat, cropRows.length);
  cropInst.receiveShadow = true;
  const farmDummy = new THREE.Object3D();
  const farmCol = new THREE.Color();
  cropRows.forEach((cr, idx) => {
    farmDummy.position.set(cr.x, 0.55 * cr.scaleY, cr.z);
    farmDummy.rotation.set(0, 0, 0);
    farmDummy.scale.set(1, cr.scaleY, 1);
    farmDummy.updateMatrix();
    cropInst.setMatrixAt(idx, farmDummy.matrix);
    farmCol.setHex(cr.color);
    cropInst.setColorAt(idx, farmCol);
  });
  cropInst.instanceMatrix.needsUpdate = true;
  if (cropInst.instanceColor) cropInst.instanceColor.needsUpdate = true;
  cropInst.computeBoundingSphere();
  farmGroup.add(cropInst);

  // Wooden Perimeter Fence Rails around Farm Plots (1 InstancedMesh draw call!)
  const fenceSegs: Array<{ x: number; z: number; rotY: number }> = [];
  for (let fx = -64; fx <= 126; fx += 12) {
    fenceSegs.push({ x: fx, z: -96, rotY: 0 });
    fenceSegs.push({ x: fx, z: 98, rotY: 0 });
  }
  for (let fz = -90; fz <= 92; fz += 12) {
    fenceSegs.push({ x: 132, z: fz, rotY: Math.PI / 2 });
    if (Math.abs(fz + 10) > 28) {
      fenceSegs.push({ x: -70, z: fz, rotY: Math.PI / 2 });
    }
  }
  const fenceGeo = trackGeo(new THREE.BoxGeometry(11.6, 1.45, 0.35));
  const fenceInst = new THREE.InstancedMesh(fenceGeo, warmTimberMat, fenceSegs.length);
  fenceSegs.forEach((fs, idx) => {
    farmDummy.position.set(fs.x, 0.8, fs.z);
    farmDummy.rotation.set(0, fs.rotY, 0);
    farmDummy.scale.setScalar(1);
    farmDummy.updateMatrix();
    fenceInst.setMatrixAt(idx, farmDummy.matrix);
  });
  fenceInst.instanceMatrix.needsUpdate = true;
  fenceInst.computeBoundingSphere();
  farmGroup.add(fenceInst);
  root.add(farmGroup);

  // === 6C. SNOW MOUNTAIN RANGE & SKI RESORT (North Alpine Massif) ===
  const snowPadTex = trackTex(createHelipadTexture(maxAnisotropy, 'snow'));
  const snowPadMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: snowPadTex,
      roughness: 0.88,
      metalness: 0.0,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    })
  );

  for (const padId of ['pad_pine_peak', 'pad_ski_base']) {
    const pad = helipads.find((h) => h.id === padId);
    if (!pad) continue;
    const plinth = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(22, 3.4, 22)), darkConcreteMat);
    plinth.position.set(pad.x, pad.y - 2.2, pad.z);
    plinth.receiveShadow = true;
    root.add(plinth);

    const slab = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(21, 0.9, 21)), snowPadMat);
    slab.position.set(pad.x, pad.y - 0.45, pad.z);
    slab.castShadow = true;
    slab.receiveShadow = true;
    root.add(slab);
    raycastTargets.push(slab);
    addHelipadPerimeterLights(root, pad.x, pad.y + 0.28, pad.z, 9.6);
  }

  // Stylized A-Frame Alpine Ski Lodge + 6-Chalet Alpine Village around Ski Base
  const skiLodgeY = getTerrainHeight(SKI_BASE_POS.x, SKI_BASE_POS.z);
  const chaletGroup = new THREE.Group();
  chaletGroup.position.set(SKI_BASE_POS.x - 21, skiLodgeY, SKI_BASE_POS.z);

  const snowRoofMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xdce6f0, roughness: 0.9, metalness: 0.0 })
  );

  const chaletBase = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(15.5, 5.6, 17.5)), timberMat);
  chaletBase.position.y = 2.8;
  chaletBase.castShadow = true;
  chaletBase.receiveShadow = true;
  chaletGroup.add(chaletBase);
  raycastTargets.push(chaletBase);

  const chaletRoof = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(13.0, 6.8, 4)), snowRoofMat);
  chaletRoof.rotation.y = Math.PI / 4;
  chaletRoof.scale.set(1.05, 1, 1.18);
  chaletRoof.position.y = 8.6;
  chaletRoof.castShadow = true;
  chaletGroup.add(chaletRoof);

  const chaletWindows = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(15.8, 2.2, 10.4)),
    chaletWindowMat
  );
  chaletWindows.position.y = 3.1;
  chaletGroup.add(chaletWindows);

  const chimney = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.6, 5.2, 1.6)), darkConcreteMat);
  chimney.position.set(-4.2, 8.6, -3.5);
  chaletGroup.add(chimney);
  root.add(chaletGroup);

  // 12 Alpine Village Ski Chalets clustered around the Expanded Ski Base
  const alpineVillageOffsets: Array<{ dx: number; dz: number; rotY: number; scale: number }> = [
    { dx: -48, dz: -14, rotY: 0.25, scale: 0.98 },
    { dx: -44, dz: 18, rotY: -0.35, scale: 0.92 },
    { dx: -18, dz: 32, rotY: 0.12, scale: 0.95 },
    { dx: 26, dz: 20, rotY: -0.42, scale: 0.92 },
    { dx: 42, dz: -8, rotY: 0.48, scale: 0.88 },
    { dx: -62, dz: 8, rotY: 0.18, scale: 0.86 },
    { dx: -64, dz: -32, rotY: -0.22, scale: 0.9 },
    { dx: -32, dz: -40, rotY: 0.42, scale: 0.85 },
    { dx: 8, dz: 44, rotY: -0.15, scale: 0.94 },
    { dx: 48, dz: 26, rotY: 0.35, scale: 0.88 },
    { dx: 62, dz: -2, rotY: -0.28, scale: 0.9 },
    { dx: -42, dz: 44, rotY: 0.24, scale: 0.84 },
  ];
  const miniChaletBodyGeo = trackGeo(new THREE.BoxGeometry(9.6, 4.2, 11.2));
  const miniChaletRoofGeo = trackGeo(new THREE.ConeGeometry(8.2, 4.6, 4));
  const miniChaletWinGeo = trackGeo(new THREE.BoxGeometry(9.9, 1.5, 6.4));
  for (const ch of alpineVillageOffsets) {
    const cx = SKI_BASE_POS.x + ch.dx;
    const cz = SKI_BASE_POS.z + ch.dz;
    const cy = getTerrainHeight(cx, cz);
    const cg = new THREE.Group();
    cg.position.set(cx, cy - 0.3, cz);
    cg.rotation.y = ch.rotY;
    cg.scale.setScalar(ch.scale);

    const cb = new THREE.Mesh(miniChaletBodyGeo, warmTimberMat);
    cb.position.y = 2.1;
    cb.castShadow = true;
    cb.receiveShadow = true;
    cg.add(cb);

    const cr = new THREE.Mesh(miniChaletRoofGeo, snowRoofMat);
    cr.rotation.y = Math.PI / 4;
    cr.scale.set(1.05, 1, 1.15);
    cr.position.y = 6.2;
    cr.castShadow = true;
    cg.add(cr);

    const cw = new THREE.Mesh(miniChaletWinGeo, chaletWindowMat);
    cw.position.y = 2.4;
    cg.add(cw);
    root.add(cg);
  }

  // Demarcated Ski Slalom Runs (Instanced Red & Blue Slalom Marker Poles + Flags!)
  const skiFlagPoints: Array<{ x: number; y: number; z: number; isRed: boolean }> = [];
  for (const runSide of [-1, 1]) {
    const steps = 24;
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const baseX = THREE.MathUtils.lerp(SNOW_PEAK_POS.x, SKI_BASE_POS.x, t);
      const baseZ = THREE.MathUtils.lerp(SNOW_PEAK_POS.z, SKI_BASE_POS.z, t);
      const curveOffset = Math.sin(t * Math.PI) * 76 * runSide + Math.sin(t * Math.PI * 3) * 16;
      const fx = baseX + curveOffset;
      const fz = baseZ - runSide * 10;
      const fy = getTerrainHeight(fx, fz);
      if (fy < 26) continue;
      skiFlagPoints.push({ x: fx - 7, y: fy, z: fz, isRed: s % 2 === 0 });
      skiFlagPoints.push({ x: fx + 7, y: getTerrainHeight(fx + 7, fz), z: fz, isRed: s % 2 === 0 });
    }
  }
  if (skiFlagPoints.length > 0) {
    const flagPoleGeo = trackGeo(new THREE.CylinderGeometry(0.11, 0.14, 3.6, 5));
    flagPoleGeo.translate(0, 1.8, 0);
    const flagBannerGeo = trackGeo(new THREE.BoxGeometry(1.5, 0.95, 0.12));
    flagBannerGeo.translate(0.75, 3.1, 0);
    const flagPoleMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.65, metalness: 0.2 })
    );
    const flagBannerMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.72, metalness: 0.0 })
    );
    const flagPoleInst = new THREE.InstancedMesh(flagPoleGeo, flagPoleMat, skiFlagPoints.length);
    const flagBannerInst = new THREE.InstancedMesh(flagBannerGeo, flagBannerMat, skiFlagPoints.length);
    const fDummy = new THREE.Object3D();
    const fCol = new THREE.Color();
    skiFlagPoints.forEach((fp, idx) => {
      fDummy.position.set(fp.x, fp.y - 0.15, fp.z);
      fDummy.rotation.set(0, 0.25, 0);
      fDummy.scale.setScalar(1);
      fDummy.updateMatrix();
      flagPoleInst.setMatrixAt(idx, fDummy.matrix);
      flagBannerInst.setMatrixAt(idx, fDummy.matrix);
      fCol.setHex(fp.isRed ? 0xdc2626 : 0x2563eb);
      flagBannerInst.setColorAt(idx, fCol);
    });
    flagPoleInst.instanceMatrix.needsUpdate = true;
    flagBannerInst.instanceMatrix.needsUpdate = true;
    if (flagBannerInst.instanceColor) flagBannerInst.instanceColor.needsUpdate = true;
    flagPoleInst.computeBoundingSphere();
    flagBannerInst.computeBoundingSphere();
    root.add(flagPoleInst, flagBannerInst);
  }

  // Longer Alpine Ski Lift (Teleférico): 9 Steel Pylons + Dual Cables + 14 Animated Gondolas
  const liftStart = new THREE.Vector3(SKI_BASE_POS.x + 12, skiLodgeY + 6.5, SKI_BASE_POS.z - 12);
  const summitTerrainY = getTerrainHeight(SNOW_PEAK_POS.x, SNOW_PEAK_POS.z);
  const liftEnd = new THREE.Vector3(SNOW_PEAK_POS.x - 12, summitTerrainY + 6.2, SNOW_PEAK_POS.z + 12);

  const liftSteelMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.58, metalness: 0.55 })
  );
  const liftCableMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.65, metalness: 0.45 })
  );
  const gondolaRedMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xd93542, roughness: 0.55, metalness: 0.1 })
  );
  const gondolaYellowMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.55, metalness: 0.1 })
  );

  const liftDir = new THREE.Vector3().subVectors(liftEnd, liftStart);
  const liftYaw = Math.atan2(liftDir.x, liftDir.z);
  const liftRight = new THREE.Vector3(Math.cos(liftYaw), 0, -Math.sin(liftYaw));
  const liftTowerTops: THREE.Vector3[] = [];

  const pylonCount = 9;
  for (let i = 0; i < pylonCount; i++) {
    const frac = i / (pylonCount - 1);
    const px = THREE.MathUtils.lerp(liftStart.x, liftEnd.x, frac);
    const pz = THREE.MathUtils.lerp(liftStart.z, liftEnd.z, frac);
    const groundY = getTerrainHeight(px, pz);
    const towerH = 11.2;
    const topPos = new THREE.Vector3(px, groundY + towerH, pz);
    liftTowerTops.push(topPos);

    const pylonGroup = new THREE.Group();
    pylonGroup.position.set(px, groundY, pz);
    pylonGroup.rotation.y = liftYaw;

    const mast = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.45, 0.78, towerH, 6)),
      liftSteelMat
    );
    mast.position.y = towerH / 2;
    mast.castShadow = true;
    pylonGroup.add(mast);

    const crossArm = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(5.8, 0.55, 0.75)),
      liftSteelMat
    );
    crossArm.position.y = towerH - 0.25;
    pylonGroup.add(crossArm);

    for (const side of [-1, 1]) {
      const pulley = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(0.58, 0.58, 0.28, 8)),
        gondolaYellowMat
      );
      pulley.rotation.z = Math.PI / 2;
      pulley.position.set(side * 2.55, towerH - 0.1, 0);
      pylonGroup.add(pulley);
    }
    root.add(pylonGroup);
  }

  const cableUpAxis = new THREE.Vector3(0, 1, 0);
  const tmpSegA = new THREE.Vector3();
  const tmpSegB = new THREE.Vector3();
  const tmpSegMid = new THREE.Vector3();
  const tmpSegDir = new THREE.Vector3();

  for (let i = 0; i < liftTowerTops.length - 1; i++) {
    for (const side of [-1, 1]) {
      tmpSegA.copy(liftTowerTops[i]).addScaledVector(liftRight, side * 2.5);
      tmpSegB.copy(liftTowerTops[i + 1]).addScaledVector(liftRight, side * 2.5);
      const segLen = tmpSegA.distanceTo(tmpSegB);
      tmpSegMid.addVectors(tmpSegA, tmpSegB).multiplyScalar(0.5);
      tmpSegDir.subVectors(tmpSegB, tmpSegA).normalize();

      const cableMesh = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(0.09, 0.09, segLen, 5)),
        liftCableMat
      );
      cableMesh.position.copy(tmpSegMid);
      cableMesh.quaternion.setFromUnitVectors(cableUpAxis, tmpSegDir);
      root.add(cableMesh);
    }
  }

  const liftGondolas: Array<{ group: THREE.Group; phase: number; side: number }> = [];
  for (let i = 0; i < 14; i++) {
    const gGroup = new THREE.Group();
    const hanger = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.06, 0.06, 1.5, 5)),
      liftSteelMat
    );
    hanger.position.y = -0.75;
    gGroup.add(hanger);

    const cabin = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(1.5, 1.5, 1.9)),
      i % 2 === 0 ? gondolaRedMat : gondolaYellowMat
    );
    cabin.position.y = -2.1;
    cabin.castShadow = true;
    gGroup.add(cabin);

    gGroup.rotation.y = liftYaw;
    root.add(gGroup);
    liftGondolas.push({
      group: gGroup,
      phase: (i % 7) / 7,
      side: i < 7 ? 1 : -1,
    });
  }

  // Summit Radar & Antenna Station atop East Alpine Horn (RADAR_PEAK_POS)
  const radarPeakY = getTerrainHeight(RADAR_PEAK_POS.x, RADAR_PEAK_POS.z);
  const summitStation = new THREE.Group();
  summitStation.position.set(RADAR_PEAK_POS.x, radarPeakY - 0.5, RADAR_PEAK_POS.z);

  const radarBunker = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(13, 5.2, 11)), concreteMat);
  radarBunker.position.y = 2.6;
  radarBunker.castShadow = true;
  radarBunker.receiveShadow = true;
  summitStation.add(radarBunker);
  raycastTargets.push(radarBunker);

  const radomeMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xe6edf5, roughness: 0.85, metalness: 0.0, flatShading: true })
  );
  const radome = new THREE.Mesh(trackGeo(new THREE.IcosahedronGeometry(5.6, 1)), radomeMat);
  radome.position.set(-2.2, 8.8, 0);
  radome.castShadow = true;
  summitStation.add(radome);
  raycastTargets.push(radome);

  const summitMast = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.28, 0.72, 22, 6)), craneRedMat);
  summitMast.position.set(5.4, 13.5, -2.5);
  summitMast.castShadow = true;
  summitStation.add(summitMast);

  const summitBeacon = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.72, 8, 8)), skyRedBeaconMat);
  summitBeacon.position.set(5.4, 24.9, -2.5);
  summitStation.add(summitBeacon);

  const summitRadarDish = new THREE.Group();
  summitRadarDish.position.set(4.8, 6.2, 3.2);
  const sDishMast = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.28, 0.34, 2.2, 6)), darkConcreteMat);
  summitRadarDish.add(sDishMast);
  const sDishBar = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(6.4, 1.1, 0.65)), craneRedMat);
  sDishBar.position.y = 1.4;
  summitRadarDish.add(sDishBar);
  summitStation.add(summitRadarDish);
  root.add(summitStation);

  // === 6D. DESERT & CANYON BIOME ("Posto Cânion", DES-1 + Outpost Station + Solar Array) ===
  const desertPad = helipads.find((h) => h.id === 'pad_desert_canyon');
  if (desertPad) {
    const desertPadTex = trackTex(createHelipadTexture(maxAnisotropy, 'desert'));
    const desertPadMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: desertPadTex,
        roughness: 0.88,
        metalness: 0.0,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      })
    );
    const dPlinth = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(22.4, 3.2, 22.4)), sandstoneMat);
    dPlinth.position.set(desertPad.x, desertPad.y - 2.1, desertPad.z);
    dPlinth.receiveShadow = true;
    root.add(dPlinth);

    const dSlab = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(21, 0.9, 21)), desertPadMat);
    dSlab.position.set(desertPad.x, desertPad.y - 0.45, desertPad.z);
    dSlab.castShadow = true;
    dSlab.receiveShadow = true;
    root.add(dSlab);
    raycastTargets.push(dSlab);
    addHelipadPerimeterLights(root, desertPad.x, desertPad.y + 0.28, desertPad.z, 9.8);

    const desertGroundY = getTerrainHeight(DESERT_PAD_POS.x, DESERT_PAD_POS.z);
    const outpostGroup = new THREE.Group();
    outpostGroup.position.set(DESERT_PAD_POS.x + 22, desertGroundY, DESERT_PAD_POS.z - 2);

    const outpostWallMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0xd4b68c, roughness: 0.92, metalness: 0.0 })
    );
    const outpostMain = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(13.5, 4.8, 16)), outpostWallMat);
    outpostMain.position.y = 2.4;
    outpostMain.castShadow = true;
    outpostMain.receiveShadow = true;
    outpostGroup.add(outpostMain);
    raycastTargets.push(outpostMain);

    const outpostRoof = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(14.8, 0.8, 17.2)), sandstoneMat);
    outpostRoof.position.y = 5.1;
    outpostRoof.castShadow = true;
    outpostGroup.add(outpostRoof);

    const outpostWin = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(13.75, 1.6, 8.8)), chaletWindowMat);
    outpostWin.position.y = 2.8;
    outpostGroup.add(outpostWin);
    root.add(outpostGroup);

    // 2 Large Industrial Fuel Tanks next to Posto Cânion
    for (const tz of [12.5, 19.5]) {
      const tx = DESERT_PAD_POS.x + 23;
      const tPosZ = DESERT_PAD_POS.z + tz;
      const ty = getTerrainHeight(tx, tPosZ);
      const tank = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(2.35, 2.35, 9.2, 12)),
        fuelTankMat
      );
      tank.rotation.z = Math.PI / 2;
      tank.position.set(tx, ty + 2.5, tPosZ);
      tank.castShadow = true;
      tank.receiveShadow = true;
      root.add(tank);
    }

    // 3 Parabolic Satellite Dishes on the Desert Ridge
    const dishCoords = [
      { x: DESERT_PAD_POS.x + 19, z: DESERT_PAD_POS.z - 19, yaw: 0.4 },
      { x: DESERT_PAD_POS.x + 29, z: DESERT_PAD_POS.z - 22, yaw: -0.25 },
      { x: DESERT_PAD_POS.x + 10, z: DESERT_PAD_POS.z - 24, yaw: 0.8 },
    ];
    for (const dc of dishCoords) {
      const dy = getTerrainHeight(dc.x, dc.z);
      const dishG = new THREE.Group();
      dishG.position.set(dc.x, dy, dc.z);
      dishG.rotation.y = dc.yaw;
      const ped = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.45, 0.72, 3.6, 6)), darkConcreteMat);
      ped.position.y = 1.8;
      dishG.add(ped);
      const bowl = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(2.9, 0.65, 1.25, 12)), concreteMat);
      bowl.position.set(0, 4.1, 0);
      bowl.rotation.x = 0.68;
      bowl.castShadow = true;
      dishG.add(bowl);
      root.add(dishG);
    }

    // Expanded Solar Panel Array next to Desert Outpost (2 rows x 3 panels)
    const solarPanelMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0x1e3a5f, roughness: 0.35, metalness: 0.45 })
    );
    for (let row = 0; row < 2; row++) {
      for (let s = 0; s < 3; s++) {
        const spX = DESERT_PAD_POS.x - 19 - s * 5.2;
        const spZ = DESERT_PAD_POS.z - 12 - row * 5.4;
        const spY = getTerrainHeight(spX, spZ);
        const stand = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.18, 0.24, 2.2, 6)), darkConcreteMat);
        stand.position.set(spX, spY + 1.1, spZ);
        root.add(stand);

        const panel = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(4.0, 0.16, 2.6)), solarPanelMat);
        panel.position.set(spX, spY + 2.3, spZ);
        panel.rotation.x = 0.42;
        panel.castShadow = true;
        root.add(panel);
      }
    }
  }

  // Merged Terrain-hugging Desert Dirt Roads linking Airbase -> Posto Cânion -> Wind Farm (70 draw calls -> 1!)
  const dirtRoadMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xa16236,
      roughness: 0.96,
      metalness: 0.0,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    })
  );
  const dirtRoadGeos: THREE.BufferGeometry[] = [];
  const buildDirtRoad = (x1: number, z1: number, x2: number, z2: number, segs: number) => {
    const segLen = Math.hypot(x2 - x1, z2 - z1) / segs;
    const yaw = Math.atan2(x2 - x1, z2 - z1);
    for (let i = 0; i < segs; i++) {
      const t0 = i / segs;
      const t1 = (i + 1) / segs;
      const mx = THREE.MathUtils.lerp(x1, x2, (t0 + t1) * 0.5);
      const mz = THREE.MathUtils.lerp(z1, z2, (t0 + t1) * 0.5);
      const y0 = getTerrainHeight(THREE.MathUtils.lerp(x1, x2, t0), THREE.MathUtils.lerp(z1, z2, t0));
      const y1 = getTerrainHeight(THREE.MathUtils.lerp(x1, x2, t1), THREE.MathUtils.lerp(z1, z2, t1));
      const my = (y0 + y1) * 0.5 + 0.16;
      const pitch = Math.atan2(y1 - y0, segLen);
      pushTransformedGeo(
        dirtRoadGeos,
        new THREE.BoxGeometry(7.2, 0.25, segLen + 1.2),
        mx,
        my,
        mz,
        -pitch,
        yaw,
        0
      );
    }
  };
  buildDirtRoad(AIRBASE_CENTER.x + 12, AIRBASE_CENTER.z + 34, DESERT_PAD_POS.x - 16, DESERT_PAD_POS.z - 16, 22);
  buildDirtRoad(DESERT_PAD_POS.x + 18, DESERT_PAD_POS.z + 12, SOLAR_STATION_POS.x - 18, SOLAR_STATION_POS.z - 10, 16);
  buildDirtRoad(DESERT_PAD_POS.x - 16, DESERT_PAD_POS.z + 10, WIND_TURBINES[0].x + 14, WIND_TURBINES[0].z + 8, 16);
  buildDirtRoad(WIND_TURBINES[0].x + 14, WIND_TURBINES[0].z + 8, WIND_TURBINES[3].x + 12, WIND_TURBINES[3].z - 10, 16);
  const mergedDirtRoadGeo = mergeNormalizedGeos(dirtRoadGeos);
  if (mergedDirtRoadGeo) {
    const dirtRoadMesh = new THREE.Mesh(mergedDirtRoadGeo, dirtRoadMat);
    dirtRoadMesh.receiveShadow = true;
    dirtRoadMesh.castShadow = false;
    root.add(dirtRoadMesh);
  }

  // === 6D-2. LARGE DESERT SOLAR POWER STATION ("Estação Solar Deserto", DES-2) ===
  const solarPad = helipads.find((h) => h.id === 'pad_desert_solar');
  if (solarPad) {
    const solarPadTex = trackTex(createHelipadTexture(maxAnisotropy, 'desert'));
    const solarPadMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: solarPadTex,
        roughness: 0.88,
        metalness: 0.0,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      })
    );
    const sPlinth = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(22.4, 3.0, 22.4)), sandstoneMat);
    sPlinth.position.set(solarPad.x, solarPad.y - 2.0, solarPad.z);
    sPlinth.receiveShadow = true;
    root.add(sPlinth);

    const sSlab = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(21, 0.9, 21)), solarPadMat);
    sSlab.position.set(solarPad.x, solarPad.y - 0.45, solarPad.z);
    sSlab.castShadow = true;
    sSlab.receiveShadow = true;
    root.add(sSlab);
    raycastTargets.push(sSlab);
    addHelipadPerimeterLights(root, solarPad.x, solarPad.y + 0.28, solarPad.z, 9.8);
  }

  const solarGroup = new THREE.Group();
  solarGroup.position.set(SOLAR_STATION_POS.x, SOLAR_STATION_POS.y, SOLAR_STATION_POS.z);

  // Solar Station Control & Inverter Building
  const solarControl = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(18, 6.8, 22)), concreteMat);
  solarControl.position.set(38, 3.4, -2);
  solarControl.castShadow = true;
  solarControl.receiveShadow = true;
  solarGroup.add(solarControl);
  raycastTargets.push(solarControl);

  const solarControlWin = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(18.3, 2.0, 12.0)), chaletWindowMat);
  solarControlWin.position.set(38, 4.4, -2);
  solarGroup.add(solarControlWin);

  // 48 Instanced Reflective Tilted Solar Panels (1 draw call for stands + 1 for panels!)
  const solarGlassMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x163259, roughness: 0.16, metalness: 0.68 })
  );
  const sStandGeo = trackGeo(new THREE.CylinderGeometry(0.24, 0.34, 2.8, 6));
  sStandGeo.translate(0, 1.4, 0);
  const sPanelGeo = trackGeo(new THREE.BoxGeometry(8.2, 0.22, 4.8));
  const sPanelPositions: Array<{ x: number; z: number }> = [];
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 8; col++) {
      sPanelPositions.push({
        x: -54 + col * 10.6,
        z: -36 + row * 12.8,
      });
    }
  }
  const sStandInst = new THREE.InstancedMesh(sStandGeo, darkConcreteMat, sPanelPositions.length);
  const sPanelInst = new THREE.InstancedMesh(sPanelGeo, solarGlassMat, sPanelPositions.length);
  sPanelInst.castShadow = false;
  sPanelInst.receiveShadow = true;
  const sDummy = new THREE.Object3D();
  sPanelPositions.forEach((sp, idx) => {
    sDummy.position.set(sp.x, 0, sp.z);
    sDummy.rotation.set(0, 0, 0);
    sDummy.scale.setScalar(1);
    sDummy.updateMatrix();
    sStandInst.setMatrixAt(idx, sDummy.matrix);

    sDummy.position.set(sp.x, 2.9, sp.z);
    sDummy.rotation.set(0.38, 0, 0);
    sDummy.updateMatrix();
    sPanelInst.setMatrixAt(idx, sDummy.matrix);
  });
  sStandInst.instanceMatrix.needsUpdate = true;
  sPanelInst.instanceMatrix.needsUpdate = true;
  sStandInst.computeBoundingSphere();
  sPanelInst.computeBoundingSphere();
  solarGroup.add(sStandInst, sPanelInst);
  root.add(solarGroup);

  // Wind Farm ("Parque Eólico") — 5 Giant White Rotating Wind Turbines with Frustum Culling Spheres
  const turbineWhiteMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xe6edf5, roughness: 0.82, metalness: 0.04 })
  );
  const turbineTowerGeo = trackGeo(new THREE.CylinderGeometry(0.95, 1.95, 44, 10));
  const turbineNacelleGeo = trackGeo(new THREE.BoxGeometry(2.6, 2.4, 6.2));
  const turbineBladeGeo = trackGeo(new THREE.BoxGeometry(1.15, 18.5, 0.34));
  turbineBladeGeo.translate(0, 9.25, 0);

  const windTurbineRotors: Array<{ hub: THREE.Group; speedMult: number; sphere: THREE.Sphere }> = [];
  WIND_TURBINES.forEach((wt, idx) => {
    const wy = getTerrainHeight(wt.x, wt.z);
    const tg = new THREE.Group();
    tg.position.set(wt.x, wy - 0.5, wt.z);
    tg.rotation.y = 0.72 + (idx % 3) * 0.06;

    const tower = new THREE.Mesh(turbineTowerGeo, turbineWhiteMat);
    tower.position.y = 22;
    tower.castShadow = true;
    tower.receiveShadow = true;
    tg.add(tower);
    raycastTargets.push(tower);

    const nacelle = new THREE.Mesh(turbineNacelleGeo, turbineWhiteMat);
    nacelle.position.set(0, 44.6, 0.5);
    nacelle.castShadow = true;
    tg.add(nacelle);

    const tBeacon = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.52, 8, 8)), skyRedBeaconMat);
    tBeacon.position.set(0, 46.3, -1.6);
    tg.add(tBeacon);

    const hub = new THREE.Group();
    hub.position.set(0, 44.6, 3.8);
    const noseCone = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(1.1, 2.4, 8)), craneRedMat);
    noseCone.rotation.x = Math.PI / 2;
    noseCone.position.z = 0.8;
    hub.add(noseCone);

    for (let b = 0; b < 3; b++) {
      const bladeWrap = new THREE.Group();
      bladeWrap.rotation.z = (b / 3) * Math.PI * 2;
      const blade = new THREE.Mesh(turbineBladeGeo, turbineWhiteMat);
      blade.castShadow = true;
      bladeWrap.add(blade);
      hub.add(bladeWrap);
    }
    hub.rotation.z = idx * 1.15;
    tg.add(hub);
    windTurbineRotors.push({
      hub,
      speedMult: 0.92 + (idx % 3) * 0.12,
      sphere: new THREE.Sphere(new THREE.Vector3(wt.x, wy + 34, wt.z), 52),
    });
    root.add(tg);
  });

  // === 6E. COSTA DO SOL BEACH (South-East ONLY: Helipad SOL-1 + Wooden Pier + Beach Umbrellas) ===
  const beachPad = helipads.find((h) => h.id === 'pad_beach_sol');
  if (beachPad) {
    const beachPadTex = trackTex(createHelipadTexture(maxAnisotropy, 'beach'));
    const beachPadMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: beachPadTex,
        roughness: 0.88,
        metalness: 0.0,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      })
    );
    const bDeck = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(23, 1.4, 23)), warmTimberMat);
    bDeck.position.set(beachPad.x, beachPad.y - 0.9, beachPad.z);
    bDeck.receiveShadow = true;
    root.add(bDeck);

    const bSlab = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(21, 0.6, 21)), beachPadMat);
    bSlab.position.set(beachPad.x, beachPad.y - 0.3, beachPad.z);
    bSlab.castShadow = true;
    bSlab.receiveShadow = true;
    root.add(bSlab);
    raycastTargets.push(bSlab);
    addHelipadPerimeterLights(root, beachPad.x, beachPad.y + 0.28, beachPad.z, 9.8);
  }

  // Two Wooden Marina Piers + 10 Moored Bobbing Boats advancing into Costa do Sol Bay
  const pavilionRoofMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xc99f62, roughness: 0.92, metalness: 0.0 })
  );
  const boatHullColors = [0xf8fafc, 0x0284c7, 0xd93542, 0xf59e0b, 0x10b981];
  const marinaBoatHullGeo = trackGeo(new THREE.BoxGeometry(3.2, 1.25, 7.6));
  const marinaBoatCabGeo = trackGeo(new THREE.BoxGeometry(2.3, 1.2, 3.0));

  BEACH_PIERS.forEach((pierSpec, pierIdx) => {
    const pierGroup = new THREE.Group();
    const pierDx = pierSpec.x2 - pierSpec.x1;
    const pierDz = pierSpec.z2 - pierSpec.z1;
    const pierLen = Math.hypot(pierDx, pierDz);
    const pierMidX = (pierSpec.x1 + pierSpec.x2) * 0.5;
    const pierMidZ = (pierSpec.z1 + pierSpec.z2) * 0.5;
    const pierYaw = Math.atan2(pierDx, pierDz);

    pierGroup.position.set(pierMidX, pierSpec.deckY, pierMidZ);
    pierGroup.rotation.y = pierYaw;

    const pierDeck = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(8.8, 0.65, pierLen)), warmTimberMat);
    pierDeck.castShadow = true;
    pierDeck.receiveShadow = true;
    pierGroup.add(pierDeck);
    raycastTargets.push(pierDeck);

    // Side Marina Finger Docks
    for (const dockZ of [-pierLen * 0.14, pierLen * 0.14]) {
      for (const side of [-1, 1]) {
        const finger = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(14.0, 0.45, 2.6)), warmTimberMat);
        finger.position.set(side * 10.8, -0.55, dockZ);
        finger.castShadow = true;
        pierGroup.add(finger);
      }
    }

    // Wider wooden plaza & shaded beach pavilion at the ocean tip of the pier
    const pierTipDeck = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(16.5, 0.72, 15.0)), warmTimberMat);
    pierTipDeck.position.set(0, 0.04, pierLen * 0.5);
    pierTipDeck.castShadow = true;
    pierTipDeck.receiveShadow = true;
    pierGroup.add(pierTipDeck);
    raycastTargets.push(pierTipDeck);

    for (const px of [-5.2, 5.2]) {
      for (const pz of [-4.2, 4.2]) {
        const post = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.22, 0.26, 4.4, 6)), timberMat);
        post.position.set(px, 2.4, pierLen * 0.5 + pz);
        post.castShadow = true;
        pierGroup.add(post);
      }
    }
    const pavRoof = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(9.4, 3.2, 4)), pavilionRoofMat);
    pavRoof.rotation.y = Math.PI / 4;
    pavRoof.position.set(0, 6.1, pierLen * 0.5);
    pavRoof.castShadow = true;
    pierGroup.add(pavRoof);

    // Merged submerged wooden pilings & pier side lantern posts (50 draw calls -> 2 per pier!)
    const pierTimberGeos: THREE.BufferGeometry[] = [];
    const pierBulbGeos: THREE.BufferGeometry[] = [];
    const pilingSteps = 12;
    for (let i = 0; i <= pilingSteps; i++) {
      const lz = -pierLen * 0.46 + (i / pilingSteps) * (pierLen * 0.94);
      for (const side of [-3.7, 3.7]) {
        pushTransformedGeo(pierTimberGeos, new THREE.CylinderGeometry(0.32, 0.36, 11, 6), side, -5.2, lz);
      }
      if (i % 2 === 1) {
        for (const side of [-4.0, 4.0]) {
          pushTransformedGeo(pierTimberGeos, new THREE.CylinderGeometry(0.1, 0.12, 2.4, 5), side, 1.4, lz);
          pushTransformedGeo(pierBulbGeos, new THREE.SphereGeometry(0.28, 6, 6), side, 2.65, lz);
        }
      }
    }
    const mergedPierTimber = mergeNormalizedGeos(pierTimberGeos);
    if (mergedPierTimber) pierGroup.add(new THREE.Mesh(mergedPierTimber, timberMat));
    const mergedPierBulbs = mergeNormalizedGeos(pierBulbGeos);
    if (mergedPierBulbs) pierGroup.add(new THREE.Mesh(mergedPierBulbs, lampBulbMat));

    // 5 Moored Marina Boats bobbing gently beside each pier's finger docks
    const boatOffsets: Array<[number, number, number]> = [
      [-11.8, -pierLen * 0.14 + 4.4, 0.08],
      [11.8, -pierLen * 0.14 + 4.4, -0.06],
      [-11.8, pierLen * 0.14 + 4.4, 0.05],
      [11.8, pierLen * 0.14 + 4.4, -0.09],
      [12.8, pierLen * 0.14 - 4.4, 0.04],
    ];
    boatOffsets.forEach(([bx, bz, rot], idx) => {
      const bg = new THREE.Group();
      const hullMat = trackMat(
        new THREE.MeshStandardMaterial({
          color: boatHullColors[(idx + pierIdx * 2) % boatHullColors.length],
          roughness: 0.72,
          metalness: 0.05,
        })
      );
      const hull = new THREE.Mesh(marinaBoatHullGeo, hullMat);
      hull.position.y = 0.45;
      hull.castShadow = true;
      bg.add(hull);
      const cab = new THREE.Mesh(marinaBoatCabGeo, concreteMat);
      cab.position.set(0, 1.45, -0.6);
      bg.add(cab);
      bg.position.set(bx, OCEAN_LEVEL - pierSpec.deckY + 0.15, bz);
      bg.rotation.y = rot + Math.PI * 0.5;
      pierGroup.add(bg);
      bobbingVessels.push({
        group: bg,
        baseY: OCEAN_LEVEL - pierSpec.deckY + 0.15,
        phase: idx * 1.35 + pierIdx * 2.1,
        amp: 0.2,
      });
    });
    root.add(pierGroup);
  });

  // Two Coastal Resort Hotels + Turquoise Swimming Pools along Costa do Sol
  const resortWallMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xe7dfd1, roughness: 0.88, metalness: 0.0 })
  );
  const resortRoofMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xc2633a, roughness: 0.86, metalness: 0.0 })
  );
  const poolWaterMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x16b8cf, roughness: 0.14, metalness: 0.18 })
  );

  for (const resSpec of RESORT_HOTELS) {
    const resortY = getTerrainHeight(resSpec.x, resSpec.z);
    const resortGroup = new THREE.Group();
    resortGroup.position.set(resSpec.x, resortY - 0.3, resSpec.z);
    resortGroup.rotation.y = resSpec.rotY;

    const resortMain = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(38, 14.2, 16.5)), resortWallMat);
    resortMain.position.set(0, 7.1, -6);
    resortMain.castShadow = true;
    resortMain.receiveShadow = true;
    resortGroup.add(resortMain);
    raycastTargets.push(resortMain);

    const resortUpper = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(26, 5.6, 12.5)), resortWallMat);
    resortUpper.position.set(0, 16.8, -6);
    resortUpper.castShadow = true;
    resortGroup.add(resortUpper);

    const resortRoof = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(27.4, 0.95, 13.8)), resortRoofMat);
    resortRoof.position.set(0, 20.0, -6);
    resortGroup.add(resortRoof);

    const resortWin = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(34, 10.2, 16.8)), chaletWindowMat);
    resortWin.position.set(0, 7.4, -6);
    resortGroup.add(resortWin);

    const sunDeck = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(40, 0.6, 19)), concreteMat);
    sunDeck.position.set(0, 0.4, 11.5);
    sunDeck.receiveShadow = true;
    resortGroup.add(sunDeck);

    const poolWater = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(24, 0.5, 11.2)), poolWaterMat);
    poolWater.position.set(0, 0.62, 12.0);
    resortGroup.add(poolWater);
    root.add(resortGroup);
  }

  // 10 Beachfront Thatched Kiosks along 2x Costa do Sol
  const kioskAngles = [0.72, 0.80, 0.87, 0.96, 1.04, 1.12, 1.21, 1.29, 1.36, 1.42];
  for (const kang of kioskAngles) {
    const kr = getIslandCoastRadius(kang) - 64;
    const kx = Math.cos(kang) * kr;
    const kz = Math.sin(kang) * kr;
    if (Math.hypot(kx - BEACH_PAD_POS.x, kz - BEACH_PAD_POS.z) < 30) continue;
    let nearResort = false;
    for (const res of RESORT_HOTELS) {
      if (Math.hypot(kx - res.x, kz - res.z) < 42) nearResort = true;
    }
    if (nearResort) continue;
    const ky = getTerrainHeight(kx, kz);
    if (ky < 0.8) continue;
    const kg = new THREE.Group();
    kg.position.set(kx, ky, kz);
    const counter = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(2.1, 2.2, 1.35, 8)), warmTimberMat);
    counter.position.y = 0.68;
    kg.add(counter);
    const roof = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(3.8, 2.1, 8)), pavilionRoofMat);
    roof.position.y = 3.5;
    roof.castShadow = true;
    kg.add(roof);
    for (let p = 0; p < 4; p++) {
      const pa = (p / 4) * Math.PI * 2;
      const post = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.11, 0.13, 2.8, 5)), timberMat);
      post.position.set(Math.cos(pa) * 1.9, 1.4, Math.sin(pa) * 1.9);
      kg.add(post);
    }
    root.add(kg);
  }

  // Instanced Colorful Beach Umbrellas (~72 instances along 2x Costa do Sol shoreline ONLY)
  const umbrellaPalette = [0xd93b3b, 0x0ea5e9, 0xeab308, 0xf97316, 0x10b981, 0xec4899];
  const umbrellaPoints: Array<{ x: number; y: number; z: number; color: number }> = [];
  for (let i = 0; i < 76; i++) {
    const ang = 0.70 + (i / 75) * (1.42 - 0.70);
    const r = getIslandCoastRadius(ang) - 28 - (i % 4) * 16;
    const ux = Math.cos(ang) * r;
    const uz = Math.sin(ang) * r;
    if (Math.hypot(ux - BEACH_PAD_POS.x, uz - BEACH_PAD_POS.z) < 28) continue;
    let nearPier = false;
    for (const bp of BEACH_PIERS) {
      if (Math.hypot(ux - bp.x1, uz - bp.z1) < 22) nearPier = true;
    }
    if (nearPier) continue;
    const uy = getTerrainHeight(ux, uz);
    if (uy < 0.7 || uy > 5.8) continue;
    umbrellaPoints.push({ x: ux, y: uy, z: uz, color: umbrellaPalette[i % umbrellaPalette.length] });
  }
  if (umbrellaPoints.length > 0) {
    const uPoleGeo = trackGeo(new THREE.CylinderGeometry(0.09, 0.09, 2.8, 5));
    uPoleGeo.translate(0, 1.4, 0);
    const uCanopyGeo = trackGeo(new THREE.ConeGeometry(2.35, 0.95, 8));
    uCanopyGeo.translate(0, 2.85, 0);
    const uCanopyMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88, metalness: 0.0 })
    );
    const uPoleInst = new THREE.InstancedMesh(uPoleGeo, concreteMat, umbrellaPoints.length);
    const uCanopyInst = new THREE.InstancedMesh(uCanopyGeo, uCanopyMat, umbrellaPoints.length);
    uCanopyInst.castShadow = false;
    const uDummy = new THREE.Object3D();
    const uCol = new THREE.Color();
    umbrellaPoints.forEach((up, idx) => {
      uDummy.position.set(up.x, up.y, up.z);
      uDummy.rotation.set(0, idx * 0.9, 0);
      uDummy.scale.setScalar(1);
      uDummy.updateMatrix();
      uPoleInst.setMatrixAt(idx, uDummy.matrix);
      uCanopyInst.setMatrixAt(idx, uDummy.matrix);
      uCol.setHex(up.color);
      uCanopyInst.setColorAt(idx, uCol);
    });
    uPoleInst.instanceMatrix.needsUpdate = true;
    uCanopyInst.instanceMatrix.needsUpdate = true;
    if (uCanopyInst.instanceColor) uCanopyInst.instanceColor.needsUpdate = true;
    uPoleInst.computeBoundingSphere();
    uCanopyInst.computeBoundingSphere();
    root.add(uPoleInst, uCanopyInst);
    if (uCanopyInst.boundingSphere) {
      spatialLOD.addDetailLayer(uPoleInst, uCanopyInst.boundingSphere.clone(), 540, 450);
      spatialLOD.addDetailLayer(uCanopyInst, uCanopyInst.boundingSphere.clone(), 540, 450);
    }
  }

  // Classic Red-and-White Striped Coastal Lighthouse on Rocky Headland East of Costa do Sol
  const lhY = getTerrainHeight(LIGHTHOUSE_POS.x, LIGHTHOUSE_POS.z);
  const lighthouseGroup = new THREE.Group();
  lighthouseGroup.position.set(LIGHTHOUSE_POS.x, lhY - 0.5, LIGHTHOUSE_POS.z);

  const lhWhiteMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xebeef2, roughness: 0.86, metalness: 0.0 })
  );
  const lhRedMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xc82b2b, roughness: 0.84, metalness: 0.0 })
  );
  const lhLampMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xfff8d6,
      emissive: 0xffe48a,
      emissiveIntensity: 0.8,
      roughness: 0.15,
    })
  );

  // 5 alternating red & white tapered cylindrical tiers (total height ~25m)
  const lhTierH = 4.6;
  for (let tier = 0; tier < 5; tier++) {
    const rBot = 4.2 - tier * 0.42;
    const rTop = 4.2 - (tier + 1) * 0.42;
    const seg = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(rTop, rBot, lhTierH, 12)),
      tier % 2 === 0 ? lhWhiteMat : lhRedMat
    );
    seg.position.y = tier * lhTierH + lhTierH * 0.5;
    seg.castShadow = true;
    seg.receiveShadow = true;
    lighthouseGroup.add(seg);
    if (tier === 0) raycastTargets.push(seg);
  }

  // Keeper's cottage attached beside lighthouse base
  const keeperBody = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(8.5, 4.0, 6.8)), lhWhiteMat);
  keeperBody.position.set(7.2, 2.0, 0);
  keeperBody.castShadow = true;
  lighthouseGroup.add(keeperBody);
  const keeperRoof = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(6.6, 2.4, 4)), lhRedMat);
  keeperRoof.rotation.y = Math.PI / 4;
  keeperRoof.position.set(7.2, 5.2, 0);
  lighthouseGroup.add(keeperRoof);
  const keeperWin = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(4.4, 1.4, 7.0)), chaletWindowMat);
  keeperWin.position.set(7.2, 2.2, 0);
  lighthouseGroup.add(keeperWin);

  // Gallery deck, lantern glass dome, cap & rotating dual volumetric light beam
  const lhGallery = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(3.2, 3.0, 0.8, 12)), darkConcreteMat);
  lhGallery.position.y = 23.2;
  lighthouseGroup.add(lhGallery);

  const lhLantern = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(1.9, 1.9, 3.2, 12)), lhLampMat);
  lhLantern.position.y = 25.1;
  lighthouseGroup.add(lhLantern);

  const lhCap = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(2.6, 2.2, 12)), lhRedMat);
  lhCap.position.y = 27.8;
  lighthouseGroup.add(lhCap);

  const lighthouseBeamMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xfff2b2,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    })
  );
  const lighthouseBeamGroup = new THREE.Group();
  lighthouseBeamGroup.position.set(0, 25.2, 0);
  const lhBeamGeo = trackGeo(new THREE.ConeGeometry(16, 190, 14, 1, true));
  lhBeamGeo.translate(0, -95, 0);
  lhBeamGeo.rotateX(Math.PI / 2);

  const beamFwd = new THREE.Mesh(lhBeamGeo, lighthouseBeamMat);
  beamFwd.position.z = 1.8;
  lighthouseBeamGroup.add(beamFwd);

  const beamBack = new THREE.Mesh(lhBeamGeo, lighthouseBeamMat);
  beamBack.rotation.y = Math.PI;
  beamBack.position.z = -1.8;
  lighthouseBeamGroup.add(beamBack);

  lighthouseGroup.add(lighthouseBeamGroup);
  root.add(lighthouseGroup);

  // === 6F. THREE FAR OFFSHORE OIL RIGS (Alpha, Bravo & Charlie Spread Around the Ocean) ===
  const rigSteelMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.65, metalness: 0.5 })
  );
  const rigRustOrangeMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xcc5520, roughness: 0.65, metalness: 0.28 })
  );
  const rigYellowMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xe5b818, roughness: 0.52, metalness: 0.2 })
  );
  const rigRedBeaconMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xff2a2a,
      emissive: 0xff1e1e,
      emissiveIntensity: 1.5,
      roughness: 0.2,
    })
  );
  const rigFlareMat = trackMat(new THREE.MeshBasicMaterial({ color: 0xff8c1a }));
  const rigFlareCoreMat = trackMat(new THREE.MeshBasicMaterial({ color: 0xfff08a }));
  const rigFlareHaloMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xff7b1a,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  const rigBeaconGlowMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xff5226,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );

  const oilPadTex = trackTex(createHelipadTexture(maxAnisotropy, 'oilrig'));
  const oilPadMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: oilPadTex,
      roughness: 0.88,
      metalness: 0.0,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    })
  );

  const rigLegFoamRings: Array<{ mesh: THREE.Mesh; rigIdx: number }> = [];
  const rigSpheres: THREE.Sphere[] = OIL_RIGS.map(
    (rig) => new THREE.Sphere(new THREE.Vector3(rig.x, rig.deckY + 12, rig.z), 74)
  );
  const rigFlares: Array<{
    flame: THREE.Mesh;
    core: THREE.Mesh;
    halo: THREE.Mesh;
    phase: number;
    rigIdx: number;
  }> = [];

  // Shared Oil Rig geometries reused across Alpha, Bravo & Charlie
  const rigLegFoamGeo = trackGeo(new THREE.RingGeometry(2.1, 4.35, 18));
  rigLegFoamGeo.rotateX(-Math.PI / 2);
  const rigLegGeo = trackGeo(new THREE.CylinderGeometry(1.75, 2.25, 31, 8));
  const rigBraceLongGeo = trackGeo(new THREE.BoxGeometry(33, 1.1, 1.1));
  const rigBraceSideGeo = trackGeo(new THREE.BoxGeometry(1.1, 1.1, 25));
  const rigDeckGeo = trackGeo(new THREE.BoxGeometry(40, 2.4, 32));
  const rigDeckStripeGeo = trackGeo(new THREE.BoxGeometry(40.6, 0.55, 32.6));
  const rigQuartersGeo = trackGeo(new THREE.BoxGeometry(14, 9.6, 11));
  const rigQuartersWinGeo = trackGeo(new THREE.BoxGeometry(14.3, 4.2, 7.6));
  const rigSiloGeo = trackGeo(new THREE.CylinderGeometry(2.4, 2.4, 7.4, 10));
  const rigCraneBaseGeo = trackGeo(new THREE.BoxGeometry(3.2, 4.2, 3.2));
  const rigCraneBoomGeo = trackGeo(new THREE.BoxGeometry(1.1, 1.1, 16));
  const rigDerrickColGeo = trackGeo(new THREE.CylinderGeometry(0.28, 0.48, 30, 6));
  const rigDerrickCrownGeo = trackGeo(new THREE.BoxGeometry(3.6, 1.4, 3.6));
  const rigBeaconLgGeo = trackGeo(new THREE.SphereGeometry(0.85, 8, 8));
  const rigBeaconSmGeo = trackGeo(new THREE.SphereGeometry(0.62, 8, 8));
  const rigFlareBoomGeo = trackGeo(new THREE.CylinderGeometry(0.32, 0.5, 22, 6));
  const rigFlareFlameGeo = trackGeo(new THREE.ConeGeometry(2.5, 8.2, 8));
  const rigFlareCoreGeo = trackGeo(new THREE.ConeGeometry(1.2, 5.0, 7));
  const rigFlareHaloGeo = trackGeo(new THREE.SphereGeometry(8.8, 12, 10));
  const rigPadSlabGeo = trackGeo(new THREE.BoxGeometry(23, 0.85, 23));
  const rigPadStrutGeo = trackGeo(new THREE.CylinderGeometry(0.45, 0.55, 6.2, 6));
  const rigDerrickHaloGeo = trackGeo(new THREE.SphereGeometry(3.4, 10, 8));
  const osvHullGeo = trackGeo(new THREE.BoxGeometry(10.5, 3.2, 28));
  const osvDeckGeo = trackGeo(new THREE.BoxGeometry(9.6, 0.5, 17));
  const osvBridgeGeo = trackGeo(new THREE.BoxGeometry(8.6, 6.4, 8.2));
  const osvWinGeo = trackGeo(new THREE.BoxGeometry(8.9, 1.8, 5.8));
  const osvCraneGeo = trackGeo(new THREE.BoxGeometry(0.9, 0.9, 9.5));
  const osvBeaconGeo = trackGeo(new THREE.SphereGeometry(0.55, 8, 8));

  OIL_RIGS.forEach((rig, rigIdx) => {
    const rigGroup = new THREE.Group();
    rigGroup.position.set(rig.x, 0, rig.z);

    for (const lx of [-15.5, 15.5]) {
      for (const lz of [-12, 12]) {
        const leg = new THREE.Mesh(rigLegGeo, rigRustOrangeMat);
        leg.position.set(lx, 3.2, lz);
        leg.castShadow = true;
        leg.receiveShadow = true;
        rigGroup.add(leg);

        const legFoam = new THREE.Mesh(rigLegFoamGeo, shorelineFoamMat);
        legFoam.position.set(lx, OCEAN_LEVEL + 0.24, lz);
        rigGroup.add(legFoam);
        rigLegFoamRings.push({ mesh: legFoam, rigIdx });
      }
    }

    for (const braceY of [4.2, 11.5]) {
      const braceLongA = new THREE.Mesh(rigBraceLongGeo, rigSteelMat);
      braceLongA.position.set(0, braceY, -12);
      rigGroup.add(braceLongA);
      const braceLongB = new THREE.Mesh(rigBraceLongGeo, rigSteelMat);
      braceLongB.position.set(0, braceY, 12);
      rigGroup.add(braceLongB);
      const braceSideA = new THREE.Mesh(rigBraceSideGeo, rigSteelMat);
      braceSideA.position.set(-15.5, braceY, 0);
      rigGroup.add(braceSideA);
      const braceSideB = new THREE.Mesh(rigBraceSideGeo, rigSteelMat);
      braceSideB.position.set(15.5, braceY, 0);
      rigGroup.add(braceSideB);
    }

    const rigDeck = new THREE.Mesh(rigDeckGeo, rigSteelMat);
    rigDeck.position.set(0, rig.deckY - 1.0, 0);
    rigDeck.castShadow = true;
    rigDeck.receiveShadow = true;
    rigGroup.add(rigDeck);
    raycastTargets.push(rigDeck);

    const deckStripe = new THREE.Mesh(rigDeckStripeGeo, rigYellowMat);
    deckStripe.position.set(0, rig.deckY + 0.15, 0);
    rigGroup.add(deckStripe);

    const quarters = new THREE.Mesh(rigQuartersGeo, rigRustOrangeMat);
    quarters.position.set(-9, rig.deckY + 5.0, -7.5);
    quarters.castShadow = true;
    quarters.receiveShadow = true;
    rigGroup.add(quarters);
    raycastTargets.push(quarters);

    const quartersWindows = new THREE.Mesh(rigQuartersWinGeo, chaletWindowMat);
    quartersWindows.position.set(-9, rig.deckY + 6.4, -7.5);
    rigGroup.add(quartersWindows);

    for (const sz of [3.5, 9.2]) {
      const silo = new THREE.Mesh(rigSiloGeo, concreteMat);
      silo.position.set(13.5, rig.deckY + 3.9, sz);
      silo.castShadow = true;
      rigGroup.add(silo);
    }

    const craneBase = new THREE.Mesh(rigCraneBaseGeo, rigYellowMat);
    craneBase.position.set(14.5, rig.deckY + 2.3, -11.5);
    rigGroup.add(craneBase);
    const craneBoom = new THREE.Mesh(rigCraneBoomGeo, rigYellowMat);
    craneBoom.position.set(14.5, rig.deckY + 7.2, -16.8);
    craneBoom.rotation.x = -0.42;
    rigGroup.add(craneBoom);

    const derrickGroup = new THREE.Group();
    derrickGroup.position.set(7, rig.deckY + 0.2, -5);
    for (const dx of [-3.4, 3.4]) {
      for (const dz of [-3.4, 3.4]) {
        const col = new THREE.Mesh(rigDerrickColGeo, rigSteelMat);
        col.position.set(dx * 0.72, 15, dz * 0.72);
        col.rotation.z = dx > 0 ? 0.08 : -0.08;
        col.rotation.x = dz > 0 ? -0.08 : 0.08;
        col.castShadow = true;
        derrickGroup.add(col);
      }
    }
    for (let tier = 1; tier <= 4; tier++) {
      const span = 6.6 - tier * 0.9;
      const collar = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(span, 0.55, span)), rigYellowMat);
      collar.position.y = tier * 6.4;
      derrickGroup.add(collar);
    }
    const derrickCrown = new THREE.Mesh(rigDerrickCrownGeo, rigRustOrangeMat);
    derrickCrown.position.y = 30.2;
    derrickGroup.add(derrickCrown);
    raycastTargets.push(derrickCrown);

    const derrickBeacon = new THREE.Mesh(rigBeaconLgGeo, rigRedBeaconMat);
    derrickBeacon.position.y = 32.0;
    derrickGroup.add(derrickBeacon);
    rigGroup.add(derrickGroup);

    for (const [bx, by, bz] of [
      [-15.6, rig.deckY + 10.6, -12.6],
      [-2.4, rig.deckY + 10.6, -12.6],
      [19.2, rig.deckY + 2.2, 15.2],
    ]) {
      const warnLight = new THREE.Mesh(rigBeaconSmGeo, rigRedBeaconMat);
      warnLight.position.set(bx, by, bz);
      rigGroup.add(warnLight);
    }

    const flareBoom = new THREE.Mesh(rigFlareBoomGeo, rigSteelMat);
    flareBoom.position.set(24, rig.deckY + 7.5, -13);
    flareBoom.rotation.z = -0.78;
    rigGroup.add(flareBoom);

    const flame = new THREE.Mesh(rigFlareFlameGeo, rigFlareMat);
    flame.position.set(32.0, rig.deckY + 17.5, -13);
    rigGroup.add(flame);

    const core = new THREE.Mesh(rigFlareCoreGeo, rigFlareCoreMat);
    core.position.set(32.0, rig.deckY + 16.0, -13);
    rigGroup.add(core);

    const halo = new THREE.Mesh(rigFlareHaloGeo, rigFlareHaloMat);
    halo.position.set(32.0, rig.deckY + 18.2, -13);
    rigGroup.add(halo);

    // Zero-cost additive halo replaces real Oil Rig PointLight for consistent 60 FPS across the entire map
    rigFlares.push({ flame, core, halo, phase: rigIdx * 2.1, rigIdx });

    const padLocalX = rig.padX - rig.x;
    const padLocalZ = rig.padZ - rig.z;

    const oilPadSlab = new THREE.Mesh(rigPadSlabGeo, oilPadMat);
    oilPadSlab.position.set(padLocalX, rig.padY - 0.42, padLocalZ);
    oilPadSlab.castShadow = true;
    oilPadSlab.receiveShadow = true;
    rigGroup.add(oilPadSlab);
    raycastTargets.push(oilPadSlab);

    for (const sx of [-7, 7]) {
      const padStrut = new THREE.Mesh(rigPadStrutGeo, rigYellowMat);
      padStrut.position.set(padLocalX + sx * 0.45, rig.padY - 2.6, padLocalZ - 4.2);
      padStrut.rotation.x = 0.55;
      rigGroup.add(padStrut);
    }
    addHelipadPerimeterLights(rigGroup, padLocalX, rig.padY + 0.3, padLocalZ, 10.6);

    const derrickGlowHalo = new THREE.Mesh(rigDerrickHaloGeo, rigBeaconGlowMat);
    derrickGlowHalo.position.set(7, rig.deckY + 32.2, -5);
    rigGroup.add(derrickGlowHalo);

    // Moored Offshore Support Vessel (OSV) bobbing beside each Oil Rig
    const osvGroup = new THREE.Group();
    osvGroup.position.set(-54, OCEAN_LEVEL, 36);
    osvGroup.rotation.y = 0.65 + rigIdx * 0.45;

    const osvHull = new THREE.Mesh(osvHullGeo, rigRustOrangeMat);
    osvHull.position.y = 1.1;
    osvHull.castShadow = true;
    osvGroup.add(osvHull);

    const osvDeck = new THREE.Mesh(osvDeckGeo, darkConcreteMat);
    osvDeck.position.set(0, 2.8, -4.5);
    osvGroup.add(osvDeck);

    const osvBridge = new THREE.Mesh(osvBridgeGeo, shipBridgeMat);
    osvBridge.position.set(0, 5.8, 7.6);
    osvBridge.castShadow = true;
    osvGroup.add(osvBridge);

    const osvWin = new THREE.Mesh(osvWinGeo, chaletWindowMat);
    osvWin.position.set(0, 7.2, 7.6);
    osvGroup.add(osvWin);

    const osvCrane = new THREE.Mesh(osvCraneGeo, rigYellowMat);
    osvCrane.position.set(3.2, 5.6, -4.0);
    osvCrane.rotation.x = 0.32;
    osvGroup.add(osvCrane);

    const osvBeacon = new THREE.Mesh(osvBeaconGeo, rigRedBeaconMat);
    osvBeacon.position.set(0, 9.6, 7.6);
    osvGroup.add(osvBeacon);

    rigGroup.add(osvGroup);
    bobbingVessels.push({ group: osvGroup, baseY: OCEAN_LEVEL, phase: 2.3 + rigIdx * 1.4, amp: 0.34 });
    root.add(rigGroup);
  });

  // === 7. INSTANCED BIOME VEGETATION & ROCKS (60 FPS: Pines + Broadleaf + GIANT TREES + Palms + Cacti + Rocks) ===
  const rand = mulberry32(2026);
  const dummy = new THREE.Object3D();
  const instColor = new THREE.Color();

  const isClearOfStructures = (tx: number, tz: number): boolean => {
    if (getLakeDistanceFactor(tx, tz) < 1.15) return false;
    const riverS = getRiverSample(tx, tz);
    if (riverS.dist < riverS.width * 0.95) return false;
    if (getFarmWeight(tx, tz) > 0.08) return false;
    if (Math.hypot(tx - DAM_X, tz - DAM_Z) < 52) return false;
    if (Math.hypot(tx - DAM_PAD_X, tz - DAM_PAD_Z) < 34) return false;
    if (Math.hypot(tx - AIRBASE_CENTER.x, tz - AIRBASE_CENTER.z) < 92) return false;
    if (Math.hypot(tx - SNOW_PEAK_POS.x, tz - SNOW_PEAK_POS.z) < 34) return false;
    if (Math.hypot(tx - SKI_BASE_POS.x, tz - SKI_BASE_POS.z) < 88) return false;
    if (Math.hypot(tx - RADAR_PEAK_POS.x, tz - RADAR_PEAK_POS.z) < 32) return false;
    if (Math.hypot(tx - FOREST_PAD_POS.x, tz - FOREST_PAD_POS.z) < 42) return false;
    if (Math.hypot(tx - (FOREST_PAD_POS.x + 21), tz - (FOREST_PAD_POS.z - 4)) < 22) return false;
    if (Math.hypot(tx - (FOREST_PAD_POS.x - 19), tz - (FOREST_PAD_POS.z - 17)) < 18) return false;
    if (Math.hypot(tx - FOREST_CAMP_POS.x, tz - FOREST_CAMP_POS.z) < 28) return false;
    for (const oc of FOREST_OUTPOST_CABINS) {
      if (Math.hypot(tx - oc.x, tz - oc.z) < 24) return false;
    }
    if (Math.hypot(tx - DESERT_PAD_POS.x, tz - DESERT_PAD_POS.z) < 48) return false;
    if (Math.hypot(tx - SOLAR_STATION_POS.x, tz - SOLAR_STATION_POS.z) < 98) return false;
    if (Math.hypot(tx - SOLAR_PAD_POS.x, tz - SOLAR_PAD_POS.z) < 32) return false;
    for (const wt of WIND_TURBINES) {
      if (Math.hypot(tx - wt.x, tz - wt.z) < 24) return false;
    }
    if (Math.hypot(tx - BEACH_PAD_POS.x, tz - BEACH_PAD_POS.z) < 34) return false;
    for (const res of RESORT_HOTELS) {
      if (Math.hypot(tx - res.x, tz - res.z) < 44) return false;
    }
    if (Math.hypot(tx - LIGHTHOUSE_POS.x, tz - LIGHTHOUSE_POS.z) < 28) return false;
    if (
      tx > URBAN_BOUNDS.minX - 28 &&
      tx < URBAN_BOUNDS.maxX + 24 &&
      tz > URBAN_BOUNDS.minZ - 24 &&
      tz < URBAN_BOUNDS.maxZ + 24
    ) {
      return false;
    }
    if (tx > -1060 && tx < -770 && tz > -340 && tz < 330) return false;
    return true;
  };

  // --- 7A. INSTANCED PINE / SPRUCE TREES (Park + 2x Dense Forest + 12-Peak Snow Mountain Range) ---
  const treePositions: Array<{
    x: number;
    y: number;
    z: number;
    scale: number;
    biome: 'park' | 'forest' | 'snow';
  }> = [];

  // Grand Park Trees (West side around ornamental pond, avoiding Stadium & Pond water)
  for (let i = 0; i < 110; i++) {
    const tx = PARK_RECT.minX + 6 + rand() * (parkW * 0.48 - 12);
    const tz = PARK_RECT.minZ + 6 + rand() * (parkD - 12);
    const pondNorm = Math.hypot(
      (tx - PARK_POND_POS.x) / (PARK_POND_POS.rx + 5.0),
      (tz - PARK_POND_POS.z) / (PARK_POND_POS.rz + 5.0)
    );
    if (pondNorm < 1.0) continue;
    if (Math.abs(tz - parkCz) < 6.0) continue;
    const ty = getTerrainHeight(tx, tz);
    treePositions.push({ x: tx, y: ty, z: tz, scale: 0.88 + rand() * 0.42, biome: 'park' });
  }

  // Dense 2x Eastern Forest (~1,050 lush dark-green pine/spruce trees across hills & river valleys)
  for (let i = 0; i < 2100 && treePositions.length < 1120; i++) {
    const ang = rand() * Math.PI * 2;
    const rr = Math.sqrt(rand());
    const tx = FOREST_REGION.x + Math.cos(ang) * FOREST_REGION.rx * rr * 1.15;
    const tz = FOREST_REGION.z + Math.sin(ang) * FOREST_REGION.rz * rr * 1.15;
    const dist = Math.hypot(tx, tz);
    const polar = Math.atan2(tz, tx);
    if (dist > getIslandCoastRadius(polar) - 48) continue;
    if (getBeachSectorWeight(polar) > 0.32 && dist > getIslandCoastRadius(polar) - 390) continue;
    if (getDesertWeight(tx, tz) > 0.32) continue;
    if (!isClearOfStructures(tx, tz)) continue;

    const ty = getTerrainHeight(tx, tz);
    if (ty < 4.0) continue;
    const isSnow = getSnowWeight(tx, tz) > 0.35 && ty > 24;
    treePositions.push({
      x: tx,
      y: ty,
      z: tz,
      scale: 0.96 + rand() * 0.72,
      biome: isSnow ? 'snow' : 'forest',
    });
  }

  // General green hillside transition trees across the 2x island
  for (let i = 0; i < 420; i++) {
    const theta = rand() * Math.PI * 2;
    const coastR = getIslandCoastRadius(theta);
    const r = 420 + Math.sqrt(rand()) * Math.max(120, coastR - 480);
    const tx = Math.cos(theta) * r;
    const tz = Math.sin(theta) * r;
    if (getDesertWeight(tx, tz) > 0.24) continue;
    if (getBeachSectorWeight(theta) > 0.28 && r > coastR - 410) continue;
    if (!isClearOfStructures(tx, tz)) continue;

    const ty = getTerrainHeight(tx, tz);
    if (ty < 4.0) continue;
    const isSnow = getSnowWeight(tx, tz) > 0.32 && ty > 22;
    treePositions.push({
      x: tx,
      y: ty,
      z: tz,
      scale: 0.92 + rand() * 0.58,
      biome: isSnow ? 'snow' : 'forest',
    });
  }

  // Snowy Alpine Pines across all 12 Peaks of the 2x North Snow Mountain Range
  for (let i = 0; i < 540; i++) {
    const peak = SNOW_PEAKS[i % SNOW_PEAKS.length];
    const ang = rand() * Math.PI * 2;
    const rr = 28 + rand() * (peak.r * 1.25);
    const tx = peak.x + Math.cos(ang) * rr;
    const tz = peak.z + Math.sin(ang) * rr;
    const dist = Math.hypot(tx, tz);
    const polar = Math.atan2(tz, tx);
    if (dist > getIslandCoastRadius(polar) - 48) continue;
    if (!isClearOfStructures(tx, tz)) continue;

    const ty = getTerrainHeight(tx, tz);
    if (ty < 18 || ty > 106) continue;
    treePositions.push({
      x: tx,
      y: ty,
      z: tz,
      scale: 0.96 + rand() * 0.62,
      biome: 'snow',
    });
  }

  // --- 7A-2. COLLECT BROADLEAF DECIDUOUS TREES (~560 Mixed Canopy in 2x Dense Forest) ---
  const broadleafPositions: Array<{ x: number; y: number; z: number; scale: number; color: number }> = [];
  const broadleafPalette = [0x2e7d32, 0x3b8c3b, 0x4b943a, 0x266b30, 0x558f38];
  for (let i = 0; i < 1100 && broadleafPositions.length < 560; i++) {
    const ang = rand() * Math.PI * 2;
    const rr = Math.sqrt(rand());
    const bx = FOREST_REGION.x + Math.cos(ang) * FOREST_REGION.rx * rr * 1.08;
    const bz = FOREST_REGION.z + Math.sin(ang) * FOREST_REGION.rz * rr * 1.08;
    const dist = Math.hypot(bx, bz);
    const polar = Math.atan2(bz, bx);
    if (dist > getIslandCoastRadius(polar) - 50) continue;
    if (getBeachSectorWeight(polar) > 0.3 && dist > getIslandCoastRadius(polar) - 390) continue;
    if (getDesertWeight(bx, bz) > 0.25 || getSnowWeight(bx, bz) > 0.32) continue;
    if (!isClearOfStructures(bx, bz)) continue;
    const by = getTerrainHeight(bx, bz);
    if (by < 4.5 || by > 52) continue;
    broadleafPositions.push({
      x: bx,
      y: by,
      z: bz,
      scale: 0.96 + rand() * 0.68,
      color: broadleafPalette[broadleafPositions.length % broadleafPalette.length],
    });
  }

  // --- 7A-3. COLLECT GIANT / MASSIVE FOREST TREES (Redwood Sequoias + Wide-Canopy Ancient Giants!) ---
  const giantRedwoodPositions: Array<{ x: number; y: number; z: number; scaleXZ: number; scaleY: number; color: number }> = [];
  const giantCanopyPositions: Array<{ x: number; y: number; z: number; scaleXZ: number; scaleY: number; color: number }> = [];
  const redwoodPalette = [0x143f26, 0x1b4f2e, 0x1e5c34, 0x123820];
  const giantBroadPalette = [0x246b2c, 0x2f7a32, 0x3c8434, 0x1f5e2a];

  for (let i = 0; i < 620 && (giantRedwoodPositions.length < 165 || giantCanopyPositions.length < 115); i++) {
    const ang = rand() * Math.PI * 2;
    const rr = Math.sqrt(rand());
    const gx = FOREST_REGION.x + Math.cos(ang) * FOREST_REGION.rx * rr * 1.04;
    const gz = FOREST_REGION.z + Math.sin(ang) * FOREST_REGION.rz * rr * 1.04;
    const dist = Math.hypot(gx, gz);
    const polar = Math.atan2(gz, gx);
    if (dist > getIslandCoastRadius(polar) - 65) continue;
    if (getBeachSectorWeight(polar) > 0.25 && dist > getIslandCoastRadius(polar) - 420) continue;
    if (getDesertWeight(gx, gz) > 0.18 || getSnowWeight(gx, gz) > 0.25) continue;
    if (!isClearOfStructures(gx, gz)) continue;
    const gy = getTerrainHeight(gx, gz);
    if (gy < 6.0 || gy > 58) continue;

    if (i % 5 !== 0 && giantRedwoodPositions.length < 165) {
      giantRedwoodPositions.push({
        x: gx,
        y: gy,
        z: gz,
        scaleXZ: 1.75 + rand() * 0.95,
        scaleY: 2.1 + rand() * 1.25,
        color: redwoodPalette[giantRedwoodPositions.length % redwoodPalette.length],
      });
    } else if (giantCanopyPositions.length < 115) {
      giantCanopyPositions.push({
        x: gx,
        y: gy,
        z: gz,
        scaleXZ: 1.95 + rand() * 1.05,
        scaleY: 1.75 + rand() * 0.9,
        color: giantBroadPalette[giantCanopyPositions.length % giantBroadPalette.length],
      });
    }
  }

  // --- 7B. COLLECT LOW-POLY COCONUT PALMS (ONLY on 2x Costa do Sol South-East Beach) ---
  const palmPositions: Array<{ x: number; y: number; z: number; scale: number; yaw: number }> = [];
  for (let i = 0; i < 320 && palmPositions.length < 195; i++) {
    const ang = 0.69 + rand() * (1.44 - 0.69);
    const coastR = getIslandCoastRadius(ang);
    const rr = coastR - 26 - rand() * 320;
    const px = Math.cos(ang) * rr;
    const pz = Math.sin(ang) * rr;
    if (Math.hypot(px - BEACH_PAD_POS.x, pz - BEACH_PAD_POS.z) < 28) continue;
    let blocked = false;
    for (const bp of BEACH_PIERS) {
      if (Math.hypot(px - bp.x1, pz - bp.z1) < 22) blocked = true;
    }
    for (const res of RESORT_HOTELS) {
      if (Math.hypot(px - res.x, pz - res.z) < 42) blocked = true;
    }
    if (blocked) continue;
    if (Math.hypot(px - LIGHTHOUSE_POS.x, pz - LIGHTHOUSE_POS.z) < 26) continue;
    const py = getTerrainHeight(px, pz);
    if (py < 0.75 || py > 6.8) continue;
    palmPositions.push({ x: px, y: py, z: pz, scale: 0.88 + rand() * 0.52, yaw: rand() * Math.PI * 2 });
  }

  // --- 7C. COLLECT LOW-POLY SAGUARO CACTI (2x Desert) ---
  const cactusPositions: Array<{ x: number; y: number; z: number; scale: number; yaw: number }> = [];
  for (let i = 0; i < 920 && cactusPositions.length < 460; i++) {
    const ang = rand() * Math.PI * 2;
    const rr = Math.sqrt(rand());
    const cx = DESERT_REGION.x + Math.cos(ang) * DESERT_REGION.rx * rr;
    const cz = DESERT_REGION.z + Math.sin(ang) * DESERT_REGION.rz * rr;
    const dist = Math.hypot(cx, cz);
    const polar = Math.atan2(cz, cx);
    if (dist > getIslandCoastRadius(polar) - 48) continue;
    if (getDesertWeight(cx, cz) < 0.4) continue;
    if (!isClearOfStructures(cx, cz)) continue;

    let onSteepWall = false;
    for (const m of DESERT_MESAS) {
      const md = Math.hypot((cx - m.x) / m.rx, (cz - m.z) / m.rz);
      if (md > 0.65 && md < 1.38) {
        onSteepWall = true;
        break;
      }
    }
    if (onSteepWall) continue;

    const cy = getTerrainHeight(cx, cz);
    if (cy < 4.0) continue;
    cactusPositions.push({ x: cx, y: cy, z: cz, scale: 0.8 + rand() * 0.6, yaw: rand() * Math.PI * 2 });
  }

  // --- 7D. 240m SPATIAL-CHUNKED FULL-3D VEGETATION (InstancedMesh always visible to fog horizon; pure Frustum Culling) ---
  const trunkGeo = trackGeo(new THREE.CylinderGeometry(0.32, 0.55, 3.4, 6));
  trunkGeo.translate(0, 1.7, 0);
  const lowerCrownGeo = trackGeo(new THREE.ConeGeometry(2.7, 5.6, 7));
  lowerCrownGeo.translate(0, 5.2, 0);
  const upperCrownGeo = trackGeo(new THREE.ConeGeometry(1.85, 4.4, 7));
  upperCrownGeo.translate(0, 8.1, 0);

  const blTrunkGeo = trackGeo(new THREE.CylinderGeometry(0.36, 0.58, 3.8, 6));
  blTrunkGeo.translate(0, 1.9, 0);
  const blCrownGeo = trackGeo(new THREE.DodecahedronGeometry(3.2, 0));
  blCrownGeo.translate(0, 6.2, 0);

  const rwTrunkGeo = trackGeo(new THREE.CylinderGeometry(0.65, 1.25, 10.5, 7));
  rwTrunkGeo.translate(0, 5.25, 0);
  const rwLowerGeo = trackGeo(new THREE.ConeGeometry(4.4, 7.6, 8));
  rwLowerGeo.translate(0, 9.6, 0);
  const rwMidGeo = trackGeo(new THREE.ConeGeometry(3.4, 6.8, 8));
  rwMidGeo.translate(0, 13.8, 0);
  const rwTopGeo = trackGeo(new THREE.ConeGeometry(2.2, 5.4, 7));
  rwTopGeo.translate(0, 17.6, 0);

  const gcTrunkGeo = trackGeo(new THREE.CylinderGeometry(0.75, 1.35, 7.6, 7));
  gcTrunkGeo.translate(0, 3.8, 0);
  const gcCrownGeo = trackGeo(new THREE.DodecahedronGeometry(4.8, 1));
  gcCrownGeo.translate(0, 9.6, 0);

  const palmTrunkGeo = trackGeo(new THREE.CylinderGeometry(0.24, 0.44, 8.2, 6));
  palmTrunkGeo.translate(0, 4.1, 0);
  palmTrunkGeo.rotateZ(0.14);
  const palmFrondGeo = trackGeo(new THREE.BoxGeometry(0.95, 0.18, 4.2));
  palmFrondGeo.translate(0, 0, 2.0);

  const cTrunkGeo = trackGeo(new THREE.CylinderGeometry(0.45, 0.52, 5.2, 6));
  cTrunkGeo.translate(0, 2.6, 0);
  const cArmLGeo = trackGeo(new THREE.CylinderGeometry(0.32, 0.36, 2.2, 6));
  cArmLGeo.translate(-0.95, 3.3, 0);
  const cArmRGeo = trackGeo(new THREE.CylinderGeometry(0.32, 0.36, 1.9, 6));
  cArmRGeo.translate(0.95, 2.6, 0);
  const cJointGeo = trackGeo(new THREE.BoxGeometry(2.1, 0.52, 0.52));
  cJointGeo.translate(0, 2.25, 0);

  // Shared PBR foliage materials
  const trunkMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x5c3a1d, roughness: 0.95, metalness: 0.0 })
  );
  const rwTrunkMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x6b3a24, roughness: 0.94, metalness: 0.0 })
  );
  const foliageMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.92,
      metalness: 0.0,
      flatShading: true,
    })
  );
  const palmTrunkMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x855a36, roughness: 0.94, metalness: 0.0 })
  );
  const palmFrondMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x3b8c3e,
      roughness: 0.9,
      metalness: 0.0,
      flatShading: true,
    })
  );
  const cactusMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.92,
      metalness: 0.0,
      flatShading: true,
    })
  );

  const treePalettePark = [0x2f823d, 0x3b9444, 0x246f45, 0x45963e];
  const treePaletteForest = [0x1a4d2c, 0x205c33, 0x154225, 0x296938];
  const treePaletteSnowPine = [0x1a423b, 0x1e4c44, 0x153730, 0x23544b];
  const cactusPalette = [0x367538, 0x41823e, 0x2f6934, 0x4b8742];

  interface VegCell {
    pines: Array<{ x: number; y: number; z: number; scale: number; yaw: number; lowerColor: number; upperColor: number }>;
    broadleaf: Array<{ x: number; y: number; z: number; scale: number; yaw: number; color: number }>;
    redwoods: Array<{ x: number; y: number; z: number; scaleXZ: number; scaleY: number; yaw: number; color: number }>;
    giantCanopy: Array<{ x: number; y: number; z: number; scaleXZ: number; scaleY: number; yaw: number; color: number }>;
    palms: Array<{ x: number; y: number; z: number; scale: number; yaw: number }>;
    cacti: Array<{ x: number; y: number; z: number; scale: number; yaw: number; color: number }>;
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
  }

  const VEG_CHUNK_SIZE = 240;
  const vegCells = new Map<string, VegCell>();
  const getVegCell = (x: number, y: number, z: number, heightPad: number): VegCell => {
    const key = `${Math.floor(x / VEG_CHUNK_SIZE)}_${Math.floor(z / VEG_CHUNK_SIZE)}`;
    let cell = vegCells.get(key);
    if (!cell) {
      cell = {
        pines: [],
        broadleaf: [],
        redwoods: [],
        giantCanopy: [],
        palms: [],
        cacti: [],
        minX: x,
        maxX: x,
        minY: y,
        maxY: y + heightPad,
        minZ: z,
        maxZ: z,
      };
      vegCells.set(key, cell);
    } else {
      if (x < cell.minX) cell.minX = x;
      if (x > cell.maxX) cell.maxX = x;
      if (y < cell.minY) cell.minY = y;
      if (y + heightPad > cell.maxY) cell.maxY = y + heightPad;
      if (z < cell.minZ) cell.minZ = z;
      if (z > cell.maxZ) cell.maxZ = z;
    }
    return cell;
  };

  treePositions.forEach((t, idx) => {
    const yaw = rand() * Math.PI * 2;
    let lowerColor: number;
    let upperColor: number;
    if (t.biome === 'snow') {
      lowerColor = treePaletteSnowPine[idx % treePaletteSnowPine.length];
      upperColor = idx % 3 === 0 ? 0xcfdbe8 : 0xdce6f0;
    } else {
      const palette = t.biome === 'park' ? treePalettePark : treePaletteForest;
      lowerColor = palette[idx % palette.length];
      instColor.setHex(lowerColor).offsetHSL(0, 0.02, 0.035);
      upperColor = instColor.getHex();
    }
    getVegCell(t.x, t.y, t.z, 12 * t.scale).pines.push({
      x: t.x,
      y: t.y,
      z: t.z,
      scale: t.scale,
      yaw,
      lowerColor,
      upperColor,
    });
  });

  broadleafPositions.forEach((b) => {
    getVegCell(b.x, b.y, b.z, 10 * b.scale).broadleaf.push({
      x: b.x,
      y: b.y,
      z: b.z,
      scale: b.scale,
      yaw: rand() * Math.PI * 2,
      color: b.color,
    });
  });

  giantRedwoodPositions.forEach((g) => {
    getVegCell(g.x, g.y, g.z, 22 * g.scaleY).redwoods.push({
      x: g.x,
      y: g.y,
      z: g.z,
      scaleXZ: g.scaleXZ,
      scaleY: g.scaleY,
      yaw: rand() * Math.PI * 2,
      color: g.color,
    });
  });

  giantCanopyPositions.forEach((g) => {
    getVegCell(g.x, g.y, g.z, 16 * g.scaleY).giantCanopy.push({
      x: g.x,
      y: g.y,
      z: g.z,
      scaleXZ: g.scaleXZ,
      scaleY: g.scaleY,
      yaw: rand() * Math.PI * 2,
      color: g.color,
    });
  });

  palmPositions.forEach((p) => {
    getVegCell(p.x, p.y, p.z, 11 * p.scale).palms.push(p);
  });

  cactusPositions.forEach((c, idx) => {
    getVegCell(c.x, c.y, c.z, 6 * c.scale).cacti.push({
      x: c.x,
      y: c.y,
      z: c.z,
      scale: c.scale,
      yaw: c.yaw,
      color: cactusPalette[idx % cactusPalette.length],
    });
  });

  const frondDummy = new THREE.Object3D();
  const vegRootGroup = new THREE.Group();
  vegRootGroup.name = 'SpatialVegetationChunks';

  vegCells.forEach((cell) => {
    const chunkGroup = new THREE.Group();

    const cx = (cell.minX + cell.maxX) * 0.5;
    const cy = (cell.minY + cell.maxY) * 0.5;
    const cz = (cell.minZ + cell.maxZ) * 0.5;
    const radius =
      Math.hypot(
        (cell.maxX - cell.minX) * 0.5,
        (cell.maxY - cell.minY) * 0.5,
        (cell.maxZ - cell.minZ) * 0.5
      ) + 14;
    const cellSphere = new THREE.Sphere(new THREE.Vector3(cx, cy, cz), radius);

    // 1. Pines (Forest, Park & Alpine Snow Pines)
    if (cell.pines.length > 0) {
      const n = cell.pines.length;
      const tInst = new THREE.InstancedMesh(trunkGeo, trunkMat, n);
      const lInst = new THREE.InstancedMesh(lowerCrownGeo, foliageMat, n);
      const uInst = new THREE.InstancedMesh(upperCrownGeo, foliageMat, n);
      lInst.receiveShadow = true;

      for (let i = 0; i < n; i++) {
        const t = cell.pines[i];
        dummy.position.set(t.x, t.y - 0.25, t.z);
        dummy.rotation.set(0, t.yaw, 0);
        dummy.scale.setScalar(t.scale);
        dummy.updateMatrix();
        tInst.setMatrixAt(i, dummy.matrix);
        lInst.setMatrixAt(i, dummy.matrix);
        uInst.setMatrixAt(i, dummy.matrix);

        instColor.setHex(t.lowerColor);
        lInst.setColorAt(i, instColor);
        instColor.setHex(t.upperColor);
        uInst.setColorAt(i, instColor);
      }

      for (const im of [tInst, lInst, uInst]) {
        im.castShadow = false;
        im.instanceMatrix.needsUpdate = true;
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
        im.boundingSphere = cellSphere.clone();
        im.frustumCulled = true;
      }
      chunkGroup.add(tInst, lInst, uInst);
    }

    // 2. Broadleaf Trees
    if (cell.broadleaf.length > 0) {
      const n = cell.broadleaf.length;
      const tInst = new THREE.InstancedMesh(blTrunkGeo, trunkMat, n);
      const cInst = new THREE.InstancedMesh(blCrownGeo, foliageMat, n);
      cInst.receiveShadow = true;

      for (let i = 0; i < n; i++) {
        const b = cell.broadleaf[i];
        dummy.position.set(b.x, b.y - 0.25, b.z);
        dummy.rotation.set(0, b.yaw, 0);
        dummy.scale.set(b.scale * 1.08, b.scale * 0.96, b.scale * 1.08);
        dummy.updateMatrix();
        tInst.setMatrixAt(i, dummy.matrix);
        cInst.setMatrixAt(i, dummy.matrix);
        instColor.setHex(b.color);
        cInst.setColorAt(i, instColor);
      }

      for (const im of [tInst, cInst]) {
        im.castShadow = false;
        im.instanceMatrix.needsUpdate = true;
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
        im.boundingSphere = cellSphere.clone();
        im.frustumCulled = true;
      }
      chunkGroup.add(tInst, cInst);
    }

    // 3. Giant Redwood Sequoias
    if (cell.redwoods.length > 0) {
      const n = cell.redwoods.length;
      const tInst = new THREE.InstancedMesh(rwTrunkGeo, rwTrunkMat, n);
      const lInst = new THREE.InstancedMesh(rwLowerGeo, foliageMat, n);
      const mInst = new THREE.InstancedMesh(rwMidGeo, foliageMat, n);
      const topInst = new THREE.InstancedMesh(rwTopGeo, foliageMat, n);

      for (let i = 0; i < n; i++) {
        const g = cell.redwoods[i];
        dummy.position.set(g.x, g.y - 0.5, g.z);
        dummy.rotation.set(0, g.yaw, 0);
        dummy.scale.set(g.scaleXZ, g.scaleY, g.scaleXZ);
        dummy.updateMatrix();
        tInst.setMatrixAt(i, dummy.matrix);
        lInst.setMatrixAt(i, dummy.matrix);
        mInst.setMatrixAt(i, dummy.matrix);
        topInst.setMatrixAt(i, dummy.matrix);

        instColor.setHex(g.color);
        lInst.setColorAt(i, instColor);
        instColor.offsetHSL(0, 0.02, 0.025);
        mInst.setColorAt(i, instColor);
        instColor.offsetHSL(0, 0.02, 0.03);
        topInst.setColorAt(i, instColor);
      }

      for (const im of [tInst, lInst, mInst, topInst]) {
        im.castShadow = false;
        im.instanceMatrix.needsUpdate = true;
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
        im.boundingSphere = cellSphere.clone();
        im.frustumCulled = true;
      }
      chunkGroup.add(tInst, lInst, mInst, topInst);
    }

    // 4. Giant Wide-Canopy Trees
    if (cell.giantCanopy.length > 0) {
      const n = cell.giantCanopy.length;
      const tInst = new THREE.InstancedMesh(gcTrunkGeo, trunkMat, n);
      const cInst = new THREE.InstancedMesh(gcCrownGeo, foliageMat, n);
      cInst.receiveShadow = true;

      for (let i = 0; i < n; i++) {
        const g = cell.giantCanopy[i];
        dummy.position.set(g.x, g.y - 0.5, g.z);
        dummy.rotation.set(0, g.yaw, 0);
        dummy.scale.set(g.scaleXZ, g.scaleY, g.scaleXZ);
        dummy.updateMatrix();
        tInst.setMatrixAt(i, dummy.matrix);
        cInst.setMatrixAt(i, dummy.matrix);
        instColor.setHex(g.color);
        cInst.setColorAt(i, instColor);
      }

      for (const im of [tInst, cInst]) {
        im.castShadow = false;
        im.instanceMatrix.needsUpdate = true;
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
        im.boundingSphere = cellSphere.clone();
        im.frustumCulled = true;
      }
      chunkGroup.add(tInst, cInst);
    }

    // 5. Coconut Palms (Costa do Sol)
    if (cell.palms.length > 0) {
      const n = cell.palms.length;
      const tInst = new THREE.InstancedMesh(palmTrunkGeo, palmTrunkMat, n);
      const fInst = new THREE.InstancedMesh(palmFrondGeo, palmFrondMat, n * 5);

      for (let i = 0; i < n; i++) {
        const p = cell.palms[i];
        dummy.position.set(p.x, p.y - 0.15, p.z);
        dummy.rotation.set(0, p.yaw, 0);
        dummy.scale.setScalar(p.scale);
        dummy.updateMatrix();
        tInst.setMatrixAt(i, dummy.matrix);

        const topX = p.x - Math.sin(0.14) * 8.1 * p.scale * Math.cos(p.yaw);
        const topY = p.y - 0.15 + Math.cos(0.14) * 8.1 * p.scale;
        const topZ = p.z + Math.sin(0.14) * 8.1 * p.scale * Math.sin(p.yaw);
        for (let f = 0; f < 5; f++) {
          const fAng = p.yaw + (f / 5) * Math.PI * 2;
          frondDummy.position.set(topX, topY, topZ);
          frondDummy.rotation.set(0.32, fAng, 0);
          frondDummy.scale.setScalar(p.scale);
          frondDummy.updateMatrix();
          fInst.setMatrixAt(i * 5 + f, frondDummy.matrix);
        }
      }

      for (const im of [tInst, fInst]) {
        im.castShadow = false;
        im.instanceMatrix.needsUpdate = true;
        im.boundingSphere = cellSphere.clone();
        im.frustumCulled = true;
      }
      chunkGroup.add(tInst, fInst);
    }

    // 6. Desert Saguaro Cacti
    if (cell.cacti.length > 0) {
      const n = cell.cacti.length;
      const tInst = new THREE.InstancedMesh(cTrunkGeo, cactusMat, n);
      const lInst = new THREE.InstancedMesh(cArmLGeo, cactusMat, n);
      const rInst = new THREE.InstancedMesh(cArmRGeo, cactusMat, n);
      const jInst = new THREE.InstancedMesh(cJointGeo, cactusMat, n);

      for (let i = 0; i < n; i++) {
        const c = cell.cacti[i];
        dummy.position.set(c.x, c.y - 0.15, c.z);
        dummy.rotation.set(0, c.yaw, 0);
        dummy.scale.setScalar(c.scale);
        dummy.updateMatrix();
        tInst.setMatrixAt(i, dummy.matrix);
        lInst.setMatrixAt(i, dummy.matrix);
        rInst.setMatrixAt(i, dummy.matrix);
        jInst.setMatrixAt(i, dummy.matrix);

        instColor.setHex(c.color);
        tInst.setColorAt(i, instColor);
        lInst.setColorAt(i, instColor);
        rInst.setColorAt(i, instColor);
        jInst.setColorAt(i, instColor);
      }

      for (const im of [tInst, lInst, rInst, jInst]) {
        im.castShadow = false;
        im.instanceMatrix.needsUpdate = true;
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
        im.boundingSphere = cellSphere.clone();
        im.frustumCulled = true;
      }
      chunkGroup.add(tInst, lInst, rInst, jInst);
    }

    vegRootGroup.add(chunkGroup);
    spatialLOD.addFoliageChunk(cellSphere, chunkGroup);
  });
  root.add(vegRootGroup);

  // Spatial-Chunked Desert Sandstone & Forest Granite Boulders (always visible in frustum, zero distance pop-in!)
  const boulderGeo = trackGeo(new THREE.DodecahedronGeometry(2.6, 0));
  const boulderMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.94, metalness: 0.0, flatShading: true })
  );
  interface BoulderSpec {
    x: number;
    y: number;
    z: number;
    rx: number;
    ry: number;
    rz: number;
    sx: number;
    sy: number;
    sz: number;
    color: number;
  }
  const boulderCells = new Map<string, BoulderSpec[]>();
  const pushBoulder = (spec: BoulderSpec) => {
    const key = `${Math.floor(spec.x / 320)}_${Math.floor(spec.z / 320)}`;
    let list = boulderCells.get(key);
    if (!list) {
      list = [];
      boulderCells.set(key, list);
    }
    list.push(spec);
  };

  let bPlaced = 0;
  for (let i = 0; i < 340 && bPlaced < 150; i++) {
    const bx = DESERT_REGION.x + (rand() - 0.5) * DESERT_REGION.rx * 1.7;
    const bz = DESERT_REGION.z + (rand() - 0.5) * DESERT_REGION.rz * 1.7;
    if (Math.hypot(bx, bz) > getIslandCoastRadius(Math.atan2(bz, bx)) - 48) continue;
    if (!isClearOfStructures(bx, bz)) continue;
    const by = getTerrainHeight(bx, bz);
    if (by < 5) continue;
    pushBoulder({
      x: bx,
      y: by + 0.5,
      z: bz,
      rx: rand() * 2,
      ry: rand() * 3,
      rz: rand() * 2,
      sx: 0.9 + rand() * 1.8,
      sy: 0.6 + rand() * 0.95,
      sz: 0.9 + rand() * 1.8,
      color: i % 2 === 0 ? 0xb5673b : 0x9c4d2d,
    });
    bPlaced++;
  }
  for (let i = 0; i < 240 && bPlaced < 240; i++) {
    const bx = FOREST_REGION.x + (rand() - 0.5) * FOREST_REGION.rx * 1.75;
    const bz = FOREST_REGION.z + (rand() - 0.5) * FOREST_REGION.rz * 1.75;
    if (Math.hypot(bx, bz) > getIslandCoastRadius(Math.atan2(bz, bx)) - 52) continue;
    if (!isClearOfStructures(bx, bz)) continue;
    const by = getTerrainHeight(bx, bz);
    if (by < 6) continue;
    pushBoulder({
      x: bx,
      y: by + 0.4,
      z: bz,
      rx: rand() * 2,
      ry: rand() * 3,
      rz: rand() * 2,
      sx: 0.9 + rand() * 1.6,
      sy: 0.55 + rand() * 0.85,
      sz: 0.9 + rand() * 1.6,
      color: i % 2 === 0 ? 0x5c6870 : 0x4b5856,
    });
    bPlaced++;
  }
  boulderCells.forEach((list) => {
    const bInst = new THREE.InstancedMesh(boulderGeo, boulderMat, list.length);
    bInst.castShadow = false;
    bInst.receiveShadow = true;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      dummy.position.set(b.x, b.y, b.z);
      dummy.rotation.set(b.rx, b.ry, b.rz);
      dummy.scale.set(b.sx, b.sy, b.sz);
      dummy.updateMatrix();
      bInst.setMatrixAt(i, dummy.matrix);
      instColor.setHex(b.color);
      bInst.setColorAt(i, instColor);
    }
    bInst.instanceMatrix.needsUpdate = true;
    if (bInst.instanceColor) bInst.instanceColor.needsUpdate = true;
    bInst.computeBoundingSphere();
    bInst.frustumCulled = true;
    root.add(bInst);
  });

  // === 8. SOFT VOLUMETRIC COTTON-SMOKE CLOUDS (SPRITES) & ROUND RADIAL-GLOW STARFIELD ===
  const createSoftCloudTexture = (variant: number): THREE.CanvasTexture => {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, size, size);

    // Paint overlapping soft radial cotton/smoke puffs with 100% transparent feathered borders
    const puffs =
      variant === 0
        ? [
            { x: 128, y: 132, r: 86, a: 0.42 },
            { x: 86, y: 140, r: 66, a: 0.36 },
            { x: 170, y: 138, r: 68, a: 0.36 },
            { x: 108, y: 104, r: 64, a: 0.38 },
            { x: 152, y: 108, r: 60, a: 0.34 },
            { x: 64, y: 148, r: 46, a: 0.24 },
            { x: 194, y: 146, r: 46, a: 0.24 },
            { x: 128, y: 118, r: 54, a: 0.34 },
          ]
        : [
            { x: 128, y: 136, r: 82, a: 0.38 },
            { x: 76, y: 142, r: 58, a: 0.32 },
            { x: 180, y: 140, r: 60, a: 0.32 },
            { x: 100, y: 114, r: 54, a: 0.3 },
            { x: 156, y: 116, r: 56, a: 0.32 },
            { x: 54, y: 146, r: 40, a: 0.2 },
            { x: 204, y: 146, r: 40, a: 0.2 },
          ];

    for (const p of puffs) {
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
      grad.addColorStop(0.0, `rgba(255, 255, 255, ${p.a})`);
      grad.addColorStop(0.42, `rgba(255, 255, 255, ${(p.a * 0.62).toFixed(3)})`);
      grad.addColorStop(0.75, `rgba(255, 255, 255, ${(p.a * 0.18).toFixed(3)})`);
      grad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Soft radial vignette mask guaranteeing zero hard edges near canvas boundary
    ctx.globalCompositeOperation = 'destination-in';
    const mask = ctx.createRadialGradient(size / 2, size / 2, size * 0.14, size / 2, size / 2, size * 0.49);
    mask.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
    mask.addColorStop(0.68, 'rgba(255, 255, 255, 0.88)');
    mask.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
    ctx.fillStyle = mask;
    ctx.fillRect(0, 0, size, size);
    ctx.globalCompositeOperation = 'source-over';

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  };

  const cloudTexA = trackTex(createSoftCloudTexture(0));
  const cloudTexB = trackTex(createSoftCloudTexture(1));

  const cloudsGroup = new THREE.Group();
  const cloudTopMatA = trackMat(
    new THREE.SpriteMaterial({
      map: cloudTexA,
      color: 0xf4f8fc,
      transparent: true,
      opacity: 0.54,
      depthWrite: false,
      fog: true,
    })
  );
  const cloudTopMatB = trackMat(
    new THREE.SpriteMaterial({
      map: cloudTexB,
      color: 0xf4f8fc,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      fog: true,
    })
  );
  const cloudBaseMatA = trackMat(
    new THREE.SpriteMaterial({
      map: cloudTexA,
      color: 0xc8d8e8,
      transparent: true,
      opacity: 0.46,
      depthWrite: false,
      fog: true,
    })
  );
  const cloudBaseMatB = trackMat(
    new THREE.SpriteMaterial({
      map: cloudTexB,
      color: 0xc8d8e8,
      transparent: true,
      opacity: 0.44,
      depthWrite: false,
      fog: true,
    })
  );

  const cloudEntries: Array<{
    group: THREE.Group;
    baseY: number;
    phase: number;
    topPuffs: Array<{ sprite: THREE.Sprite; baseX: number; baseZ: number }>;
  }> = [];

  for (let i = 0; i < 74; i++) {
    const cloud = new THREE.Group();
    const angle = (i / 74) * Math.PI * 2 + rand() * 0.35;
    const dist = 240 + rand() * 2900;
    const baseY = 235 + rand() * 115;
    cloud.position.set(Math.cos(angle) * dist, baseY, Math.sin(angle) * dist);

    // Lower broader base smoke puffs (soft cool blue-gray shadow by Day; warm sunset glow at Dusk)
    const baseCount = 3 + Math.floor(rand() * 2);
    for (let b = 0; b < baseCount; b++) {
      const mat = (i + b) % 2 === 0 ? cloudBaseMatA : cloudBaseMatB;
      const puff = new THREE.Sprite(mat);
      const spreadX = (b - (baseCount - 1) * 0.5) * (42 + rand() * 24);
      const spreadZ = (rand() - 0.5) * 44;
      puff.position.set(spreadX, -2 + (rand() - 0.5) * 6, spreadZ);
      const wScale = 115 + rand() * 88;
      const hScale = 44 + rand() * 28;
      puff.scale.set(wScale, hScale, 1);
      cloud.add(puff);
    }

    // Upper billowy sun-facing crown puffs (crisp bright sunlit white by Day, directional offset toward sun)
    const topPuffs: Array<{ sprite: THREE.Sprite; baseX: number; baseZ: number }> = [];
    const topCount = 2 + Math.floor(rand() * 3);
    for (let t = 0; t < topCount; t++) {
      const mat = (i + t) % 2 === 0 ? cloudTopMatA : cloudTopMatB;
      const puff = new THREE.Sprite(mat);
      const spreadX = (t - (topCount - 1) * 0.5) * (34 + rand() * 20);
      const spreadZ = (rand() - 0.5) * 34;
      puff.position.set(spreadX, 14 + rand() * 12, spreadZ);
      const wScale = 92 + rand() * 68;
      const hScale = 40 + rand() * 24;
      puff.scale.set(wScale, hScale, 1);
      cloud.add(puff);
      topPuffs.push({ sprite: puff, baseX: spreadX, baseZ: spreadZ });
    }

    cloudsGroup.add(cloud);
    cloudEntries.push({ group: cloud, baseY, phase: rand() * Math.PI * 2, topPuffs });
  }
  root.add(cloudsGroup);

  // Soft circular radial-glow star texture (guaranteed 100% round dots, never squares)
  const createRoundStarTexture = (): THREE.CanvasTexture => {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, size, size);
    const half = size / 2;
    const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
    grad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
    grad.addColorStop(0.2, 'rgba(255, 255, 255, 0.92)');
    grad.addColorStop(0.45, 'rgba(230, 242, 255, 0.42)');
    grad.addColorStop(0.76, 'rgba(200, 224, 255, 0.08)');
    grad.addColorStop(1.0, 'rgba(200, 224, 255, 0.0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(half, half, half, 0, Math.PI * 2);
    ctx.fill();
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  };

  const starTex = trackTex(createRoundStarTexture());
  const starGroup = new THREE.Group();
  const starLayerSpecs = [
    { count: 520, size: 2.8, minBright: 0.36, maxBright: 0.72 },
    { count: 230, size: 4.4, minBright: 0.58, maxBright: 0.92 },
    { count: 72, size: 6.4, minBright: 0.78, maxBright: 1.0 },
  ];
  const starMaterials: THREE.PointsMaterial[] = [];

  for (const layer of starLayerSpecs) {
    const posArr = new Float32Array(layer.count * 3);
    const colArr = new Float32Array(layer.count * 3);
    for (let i = 0; i < layer.count; i++) {
      const u = rand();
      const v = rand();
      const theta = u * Math.PI * 2;
      const phi = Math.acos(0.1 + v * 0.9);
      const r = 6800;
      posArr[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      posArr[i * 3 + 1] = r * Math.cos(phi);
      posArr[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);

      const brightness = layer.minBright + rand() * (layer.maxBright - layer.minBright);
      // Subtle realistic star spectral tint variation (cool blue-white, pure white, soft warm ivory)
      const tintRoll = rand();
      const tintR = tintRoll < 0.22 ? 1.0 : tintRoll > 0.78 ? 0.84 : 0.96;
      const tintG = tintRoll < 0.22 ? 0.93 : tintRoll > 0.78 ? 0.92 : 0.98;
      const tintB = tintRoll < 0.22 ? 0.82 : 1.0;
      colArr[i * 3] = brightness * tintR;
      colArr[i * 3 + 1] = brightness * tintG;
      colArr[i * 3 + 2] = brightness * tintB;
    }
    const geo = trackGeo(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
    const mat = trackMat(
      new THREE.PointsMaterial({
        map: starTex,
        color: 0xffffff,
        vertexColors: true,
        size: layer.size,
        sizeAttenuation: false,
        transparent: true,
        opacity: 0,
        alphaTest: 0.01,
        blending: THREE.AdditiveBlending,
        fog: false,
        depthWrite: false,
      })
    );
    starMaterials.push(mat);
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    starGroup.add(pts);
  }
  starGroup.visible = false;
  root.add(starGroup);

  // === 9. DENSE WIND-SLANTED 3D STORM RAIN STREAKS (1 Draw Call LineSegments following camera/heli) ===
  const rainCount = 1150;
  const rainInnerCount = 560;
  const rainInnerX = 52;
  const rainInnerY = 44;
  const rainInnerZ = 52;
  const rainOuterX = 128;
  const rainOuterY = 74;
  const rainOuterZ = 128;
  const rainOffsets = new Float32Array(rainCount * 3);
  const rainSpeeds = new Float32Array(rainCount);
  const rainLengths = new Float32Array(rainCount);
  const rainPositions = new Float32Array(rainCount * 6);
  const rainColors = new Float32Array(rainCount * 6);

  for (let i = 0; i < rainCount; i++) {
    const isInner = i < rainInnerCount;
    const bx = isInner ? rainInnerX : rainOuterX;
    const by = isInner ? rainInnerY : rainOuterY;
    const bz = isInner ? rainInnerZ : rainOuterZ;

    rainOffsets[i * 3] = (rand() - 0.5) * bx;
    rainOffsets[i * 3 + 1] = (rand() - 0.5) * by;
    rainOffsets[i * 3 + 2] = (rand() - 0.5) * bz;
    rainSpeeds[i] = 74 + rand() * 28;
    rainLengths[i] = isInner ? 3.8 + rand() * 2.2 : 4.8 + rand() * 2.8;

    // Subtle tapered streak shading: translucent upper tail -> brighter raindrop tip
    const cIdx = i * 6;
    const bright = isInner ? 0.92 : 0.72;
    rainColors[cIdx] = 0.52 * bright;
    rainColors[cIdx + 1] = 0.64 * bright;
    rainColors[cIdx + 2] = 0.78 * bright;
    rainColors[cIdx + 3] = 0.88 * bright;
    rainColors[cIdx + 4] = 0.95 * bright;
    rainColors[cIdx + 5] = 1.0 * bright;
  }
  const rainGeo = trackGeo(new THREE.BufferGeometry());
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
  rainGeo.setAttribute('color', new THREE.BufferAttribute(rainColors, 3));
  const rainMat = trackMat(
    new THREE.LineBasicMaterial({
      color: 0xdbeeff,
      vertexColors: true,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: THREE.NormalBlending,
    })
  );
  const rainLines = new THREE.LineSegments(rainGeo, rainMat);
  rainLines.frustumCulled = false;
  rainLines.visible = false;
  root.add(rainLines);

  // === 9B. SOFT CIRCULAR 3D SNOWFLAKES (Blizzard + Automatic Localized Snow in Alpine Biome) ===
  const createSoftSnowflakeTexture = (): THREE.CanvasTexture => {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const half = size * 0.5;
      const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
      grad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
      grad.addColorStop(0.28, 'rgba(250, 253, 255, 0.88)');
      grad.addColorStop(0.56, 'rgba(235, 244, 252, 0.36)');
      grad.addColorStop(0.82, 'rgba(220, 234, 248, 0.08)');
      grad.addColorStop(1.0, 'rgba(215, 230, 246, 0.0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return trackTex(tex);
  };

  const snowFlakeTex = createSoftSnowflakeTexture();

  interface SnowLayerData {
    count: number;
    bx: number;
    by: number;
    bz: number;
    offsets: Float32Array;
    positions: Float32Array;
    fallSpeeds: Float32Array;
    swayPhases: Float32Array;
    swayFreqs: Float32Array;
    swayAmps: Float32Array;
    geo: THREE.BufferGeometry;
    mat: THREE.PointsMaterial;
    points: THREE.Points;
  }

  const createSnowLayer = (
    count: number,
    bx: number,
    by: number,
    bz: number,
    pointSize: number,
    minFall: number,
    maxFall: number
  ): SnowLayerData => {
    const offsets = new Float32Array(count * 3);
    const positions = new Float32Array(count * 3);
    const fallSpeeds = new Float32Array(count);
    const swayPhases = new Float32Array(count);
    const swayFreqs = new Float32Array(count);
    const swayAmps = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      offsets[i * 3] = (rand() - 0.5) * bx;
      offsets[i * 3 + 1] = (rand() - 0.5) * by;
      offsets[i * 3 + 2] = (rand() - 0.5) * bz;
      fallSpeeds[i] = minFall + rand() * (maxFall - minFall);
      swayPhases[i] = rand() * Math.PI * 2;
      swayFreqs[i] = 0.85 + rand() * 1.25;
      swayAmps[i] = 1.6 + rand() * 2.8;
    }

    const geo = trackGeo(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = trackMat(
      new THREE.PointsMaterial({
        map: snowFlakeTex,
        color: 0xffffff,
        size: pointSize,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0,
        alphaTest: 0.008,
        depthWrite: false,
        fog: true,
      })
    );
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    points.visible = false;
    root.add(points);

    return {
      count,
      bx,
      by,
      bz,
      offsets,
      positions,
      fallSpeeds,
      swayPhases,
      swayFreqs,
      swayAmps,
      geo,
      mat,
      points,
    };
  };

  // Near-field soft snowflakes + mid/far-field drifting snow depth layer (zero hard square pixels)
  const snowLayers: SnowLayerData[] = [
    createSnowLayer(540, 56, 44, 56, 0.36, 4.2, 8.2),
    createSnowLayer(940, 132, 70, 132, 0.25, 3.2, 6.4),
  ];

  const snowFlakeDayColor = new THREE.Color(0xf8fbff);
  const snowFlakeDuskColor = new THREE.Color(0xffe7dc);
  const snowFlakeNightColor = new THREE.Color(0xbfd4ec);
  const tmpSnowFlakeColor = new THREE.Color();

  // === 10. ACTIVE ON-DUTY HELIPAD DISPATCH BEACON ===
  const dispatchBeacon = new THREE.Group();
  dispatchBeacon.visible = false;

  const beamMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0x34d399,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  const beamCyl = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(7.2, 8.6, 115, 20, 1, true)),
    beamMat
  );
  beamCyl.position.y = 57.5;
  dispatchBeacon.add(beamCyl);

  const ringMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xfacc15,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  const beaconRing = new THREE.Mesh(trackGeo(new THREE.RingGeometry(8.5, 10.6, 28)), ringMat);
  beaconRing.rotation.x = -Math.PI / 2;
  beaconRing.position.y = 0.35;
  dispatchBeacon.add(beaconRing);
  root.add(dispatchBeacon);

  const cloudTopDayColor = new THREE.Color(0xffffff);
  const cloudBotDayColor = new THREE.Color(0x8ea8c4);
  const cloudTopDuskColor = new THREE.Color(0x6c5478);
  const cloudBotDuskColor = new THREE.Color(0xf59970);
  const cloudTopStormDayColor = new THREE.Color(0x2d3745);
  const cloudBotStormDayColor = new THREE.Color(0x18202c);
  const cloudTopStormNightColor = new THREE.Color(0x141c28);
  const cloudBotStormNightColor = new THREE.Color(0x0b1019);
  const cloudTopBlizzardDayColor = new THREE.Color(0xdbe3eb);
  const cloudBotBlizzardDayColor = new THREE.Color(0xa2b2c1);
  const cloudTopBlizzardNightColor = new THREE.Color(0x28384c);
  const cloudBotBlizzardNightColor = new THREE.Color(0x192534);
  const cloudTopNightColor = new THREE.Color(0x1f2e48);
  const cloudBotNightColor = new THREE.Color(0x152236);
  const cloudLightningColor = new THREE.Color(0xbce0ff);
  const tmpCloudTopColor = new THREE.Color();
  const tmpCloudBotColor = new THREE.Color();
  const tmpStormTop = new THREE.Color();
  const tmpStormBot = new THREE.Color();
  const tmpBlizTop = new THREE.Color();
  const tmpBlizBot = new THREE.Color();

  const oceanDayColor = new THREE.Color(0x0b96cf);
  const oceanDuskColor = new THREE.Color(0x274c6e);
  const oceanNightColor = new THREE.Color(0x092440);
  const oceanStormColor = new THREE.Color(0x0d2536);
  const oceanBlizzardColor = new THREE.Color(0x194969);
  const tmpOceanColor = new THREE.Color();

  const lakeDayColor = new THREE.Color(0x16a8bf);
  const lakeDuskColor = new THREE.Color(0x2e5b73);
  const lakeNightColor = new THREE.Color(0x0b3145);
  const lakeStormColor = new THREE.Color(0x113244);
  const lakeBlizzardColor = new THREE.Color(0x24627a);
  const tmpLakeColor = new THREE.Color();

  const sunGlintDayColor = new THREE.Color(0xfff6e3);
  const sunGlintDuskColor = new THREE.Color(0xffb56e);
  const defaultSunDir = new THREE.Vector3(0.5, 0.72, 0.48).normalize();

  // Finalize global InstancedMeshes for all helipad perimeter beacons (2 draw calls) & skyscraper/crane red beacons (1 draw call)
  if (padBeaconCoordsA.length > 0) {
    const instA = new THREE.InstancedMesh(beaconBulbGeo, padBeaconMatA, padBeaconCoordsA.length);
    instA.castShadow = false;
    const tmpB = new THREE.Object3D();
    for (let i = 0; i < padBeaconCoordsA.length; i++) {
      const p = padBeaconCoordsA[i];
      tmpB.position.set(p.x, p.y, p.z);
      tmpB.rotation.set(0, 0, 0);
      tmpB.scale.setScalar(1);
      tmpB.updateMatrix();
      instA.setMatrixAt(i, tmpB.matrix);
    }
    instA.instanceMatrix.needsUpdate = true;
    instA.computeBoundingSphere();
    root.add(instA);
  }
  if (padBeaconCoordsB.length > 0) {
    const instB = new THREE.InstancedMesh(beaconBulbGeo, padBeaconMatB, padBeaconCoordsB.length);
    instB.castShadow = false;
    const tmpB = new THREE.Object3D();
    for (let i = 0; i < padBeaconCoordsB.length; i++) {
      const p = padBeaconCoordsB[i];
      tmpB.position.set(p.x, p.y, p.z);
      tmpB.rotation.set(0, 0, 0);
      tmpB.scale.setScalar(1);
      tmpB.updateMatrix();
      instB.setMatrixAt(i, tmpB.matrix);
    }
    instB.instanceMatrix.needsUpdate = true;
    instB.computeBoundingSphere();
    root.add(instB);
  }
  if (skyRedBeaconCoords.length > 0) {
    const unitBeaconGeo = trackGeo(new THREE.SphereGeometry(1, 7, 6));
    const skyBeaconInst = new THREE.InstancedMesh(
      unitBeaconGeo,
      skyRedBeaconMat,
      skyRedBeaconCoords.length
    );
    skyBeaconInst.castShadow = false;
    const tmpB = new THREE.Object3D();
    for (let i = 0; i < skyRedBeaconCoords.length; i++) {
      const p = skyRedBeaconCoords[i];
      tmpB.position.set(p.x, p.y, p.z);
      tmpB.rotation.set(0, 0, 0);
      tmpB.scale.setScalar(p.r);
      tmpB.updateMatrix();
      skyBeaconInst.setMatrixAt(i, tmpB.matrix);
    }
    skyBeaconInst.instanceMatrix.needsUpdate = true;
    skyBeaconInst.computeBoundingSphere();
    root.add(skyBeaconInst);
  }

  let stormBlend = 0;
  let blizzardBlend = 0;
  let snowIntensity = 0;
  let qualityParticleScale = 1.0;

  // Pre-computed world culling spheres for dynamic scenic animations (O CONE: skip updates outside camera frustum)
  const campSphere = new THREE.Sphere(
    new THREE.Vector3(FOREST_CAMP_POS.x, getTerrainHeight(FOREST_CAMP_POS.x, FOREST_CAMP_POS.z) + 2, FOREST_CAMP_POS.z),
    24
  );
  const skiLiftMid = liftStart.clone().add(liftEnd).multiplyScalar(0.5);
  const skiLiftSphere = new THREE.Sphere(skiLiftMid, liftStart.distanceTo(liftEnd) * 0.55 + 24);
  const rigVisibleFlags = OIL_RIGS.map(() => true);

  // Scene-wide frustumCulled = true guarantee across all world meshes & groups
  // (keeping frustumCulled = false strictly on dynamic camera-following weather/star/beacon particles)
  const noCullSet = new Set<THREE.Object3D>([rainLines, starGroup, dispatchBeacon]);
  for (let i = 0; i < snowLayers.length; i++) noCullSet.add(snowLayers[i].points);
  starGroup.children.forEach((c) => noCullSet.add(c));
  root.traverse((obj) => {
    if (!noCullSet.has(obj)) {
      obj.frustumCulled = true;
    }
  });

  const updateDynamicProps = (
    elapsed: number,
    dt: number,
    nightFactor: number,
    duskFactor: number,
    weather: WeatherMode,
    heliX: number,
    heliY: number,
    heliZ: number,
    lightningFlash = 0,
    sunDir?: THREE.Vector3,
    cameraPos?: THREE.Vector3,
    cameraFrustum?: THREE.Frustum,
    camForward?: THREE.Vector3
  ) => {
    const targetStorm = weather === 'STORM' ? 1 : 0;
    const targetBlizzard = weather === 'BLIZZARD' ? 1 : 0;
    stormBlend = THREE.MathUtils.damp(stormBlend, targetStorm, 4.0, dt);
    blizzardBlend = THREE.MathUtils.damp(blizzardBlend, targetBlizzard, 3.6, dt);

    // Localized light alpine snowfall inside Snow Mountain Range even when global weather is CLEAR
    const alpineWeight = getSnowWeight(heliX, heliZ);
    const localAlpineSnow =
      weather === 'CLEAR' ? THREE.MathUtils.clamp((alpineWeight - 0.08) * 0.62, 0, 0.36) : 0;
    const targetSnowIntensity = weather === 'BLIZZARD' ? 1.0 : localAlpineSnow;
    snowIntensity = THREE.MathUtils.damp(snowIntensity, targetSnowIntensity, 2.8, dt);

    // Streetlamps & Arena Stadium floodlights automatically come on in heavy Storm & Blizzard
    const lampOnFactor = THREE.MathUtils.clamp(
      Math.max(nightFactor * 1.15 + duskFactor * 0.72, stormBlend * 0.85, blizzardBlend * 0.62),
      0,
      1
    );

    // GTA-STYLE SPATIAL LOD & FRUSTUM CULLING UPDATE (O CONE + O LONGE)
    if (cameraPos && cameraFrustum) {
      spatialLOD.update(cameraPos, cameraFrustum, currentQuality, weather, lampOnFactor);
    }

    const activeSunDir = sunDir ?? defaultSunDir;
    oceanUniforms.uTime.value = elapsed;
    oceanUniforms.uSunDir.value.copy(activeSunDir);
    const weatherGlintVis =
      weather === 'FOG'
        ? 0.16
        : Math.max(0, 1 - Math.max(stormBlend, blizzardBlend) * 1.15);
    oceanUniforms.uSunGlintStrength.value =
      THREE.MathUtils.clamp((1 - nightFactor) * 1.15 + duskFactor * 0.35, 0, 1.25) * weatherGlintVis;
    oceanUniforms.uSunGlintColor.value
      .copy(sunGlintDayColor)
      .lerp(sunGlintDuskColor, duskFactor * 0.92);

    const targetWaveAmp =
      weather === 'STORM' ? 2.95 : weather === 'BLIZZARD' ? 1.6 : weather === 'FOG' ? 0.85 : 1.0;
    oceanUniforms.uWaveAmp.value = THREE.MathUtils.damp(
      oceanUniforms.uWaveAmp.value,
      targetWaveAmp,
      2.2,
      dt
    );

    tmpOceanColor.copy(oceanDayColor).lerp(oceanNightColor, nightFactor);
    if (duskFactor > 0.01) tmpOceanColor.lerp(oceanDuskColor, duskFactor * 0.6);
    if (stormBlend > 0.005) tmpOceanColor.lerp(oceanStormColor, stormBlend * 0.86);
    if (blizzardBlend > 0.005) tmpOceanColor.lerp(oceanBlizzardColor, blizzardBlend * 0.72);
    oceanMat.color.copy(tmpOceanColor);

    tmpLakeColor.copy(lakeDayColor).lerp(lakeNightColor, nightFactor);
    if (duskFactor > 0.01) tmpLakeColor.lerp(lakeDuskColor, duskFactor * 0.55);
    if (stormBlend > 0.005) tmpLakeColor.lerp(lakeStormColor, stormBlend * 0.84);
    if (blizzardBlend > 0.005) tmpLakeColor.lerp(lakeBlizzardColor, blizzardBlend * 0.68);
    lakeMat.color.copy(tmpLakeColor);
    riverMat.color.copy(tmpLakeColor);

    const harshWeather = Math.max(stormBlend, blizzardBlend * 0.55);
    const surfWave =
      1 + Math.sin(elapsed * (1.7 + harshWeather * 2.5)) * (0.005 + harshWeather * 0.0035);
    coastFoamMesh.scale.set(surfWave, 1, surfWave);
    shorelineFoamMat.opacity =
      THREE.MathUtils.lerp(0.36, 0.64, harshWeather) *
      (0.55 + (1 - nightFactor) * 0.45) *
      (0.86 + Math.sin(elapsed * (2.1 + harshWeather * 1.7)) * 0.14);

    // Pre-test the 3 Oil Rigs against camera frustum once per frame
    for (let r = 0; r < rigSpheres.length; r++) {
      rigVisibleFlags[r] = !cameraFrustum || cameraFrustum.intersectsSphere(rigSpheres[r]);
    }
    for (let i = 0; i < rigLegFoamRings.length; i++) {
      const entry = rigLegFoamRings[i];
      if (!rigVisibleFlags[entry.rigIdx]) continue;
      const pulse =
        1 +
        Math.sin(elapsed * (2.1 + harshWeather * 2.6) + i * 1.4) * (0.16 + harshWeather * 0.08);
      entry.mesh.scale.setScalar(pulse);
    }

    radarDish.rotation.y += dt * 1.45;
    summitRadarDish.rotation.y += dt * 1.1;
    const sockFreq = weather === 'STORM' ? 6.4 : weather === 'BLIZZARD' ? 5.2 : 1.9;
    const sockAmp = weather === 'STORM' ? 0.44 : weather === 'BLIZZARD' ? 0.39 : 0.32;
    windsock.rotation.y = Math.sin(elapsed * sockFreq) * sockAmp + 0.3;
    cloudsGroup.rotation.y +=
      dt * THREE.MathUtils.lerp(0.0035, 0.014, Math.max(stormBlend, blizzardBlend * 0.72));

    // O CONE: Rotate Wind Farm turbine blades whenever inside camera frustum (always visible across desert)
    const windSpeed =
      weather === 'STORM' ? 3.25 : weather === 'BLIZZARD' ? 2.35 : weather === 'FOG' ? 0.65 : 1.18;
    for (let i = 0; i < windTurbineRotors.length; i++) {
      const wt = windTurbineRotors[i];
      if (cameraFrustum && !cameraFrustum.intersectsSphere(wt.sphere)) continue;
      wt.hub.rotation.z -= dt * windSpeed * wt.speedMult;
    }

    // Rotate Costa do Sol Lighthouse volumetric beam (bright at Dusk, Night, Storm & Blizzard)
    const lhBeamIntensity = THREE.MathUtils.clamp(
      Math.max(nightFactor * 1.15 + duskFactor * 0.65, stormBlend * 0.96, blizzardBlend * 0.74),
      0,
      1.08
    );
    lighthouseBeamGroup.rotation.y += dt * (weather === 'STORM' ? 0.85 : 0.68);
    lighthouseBeamGroup.visible = lhBeamIntensity > 0.05;
    lighthouseBeamMat.opacity = lhBeamIntensity * (0.24 + Math.max(stormBlend, blizzardBlend * 0.65) * 0.08);
    lhLampMat.emissiveIntensity = 0.6 + lhBeamIntensity * 4.2;

    // O CONE: Pause wave bobbing on moored vessels when outside camera frustum or > 1050m
    const vesselWaveMult = THREE.MathUtils.lerp(1.0, 2.65, Math.max(stormBlend, blizzardBlend * 0.42));
    for (let i = 0; i < bobbingVessels.length; i++) {
      const v = bobbingVessels[i];
      if (cameraFrustum) {
        _tmpCullSphere.center.copy(v.group.position);
        _tmpCullSphere.radius = 54;
        if (!cameraFrustum.intersectsSphere(_tmpCullSphere)) continue;
      }
      if (cameraPos && cameraPos.distanceToSquared(v.group.position) > 1050 * 1050) continue;
      v.group.position.y = v.baseY + Math.sin(elapsed * (1.65 + harshWeather * 0.75) + v.phase) * v.amp * vesselWaveMult;
      v.group.rotation.z = Math.sin(elapsed * (1.2 + harshWeather * 0.6) + v.phase) * 0.032 * vesselWaveMult;
    }

    // O CONE: Forest campsite flickering campfire (pause when outside frustum or > 480m)
    const campInView =
      (!cameraFrustum || cameraFrustum.intersectsSphere(campSphere)) &&
      (!cameraPos || cameraPos.distanceToSquared(campSphere.center) < 480 * 480);
    if (campInView) {
      const campFlicker = 0.8 + Math.sin(elapsed * 14.2) * 0.16 + Math.cos(elapsed * 21.5) * 0.1;
      campfireFlames[0].scale.set(0.92 + campFlicker * 0.12, campFlicker * 1.15, 0.92 + campFlicker * 0.12);
      campfireFlames[1].scale.set(0.95, 0.85 + campFlicker * 0.25, 0.95);
      campfireGlow.scale.setScalar(0.9 + campFlicker * 0.22);
      campfireGlowMat.opacity =
        (0.18 + Math.max(nightFactor, stormBlend * 0.65, blizzardBlend * 0.5) * 0.26) * campFlicker;
    }

    // O CONE: Overcast cloud expansion + sun-shift (skip cloud groups outside camera frustum!)
    const overcastMix = Math.max(stormBlend, blizzardBlend * 0.76);
    const cloudScaleXZ = THREE.MathUtils.lerp(1.0, 1.34, overcastMix);
    const cloudScaleY = THREE.MathUtils.lerp(1.0, 1.42, overcastMix);
    const cloudDropY = stormBlend * 22 + blizzardBlend * 15;
    const sunShiftMag = (1 - nightFactor) * (1 - overcastMix) * 8.5;
    const cosCRot = Math.cos(-cloudsGroup.rotation.y);
    const sinCRot = Math.sin(-cloudsGroup.rotation.y);
    const cosWorldRot = Math.cos(cloudsGroup.rotation.y);
    const sinWorldRot = Math.sin(cloudsGroup.rotation.y);
    const localSunX = (activeSunDir.x * cosCRot - activeSunDir.z * sinCRot) * sunShiftMag;
    const localSunZ = (activeSunDir.x * sinCRot + activeSunDir.z * cosCRot) * sunShiftMag;

    for (let i = 0; i < cloudEntries.length; i++) {
      const c = cloudEntries[i];
      if (!c.group.visible) continue;
      if (cameraFrustum) {
        const lx = c.group.position.x;
        const lz = c.group.position.z;
        _tmpCullSphere.center.set(
          lx * cosWorldRot + lz * sinWorldRot,
          c.baseY - cloudDropY,
          -lx * sinWorldRot + lz * cosWorldRot
        );
        _tmpCullSphere.radius = 195;
        if (!cameraFrustum.intersectsSphere(_tmpCullSphere)) continue;
      }
      c.group.position.y = c.baseY - cloudDropY + Math.sin(elapsed * 0.25 + c.phase) * 1.8;
      c.group.scale.set(cloudScaleXZ, cloudScaleY, cloudScaleXZ);
      for (let t = 0; t < c.topPuffs.length; t++) {
        const tp = c.topPuffs[t];
        tp.sprite.position.x = tp.baseX + localSunX;
        tp.sprite.position.z = tp.baseZ + localSunZ;
      }
    }

    // Building & Alpine Chalet windows: crisp warm contrast during Dusk, Night, Storm & Blizzard
    const weatherGlow = Math.max(stormBlend, blizzardBlend * 0.68);
    const isClearFullDay = nightFactor < 0.01 && duskFactor < 0.01 && weatherGlow < 0.05;
    const earlyWindowGlow = isClearFullDay
      ? 0
      : THREE.MathUtils.clamp(
          Math.max((nightFactor * 0.94 + duskFactor * 0.72) * 1.45, weatherGlow * 1.12),
          0,
          1.45
        );
    const lateWindowGlow = isClearFullDay
      ? 0
      : THREE.MathUtils.clamp(
          Math.max((nightFactor * 0.94 + duskFactor * 0.24) * 1.45, weatherGlow * 0.25),
          0,
          1.45
        );
    for (let i = 0; i < nightWindowMats.length; i++) {
      const isEarlyLit = i < 4 || (i % 5 !== 0 && i % 3 !== 2);
      nightWindowMats[i].emissiveIntensity = isEarlyLit ? earlyWindowGlow : lateWindowGlow;
    }

    lampBulbMat.emissiveIntensity = lampOnFactor * 3.1;
    lampGlowPoolMat.opacity = lampOnFactor * 0.28;
    stadiumFloodMat.emissiveIntensity = lampOnFactor * 3.6;

    // Helipad perimeter beacons & skyscraper/crane aviation warning lights pop crisply in Storm & Blizzard
    const blinkA = Math.sin(elapsed * 5.2) > 0 ? 1 : 0.15;
    const blinkB = Math.sin(elapsed * 5.2 + Math.PI) > 0 ? 1 : 0.15;
    const padBoost =
      0.55 + Math.max(duskFactor * 1.15 + nightFactor * 2.4, stormBlend * 2.55, blizzardBlend * 2.15);
    padBeaconMatA.emissiveIntensity = blinkA * padBoost;
    padBeaconMatB.emissiveIntensity = blinkB * padBoost;

    const rigRedPulse = Math.sin(elapsed * 4.4) > 0.1 ? 1 : 0.12;
    const rigBeaconBoost = Math.max(
      duskFactor * 1.6 + nightFactor * 4.4,
      stormBlend * 3.9,
      blizzardBlend * 3.1
    );
    rigRedBeaconMat.emissiveIntensity = rigRedPulse * (1.2 + rigBeaconBoost);
    rigBeaconGlowMat.opacity =
      (0.14 + Math.max(duskFactor * 0.22 + nightFactor * 0.48, stormBlend * 0.44, blizzardBlend * 0.36)) *
      (rigRedPulse > 0.5 ? 1.0 : 0.25);

    const skyRedPulse = Math.sin(elapsed * 3.6 + 0.9) > 0.15 ? 1 : 0.1;
    skyRedBeaconMat.emissiveIntensity =
      skyRedPulse *
      (0.85 + Math.max(duskFactor * 1.5 + nightFactor * 3.6, stormBlend * 3.1, blizzardBlend * 2.4));

    // O CONE: Oil Rig Flares animate only for rigs currently inside camera frustum
    const flareStormScale = 1 + harshWeather * 0.24;
    let avgFlareFlicker = 0.9;
    for (let i = 0; i < rigFlares.length; i++) {
      const rf = rigFlares[i];
      if (!rigVisibleFlags[rf.rigIdx]) continue;
      const f =
        0.82 +
        Math.sin(elapsed * (16.5 + harshWeather * 8.0) + rf.phase) * (0.18 + harshWeather * 0.08) +
        Math.cos(elapsed * 23.1 + rf.phase * 1.4) * 0.12;
      if (i === 0) avgFlareFlicker = f;
      rf.flame.scale.set(
        (0.92 + f * 0.18) * flareStormScale,
        f * 1.18 * flareStormScale,
        (0.92 + f * 0.18) * flareStormScale
      );
      rf.core.scale.set(0.95 * flareStormScale, (0.9 + f * 0.2) * flareStormScale, 0.95 * flareStormScale);
      rf.halo.scale.setScalar((0.95 + f * 0.26) * (1 + harshWeather * 0.35));
    }
    rigFlareHaloMat.opacity =
      (0.22 + Math.max(duskFactor * 0.24 + nightFactor * 0.42, stormBlend * 0.38, blizzardBlend * 0.3)) *
      avgFlareFlicker;

    // O CONE: Smoothly glide 14 ski lift gondolas whenever ski mountain is inside frustum
    const skiLiftInView = !cameraFrustum || cameraFrustum.intersectsSphere(skiLiftSphere);
    if (skiLiftInView) {
      const segCount = liftTowerTops.length - 1;
      for (let i = 0; i < liftGondolas.length; i++) {
        const g = liftGondolas[i];
        const rawT = (g.phase + elapsed * 0.022 * g.side) % 1;
        const u = rawT < 0 ? rawT + 1 : rawT;
        const scaled = u * segCount;
        const segIdx = Math.min(segCount - 1, Math.floor(scaled));
        const localT = scaled - segIdx;
        const p0 = liftTowerTops[segIdx];
        const p1 = liftTowerTops[segIdx + 1];
        g.group.position.set(
          THREE.MathUtils.lerp(p0.x, p1.x, localT) + liftRight.x * g.side * 2.5,
          THREE.MathUtils.lerp(p0.y, p1.y, localT),
          THREE.MathUtils.lerp(p0.z, p1.z, localT) + liftRight.z * g.side * 2.5
        );
        g.group.rotation.z =
          Math.sin(elapsed * 1.8 + i) * (0.05 + stormBlend * 0.07 + blizzardBlend * 0.085);
      }
    }

    // STRICT RULE: Stars are 100% invisible during Day, Dusk, Storm, and Blizzard overcast.
    const starVis =
      weather === 'STORM' || weather === 'BLIZZARD' ? 0.0 : weather === 'FOG' ? 0.25 : 1.0;
    const isFullNightSky = duskFactor <= 0.02 && nightFactor > 0.78;
    const starOpacity = isFullNightSky
      ? THREE.MathUtils.smoothstep(nightFactor, 0.78, 0.98) * 0.95 * starVis
      : 0;
    starGroup.visible = starOpacity > 0.01;
    for (let i = 0; i < starMaterials.length; i++) {
      starMaterials[i].opacity = starOpacity;
    }

    // Soft cotton-smoke Sprite clouds tinted dynamically for Day / Dusk / Night / Storm / Blizzard
    tmpCloudTopColor.copy(cloudTopDayColor).lerp(cloudTopNightColor, nightFactor);
    tmpCloudBotColor.copy(cloudBotDayColor).lerp(cloudBotNightColor, nightFactor);
    if (duskFactor > 0.01) {
      tmpCloudTopColor.lerp(cloudTopDuskColor, duskFactor * 0.94);
      tmpCloudBotColor.lerp(cloudBotDuskColor, duskFactor * 0.96);
    }
    if (stormBlend > 0.005) {
      tmpStormTop.copy(cloudTopStormDayColor).lerp(cloudTopStormNightColor, nightFactor * 0.85);
      tmpStormBot.copy(cloudBotStormDayColor).lerp(cloudBotStormNightColor, nightFactor * 0.85);
      tmpCloudTopColor.lerp(tmpStormTop, stormBlend * 0.96);
      tmpCloudBotColor.lerp(tmpStormBot, stormBlend * 0.98);
    }
    if (blizzardBlend > 0.005) {
      tmpBlizTop.copy(cloudTopBlizzardDayColor).lerp(cloudTopBlizzardNightColor, nightFactor * 0.88);
      tmpBlizBot.copy(cloudBotBlizzardDayColor).lerp(cloudBotBlizzardNightColor, nightFactor * 0.88);
      tmpCloudTopColor.lerp(tmpBlizTop, blizzardBlend * 0.96);
      tmpCloudBotColor.lerp(tmpBlizBot, blizzardBlend * 0.96);
    }
    if (lightningFlash > 0.01) {
      tmpCloudTopColor.lerp(cloudLightningColor, lightningFlash * 0.62);
      tmpCloudBotColor.lerp(cloudLightningColor, lightningFlash * 0.76);
    }

    const clearTopOpacity = THREE.MathUtils.lerp(0.68, 0.34, nightFactor) + duskFactor * 0.08;
    const clearBotOpacity = THREE.MathUtils.lerp(0.56, 0.3, nightFactor) + duskFactor * 0.12;
    const topOpacity = THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(clearTopOpacity, 0.79, blizzardBlend),
      0.86,
      stormBlend
    );
    const botOpacity = THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(clearBotOpacity, 0.75, blizzardBlend),
      0.84,
      stormBlend
    );
    cloudTopMatA.color.copy(tmpCloudTopColor);
    cloudTopMatB.color.copy(tmpCloudTopColor);
    cloudBaseMatA.color.copy(tmpCloudBotColor);
    cloudBaseMatB.color.copy(tmpCloudBotColor);

    cloudTopMatA.opacity = topOpacity;
    cloudTopMatB.opacity = topOpacity * 0.94;
    cloudBaseMatA.opacity = Math.min(0.92, botOpacity);
    cloudBaseMatB.opacity = Math.min(0.88, botOpacity * 0.94);

    // Dense high-speed wind-slanted 3D rain streaks around camera/helicopter (frustum-trimmed behind camera!)
    const hasCamCone = cameraPos !== undefined && camForward !== undefined;
    const camX = hasCamCone ? cameraPos.x : heliX;
    const camZ = hasCamCone ? cameraPos.z : heliZ;
    const camFx = hasCamCone ? camForward.x : 0;
    const camFz = hasCamCone ? camForward.z : -1;

    if (weather === 'STORM') {
      rainLines.visible = true;
      const posArr = (rainGeo.attributes.position as THREE.BufferAttribute).array as Float32Array;
      const gustOsc = Math.sin(elapsed * 0.65) * 3.8 + Math.cos(elapsed * 1.4) * 1.9;
      const windX = -(18.5 + gustOsc);
      const windZ = -(6.8 + gustOsc * 0.35);

      const slantX = windX * 0.056;
      const slantZ = windZ * 0.056;

      rainMat.opacity = THREE.MathUtils.clamp(0.46 + lightningFlash * 0.34, 0.42, 0.82);

      const activeRainCount = Math.max(220, Math.floor(rainCount * qualityParticleScale));
      let writtenLines = 0;

      for (let i = 0; i < activeRainCount; i++) {
        const isInner = i < rainInnerCount;
        const bx = isInner ? rainInnerX : rainOuterX;
        const by = isInner ? rainInnerY : rainOuterY;
        const bz = isInner ? rainInnerZ : rainOuterZ;
        const halfX = bx * 0.5;
        const halfY = by * 0.5;
        const halfZ = bz * 0.5;

        const speed = rainSpeeds[i];
        const len = rainLengths[i];

        let rx = rainOffsets[i * 3] + windX * dt;
        let ry = rainOffsets[i * 3 + 1] - speed * dt;
        let rz = rainOffsets[i * 3 + 2] + windZ * dt;

        if (ry < -halfY) ry += by;
        if (rx < -halfX) rx += bx;
        else if (rx > halfX) rx -= bx;
        if (rz < -halfZ) rz += bz;
        else if (rz > halfZ) rz -= bz;

        rainOffsets[i * 3] = rx;
        rainOffsets[i * 3 + 1] = ry;
        rainOffsets[i * 3 + 2] = rz;

        const wx = heliX + rx;
        const wy = heliY + ry + 6;
        const wz = heliZ + rz;

        // O CONE: Skip drawing outer rain streaks strictly behind the camera cone
        if (!isInner && hasCamCone) {
          const dotFwd = (wx - camX) * camFx + (wz - camZ) * camFz;
          if (dotFwd < -14) continue;
        }

        const idx = writtenLines * 6;
        posArr[idx] = wx;
        posArr[idx + 1] = wy;
        posArr[idx + 2] = wz;
        posArr[idx + 3] = wx + slantX * len;
        posArr[idx + 4] = wy - len;
        posArr[idx + 5] = wz + slantZ * len;
        writtenLines++;
      }
      rainGeo.setDrawRange(0, writtenLines * 2);
      rainGeo.attributes.position.needsUpdate = true;
    } else {
      rainLines.visible = false;
    }

    // Soft circular 3D snowflakes with organic sinusoidal wind sway (cone-culled outer layer behind camera)
    if (snowIntensity > 0.015) {
      tmpSnowFlakeColor.copy(snowFlakeDayColor).lerp(snowFlakeNightColor, nightFactor * 0.78);
      if (duskFactor > 0.01 && blizzardBlend < 0.85) {
        tmpSnowFlakeColor.lerp(snowFlakeDuskColor, duskFactor * 0.45 * (1 - blizzardBlend * 0.8));
      }

      const gustWave = Math.sin(elapsed * 0.55) * 2.8 + Math.cos(elapsed * 1.15) * 1.4;
      const baseWindX = THREE.MathUtils.lerp(-1.4, -12.6 - gustWave, blizzardBlend);
      const baseWindZ = THREE.MathUtils.lerp(0.6, 4.8 + gustWave * 0.42, blizzardBlend);
      const fallBoost = THREE.MathUtils.lerp(0.72, 1.32, blizzardBlend);

      for (let li = 0; li < snowLayers.length; li++) {
        const layer = snowLayers[li];
        const activeCount = Math.max(
          24,
          Math.min(
            layer.count,
            Math.floor(layer.count * (0.14 + snowIntensity * 0.86) * qualityParticleScale)
          )
        );
        layer.points.visible = true;
        layer.mat.color.copy(tmpSnowFlakeColor);
        const layerOpacityScale = li === 0 ? 0.92 : 0.74;
        layer.mat.opacity = THREE.MathUtils.clamp(
          (0.28 + snowIntensity * 0.66) * layerOpacityScale,
          0,
          0.92
        );

        const halfX = layer.bx * 0.5;
        const halfY = layer.by * 0.5;
        const halfZ = layer.bz * 0.5;
        const posArr = layer.positions;
        let writtenFlakes = 0;

        for (let i = 0; i < activeCount; i++) {
          const phase = layer.swayPhases[i];
          const freq = layer.swayFreqs[i];
          const amp = layer.swayAmps[i] * THREE.MathUtils.lerp(0.75, 1.18, blizzardBlend);

          const swayVx = Math.sin(elapsed * freq + phase) * amp;
          const swayVz = Math.cos(elapsed * (freq * 0.82) + phase * 1.3) * (amp * 0.72);

          let rx = layer.offsets[i * 3] + (baseWindX + swayVx) * dt;
          let ry = layer.offsets[i * 3 + 1] - layer.fallSpeeds[i] * fallBoost * dt;
          let rz = layer.offsets[i * 3 + 2] + (baseWindZ + swayVz) * dt;

          if (ry < -halfY) ry += layer.by;
          if (rx < -halfX) rx += layer.bx;
          else if (rx > halfX) rx -= layer.bx;
          if (rz < -halfZ) rz += layer.bz;
          else if (rz > halfZ) rz -= layer.bz;

          layer.offsets[i * 3] = rx;
          layer.offsets[i * 3 + 1] = ry;
          layer.offsets[i * 3 + 2] = rz;

          const wx = heliX + rx;
          const wy = heliY + ry + 5.5;
          const wz = heliZ + rz;

          // O CONE: Skip far-layer flakes strictly behind the camera
          if (li === 1 && hasCamCone) {
            const dotFwd = (wx - camX) * camFx + (wz - camZ) * camFz;
            if (dotFwd < -16) continue;
          }

          const idx = writtenFlakes * 3;
          posArr[idx] = wx;
          posArr[idx + 1] = wy;
          posArr[idx + 2] = wz;
          writtenFlakes++;
        }
        layer.geo.setDrawRange(0, writtenFlakes);
        (layer.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      }
    } else {
      for (let li = 0; li < snowLayers.length; li++) {
        snowLayers[li].points.visible = false;
      }
    }

    if (dispatchBeacon.visible) {
      const wave = 1 + Math.sin(elapsed * 3.2) * 0.08;
      beaconRing.scale.setScalar(wave);
      beamMat.opacity = 0.16 + Math.sin(elapsed * 2.5) * 0.06;
    }
  };

  const setDispatchTarget = (pad: HelipadData | null) => {
    if (!pad) {
      dispatchBeacon.visible = false;
      return;
    }
    dispatchBeacon.position.set(pad.x, pad.y, pad.z);
    dispatchBeacon.visible = true;
  };

  const setCompanyName = (companyName: string) => {
    const signCanvas = signTex.image as HTMLCanvasElement | undefined;
    if (signCanvas) {
      const ctx = signCanvas.getContext('2d');
      if (ctx) {
        drawHangarSignCanvas(ctx, companyName);
        signTex.needsUpdate = true;
      }
    }
    const padCanvas = basePadTex.image as HTMLCanvasElement | undefined;
    if (padCanvas) {
      const ctx = padCanvas.getContext('2d');
      if (ctx) {
        drawHelipadCanvas(ctx, padCanvas.width, 'base', companyName);
        basePadTex.needsUpdate = true;
      }
    }
  };

  const setGraphicsQuality = (quality: GraphicsQuality) => {
    currentQuality = quality;
    qualityParticleScale =
      quality === 'ultra' ? 1.0 : quality === 'high' ? 0.92 : quality === 'medium' ? 0.68 : 0.45;
    for (let i = 0; i < cloudEntries.length; i++) {
      cloudEntries[i].group.visible =
        quality === 'low' ? i % 2 === 0 : quality === 'medium' ? i % 4 !== 3 : true;
    }
  };

  return {
    root,
    raycastTargets,
    oceanUniforms,
    radarDish,
    windsock,
    cloudsGroup,
    dispatchBeacon,
    updateDynamicProps,
    setDispatchTarget,
    setCompanyName,
    setGraphicsQuality,
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
    },
  };
}
