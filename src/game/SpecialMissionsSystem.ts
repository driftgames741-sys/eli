import * as THREE from 'three';
import { SEARCHLIGHT_SPOT_ANGLE } from './HelicopterModel';
import { getTerrainHeight, OCEAN_LEVEL, URBAN_ROAD_NODES } from './WorldData';
import type {
  ActivePolicePursuitState,
  ActiveWinchRescueState,
  WinchRescueKind,
  WinchStatus,
} from './types';

interface RoadNode {
  id: number;
  x: number;
  z: number;
  neighbors: number[];
  district: string;
}

function getUrbanDistrictLabel(x: number, z: number): string {
  if (x <= -480) return 'Zona Portuária';
  if (x >= 165) return 'Centro Financeiro';
  if (z <= -150) return 'Parque Norte';
  if (z >= 240) return 'Distrito Sul';
  if (x <= -220) return 'Setor Médico';
  return 'Avenida Central';
}

// Shared validated flat urban avenue intersections (9x8 expanded avenues, y = 3.04m)
const CITY_ROAD_NODES: RoadNode[] = URBAN_ROAD_NODES.map((n, id) => ({
  id,
  x: n.x,
  z: n.z,
  neighbors: n.neighbors,
  district: getUrbanDistrictLabel(n.x, n.z),
}));

interface WinchSiteSpec {
  id: string;
  kind: WinchRescueKind;
  title: string;
  locationLabel: string;
  x: number;
  z: number;
  reward: number;
  xpReward: number;
}

const WINCH_RESCUE_SITES: WinchSiteSpec[] = [
  {
    id: 'winch_sea_sol',
    kind: 'sea',
    title: 'Resgate no Mar — Bote à Deriva',
    locationLabel: 'Oceano · Costa do Sol',
    x: 1120,
    z: 1740,
    reward: 1120,
    xpReward: 155,
  },
  {
    id: 'winch_mountain_east',
    kind: 'mountain',
    title: 'Resgate Alpino — Esquiador Ferido',
    locationLabel: 'Cordilheira · Encosta Leste',
    x: 420,
    z: -1290,
    reward: 1260,
    xpReward: 175,
  },
  {
    id: 'winch_sea_west',
    kind: 'sea',
    title: 'Resgate no Mar — Náufrago',
    locationLabel: 'Alto-Mar · Baía do Porto',
    x: -1460,
    z: 40,
    reward: 1160,
    xpReward: 160,
  },
  {
    id: 'winch_mountain_west',
    kind: 'mountain',
    title: 'Resgate Alpino — Alpinista Preso',
    locationLabel: 'Cordilheira · Crista Oeste',
    x: -360,
    z: -1240,
    reward: 1290,
    xpReward: 180,
  },
  {
    id: 'winch_sea_rig_alpha',
    kind: 'sea',
    title: 'Resgate Offshore — Tripulante no Mar',
    locationLabel: 'Alto-Mar · Setor Oil Rig Alpha (>1.5 km)',
    x: 2420,
    z: 1860,
    reward: 1840,
    xpReward: 245,
  },
  {
    id: 'winch_desert_canyon',
    kind: 'mountain',
    title: 'Resgate no Cânion — Explorador Ferido',
    locationLabel: 'Deserto & Cânion · Sudoeste',
    x: -690,
    z: 1190,
    reward: 1180,
    xpReward: 165,
  },
  {
    id: 'winch_sea_rig_bravo',
    kind: 'sea',
    title: 'Resgate Offshore — Mergulhador à Deriva',
    locationLabel: 'Alto-Mar · Setor Oil Rig Bravo (>1.5 km)',
    x: 2140,
    z: -1960,
    reward: 1880,
    xpReward: 250,
  },
  {
    id: 'winch_sea_rig_charlie',
    kind: 'sea',
    title: 'Resgate Offshore — Balsa de Emergência',
    locationLabel: 'Alto-Mar · Setor Oil Rig Charlie (>1.5 km)',
    x: -2340,
    z: 860,
    reward: 1860,
    xpReward: 245,
  },
];

interface FlareSmokePuff {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  scale0: number;
}

export interface SpecialMissionsUpdateInput {
  dt: number;
  elapsedSec: number;
  nightFactor: number;
  heliPos: THREE.Vector3;
  heliVel: THREE.Vector3;
  heliAccel: THREE.Vector3;
  isLanded: boolean;
  searchlightOn: boolean;
  beamOriginWorld: THREE.Vector3;
  beamTargetWorld: THREE.Vector3;
  winchAnchorWorld?: THREE.Vector3;
  rescueRewardMult: number;
}

export interface SpecialMissionsEvents {
  pursuitCompleted: {
    title: string;
    districtLabel: string;
    reward: number;
    xpReward: number;
  } | null;
  winchPatientHoisted: {
    title: string;
    locationLabel: string;
    kind: WinchRescueKind;
    reward: number;
    xpReward: number;
  } | null;
  winchAudioMode: 'none' | 'lowering' | 'hoisting';
}

// Reusable pre-allocated vectors (zero GC in render loop)
const _rayDir = new THREE.Vector3();
const _toCar = new THREE.Vector3();
const _closestOnRay = new THREE.Vector3();
const _carPos = new THREE.Vector3();

function shortestAngleDiff(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Manages Phase 6 3D special missions:
 * 1. Police Pursuit (autonomous city suspect car + spotlight interception + cruiser lights)
 * 2. Winch / Cable Rescue (drifting ocean boat / injured alpine skier + distress flares + helicopter hoist rig)
 */
export class SpecialMissionsSystem {
  public readonly root = new THREE.Group();

  private geometries: THREE.BufferGeometry[] = [];
  private materials: THREE.Material[] = [];

  // === POLICE PURSUIT 3D ACTORS ===
  private pursuitActive = false;
  private pursuitIntercepted = false;
  private pursuitCleanupTimer = 0;
  private pursuitId = '';
  private pursuitReward = 760;
  private pursuitXp = 115;
  private pursuitTracking = 0; // 0..100
  private pursuitInSpotlight = false;
  private pursuitFromNode = 0;
  private pursuitToNode = 1;
  private pursuitPrevNode = -1;
  private pursuitSegProgress = 0;
  private pursuitCarPos = new THREE.Vector3(6, 3.06, 50);
  private pursuitCarYaw = 0;
  private pursuitSpeed = 16.5;

  private suspectCarGroup = new THREE.Group();
  private suspectLockRing: THREE.Mesh;
  private suspectLockRingMat: THREE.MeshBasicMaterial;
  private suspectHeadlightBeamMat: THREE.MeshBasicMaterial;

  private policeCruiserGroup = new THREE.Group();
  private cruiserRedMat: THREE.MeshStandardMaterial;
  private cruiserBlueMat: THREE.MeshStandardMaterial;
  private cruiserStrobeHalo: THREE.Mesh;
  private cruiserStrobeHaloMat: THREE.MeshBasicMaterial;

  // === WINCH RESCUE 3D ACTORS ===
  private winchActive = false;
  private winchSite: WinchSiteSpec | null = null;
  private winchSiteIndex = 0;
  private winchStatus: WinchStatus = 'STOWED';
  private winchHoistPercent = 0; // 0..100
  private winchCableLen = 0;
  private winchInHoverZone = false;
  private winchHoverHint = '';
  private winchTargetPos = new THREE.Vector3();
  private winchSwingX = 0;
  private winchSwingZ = 0;
  private winchSwingVelX = 0;
  private winchSwingVelZ = 0;
  private winchDeliveryPadName = 'Hospital Metropolitano';

  private seaBoatGroup = new THREE.Group();
  private seaSurvivorArm: THREE.Mesh;
  private mountainSkierGroup = new THREE.Group();
  private mountainSkierArm: THREE.Mesh;
  private flareGlowMesh: THREE.Mesh;
  private flareGlowMat: THREE.MeshBasicMaterial;
  private flareSmokeGeo: THREE.BufferGeometry;
  private flareSmokeMatRed: THREE.MeshBasicMaterial;
  private flareSmokeMatOrange: THREE.MeshBasicMaterial;
  private flarePuffs: FlareSmokePuff[] = [];
  private flareEmitTimer = 0;

  // Ground/water hover alignment guide ring
  private hoverGuideGroup = new THREE.Group();
  private hoverOuterRingMat: THREE.MeshBasicMaterial;
  private hoverInnerRingMat: THREE.MeshBasicMaterial;

  // Helicopter winch cable + rescuer/basket assembly
  private winchRigGroup = new THREE.Group();
  private winchCableMesh: THREE.Mesh;
  private winchBasketGroup = new THREE.Group();
  private winchBasketVictim: THREE.Group;

  constructor() {
    this.root.name = 'SpecialMissionsSystem';

    // 1. Build Suspect Pursuit Car (composite 10-part low-poly sports sedan)
    const {
      lockRing,
      lockRingMat,
      headlightBeamMat,
    } = this.buildSuspectCar();
    this.suspectLockRing = lockRing;
    this.suspectLockRingMat = lockRingMat;
    this.suspectHeadlightBeamMat = headlightBeamMat;
    this.suspectCarGroup.visible = false;
    this.root.add(this.suspectCarGroup);

    // 2. Build Intercepting Police Cruiser with flashing Red/Blue bar
    const cruiser = this.buildPoliceCruiser();
    this.cruiserRedMat = cruiser.redMat;
    this.cruiserBlueMat = cruiser.blueMat;
    this.cruiserStrobeHalo = cruiser.strobeHalo;
    this.cruiserStrobeHaloMat = cruiser.strobeHaloMat;
    this.policeCruiserGroup.visible = false;
    this.root.add(this.policeCruiserGroup);

    // 3. Build Sea Rescue Boat & Mountain Injured Skier
    this.seaSurvivorArm = this.buildSeaRescueBoat();
    this.seaBoatGroup.visible = false;
    this.root.add(this.seaBoatGroup);

    this.mountainSkierArm = this.buildMountainSkier();
    this.mountainSkierGroup.visible = false;
    this.root.add(this.mountainSkierGroup);

    // Zero-cost additive distress flare glow halo (replaces PointLight for max GPU FPS)
    this.flareGlowMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xff3322,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    this.flareGlowMesh = new THREE.Mesh(
      this.trackGeo(new THREE.SphereGeometry(2.6, 10, 8)),
      this.flareGlowMat
    );
    this.flareGlowMesh.visible = false;
    this.root.add(this.flareGlowMesh);

    this.flareSmokeGeo = this.trackGeo(new THREE.DodecahedronGeometry(0.46, 0));
    this.flareSmokeMatRed = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xff4d4d,
        transparent: true,
        opacity: 0.62,
        depthWrite: false,
      })
    );
    this.flareSmokeMatOrange = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xff8c2b,
        transparent: true,
        opacity: 0.62,
        depthWrite: false,
      })
    );

    for (let i = 0; i < 16; i++) {
      const m = new THREE.Mesh(this.flareSmokeGeo, this.flareSmokeMatRed);
      m.visible = false;
      this.root.add(m);
      this.flarePuffs.push({
        mesh: m,
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 1.8,
        scale0: 0.7,
      });
    }

    // 4. Build Discreet Ground/Water Hover Alignment Guide Ring
    const hoverGuide = this.buildHoverGuideRing();
    this.hoverOuterRingMat = hoverGuide.outerMat;
    this.hoverInnerRingMat = hoverGuide.innerMat;
    this.hoverGuideGroup.visible = false;
    this.root.add(this.hoverGuideGroup);

    // 5. Build Helicopter Winch Cable + Rescue Basket + Rescuer + Hoisted Victim
    const winchParts = this.buildWinchRig();
    this.winchCableMesh = winchParts.cableMesh;
    this.winchBasketVictim = winchParts.victimGroup;
    this.winchRigGroup.visible = false;
    this.root.add(this.winchRigGroup);
  }

  private trackGeo<T extends THREE.BufferGeometry>(g: T): T {
    this.geometries.push(g);
    return g;
  }

  private trackMat<T extends THREE.Material>(m: T): T {
    this.materials.push(m);
    return m;
  }

  private buildSuspectCar(): {
    lockRing: THREE.Mesh;
    lockRingMat: THREE.MeshBasicMaterial;
    headlightBeamMat: THREE.MeshBasicMaterial;
  } {
    const paintMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x2a1426,
        roughness: 0.3,
        metalness: 0.58,
      })
    );
    const accentStripeMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xdc2626,
        roughness: 0.38,
        metalness: 0.35,
      })
    );
    const glassMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        roughness: 0.1,
        metalness: 0.85,
      })
    );
    const tireMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x111827,
        roughness: 0.92,
        metalness: 0.05,
      })
    );
    const rimMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xcbd5e1,
        roughness: 0.28,
        metalness: 0.85,
      })
    );
    const headlightMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xfffbeb,
        emissive: 0xfff7cc,
        emissiveIntensity: 3.8,
        roughness: 0.15,
      })
    );
    const taillightMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xef4444,
        emissive: 0xff1f1f,
        emissiveIntensity: 3.4,
        roughness: 0.2,
      })
    );

    // Lower sports chassis (facing +Z in local space)
    const chassis = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(2.15, 0.72, 4.7)), paintMat);
    chassis.position.set(0, 0.68, 0);
    chassis.castShadow = false;
    chassis.receiveShadow = true;
    this.suspectCarGroup.add(chassis);

    // Racing stripe along hood & roof
    const stripe = new THREE.Mesh(
      this.trackGeo(new THREE.BoxGeometry(0.44, 0.05, 4.55)),
      accentStripeMat
    );
    stripe.position.set(0, 1.05, 0.02);
    this.suspectCarGroup.add(stripe);

    // Sloped greenhouse cabin
    const cabin = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(1.78, 0.62, 2.25)), glassMat);
    cabin.position.set(0, 1.32, -0.18);
    cabin.castShadow = false;
    this.suspectCarGroup.add(cabin);

    const roofCap = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(1.66, 0.08, 1.75)), paintMat);
    roofCap.position.set(0, 1.65, -0.2);
    this.suspectCarGroup.add(roofCap);

    // Rear spoiler wing
    const spoilerWing = new THREE.Mesh(
      this.trackGeo(new THREE.BoxGeometry(2.05, 0.1, 0.42)),
      accentStripeMat
    );
    spoilerWing.position.set(0, 1.24, -2.05);
    this.suspectCarGroup.add(spoilerWing);

    // 4 Wheels + alloy rims
    const wheelGeo = this.trackGeo(new THREE.CylinderGeometry(0.38, 0.38, 0.32, 10));
    wheelGeo.rotateZ(Math.PI / 2);
    const rimGeo = this.trackGeo(new THREE.CylinderGeometry(0.21, 0.21, 0.34, 8));
    rimGeo.rotateZ(Math.PI / 2);
    const wheelOffsets: Array<[number, number]> = [
      [-1.06, 1.45],
      [1.06, 1.45],
      [-1.06, -1.45],
      [1.06, -1.45],
    ];
    for (const [wx, wz] of wheelOffsets) {
      const wheel = new THREE.Mesh(wheelGeo, tireMat);
      wheel.position.set(wx, 0.38, wz);
      this.suspectCarGroup.add(wheel);
      const rim = new THREE.Mesh(rimGeo, rimMat);
      rim.position.set(wx, 0.38, wz);
      this.suspectCarGroup.add(rim);
    }

    // Twin headlights (+Z front) & twin red taillights (-Z rear)
    const lampGeo = this.trackGeo(new THREE.BoxGeometry(0.46, 0.2, 0.1));
    for (const sx of [-0.68, 0.68]) {
      const hl = new THREE.Mesh(lampGeo, headlightMat);
      hl.position.set(sx, 0.72, 2.34);
      this.suspectCarGroup.add(hl);

      const tl = new THREE.Mesh(lampGeo, taillightMat);
      tl.position.set(sx, 0.74, -2.34);
      this.suspectCarGroup.add(tl);
    }

    // Forward additive headlight glow beams on asphalt
    const headlightBeamMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xfff7cc,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      })
    );
    const beamGeo = this.trackGeo(new THREE.PlaneGeometry(3.8, 12.5));
    beamGeo.rotateX(-Math.PI / 2);
    const beamMesh = new THREE.Mesh(beamGeo, headlightBeamMat);
    beamMesh.position.set(0, 0.1, 8.4);
    this.suspectCarGroup.add(beamMesh);

    // Subtle tracking lock-on ring on street around suspect car
    const lockRingMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xef4444,
        transparent: true,
        opacity: 0.62,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    const lockGeo = this.trackGeo(new THREE.RingGeometry(3.1, 3.65, 28));
    lockGeo.rotateX(-Math.PI / 2);
    const lockRing = new THREE.Mesh(lockGeo, lockRingMat);
    lockRing.position.set(0, 0.12, 0);
    this.suspectCarGroup.add(lockRing);

    return { lockRing, lockRingMat, headlightBeamMat };
  }

  private buildPoliceCruiser(): {
    redMat: THREE.MeshStandardMaterial;
    blueMat: THREE.MeshStandardMaterial;
    strobeHalo: THREE.Mesh;
    strobeHaloMat: THREE.MeshBasicMaterial;
  } {
    const blackMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.36, metalness: 0.45 })
    );
    const whiteMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.42, metalness: 0.15 })
    );
    const glassMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.1, metalness: 0.8 })
    );
    const tireMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.92 })
    );
    const redMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xff2222,
        emissive: 0xff1e1e,
        emissiveIntensity: 4.5,
        roughness: 0.2,
      })
    );
    const blueMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x2563eb,
        emissive: 0x3b82f6,
        emissiveIntensity: 4.5,
        roughness: 0.2,
      })
    );

    const lower = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(2.15, 0.72, 4.75)), blackMat);
    lower.position.set(0, 0.68, 0);
    lower.castShadow = false;
    this.policeCruiserGroup.add(lower);

    const whiteDoorSection = new THREE.Mesh(
      this.trackGeo(new THREE.BoxGeometry(2.18, 0.68, 2.05)),
      whiteMat
    );
    whiteDoorSection.position.set(0, 0.7, -0.08);
    this.policeCruiserGroup.add(whiteDoorSection);

    const cabin = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(1.82, 0.62, 2.2)), glassMat);
    cabin.position.set(0, 1.32, -0.1);
    this.policeCruiserGroup.add(cabin);

    const roof = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(1.74, 0.1, 1.85)), whiteMat);
    roof.position.set(0, 1.66, -0.1);
    this.policeCruiserGroup.add(roof);

    // Front push-bar
    const pushBar = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(1.65, 0.42, 0.22)), blackMat);
    pushBar.position.set(0, 0.66, 2.45);
    this.policeCruiserGroup.add(pushBar);

    // 4 wheels
    const wheelGeo = this.trackGeo(new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10));
    wheelGeo.rotateZ(Math.PI / 2);
    for (const [wx, wz] of [
      [-1.06, 1.45],
      [1.06, 1.45],
      [-1.06, -1.45],
      [1.06, -1.45],
    ]) {
      const w = new THREE.Mesh(wheelGeo, tireMat);
      w.position.set(wx, 0.38, wz);
      this.policeCruiserGroup.add(w);
    }

    // Flashing Red / Blue LED roof lightbar
    const barMount = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(1.22, 0.14, 0.3)), blackMat);
    barMount.position.set(0, 1.76, -0.05);
    this.policeCruiserGroup.add(barMount);

    const redLamp = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(0.55, 0.18, 0.32)), redMat);
    redLamp.position.set(-0.32, 1.82, -0.05);
    this.policeCruiserGroup.add(redLamp);

    const blueLamp = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(0.55, 0.18, 0.32)), blueMat);
    blueLamp.position.set(0.32, 1.82, -0.05);
    this.policeCruiserGroup.add(blueLamp);

    // Zero-cost additive ground strobe reflection pool (replaces PointLight for max GPU FPS)
    const strobeHaloGeo = this.trackGeo(new THREE.CircleGeometry(5.2, 14));
    strobeHaloGeo.rotateX(-Math.PI / 2);
    const strobeHaloMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: 0x3b82f6,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    const strobeHalo = new THREE.Mesh(strobeHaloGeo, strobeHaloMat);
    strobeHalo.position.set(0, 0.12, 0);
    this.policeCruiserGroup.add(strobeHalo);

    return { redMat, blueMat, strobeHalo, strobeHaloMat };
  }

  private buildSeaRescueBoat(): THREE.Mesh {
    const orangeMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.48, metalness: 0.08 })
    );
    const whiteMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.55, metalness: 0.06 })
    );
    const darkMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.65, metalness: 0.35 })
    );
    const vestMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.5 })
    );
    const skinMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0xf1c27d, roughness: 0.72 })
    );
    const flareMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xff2a2a,
        emissive: 0xff2222,
        emissiveIntensity: 4.5,
      })
    );

    // Boat floor deck
    const deck = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(2.1, 0.28, 4.4)), whiteMat);
    deck.position.set(0, 0.22, 0);
    deck.castShadow = true;
    this.seaBoatGroup.add(deck);

    // Side inflatable pontoons
    const tubeGeo = this.trackGeo(new THREE.CylinderGeometry(0.42, 0.42, 4.3, 10));
    tubeGeo.rotateX(Math.PI / 2);
    for (const sx of [-1.1, 1.1]) {
      const tube = new THREE.Mesh(tubeGeo, orangeMat);
      tube.position.set(sx, 0.48, 0);
      tube.castShadow = true;
      this.seaBoatGroup.add(tube);
    }

    // Rounded bow pontoon cap
    const bowCap = new THREE.Mesh(
      this.trackGeo(new THREE.TorusGeometry(1.1, 0.42, 8, 14, Math.PI)),
      orangeMat
    );
    bowCap.rotation.x = Math.PI / 2;
    bowCap.rotation.z = Math.PI;
    bowCap.position.set(0, 0.48, 2.1);
    this.seaBoatGroup.add(bowCap);

    // Stern transom & outboard engine
    const transom = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(2.2, 0.65, 0.25)), darkMat);
    transom.position.set(0, 0.55, -2.1);
    this.seaBoatGroup.add(transom);

    const motor = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(0.5, 0.95, 0.55)), darkMat);
    motor.position.set(0, 0.68, -2.42);
    this.seaBoatGroup.add(motor);

    // Bench & survivor in high-vis life jacket
    const bench = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(1.9, 0.14, 0.5)), whiteMat);
    bench.position.set(0, 0.58, 0.2);
    this.seaBoatGroup.add(bench);

    const torso = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(0.55, 0.72, 0.36)), vestMat);
    torso.position.set(0, 1.02, 0.15);
    this.seaBoatGroup.add(torso);

    const head = new THREE.Mesh(this.trackGeo(new THREE.SphereGeometry(0.24, 10, 8)), skinMat);
    head.position.set(0, 1.56, 0.15);
    this.seaBoatGroup.add(head);

    // Animated waving arm holding distress flare
    const armGeo = this.trackGeo(new THREE.BoxGeometry(0.18, 0.62, 0.18));
    armGeo.translate(0, 0.25, 0);
    const arm = new THREE.Mesh(armGeo, orangeMat);
    arm.position.set(0.36, 1.24, 0.15);
    const flareTip = new THREE.Mesh(this.trackGeo(new THREE.SphereGeometry(0.14, 8, 8)), flareMat);
    flareTip.position.set(0, 0.6, 0);
    arm.add(flareTip);
    this.seaBoatGroup.add(arm);

    return arm;
  }

  private buildMountainSkier(): THREE.Mesh {
    const jacketMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0xe11d48, roughness: 0.55 })
    );
    const pantsMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.78 })
    );
    const helmetMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.32, metalness: 0.18 })
    );
    const skiMatA = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0x0ea5e9, roughness: 0.3, metalness: 0.25 })
    );
    const skiMatB = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.3, metalness: 0.25 })
    );
    const flareMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xff7a1a,
        emissive: 0xff6a00,
        emissiveIntensity: 4.5,
      })
    );

    // Seated snow pad / rescue blanket under skier
    const blanket = new THREE.Mesh(
      this.trackGeo(new THREE.CylinderGeometry(1.45, 1.55, 0.12, 12)),
      this.trackMat(new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.4, metalness: 0.5 }))
    );
    blanket.position.set(0, 0.08, 0);
    this.mountainSkierGroup.add(blanket);

    // Seated legs + torso + backpack + helmet
    const legs = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(0.62, 0.32, 0.92)), pantsMat);
    legs.position.set(0, 0.28, 0.35);
    this.mountainSkierGroup.add(legs);

    const torso = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(0.62, 0.78, 0.44)), jacketMat);
    torso.position.set(0, 0.76, -0.05);
    torso.castShadow = true;
    this.mountainSkierGroup.add(torso);

    const pack = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(0.46, 0.58, 0.28)), pantsMat);
    pack.position.set(0, 0.76, -0.38);
    this.mountainSkierGroup.add(pack);

    const head = new THREE.Mesh(this.trackGeo(new THREE.SphereGeometry(0.25, 10, 8)), helmetMat);
    head.position.set(0, 1.34, -0.02);
    this.mountainSkierGroup.add(head);

    // Waving rescue arm
    const armGeo = this.trackGeo(new THREE.BoxGeometry(0.18, 0.65, 0.18));
    armGeo.translate(0, 0.26, 0);
    const arm = new THREE.Mesh(armGeo, jacketMat);
    arm.position.set(0.38, 1.0, -0.02);
    this.mountainSkierGroup.add(arm);

    // Crossed upright skis planted in snow as a high-contrast X distress signal
    const skiGeo = this.trackGeo(new THREE.BoxGeometry(0.18, 2.35, 0.07));
    const ski1 = new THREE.Mesh(skiGeo, skiMatA);
    ski1.position.set(-0.9, 1.15, -0.6);
    ski1.rotation.z = 0.36;
    this.mountainSkierGroup.add(ski1);

    const ski2 = new THREE.Mesh(skiGeo, skiMatB);
    ski2.position.set(-0.9, 1.15, -0.54);
    ski2.rotation.z = -0.36;
    this.mountainSkierGroup.add(ski2);

    // Glowing orange snow flare planted next to skier
    const flareStick = new THREE.Mesh(
      this.trackGeo(new THREE.CylinderGeometry(0.06, 0.07, 0.55, 8)),
      this.trackMat(new THREE.MeshStandardMaterial({ color: 0xea580c, roughness: 0.6 }))
    );
    flareStick.position.set(0.95, 0.3, 0.55);
    this.mountainSkierGroup.add(flareStick);

    const flareHead = new THREE.Mesh(this.trackGeo(new THREE.SphereGeometry(0.18, 8, 8)), flareMat);
    flareHead.position.set(0.95, 0.62, 0.55);
    this.mountainSkierGroup.add(flareHead);

    return arm;
  }

  private buildHoverGuideRing(): {
    outerMat: THREE.MeshBasicMaterial;
    innerMat: THREE.MeshBasicMaterial;
  } {
    const outerMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xf59e0b,
        transparent: true,
        opacity: 0.52,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    const innerMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xfef08a,
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );

    const outerGeo = this.trackGeo(new THREE.RingGeometry(11.6, 12.6, 36));
    outerGeo.rotateX(-Math.PI / 2);
    const outerMesh = new THREE.Mesh(outerGeo, outerMat);
    this.hoverGuideGroup.add(outerMesh);

    const innerGeo = this.trackGeo(new THREE.RingGeometry(3.4, 4.05, 28));
    innerGeo.rotateX(-Math.PI / 2);
    const innerMesh = new THREE.Mesh(innerGeo, innerMat);
    this.hoverGuideGroup.add(innerMesh);

    return { outerMat, innerMat };
  }

  private buildWinchRig(): {
    cableMesh: THREE.Mesh;
    victimGroup: THREE.Group;
  } {
    const steelMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0xd4dbe3, roughness: 0.32, metalness: 0.85 })
    );
    const basketMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.42, metalness: 0.2 })
    );
    const hookMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.35, metalness: 0.45 })
    );
    const suitMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.55 })
    );
    const helmetMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.28 })
    );

    // Unit-length cable stretched downward from y = 0 to y = -1
    const cableGeo = this.trackGeo(new THREE.CylinderGeometry(0.042, 0.042, 1, 6));
    cableGeo.translate(0, -0.5, 0);
    const cableMesh = new THREE.Mesh(cableGeo, steelMat);
    this.winchRigGroup.add(cableMesh);

    // Basket + Rescuer assembly hung at bottom of cable
    const hook = new THREE.Mesh(this.trackGeo(new THREE.CylinderGeometry(0.14, 0.18, 0.34, 8)), hookMat);
    hook.position.set(0, 0.85, 0);
    this.winchBasketGroup.add(hook);

    // Rescue basket frame & bottom pan
    const basketPan = new THREE.Mesh(
      this.trackGeo(new THREE.BoxGeometry(0.95, 0.24, 1.75)),
      basketMat
    );
    basketPan.position.set(0, 0, 0);
    basketPan.castShadow = true;
    this.winchBasketGroup.add(basketPan);

    const railGeo = this.trackGeo(new THREE.BoxGeometry(0.08, 0.42, 1.72));
    for (const rx of [-0.46, 0.46]) {
      const rail = new THREE.Mesh(railGeo, steelMat);
      rail.position.set(rx, 0.25, 0);
      this.winchBasketGroup.add(rail);
    }

    // 4 Slings connecting basket corners up to hook
    const slingGeo = this.trackGeo(new THREE.CylinderGeometry(0.022, 0.022, 0.92, 5));
    for (const [sx, sz] of [
      [-0.4, -0.68],
      [0.4, -0.68],
      [-0.4, 0.68],
      [0.4, 0.68],
    ]) {
      const sling = new THREE.Mesh(slingGeo, steelMat);
      sling.position.set(sx * 0.55, 0.5, sz * 0.55);
      sling.rotation.z = sx > 0 ? 0.34 : -0.34;
      sling.rotation.x = sz > 0 ? -0.45 : 0.45;
      this.winchBasketGroup.add(sling);
    }

    // Paramedic rescuer standing beside/clipped to harness
    const medicTorso = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(0.42, 0.62, 0.28)), suitMat);
    medicTorso.position.set(0.62, 0.34, 0);
    this.winchBasketGroup.add(medicTorso);

    const medicHelmet = new THREE.Mesh(
      this.trackGeo(new THREE.SphereGeometry(0.19, 8, 8)),
      helmetMat
    );
    medicHelmet.position.set(0.62, 0.78, 0);
    this.winchBasketGroup.add(medicHelmet);

    // Rescued victim placed inside the basket during hoisting
    const victimGroup = new THREE.Group();
    const vicBody = new THREE.Mesh(
      this.trackGeo(new THREE.BoxGeometry(0.56, 0.28, 1.15)),
      this.trackMat(new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.5 }))
    );
    vicBody.position.set(0, 0.24, 0.05);
    victimGroup.add(vicBody);
    const vicHead = new THREE.Mesh(
      this.trackGeo(new THREE.SphereGeometry(0.18, 8, 8)),
      this.trackMat(new THREE.MeshStandardMaterial({ color: 0xf1c27d, roughness: 0.72 }))
    );
    vicHead.position.set(0, 0.32, -0.62);
    victimGroup.add(vicHead);
    victimGroup.visible = false;
    this.winchBasketGroup.add(victimGroup);

    this.winchRigGroup.add(this.winchBasketGroup);
    return { cableMesh, victimGroup };
  }

  // === MISSION LIFECYCLE API ===

  public clearAll(): void {
    this.clearPursuit();
    this.clearWinchRescue();
  }

  public clearPursuit(): void {
    this.pursuitActive = false;
    this.pursuitIntercepted = false;
    this.pursuitCleanupTimer = 0;
    this.pursuitTracking = 0;
    this.pursuitInSpotlight = false;
    this.suspectCarGroup.visible = false;
    this.policeCruiserGroup.visible = false;
    this.cruiserStrobeHaloMat.opacity = 0;
    this.cruiserStrobeHalo.visible = false;
  }

  public clearWinchRescue(): void {
    this.winchActive = false;
    this.winchSite = null;
    this.winchStatus = 'STOWED';
    this.winchHoistPercent = 0;
    this.winchCableLen = 0;
    this.winchInHoverZone = false;
    this.winchHoverHint = '';
    this.seaBoatGroup.visible = false;
    this.mountainSkierGroup.visible = false;
    this.hoverGuideGroup.visible = false;
    this.winchRigGroup.visible = false;
    this.winchBasketVictim.visible = false;
    this.flareGlowMesh.visible = false;
    this.flareGlowMat.opacity = 0;
    for (let i = 0; i < this.flarePuffs.length; i++) {
      this.flarePuffs[i].life = 0;
      this.flarePuffs[i].mesh.visible = false;
    }
  }

  public spawnPolicePursuit(rewardMult: number): {
    districtLabel: string;
    x: number;
    z: number;
    reward: number;
    xpReward: number;
  } {
    this.clearAll();
    const startIdx = Math.floor(Math.random() * CITY_ROAD_NODES.length);
    const startNode = CITY_ROAD_NODES[startIdx];
    const nextIdx = startNode.neighbors[Math.floor(Math.random() * startNode.neighbors.length)];
    const nextNode = CITY_ROAD_NODES[nextIdx];

    this.pursuitActive = true;
    this.pursuitIntercepted = false;
    this.pursuitCleanupTimer = 0;
    this.pursuitId = `pursuit_${Date.now()}`;
    this.pursuitFromNode = startIdx;
    this.pursuitToNode = nextIdx;
    this.pursuitPrevNode = startIdx;
    this.pursuitSegProgress = 0.12;
    this.pursuitTracking = 0;
    this.pursuitInSpotlight = false;
    this.pursuitSpeed = 18.8;
    this.pursuitReward = Math.round(780 * rewardMult);
    this.pursuitXp = 120;

    this.pursuitCarPos.set(
      THREE.MathUtils.lerp(startNode.x, nextNode.x, this.pursuitSegProgress),
      3.06,
      THREE.MathUtils.lerp(startNode.z, nextNode.z, this.pursuitSegProgress)
    );
    this.pursuitCarYaw = Math.atan2(nextNode.x - startNode.x, nextNode.z - startNode.z);

    this.suspectCarGroup.position.copy(this.pursuitCarPos);
    this.suspectCarGroup.rotation.set(0, this.pursuitCarYaw, 0);
    this.suspectCarGroup.visible = true;
    this.policeCruiserGroup.visible = false;
    this.cruiserStrobeHaloMat.opacity = 0;
    this.cruiserStrobeHalo.visible = false;

    return {
      districtLabel: startNode.district,
      x: this.pursuitCarPos.x,
      z: this.pursuitCarPos.z,
      reward: this.pursuitReward,
      xpReward: this.pursuitXp,
    };
  }

  public spawnWinchRescue(
    rewardMult: number,
    deliveryPadName: string
  ): {
    kind: WinchRescueKind;
    title: string;
    locationLabel: string;
    x: number;
    z: number;
    reward: number;
    xpReward: number;
  } {
    this.clearAll();
    const site = WINCH_RESCUE_SITES[this.winchSiteIndex % WINCH_RESCUE_SITES.length];
    this.winchSiteIndex += 1;

    this.winchActive = true;
    this.winchSite = {
      ...site,
      reward: Math.round(site.reward * rewardMult),
    };
    this.winchStatus = 'STOWED';
    this.winchHoistPercent = 0;
    this.winchCableLen = 0;
    this.winchInHoverZone = false;
    this.winchHoverHint = 'Aproxime-se do sinalizador';
    this.winchDeliveryPadName = deliveryPadName;
    this.winchSwingX = 0;
    this.winchSwingZ = 0;
    this.winchSwingVelX = 0;
    this.winchSwingVelZ = 0;

    const surfY =
      site.kind === 'sea' ? OCEAN_LEVEL : getTerrainHeight(site.x, site.z);
    this.winchTargetPos.set(site.x, surfY, site.z);

    if (site.kind === 'sea') {
      this.seaBoatGroup.position.copy(this.winchTargetPos);
      this.seaBoatGroup.visible = true;
      this.mountainSkierGroup.visible = false;
      this.flareGlowMat.color.setHex(0xff2a2a);
    } else {
      this.mountainSkierGroup.position.copy(this.winchTargetPos);
      this.mountainSkierGroup.visible = true;
      this.seaBoatGroup.visible = false;
      this.flareGlowMat.color.setHex(0xff7a1a);
    }

    this.flareGlowMesh.position.set(site.x, surfY + 2.2, site.z);
    this.flareGlowMesh.visible = true;

    this.hoverGuideGroup.position.set(site.x, surfY + (site.kind === 'sea' ? 0.22 : 0.45), site.z);
    this.hoverGuideGroup.visible = true;
    this.winchRigGroup.visible = false;
    this.winchBasketVictim.visible = false;

    return {
      kind: site.kind,
      title: site.title,
      locationLabel: site.locationLabel,
      x: site.x,
      z: site.z,
      reward: this.winchSite.reward,
      xpReward: site.xpReward,
    };
  }

  public isPursuitActive(): boolean {
    return this.pursuitActive;
  }

  public isWinchRescueActive(): boolean {
    return this.winchActive;
  }

  public getWinchStatus(): WinchStatus {
    return this.winchStatus;
  }

  /**
   * Called when player presses [R] during flight.
   * Returns a concise toast feedback message if relevant.
   */
  public toggleWinch(
    heliPos: THREE.Vector3,
    heliVel: THREE.Vector3,
    isLanded: boolean
  ): { toggled: boolean; title: string; detail: string; tone: 'info' | 'warning' } {
    if (!this.winchActive || !this.winchSite) {
      return {
        toggled: false,
        title: 'Guincho de Resgate',
        detail: 'Disponível durante missões de Resgate com Guincho (ON DUTY [J]).',
        tone: 'info',
      };
    }

    if (this.winchStatus === 'PATIENT_ONBOARD') {
      return {
        toggled: false,
        title: 'Paciente a Bordo',
        detail: `Leve a vítima e pouse em ${this.winchDeliveryPadName}.`,
        tone: 'info',
      };
    }

    if (isLanded) {
      return {
        toggled: false,
        title: 'Guincho Bloqueado no Solo',
        detail: 'Decole e paire acima da vítima para descer o cabo [R].',
        tone: 'warning',
      };
    }

    if (this.winchStatus === 'LOWERING' || this.winchStatus === 'HOISTING') {
      this.winchStatus = 'STOWED';
      this.winchHoistPercent = 0;
      return {
        toggled: true,
        title: 'Guincho Recolhido',
        detail: 'Cabo de resgate recolhido com segurança.',
        tone: 'info',
      };
    }

    const horizDist = Math.hypot(
      heliPos.x - this.winchTargetPos.x,
      heliPos.z - this.winchTargetPos.z
    );
    const altAbove = heliPos.y - this.winchTargetPos.y;
    const speed = Math.hypot(heliVel.x, heliVel.z);

    if (horizDist > 26) {
      return {
        toggled: false,
        title: 'Alvo Distante',
        detail: `Aproxime-se do sinalizador (${Math.round(horizDist)}m) e paire acima para usar [R].`,
        tone: 'warning',
      };
    }
    if (altAbove < 6 || altAbove > 46) {
      return {
        toggled: false,
        title: 'Altitude Inadequada',
        detail: 'Mantenha entre 10m e 36m acima do alvo para descer o guincho.',
        tone: 'warning',
      };
    }
    if (speed > 16) {
      return {
        toggled: false,
        title: 'Velocidade Alta',
        detail: 'Reduza a velocidade e paire (hover) antes de descer o cabo.',
        tone: 'warning',
      };
    }

    this.winchStatus = 'LOWERING';
    this.winchHoistPercent = 0;
    return {
      toggled: true,
      title: 'Descendo Cabo de Resgate',
      detail: 'Mantenha o helicóptero pairando estável sobre o círculo verde.',
      tone: 'info',
    };
  }

  public update(input: SpecialMissionsUpdateInput): SpecialMissionsEvents {
    const events: SpecialMissionsEvents = {
      pursuitCompleted: null,
      winchPatientHoisted: null,
      winchAudioMode: 'none',
    };

    if (this.pursuitActive) {
      events.pursuitCompleted = this.updatePolicePursuit(input);
    }

    if (this.winchActive) {
      const winchRes = this.updateWinchRescue(input);
      events.winchPatientHoisted = winchRes.hoisted;
      events.winchAudioMode = winchRes.audioMode;
    }

    return events;
  }

  private updatePolicePursuit(
    input: SpecialMissionsUpdateInput
  ): SpecialMissionsEvents['pursuitCompleted'] {
    const { dt, elapsedSec, nightFactor, heliPos, searchlightOn, beamOriginWorld, beamTargetWorld } =
      input;

    // Brighter headlight beams on road at dusk/night
    this.suspectHeadlightBeamMat.opacity = 0.08 + nightFactor * 0.24;

    // Post-interception celebration: car stopped, police cruiser flashing red/blue
    if (this.pursuitIntercepted) {
      this.pursuitCleanupTimer -= dt;
      const flashBlue = Math.sin(elapsedSec * 19.0) > 0;
      this.cruiserBlueMat.emissiveIntensity = flashBlue ? 6.5 : 0.3;
      this.cruiserRedMat.emissiveIntensity = flashBlue ? 0.3 : 6.5;
      this.cruiserStrobeHalo.visible = true;
      this.cruiserStrobeHaloMat.color.setHex(flashBlue ? 0x3b82f6 : 0xff2222);
      this.cruiserStrobeHaloMat.opacity = 0.24 + nightFactor * 0.28;
      this.suspectLockRingMat.color.setHex(flashBlue ? 0x38bdf8 : 0xef4444);
      this.suspectLockRingMat.opacity = 0.72;

      if (this.pursuitCleanupTimer <= 0) {
        this.clearPursuit();
      }
      return null;
    }

    // 1. Autonomous city driving along validated avenue graph
    const fromNode = CITY_ROAD_NODES[this.pursuitFromNode];
    const toNode = CITY_ROAD_NODES[this.pursuitToNode];
    const segLen = Math.max(1, Math.hypot(toNode.x - fromNode.x, toNode.z - fromNode.z));

    this.pursuitSegProgress += (this.pursuitSpeed * dt) / segLen;
    if (this.pursuitSegProgress >= 1) {
      this.pursuitSegProgress -= 1;
      const arrivedId = this.pursuitToNode;
      const arrivedNode = CITY_ROAD_NODES[arrivedId];
      // Prefer turns/forward over immediate U-turn
      const candidates = arrivedNode.neighbors.filter((n) => n !== this.pursuitFromNode);
      const nextId =
        candidates.length > 0
          ? candidates[Math.floor(Math.random() * candidates.length)]
          : arrivedNode.neighbors[0];

      this.pursuitPrevNode = this.pursuitFromNode;
      this.pursuitFromNode = arrivedId;
      this.pursuitToNode = nextId;
    }

    const curFrom = CITY_ROAD_NODES[this.pursuitFromNode];
    const curTo = CITY_ROAD_NODES[this.pursuitToNode];
    const targetX = THREE.MathUtils.lerp(curFrom.x, curTo.x, this.pursuitSegProgress);
    const targetZ = THREE.MathUtils.lerp(curFrom.z, curTo.z, this.pursuitSegProgress);
    this.pursuitCarPos.set(targetX, 3.06, targetZ);

    const desiredYaw = Math.atan2(curTo.x - curFrom.x, curTo.z - curFrom.z);
    const yawDiff = shortestAngleDiff(this.pursuitCarYaw, desiredYaw);
    this.pursuitCarYaw += yawDiff * (1 - Math.exp(-8.5 * dt));

    this.suspectCarGroup.position.copy(this.pursuitCarPos);
    this.suspectCarGroup.rotation.set(0, this.pursuitCarYaw, 0);

    // 2. Check if car is illuminated by Searchlight beam (or close low daytime tailing)
    _carPos.set(this.pursuitCarPos.x, this.pursuitCarPos.y + 0.9, this.pursuitCarPos.z);
    let locked = false;

    if (searchlightOn) {
      _rayDir.subVectors(beamTargetWorld, beamOriginWorld);
      const rayLen = _rayDir.length();
      if (rayLen > 0.5) {
        _rayDir.divideScalar(rayLen);
        _toCar.subVectors(_carPos, beamOriginWorld);
        const proj = _toCar.dot(_rayDir);
        if (proj > 2 && proj < 220) {
          _closestOnRay.copy(beamOriginWorld).addScaledVector(_rayDir, proj);
          const perpDist = _closestOnRay.distanceTo(_carPos);
          const coneRadiusAtCar = Math.min(14.5, proj * Math.tan(SEARCHLIGHT_SPOT_ANGLE) + 4.8);
          if (perpDist <= coneRadiusAtCar) {
            locked = true;
          }
        }
      }
      // Also check direct ground spot pool proximity for forgiving top-down/gimbal feel
      if (!locked) {
        const groundSpotDist = Math.hypot(
          beamTargetWorld.x - this.pursuitCarPos.x,
          beamTargetWorld.z - this.pursuitCarPos.z
        );
        if (groundSpotDist <= 13.5 && heliPos.distanceTo(_carPos) < 200) {
          locked = true;
        }
      }
    }

    // Daytime fallback: flying close & low directly tailing the suspect
    if (!locked && nightFactor < 0.35) {
      const horizDist = Math.hypot(
        heliPos.x - this.pursuitCarPos.x,
        heliPos.z - this.pursuitCarPos.z
      );
      const altAbove = heliPos.y - this.pursuitCarPos.y;
      if (horizDist <= 34 && altAbove <= 54) {
        locked = true;
      }
    }

    this.pursuitInSpotlight = locked;
    if (locked) {
      // ~8.7 seconds total to reach 100%
      this.pursuitTracking = Math.min(100, this.pursuitTracking + 11.6 * dt);
    } else if (this.pursuitTracking > 0) {
      this.pursuitTracking = Math.max(0, this.pursuitTracking - 2.4 * dt);
    }

    // Update ground lock ring visual feedback
    const pulse = 0.94 + Math.sin(elapsedSec * 7.5) * 0.08;
    this.suspectLockRing.scale.setScalar(pulse);
    if (locked) {
      this.suspectLockRingMat.color.setHex(0x38bdf8);
      this.suspectLockRingMat.opacity = 0.85;
    } else {
      const blinkRed = Math.sin(elapsedSec * 6.0) > 0;
      this.suspectLockRingMat.color.setHex(blinkRed ? 0xef4444 : 0x3b82f6);
      this.suspectLockRingMat.opacity = 0.52;
    }

    // 3. Interception reached 100%! Stop suspect & spawn flashing police cruiser
    if (this.pursuitTracking >= 100) {
      this.pursuitIntercepted = true;
      this.pursuitCleanupTimer = 4.2;

      // Position police cruiser angled right behind/beside the stopped suspect
      const backX = -Math.sin(this.pursuitCarYaw);
      const backZ = -Math.cos(this.pursuitCarYaw);
      const sideX = Math.cos(this.pursuitCarYaw);
      const sideZ = -Math.sin(this.pursuitCarYaw);
      this.policeCruiserGroup.position.set(
        this.pursuitCarPos.x + backX * 6.4 + sideX * 2.1,
        3.06,
        this.pursuitCarPos.z + backZ * 6.4 + sideZ * 2.1
      );
      this.policeCruiserGroup.rotation.set(0, this.pursuitCarYaw - 0.28, 0);
      this.policeCruiserGroup.visible = true;

      return {
        title: 'Perseguição Policial Concluída',
        districtLabel: curTo.district,
        reward: this.pursuitReward,
        xpReward: this.pursuitXp,
      };
    }

    return null;
  }

  private updateWinchRescue(input: SpecialMissionsUpdateInput): {
    hoisted: SpecialMissionsEvents['winchPatientHoisted'];
    audioMode: 'none' | 'lowering' | 'hoisting';
  } {
    const { dt, elapsedSec, heliPos, heliVel, heliAccel, isLanded, winchAnchorWorld } = input;
    const site = this.winchSite;
    if (!site) return { hoisted: null, audioMode: 'none' };

    let audioMode: 'none' | 'lowering' | 'hoisting' = 'none';

    // Animate sea boat bobbing or mountain skier waving + distress flare smoke
    if (this.winchStatus !== 'PATIENT_ONBOARD') {
      if (site.kind === 'sea') {
        const bob = Math.sin(elapsedSec * 2.4) * 0.24;
        const roll = Math.sin(elapsedSec * 1.9 + 0.5) * 0.08;
        const pitch = Math.cos(elapsedSec * 2.1) * 0.06;
        this.seaBoatGroup.position.set(site.x, OCEAN_LEVEL + bob, site.z);
        this.seaBoatGroup.rotation.set(pitch, 0.4 + Math.sin(elapsedSec * 0.4) * 0.08, roll);
        this.seaSurvivorArm.rotation.z = -0.35 + Math.sin(elapsedSec * 6.2) * 0.42;
      } else {
        this.mountainSkierArm.rotation.z = -0.3 + Math.sin(elapsedSec * 5.8) * 0.38;
      }

      // Pulsing additive distress flare glow halo & rising colored smoke puffs
      const fPulse = 0.88 + Math.sin(elapsedSec * 14.0) * 0.18;
      this.flareGlowMesh.visible = true;
      this.flareGlowMesh.scale.setScalar(fPulse);
      this.flareGlowMat.opacity = 0.34 * fPulse;
      this.flareEmitTimer -= dt;
      if (this.flareEmitTimer <= 0) {
        this.flareEmitTimer = 0.14;
        this.spawnFlareSmokePuff(site.kind);
      }
    } else {
      this.flareGlowMesh.visible = false;
      this.flareGlowMat.opacity = 0;
    }

    this.updateFlareSmokePuffs(dt);

    // If patient is already safely onboard, retract cable smoothly and hide hover guide
    if (this.winchStatus === 'PATIENT_ONBOARD') {
      this.hoverGuideGroup.visible = false;
      if (this.winchCableLen > 0.05) {
        this.winchCableLen = THREE.MathUtils.damp(this.winchCableLen, 0, 7.5, dt);
        this.syncWinchRigTransform(heliPos, heliAccel, dt);
      } else {
        this.winchRigGroup.visible = false;
      }
      return { hoisted: null, audioMode: 'none' };
    }

    // Evaluate hover zone alignment over the victim
    const horizDist = Math.hypot(
      heliPos.x - this.winchTargetPos.x,
      heliPos.z - this.winchTargetPos.z
    );
    const altAbove = heliPos.y - this.winchTargetPos.y;
    const horizSpeed = Math.hypot(heliVel.x, heliVel.z);

    const distOk = horizDist <= 14.0;
    const altOk = altAbove >= 8.0 && altAbove <= 36.0;
    const speedOk = horizSpeed <= 11.5;
    const inZone = !isLanded && distOk && altOk && speedOk;
    this.winchInHoverZone = inZone;

    // Live player-friendly guidance hint
    if (!distOk) {
      this.winchHoverHint = `Aproxime-se (${Math.round(horizDist)}m)`;
    } else if (!altOk) {
      this.winchHoverHint = altAbove < 8 ? 'Suba um pouco (10–35m)' : 'Desça para 10–35m';
    } else if (!speedOk) {
      this.winchHoverHint = 'Reduza velocidade (Hover)';
    } else if (this.winchStatus === 'STOWED') {
      this.winchHoverHint = 'Alinhado · Aperte [R] para Guincho';
    } else if (this.winchStatus === 'LOWERING') {
      this.winchHoverHint = 'Descendo socorrista...';
    } else {
      this.winchHoverHint = 'Içando vítima · Mantenha estável!';
    }

    // Update discreet ground/water alignment guide ring
    this.hoverGuideGroup.visible = true;
    const ringPulse = 1 + Math.sin(elapsedSec * 4.5) * 0.04;
    this.hoverGuideGroup.scale.setScalar(ringPulse);
    if (inZone) {
      this.hoverOuterRingMat.color.setHex(0x34d399);
      this.hoverInnerRingMat.color.setHex(0x6ee7b7);
      this.hoverOuterRingMat.opacity = 0.72;
    } else {
      this.hoverOuterRingMat.color.setHex(site.kind === 'sea' ? 0xf87171 : 0xfb923c);
      this.hoverInnerRingMat.color.setHex(0xfef08a);
      this.hoverOuterRingMat.opacity = 0.48;
    }

    // Target cable length reaches down from belly (-1.2m) to victim (+1.2m)
    const desiredFullCable = THREE.MathUtils.clamp(altAbove - 2.3, 4.5, 34.0);

    if (this.winchStatus === 'STOWED') {
      if (this.winchCableLen > 0.08) {
        this.winchCableLen = THREE.MathUtils.damp(this.winchCableLen, 0, 7.0, dt);
        this.syncWinchRigTransform(heliPos, heliAccel, dt, winchAnchorWorld);
      } else {
        this.winchCableLen = 0;
        this.winchRigGroup.visible = false;
      }
      return { hoisted: null, audioMode: 'none' };
    }

    if (this.winchStatus === 'LOWERING') {
      audioMode = 'lowering';
      const lowerSpeed = 8.5;
      this.winchCableLen = Math.min(desiredFullCable, this.winchCableLen + lowerSpeed * dt);
      this.winchBasketVictim.visible = false;
      this.syncWinchRigTransform(heliPos, heliAccel, dt, winchAnchorWorld);

      // Once cable reaches victim level & helicopter is aligned in hover zone, start hoisting!
      if (this.winchCableLen >= desiredFullCable - 0.35 && inZone) {
        this.winchStatus = 'HOISTING';
        this.winchHoistPercent = 5;
        this.winchBasketVictim.visible = true;
      } else if (horizDist > 34 || altAbove > 54) {
        // Auto-stow safely if pilot flies completely away
        this.winchStatus = 'STOWED';
        this.winchHoistPercent = 0;
      }
      return { hoisted: null, audioMode };
    }

    if (this.winchStatus === 'HOISTING') {
      this.winchBasketVictim.visible = true;
      if (inZone) {
        audioMode = 'hoisting';
        // ~5.2 seconds of steady hover to hoist patient into cabin
        this.winchHoistPercent = Math.min(100, this.winchHoistPercent + 19.2 * dt);
        const tRemaining = 1 - this.winchHoistPercent / 100;
        this.winchCableLen = THREE.MathUtils.damp(
          this.winchCableLen,
          Math.max(1.2, desiredFullCable * tRemaining),
          5.5,
          dt
        );
      } else if (horizDist > 34 || altAbove > 54) {
        // Flew away before completing hoist — abort safely
        this.winchStatus = 'STOWED';
        this.winchHoistPercent = 0;
        this.winchBasketVictim.visible = false;
      } else {
        // Slightly drifted: pause hoisting cleanly without punishing reset
        this.winchCableLen = THREE.MathUtils.damp(
          this.winchCableLen,
          Math.max(1.8, desiredFullCable * (1 - this.winchHoistPercent / 100)),
          3.2,
          dt
        );
      }

      this.syncWinchRigTransform(heliPos, heliAccel, dt, winchAnchorWorld);

      if (this.winchHoistPercent >= 100) {
        this.winchStatus = 'PATIENT_ONBOARD';
        this.hoverGuideGroup.visible = false;
        this.seaBoatGroup.visible = false;
        this.mountainSkierGroup.visible = false;
        this.flareGlowMesh.visible = false;
        this.flareGlowMat.opacity = 0;

        return {
          hoisted: {
            title: site.title,
            locationLabel: site.locationLabel,
            kind: site.kind,
            reward: site.reward,
            xpReward: site.xpReward,
          },
          audioMode: 'none',
        };
      }
    }

    return { hoisted: null, audioMode };
  }

  private syncWinchRigTransform(
    heliPos: THREE.Vector3,
    heliAccel: THREE.Vector3,
    dt: number,
    winchAnchorWorld?: THREE.Vector3
  ): void {
    this.winchRigGroup.visible = this.winchCableLen > 0.1;
    if (winchAnchorWorld) {
      this.winchRigGroup.position.copy(winchAnchorWorld);
    } else {
      this.winchRigGroup.position.set(heliPos.x, heliPos.y - 1.15, heliPos.z);
    }

    // Smooth pendulum sway reacting to horizontal inertia
    const springK = 9.5;
    const dampC = 3.6;
    const targetSwingX = THREE.MathUtils.clamp(-heliAccel.x * 0.016, -0.34, 0.34);
    const targetSwingZ = THREE.MathUtils.clamp(-heliAccel.z * 0.016, -0.34, 0.34);
    this.winchSwingVelX += (targetSwingX - this.winchSwingX) * springK * dt;
    this.winchSwingVelZ += (targetSwingZ - this.winchSwingZ) * springK * dt;
    this.winchSwingVelX *= Math.exp(-dampC * dt);
    this.winchSwingVelZ *= Math.exp(-dampC * dt);
    this.winchSwingX = THREE.MathUtils.clamp(this.winchSwingX + this.winchSwingVelX * dt, -0.38, 0.38);
    this.winchSwingZ = THREE.MathUtils.clamp(this.winchSwingZ + this.winchSwingVelZ * dt, -0.38, 0.38);

    this.winchRigGroup.rotation.set(this.winchSwingZ, 0, -this.winchSwingX);
    this.winchCableMesh.scale.set(1, Math.max(0.1, this.winchCableLen), 1);
    this.winchBasketGroup.position.set(0, -this.winchCableLen - 0.85, 0);
  }

  private spawnFlareSmokePuff(kind: WinchRescueKind): void {
    const mat = kind === 'sea' ? this.flareSmokeMatRed : this.flareSmokeMatOrange;
    for (let i = 0; i < this.flarePuffs.length; i++) {
      const p = this.flarePuffs[i];
      if (p.life > 0) continue;
      p.mesh.material = mat;
      p.mesh.position.set(
        this.winchTargetPos.x + (Math.random() - 0.5) * 0.8,
        this.winchTargetPos.y + 1.4,
        this.winchTargetPos.z + (Math.random() - 0.5) * 0.8
      );
      p.vel.set(
        1.1 + (Math.random() - 0.5) * 1.4,
        4.4 + Math.random() * 2.2,
        0.5 + (Math.random() - 0.5) * 1.4
      );
      p.maxLife = 1.9 + Math.random() * 0.9;
      p.life = p.maxLife;
      p.scale0 = 0.65 + Math.random() * 0.45;
      p.mesh.scale.setScalar(p.scale0);
      p.mesh.visible = true;
      return;
    }
  }

  private updateFlareSmokePuffs(dt: number): void {
    for (let i = 0; i < this.flarePuffs.length; i++) {
      const p = this.flarePuffs[i];
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.mesh.visible = false;
        continue;
      }
      p.mesh.position.addScaledVector(p.vel, dt);
      p.vel.x *= Math.exp(-0.5 * dt);
      p.vel.z *= Math.exp(-0.5 * dt);
      const progress = 1 - p.life / p.maxLife;
      p.mesh.scale.setScalar(p.scale0 * (1 + progress * 2.4) * (1 - progress * 0.35));
    }
  }

  public getPursuitTelemetry(heliX: number, heliZ: number): ActivePolicePursuitState | null {
    if (!this.pursuitActive) return null;
    const node = CITY_ROAD_NODES[this.pursuitToNode];
    return {
      id: this.pursuitId,
      title: 'Perseguição Policial',
      districtLabel: node.district,
      x: this.pursuitCarPos.x,
      y: this.pursuitCarPos.y,
      z: this.pursuitCarPos.z,
      trackingPercent: Math.round(this.pursuitTracking),
      inSpotlight: this.pursuitInSpotlight,
      intercepted: this.pursuitIntercepted,
      distanceMeters: Math.round(
        Math.hypot(this.pursuitCarPos.x - heliX, this.pursuitCarPos.z - heliZ)
      ),
      reward: this.pursuitReward,
      xpReward: this.pursuitXp,
    };
  }

  public getWinchTelemetry(heliX: number, heliZ: number): ActiveWinchRescueState | null {
    if (!this.winchActive || !this.winchSite) return null;
    return {
      id: this.winchSite.id,
      kind: this.winchSite.kind,
      title: this.winchSite.title,
      locationLabel: this.winchSite.locationLabel,
      x: this.winchTargetPos.x,
      y: this.winchTargetPos.y,
      z: this.winchTargetPos.z,
      hoistPercent: Math.round(this.winchHoistPercent),
      winchStatus: this.winchStatus,
      inHoverZone: this.winchInHoverZone,
      hoverHint: this.winchHoverHint,
      distanceMeters: Math.round(
        Math.hypot(this.winchTargetPos.x - heliX, this.winchTargetPos.z - heliZ)
      ),
      reward: this.winchSite.reward,
      xpReward: this.winchSite.xpReward,
      patientOnboard: this.winchStatus === 'PATIENT_ONBOARD',
      deliveryPadName: this.winchDeliveryPadName,
    };
  }

  public dispose(): void {
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
    this.geometries = [];
    this.materials = [];
  }
}
