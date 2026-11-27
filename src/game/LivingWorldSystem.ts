import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  BEACH_PAD_POS,
  getIslandCoastRadius,
  OCEAN_LEVEL,
  OIL_RIGS,
  PORT_QUAY_POS,
  URBAN_BOUNDS,
  URBAN_ROAD_NODES,
} from './WorldData';
import { createTrafficLightDotTexture } from './SpatialLOD';
import type { WeatherMode } from './types';

interface RoadNode {
  id: number;
  x: number;
  z: number;
  neighbors: number[];
}

// Shared validated flat urban avenue graph (6x5 expanded avenues, y = 3.04m)
const AMBIENT_ROAD_NODES: RoadNode[] = URBAN_ROAD_NODES.map((n, id) => ({
  id,
  x: n.x,
  z: n.z,
  neighbors: n.neighbors,
}));

const CAR_PALETTE = [
  0xeab308, // City Taxi Yellow
  0xef4444, // Coral Red
  0x3b82f6, // Cobalt Blue
  0xf8fafc, // Pearl White
  0x10b981, // Emerald Green
  0xf97316, // Tangerine
  0x94a3b8, // Metallic Silver
  0x06b6d4, // Cyan
  0x6366f1, // Indigo
  0xd97706, // Amber
  0xe2e8f0, // Ice Gray
  0x14b8a6, // Teal
];

interface AmbientCar {
  fromNode: number;
  toNode: number;
  progress: number;
  speed: number;
  x: number;
  z: number;
  yaw: number;
  laneOffset: number;
  lengthScale: number;
  colorHex: number;
}

interface AmbientShip {
  x: number;
  y: number;
  z: number;
  heading: number;
  scale: number;
  hullColor: number;
  deckColor: number;
  accentColor: number;
  hullLen: number;
  hullW: number;
  hullH: number;
  bridgeZ: number;
  bridgeH: number;
  centerX: number;
  centerZ: number;
  radiusX: number;
  radiusZ: number;
  angle: number;
  angularSpeed: number;
  bobPhase: number;
  isCargo: boolean;
}

interface AmbientGull {
  centerX: number;
  centerZ: number;
  radius: number;
  altitude: number;
  angle: number;
  angularSpeed: number;
  flapSpeed: number;
  flapPhase: number;
}

// Pre-allocated math helpers (zero GC in render loop)
const _dummy = new THREE.Object3D();
const _childDummy = new THREE.Object3D();
const _shipMat = new THREE.Matrix4();
const _wingMat = new THREE.Matrix4();
const _gullMat = new THREE.Matrix4();
const _tmpColor = new THREE.Color();
const _tmpVantage = new THREE.Vector3();
const _cullSphere = new THREE.Sphere();
const _dotQuat = new THREE.Quaternion();
const _dotLookMat = new THREE.Matrix4();
const _dotUp = new THREE.Vector3(0, 1, 0);
const _dotPos = new THREE.Vector3();
const _dotScale = new THREE.Vector3();
const _dotMat = new THREE.Matrix4();

function prepColoredPart(
  raw: THREE.BufferGeometry,
  colorHex: number,
  tx = 0,
  ty = 0,
  tz = 0,
  rx = 0,
  ry = 0,
  rz = 0,
  sx = 1,
  sy = 1,
  sz = 1
): THREE.BufferGeometry {
  const g = raw.index ? raw.toNonIndexed() : raw.clone();
  if (g.getAttribute('uv')) g.deleteAttribute('uv');
  if (sx !== 1 || sy !== 1 || sz !== 1) g.scale(sx, sy, sz);
  if (rx !== 0) g.rotateX(rx);
  if (ry !== 0) g.rotateY(ry);
  if (rz !== 0) g.rotateZ(rz);
  if (tx !== 0 || ty !== 0 || tz !== 0) g.translate(tx, ty, tz);
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  const count = g.getAttribute('position').count;
  const col = new THREE.Color(colorHex);
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  raw.dispose();
  return g;
}

function shortestAngleDiff(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Phase 7 Living World System (60 FPS):
 * - 22 instanced low-poly urban traffic cars respecting avenue lanes & smooth intersection turns,
 *   with automatic night headlights, taillights, and asphalt headlight pools.
 * - 5 low-poly ships/boats cruising circular offshore routes with animated foam wakes & night nav lights.
 * - 3 daytime coastal seagulls soaring in graceful circles near the island shores.
 */
export class LivingWorldSystem {
  public readonly root = new THREE.Group();

  private geometries: THREE.BufferGeometry[] = [];
  private materials: THREE.Material[] = [];
  private textures: THREE.Texture[] = [];

  // Instanced city traffic (near <220m: full 3D; far 220-760m at night: twin light dots only)
  private readonly carCount = 76;
  private cars: AmbientCar[] = [];
  private carBodyInst: THREE.InstancedMesh;
  private carCabinInst: THREE.InstancedMesh;
  private carHeadlightInst: THREE.InstancedMesh;
  private carTaillightInst: THREE.InstancedMesh;
  private carBeamInst: THREE.InstancedMesh;
  private farCarHeadDotInst: THREE.InstancedMesh;
  private farCarTailDotInst: THREE.InstancedMesh;
  private urbanCullSphere: THREE.Sphere;

  private carHeadlightMat: THREE.MeshLambertMaterial;
  private carTaillightMat: THREE.MeshLambertMaterial;
  private carBeamMat: THREE.MeshBasicMaterial;
  private farCarHeadDotMat: THREE.MeshBasicMaterial;
  private farCarTailDotMat: THREE.MeshBasicMaterial;

  // Maritime traffic vessels (1 merged cargo mesh + 3 InstancedMeshes for boats + 1 wake + 3 night nav InstancedMeshes)
  private ships: AmbientShip[] = [];
  private cargoShipMesh!: THREE.Mesh;
  private boatHullInst!: THREE.InstancedMesh;
  private boatDeckInst!: THREE.InstancedMesh;
  private boatBridgeInst!: THREE.InstancedMesh;
  private shipWakeInst!: THREE.InstancedMesh;
  private shipWakeMat!: THREE.MeshBasicMaterial;
  private shipNavRedInst!: THREE.InstancedMesh;
  private shipNavGreenInst!: THREE.InstancedMesh;
  private shipNavWhiteInst!: THREE.InstancedMesh;

  // Daytime coastal seagulls (2 InstancedMeshes total: body+beak & flapping wings)
  private gulls: AmbientGull[] = [];
  private gullBodyInst!: THREE.InstancedMesh;
  private gullWingInst!: THREE.InstancedMesh;
  private shipsKinematicsSteppedThisFrame = false;

  constructor() {
    this.root.name = 'LivingWorldSystem';

    // === 1. INSTANCED URBAN CAR TRAFFIC ===
    const bodyGeo = this.trackGeo(new THREE.BoxGeometry(1.74, 0.56, 3.62));
    const bodyMat = this.trackMat(
      new THREE.MeshLambertMaterial({
        color: 0xffffff,
      })
    );
    this.carBodyInst = new THREE.InstancedMesh(bodyGeo, bodyMat, this.carCount);
    this.carBodyInst.castShadow = false;
    this.carBodyInst.receiveShadow = true;
    this.carBodyInst.frustumCulled = false;

    const cabinGeo = this.trackGeo(new THREE.BoxGeometry(1.44, 0.48, 1.82));
    const cabinMat = this.trackMat(
      new THREE.MeshLambertMaterial({
        color: 0x1e293b,
      })
    );
    this.carCabinInst = new THREE.InstancedMesh(cabinGeo, cabinMat, this.carCount);
    this.carCabinInst.frustumCulled = false;

    const headlightGeo = this.trackGeo(new THREE.BoxGeometry(1.38, 0.15, 0.12));
    this.carHeadlightMat = this.trackMat(
      new THREE.MeshLambertMaterial({
        color: 0xfef9c3,
        emissive: 0xfff3b0,
        emissiveIntensity: 0.15,
      })
    );
    this.carHeadlightInst = new THREE.InstancedMesh(
      headlightGeo,
      this.carHeadlightMat,
      this.carCount
    );
    this.carHeadlightInst.frustumCulled = false;

    const taillightGeo = this.trackGeo(new THREE.BoxGeometry(1.38, 0.14, 0.12));
    this.carTaillightMat = this.trackMat(
      new THREE.MeshLambertMaterial({
        color: 0x991b1b,
        emissive: 0xff1f1f,
        emissiveIntensity: 0.12,
      })
    );
    this.carTaillightInst = new THREE.InstancedMesh(
      taillightGeo,
      this.carTaillightMat,
      this.carCount
    );
    this.carTaillightInst.frustumCulled = false;

    const beamGeo = this.trackGeo(new THREE.PlaneGeometry(2.3, 6.8));
    beamGeo.rotateX(-Math.PI / 2);
    this.carBeamMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xfff5c2,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      })
    );
    this.carBeamInst = new THREE.InstancedMesh(beamGeo, this.carBeamMat, this.carCount);
    this.carBeamInst.frustumCulled = false;

    // Far-distance (>220m) GTA-style night traffic twin headlight & twin taillight dot billboards
    const lightDotTex = createTrafficLightDotTexture();
    this.textures.push(lightDotTex);
    const farDotGeo = this.trackGeo(new THREE.PlaneGeometry(1.15, 1.15));
    this.farCarHeadDotMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        map: lightDotTex,
        color: 0xfff6cf,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: true,
      })
    );
    this.farCarTailDotMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        map: lightDotTex,
        color: 0xff2b2b,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: true,
      })
    );
    this.farCarHeadDotInst = new THREE.InstancedMesh(
      farDotGeo,
      this.farCarHeadDotMat,
      this.carCount * 2
    );
    this.farCarTailDotInst = new THREE.InstancedMesh(
      farDotGeo,
      this.farCarTailDotMat,
      this.carCount * 2
    );
    this.farCarHeadDotInst.count = 0;
    this.farCarTailDotInst.count = 0;
    this.farCarHeadDotInst.visible = false;
    this.farCarTailDotInst.visible = false;

    // Compute tight urban bounding sphere so instanced city traffic is frustum-culled when looking away from the city
    const urbanCenterX = (URBAN_BOUNDS.minX + URBAN_BOUNDS.maxX) * 0.5;
    const urbanCenterZ = (URBAN_BOUNDS.minZ + URBAN_BOUNDS.maxZ) * 0.5;
    const urbanHalfDiag = Math.hypot(
      (URBAN_BOUNDS.maxX - URBAN_BOUNDS.minX) * 0.5,
      (URBAN_BOUNDS.maxZ - URBAN_BOUNDS.minZ) * 0.5
    );
    this.urbanCullSphere = new THREE.Sphere(
      new THREE.Vector3(urbanCenterX, 5, urbanCenterZ),
      urbanHalfDiag + 40
    );
    for (const inst of [
      this.carBodyInst,
      this.carCabinInst,
      this.carHeadlightInst,
      this.carTaillightInst,
      this.carBeamInst,
      this.farCarHeadDotInst,
      this.farCarTailDotInst,
    ]) {
      inst.castShadow = false;
      inst.boundingSphere = this.urbanCullSphere.clone();
      inst.frustumCulled = true;
    }

    this.root.add(
      this.carBodyInst,
      this.carCabinInst,
      this.carHeadlightInst,
      this.carTaillightInst,
      this.carBeamInst,
      this.farCarHeadDotInst,
      this.farCarTailDotInst
    );

    this.initAmbientCars();

    // === 2. MARITIME TRAFFIC (INSTANCED / MERGED SHIPS & BOATS) ===
    this.initAmbientShips();

    // === 3. DAYTIME COASTAL SEAGULLS (2 INSTANCED MESHES) ===
    this.initCoastalGulls();
  }

  private trackGeo<T extends THREE.BufferGeometry>(g: T): T {
    this.geometries.push(g);
    return g;
  }

  private trackMat<T extends THREE.Material>(m: T): T {
    this.materials.push(m);
    return m;
  }

  private initAmbientCars(): void {
    // Deterministic well-distributed starting positions across the entire urban avenue grid
    let seed = 4219;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    for (let i = 0; i < this.carCount; i++) {
      const fromIdx = i % AMBIENT_ROAD_NODES.length;
      const fromNode = AMBIENT_ROAD_NODES[fromIdx];
      const toIdx = fromNode.neighbors[Math.floor(rand() * fromNode.neighbors.length)];
      const toNode = AMBIENT_ROAD_NODES[toIdx];
      const progress = 0.08 + rand() * 0.84;

      const dx = toNode.x - fromNode.x;
      const dz = toNode.z - fromNode.z;
      const segLen = Math.max(1, Math.hypot(dx, dz));
      const dirX = dx / segLen;
      const dirZ = dz / segLen;
      // Right-hand lane perpendicular vector (+Z forward -> right is -X)
      const rightX = -dirZ;
      const rightZ = dirX;
      const laneOffset = 2.35;

      const x = THREE.MathUtils.lerp(fromNode.x, toNode.x, progress) + rightX * laneOffset;
      const z = THREE.MathUtils.lerp(fromNode.z, toNode.z, progress) + rightZ * laneOffset;
      const yaw = Math.atan2(dirX, dirZ);

      const colorHex = CAR_PALETTE[i % CAR_PALETTE.length];
      this.cars.push({
        fromNode: fromIdx,
        toNode: toIdx,
        progress,
        speed: 8.2 + rand() * 3.2, // Calm city speed (distinct from fast 18.8 m/s Police Pursuit suspect)
        x,
        z,
        yaw,
        laneOffset,
        lengthScale: 0.92 + rand() * 0.18,
        colorHex,
      });

      _tmpColor.setHex(colorHex);
      this.carBodyInst.setColorAt(i, _tmpColor);
    }

    if (this.carBodyInst.instanceColor) {
      this.carBodyInst.instanceColor.needsUpdate = true;
    }
    this.syncCarInstances(0, undefined, undefined);
  }

  private initAmbientShips(): void {
    const shipConfigs: Array<{
      kind: 'cargo' | 'yacht' | 'trawler' | 'supply' | 'cruiser';
      hullColor: number;
      deckColor: number;
      accentColor: number;
      scale: number;
      centerX: number;
      centerZ: number;
      radiusX: number;
      radiusZ: number;
      startAngle: number;
      angularSpeed: number;
    }> = [
      // 1. Large Container Cargo Ship cruising outer South-East shipping lane past Oil Rig Alpha
      {
        kind: 'cargo',
        hullColor: 0x991b1b,
        deckColor: 0x334155,
        accentColor: 0xf8fafc,
        scale: 1.85,
        centerX: 120,
        centerZ: 80,
        radiusX: 2420,
        radiusZ: 2260,
        startAngle: 0.42,
        angularSpeed: 0.0046,
      },
      // 2. Offshore Supply Boat looping near Oil Rig Alpha (Far SE)
      {
        kind: 'supply',
        hullColor: 0xea580c,
        deckColor: 0x475569,
        accentColor: 0xfef08a,
        scale: 1.12,
        centerX: OIL_RIGS[0].x,
        centerZ: OIL_RIGS[0].z,
        radiusX: 185,
        radiusZ: 165,
        startAngle: 2.1,
        angularSpeed: -0.028,
      },
      // 3. Offshore Supply Boat looping near Oil Rig Bravo (Far NE)
      {
        kind: 'supply',
        hullColor: 0x0284c7,
        deckColor: 0x334155,
        accentColor: 0xfacc15,
        scale: 1.1,
        centerX: OIL_RIGS[1].x,
        centerZ: OIL_RIGS[1].z,
        radiusX: 195,
        radiusZ: 170,
        startAngle: 0.6,
        angularSpeed: 0.026,
      },
      // 4. Offshore Supply Boat looping near Oil Rig Charlie (Far W/SW)
      {
        kind: 'supply',
        hullColor: 0x15803d,
        deckColor: 0x475569,
        accentColor: 0xf8fafc,
        scale: 1.1,
        centerX: OIL_RIGS[2].x,
        centerZ: OIL_RIGS[2].z,
        radiusX: 180,
        radiusZ: 165,
        startAngle: 4.1,
        angularSpeed: -0.029,
      },
      // 5. Sleek White Coastal Yacht sailing off Costa do Sol Beach & South-West Desert Coast
      {
        kind: 'yacht',
        hullColor: 0xf8fafc,
        deckColor: 0x0284c7,
        accentColor: 0x1e293b,
        scale: 1.04,
        centerX: 180,
        centerZ: 240,
        radiusX: 2140,
        radiusZ: 1980,
        startAngle: 1.12,
        angularSpeed: 0.0056,
      },
      // 6. Coastal Fishing Trawler circling West Harbor Bay & North-West sea cliffs
      {
        kind: 'trawler',
        hullColor: 0x0f766e,
        deckColor: 0xfef3c7,
        accentColor: 0xd97706,
        scale: 1.1,
        centerX: -140,
        centerZ: -80,
        radiusX: 2220,
        radiusZ: 2180,
        startAngle: 3.1,
        angularSpeed: -0.0052,
      },
      // 7. Blue & Yellow Island Cruiser cruising North-East / East outer coastline
      {
        kind: 'cruiser',
        hullColor: 0x1d4ed8,
        deckColor: 0xf8fafc,
        accentColor: 0xfacc15,
        scale: 1.0,
        centerX: 140,
        centerZ: -110,
        radiusX: 2320,
        radiusZ: 2240,
        startAngle: -0.45,
        angularSpeed: 0.0054,
      },
    ];

    // 1. Build 1 merged vertex-colored Cargo Ship mesh (1 draw call total for cargo vessel)
    const cargoCfg = shipConfigs[0];
    {
      const hullLen = 18;
      const hullW = 5.2;
      const hullH = 2.4;
      const bridgeZ = -hullLen * 0.3;
      const bridgeH = 4.4;
      const parts: THREE.BufferGeometry[] = [];
      parts.push(
        prepColoredPart(new THREE.BoxGeometry(hullW, hullH, hullLen), cargoCfg.hullColor, 0, hullH * 0.4, 0)
      );
      const bowRaw = new THREE.CylinderGeometry(0.1, hullW * 0.68, hullH, 4);
      bowRaw.rotateY(Math.PI / 4);
      parts.push(
        prepColoredPart(bowRaw, cargoCfg.hullColor, 0, hullH * 0.4, hullLen * 0.5 + hullW * 0.26, 0, 0, 0, 1, 1, 1.35)
      );
      parts.push(
        prepColoredPart(new THREE.BoxGeometry(hullW * 0.9, 0.24, hullLen * 0.92), cargoCfg.deckColor, 0, hullH * 0.9, 0)
      );
      parts.push(
        prepColoredPart(
          new THREE.BoxGeometry(hullW * 0.72, bridgeH, hullLen * 0.26),
          cargoCfg.accentColor,
          0,
          hullH * 0.9 + bridgeH * 0.5,
          bridgeZ
        )
      );
      parts.push(
        prepColoredPart(
          new THREE.BoxGeometry(hullW * 0.74, 0.75, hullLen * 0.22),
          0x0f172a,
          0,
          hullH * 0.9 + bridgeH * 0.72,
          bridgeZ + 0.16
        )
      );
      const containerColors = [0x2563eb, 0xf97316, 0x16a34a, 0xeab308];
      for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 2; col++) {
          parts.push(
            prepColoredPart(
              new THREE.BoxGeometry(1.9, 1.5, 4.2),
              containerColors[(row * 2 + col) % containerColors.length],
              col === 0 ? -1.1 : 1.1,
              hullH * 0.9 + 0.85,
              1.8 + row * 4.5
            )
          );
        }
      }
      const cargoGeo = this.trackGeo(mergeGeometries(parts, false)!);
      for (const p of parts) p.dispose();
      const cargoMat = this.trackMat(
        new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true })
      );
      this.cargoShipMesh = new THREE.Mesh(cargoGeo, cargoMat);
      this.cargoShipMesh.scale.setScalar(cargoCfg.scale);
      this.cargoShipMesh.castShadow = false;
      this.cargoShipMesh.receiveShadow = false;
      this.cargoShipMesh.frustumCulled = true;
      this.root.add(this.cargoShipMesh);
    }

    // 2. Build 3 InstancedMeshes for the 6 medium ships (hull, deck+mast, bridge+glass)
    const boatCount = shipConfigs.length - 1;
    const bLen = 11.5;
    const bW = 3.6;
    const bH = 1.5;
    const bBridgeZ = -bLen * 0.1;
    const bBridgeH = 2.3;

    const hullParts: THREE.BufferGeometry[] = [
      prepColoredPart(new THREE.BoxGeometry(bW, bH, bLen), 0xffffff, 0, bH * 0.4, 0),
    ];
    const bBowRaw = new THREE.CylinderGeometry(0.1, bW * 0.68, bH, 4);
    bBowRaw.rotateY(Math.PI / 4);
    hullParts.push(
      prepColoredPart(bBowRaw, 0xffffff, 0, bH * 0.4, bLen * 0.5 + bW * 0.26, 0, 0, 0, 1, 1, 1.35)
    );
    const boatHullGeo = this.trackGeo(mergeGeometries(hullParts, false)!);
    for (const p of hullParts) p.dispose();

    const deckParts: THREE.BufferGeometry[] = [
      prepColoredPart(new THREE.BoxGeometry(bW * 0.9, 0.24, bLen * 0.92), 0xffffff, 0, bH * 0.9, 0),
      prepColoredPart(
        new THREE.CylinderGeometry(0.08, 0.12, 3.2, 6),
        0xffffff,
        0,
        bH * 0.9 + bBridgeH + 1.4,
        bBridgeZ
      ),
    ];
    const boatDeckGeo = this.trackGeo(mergeGeometries(deckParts, false)!);
    for (const p of deckParts) p.dispose();

    // Bridge uses vertexColors so dark bridge windows stay dark while accentColor tints the superstructure
    const bridgeParts: THREE.BufferGeometry[] = [
      prepColoredPart(
        new THREE.BoxGeometry(bW * 0.72, bBridgeH, bLen * 0.26),
        0xffffff,
        0,
        bH * 0.9 + bBridgeH * 0.5,
        bBridgeZ
      ),
      prepColoredPart(
        new THREE.BoxGeometry(bW * 0.74, 0.75, bLen * 0.22),
        0x111827,
        0,
        bH * 0.9 + bBridgeH * 0.72,
        bBridgeZ + 0.16
      ),
    ];
    const boatBridgeGeo = this.trackGeo(mergeGeometries(bridgeParts, false)!);
    for (const p of bridgeParts) p.dispose();

    const boatTintMat = this.trackMat(new THREE.MeshLambertMaterial({ color: 0xffffff }));
    const boatBridgeMat = this.trackMat(
      new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true })
    );

    this.boatHullInst = new THREE.InstancedMesh(boatHullGeo, boatTintMat, boatCount);
    this.boatDeckInst = new THREE.InstancedMesh(boatDeckGeo, boatTintMat, boatCount);
    this.boatBridgeInst = new THREE.InstancedMesh(boatBridgeGeo, boatBridgeMat, boatCount);
    for (const inst of [this.boatHullInst, this.boatDeckInst, this.boatBridgeInst]) {
      inst.castShadow = false;
      inst.receiveShadow = false;
      inst.frustumCulled = false;
      this.root.add(inst);
    }

    // 3. Shared InstancedMesh for all 7 ship wakes (1 draw call, hidden when far)
    this.shipWakeMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xe0f2fe,
        transparent: true,
        opacity: 0.36,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    const wakeGeo = this.trackGeo(new THREE.PlaneGeometry(1, 1));
    wakeGeo.rotateX(-Math.PI / 2);
    this.shipWakeInst = new THREE.InstancedMesh(wakeGeo, this.shipWakeMat, shipConfigs.length);
    this.shipWakeInst.castShadow = false;
    this.shipWakeInst.receiveShadow = false;
    this.shipWakeInst.frustumCulled = false;
    this.root.add(this.shipWakeInst);

    // 4. Shared InstancedMeshes for ship navigation lights (hidden during clear daylight = 0 draw calls!)
    const navGeo = this.trackGeo(new THREE.SphereGeometry(0.26, 6, 5));
    const navRedMat = this.trackMat(new THREE.MeshBasicMaterial({ color: 0xff3b3b }));
    const navGreenMat = this.trackMat(new THREE.MeshBasicMaterial({ color: 0x22ff66 }));
    const navWhiteMat = this.trackMat(new THREE.MeshBasicMaterial({ color: 0xfff8d6 }));

    this.shipNavRedInst = new THREE.InstancedMesh(navGeo, navRedMat, shipConfigs.length);
    this.shipNavGreenInst = new THREE.InstancedMesh(navGeo, navGreenMat, shipConfigs.length);
    this.shipNavWhiteInst = new THREE.InstancedMesh(navGeo, navWhiteMat, shipConfigs.length);
    for (const inst of [this.shipNavRedInst, this.shipNavGreenInst, this.shipNavWhiteInst]) {
      inst.castShadow = false;
      inst.receiveShadow = false;
      inst.frustumCulled = false;
      inst.visible = false;
      this.root.add(inst);
    }

    for (let i = 0; i < shipConfigs.length; i++) {
      const cfg = shipConfigs[i];
      const isCargo = cfg.kind === 'cargo';
      const hullLen = isCargo ? 18 : 11.5;
      const hullW = isCargo ? 5.2 : 3.6;
      const hullH = isCargo ? 2.4 : 1.5;
      const bridgeZ = isCargo ? -hullLen * 0.3 : -hullLen * 0.1;
      const bridgeH = isCargo ? 4.4 : 2.3;

      this.ships.push({
        x: cfg.centerX + Math.cos(cfg.startAngle) * cfg.radiusX,
        y: OCEAN_LEVEL,
        z: cfg.centerZ + Math.sin(cfg.startAngle) * cfg.radiusZ,
        heading: 0,
        scale: cfg.scale,
        hullColor: cfg.hullColor,
        deckColor: cfg.deckColor,
        accentColor: cfg.accentColor,
        hullLen,
        hullW,
        hullH,
        bridgeZ,
        bridgeH,
        centerX: cfg.centerX,
        centerZ: cfg.centerZ,
        radiusX: cfg.radiusX,
        radiusZ: cfg.radiusZ,
        angle: cfg.startAngle,
        angularSpeed: cfg.angularSpeed,
        bobPhase: i * 1.37,
        isCargo,
      });
    }
    this.stepShipKinematics(0);
  }

  private initCoastalGulls(): void {
    const gullSpecs = [
      { cx: BEACH_PAD_POS.x + 80, cz: BEACH_PAD_POS.z + 180, r: 145, alt: 40, speed: 0.28, phase: 0.0 },
      { cx: PORT_QUAY_POS.x - 160, cz: PORT_QUAY_POS.z, r: 135, alt: 48, speed: -0.26, phase: 2.1 },
      { cx: 1740, cz: 160, r: 140, alt: 54, speed: 0.27, phase: 4.3 },
      { cx: BEACH_PAD_POS.x - 120, cz: BEACH_PAD_POS.z + 240, r: 120, alt: 34, speed: -0.3, phase: 1.2 },
    ];

    // Merged body + orange beak (1 draw call for all gulls)
    const bodyRaw = new THREE.ConeGeometry(0.24, 1.35, 6);
    bodyRaw.rotateX(Math.PI / 2);
    const beakRaw = new THREE.ConeGeometry(0.08, 0.32, 5);
    beakRaw.rotateX(Math.PI / 2);
    const gullParts = [
      prepColoredPart(bodyRaw, 0xf8fafc, 0, 0, 0),
      prepColoredPart(beakRaw, 0xf59e0b, 0, 0, 0.78),
    ];
    const mergedBodyGeo = this.trackGeo(mergeGeometries(gullParts, false)!);
    for (const p of gullParts) p.dispose();
    const gullBodyMat = this.trackMat(
      new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true })
    );
    this.gullBodyInst = new THREE.InstancedMesh(mergedBodyGeo, gullBodyMat, gullSpecs.length);
    this.gullBodyInst.castShadow = false;
    this.gullBodyInst.receiveShadow = false;
    this.gullBodyInst.frustumCulled = false;
    this.gullBodyInst.count = 0;
    this.gullBodyInst.visible = false;
    this.root.add(this.gullBodyInst);

    // Flapping wing InstancedMesh (2 instances per visible gull = 1 draw call total)
    const wingGeo = this.trackGeo(new THREE.BoxGeometry(1.45, 0.06, 0.42));
    wingGeo.translate(0.72, 0, 0);
    const wingMat = this.trackMat(new THREE.MeshLambertMaterial({ color: 0xe2e8f0 }));
    this.gullWingInst = new THREE.InstancedMesh(wingGeo, wingMat, gullSpecs.length * 2);
    this.gullWingInst.castShadow = false;
    this.gullWingInst.receiveShadow = false;
    this.gullWingInst.frustumCulled = false;
    this.gullWingInst.count = 0;
    this.gullWingInst.visible = false;
    this.root.add(this.gullWingInst);

    for (let i = 0; i < gullSpecs.length; i++) {
      const sp = gullSpecs[i];
      this.gulls.push({
        centerX: sp.cx,
        centerZ: sp.cz,
        radius: sp.r,
        altitude: sp.alt,
        angle: sp.phase,
        angularSpeed: sp.speed,
        flapSpeed: 5.4 + i * 0.65,
        flapPhase: i * 1.9,
      });
    }
  }

  private syncCarInstances(
    lightsFactor: number,
    cameraPos?: THREE.Vector3,
    cameraFrustum?: THREE.Frustum
  ): void {
    const roadY = 3.06;
    const showNightDots = lightsFactor > 0.1;
    const nearDistSqMax = 220 * 220;
    const farDistSqMax = 780 * 780;

    let nearIdx = 0;
    let farDotIdx = 0;

    for (let i = 0; i < this.cars.length; i++) {
      const c = this.cars[i];

      let distSq = 0;
      if (cameraPos) {
        const dx = c.x - cameraPos.x;
        const dy = roadY + 0.6 - cameraPos.y;
        const dz = c.z - cameraPos.z;
        distSq = dx * dx + dy * dy + dz * dz;

        if (distSq > farDistSqMax) continue;
        if (!showNightDots && distSq > nearDistSqMax) continue;
      }

      if (cameraFrustum) {
        _cullSphere.center.set(c.x, roadY + 0.8, c.z);
        _cullSphere.radius = 5.5;
        if (!cameraFrustum.intersectsSphere(_cullSphere)) continue;
      }

      const sinY = Math.sin(c.yaw);
      const cosY = Math.cos(c.yaw);

      // NEAR LOD (<= 220m): Full 3D car body, cabin, headlights, taillights & asphalt beam
      if (!cameraPos || distSq <= nearDistSqMax) {
        // 1. Lower Chassis
        _dummy.position.set(c.x, roadY + 0.42, c.z);
        _dummy.rotation.set(0, c.yaw, 0);
        _dummy.scale.set(1, 1, c.lengthScale);
        _dummy.updateMatrix();
        this.carBodyInst.setMatrixAt(nearIdx, _dummy.matrix);
        _tmpColor.setHex(c.colorHex);
        this.carBodyInst.setColorAt(nearIdx, _tmpColor);

        // 2. Greenhouse Cabin (slightly aft of center)
        _dummy.position.set(c.x - sinY * 0.16, roadY + 0.92, c.z - cosY * 0.16);
        _dummy.rotation.set(0, c.yaw, 0);
        _dummy.scale.set(1, 1, c.lengthScale);
        _dummy.updateMatrix();
        this.carCabinInst.setMatrixAt(nearIdx, _dummy.matrix);

        // 3. Front Headlights (+Z)
        const frontDist = 1.82 * c.lengthScale;
        _dummy.position.set(c.x + sinY * frontDist, roadY + 0.48, c.z + cosY * frontDist);
        _dummy.rotation.set(0, c.yaw, 0);
        _dummy.scale.set(1, 1, 1);
        _dummy.updateMatrix();
        this.carHeadlightInst.setMatrixAt(nearIdx, _dummy.matrix);

        // 4. Rear Taillights (-Z)
        const rearDist = 1.82 * c.lengthScale;
        _dummy.position.set(c.x - sinY * rearDist, roadY + 0.5, c.z - cosY * rearDist);
        _dummy.rotation.set(0, c.yaw, 0);
        _dummy.scale.set(1, 1, 1);
        _dummy.updateMatrix();
        this.carTaillightInst.setMatrixAt(nearIdx, _dummy.matrix);

        // 5. Forward Headlight Asphalt Glow Pool
        if (lightsFactor > 0.08) {
          const beamDist = 5.1 * c.lengthScale;
          _dummy.position.set(c.x + sinY * beamDist, roadY + 0.07, c.z + cosY * beamDist);
          _dummy.rotation.set(0, c.yaw, 0);
          _dummy.scale.set(1, 1, 1);
          _dummy.updateMatrix();
          this.carBeamInst.setMatrixAt(nearIdx, _dummy.matrix);
        }

        nearIdx++;
      } else if (showNightDots && cameraPos) {
        // FAR LOD (> 220m, at dusk/night/storm): Hide 3D mesh, show ONLY 2 crisp twin headlight + 2 twin taillight dots!
        const dist = Math.sqrt(distSq);
        const dotSize = THREE.MathUtils.clamp(0.95 + (dist - 220) * 0.0042, 0.95, 2.85);
        _dotScale.set(dotSize, dotSize, 1);

        // Lateral right axis perpendicular to heading (+Z fwd -> right is cosY, -sinY)
        const rx = cosY * 0.62;
        const rz = -sinY * 0.62;
        const fwdDist = 1.75 * c.lengthScale;
        const fx = c.x + sinY * fwdDist;
        const fz = c.z + cosY * fwdDist;
        const bx = c.x - sinY * fwdDist;
        const bz = c.z - cosY * fwdDist;
        const dotY = roadY + 0.72;

        // Compute billboard orientation facing camera once per car
        _dotPos.set(c.x, dotY, c.z);
        _dotLookMat.lookAt(cameraPos, _dotPos, _dotUp);
        _dotQuat.setFromRotationMatrix(_dotLookMat);

        // Left & Right front headlights (2 glowing points)
        _dotPos.set(fx + rx, dotY, fz + rz);
        _dotMat.compose(_dotPos, _dotQuat, _dotScale);
        this.farCarHeadDotInst.setMatrixAt(farDotIdx, _dotMat);

        _dotPos.set(fx - rx, dotY, fz - rz);
        _dotMat.compose(_dotPos, _dotQuat, _dotScale);
        this.farCarHeadDotInst.setMatrixAt(farDotIdx + 1, _dotMat);

        // Left & Right rear taillights (2 glowing red points)
        _dotPos.set(bx + rx, dotY, bz + rz);
        _dotMat.compose(_dotPos, _dotQuat, _dotScale);
        this.farCarTailDotInst.setMatrixAt(farDotIdx, _dotMat);

        _dotPos.set(bx - rx, dotY, bz - rz);
        _dotMat.compose(_dotPos, _dotQuat, _dotScale);
        this.farCarTailDotInst.setMatrixAt(farDotIdx + 1, _dotMat);

        farDotIdx += 2;
      }
    }

    const hasNear = nearIdx > 0;
    this.carBodyInst.count = nearIdx;
    this.carCabinInst.count = nearIdx;
    this.carHeadlightInst.count = nearIdx;
    this.carTaillightInst.count = nearIdx;
    this.carBeamInst.count = lightsFactor > 0.08 ? nearIdx : 0;

    this.carBodyInst.visible = hasNear;
    this.carCabinInst.visible = hasNear;
    this.carHeadlightInst.visible = hasNear;
    this.carTaillightInst.visible = hasNear;
    this.carBeamInst.visible = hasNear && lightsFactor > 0.08;

    if (hasNear) {
      this.carBodyInst.instanceMatrix.needsUpdate = true;
      if (this.carBodyInst.instanceColor) this.carBodyInst.instanceColor.needsUpdate = true;
      this.carCabinInst.instanceMatrix.needsUpdate = true;
      this.carHeadlightInst.instanceMatrix.needsUpdate = true;
      this.carTaillightInst.instanceMatrix.needsUpdate = true;
      if (lightsFactor > 0.08) this.carBeamInst.instanceMatrix.needsUpdate = true;
    }

    const hasFarDots = showNightDots && farDotIdx > 0;
    this.farCarHeadDotInst.count = farDotIdx;
    this.farCarTailDotInst.count = farDotIdx;
    this.farCarHeadDotInst.visible = hasFarDots;
    this.farCarTailDotInst.visible = hasFarDots;
    if (hasFarDots) {
      this.farCarHeadDotInst.instanceMatrix.needsUpdate = true;
      this.farCarTailDotInst.instanceMatrix.needsUpdate = true;
    }
  }

  /**
   * Advances lightweight offshore ship orbital positions before camera update so
   * Fly-By ship vantages remain 100% locked with zero 1-frame lag.
   */
  public stepShipKinematics(dt: number): void {
    this.shipsKinematicsSteppedThisFrame = true;
    for (let i = 0; i < this.ships.length; i++) {
      const s = this.ships[i];
      s.angle += s.angularSpeed * dt;

      let sx = s.centerX + Math.cos(s.angle) * s.radiusX;
      let sz = s.centerZ + Math.sin(s.angle) * s.radiusZ;

      const distFromOrigin = Math.hypot(sx, sz);
      const polar = Math.atan2(sz, sx);
      const minSafeR = getIslandCoastRadius(polar) + 46;
      if (distFromOrigin < minSafeR) {
        const push = minSafeR / Math.max(1, distFromOrigin);
        sx *= push;
        sz *= push;
      }

      const vx = -Math.sin(s.angle) * s.radiusX * s.angularSpeed;
      const vz = Math.cos(s.angle) * s.radiusZ * s.angularSpeed;
      const heading = Math.atan2(vx, vz);

      s.x = sx;
      s.z = sz;
      s.heading = heading;
    }
  }

  public update(
    elapsed: number,
    dt: number,
    nightFactor: number,
    duskFactor: number,
    weather: WeatherMode,
    cameraPos?: THREE.Vector3,
    cameraFrustum?: THREE.Frustum
  ): void {
    const lightsFactor = THREE.MathUtils.clamp(
      Math.max(
        nightFactor,
        duskFactor * 0.85,
        weather === 'STORM' ? 0.94 : weather === 'BLIZZARD' ? 0.68 : weather === 'FOG' ? 0.55 : 0
      ),
      0,
      1
    );

    // 1. Update Car Headlights, Taillights, Asphalt Pools & Far Night Light Dots
    this.carHeadlightMat.emissiveIntensity = 0.12 + lightsFactor * 4.6;
    this.carTaillightMat.emissiveIntensity = 0.1 + lightsFactor * 4.0;
    this.carBeamMat.opacity = lightsFactor * (weather === 'STORM' ? 0.28 : 0.24);
    this.farCarHeadDotMat.opacity = lightsFactor * 0.92;
    this.farCarTailDotMat.opacity = lightsFactor * 0.86;

    // 2. O CONE: Check if the entire city district is inside camera frustum & within max traffic range
    const cityInView =
      !cameraFrustum ||
      (cameraFrustum.intersectsSphere(this.urbanCullSphere) &&
        (!cameraPos ||
          cameraPos.distanceTo(this.urbanCullSphere.center) - this.urbanCullSphere.radius < 820));

    if (cityInView) {
      // Advance Ambient City Cars along the validated road grid (zero-GC neighbor selection)
      const posBlend = 1 - Math.exp(-8.0 * dt);
      const yawBlend = 1 - Math.exp(-7.5 * dt);
      for (let i = 0; i < this.cars.length; i++) {
        const c = this.cars[i];
        const fromNode = AMBIENT_ROAD_NODES[c.fromNode];
        const toNode = AMBIENT_ROAD_NODES[c.toNode];
        const segLen = Math.max(1, Math.hypot(toNode.x - fromNode.x, toNode.z - fromNode.z));

        c.progress += (c.speed * dt) / segLen;
        if (c.progress >= 1) {
          c.progress -= 1;
          const arrivedId = c.toNode;
          const arrivedNode = AMBIENT_ROAD_NODES[arrivedId];
          const neighbors = arrivedNode.neighbors;
          let validCount = 0;
          for (let n = 0; n < neighbors.length; n++) {
            if (neighbors[n] !== c.fromNode) validCount++;
          }
          let nextId = neighbors[0];
          if (validCount > 0) {
            let pick = Math.floor(Math.random() * validCount);
            for (let n = 0; n < neighbors.length; n++) {
              if (neighbors[n] !== c.fromNode) {
                if (pick === 0) {
                  nextId = neighbors[n];
                  break;
                }
                pick--;
              }
            }
          }
          c.fromNode = arrivedId;
          c.toNode = nextId;
        }

        const curFrom = AMBIENT_ROAD_NODES[c.fromNode];
        const curTo = AMBIENT_ROAD_NODES[c.toNode];
        const dx = curTo.x - curFrom.x;
        const dz = curTo.z - curFrom.z;
        const len = Math.max(1, Math.hypot(dx, dz));
        const dirX = dx / len;
        const dirZ = dz / len;
        const rightX = -dirZ;
        const rightZ = dirX;

        const targetX = THREE.MathUtils.lerp(curFrom.x, curTo.x, c.progress) + rightX * c.laneOffset;
        const targetZ = THREE.MathUtils.lerp(curFrom.z, curTo.z, c.progress) + rightZ * c.laneOffset;

        c.x += (targetX - c.x) * posBlend;
        c.z += (targetZ - c.z) * posBlend;

        const desiredYaw = Math.atan2(dirX, dirZ);
        const yawDiff = shortestAngleDiff(c.yaw, desiredYaw);
        c.yaw += yawDiff * yawBlend;
      }

      this.syncCarInstances(lightsFactor, cameraPos, cameraFrustum);
    } else {
      // City is behind the camera or too far: pause all car visual uploads & hide meshes
      this.carBodyInst.visible = false;
      this.carCabinInst.visible = false;
      this.carHeadlightInst.visible = false;
      this.carTaillightInst.visible = false;
      this.carBeamInst.visible = false;
      this.farCarHeadDotInst.visible = false;
      this.farCarTailDotInst.visible = false;
    }

    // 3. Advance Offshore Ships/Boats (batched InstancedMesh + 1 merged Cargo Mesh)
    if (!this.shipsKinematicsSteppedThisFrame) {
      this.stepShipKinematics(dt);
    }
    this.shipsKinematicsSteppedThisFrame = false;

    const stormWaveMult = weather === 'STORM' ? 2.55 : weather === 'BLIZZARD' ? 1.45 : 1.0;
    const showNavLights = lightsFactor > 0.08;
    this.shipWakeMat.opacity = 0.36 * (1 - nightFactor * 0.45);

    let boatVisIdx = 0;
    let wakeVisIdx = 0;
    let navVisIdx = 0;
    this.cargoShipMesh.visible = false;

    for (let i = 0; i < this.ships.length; i++) {
      const s = this.ships[i];
      let shipInView = true;
      let shipDistSq = 0;

      if (cameraPos) {
        const dx = s.x - cameraPos.x;
        const dz = s.z - cameraPos.z;
        shipDistSq = dx * dx + dz * dz;
      }
      if (cameraFrustum) {
        _cullSphere.center.set(s.x, OCEAN_LEVEL + 2, s.z);
        _cullSphere.radius = s.isCargo ? 58 : 34;
        shipInView = cameraFrustum.intersectsSphere(_cullSphere);
      }

      if (!shipInView) continue;

      const bob = Math.sin(elapsed * 1.65 + s.bobPhase) * 0.26 * stormWaveMult;
      const roll = Math.sin(elapsed * 1.25 + s.bobPhase) * 0.055 * stormWaveMult;
      const pitch = Math.cos(elapsed * 1.45 + s.bobPhase) * 0.032 * stormWaveMult;
      s.y = OCEAN_LEVEL + bob;

      _dummy.position.set(s.x, s.y, s.z);
      _dummy.rotation.set(pitch, s.heading, roll);
      _dummy.scale.setScalar(s.scale);
      _dummy.updateMatrix();
      _shipMat.copy(_dummy.matrix);

      if (s.isCargo) {
        this.cargoShipMesh.visible = true;
        this.cargoShipMesh.position.set(s.x, s.y, s.z);
        this.cargoShipMesh.rotation.set(pitch, s.heading, roll);
      } else {
        this.boatHullInst.setMatrixAt(boatVisIdx, _shipMat);
        _tmpColor.setHex(s.hullColor);
        this.boatHullInst.setColorAt(boatVisIdx, _tmpColor);

        this.boatDeckInst.setMatrixAt(boatVisIdx, _shipMat);
        _tmpColor.setHex(s.deckColor);
        this.boatDeckInst.setColorAt(boatVisIdx, _tmpColor);

        this.boatBridgeInst.setMatrixAt(boatVisIdx, _shipMat);
        _tmpColor.setHex(s.accentColor);
        this.boatBridgeInst.setColorAt(boatVisIdx, _tmpColor);
        boatVisIdx++;
      }

      // Wake plane (only within 680m)
      if (!cameraPos || shipDistSq < 680 * 680) {
        const wakePulse = 0.92 + Math.sin(elapsed * 3.6 + s.bobPhase) * 0.14;
        const wakeLenPulse = 0.94 + Math.cos(elapsed * 2.8 + s.bobPhase) * 0.1;
        _childDummy.position.set(0, 0.18, -s.hullLen * 1.28);
        _childDummy.rotation.set(0, 0, 0);
        _childDummy.scale.set(s.hullW * 1.15 * wakePulse, 1, s.hullLen * 1.65 * wakeLenPulse);
        _childDummy.updateMatrix();
        _wingMat.multiplyMatrices(_shipMat, _childDummy.matrix);
        this.shipWakeInst.setMatrixAt(wakeVisIdx++, _wingMat);
      }

      // Navigation lights (visible at dusk/night/storm)
      if (showNavLights) {
        _childDummy.rotation.set(0, 0, 0);
        _childDummy.scale.set(1, 1, 1);

        _childDummy.position.set(s.hullW * 0.48, s.hullH + 0.6, s.hullLen * 0.25);
        _childDummy.updateMatrix();
        _wingMat.multiplyMatrices(_shipMat, _childDummy.matrix);
        this.shipNavRedInst.setMatrixAt(navVisIdx, _wingMat);

        _childDummy.position.set(-s.hullW * 0.48, s.hullH + 0.6, s.hullLen * 0.25);
        _childDummy.updateMatrix();
        _wingMat.multiplyMatrices(_shipMat, _childDummy.matrix);
        this.shipNavGreenInst.setMatrixAt(navVisIdx, _wingMat);

        _childDummy.position.set(0, s.hullH * 0.9 + s.bridgeH + (s.isCargo ? 1.2 : 3.0), s.bridgeZ);
        _childDummy.updateMatrix();
        _wingMat.multiplyMatrices(_shipMat, _childDummy.matrix);
        this.shipNavWhiteInst.setMatrixAt(navVisIdx, _wingMat);
        navVisIdx++;
      }
    }

    const hasBoats = boatVisIdx > 0;
    this.boatHullInst.count = boatVisIdx;
    this.boatDeckInst.count = boatVisIdx;
    this.boatBridgeInst.count = boatVisIdx;
    this.boatHullInst.visible = hasBoats;
    this.boatDeckInst.visible = hasBoats;
    this.boatBridgeInst.visible = hasBoats;
    if (hasBoats) {
      this.boatHullInst.instanceMatrix.needsUpdate = true;
      if (this.boatHullInst.instanceColor) this.boatHullInst.instanceColor.needsUpdate = true;
      this.boatDeckInst.instanceMatrix.needsUpdate = true;
      if (this.boatDeckInst.instanceColor) this.boatDeckInst.instanceColor.needsUpdate = true;
      this.boatBridgeInst.instanceMatrix.needsUpdate = true;
      if (this.boatBridgeInst.instanceColor) this.boatBridgeInst.instanceColor.needsUpdate = true;
    }

    this.shipWakeInst.count = wakeVisIdx;
    this.shipWakeInst.visible = wakeVisIdx > 0;
    if (wakeVisIdx > 0) this.shipWakeInst.instanceMatrix.needsUpdate = true;

    const hasNav = showNavLights && navVisIdx > 0;
    this.shipNavRedInst.count = navVisIdx;
    this.shipNavGreenInst.count = navVisIdx;
    this.shipNavWhiteInst.count = navVisIdx;
    this.shipNavRedInst.visible = hasNav;
    this.shipNavGreenInst.visible = hasNav;
    this.shipNavWhiteInst.visible = hasNav;
    if (hasNav) {
      this.shipNavRedInst.instanceMatrix.needsUpdate = true;
      this.shipNavGreenInst.instanceMatrix.needsUpdate = true;
      this.shipNavWhiteInst.instanceMatrix.needsUpdate = true;
    }

    // 4. Daytime Coastal Seagulls (2 InstancedMeshes total, hidden > 480m or outside frustum)
    const showGulls = nightFactor < 0.72 && weather !== 'STORM' && weather !== 'BLIZZARD';
    let gullVisIdx = 0;
    if (showGulls) {
      for (let i = 0; i < this.gulls.length; i++) {
        const g = this.gulls[i];
        g.angle += g.angularSpeed * dt;
        const gx = g.centerX + Math.cos(g.angle) * g.radius;
        const gz = g.centerZ + Math.sin(g.angle) * g.radius;
        const gy = g.altitude + Math.sin(elapsed * 0.9 + g.flapPhase) * 2.8;

        if (cameraPos) {
          const dx = gx - cameraPos.x;
          const dy = gy - cameraPos.y;
          const dz = gz - cameraPos.z;
          if (dx * dx + dy * dy + dz * dz > 480 * 480) continue;
        }
        if (cameraFrustum) {
          _cullSphere.center.set(gx, gy, gz);
          _cullSphere.radius = 6;
          if (!cameraFrustum.intersectsSphere(_cullSphere)) continue;
        }

        const vx = -Math.sin(g.angle) * g.radius * g.angularSpeed;
        const vz = Math.cos(g.angle) * g.radius * g.angularSpeed;
        const heading = Math.atan2(vx, vz);
        const bank = g.angularSpeed > 0 ? -0.26 : 0.26;

        _dummy.position.set(gx, gy, gz);
        _dummy.rotation.set(0, heading, bank);
        _dummy.scale.set(1, 1, 1);
        _dummy.updateMatrix();
        _gullMat.copy(_dummy.matrix);
        this.gullBodyInst.setMatrixAt(gullVisIdx, _gullMat);

        const glideCycle = Math.sin(elapsed * 0.7 + g.flapPhase);
        const flapAmp = glideCycle > -0.15 ? 0.52 : 0.08;
        const flap = Math.sin(elapsed * g.flapSpeed + g.flapPhase) * flapAmp;

        // Left wing (+X)
        _childDummy.position.set(0.14, 0.06, 0.05);
        _childDummy.rotation.set(0, 0, flap);
        _childDummy.scale.set(1, 1, 1);
        _childDummy.updateMatrix();
        _wingMat.multiplyMatrices(_gullMat, _childDummy.matrix);
        this.gullWingInst.setMatrixAt(gullVisIdx * 2, _wingMat);

        // Right wing (-X, mirrored via rotation.y = PI so +X geometry extends along -X)
        _childDummy.position.set(-0.14, 0.06, 0.05);
        _childDummy.rotation.set(0, Math.PI, flap);
        _childDummy.scale.set(1, 1, 1);
        _childDummy.updateMatrix();
        _wingMat.multiplyMatrices(_gullMat, _childDummy.matrix);
        this.gullWingInst.setMatrixAt(gullVisIdx * 2 + 1, _wingMat);

        gullVisIdx++;
      }
    }

    const hasGulls = gullVisIdx > 0;
    this.gullBodyInst.count = gullVisIdx;
    this.gullWingInst.count = gullVisIdx * 2;
    this.gullBodyInst.visible = hasGulls;
    this.gullWingInst.visible = hasGulls;
    if (hasGulls) {
      this.gullBodyInst.instanceMatrix.needsUpdate = true;
      this.gullWingInst.instanceMatrix.needsUpdate = true;
    }
  }

  public getShipVantageByIndex(index: number, out: THREE.Vector3): boolean {
    const s = this.ships[index];
    if (!s) return false;
    const sc = s.scale;
    const heading = s.heading;
    // Place camera on elevated forward bow/bridge deck looking cleanly above deck structures
    const localForward = (s.isCargo ? 6.8 : 4.2) * sc;
    const localUp = (s.isCargo ? 5.8 : 4.1) * sc;
    out.set(
      s.x + Math.sin(heading) * localForward,
      s.y + localUp,
      s.z + Math.cos(heading) * localForward
    );
    return true;
  }

  public getShipCameraVantages(): Array<{ index: number; x: number; y: number; z: number }> {
    const list: Array<{ index: number; x: number; y: number; z: number }> = [];
    for (let i = 0; i < this.ships.length; i++) {
      if (this.getShipVantageByIndex(i, _tmpVantage)) {
        list.push({ index: i, x: _tmpVantage.x, y: _tmpVantage.y, z: _tmpVantage.z });
      }
    }
    return list;
  }

  public dispose(): void {
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
    for (const t of this.textures) t.dispose();
    this.geometries = [];
    this.materials = [];
    this.textures = [];
  }
}
