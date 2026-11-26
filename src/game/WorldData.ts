import type { BuildingCollider, BuildingSpec, HelipadData, MinimapStaticData } from './types';

export type CoastBiome = 'port' | 'snow' | 'forest' | 'beach' | 'desert';

export const OCEAN_LEVEL = 0;
export const ISLAND_MAX_RADIUS = 2600;
// Navigable airspace radius covering all 3 far offshore Oil Rigs (farthest: Alpha at ~3,436m) + >750m open sea loop margin
export const WORLD_FLIGHT_RADIUS = 4200;
export const WORLD_BOUNDARY_WARN_RADIUS = 3980;

// === BIOME 1: 2x EXPANDED URBAN CENTER, PORT ZONE & STADIUM PARK (Center / West) ===
export const URBAN_BOUNDS = {
  minX: -790,
  maxX: 430,
  minZ: -440,
  maxZ: 510,
};

// Grand Urban Park (West half: ornamental lake & trees; East half: Arena Central Stadium)
export const PARK_RECT = {
  minX: -140,
  maxX: 140,
  minZ: -75,
  maxZ: 115,
};

export const STADIUM_POS = {
  x: 68,
  z: 20,
  rx: 52,
  rz: 64,
};

export const PARK_POND_POS = {
  x: -66,
  z: 20,
  rx: 38,
  rz: 48,
};

// Shared 9x8 flat urban avenue grid (used by WorldBuilder, LivingWorldSystem, SpecialMissionsSystem, TacticalMapModal)
export const URBAN_NS_AXES = [-720, -610, -500, -390, -280, -160, 160, 270, 380] as const;
export const URBAN_EW_AXES = [-380, -280, -180, -90, 130, 230, 330, 440] as const;

export interface UrbanRoadNode {
  x: number;
  z: number;
  neighbors: number[];
}

export const URBAN_ROAD_NODES: UrbanRoadNode[] = (() => {
  const nodes: UrbanRoadNode[] = [];
  const cols = URBAN_NS_AXES.length;
  const rows = URBAN_EW_AXES.length;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const neighbors: number[] = [];
      if (c > 0) neighbors.push(r * cols + (c - 1));
      if (c < cols - 1) neighbors.push(r * cols + (c + 1));
      if (r > 0) neighbors.push((r - 1) * cols + c);
      if (r < rows - 1) neighbors.push((r + 1) * cols + c);
      nodes.push({
        x: URBAN_NS_AXES[c],
        z: URBAN_EW_AXES[r],
        neighbors,
      });
    }
  }
  return nodes;
})();

export const URBAN_ROAD_SEGMENTS: Array<{ x1: number; z1: number; x2: number; z2: number }> = (() => {
  const segs: Array<{ x1: number; z1: number; x2: number; z2: number }> = [];
  const minX = URBAN_NS_AXES[0];
  const maxX = URBAN_NS_AXES[URBAN_NS_AXES.length - 1];
  const minZ = URBAN_EW_AXES[0];
  const maxZ = URBAN_EW_AXES[URBAN_EW_AXES.length - 1];
  for (const x of URBAN_NS_AXES) {
    segs.push({ x1: x, z1: minZ, x2: x, z2: maxZ });
  }
  for (const z of URBAN_EW_AXES) {
    segs.push({ x1: minX, z1: z, x2: maxX, z2: z });
  }
  return segs;
})();

// Coastal Airbase HQ (West-Southwest flat coastal plateau near city & expanded port)
export const AIRBASE_CENTER = {
  x: -910,
  z: 425,
};

// 2x Expanded West Harbor Seawall & Container Port Terminal Quay (6 cranes + 2 warehouses + 2 moored ships)
export const PORT_QUAY_POS = {
  x: -1010,
  z: -20,
  dockY: 3.3,
};

// === BIOME 2: 2x EXPANDED DENSE FOREST, RESERVOIR LAKE, 2 SINUOUS RIVERS & FARM ZONE (East / Interior) ===
export const FOREST_REGION = {
  x: 1030,
  z: 40,
  rx: 690,
  rz: 740,
};

// Interior reservoir lake centered in the eastern forest highlands (closed 360° basin)
export const LAKE_CENTER_X = 930;
export const LAKE_CENTER_Z = -140;
export const LAKE_RADIUS_X = 215;
export const LAKE_RADIUS_Z = 162;
export const LAKE_WATER_LEVEL = 14.0;

// Concrete dam embedded across the south-western embankment of the reservoir
export const DAM_X = 775;
export const DAM_Z = 10;
export const DAM_Y = 25.0;
export const DAM_ROTATION_Y = -0.78;

// Dedicated flat solid plateau for the Dam Overlook Helipad (H-05)
export const DAM_PAD_X = 635;
export const DAM_PAD_Z = 185;
export const DAM_PAD_Y = 21.0;

// Ranger Station, Tall Fire Watchtower & Forest Base Helipad (FLO-1)
export const FOREST_PAD_POS = {
  x: 1125,
  z: 330,
  y: 22.0,
};

// Forest Campsite Clearing with tents & flickering campfire
export const FOREST_CAMP_POS = {
  x: 965,
  z: 375,
};

// Additional Forest Guard Cabins in scenic clearings
export const FOREST_OUTPOST_CABINS = [
  { x: 1265, z: -265, rotY: 0.45 },
  { x: 1455, z: 65, rotY: -0.6 },
  { x: 865, z: -435, rotY: 0.9 },
] as const;

// Dramatic rolling hills & ridges inside the 2x Forest (well clear of rivers, lake & farm)
export const FOREST_HILLS = [
  { x: 1380, z: -230, r: 155, height: 54 },
  { x: 1560, z: 165, r: 165, height: 62 },
  { x: 1185, z: 605, r: 145, height: 48 },
  { x: 1095, z: -415, r: 135, height: 46 },
  { x: 1495, z: -615, r: 140, height: 52 },
  { x: 660, z: -225, r: 115, height: 40 },
] as const;

// === FARM & PLANTATION ZONE ("Fazenda Vale Verde") on Forest Southern Edge ===
export const FARM_REGION = {
  x: 785,
  z: 550,
  rx: 185,
  rz: 145,
  groundY: 14.5,
};

export const FARM_PAD_POS = {
  x: 680,
  z: 540,
  y: 14.5,
};

// === 2 SINUOUS FOREST RIVERS (Carved into terrain + usable for Bambi Bucket & Firekite water scooping!) ===
export interface RiverPoint {
  x: number;
  z: number;
  waterY: number;
}

export interface ForestRiverSpec {
  id: string;
  name: string;
  width: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  points: RiverPoint[];
}

function createRiverSpec(
  id: string,
  name: string,
  width: number,
  controlPoints: RiverPoint[],
  subdivisionsPerSeg = 6
): ForestRiverSpec {
  const points: RiverPoint[] = [];
  for (let i = 0; i < controlPoints.length - 1; i++) {
    const p0 = controlPoints[Math.max(0, i - 1)];
    const p1 = controlPoints[i];
    const p2 = controlPoints[i + 1];
    const p3 = controlPoints[Math.min(controlPoints.length - 1, i + 2)];
    const steps = i === controlPoints.length - 2 ? subdivisionsPerSeg : subdivisionsPerSeg;
    for (let s = 0; s < steps; s++) {
      const t = s / subdivisionsPerSeg;
      const t2 = t * t;
      const t3 = t2 * t;
      // Catmull-Rom smooth spline
      const x =
        0.5 *
        (2 * p1.x +
          (-p0.x + p2.x) * t +
          (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
          (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
      const z =
        0.5 *
        (2 * p1.z +
          (-p0.z + p2.z) * t +
          (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 +
          (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3);
      const waterY = p1.waterY + (p2.waterY - p1.waterY) * t;
      points.push({ x, z, waterY });
    }
  }
  points.push(controlPoints[controlPoints.length - 1]);

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const pt of points) {
    if (pt.x < minX) minX = pt.x;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.z < minZ) minZ = pt.z;
    if (pt.z > maxZ) maxZ = pt.z;
  }
  const pad = width * 2.8;
  return {
    id,
    name,
    width,
    minX: minX - pad,
    maxX: maxX + pad,
    minZ: minZ - pad,
    maxZ: maxZ + pad,
    points,
  };
}

export const FOREST_RIVERS: ForestRiverSpec[] = [
  // River 1: Rio das Esmeraldas — winds from Eastern Reservoir through forest valleys out to SE rocky coast
  createRiverSpec('river_emerald', 'Rio das Esmeraldas', 26, [
    { x: 1095, z: -70, waterY: 13.8 },
    { x: 1210, z: 20, waterY: 12.6 },
    { x: 1320, z: 125, waterY: 11.4 },
    { x: 1275, z: 255, waterY: 10.0 },
    { x: 1355, z: 390, waterY: 8.4 },
    { x: 1470, z: 505, waterY: 6.4 },
    { x: 1585, z: 645, waterY: 3.6 },
    { x: 1715, z: 795, waterY: 0.4 },
  ]),
  // River 2: Rio da Serra — descends from northern alpine foothills through northern forest to East ocean
  createRiverSpec('river_serra', 'Rio da Serra', 22, [
    { x: 760, z: -760, waterY: 16.5 },
    { x: 915, z: -650, waterY: 14.5 },
    { x: 1075, z: -575, waterY: 12.6 },
    { x: 1235, z: -475, waterY: 10.6 },
    { x: 1390, z: -505, waterY: 8.5 },
    { x: 1545, z: -415, waterY: 5.8 },
    { x: 1685, z: -315, waterY: 2.8 },
    { x: 1845, z: -215, waterY: 0.4 },
  ]),
];

export interface RiverSample {
  inside: boolean;
  waterY: number;
  dist: number;
  width: number;
  carveFactor: number;
}

/**
 * Fast distance query against the 2 sinuous forest rivers (with AABB early-exit for 60 FPS terrain queries).
 */
export function getRiverSample(x: number, z: number): RiverSample {
  let bestDistSq = Infinity;
  let bestWaterY = OCEAN_LEVEL;
  let bestWidth = 24;

  for (let r = 0; r < FOREST_RIVERS.length; r++) {
    const river = FOREST_RIVERS[r];
    if (x < river.minX || x > river.maxX || z < river.minZ || z > river.maxZ) continue;
    const pts = river.points;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const abx = b.x - a.x;
      const abz = b.z - a.z;
      const abLenSq = abx * abx + abz * abz;
      let t = abLenSq > 0.001 ? ((x - a.x) * abx + (z - a.z) * abz) / abLenSq : 0;
      if (t < 0) t = 0;
      else if (t > 1) t = 1;
      const px = a.x + abx * t;
      const pz = a.z + abz * t;
      const dx = x - px;
      const dz = z - pz;
      const dSq = dx * dx + dz * dz;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        bestWaterY = a.waterY + (b.waterY - a.waterY) * t;
        bestWidth = river.width;
      }
    }
  }

  if (bestDistSq === Infinity) {
    return { inside: false, waterY: OCEAN_LEVEL, dist: 9999, width: 24, carveFactor: 0 };
  }
  const dist = Math.sqrt(bestDistSq);
  const halfW = bestWidth * 0.5;
  const carveFactor = 1 - smoothstep(halfW * 0.68, halfW * 2.35, dist);
  return {
    inside: dist <= halfW * 1.04,
    waterY: bestWaterY,
    dist,
    width: bestWidth,
    carveFactor,
  };
}

// === BIOME 3: 2x EXPANDED SNOW MOUNTAIN RANGE & LARGER ALPINE VILLAGE (North Massif) ===
export const SNOW_REGION = {
  x: 45,
  z: -1290,
  rx: 920,
  rz: 660,
};

export const SNOW_PEAK_POS = {
  x: 170,
  z: -1385,
  summitY: 138.0,
};

export const SKI_BASE_POS = {
  x: -30,
  z: -910,
  baseY: 34.0,
};

// 12 Sculpted Alpine Peaks & Deep Glacial Valleys
export const SNOW_PEAKS = [
  { x: 170, z: -1385, r: 215, height: 138 },    // Main Pine Peak Summit (H-06)
  { x: 615, z: -1180, r: 195, height: 114 },    // East Alpine Horn (Summit Radar Station)
  { x: -345, z: -1265, r: 205, height: 122 },   // West Glacier Peak
  { x: 90, z: -1645, r: 185, height: 134 },     // North Ridge Crest
  { x: 845, z: -960, r: 165, height: 94 },      // Far East Spire
  { x: -640, z: -1010, r: 165, height: 88 },    // West Snow Shoulder
  { x: -380, z: -1560, r: 170, height: 118 },   // North-West Summit
  { x: 435, z: -1520, r: 175, height: 126 },    // North-East Icehorn
  { x: -125, z: -1495, r: 165, height: 112 },   // Central Glacier Spire
  { x: -555, z: -1330, r: 155, height: 102 },   // Western Frost Peak
  { x: 355, z: -1035, r: 150, height: 84 },     // Ski Ridge East
  { x: -245, z: -1045, r: 148, height: 82 },    // Ski Ridge West
] as const;

// High-altitude Radar & Antenna Station atop East Alpine Horn
export const RADAR_PEAK_POS = {
  x: 615,
  z: -1180,
};

// === BIOME 4: 2x EXPANDED DESERT, 9 CANYON MESAS, WIND FARM & SOLAR POWER STATION (South-West) ===
export const DESERT_REGION = {
  x: -780,
  z: 1120,
  rx: 710,
  rz: 540,
};

export const DESERT_PAD_POS = {
  x: -710,
  z: 985,
  y: 17.0,
};

// Large Desert Solar Power Station & Second Desert Helipad (DES-2)
export const SOLAR_STATION_POS = {
  x: -385,
  z: 1095,
  y: 16.0,
};

export const SOLAR_PAD_POS = {
  x: -305,
  z: 1030,
  y: 16.0,
};

// 9 Red Sandstone Canyon Mesas / Plateaus & Buttes
export const DESERT_MESAS = [
  { x: -1105, z: 830, rx: 108, rz: 78, topY: 54 },
  { x: -415, z: 1275, rx: 115, rz: 82, topY: 50 },
  { x: -955, z: 1240, rx: 98, rz: 68, topY: 44 },
  { x: -670, z: 1410, rx: 104, rz: 72, topY: 48 },
  { x: -290, z: 865, rx: 86, rz: 60, topY: 40 },
  { x: -1240, z: 1060, rx: 96, rz: 70, topY: 46 },
  { x: -1010, z: 1475, rx: 88, rz: 64, topY: 42 },
  { x: -140, z: 1355, rx: 82, rz: 58, topY: 38 },
  { x: -555, z: 795, rx: 76, rz: 54, topY: 36 },
] as const;

// Expanded Wind Farm (11 Giant Rotating White Wind Turbines along the windswept western desert ridges)
export const WIND_TURBINES = [
  { x: -1065, z: 970 },
  { x: -1185, z: 1055 },
  { x: -1085, z: 1170 },
  { x: -925, z: 1355 },
  { x: -1210, z: 1245 },
  { x: -1330, z: 945 },
  { x: -1355, z: 1135 },
  { x: -1140, z: 1385 },
  { x: -835, z: 1515 },
  { x: -970, z: 865 },
  { x: -1265, z: 835 },
] as const;

// === BIOME 5: 2x EXPANDED COSTA DO SOL BEACH, 2 RESORTS, 2 PIERS & LIGHTHOUSE (South-East Coastal Bay ONLY) ===
export const BEACH_ANGLE_START = 0.66;
export const BEACH_ANGLE_END = 1.46;

export const BEACH_REGION = {
  x: 740,
  z: 1315,
  rx: 580,
  rz: 295,
  angleStart: BEACH_ANGLE_START,
  angleEnd: BEACH_ANGLE_END,
};

export const BEACH_PAD_POS = {
  x: 830,
  z: 1245,
  y: 3.2,
};

export const RESORT_HOTELS = [
  { x: 645, z: 1295, rotY: -0.36 },
  { x: 1035, z: 1125, rotY: -0.68 },
] as const;

export const RESORT_HOTEL_POS = RESORT_HOTELS[0];

// === THREE FAR OFFSHORE OIL RIGS SPREAD AROUND THE OCEAN (>1.5 km past the 2x island coast) ===
export interface OilRigSpec {
  id: string;
  padId: string;
  name: string;
  shortCode: string;
  district: string;
  x: number;
  z: number;
  deckY: number;
  padX: number;
  padY: number;
  padZ: number;
}

export const OIL_RIGS: OilRigSpec[] = [
  {
    id: 'oilrig_alpha',
    padId: 'pad_oilrig',
    name: 'Plataforma Oceânica Alpha',
    shortCode: 'OIL-1',
    district: 'Alto-Mar Sudeste',
    x: 2780,
    z: 2020,
    deckY: 19.5,
    padX: 2764,
    padY: 22.8,
    padZ: 2034,
  },
  {
    id: 'oilrig_bravo',
    padId: 'pad_oilrig_bravo',
    name: 'Plataforma Oceânica Bravo',
    shortCode: 'OIL-2',
    district: 'Alto-Mar Nordeste',
    x: 2380,
    z: -2260,
    deckY: 19.5,
    padX: 2364,
    padY: 22.8,
    padZ: -2246,
  },
  {
    id: 'oilrig_charlie',
    padId: 'pad_oilrig_charlie',
    name: 'Plataforma Oceânica Charlie',
    shortCode: 'OIL-3',
    district: 'Alto-Mar Oeste',
    x: -2680,
    z: 980,
    deckY: 19.5,
    padX: -2664,
    padY: 22.8,
    padZ: 994,
  },
];

// Backward-compatible primary Oil Rig alias (Oil Rig Alpha)
export const OIL_RIG_POS = OIL_RIGS[0];

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function normalizeAngleDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Classifies which coastal biome owns a given polar angle around the island.
 * Beach sand ONLY exists in the dedicated South-East bay ("Costa do Sol").
 */
export function getCoastBiome(angle: number): CoastBiome {
  if (angle >= BEACH_ANGLE_START && angle < BEACH_ANGLE_END) return 'beach';
  if (angle >= BEACH_ANGLE_END && angle <= 2.58) return 'desert';
  if (angle > 2.58 || angle < -2.48) return 'port';
  if (angle >= -2.48 && angle < -0.78) return 'snow';
  return 'forest';
}

/**
 * Smooth 0..1 mask indicating how strongly (x, z) is inside the Costa do Sol sandy beach sector.
 */
export function getBeachSectorWeight(angle: number): number {
  const enter = smoothstep(BEACH_ANGLE_START - 0.08, BEACH_ANGLE_START + 0.08, angle);
  const exit = 1 - smoothstep(BEACH_ANGLE_END - 0.08, BEACH_ANGLE_END + 0.08, angle);
  return enter * exit;
}

/**
 * Smooth 0..1 desert biome influence weight at (x, z).
 */
export function getDesertWeight(x: number, z: number): number {
  const dx = (x - DESERT_REGION.x) / DESERT_REGION.rx;
  const dz = (z - DESERT_REGION.z) / DESERT_REGION.rz;
  const d = Math.hypot(dx, dz);
  return 1 - smoothstep(0.68, 1.18, d);
}

/**
 * Smooth 0..1 snow alpine range influence weight at (x, z).
 */
export function getSnowWeight(x: number, z: number): number {
  const dx = (x - SNOW_REGION.x) / SNOW_REGION.rx;
  const dz = (z - SNOW_REGION.z) / SNOW_REGION.rz;
  const d = Math.hypot(dx, dz);
  return 1 - smoothstep(0.62, 1.14, d);
}

/**
 * Smooth 0..1 dense eastern forest influence weight at (x, z).
 */
export function getForestWeight(x: number, z: number): number {
  const dx = (x - FOREST_REGION.x) / FOREST_REGION.rx;
  const dz = (z - FOREST_REGION.z) / FOREST_REGION.rz;
  const d = Math.hypot(dx, dz);
  return 1 - smoothstep(0.64, 1.16, d);
}

/**
 * Smooth 0..1 farm/plantation plateau weight at (x, z).
 */
export function getFarmWeight(x: number, z: number): number {
  const dx = (x - FARM_REGION.x) / FARM_REGION.rx;
  const dz = (z - FARM_REGION.z) / FARM_REGION.rz;
  const d = Math.hypot(dx, dz);
  return 1 - smoothstep(0.76, 1.15, d);
}

/**
 * Deterministic organic 2x mega-expanded island coastline radius (~4x land area).
 * Features a dramatic North Alpine Peninsula bulge and a West Harbor Bay indent beside the City Port.
 */
export function getIslandCoastRadius(angle: number): number {
  const base = 1680;
  const shape =
    85 * Math.cos(angle * 2 - 0.5) +
    60 * Math.sin(angle * 3 + 0.7) +
    42 * Math.cos(angle * 5 - 0.9) +
    22 * Math.sin(angle * 7 + 0.4);

  // North Alpine Peninsula bulge hosting the 12-peak Snow Mountain Range
  const dNorth = normalizeAngleDiff(angle, -1.52);
  const alpinePeninsula = 310 * Math.exp(-(dNorth * dNorth) / 0.30);

  // West Harbor Bay indent pulling the coastline right up to the 2x Urban Port Seawall
  const dWest = normalizeAngleDiff(angle, Math.PI);
  const harborIndent = -650 * Math.exp(-(dWest * dWest) / 0.16);

  return base + shape + alpinePeninsula + harborIndent;
}

// Compute 2 wooden beach piers directly from the real South-East bay coastline
function createBeachPier(angle: number, lengthOut: number) {
  const shoreR = getIslandCoastRadius(angle) - 24;
  const tipR = getIslandCoastRadius(angle) + lengthOut;
  return {
    angle,
    x1: Math.cos(angle) * shoreR,
    z1: Math.sin(angle) * shoreR,
    x2: Math.cos(angle) * tipR,
    z2: Math.sin(angle) * tipR,
    deckY: 2.5,
  };
}

export const BEACH_PIERS = [
  createBeachPier(1.15, 92),
  createBeachPier(0.90, 86),
] as const;

export const BEACH_PIER = BEACH_PIERS[0];

// Classic Red & White Lighthouse perched on the rocky headland just east of Costa do Sol Beach
const LIGHTHOUSE_ANGLE = 0.61;
const LIGHTHOUSE_R = getIslandCoastRadius(LIGHTHOUSE_ANGLE) - 34;
export const LIGHTHOUSE_POS = {
  x: Math.cos(LIGHTHOUSE_ANGLE) * LIGHTHOUSE_R,
  z: Math.sin(LIGHTHOUSE_ANGLE) * LIGHTHOUSE_R,
};

/**
 * Shared polar contour wobble used by both the heightmap basin and the 3D lake water mesh
 * so the water shoreline matches the terrain crater cleanly around 360 degrees.
 */
export function getLakeWobble(angle: number): number {
  return 1 + 0.08 * Math.sin(angle * 3 + 0.4) + 0.04 * Math.cos(angle * 5 - 0.8);
}

/**
 * Computes normalized distance to the interior reservoir lake (<= 1 is inside lake).
 */
export function getLakeDistanceFactor(x: number, z: number): number {
  const dx = (x - LAKE_CENTER_X) / LAKE_RADIUS_X;
  const dz = (z - LAKE_CENTER_Z) / LAKE_RADIUS_Z;
  const angle = Math.atan2(dz, dx);
  return Math.sqrt(dx * dx + dz * dz) / getLakeWobble(angle);
}

/**
 * Analytical deterministic terrain height at any world (x, z).
 * Guarantees terrain mesh, rivers, building foundations, trees, farm, solar panels, cacti, palms,
 * wind turbines, lighthouse, helipads, and physics match identically with zero floating props.
 */
export function getTerrainHeight(x: number, z: number): number {
  const dist = Math.hypot(x, z);
  const angle = Math.atan2(z, x);
  const coastR = getIslandCoastRadius(angle);

  // Beyond outer seabed
  if (dist > coastR + 145) {
    return -12.0;
  }

  // Varied coastline profile: gentle sandy slope ONLY in Costa do Sol beach bay;
  // steep sea cliffs / rocky walls / urban seawall everywhere else.
  const beachW = getBeachSectorWeight(angle);
  const innerDrop = 34 + beachW * 70; // 104m gentle sandy slope on beach vs 34m sharp cliff elsewhere
  const outerDrop = 14 + beachW * 26; // 40m shallow beach vs 14m steep ocean plunge elsewhere

  const landFactor = 1 - smoothstep(coastR - innerDrop, coastR + outerDrop, dist);
  const seabed = -12.0 * smoothstep(coastR - 14, coastR + 105, dist);

  if (landFactor <= 0.001) {
    return seabed;
  }

  // Base island elevation: low sandy shore at beach, elevated cliff shelves elsewhere
  const coastBiome = getCoastBiome(angle);
  const cliffBaseElevation =
    beachW > 0.5
      ? 3.1
      : coastBiome === 'port'
      ? 3.1
      : coastBiome === 'snow'
      ? 17.5
      : coastBiome === 'desert'
      ? 13.5
      : 12.2;

  const baseElev = cliffBaseElevation * (1 - beachW) + 3.1 * beachW;
  let h = baseElev * landFactor + seabed * (1 - landFactor);

  const macroNoise =
    Math.sin(x * 0.0046 + 0.4) * Math.cos(z * 0.0052 - 0.3) * 0.5 +
    Math.sin((x + z) * 0.0072) * 0.3 +
    Math.cos((x - z) * 0.012) * 0.2;

  // === EAST DENSE FOREST ROLLING HILLS & DRAMATIC RIDGES ===
  const forestW = getForestWeight(x, z) * landFactor;
  if (forestW > 0.001) {
    const forestHills = (17 + macroNoise * 18 + Math.sin(x * 0.010 - z * 0.009) * 6.5) * forestW;
    h += Math.max(0, forestHills);

    let hillBoost = 0;
    for (let i = 0; i < FOREST_HILLS.length; i++) {
      const fh = FOREST_HILLS[i];
      const fd = Math.hypot(x - fh.x, z - fh.z);
      if (fd < fh.r * 2.2) {
        const sigma = fh.r * 0.65;
        const c = (fh.height - 14) * Math.exp(-(fd * fd) / (2 * sigma * sigma));
        hillBoost = Math.max(hillBoost, c);
      }
    }
    h += hillBoost * landFactor;
  }

  // === SOUTH-WEST DESERT DUNES, ROLLING MOUNDS & 9 STEPPED CANYON MESAS ===
  const desertW = getDesertWeight(x, z) * landFactor;
  if (desertW > 0.001) {
    const dunes =
      (Math.sin(x * 0.012 + z * 0.0075) * 5.2 +
        Math.cos(x * 0.0085 - z * 0.0135) * 3.8 +
        6.2) *
      desertW;
    h += Math.max(0, dunes);

    for (const mesa of DESERT_MESAS) {
      const md = Math.hypot((x - mesa.x) / mesa.rx, (z - mesa.z) / mesa.rz);
      if (md < 1.55) {
        const mesaLift = 1 - smoothstep(0.76, 1.32, md);
        const terrace = 1 - smoothstep(1.12, 1.48, md);
        const targetMesaH = Math.max(h, mesa.topY * mesaLift + 8.5 * terrace * (1 - mesaLift));
        h = h * (1 - mesaLift * 0.94) + targetMesaH * (mesaLift * 0.94);
      }
    }
  }

  // === FLATTEN 2x EXPANDED URBAN CENTER PLATEAU CLEANLY TO y = 3.0m ===
  const urbanHalfW = (URBAN_BOUNDS.maxX - URBAN_BOUNDS.minX) * 0.5;
  const urbanHalfD = (URBAN_BOUNDS.maxZ - URBAN_BOUNDS.minZ) * 0.5;
  const urbanCx = (URBAN_BOUNDS.minX + URBAN_BOUNDS.maxX) * 0.5;
  const urbanCz = (URBAN_BOUNDS.minZ + URBAN_BOUNDS.maxZ) * 0.5;

  const cityMask =
    (1 - smoothstep(urbanHalfW - 14, urbanHalfW + 80, Math.abs(x - urbanCx))) *
    (1 - smoothstep(urbanHalfD - 14, urbanHalfD + 80, Math.abs(z - urbanCz))) *
    landFactor;
  if (cityMask > 0.001) {
    const urbanBlend = smoothstep(0.05, 0.72, cityMask);
    h = h * (1 - urbanBlend) + 3.0 * urbanBlend;
  }

  // Flatten 2x West Harbor Port apron between city west edge and concrete seawall
  const portMask =
    (1 - smoothstep(95, 155, Math.abs(x - -905))) *
    (1 - smoothstep(260, 340, Math.abs(z - -15))) *
    landFactor;
  if (portMask > 0.001) {
    const pb = smoothstep(0.05, 0.68, portMask);
    h = h * (1 - pb) + 3.0 * pb;
  }

  // Flatten Coastal Airbase HQ plateau cleanly to y = 2.6m
  const baseDist = Math.hypot(x - AIRBASE_CENTER.x, z - AIRBASE_CENTER.z);
  if (baseDist < 140) {
    const baseBlend = 1 - smoothstep(72, 134, baseDist);
    h = h * (1 - baseBlend) + 2.6 * baseBlend;
  }

  // Flatten Costa do Sol Beach terrace & 2 Resort footprints cleanly behind sandy shore
  if (beachW > 0.01) {
    const beachStrip = smoothstep(coastR - 430, coastR - 110, dist) * beachW * landFactor;
    h = h * (1 - beachStrip * 0.88) + 3.2 * (beachStrip * 0.88);
  }

  // Rocky headland shelf for the Lighthouse just east of Costa do Sol
  const lhDist = Math.hypot(x - LIGHTHOUSE_POS.x, z - LIGHTHOUSE_POS.z);
  if (lhDist < 44) {
    const lhBlend = 1 - smoothstep(18, 42, lhDist);
    h = h * (1 - lhBlend) + 13.5 * lhBlend;
  }

  // === CARVE CLOSED 360° RESERVOIR BASIN & CONTINUOUS CONTAINMENT RIM (East Forest) ===
  const lakeFactor = getLakeDistanceFactor(x, z);
  if (lakeFactor < 1.65) {
    const rimOuterMask = 1 - smoothstep(1.22, 1.65, lakeFactor);
    const lakeAng = Math.atan2(
      (z - LAKE_CENTER_Z) / LAKE_RADIUS_Z,
      (x - LAKE_CENTER_X) / LAKE_RADIUS_X
    );
    const rimTargetHeight =
      22.5 + 2.8 * Math.sin(lakeAng * 2 - 0.5) + 1.8 * Math.cos(lakeAng * 4 + 0.9);
    const raisedRim = Math.max(h, rimTargetHeight);
    h = h * (1 - rimOuterMask) + raisedRim * rimOuterMask;

    const basinBlend = 1 - smoothstep(0.76, 1.12, lakeFactor);
    h = h * (1 - basinBlend) + 6.2 * basinBlend;
  }

  // === NORTH SNOW MOUNTAIN RANGE (12 Sculpted Alpine Peaks + Deep Glacial Valleys) ===
  const snowW = getSnowWeight(x, z) * landFactor;
  if (snowW > 0.001) {
    let alpineSum = 0;
    for (let i = 0; i < SNOW_PEAKS.length; i++) {
      const p = SNOW_PEAKS[i];
      const pd = Math.hypot((x - p.x) * 0.94, (z - p.z) * 1.02);
      const sigma = p.r * 0.68;
      const contrib = (p.height - 13) * Math.exp(-(pd * pd) / (2 * sigma * sigma));
      alpineSum = Math.max(alpineSum, contrib) + Math.min(alpineSum, contrib) * 0.28;
    }
    const alpineRugged =
      (Math.sin(x * 0.022) * Math.cos(z * 0.020) * 5.2 + Math.cos((x - z) * 0.016) * 3.4) * snowW;
    h += Math.max(0, (alpineSum + alpineRugged) * landFactor);
  }

  // === CARVE 2 SINUOUS FOREST RIVER VALLEYS CLEANLY BELOW THEIR WATER LEVEL ===
  const riverSample = getRiverSample(x, z);
  if (riverSample.carveFactor > 0.001) {
    const halfW = riverSample.width * 0.5;
    const channelBlend = 1 - smoothstep(halfW * 0.65, halfW * 1.38, riverSample.dist);
    const bankBlend = riverSample.carveFactor * (1 - channelBlend);
    const bankTargetY = riverSample.waterY + 2.8;
    const bedTargetY = riverSample.waterY - 4.2;
    if (bankBlend > 0.001) {
      h = h * (1 - bankBlend * 0.72) + Math.min(h, bankTargetY) * (bankBlend * 0.72);
    }
    if (channelBlend > 0.001) {
      h = h * (1 - channelBlend) + bedTargetY * channelBlend;
    }
  }

  // === DEDICATED FLAT HELIPAD, FARM & LANDMARK PLATEAUS ===
  // 0. Farm / Plantation Zone ("Fazenda Vale Verde")
  const farmW = getFarmWeight(x, z);
  if (farmW > 0.001) {
    const fb = smoothstep(0.05, 0.72, farmW);
    h = h * (1 - fb) + FARM_REGION.groundY * fb;
  }

  // 1. Pine Peak Summit Helipad (H-06)
  const summitPadDist = Math.hypot(x - SNOW_PEAK_POS.x, z - SNOW_PEAK_POS.z);
  if (summitPadDist < 46) {
    const summitBlend = 1 - smoothstep(18, 44, summitPadDist);
    h = h * (1 - summitBlend) + SNOW_PEAK_POS.summitY * summitBlend;
  }

  // 1B. East Alpine Horn Summit Radar Station pad
  const radarDist = Math.hypot(x - RADAR_PEAK_POS.x, z - RADAR_PEAK_POS.z);
  if (radarDist < 36) {
    const rb = 1 - smoothstep(14, 34, radarDist);
    h = h * (1 - rb) + 112.0 * rb;
  }

  // 2. Ski Resort Village & Slope Base plateau (H-07 + Larger 12-Chalet Alpine Village)
  const skiBaseDist = Math.hypot(x - SKI_BASE_POS.x, z - SKI_BASE_POS.z);
  if (skiBaseDist < 105) {
    const skiBlend = 1 - smoothstep(62, 102, skiBaseDist);
    h = h * (1 - skiBlend) + SKI_BASE_POS.baseY * skiBlend;
  }

  // 3. Dam Overlook Helipad (H-05)
  const damPadDist = Math.hypot(x - DAM_PAD_X, z - DAM_PAD_Z);
  if (damPadDist < 48) {
    const damBlend = 1 - smoothstep(22, 46, damPadDist);
    h = h * (1 - damBlend) + DAM_PAD_Y * damBlend;
  }

  // 4. Dense Forest Ranger Base Helipad (FLO-1)
  const forestPadDist = Math.hypot(x - FOREST_PAD_POS.x, z - FOREST_PAD_POS.z);
  if (forestPadDist < 54) {
    const fb = 1 - smoothstep(26, 52, forestPadDist);
    h = h * (1 - fb) + FOREST_PAD_POS.y * fb;
  }

  // 4B. Forest Campsite clearing
  const campDist = Math.hypot(x - FOREST_CAMP_POS.x, z - FOREST_CAMP_POS.z);
  if (campDist < 36) {
    const cb = 1 - smoothstep(16, 34, campDist);
    h = h * (1 - cb) + 20.0 * cb;
  }

  // 5. Desert Canyon Outpost Helipad (DES-1) & Solar Power Station (DES-2)
  const desertPadDist = Math.hypot(x - DESERT_PAD_POS.x, z - DESERT_PAD_POS.z);
  if (desertPadDist < 58) {
    const db = 1 - smoothstep(28, 56, desertPadDist);
    h = h * (1 - db) + DESERT_PAD_POS.y * db;
  }
  const solarDist = Math.hypot(x - SOLAR_STATION_POS.x, z - SOLAR_STATION_POS.z);
  if (solarDist < 125) {
    const sb = 1 - smoothstep(78, 122, solarDist);
    h = h * (1 - sb) + SOLAR_STATION_POS.y * sb;
  }

  // 6. Costa do Sol Beach Helipad (SOL-1) & 2 Resort Hotel terraces
  const beachPadDist = Math.hypot(x - BEACH_PAD_POS.x, z - BEACH_PAD_POS.z);
  if (beachPadDist < 48) {
    const bb = 1 - smoothstep(20, 46, beachPadDist);
    h = h * (1 - bb) + BEACH_PAD_POS.y * bb;
  }
  for (const res of RESORT_HOTELS) {
    const rDist = Math.hypot(x - res.x, z - res.z);
    if (rDist < 56) {
      const rsb = 1 - smoothstep(30, 54, rDist);
      h = h * (1 - rsb) + 3.3 * rsb;
    }
  }

  return h;
}

/**
 * Returns the exact water surface Y if (x, z) is over ocean, interior lake, or either forest river; otherwise null.
 */
export function getWaterLevelAt(x: number, z: number): number | null {
  const terrain = getTerrainHeight(x, z);
  if (terrain <= OCEAN_LEVEL + 0.08) return OCEAN_LEVEL;
  if (getLakeDistanceFactor(x, z) < 1.0 && terrain < LAKE_WATER_LEVEL) return LAKE_WATER_LEVEL;
  const river = getRiverSample(x, z);
  if (river.inside && terrain < river.waterY) return river.waterY;
  return null;
}

/**
 * Returns the surface water or land height at (x, z) for shadows, landings, and radar altimeter.
 */
export function getSurfaceHeightAt(x: number, z: number): number {
  const terrain = getTerrainHeight(x, z);
  let surface = Math.max(terrain, OCEAN_LEVEL);
  if (getLakeDistanceFactor(x, z) < 1.02) {
    surface = Math.max(surface, LAKE_WATER_LEVEL);
  }
  const river = getRiverSample(x, z);
  if (river.inside) {
    surface = Math.max(surface, river.waterY);
  }
  return surface;
}

export function isOverWater(x: number, z: number): boolean {
  return getWaterLevelAt(x, z) !== null;
}

// === 2x EXPANDED CITY SKYLINE (~138 Curated Buildings + Tall Pointed Spire Skyscrapers + 9 Rooftop Helipads) ===
// NS Axes: [-720, -610, -500, -390, -280, -160, 160, 270, 380]
// Col centers: -755, -665, -555, -445, -335, -220, (Park band: -110, -40, 40, 110), 215, 325, 412
// EW Axes: [-380, -280, -180, -90, 130, 230, 330, 440]
// Row centers: -412, -330, -230, -135, (Park band: -35, 20, 75), 180, 280, 385, 476
const CORE_LANDMARK_BUILDINGS: BuildingSpec[] = [
  // === 9 SIGNATURE SKYSCRAPERS WITH ROOFTOP HELIPADS ===
  {
    id: 'b_central_tower',
    x: 215,
    z: 20,
    width: 38,
    depth: 38,
    height: 112,
    color: 0x9cb4ce,
    accentColor: 0x1d5488,
    style: 'tower',
    hasHelipad: true,
    helipadName: 'Torre Central',
    helipadCode: 'H-01',
    district: 'Centro Financeiro',
  },
  {
    id: 'b_metro_hospital',
    x: -220,
    z: 180,
    width: 38,
    depth: 34,
    height: 46,
    color: 0xc5d0da,
    accentColor: 0xd9383a,
    style: 'hospital',
    hasHelipad: true,
    helipadName: 'Hospital Metropolitano',
    helipadCode: 'H-02',
    district: 'Setor Médico',
  },
  {
    id: 'b_harbor_tower',
    x: -555,
    z: 20,
    width: 36,
    depth: 34,
    height: 68,
    color: 0x94b8c4,
    accentColor: 0x167482,
    style: 'tower',
    hasHelipad: true,
    helipadName: 'Torre do Porto',
    helipadCode: 'H-03',
    district: 'Zona Portuária',
  },
  {
    id: 'b_park_plaza',
    x: -40,
    z: -135,
    width: 38,
    depth: 32,
    height: 62,
    color: 0xc9ae8c,
    accentColor: 0xc26528,
    style: 'office',
    hasHelipad: true,
    helipadName: 'Mirante do Parque',
    helipadCode: 'H-04',
    district: 'Parque Norte',
  },
  {
    id: 'b_apex_tower',
    x: 215,
    z: 180,
    width: 36,
    depth: 36,
    height: 94,
    color: 0x92a9c4,
    accentColor: 0x1d4e89,
    style: 'tower',
    hasHelipad: true,
    helipadName: 'Torre Apex Financeira',
    helipadCode: 'H-08',
    district: 'Avenida Financeira',
  },
  {
    id: 'b_south_hub',
    x: -40,
    z: 280,
    width: 36,
    depth: 32,
    height: 54,
    color: 0xb6c4cf,
    accentColor: 0x2c6e8f,
    style: 'office',
    hasHelipad: true,
    helipadName: 'Centro Executivo Sul',
    helipadCode: 'H-09',
    district: 'Distrito Sul',
  },
  {
    id: 'b_zenith_tower',
    x: 215,
    z: -135,
    width: 38,
    depth: 36,
    height: 124,
    color: 0x8da6c2,
    accentColor: 0x1b4775,
    style: 'tower',
    hasHelipad: true,
    helipadName: 'Torre Zenith',
    helipadCode: 'H-10',
    district: 'Núcleo Financeiro',
  },
  {
    id: 'b_atlantic_tower',
    x: 325,
    z: 20,
    width: 36,
    depth: 36,
    height: 108,
    color: 0x96b3c6,
    accentColor: 0x185f78,
    style: 'tower',
    hasHelipad: true,
    helipadName: 'Torre Atlântico',
    helipadCode: 'H-11',
    district: 'Eixo Leste',
  },
  {
    id: 'b_metropole_tower',
    x: -335,
    z: -135,
    width: 34,
    depth: 34,
    height: 96,
    color: 0x9bb0c4,
    accentColor: 0x2d5a84,
    style: 'tower',
    hasHelipad: true,
    helipadName: 'Torre Metrópole',
    helipadCode: 'H-12',
    district: 'Midtown Oeste',
  },

  // === ICONIC SUPER-TALL POINTED & SPIRE FINANCIAL SKYSCRAPERS (115m–166m + tall illuminated spires) ===
  {
    id: 'b_spire_solaris',
    x: 215,
    z: -35,
    width: 36,
    depth: 36,
    height: 162,
    color: 0x8ba7c4,
    accentColor: 0x1a4978,
    style: 'tower',
    crownStyle: 'needle',
    spireHeight: 42,
  },
  {
    id: 'b_spire_obsidian',
    x: 215,
    z: 75,
    width: 36,
    depth: 36,
    height: 148,
    color: 0x7e94ad,
    accentColor: 0x1e4066,
    style: 'tower',
    crownStyle: 'stepped_spire',
    spireHeight: 36,
  },
  {
    id: 'b_spire_meridian',
    x: 325,
    z: -35,
    width: 34,
    depth: 34,
    height: 138,
    color: 0x95b2c9,
    accentColor: 0x225a82,
    style: 'tower',
    crownStyle: 'pyramid',
    spireHeight: 30,
  },
  {
    id: 'b_spire_horizon',
    x: 325,
    z: 75,
    width: 34,
    depth: 34,
    height: 128,
    color: 0xa2b6c8,
    accentColor: 0x2a5f88,
    style: 'tower',
    crownStyle: 'stepped_spire',
    spireHeight: 28,
  },
  {
    id: 'b_spire_vanguard',
    x: -220,
    z: 20,
    width: 36,
    depth: 36,
    height: 144,
    color: 0x8ea9c4,
    accentColor: 0x1e4d7a,
    style: 'tower',
    crownStyle: 'needle',
    spireHeight: 38,
  },
  {
    id: 'b_spire_kronos',
    x: -220,
    z: -35,
    width: 34,
    depth: 34,
    height: 126,
    color: 0x98b0c7,
    accentColor: 0x28567d,
    style: 'tower',
    crownStyle: 'pyramid',
    spireHeight: 28,
  },
  {
    id: 'b_spire_aurora',
    x: 215,
    z: -230,
    width: 34,
    depth: 34,
    height: 118,
    color: 0x9cb4c9,
    accentColor: 0x2c5c85,
    style: 'tower',
    crownStyle: 'stepped_spire',
    spireHeight: 26,
  },
  {
    id: 'b_spire_westgate',
    x: -335,
    z: 20,
    width: 34,
    depth: 34,
    height: 114,
    color: 0x96b0c4,
    accentColor: 0x245a7c,
    style: 'tower',
    crownStyle: 'pyramid',
    spireHeight: 24,
  },
  {
    id: 'b_spire_emerald',
    x: 40,
    z: -135,
    width: 34,
    depth: 32,
    height: 120,
    color: 0x92b4ba,
    accentColor: 0x1e6b73,
    style: 'tower',
    crownStyle: 'needle',
    spireHeight: 32,
  },
  {
    id: 'b_spire_capital',
    x: 40,
    z: 180,
    width: 34,
    depth: 32,
    height: 112,
    color: 0x9cb7c0,
    accentColor: 0x267478,
    style: 'tower',
    crownStyle: 'stepped_spire',
    spireHeight: 26,
  },
];

// Procedurally fill the remaining 9x8 urban blocks cleanly with deterministic architectural zoning
export const BUILDING_SPECS: BuildingSpec[] = (() => {
  const list: BuildingSpec[] = [...CORE_LANDMARK_BUILDINGS];
  const occupied = new Set<string>(
    CORE_LANDMARK_BUILDINGS.map((b) => `${Math.round(b.x / 20)},${Math.round(b.z / 20)}`)
  );

  const palettes: Array<{ color: number; accent: number; style: BuildingSpec['style'] }> = [
    { color: 0x9cb3c9, accent: 0x2c5c85, style: 'tower' },
    { color: 0xadb9c4, accent: 0x3b6384, style: 'office' },
    { color: 0xc2aa90, accent: 0x8f5638, style: 'office' },
    { color: 0xaab7c4, accent: 0x355c7d, style: 'office' },
    { color: 0xa4bac7, accent: 0x2a6b7c, style: 'office' },
    { color: 0xc4aa92, accent: 0x9c5a38, style: 'residential' },
    { color: 0xc7af96, accent: 0xb05e3a, style: 'residential' },
    { color: 0xb3c2cc, accent: 0x426b8c, style: 'civic' },
    { color: 0xc99c87, accent: 0xb24e3e, style: 'residential' },
    { color: 0xadb9b2, accent: 0x477061, style: 'civic' },
    { color: 0xcab394, accent: 0xb06e3a, style: 'residential' },
    { color: 0x9db4c4, accent: 0x2b627d, style: 'tower' },
  ];

  // Deterministic pseudo-random helper
  const hash = (a: number, b: number) => {
    const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
    return s - Math.floor(s);
  };

  // Standard block slot centers strictly between avenues
  const colSlots = [-755, -665, -555, -445, -335, -220, -110, -40, 40, 110, 215, 325, 412];
  const rowSlots = [-412, -330, -230, -135, -35, 20, 75, 180, 280, 385, 476];

  let idx = 0;
  for (let c = 0; c < colSlots.length; c++) {
    const bx = colSlots[c];
    for (let r = 0; r < rowSlots.length; r++) {
      const bz = rowSlots[r];

      // Keep Grand Central Park & Arena Central Stadium completely clear
      if (bx > -158 && bx < 158 && bz > -88 && bz < 128) continue;

      // Keep West Harbor Port edge open on far NW/SW corners
      if (bx < -700 && (bz < -260 || bz > 260)) continue;
      if (bx > 395 && (bz < -280 || bz > 340)) continue;

      // Skip if landmark already occupies this block
      const key = `${Math.round(bx / 20)},${Math.round(bz / 20)}`;
      if (occupied.has(key)) continue;

      const hVal = hash(bx, bz);
      // Leave occasional small breathing plazas on outer fringes for organic skyline silhouette
      const distFromCore = Math.hypot((bx - 60) * 0.85, bz);
      if (distFromCore > 480 && hVal < 0.22) continue;

      // Height envelope: dramatic high-rises in Financial Core & Midtown, medium downtown, lower outer districts
      const finPull = Math.exp(-Math.pow((bx - 215) / 230, 2) - Math.pow(bz / 260, 2));
      const midPull = Math.exp(-Math.pow((bx + 220) / 260, 2) - Math.pow(bz / 260, 2));
      const coreFactor = Math.max(finPull, midPull * 0.84);

      const baseH = 18 + coreFactor * 74 + hVal * (14 + coreFactor * 28);
      const height = Math.round(Math.max(15, Math.min(106, baseH)));

      const pal = palettes[Math.floor(hash(bx * 1.7, bz * 2.3) * palettes.length)];
      const isNarrowEdge = Math.abs(bx) > 700 || bx > 395 || bz < -390 || bz > 450;
      const width = isNarrowEdge ? 26 : 30 + Math.floor(hash(bx + 7, bz) * 10);
      const depth = isNarrowEdge ? 24 : 28 + Math.floor(hash(bx, bz + 11) * 8);

      let crownStyle: BuildingSpec['crownStyle'] = 'flat';
      let spireHeight: number | undefined;
      if (height >= 76 && hVal > 0.55) {
        crownStyle = hVal > 0.78 ? 'pyramid' : 'stepped_spire';
        spireHeight = 16 + Math.round(hVal * 12);
      }

      list.push({
        id: `b_grid_${idx++}`,
        x: bx,
        z: bz,
        width,
        depth,
        height,
        color: pal.color,
        accentColor: pal.accent,
        style: height > 60 ? 'tower' : pal.style,
        crownStyle,
        spireHeight,
      });
    }
  }
  return list;
})();

export function buildWorldMetadata(): {
  helipads: HelipadData[];
  colliders: BuildingCollider[];
  minimapData: MinimapStaticData;
} {
  const helipads: HelipadData[] = [];
  const colliders: BuildingCollider[] = [];

  // 1. Coastal Airbase Principal Helipad (BASE)
  const baseY = getTerrainHeight(AIRBASE_CENTER.x, AIRBASE_CENTER.z);
  helipads.push({
    id: 'pad_airbase',
    name: 'Base Aérea HQ',
    shortCode: 'BASE',
    x: AIRBASE_CENTER.x,
    y: baseY + 0.35,
    z: AIRBASE_CENTER.z,
    radius: 14,
    isBase: true,
    district: 'Costa Oeste',
    biome: 'base',
  });

  // Airbase Hangar & Control Tower colliders
  colliders.push({
    id: 'airbase_hangar',
    minX: AIRBASE_CENTER.x - 42,
    maxX: AIRBASE_CENTER.x - 20,
    minZ: AIRBASE_CENTER.z - 22,
    maxZ: AIRBASE_CENTER.z + 4,
    baseY,
    topY: baseY + 11.5,
  });

  colliders.push({
    id: 'airbase_tower',
    minX: AIRBASE_CENTER.x + 17,
    maxX: AIRBASE_CENTER.x + 29,
    minZ: AIRBASE_CENTER.z - 28,
    maxZ: AIRBASE_CENTER.z - 16,
    baseY,
    topY: baseY + 21,
  });

  // Urban Stadium outer rim collider
  colliders.push({
    id: 'urban_stadium',
    minX: STADIUM_POS.x - STADIUM_POS.rx,
    maxX: STADIUM_POS.x + STADIUM_POS.rx,
    minZ: STADIUM_POS.z - STADIUM_POS.rz,
    maxZ: STADIUM_POS.z + STADIUM_POS.rz,
    baseY: 3.0,
    topY: 19.0,
  });

  // 2x Expanded West Port Terminal Warehouses (2), 6 Gantry Cranes & 2 Moored Cargo Ships
  colliders.push({
    id: 'port_warehouse_north',
    minX: -948,
    maxX: -904,
    minZ: -195,
    maxZ: -115,
    baseY: 3.0,
    topY: 15.5,
  });
  colliders.push({
    id: 'port_warehouse_south',
    minX: -948,
    maxX: -904,
    minZ: 95,
    maxZ: 175,
    baseY: 3.0,
    topY: 15.5,
  });
  for (const [idx, dz] of [-195, -125, -55, 25, 95, 165].entries()) {
    colliders.push({
      id: `port_crane_${idx}`,
      minX: PORT_QUAY_POS.x - 14,
      maxX: PORT_QUAY_POS.x + 12,
      minZ: PORT_QUAY_POS.z + dz - 9,
      maxZ: PORT_QUAY_POS.z + dz + 9,
      baseY: PORT_QUAY_POS.dockY,
      topY: PORT_QUAY_POS.dockY + 34,
    });
  }
  for (const [idx, dz] of [-110, 95].entries()) {
    colliders.push({
      id: `port_moored_ship_${idx}`,
      minX: PORT_QUAY_POS.x - 74,
      maxX: PORT_QUAY_POS.x - 44,
      minZ: PORT_QUAY_POS.z + dz - 52,
      maxZ: PORT_QUAY_POS.z + dz + 52,
      baseY: OCEAN_LEVEL,
      topY: 18.0,
    });
  }

  // 2. Dam Overlook Pad (H-05)
  const damPadY = getTerrainHeight(DAM_PAD_X, DAM_PAD_Z);
  helipads.push({
    id: 'pad_dam',
    name: 'Mirante da Represa',
    shortCode: 'H-05',
    x: DAM_PAD_X,
    y: damPadY + 0.45,
    z: DAM_PAD_Z,
    radius: 11.0,
    isBase: false,
    district: 'Represa Leste',
    biome: 'dam',
  });

  // 3. Dense Forest Ranger Base Helipad (FLO-1)
  const forestPadY = getTerrainHeight(FOREST_PAD_POS.x, FOREST_PAD_POS.z);
  helipads.push({
    id: 'pad_forest_base',
    name: 'Base Florestal',
    shortCode: 'FLO-1',
    x: FOREST_PAD_POS.x,
    y: forestPadY + 0.45,
    z: FOREST_PAD_POS.z,
    radius: 11.2,
    isBase: false,
    district: 'Floresta Densa',
    biome: 'forest',
  });

  colliders.push({
    id: 'forest_ranger_cabin',
    minX: FOREST_PAD_POS.x + 14,
    maxX: FOREST_PAD_POS.x + 28,
    minZ: FOREST_PAD_POS.z - 12,
    maxZ: FOREST_PAD_POS.z + 4,
    baseY: forestPadY,
    topY: forestPadY + 8.5,
  });
  colliders.push({
    id: 'forest_lookout_tower',
    minX: FOREST_PAD_POS.x - 25,
    maxX: FOREST_PAD_POS.x - 13,
    minZ: FOREST_PAD_POS.z - 23,
    maxZ: FOREST_PAD_POS.z - 11,
    baseY: forestPadY,
    topY: forestPadY + 29.0,
  });

  // 3B. Farm / Plantation Helipad ("Fazenda Vale Verde", FAZ-1) + Red Barn & Silos colliders
  const farmPadY = getTerrainHeight(FARM_PAD_POS.x, FARM_PAD_POS.z);
  helipads.push({
    id: 'pad_farm_verde',
    name: 'Fazenda Vale Verde',
    shortCode: 'FAZ-1',
    x: FARM_PAD_POS.x,
    y: farmPadY + 0.42,
    z: FARM_PAD_POS.z,
    radius: 11.2,
    isBase: false,
    district: 'Plantações & Vale',
    biome: 'forest',
  });
  colliders.push({
    id: 'farm_red_barn',
    minX: FARM_REGION.x - 52,
    maxX: FARM_REGION.x - 24,
    minZ: FARM_REGION.z - 62,
    maxZ: FARM_REGION.z - 40,
    baseY: FARM_REGION.groundY,
    topY: FARM_REGION.groundY + 13.5,
  });
  colliders.push({
    id: 'farm_grain_silos',
    minX: FARM_REGION.x - 20,
    maxX: FARM_REGION.x + 12,
    minZ: FARM_REGION.z - 62,
    maxZ: FARM_REGION.z - 46,
    baseY: FARM_REGION.groundY,
    topY: FARM_REGION.groundY + 18.0,
  });

  // 4. Snow Mountain Summit ("Pine Peak", H-06) & Slope Base ("Base Ski Lodge", H-07)
  const summitY = getTerrainHeight(SNOW_PEAK_POS.x, SNOW_PEAK_POS.z);
  helipads.push({
    id: 'pad_pine_peak',
    name: 'Pine Peak (Cume Nevado)',
    shortCode: 'H-06',
    x: SNOW_PEAK_POS.x,
    y: summitY + 0.45,
    z: SNOW_PEAK_POS.z,
    radius: 11.2,
    isBase: false,
    district: 'Cordilheira · Cume',
    biome: 'snow',
  });

  const skiBaseY = getTerrainHeight(SKI_BASE_POS.x, SKI_BASE_POS.z);
  helipads.push({
    id: 'pad_ski_base',
    name: 'Base Ski Lodge',
    shortCode: 'H-07',
    x: SKI_BASE_POS.x,
    y: skiBaseY + 0.45,
    z: SKI_BASE_POS.z,
    radius: 11.5,
    isBase: false,
    district: 'Cordilheira · Vila Alpina',
    biome: 'snow',
  });

  colliders.push({
    id: 'ski_lodge_chalet',
    minX: SKI_BASE_POS.x - 32,
    maxX: SKI_BASE_POS.x - 14,
    minZ: SKI_BASE_POS.z - 11,
    maxZ: SKI_BASE_POS.z + 11,
    baseY: skiBaseY,
    topY: skiBaseY + 12.5,
  });

  // Summit Radar Station collider atop East Alpine Horn
  const radarY = getTerrainHeight(RADAR_PEAK_POS.x, RADAR_PEAK_POS.z);
  colliders.push({
    id: 'alpine_radar_station',
    minX: RADAR_PEAK_POS.x - 11,
    maxX: RADAR_PEAK_POS.x + 11,
    minZ: RADAR_PEAK_POS.z - 11,
    maxZ: RADAR_PEAK_POS.z + 11,
    baseY: radarY,
    topY: radarY + 26,
  });

  // 5. Desert Canyon Outpost Helipad (DES-1), Solar Power Station Helipad (DES-2) & 11 Wind Turbines
  const desertPadY = getTerrainHeight(DESERT_PAD_POS.x, DESERT_PAD_POS.z);
  helipads.push({
    id: 'pad_desert_canyon',
    name: 'Posto Cânion',
    shortCode: 'DES-1',
    x: DESERT_PAD_POS.x,
    y: desertPadY + 0.45,
    z: DESERT_PAD_POS.z,
    radius: 11.2,
    isBase: false,
    district: 'Deserto & Cânion',
    biome: 'desert',
  });

  colliders.push({
    id: 'desert_outpost_station',
    minX: DESERT_PAD_POS.x + 15,
    maxX: DESERT_PAD_POS.x + 29,
    minZ: DESERT_PAD_POS.z - 10,
    maxZ: DESERT_PAD_POS.z + 6,
    baseY: desertPadY,
    topY: desertPadY + 9.5,
  });

  const solarPadY = getTerrainHeight(SOLAR_PAD_POS.x, SOLAR_PAD_POS.z);
  helipads.push({
    id: 'pad_desert_solar',
    name: 'Estação Solar Deserto',
    shortCode: 'DES-2',
    x: SOLAR_PAD_POS.x,
    y: solarPadY + 0.45,
    z: SOLAR_PAD_POS.z,
    radius: 11.2,
    isBase: false,
    district: 'Usina Solar',
    biome: 'desert',
  });

  colliders.push({
    id: 'desert_solar_control',
    minX: SOLAR_STATION_POS.x + 28,
    maxX: SOLAR_STATION_POS.x + 48,
    minZ: SOLAR_STATION_POS.z - 14,
    maxZ: SOLAR_STATION_POS.z + 10,
    baseY: SOLAR_STATION_POS.y,
    topY: SOLAR_STATION_POS.y + 10.5,
  });

  WIND_TURBINES.forEach((wt, idx) => {
    const ty = getTerrainHeight(wt.x, wt.z);
    colliders.push({
      id: `wind_turbine_${idx}`,
      minX: wt.x - 4.5,
      maxX: wt.x + 4.5,
      minZ: wt.z - 4.5,
      maxZ: wt.z + 4.5,
      baseY: ty,
      topY: ty + 52,
    });
  });

  // 6. Costa do Sol Beach Helipad (SOL-1), 2 Resort Hotels & Headland Lighthouse
  const beachPadY = getTerrainHeight(BEACH_PAD_POS.x, BEACH_PAD_POS.z);
  helipads.push({
    id: 'pad_beach_sol',
    name: 'Costa do Sol',
    shortCode: 'SOL-1',
    x: BEACH_PAD_POS.x,
    y: beachPadY + 0.42,
    z: BEACH_PAD_POS.z,
    radius: 11.2,
    isBase: false,
    district: 'Praia Sudeste',
    biome: 'beach',
  });

  RESORT_HOTELS.forEach((res, idx) => {
    const resortY = getTerrainHeight(res.x, res.z);
    colliders.push({
      id: `beach_resort_hotel_${idx}`,
      minX: res.x - 22,
      maxX: res.x + 22,
      minZ: res.z - 16,
      maxZ: res.z + 16,
      baseY: resortY,
      topY: resortY + 21.5,
    });
  });

  const lhY = getTerrainHeight(LIGHTHOUSE_POS.x, LIGHTHOUSE_POS.z);
  colliders.push({
    id: 'coast_lighthouse',
    minX: LIGHTHOUSE_POS.x - 5.5,
    maxX: LIGHTHOUSE_POS.x + 5.5,
    minZ: LIGHTHOUSE_POS.z - 5.5,
    maxZ: LIGHTHOUSE_POS.z + 5.5,
    baseY: lhY,
    topY: lhY + 31,
  });

  // 7. Three Far Offshore Oil Rigs (Alpha, Bravo, Charlie) & Structure Colliders
  for (const rig of OIL_RIGS) {
    helipads.push({
      id: rig.padId,
      name: rig.name,
      shortCode: rig.shortCode,
      x: rig.padX,
      y: rig.padY,
      z: rig.padZ,
      radius: 12.2,
      isBase: false,
      district: rig.district,
      biome: 'oilrig',
    });

    colliders.push({
      id: `${rig.id}_main_deck`,
      minX: rig.x - 21,
      maxX: rig.x + 21,
      minZ: rig.z - 17,
      maxZ: rig.z + 17,
      baseY: OCEAN_LEVEL - 4,
      topY: rig.deckY + 0.4,
    });

    colliders.push({
      id: `${rig.id}_helipad_deck`,
      minX: rig.padX - 12,
      maxX: rig.padX + 12,
      minZ: rig.padZ - 12,
      maxZ: rig.padZ + 12,
      baseY: rig.deckY,
      topY: rig.padY,
      hasHelipad: true,
      helipadId: rig.padId,
    });

    colliders.push({
      id: `${rig.id}_derrick`,
      minX: rig.x + 2,
      maxX: rig.x + 12,
      minZ: rig.z - 10,
      maxZ: rig.z + 0,
      baseY: rig.deckY,
      topY: rig.deckY + 35,
    });

    colliders.push({
      id: `${rig.id}_quarters`,
      minX: rig.x - 16,
      maxX: rig.x - 2,
      minZ: rig.z - 13,
      maxZ: rig.z - 2,
      baseY: rig.deckY,
      topY: rig.deckY + 11.5,
    });
  }

  // 8. Urban buildings & 9 rooftop helipads
  for (const b of BUILDING_SPECS) {
    const groundY = getTerrainHeight(b.x, b.z);
    const topY = groundY + b.height;
    let helipadId: string | undefined;

    if (b.hasHelipad) {
      helipadId = `pad_${b.id}`;
      helipads.push({
        id: helipadId,
        name: b.helipadName || 'Heliponto Urbano',
        shortCode: b.helipadCode || 'H',
        x: b.x,
        y: topY + 0.32,
        z: b.z,
        radius: Math.min(b.width, b.depth) * 0.42,
        isBase: false,
        district: b.district || 'Centro',
        biome: 'urban',
      });
    }

    const crownBonus = !b.hasHelipad && b.spireHeight ? b.spireHeight * 0.65 : 0;
    colliders.push({
      id: b.id,
      minX: b.x - b.width / 2,
      maxX: b.x + b.width / 2,
      minZ: b.z - b.depth / 2,
      maxZ: b.z + b.depth / 2,
      baseY: groundY,
      topY: b.hasHelipad ? topY + 0.32 : topY + crownBonus,
      hasHelipad: b.hasHelipad,
      helipadId,
    });
  }

  // Generate high-resolution biome-tagged coastline polygon for Minimap & Tactical Map
  const coastPolygon: Array<{ x: number; z: number; biome: CoastBiome }> = [];
  const samples = 160;
  for (let i = 0; i < samples; i++) {
    const theta = -Math.PI + (i / samples) * Math.PI * 2;
    const r = getIslandCoastRadius(theta) - 10;
    coastPolygon.push({
      x: Math.cos(theta) * r,
      z: Math.sin(theta) * r,
      biome: getCoastBiome(theta),
    });
  }

  const minimapData: MinimapStaticData = {
    worldRadius: ISLAND_MAX_RADIUS,
    coastPolygon,
    lakeCenter: {
      x: LAKE_CENTER_X,
      z: LAKE_CENTER_Z,
      rx: LAKE_RADIUS_X,
      rz: LAKE_RADIUS_Z,
    },
    rivers: FOREST_RIVERS.map((r) => ({
      id: r.id,
      width: r.width,
      points: r.points.map((pt) => ({ x: pt.x, z: pt.z })),
    })),
    farmRegion: {
      x: FARM_REGION.x,
      z: FARM_REGION.z,
      rx: FARM_REGION.rx,
      rz: FARM_REGION.rz,
    },
    snowRegion: SNOW_REGION,
    snowPeaks: SNOW_PEAKS.map((p) => ({ x: p.x, z: p.z, r: p.r })),
    radarPeakPos: RADAR_PEAK_POS,
    forestRegion: FOREST_REGION,
    desertRegion: DESERT_REGION,
    desertMesas: DESERT_MESAS.map((m) => ({ x: m.x, z: m.z, rx: m.rx, rz: m.rz })),
    windTurbines: WIND_TURBINES.map((w) => ({ x: w.x, z: w.z })),
    solarStationPos: { x: SOLAR_STATION_POS.x, z: SOLAR_STATION_POS.z },
    beachRegion: BEACH_REGION,
    beachPier: {
      x1: BEACH_PIER.x1,
      z1: BEACH_PIER.z1,
      x2: BEACH_PIER.x2,
      z2: BEACH_PIER.z2,
    },
    beachPiers: BEACH_PIERS.map((p) => ({
      x1: p.x1,
      z1: p.z1,
      x2: p.x2,
      z2: p.z2,
    })),
    lighthousePos: LIGHTHOUSE_POS,
    resortPos: { x: RESORT_HOTEL_POS.x, z: RESORT_HOTEL_POS.z },
    resortPositions: RESORT_HOTELS.map((r) => ({ x: r.x, z: r.z })),
    portPos: { x: PORT_QUAY_POS.x, z: PORT_QUAY_POS.z },
    urbanBounds: URBAN_BOUNDS,
    roadSegments: URBAN_ROAD_SEGMENTS,
    oilRigPos: {
      x: OIL_RIG_POS.x,
      z: OIL_RIG_POS.z,
    },
    oilRigs: OIL_RIGS.map((r) => ({
      id: r.padId,
      name: r.name,
      shortCode: r.shortCode,
      x: r.x,
      z: r.z,
    })),
    parkRect: PARK_RECT,
    stadiumRect: STADIUM_POS,
    cityBlocks: BUILDING_SPECS.map((b) => ({
      x: b.x,
      z: b.z,
      w: b.width,
      d: b.depth,
    })),
    helipads,
  };

  return { helipads, colliders, minimapData };
}
