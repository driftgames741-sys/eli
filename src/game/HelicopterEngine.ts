import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { AITrafficHelicopters } from './AITrafficHelicopters';
import { AudioEngine } from './AudioEngine';
import {
  computeHasSavedCareer,
  createEmptyCareerStats,
  evaluateNewAchievements,
} from './CareerStats';
import { FireSystem } from './FireSystem';
import {
  clearSavedProgress,
  createDefaultUpgrades,
  DEFAULT_COMPANY_NAME,
  getHelicopterSpec,
  getLiveryScheme,
  loadSavedProgress,
  sanitizeCompanyName,
  saveProgress,
  UPGRADE_CATALOG,
} from './FleetData';
import {
  BAMBI_CABLE_LENGTH,
  createHelicopterRig,
  SEARCHLIGHT_SPOT_ANGLE,
  type HelicopterRig,
} from './HelicopterModel';
import { LivingWorldSystem } from './LivingWorldSystem';
import { SlingLoadSystem } from './SlingLoadSystem';
import { SpecialMissionsSystem } from './SpecialMissionsSystem';
import { StormLightningSystem } from './StormLightningSystem';
import { buildCoastalIslandWorld, type WorldHandles } from './WorldBuilder';
import {
  BUILDING_SPECS,
  buildWorldMetadata,
  getSurfaceHeightAt,
  getTerrainHeight,
  getWaterLevelAt,
  isOverWater,
  LIGHTHOUSE_POS,
  OCEAN_LEVEL,
  OIL_RIGS,
  SNOW_REGION,
  WIND_TURBINES,
  WORLD_BOUNDARY_WARN_RADIUS,
  WORLD_FLIGHT_RADIUS,
} from './WorldData';
import type {
  AchievementId,
  BuildingCollider,
  CameraMode,
  CareerStats,
  DispatchAssignment,
  DispatchMissionKind,
  DutyStatus,
  FleetUpgrades,
  GamePhase,
  GraphicsQuality,
  HelicopterId,
  HelicopterSpec,
  HelipadData,
  HudNotification,
  LiveryId,
  MinimapStaticData,
  RadioStation,
  SearchlightMode,
  TelemetryState,
  TimeOfDayPeriod,
  UpgradeId,
  WeatherMode,
} from './types';

// Reusable pre-allocated math objects (zero GC allocations in animation loop)
const _vecForward = new THREE.Vector3();
const _vecRight = new THREE.Vector3();
const _vecCamTargetPos = new THREE.Vector3();
const _vecCamLookAt = new THREE.Vector3();
const _vecUp = new THREE.Vector3(0, 1, 0);
const _vecTopDownUp = new THREE.Vector3();
const _vecBucketNozzleWorld = new THREE.Vector3();
const _vecCamOffset = new THREE.Vector3();
const _groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _vecBeamOriginWorld = new THREE.Vector3();
const _vecBeamLensWorld = new THREE.Vector3();
const _vecBeamTargetWorld = new THREE.Vector3();
const _vecGimbalDesiredRel = new THREE.Vector3();
const _vecRayHit = new THREE.Vector3();
const _vecPlaneHit = new THREE.Vector3();
const _vecHeliAccel = new THREE.Vector3();
const _vecCockpitEye = new THREE.Vector3();
const _vecCockpitLook = new THREE.Vector3();
const _vecCockpitUp = new THREE.Vector3();
const _vecWinchAnchorWorld = new THREE.Vector3();
const _eulerCockpit = new THREE.Euler(0, 0, 0, 'YXZ');
const _projScreenMatrix = new THREE.Matrix4();

// Atmosphere & 3-band SkyDome color keyframes (pre-allocated)
// Vibrant Clear Day: Deep royal blue zenith (#1e4fa3) -> vivid sky blue (#3b82f6) -> luminous horizon (#b8dcff)
const _skyTopDay = new THREE.Color(0x1e4fa3);
const _skyMidDay = new THREE.Color(0x3b82f6);
const _skyHorDay = new THREE.Color(0xb8dcff);

const _skyTopDusk = new THREE.Color(0x3b2a58);
const _skyMidDusk = new THREE.Color(0x9e5a72);
const _skyHorDusk = new THREE.Color(0xf28c46);
const _skySunGlowDusk = new THREE.Color(0xffb670);

const _skyTopNight = new THREE.Color(0x050a18);
const _skyMidNight = new THREE.Color(0x0a162c);
const _skyHorNight = new THREE.Color(0x132645);

const _skySunGlowDay = new THREE.Color(0xfff4d6);
const _skySunGlowNight = new THREE.Color(0x5278b0);

// Shader cirrus cloud band colors (Crisp sunlit white cirrus by Day; peach-rose & purple at Dusk; Night; Storm)
const _skyCloudLitDay = new THREE.Color(0xffffff);
const _skyCloudShadDay = new THREE.Color(0xc5def5);
const _skyCloudLitDusk = new THREE.Color(0xf9a47c);
const _skyCloudShadDusk = new THREE.Color(0x5d3c6e);
const _skyCloudLitNight = new THREE.Color(0x1b2b4a);
const _skyCloudShadNight = new THREE.Color(0x0c162b);

// FogExp2 colors harmonized seamlessly with the SkyDome horizon (#b8dcff luminous sky-blue haze by Day)
const _fogDay = new THREE.Color(0xb8dcff);
const _fogDusk = new THREE.Color(0xc8745e);
const _fogNight = new THREE.Color(0x11223d);

// Heavy Storm SkyDome gradient (lead-gray #1e2530 zenith -> #2a3340 mid -> #36414f horizon even during day)
const _skyStormTopDay = new THREE.Color(0x1e2530);
const _skyStormMidDay = new THREE.Color(0x2a3340);
const _skyStormHorDay = new THREE.Color(0x36414f);
const _skyStormTopNight = new THREE.Color(0x090e17);
const _skyStormMidNight = new THREE.Color(0x101824);
const _skyStormHorNight = new THREE.Color(0x192332);

const _fogStormDay = new THREE.Color(0x34404e);
const _fogStormNight = new THREE.Color(0x16202e);
const _skyCloudStormLit = new THREE.Color(0x4b586a);
const _skyCloudStormShad = new THREE.Color(0x19202a);

// Blizzard Overcast SkyDome gradient (#7c8b99 cold slate zenith -> #cfd8e0 soft icy white-gray horizon)
const _skyBlizTopDay = new THREE.Color(0x7c8b99);
const _skyBlizMidDay = new THREE.Color(0xa6b5c2);
const _skyBlizHorDay = new THREE.Color(0xcfd8e0);
const _skyBlizTopNight = new THREE.Color(0x162130);
const _skyBlizMidNight = new THREE.Color(0x1f2e42);
const _skyBlizHorNight = new THREE.Color(0x2a3b52);

const _fogBlizDay = new THREE.Color(0xc8d4de);
const _fogBlizNight = new THREE.Color(0x243449);
const _skyCloudBlizLit = new THREE.Color(0xe3ebf2);
const _skyCloudBlizShad = new THREE.Color(0x95a5b5);

const _skyFogDay = new THREE.Color(0xb8ccd9);
const _skyFogDusk = new THREE.Color(0xa66c6c);
const _skyFogNight = new THREE.Color(0x162233);
const _skyFlash = new THREE.Color(0xcce6ff);

const _sunDay = new THREE.Color(0xfff5e4);
const _sunDusk = new THREE.Color(0xff9e5e);
const _sunNight = new THREE.Color(0x8bb6ed);
const _sunStorm = new THREE.Color(0x889eb8);
const _sunBliz = new THREE.Color(0xdbe8f5);

const _rimDay = new THREE.Color(0x9ed8ff);
const _rimDusk = new THREE.Color(0xffb36b);
const _rimNight = new THREE.Color(0x6b9ad4);

const _hemiSkyDay = new THREE.Color(0x87cefa);
const _hemiSkyDusk = new THREE.Color(0x9b5a7c);
const _hemiSkyNight = new THREE.Color(0x1f3459);
const _hemiSkyStorm = new THREE.Color(0x3a4759);
const _hemiSkyBliz = new THREE.Color(0x9ab0c4);

const _hemiGroundDay = new THREE.Color(0x4a5d4e);
const _hemiGroundDusk = new THREE.Color(0x3a2428);
const _hemiGroundNight = new THREE.Color(0x0b1320);
const _hemiGroundStorm = new THREE.Color(0x151c27);
const _hemiGroundBliz = new THREE.Color(0x344658);

const _snowPuffDay = new THREE.Color(0xf2f7fc);
const _snowPuffDusk = new THREE.Color(0xf4dcd4);
const _snowPuffNight = new THREE.Color(0x6c84a3);
const _tmpSnowPuffCol = new THREE.Color();

const _tmpSkyTop = new THREE.Color();
const _tmpSkyMid = new THREE.Color();
const _tmpSkyHor = new THREE.Color();
const _tmpSunGlow = new THREE.Color();
const _tmpSkyCloudLit = new THREE.Color();
const _tmpSkyCloudShad = new THREE.Color();
const _tmpFogCol = new THREE.Color();
const _tmpSun = new THREE.Color();
const _tmpRim = new THREE.Color();
const _tmpHemiSky = new THREE.Color();
const _tmpHemiGround = new THREE.Color();
const _tmpWeatherSky = new THREE.Color();
const _tmpStormTop = new THREE.Color();
const _tmpStormMid = new THREE.Color();
const _tmpStormHor = new THREE.Color();
const _tmpStormFog = new THREE.Color();
const _tmpBlizTop = new THREE.Color();
const _tmpBlizMid = new THREE.Color();
const _tmpBlizHor = new THREE.Color();
const _tmpBlizFog = new THREE.Color();
const _vecSunDir = new THREE.Vector3(0.5, 0.72, 0.48).normalize();
const _vecCamForward = new THREE.Vector3();

const RANK_TITLES = [
  'Cadete',
  'Piloto Júnior',
  'Piloto Urbano',
  'Especialista',
  'Capitão',
  'Comandante',
  'Ás da Costa',
];

const RADIO_ORDER: RadioStation[] = ['OFF', 'CHILLWAVE', 'SYNTH_80S', 'LOFI_NIGHTS'];

const RADIO_LABELS: Record<RadioStation, string> = {
  OFF: 'RÁDIO OFF',
  CHILLWAVE: 'CHILLWAVE FM',
  SYNTH_80S: 'SYNTH 80s',
  LOFI_NIGHTS: 'LO-FI NIGHTS',
};

const WEATHER_ORDER: WeatherMode[] = ['CLEAR', 'STORM', 'FOG', 'BLIZZARD'];

const WEATHER_LABELS: Record<WeatherMode, string> = {
  CLEAR: 'Céu Limpo',
  STORM: 'Tempestade',
  FOG: 'Neblina Densa',
  BLIZZARD: 'Nevasca',
};

const SEARCHLIGHT_MODE_ORDER: SearchlightMode[] = ['FRONTAL', 'VERTICAL', 'MANUAL'];

const SEARCHLIGHT_MODE_LABELS: Record<SearchlightMode, string> = {
  FRONTAL: 'FRONTAL',
  VERTICAL: 'VERTICAL',
  MANUAL: '360° MOUSE',
};

function detectSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

interface Particle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  scale0: number;
}

interface WaterDrop {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  active: boolean;
}

interface WaterRipple {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  life: number;
  maxLife: number;
  baseScale: number;
  maxScale: number;
}

interface SnowDownwashPuff {
  sprite: THREE.Sprite;
  mat: THREE.SpriteMaterial;
  centerX: number;
  groundY: number;
  centerZ: number;
  angle: number;
  radius: number;
  radialSpeed: number;
  swirlSpeed: number;
  liftHeight: number;
  life: number;
  maxLife: number;
  startScale: number;
  endScale: number;
  peakOpacity: number;
}

export interface EngineCallbacks {
  onTelemetry: (telemetry: TelemetryState) => void;
  onPhaseChange: (phase: GamePhase) => void;
  onNotification: (note: HudNotification) => void;
  onToggleHelp: () => void;
  onToggleMap: () => void;
  onToggleStats: () => void;
}

export class HelicopterEngine {
  private container: HTMLElement;
  private callbacks: EngineCallbacks;

  private isSoftwareGl: boolean;
  private graphicsQuality: GraphicsQuality;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private fog: THREE.FogExp2;
  private skyDome: THREE.Mesh;
  private skyDomeGeo: THREE.BufferGeometry;
  private skyDomeMat: THREE.ShaderMaterial;
  private sunGlowSprite: THREE.Sprite;
  private sunGlowTex: THREE.CanvasTexture;
  private sunGlowMat: THREE.SpriteMaterial;
  private sunGlowBaseVis = 1.0;
  private camera: THREE.PerspectiveCamera;
  private readonly cameraFrustum = new THREE.Frustum();
  private fpsFrameCount = 0;
  private fpsSampleStartMs = 0;
  private currentFps = 60;
  private currentDrawCalls = 0;
  private hemiLight: THREE.HemisphereLight;
  private sunLight: THREE.DirectionalLight;
  private rimLight: THREE.DirectionalLight;
  private world: WorldHandles;
  private fireSystem: FireSystem;
  private specialMissions: SpecialMissionsSystem;
  private slingLoad: SlingLoadSystem;
  private livingWorld: LivingWorldSystem;
  private aiHelicopters: AITrafficHelicopters;
  private stormLightning: StormLightningSystem;
  private heli: HelicopterRig;
  private audio: AudioEngine;

  public readonly minimapData: MinimapStaticData;
  private helipads: HelipadData[];
  private colliders: BuildingCollider[];

  // Pooled impact/wash particles (dust, snow, water spray, sparks)
  private particles: Particle[] = [];
  private particleGeo: THREE.BufferGeometry;
  private particleMatDust: THREE.MeshBasicMaterial;
  private particleMatSnow: THREE.MeshBasicMaterial;
  private particleMatSpark: THREE.MeshBasicMaterial;
  private particleMatSpray: THREE.MeshBasicMaterial;

  // Pooled expanding water-surface rotor downwash rings
  private waterRipples: WaterRipple[] = [];
  private waterRippleGeo: THREE.BufferGeometry;

  // Pooled circular swirling soft-sprite snow rotor downwash cloud
  private snowDownwashPuffs: SnowDownwashPuff[] = [];
  private snowDownwashTex: THREE.CanvasTexture;
  private snowDownwashTimer = 0;

  // Pooled Bambi Bucket falling water stream droplets
  private waterDrops: WaterDrop[] = [];
  private waterDropGeo: THREE.BufferGeometry;
  private waterDropMat: THREE.MeshBasicMaterial;

  // Game & flight state
  private phase: GamePhase = 'title';
  private cameraMode: CameraMode = 'chase';
  private dutyStatus: DutyStatus = 'OFF_DUTY';
  private missionStepIndex = 0;
  private lastMissionType = '';
  private pendingNextMissionTimer = 0;

  // Phase 3: Atmosphere, Weather, Searchlight Gimbal & FM Radio state
  private weather: WeatherMode = 'CLEAR';
  private searchlightOn = false;
  private searchlightMode: SearchlightMode = 'FRONTAL';
  private radioStation: RadioStation = 'OFF';
  private raycaster = new THREE.Raycaster();
  private mouseNdc = new THREE.Vector2(0, -0.18);
  private gimbalRelOffset = new THREE.Vector3(0, -18, -32);
  private lightningFlash = 0;
  private stormFactor = 0;
  private blizzardFactor = 0;
  private fogDensityCurrent = 0.00024;

  // Phase 4 & 9: Company customization, fleet ownership, workshop upgrades & paint livery
  private companyName = 'ROTOR OPS';
  private unlockedHelicopters: HelicopterId[] = ['mayfly', 'wren'];
  private activeHelicopterId: HelicopterId = 'wren';
  private activeSpec: HelicopterSpec = getHelicopterSpec('wren');
  private upgrades: FleetUpgrades = createDefaultUpgrades();
  private liveryId: LiveryId = 'default';
  private maxAniso = 1;
  private landingGearTarget = 1;

  private pos = new THREE.Vector3();
  private vel = new THREE.Vector3();
  private prevVel = new THREE.Vector3();
  private yaw = 0;
  private yawRate = 0;
  private pitch = 0;
  private roll = 0;

  private rotorRpm = 0.25;
  private isLanded = true;
  private landedPad: HelipadData | null = null;
  private activeDispatch: DispatchAssignment | null = null;
  private visitedPads = new Set<string>(['pad_airbase']);

  // Bambi Bucket / Integrated Ventral Water Tank state
  private bucketDeployed = false;
  private bucketDeployLerp = 0;
  private bucketWater = 0;
  private bucketSwingX = 0;
  private bucketSwingZ = 0;
  private bucketSwingVelX = 0;
  private bucketSwingVelZ = 0;
  private isScoopingWater = false;
  private isDumpingWater = false;
  private mouseDumpHeld = false;
  private waterEmitAccum = 0;
  private scoopSplashTimer = 0;
  private scoopNotified = false;
  private fullNotified = false;
  private steamAudioTimer = 0;

  // Career & ship stats
  private money = 0;
  private xp = 0;
  private level = 1;
  private fuel = 100;
  private hull = 100;
  private gameMinutes = 8 * 60; // Starts at 08:00 (advances 1 game min / 1 real sec)
  private careerStats: CareerStats = createEmptyCareerStats();
  private unlockedAchievements: AchievementId[] = [];
  private hasSavedCareer = false;
  private statsSaveAccum = 0;
  private lastAchieveDistKm = 0;

  // Feel & juice
  private cameraShake = 0;
  private hitstopTimer = 0;
  private impactCooldown = 0;
  private washTimer = 0;
  private waterRippleTimer = 0;
  private refuelToastCooldown = 0;
  private boundaryToastCooldown = 0;
  private notifCounter = 0;

  // Camera smoothing & Phase 8 cinematic orbital swoop transition state
  private camPosCurrent = new THREE.Vector3();
  private camLookCurrent = new THREE.Vector3();
  private titleOrbitAngle = 0.55;
  private camTransitionElapsed = -1;
  private readonly camTransitionDuration = 1.55;
  private camTransitionStartPos = new THREE.Vector3();
  private camTransitionStartLook = new THREE.Vector3();

  // Free 360° Orbital Camera state (relative angle locked during gameplay + smooth scroll zoom)
  private orbitAzimuthOffset = 0.52;
  private orbitPolarAngle = 0.28;
  private orbitDistTarget = 24;
  private orbitDistCurrent = 24;
  private orbitDragging = false;
  private orbitLastMouseX = 0;
  private orbitLastMouseY = 0;

  // Smart Cinematic Fly-By Camera state (anchored to nearby Oil Rigs, moving Ships, Helipads, Roofs, Hills or Ground/Sea)
  private flybyPos = new THREE.Vector3();
  private flybyAnchorShipIndex: number | null = null;
  private flybyCooldown = 0;
  private flybyCutPending = false;
  private flybySideSign = 1;
  private flybyClosestDist = Infinity;
  private flybyDeparting = false;
  private flybyDepartTimer = 0;

  // Input state
  private keys = new Set<string>();
  private frameId = 0;
  private disposed = false;
  private lastTimeMs = 0;
  private elapsedSec = 0;
  private telemetryAccum = 0;

  // Bound event listeners
  private onKeyDownBound: (e: KeyboardEvent) => void;
  private onKeyUpBound: (e: KeyboardEvent) => void;
  private onMouseDownBound: (e: MouseEvent) => void;
  private onMouseUpBound: (e: MouseEvent) => void;
  private onMouseMoveBound: (e: MouseEvent) => void;
  private onWheelBound: (e: WheelEvent) => void;
  private onContextMenuBound: (e: MouseEvent) => void;
  private onBlurBound: () => void;
  private onResizeBound: () => void;
  private onContextLostBound: (e: Event) => void;

  constructor(container: HTMLElement, callbacks: EngineCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.audio = new AudioEngine();
    this.isSoftwareGl = detectSoftwareWebGL();
    this.graphicsQuality = 'high';
    try {
      const savedQ = window.localStorage.getItem('rotor_ops_graphics_quality');
      if (savedQ === 'ultra' || savedQ === 'high' || savedQ === 'medium' || savedQ === 'low') {
        this.graphicsQuality = savedQ;
      }
    } catch {
      // Ignore storage errors in restricted iframes
    }

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl && this.graphicsQuality !== 'low',
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.setPixelRatio(this.getTargetPixelRatio(this.graphicsQuality));
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.setSize(
      container.clientWidth || window.innerWidth,
      container.clientHeight || window.innerHeight
    );

    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    container.appendChild(this.renderer.domElement);

    // Scene with procedural 3-band SkyDome ShaderMaterial (visible sun, atmospheric scattering & FBM cirrus clouds)
    this.scene = new THREE.Scene();
    const initFogColor = _fogDay.clone();
    this.scene.background = initFogColor;
    this.fog = new THREE.FogExp2(initFogColor, this.fogDensityCurrent);
    this.scene.fog = this.fog;

    this.skyDomeGeo = new THREE.SphereGeometry(10500, 32, 20);
    this.skyDomeMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uTopColor: { value: _skyTopDay.clone() },
        uMidColor: { value: _skyMidDay.clone() },
        uHorizonColor: { value: _skyHorDay.clone() },
        uFogColor: { value: _fogDay.clone() },
        uSunGlowColor: { value: _skySunGlowDay.clone() },
        uCloudLitColor: { value: _skyCloudLitDay.clone() },
        uCloudShadowColor: { value: _skyCloudShadDay.clone() },
        uCloudStrength: { value: 0.48 },
        uSunDirection: { value: new THREE.Vector3(0.5, 0.72, 0.48).normalize() },
        uSunGlowStrength: { value: 0.85 },
        uSunDiscStrength: { value: 1.0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vLocalDir;
        void main() {
          vLocalDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uTopColor;
        uniform vec3 uMidColor;
        uniform vec3 uHorizonColor;
        uniform vec3 uFogColor;
        uniform vec3 uSunGlowColor;
        uniform vec3 uCloudLitColor;
        uniform vec3 uCloudShadowColor;
        uniform float uCloudStrength;
        uniform vec3 uSunDirection;
        uniform float uSunGlowStrength;
        uniform float uSunDiscStrength;

        varying vec3 vLocalDir;

        float hash21(vec2 p) {
          p = fract(p * vec2(127.1, 311.7));
          p += dot(p, p + 34.53);
          return fract(p.x * p.y);
        }

        float valueNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          float a = hash21(i);
          float b = hash21(i + vec2(1.0, 0.0));
          float c = hash21(i + vec2(0.0, 1.0));
          float d = hash21(i + vec2(1.0, 1.0));
          return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
        }

        float fbm(vec2 p) {
          float v = 0.0;
          float amp = 0.5;
          mat2 rot = mat2(0.82, 0.57, -0.57, 0.82);
          for (int i = 0; i < 4; i++) {
            v += amp * valueNoise(p);
            p = rot * p * 2.03 + vec2(11.3, 7.1);
            amp *= 0.5;
          }
          return v;
        }

        void main() {
          vec3 dir = normalize(vLocalDir);
          float h = clamp(dir.y, 0.0, 1.0);

          // Smooth 3-band vertical gradient (Luminous Horizon -> Vivid Mid -> Deep Royal Zenith)
          float lowerMix = smoothstep(0.0, 0.28, h);
          float upperMix = smoothstep(0.2, 0.82, h);
          vec3 sky = mix(uHorizonColor, uMidColor, lowerMix);
          sky = mix(sky, uTopColor, upperMix);

          // Realistic solar atmospheric scattering (wide golden-white Mie aura + directional horizon warmth)
          vec3 sunDir = normalize(uSunDirection);
          float sunDot = max(dot(dir, sunDir), 0.0);
          vec2 dirXZ = normalize(dir.xz + vec2(1e-5, 0.0));
          vec2 sunXZ = normalize(sunDir.xz + vec2(1e-5, 0.0));
          float azimuthFocus = pow(max(dot(dirXZ, sunXZ), 0.0), 2.0);
          float horizonRibbon = pow(1.0 - clamp(abs(dir.y), 0.0, 1.0), 3.0);

          float broadScatter = pow(sunDot, 2.8) * 0.22 + pow(sunDot, 10.0) * 0.36;
          float horizonScatter = horizonRibbon * azimuthFocus * 0.44;
          sky += uSunGlowColor * (broadScatter + horizonScatter) * uSunGlowStrength;

          // Layer 1: Soft stretched high-altitude cirrus cloud wisps blended naturally into the sky
          if (dir.y > 0.015 && uCloudStrength > 0.01) {
            vec2 proj = dir.xz / (dir.y + 0.17);
            vec2 wind = vec2(uTime * 0.0085, uTime * 0.0028);
            float wisps = fbm(proj * vec2(0.46, 1.38) + wind);
            float detail = fbm(proj * vec2(1.05, 2.35) - wind * 0.65);
            float cloudShape = wisps * 0.72 + detail * 0.28;
            float cloudMask = smoothstep(0.47, 0.78, cloudShape);

            float horizonFade = smoothstep(0.02, 0.22, dir.y) * (1.0 - smoothstep(0.76, 1.0, dir.y) * 0.24);
            float alpha = cloudMask * horizonFade * uCloudStrength;

            // Sun-lit silver-white cirrus rims toward the sun direction
            float litFactor = clamp(detail * 0.58 + pow(sunDot, 2.2) * 0.62 + horizonRibbon * azimuthFocus * 0.38, 0.0, 1.0);
            vec3 cloudCol = mix(uCloudShadowColor, uCloudLitColor, litFactor);
            sky = mix(sky, cloudCol, clamp(alpha, 0.0, 0.86));
          }

          // Visible bright Sun Disc + radiant atmospheric solar corona
          vec3 sunCoreColor = mix(uSunGlowColor, vec3(1.0, 0.98, 0.92), 0.72);
          float corona = pow(sunDot, 48.0) * 0.48 + pow(sunDot, 220.0) * 0.82;
          float disc = smoothstep(0.9988, 0.99965, sunDot) * 1.95;
          sky += sunCoreColor * (corona + disc) * uSunDiscStrength;

          // Seamless lower-horizon blend into FogExp2 color so distant skyline, mountains & ocean fuse naturally
          float fogSeam = smoothstep(0.08, -0.02, dir.y);
          sky = mix(sky, uFogColor, fogSeam * 0.88);
          if (dir.y < -0.02) {
            sky = mix(uFogColor, uTopColor * 0.42, smoothstep(-0.02, -0.35, dir.y));
          }

          gl_FragColor = vec4(sky, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.skyDome = new THREE.Mesh(this.skyDomeGeo, this.skyDomeMat);
    this.skyDome.renderOrder = -10;
    this.skyDome.frustumCulled = false;
    this.scene.add(this.skyDome);

    // Translucent AdditiveBlending Sun Glow & soft solar rays sprite placed along uSunDirection
    const sunCanvas = document.createElement('canvas');
    sunCanvas.width = 256;
    sunCanvas.height = 256;
    const sCtx = sunCanvas.getContext('2d');
    if (sCtx) {
      const cx = 128;
      const cy = 128;
      // Wide soft golden-white scattering aura
      const outerGrad = sCtx.createRadialGradient(cx, cy, 0, cx, cy, 126);
      outerGrad.addColorStop(0.0, 'rgba(255, 253, 244, 0.95)');
      outerGrad.addColorStop(0.14, 'rgba(255, 247, 222, 0.72)');
      outerGrad.addColorStop(0.36, 'rgba(255, 232, 184, 0.26)');
      outerGrad.addColorStop(0.68, 'rgba(255, 214, 154, 0.06)');
      outerGrad.addColorStop(1.0, 'rgba(255, 200, 140, 0.0)');
      sCtx.fillStyle = outerGrad;
      sCtx.fillRect(0, 0, 256, 256);

      // Subtle translucent radial solar rays (soft natural lens bloom when facing the sun)
      sCtx.save();
      sCtx.translate(cx, cy);
      const rayCount = 12;
      for (let r = 0; r < rayCount; r++) {
        const angle = (r / rayCount) * Math.PI * 2 + (r % 2 === 0 ? 0.08 : -0.05);
        const rayLen = r % 2 === 0 ? 120 : 88;
        const rayWidth = r % 2 === 0 ? 9 : 6;
        sCtx.save();
        sCtx.rotate(angle);
        const rayGrad = sCtx.createLinearGradient(0, 0, rayLen, 0);
        rayGrad.addColorStop(0.0, 'rgba(255, 250, 234, 0.28)');
        rayGrad.addColorStop(0.38, 'rgba(255, 240, 204, 0.11)');
        rayGrad.addColorStop(1.0, 'rgba(255, 225, 175, 0.0)');
        sCtx.fillStyle = rayGrad;
        sCtx.beginPath();
        sCtx.moveTo(0, -rayWidth * 0.35);
        sCtx.lineTo(rayLen, -rayWidth * 0.05);
        sCtx.lineTo(rayLen, rayWidth * 0.05);
        sCtx.lineTo(0, rayWidth * 0.35);
        sCtx.closePath();
        sCtx.fill();
        sCtx.restore();
      }
      sCtx.restore();
    }
    this.sunGlowTex = new THREE.CanvasTexture(sunCanvas);
    this.sunGlowTex.colorSpace = THREE.SRGBColorSpace;
    this.sunGlowTex.needsUpdate = true;

    this.sunGlowMat = new THREE.SpriteMaterial({
      map: this.sunGlowTex,
      color: 0xfff5e0,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      fog: false,
    });
    this.sunGlowSprite = new THREE.Sprite(this.sunGlowMat);
    this.sunGlowSprite.renderOrder = -5;
    this.sunGlowSprite.frustumCulled = false;
    this.sunGlowSprite.scale.set(2150, 2150, 1);
    this.scene.add(this.sunGlowSprite);

    // Studio environment map for metallic & glass PBR reflections
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.38;
    pmremGenerator.dispose();

    const aspect =
      (container.clientWidth || window.innerWidth) /
      Math.max(1, container.clientHeight || window.innerHeight);
    this.camera = new THREE.PerspectiveCamera(58, aspect, 0.5, 13500);

    // Outdoor lighting rig dynamically driven by solar arc (Day/Dusk/Night) & Storm Lightning
    this.hemiLight = new THREE.HemisphereLight(0x87cefa, 0x4a5d4e, 0.65);
    this.scene.add(this.hemiLight);

    const sunLight = new THREE.DirectionalLight(0xfff5e4, 1.75);
    sunLight.position.set(170, 135, 138);
    sunLight.castShadow = !this.isSoftwareGl;
    const initShadowRes =
      this.graphicsQuality === 'ultra' || this.graphicsQuality === 'high' ? 1024 : 512;
    sunLight.shadow.mapSize.width = initShadowRes;
    sunLight.shadow.mapSize.height = initShadowRes;
    const shadowBound = 200;
    sunLight.shadow.camera.left = -shadowBound;
    sunLight.shadow.camera.right = shadowBound;
    sunLight.shadow.camera.top = shadowBound;
    sunLight.shadow.camera.bottom = -shadowBound;
    sunLight.shadow.camera.near = 20;
    sunLight.shadow.camera.far = 560;
    sunLight.shadow.bias = -0.0005;
    sunLight.shadow.normalBias = 0.045;
    this.scene.add(sunLight);
    this.scene.add(sunLight.target);
    this.sunLight = sunLight;

    this.rimLight = new THREE.DirectionalLight(0x8ecae6, 0.18);
    this.scene.add(this.rimLight.target);
    this.rimLight.position.set(-140, 90, -160);
    this.scene.add(this.rimLight);

    // Load persisted localStorage career progress (company name, cash, XP, fleet, upgrades, livery, stats, achievements)
    const saved = loadSavedProgress();
    this.companyName = saved.companyName;
    this.money = saved.money;
    this.xp = saved.xp;
    this.level = saved.level;
    this.unlockedHelicopters = [...saved.unlockedHelicopters];
    this.activeHelicopterId = saved.activeHelicopterId;
    this.activeSpec = getHelicopterSpec(this.activeHelicopterId);
    this.upgrades = { ...saved.upgrades };
    this.liveryId = saved.liveryId;
    this.careerStats = { ...saved.stats };
    this.unlockedAchievements = [...saved.unlockedAchievements];
    this.hasSavedCareer = computeHasSavedCareer(saved);
    this.lastAchieveDistKm = Math.floor(this.careerStats.distanceMeters / 1000);

    // Build coastal island world (with Snow Mountain Ski Resort & Offshore Oil Rig) & 3D fire system
    const meta = buildWorldMetadata();
    this.helipads = meta.helipads;
    this.colliders = meta.colliders;
    this.minimapData = meta.minimapData;

    this.maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.world = buildCoastalIslandWorld(this.helipads, this.maxAniso, this.companyName);
    this.world.setGraphicsQuality(this.graphicsQuality);
    this.scene.add(this.world.root);

    this.fireSystem = new FireSystem();
    this.scene.add(this.fireSystem.root);

    this.specialMissions = new SpecialMissionsSystem();
    this.scene.add(this.specialMissions.root);

    this.slingLoad = new SlingLoadSystem();
    this.scene.add(this.slingLoad.root);

    this.livingWorld = new LivingWorldSystem();
    this.scene.add(this.livingWorld.root);

    this.aiHelicopters = new AITrafficHelicopters(this.helipads, this.maxAniso);
    this.scene.add(this.aiHelicopters.root);

    this.stormLightning = new StormLightningSystem(this.colliders);
    this.scene.add(this.stormLightning.root);

    // Build active composite helicopter + Bambi Bucket / Ventral Tank + 360° Searchlight Gimbal
    this.heli = createHelicopterRig(this.maxAniso, this.activeHelicopterId);
    const initLivery = getLiveryScheme(this.liveryId);
    this.heli.applyLivery(initLivery.primaryHex, initLivery.secondaryHex, initLivery.accentHex);
    this.scene.add(this.heli.root);
    this.scene.add(this.heli.searchlightTarget);
    this.scene.add(this.heli.searchlightCone);
    this.scene.add(this.heli.bucketPivot);
    this.scene.add(this.heli.landingMarker);

    if (this.activeSpec.physics.hasIntegratedTank) {
      this.bucketDeployed = true;
    }

    // Pooled general particles (dust, snow, water spray, sparks)
    this.particleGeo = new THREE.DodecahedronGeometry(0.45, 0);
    this.particleMatDust = new THREE.MeshBasicMaterial({
      color: 0xd6cbb8,
      transparent: true,
      opacity: 0.56,
      depthWrite: false,
    });
    this.particleMatSnow = new THREE.MeshBasicMaterial({
      color: 0xf8fafc,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
    });
    this.particleMatSpark = new THREE.MeshBasicMaterial({
      color: 0xfbbf24,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    this.particleMatSpray = new THREE.MeshBasicMaterial({
      color: 0xe0f2fe,
      transparent: true,
      opacity: 0.76,
      depthWrite: false,
    });

    for (let i = 0; i < 64; i++) {
      const m = new THREE.Mesh(this.particleGeo, this.particleMatDust);
      m.visible = false;
      this.scene.add(m);
      this.particles.push({
        mesh: m,
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 1,
        scale0: 1,
      });
    }

    // Pooled expanding concentric water ripple rings for low-altitude rotor downwash
    this.waterRippleGeo = new THREE.RingGeometry(0.95, 1.48, 24);
    this.waterRippleGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 14; i++) {
      const rMat = new THREE.MeshBasicMaterial({
        color: 0xe0f7ff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const rMesh = new THREE.Mesh(this.waterRippleGeo, rMat);
      rMesh.visible = false;
      this.scene.add(rMesh);
      this.waterRipples.push({
        mesh: rMesh,
        mat: rMat,
        life: 0,
        maxLife: 1,
        baseScale: 1,
        maxScale: 4.5,
      });
    }

    // Pooled soft radial cotton-snow mist sprites for swirling circular snow rotor downwash
    const sdCanvas = document.createElement('canvas');
    sdCanvas.width = 128;
    sdCanvas.height = 128;
    const sdCtx = sdCanvas.getContext('2d');
    if (sdCtx) {
      const lobes: Array<[number, number, number, number]> = [
        [64, 64, 52, 0.72],
        [48, 56, 36, 0.48],
        [80, 58, 34, 0.45],
        [62, 78, 36, 0.42],
        [54, 46, 30, 0.36],
      ];
      for (const [cx, cy, r, a] of lobes) {
        const g = sdCtx.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0.0, `rgba(255, 255, 255, ${a})`);
        g.addColorStop(0.5, `rgba(240, 247, 255, ${a * 0.52})`);
        g.addColorStop(1.0, 'rgba(225, 238, 252, 0.0)');
        sdCtx.fillStyle = g;
        sdCtx.beginPath();
        sdCtx.arc(cx, cy, r, 0, Math.PI * 2);
        sdCtx.fill();
      }
    }
    this.snowDownwashTex = new THREE.CanvasTexture(sdCanvas);
    this.snowDownwashTex.colorSpace = THREE.SRGBColorSpace;
    this.snowDownwashTex.needsUpdate = true;

    for (let i = 0; i < 54; i++) {
      const sMat = new THREE.SpriteMaterial({
        map: this.snowDownwashTex,
        color: 0xf2f7fc,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        fog: true,
      });
      const sprite = new THREE.Sprite(sMat);
      sprite.visible = false;
      this.scene.add(sprite);
      this.snowDownwashPuffs.push({
        sprite,
        mat: sMat,
        centerX: 0,
        groundY: 0,
        centerZ: 0,
        angle: 0,
        radius: 2,
        radialSpeed: 8,
        swirlSpeed: 2.2,
        liftHeight: 2.4,
        life: 0,
        maxLife: 1.1,
        startScale: 2.2,
        endScale: 7.4,
        peakOpacity: 0.52,
      });
    }

    // Pooled Bambi Bucket water stream droplets
    this.waterDropGeo = new THREE.IcosahedronGeometry(0.55, 0);
    this.waterDropMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
    });

    for (let i = 0; i < 64; i++) {
      const m = new THREE.Mesh(this.waterDropGeo, this.waterDropMat);
      m.visible = false;
      this.scene.add(m);
      this.waterDrops.push({
        mesh: m,
        vel: new THREE.Vector3(),
        life: 0,
        active: false,
      });
    }

    this.resetToBase(false);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.onKeyDownBound = this.handleKeyDown.bind(this);
    this.onKeyUpBound = this.handleKeyUp.bind(this);
    this.onMouseDownBound = this.handleMouseDown.bind(this);
    this.onMouseUpBound = this.handleMouseUp.bind(this);
    this.onMouseMoveBound = this.handleMouseMove.bind(this);
    this.onWheelBound = this.handleWheel.bind(this);
    this.onContextMenuBound = this.handleContextMenu.bind(this);
    this.onBlurBound = this.handleBlur.bind(this);
    this.onResizeBound = this.handleResize.bind(this);
    this.onContextLostBound = (e: Event) => {
      e.preventDefault();
    };

    window.addEventListener('keydown', this.onKeyDownBound);
    window.addEventListener('keyup', this.onKeyUpBound);
    this.renderer.domElement.addEventListener('mousedown', this.onMouseDownBound);
    this.renderer.domElement.addEventListener('wheel', this.onWheelBound, { passive: false });
    this.renderer.domElement.addEventListener('contextmenu', this.onContextMenuBound);
    window.addEventListener('mouseup', this.onMouseUpBound);
    window.addEventListener('mousemove', this.onMouseMoveBound);
    window.addEventListener('blur', this.onBlurBound);
    window.addEventListener('resize', this.onResizeBound);
    this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLostBound, false);

    this.emitTelemetry();
    this.lastTimeMs = performance.now();
    this.scheduleNextFrame();
  }

  public startFlight(): void {
    this.audio.unlock();
    this.audio.playChime('radio');

    // Begin smooth cinematic swoop from current orbital camera down behind the helicopter
    this.camTransitionStartPos.copy(this.camera.position);
    this.computeTitleOrbitCamera(_vecCamTargetPos, this.camTransitionStartLook);
    this.camTransitionElapsed = 0;
    this.camPosCurrent.copy(this.camTransitionStartPos);
    this.camLookCurrent.copy(this.camTransitionStartLook);

    this.phase = 'playing';
    this.callbacks.onPhaseChange('playing');

    this.pushNotification(
      `Base Aérea ${this.companyName}`,
      `Aeronave: ${this.activeSpec.name} · [P] Hangar · [J] Missões · [I] Estatísticas · [Tab] Mapa.`,
      'info'
    );
    this.emitTelemetry();
  }

  public returnToTitleMenu(): void {
    if (this.phase === 'title') return;
    this.persistProgress();
    this.keys.clear();
    this.mouseDumpHeld = false;
    this.orbitDragging = false;
    this.camTransitionElapsed = -1;
    this.cameraMode = 'chase';
    this.heli.setCockpitView(false);
    this.audio.updateWaterSound('none');
    this.audio.updateWeatherSound(this.weather, false);
    this.audio.updateWinchSound('none');
    this.audio.updateFlightSound(0.25, 0, false);
    this.phase = 'title';
    this.callbacks.onPhaseChange('title');
    this.audio.playChime('click');
    this.emitTelemetry();
  }

  public resetCareer(): void {
    clearSavedProgress();
    this.companyName = DEFAULT_COMPANY_NAME;
    this.world.setCompanyName(DEFAULT_COMPANY_NAME);
    this.money = 0;
    this.xp = 0;
    this.level = 1;
    this.unlockedHelicopters = ['mayfly', 'wren'];
    this.upgrades = createDefaultUpgrades();
    this.liveryId = 'default';
    this.careerStats = createEmptyCareerStats();
    this.unlockedAchievements = [];
    this.hasSavedCareer = false;
    this.lastAchieveDistKm = 0;
    this.visitedPads = new Set<string>(['pad_airbase']);
    this.dutyStatus = 'OFF_DUTY';
    this.activeDispatch = null;
    this.pendingNextMissionTimer = 0;
    this.world.setDispatchTarget(null);
    this.fireSystem.clearFire();
    this.specialMissions.clearAll();
    this.slingLoad.clear();
    this.audio.updateWinchSound('none');

    if (this.activeHelicopterId !== 'wren') {
      this.equipHelicopter('wren', false);
    } else {
      this.heli.applyLivery(null, null, null);
    }
    this.resetToBase(false);
    this.audio.playChime('click');
    this.emitTelemetry();
  }

  public setMasterVolume(vol: number): void {
    this.audio.unlock();
    this.audio.setMasterVolume(vol);
    this.emitTelemetry();
  }

  public setRadioVolume(vol: number): void {
    this.audio.unlock();
    this.audio.setRadioVolume(vol);
    this.emitTelemetry();
  }

  private getTargetPixelRatio(quality: GraphicsQuality): number {
    if (this.isSoftwareGl || quality === 'low') return 1;
    if (quality === 'medium') return Math.min(window.devicePixelRatio, 1.2);
    return Math.min(window.devicePixelRatio, 1.5);
  }

  public setGraphicsQuality(quality: GraphicsQuality): void {
    if (this.graphicsQuality === quality) return;
    this.graphicsQuality = quality;
    try {
      window.localStorage.setItem('rotor_ops_graphics_quality', quality);
    } catch {
      // Ignore storage errors in restricted iframes
    }
    const useShadows = !this.isSoftwareGl;
    const targetShadowRes = quality === 'ultra' || quality === 'high' ? 1024 : 512;
    if (this.sunLight.shadow.mapSize.width !== targetShadowRes) {
      this.sunLight.shadow.mapSize.set(targetShadowRes, targetShadowRes);
      if (this.sunLight.shadow.map) {
        this.sunLight.shadow.map.dispose();
        this.sunLight.shadow.map = null;
      }
    }
    this.renderer.setPixelRatio(this.getTargetPixelRatio(quality));
    this.renderer.shadowMap.enabled = useShadows;
    this.sunLight.castShadow = useShadows;
    this.renderer.shadowMap.needsUpdate = true;
    this.world.setGraphicsQuality(quality);
    this.audio.playChime('click');
    this.emitTelemetry();
  }

  public purchaseUpgrade(id: UpgradeId): boolean {
    const def = UPGRADE_CATALOG.find((u) => u.id === id);
    if (!def) return false;
    const currentLv = this.upgrades[id] ?? 0;
    if (currentLv >= 3) return false;
    const cost = def.costs[currentLv];
    if (this.money < cost) {
      this.audio.playChime('click');
      this.pushNotification(
        'Saldo Insuficiente',
        `Faltam $${(cost - this.money).toLocaleString('pt-BR')} para ${def.name} Nv.${currentLv + 1}.`,
        'warning'
      );
      return false;
    }

    this.money -= cost;
    this.upgrades = {
      ...this.upgrades,
      [id]: currentLv + 1,
    };
    this.audio.playChime('bonus');
    this.persistProgress();
    this.pushNotification(
      `Oficina: ${def.name} Nv.${currentLv + 1}`,
      def.levelSummaries[currentLv],
      'success'
    );
    this.emitTelemetry();
    return true;
  }

  public setLivery(id: LiveryId): void {
    const scheme = getLiveryScheme(id);
    this.liveryId = scheme.id;
    this.heli.applyLivery(scheme.primaryHex, scheme.secondaryHex, scheme.accentHex);
    this.audio.playChime('click');
    this.persistProgress();
    this.pushNotification(
      `Pintura Aplicada: ${scheme.name}`,
      'Fuselagem atualizada em tempo real no hangar e em voo.',
      'info'
    );
    this.emitTelemetry();
  }

  private persistProgress(): void {
    const payload = {
      companyName: this.companyName,
      money: this.money,
      xp: this.xp,
      level: this.level,
      unlockedHelicopters: this.unlockedHelicopters,
      activeHelicopterId: this.activeHelicopterId,
      stats: { ...this.careerStats },
      unlockedAchievements: [...this.unlockedAchievements],
      upgrades: { ...this.upgrades },
      liveryId: this.liveryId,
    };
    this.hasSavedCareer = computeHasSavedCareer(payload);
    saveProgress(payload);
  }

  private checkAchievements(): void {
    const newly = evaluateNewAchievements(
      this.careerStats,
      this.unlockedHelicopters.length,
      this.unlockedAchievements
    );
    if (newly.length === 0) return;

    for (const def of newly) {
      this.unlockedAchievements = [...this.unlockedAchievements, def.id];
      this.audio.playChime('bonus');
      this.pushNotification(
        `Conquista Desbloqueada: ${def.title}`,
        def.description,
        'success'
      );
    }
    this.persistProgress();
  }

  public setCompanyName(rawName: string): void {
    const clean = sanitizeCompanyName(rawName);
    this.companyName = clean;
    this.world.setCompanyName(clean);
    this.persistProgress();
    this.audio.playChime('click');
    if (this.phase === 'playing') {
      this.pushNotification(
        `Empresa: ${clean}`,
        'Nome atualizado no HUD e na placa 3D do Hangar da Base Aérea.',
        'success'
      );
    }
    this.emitTelemetry();
  }

  public openHangar(): void {
    if (this.phase === 'title' || this.phase === 'damaged') return;
    this.audio.unlock();
    this.phase = 'hangar';
    this.keys.clear();
    this.mouseDumpHeld = false;
    this.audio.updateWaterSound('none');
    this.audio.updateWeatherSound(this.weather, false);
    this.callbacks.onPhaseChange('hangar');
    this.audio.playChime('click');
    this.emitTelemetry();
  }

  public closeHangar(): void {
    if (this.phase !== 'hangar') return;
    this.phase = 'playing';
    this.callbacks.onPhaseChange('playing');
    this.audio.playChime('click');
    this.emitTelemetry();
  }

  public toggleHangar(): void {
    if (this.phase === 'hangar') {
      this.closeHangar();
    } else if (this.phase === 'playing' || this.phase === 'paused') {
      this.openHangar();
    }
  }

  public purchaseHelicopter(id: HelicopterId): boolean {
    const spec = getHelicopterSpec(id);
    if (this.unlockedHelicopters.includes(id)) {
      this.equipHelicopter(id);
      return true;
    }
    if (this.money < spec.price) {
      this.audio.playChime('click');
      this.pushNotification(
        'Saldo Insuficiente',
        `Faltam $${(spec.price - this.money).toLocaleString('pt-BR')} para adquirir o ${spec.name}.`,
        'warning'
      );
      return false;
    }

    this.money -= spec.price;
    this.unlockedHelicopters = [...this.unlockedHelicopters, id];
    this.audio.playChime('bonus');
    this.equipHelicopter(id, false);
    this.checkAchievements();
    this.persistProgress();
    this.pushNotification(
      `Nova Aeronave: ${spec.name}!`,
      `${spec.category} adquirido por $${spec.price.toLocaleString('pt-BR')} e equipado na base.`,
      'success'
    );
    this.emitTelemetry();
    return true;
  }

  public equipHelicopter(id: HelicopterId, notify = true): void {
    if (!this.unlockedHelicopters.includes(id)) return;
    const spec = getHelicopterSpec(id);
    this.activeHelicopterId = id;
    this.activeSpec = spec;

    // Hot-swap 3D helicopter rig cleanly without leaking GPU resources
    this.scene.remove(this.heli.root);
    this.scene.remove(this.heli.searchlightTarget);
    this.scene.remove(this.heli.searchlightCone);
    this.scene.remove(this.heli.bucketPivot);
    this.scene.remove(this.heli.landingMarker);
    this.heli.dispose();

    this.heli = createHelicopterRig(this.maxAniso, id);
    const livery = getLiveryScheme(this.liveryId);
    this.heli.applyLivery(livery.primaryHex, livery.secondaryHex, livery.accentHex);
    this.heli.setCockpitView(this.cameraMode === 'cockpit' && this.phase !== 'title');
    this.scene.add(this.heli.root);
    this.scene.add(this.heli.searchlightTarget);
    this.scene.add(this.heli.searchlightCone);
    this.scene.add(this.heli.bucketPivot);
    this.scene.add(this.heli.landingMarker);

    if (spec.physics.hasIntegratedTank) {
      this.bucketDeployed = true;
      this.bucketDeployLerp = 1;
    } else {
      this.bucketDeployed = false;
      this.bucketDeployLerp = 0;
    }
    this.isScoopingWater = false;
    this.isDumpingWater = false;
    this.fuel = 100;
    this.hull = 100;

    const nightFactor = this.computeNightFactor();
    const duskFactor = this.computeDuskFactor();
    this.syncHelicopterTransform(0, nightFactor, duskFactor);
    this.updateSearchlightGimbal(0, nightFactor);
    this.persistProgress();

    if (notify) {
      this.audio.playChime('click');
      this.pushNotification(
        `Aeronave Equipada: ${spec.name}`,
        spec.perkSummary,
        'info'
      );
    }
    this.emitTelemetry();
  }

  public togglePause(): void {
    if (this.phase === 'title' || this.phase === 'damaged') return;
    if (this.phase === 'hangar') {
      this.closeHangar();
      return;
    }
    this.phase = this.phase === 'paused' ? 'playing' : 'paused';
    this.keys.clear();
    this.mouseDumpHeld = false;
    this.audio.updateWaterSound('none');
    this.audio.updateWeatherSound(this.weather, this.phase === 'playing');
    this.callbacks.onPhaseChange(this.phase);
    this.audio.playChime('click');
  }

  public resumeFlight(): void {
    if (this.phase === 'paused' || this.phase === 'hangar') {
      this.phase = 'playing';
      this.callbacks.onPhaseChange('playing');
      this.audio.playChime('click');
    }
  }

  public toggleCameraMode(): void {
    const order: CameraMode[] = ['chase', 'topdown', 'cockpit', 'orbit', 'flyby'];
    const nextIdx = (order.indexOf(this.cameraMode) + 1) % order.length;
    this.cameraMode = order[nextIdx];
    this.orbitDragging = false;
    if (this.cameraMode === 'orbit') {
      this.mouseDumpHeld = false;
    }
    this.heli.setCockpitView(this.cameraMode === 'cockpit');
    this.audio.playChime('click');

    if (this.cameraMode === 'topdown') {
      this.pushNotification(
        'Câmera: Top-Down (Pouso)',
        'Visão vertical centralizada com guia de alinhamento.',
        'info'
      );
    } else if (this.cameraMode === 'cockpit') {
      this.pushNotification(
        'Câmera: Cockpit (1ª Pessoa)',
        'Visão direta da cabine com Horizonte Artificial ativo.',
        'info'
      );
    } else if (this.cameraMode === 'orbit') {
      this.pushNotification(
        'Câmera: Orbital 360° Livre',
        'Arraste o mouse para girar em 360° e use o Scroll para aproximar/afastar (use F para água).',
        'info'
      );
    } else if (this.cameraMode === 'flyby') {
      this.selectFlybyVantage();
      this.pushNotification(
        'Câmera: Fly-By Cinematográfica',
        'Pontos fixos e dinâmicos (helipontos, prédios, navios, plataformas e montes) acompanhando seu voo.',
        'info'
      );
    } else {
      this.pushNotification(
        'Câmera: 3ª Pessoa Dinâmica',
        'Acompanhamento dinâmico com distância segura das hélices.',
        'info'
      );
    }
    this.emitTelemetry();
  }

  public toggleBucket(): void {
    this.audio.unlock();
    this.audio.playChime('click');

    if (this.activeSpec.physics.hasIntegratedTank) {
      this.bucketDeployed = true;
      this.pushNotification(
        `${this.activeSpec.name}: Tanque Ventral Integrado`,
        this.bucketWater > 10
          ? `Tanque com ${Math.round(this.bucketWater)}%. Segure F ou clique para jato largo!`
          : 'Voe baixo sobre o mar ou lago para sugar água direto no tanque ventral.',
        'info'
      );
      this.emitTelemetry();
      return;
    }

    this.bucketDeployed = !this.bucketDeployed;

    if (this.bucketDeployed) {
      this.pushNotification(
        'Bambi Bucket Equipado',
        this.bucketWater > 10
          ? `Água disponível: ${Math.round(this.bucketWater)}%. Segure F ou clique para despejar.`
          : 'Voe baixo sobre o mar ou lago/represa para encher o balde.',
        'info'
      );
    } else {
      this.isScoopingWater = false;
      this.isDumpingWater = false;
      this.mouseDumpHeld = false;
      this.audio.updateWaterSound('none');
      this.pushNotification('Bambi Bucket Recolhido', 'Cabo recolhido com segurança.', 'info');
    }
    this.emitTelemetry();
  }

  public cycleTimeOfDay(): void {
    this.audio.unlock();
    this.audio.playChime('click');
    const period = this.getTimeOfDayPeriod();
    if (period === 'DAY') {
      // Jump to Golden Dusk (18:15)
      this.gameMinutes = 18 * 60 + 15;
      this.pushNotification('Horário: Pôr do Sol', 'Luz dourada e horizonte alaranjado.', 'info');
    } else if (period === 'DUSK') {
      // Jump to Starry Night (22:30)
      this.gameMinutes = 22 * 60 + 30;
      this.pushNotification(
        'Horário: Noite Estrelada',
        'Cidade e helipontos acesos. Use [L] para ligar o Holofote de Busca.',
        'info'
      );
    } else {
      // Jump to Crisp Morning Day (10:00)
      this.gameMinutes = 10 * 60;
      this.pushNotification('Horário: Dia Claro', 'Visibilidade solar total na ilha.', 'info');
    }
    this.emitTelemetry();
  }

  public cycleWeather(): void {
    this.audio.unlock();
    this.audio.playChime('click');
    const idx = WEATHER_ORDER.indexOf(this.weather);
    this.weather = WEATHER_ORDER[(idx + 1) % WEATHER_ORDER.length];

    if (this.weather === 'STORM') {
      this.stormLightning.primeFirstStrike();
      this.pushNotification(
        'Clima: Tempestade Pesada',
        'Chuva intensa, raios 3D, trovões e turbulência. Luzes de navegação ativadas!',
        'warning'
      );
    } else if (this.weather === 'FOG') {
      this.stormLightning.clearImmediate();
      this.pushNotification(
        'Clima: Neblina Densa',
        'Visibilidade reduzida. Navegue pelo minimapa radar e instrumentos.',
        'info'
      );
    } else if (this.weather === 'BLIZZARD') {
      this.stormLightning.clearImmediate();
      this.pushNotification(
        'Clima: Nevasca',
        'Neve intensa, vento lateral gelado e visibilidade alpina reduzida.',
        'warning'
      );
    } else {
      this.stormLightning.clearImmediate();
      this.pushNotification('Clima: Céu Limpo', 'Condições visuais favoráveis para voo.', 'success');
    }
    this.emitTelemetry();
  }

  public toggleSearchlight(): void {
    this.audio.unlock();
    this.searchlightOn = !this.searchlightOn;
    this.audio.playChime('click');
    const modeLabel = SEARCHLIGHT_MODE_LABELS[this.searchlightMode];
    this.pushNotification(
      this.searchlightOn
        ? `Holofote: ON [${modeLabel}]`
        : 'Holofote de Busca: DESLIGADO',
      this.searchlightOn
        ? 'Use [G] para alternar entre FRONTAL, VERTICAL e 360° MOUSE.'
        : 'Holofote desligado.',
      'info'
    );
    this.emitTelemetry();
  }

  public cycleSearchlightMode(): void {
    this.audio.unlock();
    this.audio.playChime('click');
    const wasOff = !this.searchlightOn;
    if (wasOff) {
      this.searchlightOn = true;
    } else {
      const idx = SEARCHLIGHT_MODE_ORDER.indexOf(this.searchlightMode);
      this.searchlightMode = SEARCHLIGHT_MODE_ORDER[(idx + 1) % SEARCHLIGHT_MODE_ORDER.length];
    }

    const modeLabel = SEARCHLIGHT_MODE_LABELS[this.searchlightMode];
    const modeDetail =
      this.searchlightMode === 'FRONTAL'
        ? 'Facho projetado à frente da cabine.'
        : this.searchlightMode === 'VERTICAL'
          ? 'Facho vertical sob a aeronave (ideal para pouso e Top-Down).'
          : 'Mova o cursor do mouse para mirar o holofote em 360° no solo.';

    this.pushNotification(
      `Holofote Gimbal: ${modeLabel}`,
      modeDetail,
      'info'
    );
    this.emitTelemetry();
  }

  public cycleRadioStation(): void {
    this.audio.unlock();
    const idx = RADIO_ORDER.indexOf(this.radioStation);
    this.radioStation = RADIO_ORDER[(idx + 1) % RADIO_ORDER.length];
    this.audio.setRadioStation(this.radioStation);
    this.audio.playChime('click');
    this.pushNotification(
      `Rádio FM: ${RADIO_LABELS[this.radioStation]}`,
      this.radioStation === 'OFF'
        ? 'Transmissão de rádio desligada.'
        : 'Sintonizado em áudio sintetizado ao vivo.',
      'info'
    );
    this.emitTelemetry();
  }

  public toggleDutyStatus(): void {
    this.audio.unlock();
    this.dutyStatus = this.dutyStatus === 'OFF_DUTY' ? 'ON_DUTY' : 'OFF_DUTY';

    if (this.dutyStatus === 'ON_DUTY') {
      this.pendingNextMissionTimer = 0;
      this.dispatchNextOnDutyMission();
    } else {
      this.activeDispatch = null;
      this.pendingNextMissionTimer = 0;
      this.world.setDispatchTarget(null);
      this.fireSystem.clearFire();
      this.specialMissions.clearAll();
      this.slingLoad.clear();
      this.audio.updateWinchSound('none');
      this.audio.playChime('radio');
      this.pushNotification('Status: OFF DUTY', 'Voo livre pela ilha costeira.', 'info');
    }
    this.emitTelemetry();
  }

  public toggleWinch(): void {
    this.audio.unlock();
    if (this.slingLoad.hasActiveMission()) {
      const res = this.slingLoad.toggleHook(this.pos, this.vel, this.isLanded, (x, z, refY) =>
        this.sampleSupportSurface(x, z, refY).height
      );
      if (res.delivered) {
        this.handleSlingCargoDelivered(res.delivered);
        return;
      }
      this.audio.playChime(res.hooked ? 'bonus' : res.released ? 'click' : 'radio');
      this.pushNotification(res.title, res.detail, res.tone);
      this.emitTelemetry();
      return;
    }

    const res = this.specialMissions.toggleWinch(this.pos, this.vel, this.isLanded);
    this.audio.playChime(res.toggled ? 'click' : 'radio');
    this.pushNotification(res.title, res.detail, res.tone);
    this.emitTelemetry();
  }

  private handleSlingCargoDelivered(ev: {
    cargoLabel: string;
    dropLabel: string;
    integrityPercent: number;
    finalReward: number;
    xpReward: number;
  }): void {
    this.careerStats.heavyCargosDelivered += 1;
    this.awardCareer(ev.finalReward, ev.xpReward);
    this.audio.playChime('bonus');
    this.spawnBurst(this.pos, 16, 7.8, 'spark');
    this.pushNotification(
      `Carga Pesada Entregue: ${ev.cargoLabel}!`,
      `${ev.dropLabel} · Integridade ${ev.integrityPercent}% · +$${ev.finalReward} · +${ev.xpReward} XP!`,
      'success'
    );
    if (this.dutyStatus === 'ON_DUTY') {
      this.pendingNextMissionTimer = 2.6;
    }
    this.emitTelemetry();
  }

  public toggleMute(): boolean {
    this.audio.unlock();
    const muted = this.audio.toggleMute();
    this.emitTelemetry();
    return muted;
  }

  public resetToBase(notify = true): void {
    const basePad = this.helipads[0];
    this.pos.set(basePad.x, basePad.y, basePad.z);
    this.vel.set(0, 0, 0);
    this.prevVel.set(0, 0, 0);
    this.yaw = -Math.PI * 0.28;
    this.yawRate = 0;
    this.pitch = 0;
    this.roll = 0;
    this.isLanded = true;
    this.landedPad = basePad;
    this.fuel = 100;
    this.hull = 100;
    this.cameraShake = 0;
    this.hitstopTimer = 0;
    this.bucketSwingX = 0;
    this.bucketSwingZ = 0;
    this.bucketSwingVelX = 0;
    this.bucketSwingVelZ = 0;
    this.keys.clear();
    this.mouseDumpHeld = false;
    this.isDumpingWater = false;
    this.isScoopingWater = false;

    if (this.phase === 'damaged' || this.phase === 'paused') {
      this.phase = 'playing';
      this.callbacks.onPhaseChange('playing');
    }

    const initNight = this.computeNightFactor();
    const initDusk = this.computeDuskFactor();
    this.syncHelicopterTransform(0, initNight, initDusk);
    this.computeChaseCamGoal(_vecCamTargetPos, _vecCamLookAt);
    this.camPosCurrent.copy(_vecCamTargetPos);
    this.camLookCurrent.copy(_vecCamLookAt);
    this.updateSearchlightGimbal(0, initNight);

    if (notify) {
      this.audio.playChime('radio');
      this.pushNotification(
        'Reposicionado na Base',
        'Casco reparado e tanque 100% abastecido.',
        'success'
      );
    }
    this.emitTelemetry();
  }

  private getTimeOfDayPeriod(): TimeOfDayPeriod {
    const h = (this.gameMinutes / 60) % 24;
    if (h >= 7.0 && h < 17.2) return 'DAY';
    if ((h >= 17.2 && h < 19.6) || (h >= 5.3 && h < 7.0)) return 'DUSK';
    return 'NIGHT';
  }

  /**
   * Computes smooth 0 (full day) -> 1 (full night) factor from continuous 24h game clock.
   */
  private computeNightFactor(): number {
    const h = (this.gameMinutes / 60) % 24;
    if (h >= 7.5 && h <= 17.2) return 0;
    if (h > 17.2 && h < 19.8) {
      return THREE.MathUtils.smoothstep(h, 17.2, 19.8);
    }
    if (h >= 19.8 || h <= 5.2) return 1;
    // Dawn transition 5.2 -> 7.5
    return 1 - THREE.MathUtils.smoothstep(h, 5.2, 7.5);
  }

  /**
   * Computes smooth 0 -> 1 dusk/dawn golden-hour factor.
   */
  private computeDuskFactor(): number {
    const h = (this.gameMinutes / 60) % 24;
    if (h >= 16.8 && h <= 19.8) {
      const dist = Math.abs(h - 18.25);
      return Math.max(0, 1 - dist / 1.45);
    }
    if (h >= 5.2 && h <= 7.6) {
      const dist = Math.abs(h - 6.35);
      return Math.max(0, 1 - dist / 1.2);
    }
    return 0;
  }

  private updateAtmosphereAndWeather(dt: number): { night: number; dusk: number } {
    const night = this.computeNightFactor();
    const dusk = this.computeDuskFactor();
    const h = (this.gameMinutes / 60) % 24;

    // Smooth heavy storm & alpine blizzard atmosphere blends (0..1)
    const targetStorm = this.weather === 'STORM' ? 1 : 0;
    const targetBlizzard = this.weather === 'BLIZZARD' ? 1 : 0;
    this.stormFactor = THREE.MathUtils.damp(this.stormFactor, targetStorm, 4.2, dt);
    this.blizzardFactor = THREE.MathUtils.damp(this.blizzardFactor, targetBlizzard, 3.6, dt);

    // 3D Branching Lightning Bolts, Real Point/Directional Flash & Synchronized Thunder (0.3s–1.2s delay)
    const lightningRes = this.stormLightning.update(
      dt,
      this.weather,
      this.phase !== 'paused' && this.phase !== 'hangar',
      this.pos,
      this.camera
    );
    this.lightningFlash = lightningRes.flashIntensity;
    if (lightningRes.thunderEvent) {
      const distNorm = lightningRes.thunderEvent.distanceNorm;
      if (this.phase === 'playing' || this.phase === 'title') {
        this.audio.playThunder(distNorm);
      }
      if (this.phase === 'playing') {
        const rumble = 0.14 + (1 - distNorm) * 0.24;
        this.cameraShake = Math.max(this.cameraShake, rumble);
      }
    }

    // 1. 3-Band Procedural SkyDome Gradient + FBM Cirrus Clouds & Horizon-Matched FogExp2
    _tmpSkyTop.copy(_skyTopDay).lerp(_skyTopNight, night);
    _tmpSkyMid.copy(_skyMidDay).lerp(_skyMidNight, night);
    _tmpSkyHor.copy(_skyHorDay).lerp(_skyHorNight, night);
    _tmpSunGlow.copy(_skySunGlowDay).lerp(_skySunGlowNight, night);
    _tmpSkyCloudLit.copy(_skyCloudLitDay).lerp(_skyCloudLitNight, night);
    _tmpSkyCloudShad.copy(_skyCloudShadDay).lerp(_skyCloudShadNight, night);
    _tmpFogCol.copy(_fogDay).lerp(_fogNight, night);

    if (dusk > 0.01) {
      const duskBlend = THREE.MathUtils.clamp(dusk * 1.05, 0, 1);
      _tmpSkyTop.lerp(_skyTopDusk, duskBlend * 0.96);
      _tmpSkyMid.lerp(_skyMidDusk, duskBlend * 0.96);
      _tmpSkyHor.lerp(_skyHorDusk, duskBlend * 0.98);
      _tmpSunGlow.lerp(_skySunGlowDusk, duskBlend);
      _tmpSkyCloudLit.lerp(_skyCloudLitDusk, duskBlend * 0.96);
      _tmpSkyCloudShad.lerp(_skyCloudShadDusk, duskBlend * 0.94);
      _tmpFogCol.lerp(_fogDusk, duskBlend * 0.95);
    }

    // Heavy Storm Overcast SkyDome (#1e2530 lead-gray zenith -> #36414f dark petrol horizon even during day)
    if (this.stormFactor > 0.004) {
      _tmpStormTop.copy(_skyStormTopDay).lerp(_skyStormTopNight, night * 0.85);
      _tmpStormMid.copy(_skyStormMidDay).lerp(_skyStormMidNight, night * 0.85);
      _tmpStormHor.copy(_skyStormHorDay).lerp(_skyStormHorNight, night * 0.85);
      _tmpStormFog.copy(_fogStormDay).lerp(_fogStormNight, night * 0.85);

      const s = this.stormFactor;
      _tmpSkyTop.lerp(_tmpStormTop, s * 0.98);
      _tmpSkyMid.lerp(_tmpStormMid, s * 0.98);
      _tmpSkyHor.lerp(_tmpStormHor, s * 0.98);
      _tmpSkyCloudLit.lerp(_skyCloudStormLit, s * 0.95);
      _tmpSkyCloudShad.lerp(_skyCloudStormShad, s * 0.96);
      _tmpFogCol.lerp(_tmpStormFog, s * 0.96);
    }

    // Cold Alpine Blizzard Overcast SkyDome (#7c8b99 zenith -> #cfd8e0 soft white-out horizon)
    if (this.blizzardFactor > 0.004) {
      _tmpBlizTop.copy(_skyBlizTopDay).lerp(_skyBlizTopNight, night * 0.9);
      _tmpBlizMid.copy(_skyBlizMidDay).lerp(_skyBlizMidNight, night * 0.9);
      _tmpBlizHor.copy(_skyBlizHorDay).lerp(_skyBlizHorNight, night * 0.9);
      _tmpBlizFog.copy(_fogBlizDay).lerp(_fogBlizNight, night * 0.9);

      const b = this.blizzardFactor;
      _tmpSkyTop.lerp(_tmpBlizTop, b * 0.96);
      _tmpSkyMid.lerp(_tmpBlizMid, b * 0.96);
      _tmpSkyHor.lerp(_tmpBlizHor, b * 0.97);
      _tmpSkyCloudLit.lerp(_skyCloudBlizLit, b * 0.92 * (1 - night * 0.72));
      _tmpSkyCloudShad.lerp(_skyCloudBlizShad, b * 0.92 * (1 - night * 0.72));
      _tmpFogCol.lerp(_tmpBlizFog, b * 0.96);
    } else if (this.weather === 'FOG' && this.stormFactor < 0.05) {
      _tmpWeatherSky.copy(_skyFogDay).lerp(_skyFogNight, night);
      if (dusk > 0.01) _tmpWeatherSky.lerp(_skyFogDusk, dusk * 0.78);
      _tmpSkyTop.lerp(_tmpWeatherSky, 0.72);
      _tmpSkyMid.lerp(_tmpWeatherSky, 0.76);
      _tmpSkyHor.lerp(_tmpWeatherSky, 0.82);
      _tmpSkyCloudLit.lerp(_tmpWeatherSky, 0.65);
      _tmpSkyCloudShad.lerp(_tmpWeatherSky, 0.75);
      _tmpFogCol.lerp(_tmpWeatherSky, 0.84);
    }

    // Subtle localized electric sky-cloud illumination when a 3D lightning bolt strikes
    if (this.lightningFlash > 0.01) {
      const skyFlashMix = this.lightningFlash * 0.42;
      _tmpSkyTop.lerp(_skyFlash, skyFlashMix * 0.55);
      _tmpSkyMid.lerp(_skyFlash, skyFlashMix * 0.75);
      _tmpSkyHor.lerp(_skyFlash, skyFlashMix * 0.48);
      _tmpSkyCloudLit.lerp(_skyFlash, this.lightningFlash * 0.78);
      _tmpFogCol.lerp(_skyFlash, skyFlashMix * 0.32);
    }

    (this.scene.background as THREE.Color).copy(_tmpFogCol);
    this.fog.color.copy(_tmpFogCol);

    // 2. Smooth Exponential FogExp2 Density (Long-range aerial perspective for 2x Mega Map without cutting horizon)
    const baseClearDensity = THREE.MathUtils.lerp(0.00017, 0.00017, night);
    const clearDensity = THREE.MathUtils.lerp(baseClearDensity, 0.00023, dusk * 0.9);
    const stormOrBlizDensity = THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(clearDensity, 0.00175, this.blizzardFactor),
      0.00185,
      this.stormFactor
    );
    const targetDensity = this.weather === 'FOG' ? 0.0038 : stormOrBlizDensity;

    this.fogDensityCurrent = THREE.MathUtils.damp(this.fogDensityCurrent, targetDensity, 2.5, dt);
    this.fog.density = this.fogDensityCurrent;

    // 3. Directional Sun / Moon Light (Warm #fff5e4 1.75 in Clear Day; muted cool overcast in Storm/Blizzard)
    const overcastAtten = Math.max(this.stormFactor, this.blizzardFactor);
    const clearDayWeight = (1 - night) * (1 - dusk * 0.85) * (1 - overcastAtten);
    _tmpSun.copy(_sunDay).lerp(_sunNight, night);
    if (dusk > 0.01) {
      _tmpSun.lerp(_sunDusk, dusk * 0.96);
    }
    if (this.stormFactor > 0.005) {
      _tmpSun.lerp(_sunStorm, this.stormFactor * 0.85);
    }
    if (this.blizzardFactor > 0.005) {
      _tmpSun.lerp(_sunBliz, this.blizzardFactor * 0.88);
    }
    this.sunLight.color.copy(_tmpSun);

    const weatherSunDim =
      this.weather === 'FOG'
        ? 0.56
        : THREE.MathUtils.lerp(
            THREE.MathUtils.lerp(1.0, 0.44, this.blizzardFactor),
            0.22,
            this.stormFactor
          );
    // Vibrant 1.75 sun during Clear Day; smoothly transitions to Dusk (1.42) and crisp moonlight (0.52) at Night
    const dayToNightSun = THREE.MathUtils.lerp(1.75, 0.52, night);
    const baseSunIntensity =
      THREE.MathUtils.lerp(dayToNightSun, 1.48, dusk * 0.78 * (1 - overcastAtten * 0.85)) *
      weatherSunDim;
    this.sunLight.intensity = baseSunIntensity;

    // True solar arc across the sky from 06:00 East -> 12:00 high tilted midday -> 18:00 West sunset
    // DirectionalLight is placed strictly along uSunDirection so shadows match the visible Sun 100%
    const sunArc = ((h - 6) / 12) * Math.PI;
    const clampedArc = THREE.MathUtils.clamp(sunArc, 0.04, Math.PI - 0.04);
    const dayElevRad = THREE.MathUtils.lerp(0.14, 0.98, Math.sin(clampedArc)); // ~8° sunrise/sunset -> ~56° midday peak for crisp long shadows
    const duskElevRad = 0.11;
    const isFullNight = night > 0.78 && dusk < 0.08;

    if (isFullNight) {
      _vecSunDir.set(Math.cos(sunArc) * 0.72, 0.62, 0.34).normalize();
    } else {
      const elevRad = THREE.MathUtils.lerp(dayElevRad, duskElevRad, dusk * 0.88);
      const cosEl = Math.cos(elevRad);
      const sinEl = Math.sin(elevRad);
      const azX = Math.cos(clampedArc) * cosEl;
      const azZ = (0.48 + Math.sin(clampedArc) * 0.24) * cosEl;
      _vecSunDir.set(azX, sinEl, azZ).normalize();
    }

    const lightOrbitDist = 250;
    const sunXOff = _vecSunDir.x * lightOrbitDist;
    const sunElev = Math.max(24, _vecSunDir.y * lightOrbitDist);
    const sunZOff = _vecSunDir.z * lightOrbitDist;
    // Snap shadow camera target to texel grid (~0.8m) to prevent shadow swimming while keeping 200m frustum centered on player
    const shadowSnap = 0.8;
    const snapX = Math.round(this.pos.x / shadowSnap) * shadowSnap;
    const snapZ = Math.round(this.pos.z / shadowSnap) * shadowSnap;
    this.sunLight.position.set(snapX + sunXOff, this.pos.y + sunElev, snapZ + sunZOff);
    this.sunLight.target.position.set(snapX, this.pos.y, snapZ);
    this.sunLight.target.updateMatrixWorld();

    // Sync SkyDome uniforms (gradient, FBM cirrus/storm/blizzard clouds, horizon fog & real uSunDirection)
    const skyU = this.skyDomeMat.uniforms;
    skyU.uTime.value = this.elapsedSec;
    (skyU.uTopColor.value as THREE.Color).copy(_tmpSkyTop);
    (skyU.uMidColor.value as THREE.Color).copy(_tmpSkyMid);
    (skyU.uHorizonColor.value as THREE.Color).copy(_tmpSkyHor);
    (skyU.uFogColor.value as THREE.Color).copy(_tmpFogCol);
    (skyU.uSunGlowColor.value as THREE.Color).copy(_tmpSunGlow);
    (skyU.uCloudLitColor.value as THREE.Color).copy(_tmpSkyCloudLit);
    (skyU.uCloudShadowColor.value as THREE.Color).copy(_tmpSkyCloudShad);
    (skyU.uSunDirection.value as THREE.Vector3).copy(_vecSunDir);

    const baseCloudStrength = Math.min(0.75, THREE.MathUtils.lerp(0.48, 0.22, night) + dusk * 0.26);
    skyU.uCloudStrength.value =
      this.weather === 'FOG'
        ? 0.28
        : THREE.MathUtils.lerp(
            THREE.MathUtils.lerp(baseCloudStrength, 0.84, this.blizzardFactor),
            0.92,
            this.stormFactor
          );

    const weatherSunVis =
      this.weather === 'FOG'
        ? 0.25
        : THREE.MathUtils.lerp(
            THREE.MathUtils.lerp(1.0, 0.12, this.blizzardFactor),
            0.02,
            this.stormFactor
          );
    skyU.uSunGlowStrength.value =
      THREE.MathUtils.clamp((1 - night) * 0.85 + dusk * 0.45 + night * 0.05, 0, 1.25) * weatherSunVis;
    skyU.uSunDiscStrength.value =
      THREE.MathUtils.clamp((1 - night) * 1.05 + dusk * 0.15, 0, 1.2) *
      (this.weather === 'FOG' ? 0.18 : Math.max(0, 1 - overcastAtten * 1.25));

    // Store base sun glow visibility for camera-facing AdditiveBlending sun-rays sprite
    this.sunGlowBaseVis =
      THREE.MathUtils.clamp(1 - night * 1.15, 0, 1) *
      (this.weather === 'FOG' ? 0.18 : Math.max(0, 1 - overcastAtten * 1.35));
    this.sunGlowMat.color.copy(_tmpSunGlow);

    // 4. HemisphereLight (Day: #87cefa sky + #4a5d4e ground @ 0.65 for rich cool-blue shadow fill; Dusk/Night/Storm/Blizzard intact)
    _tmpHemiSky.copy(_hemiSkyDay).lerp(_hemiSkyNight, night);
    if (dusk > 0.01) _tmpHemiSky.lerp(_hemiSkyDusk, dusk * 0.92);
    if (this.stormFactor > 0.005) _tmpHemiSky.lerp(_hemiSkyStorm, this.stormFactor * 0.9);
    if (this.blizzardFactor > 0.005) {
      _tmpHemiSky.lerp(_hemiSkyBliz, this.blizzardFactor * 0.88 * (1 - night * 0.65));
    }

    _tmpHemiGround.copy(_hemiGroundDay).lerp(_hemiGroundNight, night);
    if (dusk > 0.01) _tmpHemiGround.lerp(_hemiGroundDusk, dusk * 0.92);
    if (this.stormFactor > 0.005) _tmpHemiGround.lerp(_hemiGroundStorm, this.stormFactor * 0.9);
    if (this.blizzardFactor > 0.005) {
      _tmpHemiGround.lerp(_hemiGroundBliz, this.blizzardFactor * 0.88 * (1 - night * 0.65));
    }

    if (this.lightningFlash > 0.01) {
      _tmpHemiSky.lerp(_skyFlash, this.lightningFlash * 0.72);
    }

    this.hemiLight.color.copy(_tmpHemiSky);
    this.hemiLight.groundColor.copy(_tmpHemiGround);
    const weatherHemiScale = THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(1.0, 0.72, this.blizzardFactor),
      0.56,
      this.stormFactor
    );
    const baseHemiIntensity = THREE.MathUtils.lerp(0.65, 0.19, night);
    this.hemiLight.intensity =
      THREE.MathUtils.lerp(baseHemiIntensity, 0.47, dusk * 0.82 * (1 - overcastAtten * 0.7)) *
        weatherHemiScale +
      this.lightningFlash * 0.95;

    // Dynamic skylight/golden rim backlight to catch glossy helicopter fuselage & canopy edges during turns
    _tmpRim.copy(_rimDay).lerp(_rimNight, night);
    if (dusk > 0.01) _tmpRim.lerp(_rimDusk, dusk * 0.95);
    this.rimLight.color.copy(_tmpRim);
    this.rimLight.intensity =
      (THREE.MathUtils.lerp(0.24, 0.22, night) + dusk * 0.74 * (1 - overcastAtten * 0.85)) *
      weatherSunDim;
    this.rimLight.position.set(
      this.pos.x + sunXOff * 0.65,
      this.pos.y + THREE.MathUtils.lerp(90, 20, dusk),
      this.pos.z + sunZOff * 0.65 - dusk * 45
    );
    this.rimLight.target.position.copy(this.pos);
    this.rimLight.target.updateMatrixWorld();

    // Balanced IBL & ACESFilmic exposure (1.0 Clear Day, 0.92 Dusk, 0.94 Night, 0.84 Storm/Blizzard — snow never blows out!)
    this.scene.environmentIntensity =
      THREE.MathUtils.lerp(
        THREE.MathUtils.lerp(
          THREE.MathUtils.lerp(0.38, 0.28, night) + dusk * 0.06,
          0.21,
          this.blizzardFactor
        ),
        0.18,
        this.stormFactor
      ) +
      this.lightningFlash * 0.18;
    const baseDayNightExp = THREE.MathUtils.lerp(1.0, 0.94, night);
    const duskAdjustedExp = THREE.MathUtils.lerp(baseDayNightExp, 0.92, dusk * 0.9);
    const overcastExpTarget = THREE.MathUtils.lerp(0.84, 0.9, night);
    this.renderer.toneMappingExposure =
      THREE.MathUtils.lerp(duskAdjustedExp, overcastExpTarget, overcastAtten) -
      (this.weather === 'FOG' ? 0.08 * clearDayWeight : 0) +
      this.lightningFlash * 0.14;

    // Update continuous storm rain & howling cold arctic wind channels
    const snowDist = Math.hypot(
      (this.pos.x - SNOW_REGION.x) / SNOW_REGION.rx,
      (this.pos.z - SNOW_REGION.z) / SNOW_REGION.rz
    );
    const alpineSnowFactor = THREE.MathUtils.clamp(1.18 - snowDist, 0, 1);
    this.audio.updateWeatherSound(this.weather, this.phase === 'playing', alpineSnowFactor);

    return { night, dusk };
  }

  private dispatchNextOnDutyMission(): void {
    this.activeDispatch = null;
    this.world.setDispatchTarget(null);
    this.fireSystem.clearFire();
    this.specialMissions.clearAll();
    this.slingLoad.clear();
    this.audio.updateWinchSound('none');

    const period = this.getTimeOfDayPeriod();
    const isNightOrDusk = period === 'NIGHT' || period === 'DUSK';

    // Rich 7-mission rotation including Phase 9 Heavy Cargo Sling Load & Phase 6 special ops.
    // Police Pursuit gets top priority at Dusk/Night; Sling Load appears early in daytime rotation.
    const cycle: Array<
      'sling_load' | 'police_pursuit' | 'winch_rescue' | 'fire' | 'heli_ski' | 'oil_rig' | 'transport'
    > = isNightOrDusk
      ? ['police_pursuit', 'sling_load', 'winch_rescue', 'fire', 'oil_rig', 'heli_ski', 'transport']
      : ['sling_load', 'winch_rescue', 'fire', 'police_pursuit', 'heli_ski', 'oil_rig', 'transport'];

    let picked = cycle[this.missionStepIndex % cycle.length];
    if (isNightOrDusk && this.lastMissionType !== 'police_pursuit' && this.missionStepIndex % 3 === 0) {
      picked = 'police_pursuit';
    }
    this.missionStepIndex += 1;
    this.lastMissionType = picked;

    if (picked === 'sling_load') {
      const cargo = this.slingLoad.spawnHeavyCargoMission(
        this.helipads,
        this.activeSpec.physics.transportRewardMult
      );
      const dist = Math.round(Math.hypot(cargo.cargoX - this.pos.x, cargo.cargoZ - this.pos.z));
      this.audio.playChime('radio');
      this.pushNotification(
        `Carga Pesada: ${cargo.cargoLabel}`,
        `Colete em ${cargo.pickupLabel} (${dist}m) com [R] e leve até ${cargo.dropLabel} · +$${cargo.reward}`,
        'warning'
      );
    } else if (picked === 'police_pursuit') {
      const pursuit = this.specialMissions.spawnPolicePursuit(
        this.activeSpec.physics.rescueRewardMult
      );
      const dist = Math.round(Math.hypot(pursuit.x - this.pos.x, pursuit.z - this.pos.z));
      this.audio.playChime('alarm');
      this.pushNotification(
        'Perseguição Policial — Veículo em Fuga',
        `${pursuit.districtLabel} (${dist}m) · Ilumine o carro com o Holofote [L] · +$${pursuit.reward}`,
        'warning'
      );
    } else if (picked === 'winch_rescue') {
      const hospitalPad =
        this.helipads.find((p) => p.id === 'pad_b_metro_hospital') ?? this.helipads[0];
      const rescue = this.specialMissions.spawnWinchRescue(
        this.activeSpec.physics.rescueRewardMult,
        hospitalPad.name
      );
      const dist = Math.round(Math.hypot(rescue.x - this.pos.x, rescue.z - this.pos.z));
      this.audio.playChime('alarm');
      this.pushNotification(
        rescue.title,
        `${rescue.locationLabel} (${dist}m) · Paire sobre o sinalizador e aperte [R] · +$${rescue.reward}`,
        'warning'
      );
    } else if (picked === 'fire') {
      const site = this.fireSystem.spawnRandomFire();
      const dist = Math.round(Math.hypot(site.x - this.pos.x, site.z - this.pos.z));
      const bonusReward = Math.round(site.reward * this.activeSpec.physics.fireRewardMult);
      this.audio.playChime('alarm');
      this.pushNotification(
        `Emergência: ${site.title}`,
        `${site.locationLabel} (${dist}m) · ${this.activeSpec.physics.hasIntegratedTank ? 'Tanque Ventral pronto' : 'Use [B] Bambi Bucket'} · +$${bonusReward}`,
        'warning'
      );
    } else {
      this.assignNextPadDispatch(picked);
    }
  }

  private assignNextPadDispatch(kind: DispatchMissionKind): void {
    let pool: HelipadData[] = [];
    if (kind === 'heli_ski') {
      pool = this.helipads.filter((p) => p.biome === 'snow' && p.id !== this.landedPad?.id);
    } else if (kind === 'oil_rig') {
      pool = this.helipads.filter((p) => p.biome === 'oilrig' && p.id !== this.landedPad?.id);
    } else {
      pool = this.helipads.filter(
        (p) =>
          (p.biome === 'urban' ||
            p.biome === 'dam' ||
            p.biome === 'forest' ||
            p.biome === 'desert' ||
            p.biome === 'beach' ||
            p.biome === 'base') &&
          p.id !== this.landedPad?.id &&
          p.id !== this.activeDispatch?.targetPadId
      );
    }

    if (pool.length === 0) {
      pool = this.helipads.filter((p) => p.id !== this.landedPad?.id);
    }
    if (pool.length === 0) return;

    const chosen = pool[Math.floor(Math.random() * pool.length)];
    const dist = Math.hypot(chosen.x - this.pos.x, chosen.z - this.pos.z);
    const isNight = this.getTimeOfDayPeriod() === 'NIGHT';

    let baseReward = 260 + Math.round(dist * 0.28);
    let xpReward = 55;
    let missionLabel = 'Transporte Urbano';
    let nightBonusAmount = 0;

    if (kind === 'heli_ski') {
      missionLabel = chosen.id === 'pad_pine_peak' ? 'Heli-Ski: Pine Peak' : 'Resgate na Neve';
      baseReward = Math.round((560 + dist * 0.28) * this.activeSpec.physics.rescueRewardMult);
      xpReward = 95;
    } else if (kind === 'oil_rig') {
      missionLabel = `Transporte Offshore (${chosen.shortCode} · >1.5 km)`;
      baseReward = Math.round((1450 + dist * 0.32) * this.activeSpec.physics.transportRewardMult);
      nightBonusAmount = isNight ? Math.round(560 * this.activeSpec.physics.transportRewardMult) : 0;
      xpReward = isNight ? 255 : 210;
    } else {
      missionLabel =
        chosen.id === 'pad_farm_verde'
          ? 'Suprimento Agrícola · Fazenda'
          : chosen.id === 'pad_desert_solar'
            ? 'Manutenção · Usina Solar'
            : chosen.biome === 'dam'
              ? 'Inspeção na Represa'
              : chosen.biome === 'forest'
                ? 'Suprimento Florestal'
                : chosen.biome === 'desert'
                  ? 'Expedição ao Cânion'
                  : chosen.biome === 'beach'
                    ? 'Táxi Aéreo Costa do Sol'
                    : 'Transporte VIP';
      baseReward = Math.round(baseReward * this.activeSpec.physics.transportRewardMult);
      xpReward = chosen.biome === 'forest' || chosen.biome === 'desert' || chosen.biome === 'beach' ? 88 : 70;
      if (this.landedPad?.biome === 'oilrig') {
        baseReward += Math.round(480 * this.activeSpec.physics.transportRewardMult);
        xpReward += 65;
        missionLabel = `Retorno Offshore · ${missionLabel}`;
      }
    }

    this.activeDispatch = {
      targetPadId: chosen.id,
      targetPadName: chosen.name,
      missionLabel,
      missionKind: kind,
      nightBonusAmount,
      reward: baseReward,
      xpReward,
      distanceMeters: Math.round(dist),
    };
    this.world.setDispatchTarget(chosen);
    this.audio.playChime('radio');
    this.pushNotification(
      `${missionLabel}: ${chosen.name}`,
      nightBonusAmount > 0
        ? `Pouse em ${chosen.shortCode} (${Math.round(dist)}m) · +$${baseReward} + $${nightBonusAmount} Bônus Noturno!`
        : `Pouse no heliponto ${chosen.shortCode} (${Math.round(dist)}m) · +$${baseReward}`,
      'info'
    );
  }

  private awardCareer(cash: number, xpGain: number): void {
    this.money += cash;
    this.careerStats.totalMoneyEarned += cash;
    this.xp += xpGain;
    let required = this.level * 120;
    while (this.xp >= required) {
      this.xp -= required;
      this.level += 1;
      required = this.level * 120;
      const rank = RANK_TITLES[Math.min(this.level - 1, RANK_TITLES.length - 1)];
      this.pushNotification(
        `Promoção: Nível ${this.level}`,
        `Nova patente alcançada: ${rank}!`,
        'success'
      );
    }
    this.checkAchievements();
    this.persistProgress();
  }

  private pushNotification(title: string, detail: string, tone: HudNotification['tone']): void {
    this.notifCounter += 1;
    this.callbacks.onNotification({
      id: this.notifCounter,
      title,
      detail,
      tone,
    });
  }

  private handleKeyDown(e: KeyboardEvent): void {
    const target = e.target;
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      (target instanceof HTMLElement && target.isContentEditable)
    ) {
      return;
    }

    const code = e.code;

    if (
      code === 'Space' ||
      code === 'Tab' ||
      code === 'ArrowUp' ||
      code === 'ArrowDown' ||
      code === 'ArrowLeft' ||
      code === 'ArrowRight'
    ) {
      e.preventDefault();
    }

    if (this.phase === 'title') {
      if (code === 'KeyI') {
        this.callbacks.onToggleStats();
      }
      return;
    }

    if (e.repeat) return;

    if (code === 'KeyI' && (this.phase === 'playing' || this.phase === 'paused')) {
      this.audio.playChime('click');
      this.callbacks.onToggleStats();
      return;
    }

    if (code === 'KeyP') {
      this.toggleHangar();
      return;
    }

    if (code === 'Escape') {
      this.togglePause();
      return;
    }

    if (this.phase === 'damaged') {
      if (code === 'Enter' || code === 'Space' || code === 'KeyR') {
        this.resetToBase(true);
      }
      return;
    }

    if (this.phase !== 'playing') return;

    this.audio.unlock();

    if (code === 'Tab') {
      this.audio.playChime('click');
      this.callbacks.onToggleMap();
      return;
    }

    if (code === 'KeyC') {
      this.toggleCameraMode();
      return;
    }
    if (code === 'KeyB') {
      this.toggleBucket();
      return;
    }
    if (code === 'KeyJ') {
      this.toggleDutyStatus();
      return;
    }
    if (code === 'KeyN') {
      this.cycleTimeOfDay();
      return;
    }
    if (code === 'KeyK') {
      this.cycleWeather();
      return;
    }
    if (code === 'KeyL') {
      this.toggleSearchlight();
      return;
    }
    if (code === 'KeyG') {
      this.cycleSearchlightMode();
      return;
    }
    if (code === 'KeyT') {
      this.cycleRadioStation();
      return;
    }
    if (code === 'KeyH') {
      this.callbacks.onToggleHelp();
      return;
    }
    if (code === 'KeyM') {
      this.toggleMute();
      return;
    }
    if (code === 'KeyR') {
      if (e.shiftKey) {
        this.resetToBase(true);
      } else {
        this.toggleWinch();
      }
      return;
    }

    this.keys.add(code);
  }

  private handleKeyUp(e: KeyboardEvent): void {
    this.keys.delete(e.code);
  }

  private handleMouseDown(e: MouseEvent): void {
    if (this.phase !== 'playing') return;
    this.audio.unlock();

    // In Orbital 360° mode, left or right drag rotates camera freely without triggering water dump (Key F still dumps)
    if (this.cameraMode === 'orbit') {
      if (e.button === 0 || e.button === 2) {
        this.orbitDragging = true;
        this.orbitLastMouseX = e.clientX;
        this.orbitLastMouseY = e.clientY;
      }
      return;
    }

    if (e.button !== 0) return;
    this.mouseDumpHeld = true;
  }

  private handleMouseUp(e: MouseEvent): void {
    if (e.button === 0) {
      this.mouseDumpHeld = false;
    }
    if (e.button === 0 || e.button === 2) {
      this.orbitDragging = false;
    }
  }

  private handleMouseMove(e: MouseEvent): void {
    if (this.orbitDragging && this.cameraMode === 'orbit' && this.phase === 'playing') {
      const dx = e.clientX - this.orbitLastMouseX;
      const dy = e.clientY - this.orbitLastMouseY;
      this.orbitLastMouseX = e.clientX;
      this.orbitLastMouseY = e.clientY;

      this.orbitAzimuthOffset -= dx * 0.0068;
      // Nearly 180° vertical freedom: look underneath belly (-83.5°) up to directly overhead rotors (+86°)
      this.orbitPolarAngle = THREE.MathUtils.clamp(this.orbitPolarAngle + dy * 0.0058, -1.46, 1.5);
    }

    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    this.mouseNdc.x = THREE.MathUtils.clamp(((e.clientX - rect.left) / rect.width) * 2 - 1, -1, 1);
    this.mouseNdc.y = THREE.MathUtils.clamp(-((e.clientY - rect.top) / rect.height) * 2 + 1, -1, 1);
  }

  private handleWheel(e: WheelEvent): void {
    if (this.cameraMode !== 'orbit' || this.phase !== 'playing') return;
    e.preventDefault();
    const clampedDelta = THREE.MathUtils.clamp(e.deltaY, -180, 180);
    const zoomFactor = Math.exp(clampedDelta * 0.00145);
    this.orbitDistTarget = THREE.MathUtils.clamp(this.orbitDistTarget * zoomFactor, 7.5, 185);
  }

  private handleContextMenu(e: MouseEvent): void {
    if (this.cameraMode === 'orbit' && this.phase === 'playing') {
      e.preventDefault();
    }
  }

  private handleBlur(): void {
    this.keys.clear();
    this.mouseDumpHeld = false;
    this.orbitDragging = false;
  }

  private handleResize(): void {
    const w = this.container.clientWidth || window.innerWidth;
    const h = Math.max(1, this.container.clientHeight || window.innerHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(this.getTargetPixelRatio(this.graphicsQuality));
  }

  private spawnBurst(
    origin: THREE.Vector3,
    count: number,
    speed: number,
    kind: 'dust' | 'spark' | 'spray' | 'snow'
  ): void {
    let spawned = 0;
    const mat =
      kind === 'spark'
        ? this.particleMatSpark
        : kind === 'spray'
          ? this.particleMatSpray
          : kind === 'snow'
            ? this.particleMatSnow
            : this.particleMatDust;

    for (let i = 0; i < this.particles.length && spawned < count; i++) {
      const p = this.particles[i];
      if (p.life > 0) continue;
      p.mesh.material = mat;
      p.mesh.position.copy(origin);
      const spread = kind === 'spark' ? 1.4 : 2.8;
      p.mesh.position.x += (Math.random() - 0.5) * spread;
      p.mesh.position.z += (Math.random() - 0.5) * spread;
      const a = Math.random() * Math.PI * 2;
      const r = (0.55 + Math.random() * 0.85) * speed;
      const upScale = kind === 'snow' ? 0.42 : kind === 'dust' ? 0.34 : 0.58;
      p.vel.set(
        Math.cos(a) * r,
        (0.28 + Math.random() * 0.82) * speed * upScale,
        Math.sin(a) * r
      );
      p.maxLife =
        kind === 'spark'
          ? 0.35 + Math.random() * 0.25
          : kind === 'snow'
            ? 0.7 + Math.random() * 0.45
            : 0.55 + Math.random() * 0.35;
      p.life = p.maxLife;
      p.scale0 =
        kind === 'spark'
          ? 0.45
          : kind === 'snow'
            ? 0.72 + Math.random() * 0.65
            : 0.85 + Math.random() * 0.7;
      p.mesh.scale.setScalar(p.scale0);
      p.mesh.visible = true;
      spawned++;
    }
  }

  private updateParticles(dt: number): void {
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.mesh.visible = false;
        continue;
      }
      p.mesh.position.addScaledVector(p.vel, dt);
      p.vel.multiplyScalar(Math.exp(-2.6 * dt));
      const ratio = p.life / p.maxLife;
      p.mesh.scale.setScalar(p.scale0 * (0.38 + ratio * 0.92));
    }
  }

  private spawnWaterRipple(x: number, y: number, z: number, strength: number): void {
    for (let i = 0; i < this.waterRipples.length; i++) {
      const r = this.waterRipples[i];
      if (r.life > 0) continue;
      r.maxLife = 0.85 + Math.random() * 0.3;
      r.life = r.maxLife;
      r.baseScale = 0.85 + Math.random() * 0.35;
      r.maxScale = (3.4 + strength * 2.4) * (0.9 + Math.random() * 0.22);
      r.mesh.position.set(
        x + (Math.random() - 0.5) * 1.1,
        y,
        z + (Math.random() - 0.5) * 1.1
      );
      r.mesh.scale.setScalar(r.baseScale);
      r.mat.opacity = 0.52 * strength;
      r.mesh.visible = true;
      return;
    }
  }

  private updateWaterRipples(dt: number): void {
    for (let i = 0; i < this.waterRipples.length; i++) {
      const r = this.waterRipples[i];
      if (r.life <= 0) continue;
      r.life -= dt;
      if (r.life <= 0) {
        r.mesh.visible = false;
        continue;
      }
      const progress = 1 - r.life / r.maxLife;
      const eased = 1 - (1 - progress) * (1 - progress);
      r.mesh.scale.setScalar(THREE.MathUtils.lerp(r.baseScale, r.maxScale, eased));
      r.mat.opacity = (1 - progress) * (1 - progress) * 0.54;
    }
  }

  private spawnSnowDownwashPuff(
    centerX: number,
    groundY: number,
    centerZ: number,
    strength: number,
    burst = false
  ): void {
    for (let i = 0; i < this.snowDownwashPuffs.length; i++) {
      const p = this.snowDownwashPuffs[i];
      if (p.life > 0) continue;
      p.centerX = centerX + (Math.random() - 0.5) * 1.4;
      p.groundY = groundY;
      p.centerZ = centerZ + (Math.random() - 0.5) * 1.4;
      p.angle = Math.random() * Math.PI * 2;
      p.radius = (burst ? 1.8 : 1.4) + Math.random() * 2.2;
      p.radialSpeed = (burst ? 8.2 : 6.4 + strength * 4.8) * (0.82 + Math.random() * 0.36);
      p.swirlSpeed = (1.9 + strength * 1.4) * (0.8 + Math.random() * 0.4);
      p.liftHeight = (burst ? 2.4 : 1.8 + strength * 2.2) * (0.8 + Math.random() * 0.45);
      p.maxLife = (burst ? 1.25 : 0.95 + strength * 0.45) * (0.85 + Math.random() * 0.3);
      p.life = p.maxLife;
      p.startScale = 2.1 + Math.random() * 1.1;
      p.endScale = (burst ? 7.8 : 5.6 + strength * 2.8) * (0.85 + Math.random() * 0.3);
      p.peakOpacity = THREE.MathUtils.clamp((burst ? 0.58 : 0.32 + strength * 0.26), 0.18, 0.62);
      p.mat.rotation = Math.random() * Math.PI * 2;
      p.sprite.position.set(
        p.centerX + Math.cos(p.angle) * p.radius,
        p.groundY + 0.55,
        p.centerZ + Math.sin(p.angle) * p.radius
      );
      p.sprite.scale.set(p.startScale, p.startScale * 0.72, 1);
      p.mat.opacity = 0;
      p.sprite.visible = true;
      return;
    }
  }

  private updateSnowDownwash(dt: number, nightFactor: number, duskFactor: number): void {
    _tmpSnowPuffCol.copy(_snowPuffDay).lerp(_snowPuffNight, nightFactor * 0.84);
    if (duskFactor > 0.01 && this.blizzardFactor < 0.8) {
      _tmpSnowPuffCol.lerp(_snowPuffDusk, duskFactor * 0.45 * (1 - this.blizzardFactor * 0.75));
    }

    for (let i = 0; i < this.snowDownwashPuffs.length; i++) {
      const p = this.snowDownwashPuffs[i];
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.sprite.visible = false;
        continue;
      }

      const progress = 1 - p.life / p.maxLife;
      const radialDrag = Math.max(0.28, 1 - progress * 0.62);
      p.radius += p.radialSpeed * radialDrag * dt;
      p.angle += p.swirlSpeed * (1 - progress * 0.45) * dt;

      // Ground-hugging outward curl rising gently at the outer ring edge
      const yLift = 0.5 + Math.sin(progress * Math.PI * 0.85) * p.liftHeight;
      p.sprite.position.set(
        p.centerX + Math.cos(p.angle) * p.radius,
        p.groundY + yLift,
        p.centerZ + Math.sin(p.angle) * p.radius
      );

      const scale = THREE.MathUtils.lerp(p.startScale, p.endScale, Math.pow(progress, 0.72));
      p.sprite.scale.set(scale, scale * 0.7, 1);
      p.mat.rotation += dt * 0.85;
      p.mat.color.copy(_tmpSnowPuffCol);

      // Smooth fade-in then silky dissipation
      const fadeIn = Math.min(1, progress * 4.5);
      const fadeOut = Math.pow(1 - progress, 1.35);
      p.mat.opacity = p.peakOpacity * fadeIn * fadeOut;
    }
  }

  private isSnowGroundAt(
    x: number,
    z: number,
    surf: { height: number; onRoof: boolean; helipad: HelipadData | null }
  ): boolean {
    if (surf.helipad?.biome === 'snow') return true;
    if (surf.onRoof) return false;
    const snowD = Math.hypot(
      (x - SNOW_REGION.x) / SNOW_REGION.rx,
      (z - SNOW_REGION.z) / SNOW_REGION.rz
    );
    return snowD < 1.16 && surf.height > 15.0;
  }

  private spawnWaterDrop(origin: THREE.Vector3): void {
    for (let i = 0; i < this.waterDrops.length; i++) {
      const d = this.waterDrops[i];
      if (d.active) continue;
      d.active = true;
      d.life = 2.6;
      d.mesh.position.copy(origin);
      d.mesh.position.x += (Math.random() - 0.5) * 1.0;
      d.mesh.position.z += (Math.random() - 0.5) * 1.0;
      d.vel.set(
        this.vel.x * 0.45 + (Math.random() - 0.5) * 2.6,
        Math.min(-6.5, this.vel.y - 8.5) - Math.random() * 2.5,
        this.vel.z * 0.45 + (Math.random() - 0.5) * 2.6
      );
      d.mesh.scale.set(0.85, 1.45, 0.85);
      d.mesh.visible = true;
      return;
    }
  }

  private updateWaterDrops(dt: number): void {
    let anyFireHit = false;
    for (let i = 0; i < this.waterDrops.length; i++) {
      const d = this.waterDrops[i];
      if (!d.active) continue;

      d.life -= dt;
      d.vel.y -= 24 * dt;
      d.mesh.position.addScaledVector(d.vel, dt);

      const fallStretch = THREE.MathUtils.clamp(1.2 + Math.abs(d.vel.y) * 0.055, 1.1, 2.5);
      d.mesh.scale.set(0.75 + (2.6 - d.life) * 0.15, fallStretch, 0.75 + (2.6 - d.life) * 0.15);

      const extinguishPower = 2.35 * this.activeSpec.physics.waterExtinguishMult;
      const fireHit = this.fireSystem.applyWaterAt(
        d.mesh.position.x,
        d.mesh.position.y,
        d.mesh.position.z,
        extinguishPower
      );
      if (fireHit.hit) {
        anyFireHit = true;
        this.steamAudioTimer = 0.25;
        if (fireHit.extinguished && fireHit.site) {
          const finalFireReward = Math.round(
            fireHit.site.reward * this.activeSpec.physics.fireRewardMult
          );
          this.handleFireExtinguished(
            fireHit.site.title,
            fireHit.site.locationLabel,
            finalFireReward,
            fireHit.site.xpReward
          );
        }
      }

      const surf = this.sampleSupportSurface(
        d.mesh.position.x,
        d.mesh.position.z,
        d.mesh.position.y + 4
      );
      if (d.life <= 0 || d.mesh.position.y <= surf.height + 0.15) {
        if (d.mesh.position.y <= surf.height + 0.5) {
          this.spawnBurst(d.mesh.position, 2, 4.2, 'spray');
        }
        d.active = false;
        d.mesh.visible = false;
      }
    }

    if (this.steamAudioTimer > 0) {
      this.steamAudioTimer -= dt;
    }

    if (this.steamAudioTimer > 0 || anyFireHit) {
      this.audio.updateWaterSound('steam');
    } else if (this.isDumpingWater) {
      this.audio.updateWaterSound('dump');
    } else if (this.isScoopingWater) {
      this.audio.updateWaterSound('scoop');
    } else {
      this.audio.updateWaterSound('none');
    }
  }

  private handleFireExtinguished(
    title: string,
    locationLabel: string,
    reward: number,
    xpReward: number
  ): void {
    this.careerStats.firesExtinguished += 1;
    this.awardCareer(reward, xpReward);
    this.audio.playChime('bonus');
    this.pushNotification(
      `${title} Extinto!`,
      `${locationLabel} seguro · Recompensa +$${reward} · +${xpReward} XP`,
      'success'
    );
    if (this.dutyStatus === 'ON_DUTY') {
      this.pendingNextMissionTimer = 2.4;
    }
    this.emitTelemetry();
  }

  private sampleSupportSurface(x: number, z: number, currentY: number): {
    height: number;
    onRoof: boolean;
    collider: BuildingCollider | null;
    helipad: HelipadData | null;
  } {
    let supportY = getSurfaceHeightAt(x, z);
    let onRoof = false;
    let roofCollider: BuildingCollider | null = null;
    let padMatch: HelipadData | null = null;

    for (let i = 0; i < this.colliders.length; i++) {
      const c = this.colliders[i];
      if (x >= c.minX - 0.8 && x <= c.maxX + 0.8 && z >= c.minZ - 0.8 && z <= c.maxZ + 0.8) {
        if (currentY >= c.topY - 2.2 && c.topY > supportY) {
          supportY = c.topY;
          onRoof = true;
          roofCollider = c;
        }
      }
    }

    for (let i = 0; i < this.helipads.length; i++) {
      const hp = this.helipads[i];
      const dist = Math.hypot(x - hp.x, z - hp.z);
      if (dist <= hp.radius) {
        if (currentY >= hp.y - 2.2 && hp.y >= supportY - 0.3) {
          supportY = Math.max(supportY, hp.y);
          padMatch = hp;
        }
      }
    }

    return { height: supportY, onRoof, collider: roofCollider, helipad: padMatch };
  }

  private stepFlightPhysics(dt: number): void {
    const pitchIn = (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0);
    const yawIn = (this.keys.has('KeyA') ? 1 : 0) - (this.keys.has('KeyD') ? 1 : 0);
    const strafeIn = (this.keys.has('KeyE') ? 1 : 0) - (this.keys.has('KeyQ') ? 1 : 0);
    const climbIn =
      (this.keys.has('Space') || this.keys.has('ArrowUp') ? 1 : 0) -
      (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.keys.has('ArrowDown') ? 1 : 0);

    const hasFuel = this.fuel > 0.05;
    const effectiveClimb = hasFuel ? climbIn : -0.6;
    const effectivePitch = hasFuel ? pitchIn : 0;
    const effectiveStrafe = hasFuel ? strafeIn : 0;
    const effectiveYaw = hasFuel ? yawIn : 0;

    this.prevVel.copy(this.vel);

    const targetRpm = !hasFuel
      ? 0.2
      : this.isLanded && effectiveClimb <= 0
        ? 0.42
        : 0.92 + Math.max(0, effectiveClimb) * 0.16 + Math.abs(effectivePitch) * 0.06;
    this.rotorRpm = THREE.MathUtils.damp(this.rotorRpm, targetRpm, 3.2, dt);

    if (this.isLanded) {
      if (effectiveClimb > 0 && hasFuel) {
        this.isLanded = false;
        this.landedPad = null;
        this.vel.y = 3.2;
      } else {
        this.vel.x = THREE.MathUtils.damp(this.vel.x, 0, 8, dt);
        this.vel.z = THREE.MathUtils.damp(this.vel.z, 0, 8, dt);
        this.vel.y = 0;
        this.pitch = THREE.MathUtils.damp(this.pitch, 0, 7, dt);
        this.roll = THREE.MathUtils.damp(this.roll, 0, 7, dt);
        this.yawRate = THREE.MathUtils.damp(this.yawRate, 0, 8, dt);

        if (this.landedPad?.isBase && (this.fuel < 99.8 || this.hull < 99.8)) {
          this.fuel = Math.min(100, this.fuel + dt * 22);
          this.hull = Math.min(100, this.hull + dt * 26);
          if (this.refuelToastCooldown <= 0 && this.fuel > 99.5 && this.hull > 99.5) {
            this.refuelToastCooldown = 6;
            this.audio.playChime('bonus');
            this.pushNotification(
              'Base Aérea: Manutenção Completa',
              'Combustível e casco restaurados a 100%.',
              'success'
            );
          }
        }
      }
    }

    const phys = this.activeSpec.physics;
    const turbineMult = 1 + this.upgrades.turbine * 0.095;
    const fuelUpgradeMult = 1 / (1 + this.upgrades.aux_tank * 0.18);
    const stormWindMult = Math.max(0.25, 1 - this.upgrades.reinforced_hull * 0.25);
    const hardLandingThresholdEff = phys.hardLandingThreshold + this.upgrades.reinforced_hull * 1.4;

    // Carrying heavy sling cargo makes the aircraft feel noticeably heavier (slower turns, more power to climb)
    const carryingHeavy = this.slingLoad.isCarryingHeavyLoad();
    const heavySpeedMult = carryingHeavy ? 0.85 : 1.0;
    const heavyAccelMult = carryingHeavy ? 0.8 : 1.0;
    const heavyClimbMult = carryingHeavy ? 0.78 : 1.0;
    const heavyYawMult = carryingHeavy ? 0.82 : 1.0;

    const effMaxSpeed = phys.maxSpeed * turbineMult * heavySpeedMult;
    const effForwardAccel = phys.forwardAccel * turbineMult * heavyAccelMult;
    const effStrafeAccel = phys.strafeAccel * turbineMult * heavyAccelMult;
    const effClimbSpeed = phys.climbSpeed * turbineMult * heavyClimbMult;
    const effYawRate = phys.yawRate * heavyYawMult;

    if (!this.isLanded) {
      const targetYawRate = effectiveYaw * effYawRate;
      this.yawRate = THREE.MathUtils.damp(this.yawRate, targetYawRate, carryingHeavy ? 4.2 : 5.5, dt);
      this.yaw += this.yawRate * dt;

      const sinY = Math.sin(this.yaw);
      const cosY = Math.cos(this.yaw);
      _vecForward.set(-sinY, 0, -cosY);
      _vecRight.set(cosY, 0, -sinY);

      const forwardSpeed = this.vel.x * _vecForward.x + this.vel.z * _vecForward.z;

      // Subtle storm & blizzard lateral crosswind gusts (mitigated by Reinforced Hull upgrade)
      let windRollJitter = 0;
      if (this.weather === 'STORM') {
        const gustX = (-3.4 + Math.sin(this.elapsedSec * 1.3) * 2.2) * stormWindMult;
        const gustZ = Math.cos(this.elapsedSec * 0.9) * 1.4 * stormWindMult;
        this.vel.x += gustX * dt;
        this.vel.z += gustZ * dt;
        windRollJitter = Math.sin(this.elapsedSec * 3.7) * 0.038 * stormWindMult;
      } else if (this.weather === 'BLIZZARD') {
        const gustX = (-2.6 + Math.sin(this.elapsedSec * 1.05) * 1.85) * stormWindMult;
        const gustZ = (1.1 + Math.cos(this.elapsedSec * 0.78) * 1.25) * stormWindMult;
        this.vel.x += gustX * dt;
        this.vel.z += gustZ * dt;
        windRollJitter = Math.sin(this.elapsedSec * 2.9) * 0.028 * stormWindMult;
      }

      const targetPitch = -effectivePitch * 0.34;
      const turnBank =
        effectiveYaw *
        THREE.MathUtils.clamp(0.18 + Math.abs(forwardSpeed) * 0.008, 0.16, 0.38);
      const strafeBank = -effectiveStrafe * 0.3;
      const targetRoll = THREE.MathUtils.clamp(
        turnBank + strafeBank + windRollJitter,
        -0.46,
        0.46
      );

      this.pitch = THREE.MathUtils.damp(
        this.pitch,
        targetPitch,
        effectivePitch !== 0 ? 5.2 : 3.6,
        dt
      );
      this.roll = THREE.MathUtils.damp(
        this.roll,
        targetRoll,
        effectiveStrafe !== 0 || effectiveYaw !== 0 ? 5.4 : 3.8,
        dt
      );

      const forwardAccel = -this.pitch * effForwardAccel;
      const strafeAccel = effectiveStrafe * effStrafeAccel;
      this.vel.x += (_vecForward.x * forwardAccel + _vecRight.x * strafeAccel) * dt;
      this.vel.z += (_vecForward.z * forwardAccel + _vecRight.z * strafeAccel) * dt;

      const horizDrag = Math.exp(-1.18 * dt);
      this.vel.x *= horizDrag;
      this.vel.z *= horizDrag;

      const hSpeed = Math.hypot(this.vel.x, this.vel.z);
      if (hSpeed > effMaxSpeed) {
        const s = effMaxSpeed / hSpeed;
        this.vel.x *= s;
        this.vel.z *= s;
      }

      const targetVy = !hasFuel
        ? -7.5
        : effectiveClimb > 0
          ? effClimbSpeed
          : effectiveClimb < 0
            ? carryingHeavy
              ? -9.4
              : -8.2
            : 0;
      this.vel.y = THREE.MathUtils.damp(this.vel.y, targetVy, effectiveClimb !== 0 ? 4.0 : 3.4, dt);

      const prevX = this.pos.x;
      const prevZ = this.pos.z;
      this.pos.x += this.vel.x * dt;
      this.pos.y += this.vel.y * dt;
      this.pos.z += this.vel.z * dt;

      // Expanded flight bounds covering the 2x Mega Island, Snow Range & all 3 Far Offshore Oil Rigs (+760m open sea margin)
      if (this.boundaryToastCooldown > 0) {
        this.boundaryToastCooldown = Math.max(0, this.boundaryToastCooldown - dt);
      }
      const maxRange = WORLD_FLIGHT_RADIUS;
      const radialDist = Math.hypot(this.pos.x, this.pos.z);
      if (radialDist > WORLD_BOUNDARY_WARN_RADIUS && this.boundaryToastCooldown <= 0) {
        this.boundaryToastCooldown = 10;
        this.pushNotification(
          'Limite da Área de Operação',
          'Você passou das plataformas de petróleo — retorne em direção à ilha.',
          'warning'
        );
      }
      if (radialDist > maxRange) {
        const clampScale = maxRange / radialDist;
        this.pos.x *= clampScale;
        this.pos.z *= clampScale;
        // Gently damp outward radial velocity while letting the pilot turn smoothly along the boundary
        const nx = this.pos.x / maxRange;
        const nz = this.pos.z / maxRange;
        const outwardVel = this.vel.x * nx + this.vel.z * nz;
        if (outwardVel > 0) {
          this.vel.x -= nx * outwardVel * 1.25;
          this.vel.z -= nz * outwardVel * 1.25;
        }
      }

      if (this.pos.y > 275) {
        this.pos.y = 275;
        if (this.vel.y > 0) this.vel.y = 0;
      }

      const heliRadius = 2.6;
      const heliHeight = 3.6;
      for (let i = 0; i < this.colliders.length; i++) {
        const c = this.colliders[i];
        if (this.pos.y >= c.topY - 0.35) continue;
        if (this.pos.y + heliHeight <= c.baseY) continue;

        const minX = c.minX - heliRadius;
        const maxX = c.maxX + heliRadius;
        const minZ = c.minZ - heliRadius;
        const maxZ = c.maxZ + heliRadius;

        if (this.pos.x > minX && this.pos.x < maxX && this.pos.z > minZ && this.pos.z < maxZ) {
          const penLeft = Math.abs(this.pos.x - minX);
          const penRight = Math.abs(maxX - this.pos.x);
          const penFront = Math.abs(this.pos.z - minZ);
          const penBack = Math.abs(maxZ - this.pos.z);
          const minPen = Math.min(penLeft, penRight, penFront, penBack);

          const impactSpeed = Math.hypot(this.vel.x, this.vel.z);

          if (minPen === penLeft) {
            this.pos.x = minX;
            this.vel.x = -Math.abs(this.vel.x) * 0.45 - 2.5;
          } else if (minPen === penRight) {
            this.pos.x = maxX;
            this.vel.x = Math.abs(this.vel.x) * 0.45 + 2.5;
          } else if (minPen === penFront) {
            this.pos.z = minZ;
            this.vel.z = -Math.abs(this.vel.z) * 0.45 - 2.5;
          } else {
            this.pos.z = maxZ;
            this.vel.z = Math.abs(this.vel.z) * 0.45 + 2.5;
          }

          if (impactSpeed > 5.2 && this.impactCooldown <= 0) {
            this.registerImpact(impactSpeed * 0.72, 'Colisão Estrutural');
          } else {
            this.pos.x = THREE.MathUtils.lerp(this.pos.x, prevX, 0.15);
            this.pos.z = THREE.MathUtils.lerp(this.pos.z, prevZ, 0.15);
          }
        }
      }

      const surface = this.sampleSupportSurface(this.pos.x, this.pos.z, this.pos.y);

      if (this.pos.y <= surface.height) {
        const overWaterNow =
          !surface.onRoof && !surface.helipad && isOverWater(this.pos.x, this.pos.z);
        const descentSpeed = Math.abs(this.vel.y);

        if (overWaterNow) {
          this.pos.y = surface.height + 0.65;
          this.vel.y = Math.max(4.5, descentSpeed * 0.55);
          this.spawnBurst(this.pos, 12, 8.5, 'spray');
          if (this.impactCooldown <= 0) {
            this.registerImpact(Math.max(6, descentSpeed * 1.1), 'Contato com a Água');
          }
        } else {
          this.pos.y = surface.height;
          const horizSpeed = Math.hypot(this.vel.x, this.vel.z);

          let hadHardLanding = false;
          if (descentSpeed > hardLandingThresholdEff) {
            hadHardLanding = true;
            this.registerImpact(
              (descentSpeed - (hardLandingThresholdEff - 4.7)) * 1.05,
              'Pouso Brusco'
            );
            this.vel.y = 0;
            this.vel.x *= 0.45;
            this.vel.z *= 0.45;
          } else {
            this.audio.playTouchdown(descentSpeed < 6.8);
            const snowTouch = this.isSnowGroundAt(this.pos.x, this.pos.z, surface);
            if (snowTouch) {
              for (let k = 0; k < 12; k++) {
                this.spawnSnowDownwashPuff(this.pos.x, surface.height, this.pos.z, 1.0, true);
              }
            } else {
              this.spawnBurst(this.pos, 7, 4.8, 'dust');
            }
          }

          if (effectiveClimb <= 0 && horizSpeed < 17) {
            this.isLanded = true;
            this.vel.set(0, 0, 0);
            this.landedPad = surface.helipad;

            if (!hadHardLanding) {
              this.careerStats.perfectLandings += 1;
              this.careerStats.currentPerfectStreak += 1;
              if (this.careerStats.currentPerfectStreak > this.careerStats.bestPerfectStreak) {
                this.careerStats.bestPerfectStreak = this.careerStats.currentPerfectStreak;
              }
              if (surface.helipad?.biome === 'oilrig' && this.getTimeOfDayPeriod() === 'NIGHT') {
                this.careerStats.nightOilRigLandings += 1;
              }
              this.checkAchievements();
              this.persistProgress();
            }

            if (surface.helipad) {
              this.handleHelipadTouchdown(surface.helipad);
            }
          } else {
            this.vel.y = Math.max(0, this.vel.y);
          }
        }
      }

      // Accumulate career flight time & horizontal distance while airborne
      if (!this.isLanded) {
        this.careerStats.flightSeconds += dt;
        this.careerStats.distanceMeters += Math.hypot(this.pos.x - prevX, this.pos.z - prevZ);
        const curKm = Math.floor(this.careerStats.distanceMeters / 1000);
        if (curKm > this.lastAchieveDistKm) {
          this.lastAchieveDistKm = curKm;
          this.checkAchievements();
        }
        this.statsSaveAccum += dt;
        if (this.statsSaveAccum >= 8) {
          this.statsSaveAccum = 0;
          this.persistProgress();
        }
      }

      // Extended fuel autonomy (~50% lower burn) for comfortable cross-map & far offshore Oil Rig flights
      const fuelBurn =
        (0.048 + Math.max(0, effectiveClimb) * 0.028 + Math.abs(effectivePitch) * 0.018) *
        phys.fuelBurnMult *
        fuelUpgradeMult *
        (carryingHeavy ? 1.15 : 1.0) *
        dt;
      this.fuel = Math.max(0, this.fuel - fuelBurn);
    }

    this.stepBambiBucket(dt);

    // Phase 5 + Phase 3 Alpine Realism: Surface-aware rotor downwash (ocean/lake/forest rivers spray + ripples / swirling snow / dust)
    const surfNow = this.sampleSupportSurface(this.pos.x, this.pos.z, this.pos.y);
    const agl = Math.max(0, this.pos.y - surfNow.height);
    const waterLevelNow = getWaterLevelAt(this.pos.x, this.pos.z);
    const waterBelowNow = !surfNow.onRoof && !surfNow.helipad && waterLevelNow !== null;
    const snowBelowNow = !waterBelowNow && this.isSnowGroundAt(this.pos.x, this.pos.z, surfNow);

    this.washTimer -= dt;
    this.waterRippleTimer -= dt;
    this.snowDownwashTimer -= dt;

    // Dense swirling circular ground-snow cloud when flying low OR landed/spooling on Snow Biome / Pine Peak
    if (snowBelowNow && agl < 13.8 && this.rotorRpm > 0.36) {
      const altFactor = THREE.MathUtils.clamp(1 - agl / 13.8, 0.18, 1.0);
      const rpmFactor = THREE.MathUtils.clamp((this.rotorRpm - 0.32) / 0.68, 0.25, 1.0);
      const snowStrength = altFactor * rpmFactor;
      if (this.snowDownwashTimer <= 0) {
        this.snowDownwashTimer = THREE.MathUtils.lerp(0.11, 0.036, snowStrength);
        const puffsPerTick = snowStrength > 0.58 ? 2 : 1;
        for (let k = 0; k < puffsPerTick; k++) {
          this.spawnSnowDownwashPuff(this.pos.x, surfNow.height, this.pos.z, snowStrength, false);
        }
      }
    }

    if (!this.isLanded && agl < 11.5 && this.rotorRpm > 0.52) {
      const washStrength = THREE.MathUtils.clamp(1 - agl / 11.5, 0.2, 1.0);

      if (!snowBelowNow && this.washTimer <= 0) {
        this.washTimer = THREE.MathUtils.lerp(0.12, 0.065, washStrength);
        const surfY =
          waterBelowNow && waterLevelNow !== null ? waterLevelNow + 0.24 : surfNow.height + 0.22;
        _vecCamLookAt.set(this.pos.x, surfY, this.pos.z);
        const burstCount = washStrength > 0.55 ? 3 : 2;
        const burstSpeed = 4.6 + washStrength * 4.4;
        this.spawnBurst(
          _vecCamLookAt,
          burstCount,
          burstSpeed,
          waterBelowNow ? 'spray' : 'dust'
        );
      }

      if (waterBelowNow && waterLevelNow !== null && this.waterRippleTimer <= 0) {
        this.waterRippleTimer = THREE.MathUtils.lerp(0.28, 0.14, washStrength);
        const waterY = waterLevelNow + 0.18;
        this.spawnWaterRipple(this.pos.x, waterY, this.pos.z, washStrength);
      }
    }

    const load = Math.min(1, Math.max(0, effectiveClimb) * 0.65 + Math.abs(effectivePitch) * 0.35);
    this.audio.updateFlightSound(this.rotorRpm, load, true);
  }

  private stepBambiBucket(dt: number): void {
    const phys = this.activeSpec.physics;
    const waterCapUpgradeMult = 1 + this.upgrades.aux_tank * 0.18;
    const drainRate = 26 / (phys.waterCapacityMult * waterCapUpgradeMult);
    const dumpRequested = this.keys.has('KeyF') || this.mouseDumpHeld;

    // === FIREKITE HEAVY FIRE BOMBER: Integrated Ventral Belly Water Tank (ocean, lake & sinuous forest rivers) ===
    if (phys.hasIntegratedTank) {
      this.heli.bucketPivot.visible = false;
      this.bucketDeployed = true;
      this.bucketDeployLerp = 1;

      this.heli.root.updateMatrixWorld(true);
      this.heli.bellyNozzleAnchor.getWorldPosition(_vecBucketNozzleWorld);

      const waterLevel = getWaterLevelAt(_vecBucketNozzleWorld.x, _vecBucketNozzleWorld.z);
      const waterSurfaceY = waterLevel ?? OCEAN_LEVEL;
      const skimmingWater =
        !this.isLanded && waterLevel !== null && _vecBucketNozzleWorld.y <= waterSurfaceY + 5.6;

      if (skimmingWater && this.bucketWater < 100) {
        this.isScoopingWater = true;
        this.bucketWater = Math.min(100, this.bucketWater + dt * 62);
        this.scoopSplashTimer -= dt;
        if (this.scoopSplashTimer <= 0) {
          this.scoopSplashTimer = 0.06;
          _vecCamLookAt.set(_vecBucketNozzleWorld.x, waterSurfaceY + 0.25, _vecBucketNozzleWorld.z);
          this.spawnBurst(_vecCamLookAt, 5, 7.4, 'spray');
        }
        if (!this.scoopNotified) {
          this.scoopNotified = true;
          this.fullNotified = false;
          this.pushNotification(
            'Firekite: Captando Água...',
            'Tanque ventral sugando água em alta vazão.',
            'info'
          );
        }
        if (this.bucketWater >= 99.9 && !this.fullNotified) {
          this.bucketWater = 100;
          this.fullNotified = true;
          this.audio.playChime('bonus');
          this.pushNotification(
            'Tanque Ventral 100% Cheio!',
            'Segure F ou clique sobre o incêndio para descarga larga.',
            'success'
          );
        }
      } else {
        this.isScoopingWater = false;
        if (!skimmingWater) this.scoopNotified = false;
      }

      if (dumpRequested && !this.isScoopingWater && this.bucketWater > 0.2) {
        this.isDumpingWater = true;
        this.fullNotified = false;
        this.bucketWater = Math.max(0, this.bucketWater - dt * drainRate);

        // Wide heavy Fire Bomber 3-stream ventral cascade
        this.waterEmitAccum += dt;
        while (this.waterEmitAccum >= 0.022) {
          this.waterEmitAccum -= 0.022;
          for (const lateral of [-1.2, 0, 1.2]) {
            _vecCamLookAt.copy(_vecBucketNozzleWorld);
            _vecCamLookAt.x += Math.cos(this.yaw) * lateral;
            _vecCamLookAt.z -= Math.sin(this.yaw) * lateral;
            this.spawnWaterDrop(_vecCamLookAt);
          }
        }
      } else {
        this.isDumpingWater = false;
        this.waterEmitAccum = 0;
      }
      return;
    }

    // === STANDARD & HEAVY-LIFT BAMBI BUCKET PENDULUM RIG ===
    const targetDeploy = this.bucketDeployed ? 1 : 0;
    this.bucketDeployLerp = THREE.MathUtils.damp(this.bucketDeployLerp, targetDeploy, 6.5, dt);

    if (this.bucketDeployLerp < 0.02) {
      this.heli.bucketPivot.visible = false;
      this.isScoopingWater = false;
      this.isDumpingWater = false;
      this.bucketSwingX = 0;
      this.bucketSwingZ = 0;
      this.bucketSwingVelX = 0;
      this.bucketSwingVelZ = 0;
      return;
    }

    this.heli.bucketPivot.visible = true;

    const ax = (this.vel.x - this.prevVel.x) / Math.max(dt, 0.005);
    const az = (this.vel.z - this.prevVel.z) / Math.max(dt, 0.005);

    const gravityOverL = 9.81 / BAMBI_CABLE_LENGTH;
    const damping = 2.6;

    const torqueZ =
      -ax * 0.048 -
      this.vel.x * 0.018 -
      gravityOverL * this.bucketSwingZ -
      damping * this.bucketSwingVelZ;
    const torqueX =
      az * 0.048 +
      this.vel.z * 0.018 -
      gravityOverL * this.bucketSwingX -
      damping * this.bucketSwingVelX;

    this.bucketSwingVelZ += torqueZ * dt;
    this.bucketSwingVelX += torqueX * dt;
    this.bucketSwingZ = THREE.MathUtils.clamp(
      this.bucketSwingZ + this.bucketSwingVelZ * dt,
      -0.58,
      0.58
    );
    this.bucketSwingX = THREE.MathUtils.clamp(
      this.bucketSwingX + this.bucketSwingVelX * dt,
      -0.58,
      0.58
    );

    const surf = this.sampleSupportSurface(this.pos.x, this.pos.z, this.pos.y);
    const clearance = Math.max(0.5, this.pos.y + 0.8 - surf.height);
    const maxScaleForClearance = THREE.MathUtils.clamp(
      clearance / (BAMBI_CABLE_LENGTH + 1.1),
      0.14,
      1
    );
    const effectiveCableScale = this.bucketDeployLerp * maxScaleForClearance;

    this.heli.bucketPivot.position.set(this.pos.x, this.pos.y + 0.85, this.pos.z);
    this.heli.bucketPivot.rotation.set(this.bucketSwingX, 0, this.bucketSwingZ);
    this.heli.bucketPivot.scale.set(
      this.bucketDeployLerp,
      effectiveCableScale,
      this.bucketDeployLerp
    );
    this.heli.bucketPivot.updateMatrixWorld(true);

    const waterNorm = this.bucketWater / 100;
    this.heli.bucketWaterMesh.visible = waterNorm > 0.03;
    if (this.heli.bucketWaterMesh.visible) {
      this.heli.bucketWaterMesh.position.y = -BAMBI_CABLE_LENGTH - 0.5 + waterNorm * 1.16;
      const rScale = 0.62 + waterNorm * 0.38;
      this.heli.bucketWaterMesh.scale.set(rScale, rScale, 1);
    }

    this.heli.bucketNozzleAnchor.getWorldPosition(_vecBucketNozzleWorld);

    const bucketWaterLevel = getWaterLevelAt(_vecBucketNozzleWorld.x, _vecBucketNozzleWorld.z);
    const waterSurfaceY = bucketWaterLevel ?? OCEAN_LEVEL;
    const bucketTouchingWater =
      this.bucketDeployed &&
      this.bucketDeployLerp > 0.72 &&
      !this.isLanded &&
      bucketWaterLevel !== null &&
      _vecBucketNozzleWorld.y <= waterSurfaceY + 2.5;

    if (bucketTouchingWater && this.bucketWater < 100) {
      this.isScoopingWater = true;
      this.bucketWater = Math.min(100, this.bucketWater + dt * 44);
      this.scoopSplashTimer -= dt;
      if (this.scoopSplashTimer <= 0) {
        this.scoopSplashTimer = 0.07;
        _vecCamLookAt.set(_vecBucketNozzleWorld.x, waterSurfaceY + 0.2, _vecBucketNozzleWorld.z);
        this.spawnBurst(_vecCamLookAt, 4, 6.2, 'spray');
      }

      if (!this.scoopNotified) {
        this.scoopNotified = true;
        this.fullNotified = false;
        this.pushNotification(
          'Captando Água...',
          'Mantenha o Bambi Bucket tocando a água até completar 100%.',
          'info'
        );
      }

      if (this.bucketWater >= 99.9 && !this.fullNotified) {
        this.bucketWater = 100;
        this.fullNotified = true;
        this.audio.playChime('bonus');
        this.pushNotification(
          'Bambi Bucket 100% Cheio!',
          'Siga para o foco de incêndio e segure F ou clique para despejar.',
          'success'
        );
      }
    } else {
      this.isScoopingWater = false;
      if (!bucketTouchingWater) {
        this.scoopNotified = false;
      }
    }

    if (
      dumpRequested &&
      this.bucketDeployed &&
      this.bucketDeployLerp > 0.72 &&
      !this.isScoopingWater &&
      this.bucketWater > 0.2
    ) {
      this.isDumpingWater = true;
      this.fullNotified = false;
      this.bucketWater = Math.max(0, this.bucketWater - dt * drainRate);

      this.waterEmitAccum += dt;
      while (this.waterEmitAccum >= 0.032) {
        this.waterEmitAccum -= 0.032;
        this.spawnWaterDrop(_vecBucketNozzleWorld);
      }
    } else {
      this.isDumpingWater = false;
      this.waterEmitAccum = 0;
    }
  }

  private handleHelipadTouchdown(pad: HelipadData): void {
    if (this.activeDispatch && this.activeDispatch.targetPadId === pad.id) {
      const { reward, xpReward, missionLabel, missionKind, nightBonusAmount } = this.activeDispatch;
      const completedAtNight = this.getTimeOfDayPeriod() === 'NIGHT';
      const dynamicNightBonus =
        missionKind === 'oil_rig' && completedAtNight
          ? Math.max(nightBonusAmount, Math.round(480 * this.activeSpec.physics.transportRewardMult))
          : nightBonusAmount;
      const totalCash = reward + dynamicNightBonus;

      if (missionKind === 'winch_delivery') {
        this.careerStats.winchRescues += 1;
      } else {
        this.careerStats.transportMissions += 1;
      }

      this.awardCareer(totalCash, xpReward);
      this.audio.playChime('bonus');
      this.spawnBurst(this.pos, 14, 7.5, 'spark');
      this.pushNotification(
        `${missionLabel} Concluído!`,
        dynamicNightBonus > 0
          ? `${pad.name} · +$${reward} + $${dynamicNightBonus} Bônus Noturno · +${xpReward} XP!`
          : `${pad.name} · +$${totalCash} · +${xpReward} XP creditados!`,
        'success'
      );
      this.visitedPads.add(pad.id);
      this.activeDispatch = null;
      this.world.setDispatchTarget(null);
      if (missionKind === 'winch_delivery') {
        this.specialMissions.clearWinchRescue();
      }

      if (this.dutyStatus === 'ON_DUTY') {
        this.pendingNextMissionTimer = 2.0;
      }
      return;
    }

    if (!this.visitedPads.has(pad.id)) {
      this.visitedPads.add(pad.id);
      const discoveryBonus = pad.biome === 'oilrig' ? 450 : pad.biome === 'snow' ? 220 : 120;
      const discoveryXp = pad.biome === 'oilrig' ? 50 : 30;
      this.awardCareer(discoveryBonus, discoveryXp);
      this.audio.playChime('bonus');
      this.pushNotification(
        `Heliponto Descoberto: ${pad.name}`,
        `Bônus de reconhecimento: +$${discoveryBonus} · +${discoveryXp} XP`,
        'success'
      );
    }
  }

  private registerImpact(severity: number, label: string): void {
    const rawDamage = Math.min(24, Math.max(4, Math.round(severity * 0.9)));
    const hullUpgradeMult = Math.max(0.45, 1 - this.upgrades.reinforced_hull * 0.16);
    const damage = Math.max(
      2,
      Math.round(rawDamage * this.activeSpec.physics.damageTakenMult * hullUpgradeMult)
    );
    this.hull = Math.max(0, this.hull - damage);
    this.careerStats.currentPerfectStreak = 0;
    this.cameraShake = Math.min(1.3, 0.35 + severity * 0.07);
    this.hitstopTimer = severity > 12 ? 0.045 : 0;
    this.impactCooldown = 0.85;
    this.audio.playImpact(Math.min(1, severity / 18));
    this.spawnBurst(this.pos, 14, 9.5, 'spark');

    if (this.hull <= 0) {
      this.phase = 'damaged';
      this.keys.clear();
      this.mouseDumpHeld = false;
      this.audio.updateWaterSound('none');
      this.audio.updateWinchSound('none');
      this.callbacks.onPhaseChange('damaged');
      this.pushNotification(
        'Alerta Crítico de Casco',
        'Aeronave danificada. Retorne à Base Aérea.',
        'warning'
      );
    } else {
      this.pushNotification(label, `Integridade do casco: ${Math.round(this.hull)}%`, 'warning');
    }
    this.emitTelemetry();
  }

  private syncHelicopterTransform(dt: number, nightFactor: number, duskFactor: number): void {
    this.heli.root.position.copy(this.pos);
    this.heli.root.rotation.order = 'YXZ';
    this.heli.root.rotation.set(this.pitch, this.yaw, this.roll);

    const mainOmega = 4.5 + this.rotorRpm * 24;
    const tailOmega = 10 + this.rotorRpm * 46;
    this.heli.mainRotorGroup.rotation.y += mainOmega * dt;
    this.heli.tailRotorGroup.rotation.x += tailOmega * dt;

    const mainBlurMat = this.heli.mainRotorBlur.material as THREE.MeshBasicMaterial;
    mainBlurMat.opacity = THREE.MathUtils.clamp((this.rotorRpm - 0.42) * 1.18, 0, 0.62);
    const tailBlurMat = this.heli.tailRotorBlur.material as THREE.MeshBasicMaterial;
    tailBlurMat.opacity = THREE.MathUtils.clamp((this.rotorRpm - 0.42) * 1.08, 0, 0.56);

    // Crisp white blinking tail strobe & prominent red/green nav lights vivid at Dusk, Night & Daytime Storm
    const weatherNavBoost = Math.max(this.stormFactor, this.blizzardFactor * 0.75);
    const twilightBoost = Math.max(nightFactor, duskFactor * 0.88, weatherNavBoost * 0.95);
    const strobeFlash = Math.sin(this.elapsedSec * 7.8) > 0.72;
    this.heli.beaconMat.emissiveIntensity = strobeFlash ? 3.8 + twilightBoost * 3.0 : 0.25;
    this.heli.beaconGlow.visible = strobeFlash;
    if (strobeFlash) {
      const bScale = 1.8 + twilightBoost * 2.2;
      this.heli.beaconGlow.scale.set(bScale, bScale, 1);
      (this.heli.beaconGlow.material as THREE.SpriteMaterial).opacity = 0.48 + twilightBoost * 0.48;
    }

    const navIntensity = 1.6 + Math.max(duskFactor * 2.2 + nightFactor * 2.8, weatherNavBoost * 3.2);
    this.heli.navRedMat.emissiveIntensity = navIntensity;
    this.heli.navGreenMat.emissiveIntensity = navIntensity;

    const navGlowOpacity = THREE.MathUtils.clamp(
      0.18 + Math.max(duskFactor * 0.58 + nightFactor * 0.72, weatherNavBoost * 0.76),
      0.16,
      0.96
    );
    const navGlowScale = 1.35 + twilightBoost * 1.5;
    (this.heli.navRedGlow.material as THREE.SpriteMaterial).opacity = navGlowOpacity;
    (this.heli.navGreenGlow.material as THREE.SpriteMaterial).opacity = navGlowOpacity;
    this.heli.navRedGlow.scale.set(navGlowScale, navGlowScale, 1);
    this.heli.navGreenGlow.scale.set(navGlowScale, navGlowScale, 1);

    // Keep helicopter world matrix synced for gimbal searchlight & attachments
    this.heli.root.updateMatrixWorld(true);

    // Ground/rooftop landing shadow & guide ring
    const surf = this.sampleSupportSurface(this.pos.x, this.pos.z, this.pos.y);
    const agl = Math.max(0, this.pos.y - surf.height);

    // Automatic retractable tricycle landing gear (AS365 N3 Dauphin):
    // Retracts smoothly when climbing into cruise flight; deploys automatically on approach / hover near ground
    if (this.heli.updateLandingGear) {
      const horizSpeed = Math.hypot(this.vel.x, this.vel.z);
      if (this.isLanded || agl < 15 || (agl < 22 && horizSpeed < 10)) {
        this.landingGearTarget = 1;
      } else if (agl > 22 && horizSpeed > 13) {
        this.landingGearTarget = 0;
      }
      this.heli.updateLandingGear(dt, this.landingGearTarget);
    }

    this.heli.landingMarker.position.set(this.pos.x, surf.height + 0.14, this.pos.z);
    this.heli.landingMarker.rotation.z = this.yaw;

    const markerScale = THREE.MathUtils.clamp(1.0 + agl * 0.025, 0.95, 2.2);
    this.heli.landingMarker.scale.setScalar(markerScale);

    if (surf.helipad) {
      const centerErr = Math.hypot(this.pos.x - surf.helipad.x, this.pos.z - surf.helipad.z);
      if (centerErr < 3.6) {
        this.heli.landingMarkerMat.color.setHex(0x34d399);
      } else {
        this.heli.landingMarkerMat.color.setHex(0xfacc15);
      }
      this.heli.landingMarkerMat.opacity = THREE.MathUtils.clamp(0.92 - agl * 0.008, 0.32, 0.92);
    } else {
      this.heli.landingMarkerMat.color.setHex(0xffffff);
      this.heli.landingMarkerMat.opacity = THREE.MathUtils.clamp(0.76 - agl * 0.01, 0.18, 0.76);
    }
  }

  private computeChaseCamGoal(outPos: THREE.Vector3, outLook: THREE.Vector3): void {
    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);
    const backDist = 19.6;
    const heightOffset = 7.8;

    outPos.set(
      this.pos.x + sinY * backDist,
      Math.max(OCEAN_LEVEL + 2.4, this.pos.y + heightOffset),
      this.pos.z + cosY * backDist
    );
    outLook.set(this.pos.x - sinY * 11, this.pos.y + 2.2, this.pos.z - cosY * 11);
  }

  private computeTitleOrbitCamera(outPos: THREE.Vector3, outLook: THREE.Vector3): void {
    // Grand sweeping cinematic orbit showcasing 2x skyline with pointed spires, West Port, rivers, Forest & Snow Range
    const centerX = -110;
    const centerZ = 35;
    const radiusX = 860 + Math.sin(this.titleOrbitAngle * 0.6) * 95;
    const radiusZ = 760 + Math.cos(this.titleOrbitAngle * 0.5) * 85;
    const altitude = 235 + Math.sin(this.titleOrbitAngle * 1.15) * 42;

    outPos.set(
      centerX + Math.cos(this.titleOrbitAngle) * radiusX,
      altitude,
      centerZ + Math.sin(this.titleOrbitAngle) * radiusZ
    );
    outLook.set(
      centerX + Math.cos(this.titleOrbitAngle + 0.85) * 145,
      58 + Math.sin(this.titleOrbitAngle * 0.7) * 16,
      centerZ + Math.sin(this.titleOrbitAngle + 0.85) * 125
    );
  }

  private isPointInsideBuilding(x: number, y: number, z: number, pad = 1.8): boolean {
    for (let i = 0; i < this.colliders.length; i++) {
      const c = this.colliders[i];
      if (
        x >= c.minX - pad &&
        x <= c.maxX + pad &&
        z >= c.minZ - pad &&
        z <= c.maxZ + pad &&
        y >= c.baseY - 1.0 &&
        y <= c.topY + 1.2
      ) {
        return true;
      }
    }
    return false;
  }

  private hasClearFlybyLOS(cx: number, cy: number, cz: number): boolean {
    if (this.isPointInsideBuilding(cx, cy, cz, 0.8)) return false;
    const minSurf = Math.max(OCEAN_LEVEL + 1.4, getSurfaceHeightAt(cx, cz) + 1.2);
    if (cy < minSurf) return false;

    const hx = this.pos.x;
    const hy = this.pos.y + 1.8;
    const hz = this.pos.z;

    // Sample 4 intermediate sightline points to verify neither terrain nor a tall structure blocks the shot
    for (let step = 1; step <= 4; step++) {
      const t = step / 5;
      const sx = THREE.MathUtils.lerp(cx, hx, t);
      const sy = THREE.MathUtils.lerp(cy, hy, t);
      const sz = THREE.MathUtils.lerp(cz, hz, t);
      if (sy < getTerrainHeight(sx, sz) + 0.8) return false;
      if (this.isPointInsideBuilding(sx, sy, sz, 0.35)) return false;
    }
    return true;
  }

  /**
   * Smart POI-prioritized Fly-By vantage point selector (within 22m–95m of the helicopter):
   * Priority: Oil Rigs -> Moving Ships (real-time deck anchor) -> Helipads -> Building Rooftops ->
   * Elevated Hills/Mountains/Canyons/Lighthouse/Turbines -> Ground/Sea trajectory fallback.
   */
  private selectFlybyVantage(): void {
    const speed = Math.hypot(this.vel.x, this.vel.z);
    const moving = speed > 3.2;
    const fwdX = moving ? this.vel.x / speed : -Math.sin(this.yaw);
    const fwdZ = moving ? this.vel.z / speed : -Math.cos(this.yaw);
    const rightX = -fwdZ;
    const rightZ = fwdX;

    const aheadDist = moving ? THREE.MathUtils.clamp(speed * 1.45, 32, 62) : 34;
    const focusX = this.pos.x + fwdX * aheadDist;
    const focusZ = this.pos.z + fwdZ * aheadDist;

    let bestScore = -Infinity;
    let bestX = focusX;
    let bestY = Math.max(OCEAN_LEVEL + 4.2, getSurfaceHeightAt(focusX, focusZ) + 2.6);
    let bestZ = focusZ;
    let bestShipIdx: number | null = null;

    const considerCandidate = (
      cx: number,
      cy: number,
      cz: number,
      priorityBonus: number,
      shipIdx: number | null
    ) => {
      const distHeli = Math.hypot(cx - this.pos.x, cz - this.pos.z);
      const dist3d = Math.hypot(cx - this.pos.x, cy - this.pos.y, cz - this.pos.z);
      if (distHeli < 18 || dist3d < 20 || dist3d > 98) return;

      // Avoid picking virtually the exact same spot as previous Fly-By camera when auto-repositioning
      const distFromPrev = Math.hypot(cx - this.flybyPos.x, cz - this.flybyPos.z);
      const repeatPenalty = distFromPrev < 16 && moving ? 55 : 0;

      // Strongly reward points ahead of the flight trajectory when moving
      const dirX = (cx - this.pos.x) / Math.max(1, distHeli);
      const dirZ = (cz - this.pos.z) / Math.max(1, distHeli);
      const aheadDot = dirX * fwdX + dirZ * fwdZ;
      if (moving && aheadDot < -0.22) return;

      if (!this.hasClearFlybyLOS(cx, cy, cz)) return;

      const distToFocus = Math.hypot(cx - focusX, cz - focusZ);
      const idealDistPenalty = Math.abs(dist3d - 48) * 0.45;
      const vertGapPenalty = Math.abs(cy - this.pos.y) * 0.22;
      const score =
        priorityBonus +
        aheadDot * (moving ? 28 : 8) -
        distToFocus * 0.38 -
        idealDistPenalty -
        vertGapPenalty -
        repeatPenalty;

      if (score > bestScore) {
        bestScore = score;
        bestX = cx;
        bestY = cy;
        bestZ = cz;
        bestShipIdx = shipIdx;
      }
    };

    // 1. PRIORITY 1: Offshore Oil Rigs (Alpha, Bravo, Charlie — helideck edge, catwalk, flare tower deck)
    for (let i = 0; i < OIL_RIGS.length; i++) {
      const rig = OIL_RIGS[i];
      if (Math.hypot(rig.x - this.pos.x, rig.z - this.pos.z) > 135) continue;
      considerCandidate(rig.padX + 11.5, rig.padY + 2.2, rig.padZ + 11.5, 165, null);
      considerCandidate(rig.padX - 11.5, rig.padY + 2.2, rig.padZ + 10.5, 165, null);
      considerCandidate(rig.x + 25, 19.6, rig.z + 18, 162, null);
      considerCandidate(rig.x + 20, 25.4, rig.z - 17, 160, null);
    }

    // 2. PRIORITY 2: Moving Ships & Offshore Boats (anchors in real-time to ship bow/deck!)
    const shipVantages = this.livingWorld.getShipCameraVantages();
    for (let i = 0; i < shipVantages.length; i++) {
      const sv = shipVantages[i];
      if (Math.hypot(sv.x - this.pos.x, sv.z - this.pos.z) > 110) continue;
      considerCandidate(sv.x, sv.y, sv.z, 156, sv.index);
    }

    // 3. PRIORITY 3: Helipads (Base HQ, Hospital, Fazenda, Posto Cânion, Usina Solar, Costa do Sol, Pine Peak, etc.)
    for (let i = 0; i < this.helipads.length; i++) {
      const pad = this.helipads[i];
      const padDist = Math.hypot(pad.x - this.pos.x, pad.z - this.pos.z);
      if (padDist > 115) continue;

      const ringR = Math.max(pad.radius + 4.5, 15.5);
      // Try 4 rim corners around the helipad at human observer height (~2.1m above pad surface)
      for (let k = 0; k < 4; k++) {
        const ang = k * (Math.PI * 0.5) + 0.65;
        const px = pad.x + Math.cos(ang) * ringR;
        const pz = pad.z + Math.sin(ang) * ringR;
        const surfY = pad.biome === 'urban' || pad.biome === 'oilrig' ? pad.y : Math.max(pad.y, getTerrainHeight(px, pz));
        considerCandidate(px, surfY + 2.15, pz, 144, null);
      }
    }

    // 4. PRIORITY 4: City Buildings & Skyscraper Rooftop Edges (never inside a building)
    for (let i = 0; i < BUILDING_SPECS.length; i++) {
      const b = BUILDING_SPECS[i];
      const bDist = Math.hypot(b.x - focusX, b.z - focusZ);
      if (bDist > 105) continue;
      // Skip pointed needle crowns where the roof isn't a flat observation terrace
      if (b.crownStyle && b.crownStyle !== 'flat') continue;

      const roofY = getTerrainHeight(b.x, b.z) + b.height + 2.4;
      if (Math.abs(roofY - this.pos.y) > 85) continue;

      const sx = this.pos.x >= b.x ? 1 : -1;
      const sz = this.pos.z >= b.z ? 1 : -1;
      const edgeX = b.x + sx * (b.width * 0.44);
      const edgeZ = b.z + sz * (b.depth * 0.44);
      considerCandidate(edgeX, roofY, edgeZ, 128, null);
    }

    // 5. PRIORITY 5: Lighthouse, Wind Turbines, and Elevated Hills / Mountain Ridges / Canyon Plateaus
    if (Math.hypot(LIGHTHOUSE_POS.x - this.pos.x, LIGHTHOUSE_POS.z - this.pos.z) < 110) {
      const lhBase = getTerrainHeight(LIGHTHOUSE_POS.x, LIGHTHOUSE_POS.z);
      considerCandidate(LIGHTHOUSE_POS.x + 8.5, lhBase + 4.5, LIGHTHOUSE_POS.z + 8.5, 134, null);
    }

    for (let i = 0; i < WIND_TURBINES.length; i++) {
      const wt = WIND_TURBINES[i];
      if (Math.hypot(wt.x - this.pos.x, wt.z - this.pos.z) > 105) continue;
      const wtY = getTerrainHeight(wt.x, wt.z);
      considerCandidate(wt.x + 11, wtY + 3.2, wt.z + 11, 124, null);
    }

    // Probe 8 scenic ridge/hill/mesa terrain lookouts around the flight path
    const heliGroundY = getTerrainHeight(this.pos.x, this.pos.z);
    for (let s = 0; s < 8; s++) {
      const ang = s * (Math.PI / 4) + 0.3;
      const probeR = 26 + (s % 2) * 20;
      const px = focusX + Math.cos(ang) * probeR;
      const pz = focusZ + Math.sin(ang) * probeR;
      const py = getTerrainHeight(px, pz);
      if (py > OCEAN_LEVEL + 4.5 && py >= heliGroundY + 4.0) {
        // Higher natural prominence gets stronger hilltop priority
        const prominenceBonus = THREE.MathUtils.clamp((py - heliGroundY) * 1.4, 0, 26);
        considerCandidate(px, py + 2.6, pz, 102 + prominenceBonus, null);
      }
    }

    // 6. PRIORITY 6: Clean Ground / Open-Sea Fallback ahead & slightly offset to alternate side
    this.flybySideSign = -this.flybySideSign;
    const fallbackOffsets: Array<[number, number]> = [
      [aheadDist, 18 * this.flybySideSign],
      [aheadDist * 0.78, -20 * this.flybySideSign],
      [34, 24 * this.flybySideSign],
      [26, -24 * this.flybySideSign],
    ];
    for (let i = 0; i < fallbackOffsets.length; i++) {
      const [fwdOff, latOff] = fallbackOffsets[i];
      const fx = this.pos.x + fwdX * fwdOff + rightX * latOff;
      const fz = this.pos.z + fwdZ * fwdOff + rightZ * latOff;
      const overSea = isOverWater(fx, fz);
      const surfY = getSurfaceHeightAt(fx, fz);
      const fy = overSea ? Math.max(OCEAN_LEVEL + 4.2, surfY + 3.6) : surfY + 2.6;
      considerCandidate(fx, fy, fz, 72 - i * 4, null);
    }

    // Absolute safety guarantee if helicopter is buried right beside tall walls
    if (bestScore === -Infinity) {
      const fx = this.pos.x + fwdX * 36 + rightX * 18 * this.flybySideSign;
      const fz = this.pos.z + fwdZ * 36 + rightZ * 18 * this.flybySideSign;
      const surf = this.sampleSupportSurface(fx, fz, this.pos.y + 40);
      bestX = fx;
      bestY = Math.max(OCEAN_LEVEL + 4.2, surf.height + 2.8);
      bestZ = fz;
      bestShipIdx = null;
    }

    this.flybyPos.set(bestX, bestY, bestZ);
    this.flybyAnchorShipIndex = bestShipIdx;
    this.flybyClosestDist = this.flybyPos.distanceTo(this.pos);
    this.flybyDeparting = false;
    this.flybyDepartTimer = 0;
    this.flybyCooldown = 0.65;
    this.flybyCutPending = true;
  }

  private updateCamera(dt: number): void {
    if (this.phase === 'title') {
      this.titleOrbitAngle += dt * 0.075;
      this.camera.up.copy(_vecUp);
      this.computeTitleOrbitCamera(_vecCamTargetPos, _vecCamLookAt);
      this.camera.position.copy(_vecCamTargetPos);
      this.camera.lookAt(_vecCamLookAt);
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, 52, 4, dt);
      this.camera.updateProjectionMatrix();
      return;
    }

    // Smooth cinematic swoop transition from Title Orbital Camera right into Chase Camera
    if (this.camTransitionElapsed >= 0) {
      this.camTransitionElapsed += dt;
      const rawT = Math.min(1, this.camTransitionElapsed / this.camTransitionDuration);
      // Cubic ease-in-out
      const ease = rawT < 0.5 ? 4 * rawT * rawT * rawT : 1 - Math.pow(-2 * rawT + 2, 3) / 2;

      this.computeChaseCamGoal(_vecCamTargetPos, _vecCamLookAt);
      this.camPosCurrent.lerpVectors(this.camTransitionStartPos, _vecCamTargetPos, ease);
      this.camLookCurrent.lerpVectors(this.camTransitionStartLook, _vecCamLookAt, ease);

      this.camera.up.copy(_vecUp);
      this.camera.position.copy(this.camPosCurrent);
      this.camera.fov = THREE.MathUtils.lerp(52, 58, ease);
      this.camera.updateProjectionMatrix();
      this.camera.lookAt(this.camLookCurrent);

      if (rawT >= 1) {
        this.camTransitionElapsed = -1;
      }
      return;
    }

    if (this.cameraMode === 'chase') {
      this.computeChaseCamGoal(_vecCamTargetPos, _vecCamLookAt);

      this.camPosCurrent.x = THREE.MathUtils.damp(this.camPosCurrent.x, _vecCamTargetPos.x, 5.4, dt);
      this.camPosCurrent.y = THREE.MathUtils.damp(this.camPosCurrent.y, _vecCamTargetPos.y, 5.0, dt);
      this.camPosCurrent.z = THREE.MathUtils.damp(this.camPosCurrent.z, _vecCamTargetPos.z, 5.4, dt);

      // Safe minimum chase distance from spinning rotors
      const minHorizDist = 16.0;
      const dx = this.camPosCurrent.x - this.pos.x;
      const dz = this.camPosCurrent.z - this.pos.z;
      const horizDist = Math.hypot(dx, dz);
      if (horizDist < minHorizDist) {
        if (horizDist > 0.001) {
          const push = minHorizDist / horizDist;
          this.camPosCurrent.x = this.pos.x + dx * push;
          this.camPosCurrent.z = this.pos.z + dz * push;
        } else {
          this.camPosCurrent.x = this.pos.x + Math.sin(this.yaw) * minHorizDist;
          this.camPosCurrent.z = this.pos.z + Math.cos(this.yaw) * minHorizDist;
        }
      }

      _vecCamOffset.subVectors(this.camPosCurrent, this.pos);
      const dist3d = _vecCamOffset.length();
      if (dist3d < 17.2 && dist3d > 0.001) {
        _vecCamOffset.multiplyScalar(17.2 / dist3d);
        this.camPosCurrent.copy(this.pos).add(_vecCamOffset);
      }
      const minSafeY = Math.max(OCEAN_LEVEL + 2.2, this.pos.y + 4.4);
      if (this.camPosCurrent.y < minSafeY) {
        this.camPosCurrent.y = minSafeY;
      }

      this.camLookCurrent.x = THREE.MathUtils.damp(this.camLookCurrent.x, _vecCamLookAt.x, 7.5, dt);
      this.camLookCurrent.y = THREE.MathUtils.damp(this.camLookCurrent.y, _vecCamLookAt.y, 7.5, dt);
      this.camLookCurrent.z = THREE.MathUtils.damp(this.camLookCurrent.z, _vecCamLookAt.z, 7.5, dt);

      this.camera.up.copy(_vecUp);
      this.camera.position.copy(this.camPosCurrent);

      const speed = Math.hypot(this.vel.x, this.vel.z);
      const targetFov = 58 + THREE.MathUtils.clamp(speed * 0.2, 0, 9);
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 4, dt);
      this.camera.updateProjectionMatrix();

      if (this.cameraShake > 0.005) {
        this.camera.position.x += (Math.random() - 0.5) * this.cameraShake * 1.4;
        this.camera.position.y += (Math.random() - 0.5) * this.cameraShake * 1.4;
        this.cameraShake = THREE.MathUtils.damp(this.cameraShake, 0, 7.5, dt);
      }

      this.camera.lookAt(this.camLookCurrent);
    } else if (this.cameraMode === 'cockpit') {
      // 1st-Person Cockpit View: anchored at nose glare-shield looking forward along helicopter pitch/yaw
      this.heli.root.updateMatrixWorld(true);
      _vecCockpitEye.copy(this.heli.cockpitCamLocalPos).applyMatrix4(this.heli.root.matrixWorld);

      // Forward look target 48m ahead in helicopter local space (pitched/yawed cleanly with aircraft)
      _vecCockpitLook
        .set(0, this.heli.cockpitCamLocalPos.y - 0.85, this.heli.cockpitCamLocalPos.z - 48)
        .applyMatrix4(this.heli.root.matrixWorld);

      // Gentle damped roll tilt on camera up vector so horizon banks naturally without motion sickness
      _eulerCockpit.set(this.pitch, this.yaw, this.roll * 0.65, 'YXZ');
      _vecCockpitUp.set(0, 1, 0).applyEuler(_eulerCockpit).normalize();

      this.camera.position.copy(_vecCockpitEye);
      this.camera.up.lerp(_vecCockpitUp, 1 - Math.exp(-14 * dt));

      const speed = Math.hypot(this.vel.x, this.vel.z);
      const targetFov = 64 + THREE.MathUtils.clamp(speed * 0.14, 0, 7);
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 5, dt);
      this.camera.updateProjectionMatrix();

      if (this.cameraShake > 0.005) {
        this.camera.position.x += (Math.random() - 0.5) * this.cameraShake * 0.45;
        this.camera.position.y += (Math.random() - 0.5) * this.cameraShake * 0.45;
        this.cameraShake = THREE.MathUtils.damp(this.cameraShake, 0, 7.5, dt);
      }

      this.camera.lookAt(_vecCockpitLook);
    } else if (this.cameraMode === 'orbit') {
      // Free 360° Orbital Camera: stays locked at chosen relative angle while player flies + smooth scroll zoom
      this.orbitDistCurrent = THREE.MathUtils.damp(this.orbitDistCurrent, this.orbitDistTarget, 8.5, dt);

      const worldAz = this.yaw + this.orbitAzimuthOffset;
      const cosPol = Math.cos(this.orbitPolarAngle);
      const sinPol = Math.sin(this.orbitPolarAngle);
      const horizR = cosPol * this.orbitDistCurrent;

      const pivotY = this.pos.y + 1.8;
      const goalX = this.pos.x + Math.sin(worldAz) * horizR;
      const goalZ = this.pos.z + Math.cos(worldAz) * horizR;
      const rawGoalY = pivotY + sinPol * this.orbitDistCurrent;

      // Prevent camera from ever clipping below ground or water surface
      const floorY = Math.max(OCEAN_LEVEL + 1.15, getSurfaceHeightAt(goalX, goalZ) + 1.15);
      const goalY = Math.max(rawGoalY, floorY);

      this.camPosCurrent.x = THREE.MathUtils.damp(this.camPosCurrent.x, goalX, 16, dt);
      this.camPosCurrent.y = THREE.MathUtils.damp(this.camPosCurrent.y, goalY, 16, dt);
      this.camPosCurrent.z = THREE.MathUtils.damp(this.camPosCurrent.z, goalZ, 16, dt);

      const currentFloorY = Math.max(
        OCEAN_LEVEL + 1.1,
        getSurfaceHeightAt(this.camPosCurrent.x, this.camPosCurrent.z) + 1.1
      );
      if (this.camPosCurrent.y < currentFloorY) {
        this.camPosCurrent.y = currentFloorY;
      }

      _vecCamLookAt.set(this.pos.x, pivotY, this.pos.z);
      this.camLookCurrent.x = THREE.MathUtils.damp(this.camLookCurrent.x, _vecCamLookAt.x, 18, dt);
      this.camLookCurrent.y = THREE.MathUtils.damp(this.camLookCurrent.y, _vecCamLookAt.y, 18, dt);
      this.camLookCurrent.z = THREE.MathUtils.damp(this.camLookCurrent.z, _vecCamLookAt.z, 18, dt);

      this.camera.up.copy(_vecUp);
      this.camera.position.copy(this.camPosCurrent);
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, 55, 6, dt);
      this.camera.updateProjectionMatrix();

      if (this.cameraShake > 0.005) {
        this.camera.position.x += (Math.random() - 0.5) * this.cameraShake * 0.9;
        this.camera.position.y += (Math.random() - 0.5) * this.cameraShake * 0.9;
        this.cameraShake = THREE.MathUtils.damp(this.cameraShake, 0, 7.5, dt);
      }

      this.camera.lookAt(this.camLookCurrent);
    } else if (this.cameraMode === 'flyby') {
      // Smart Cinematic Fly-By Camera: fixed/ship-anchored observer tracking helicopter
      // Holds for a full 7.0 seconds after closest approach as the helicopter departs, with smooth telephoto zoom
      if (this.flybyCooldown > 0) this.flybyCooldown -= dt;

      if (this.flybyAnchorShipIndex !== null) {
        this.livingWorld.getShipVantageByIndex(this.flybyAnchorShipIndex, this.flybyPos);
      }

      const distToHeli = this.flybyPos.distanceTo(this.pos);
      // Radial speed (> 0 means moving away from camera, < 0 means approaching camera)
      const relX = this.pos.x - this.flybyPos.x;
      const relY = this.pos.y - this.flybyPos.y;
      const relZ = this.pos.z - this.flybyPos.z;
      const radialSpeed =
        (relX * this.vel.x + relY * this.vel.y + relZ * this.vel.z) / Math.max(0.001, distToHeli);

      if (!this.flybyDeparting) {
        if (distToHeli < this.flybyClosestDist) {
          this.flybyClosestDist = distToHeli;
        } else if (distToHeli > this.flybyClosestDist + 2.5 && radialSpeed > 1.5) {
          // Helicopter passed closest approach and is now pulling away — start 7s cinematic hold timer
          this.flybyDeparting = true;
          this.flybyDepartTimer = 0;
        }
      } else {
        if (radialSpeed < -3.0 && distToHeli < Math.max(this.flybyClosestDist + 2.0, 58)) {
          // Helicopter looped back toward the camera — reset pass detection smoothly
          this.flybyDeparting = false;
          this.flybyDepartTimer = 0;
          this.flybyClosestDist = Math.min(this.flybyClosestDist, distToHeli);
        } else {
          this.flybyDepartTimer += dt;
        }
      }

      // Cut only after completing the full 7.0s post-pass hold, or if exceeding the expanded 320m safety distance
      const postPassExpired = this.flybyDeparting && this.flybyDepartTimer >= 7.0;
      const maxDistExceeded = distToHeli > 320;

      if (this.flybyCooldown <= 0 && (postPassExpired || maxDistExceeded)) {
        this.selectFlybyVantage();
      }

      _vecCamLookAt.set(this.pos.x, this.pos.y + 1.65, this.pos.z);

      if (this.flybyCutPending) {
        this.camPosCurrent.copy(this.flybyPos);
        this.camLookCurrent.copy(_vecCamLookAt);
        this.flybyCutPending = false;
      } else {
        // Tight snap for fixed/ship anchor so ship deck motion stays rock-solid without jitter
        this.camPosCurrent.copy(this.flybyPos);
        this.camLookCurrent.x = THREE.MathUtils.damp(this.camLookCurrent.x, _vecCamLookAt.x, 14, dt);
        this.camLookCurrent.y = THREE.MathUtils.damp(this.camLookCurrent.y, _vecCamLookAt.y, 14, dt);
        this.camLookCurrent.z = THREE.MathUtils.damp(this.camLookCurrent.z, _vecCamLookAt.z, 14, dt);
      }

      this.camera.up.copy(_vecUp);
      this.camera.position.copy(this.camPosCurrent);

      // Smooth telephoto zoom during the 7s departure (55° → 32°), smoothly opening back to 55° after a camera cut
      const curDist = this.camPosCurrent.distanceTo(this.pos);
      let targetFov = 55;
      if (this.flybyDeparting) {
        const timerNorm = THREE.MathUtils.clamp(this.flybyDepartTimer / 7.0, 0, 1);
        const distNorm = THREE.MathUtils.clamp((curDist - 30) / 230, 0, 1);
        const zoomT = THREE.MathUtils.clamp(timerNorm * 0.6 + distNorm * 0.4, 0, 1);
        targetFov = THREE.MathUtils.lerp(55, 32, zoomT);
      } else {
        // Gentle framing while approaching; smoothly resets FOV back toward 55° after cutting to a new vantage
        const approachNorm = THREE.MathUtils.clamp((curDist - 40) / 140, 0, 1);
        targetFov = THREE.MathUtils.lerp(55, 49, approachNorm);
      }
      const fovLambda = this.flybyDeparting ? 3.2 : 5.2;
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, fovLambda, dt);
      this.camera.updateProjectionMatrix();
      this.camera.lookAt(this.camLookCurrent);
    } else {
      const surf = this.sampleSupportSurface(this.pos.x, this.pos.z, this.pos.y);
      const agl = Math.max(0, this.pos.y - surf.height);
      const camLift = THREE.MathUtils.clamp(24 + agl * 0.42, 24, 62);

      _vecCamTargetPos.set(this.pos.x, this.pos.y + camLift, this.pos.z);
      this.camPosCurrent.x = THREE.MathUtils.damp(this.camPosCurrent.x, _vecCamTargetPos.x, 12, dt);
      this.camPosCurrent.y = THREE.MathUtils.damp(this.camPosCurrent.y, _vecCamTargetPos.y, 9, dt);
      this.camPosCurrent.z = THREE.MathUtils.damp(this.camPosCurrent.z, _vecCamTargetPos.z, 12, dt);

      _vecTopDownUp.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();
      this.camera.up.lerp(_vecTopDownUp, 1 - Math.exp(-10 * dt));
      this.camera.position.copy(this.camPosCurrent);
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, 50, 5, dt);
      this.camera.updateProjectionMatrix();

      _vecCamLookAt.set(this.pos.x, this.pos.y, this.pos.z);
      this.camera.lookAt(_vecCamLookAt);
    }
  }

  /**
   * 360° Searchlight Gimbal solver (runs after camera & helicopter updates so raycasting and
   * volumetric cone alignment are 100% synced in both 3rd-person Chase and Top-Down views).
   */
  private updateSearchlightGimbal(dt: number, nightFactor: number): void {
    this.heli.searchlightGimbal.getWorldPosition(_vecBeamOriginWorld);

    const surfBelow = this.sampleSupportSurface(this.pos.x, this.pos.z, this.pos.y);
    const agl = Math.max(0, this.pos.y - surfBelow.height);

    if (this.searchlightMode === 'VERTICAL') {
      // Straight down beneath the helicopter center so Top-Down landing reticle is dead-center illuminated
      const targetY = Math.min(_vecBeamOriginWorld.y - 1.8, surfBelow.height);
      _vecGimbalDesiredRel.set(
        this.pos.x - _vecBeamOriginWorld.x,
        targetY - _vecBeamOriginWorld.y,
        this.pos.z - _vecBeamOriginWorld.z
      );
    } else if (this.searchlightMode === 'MANUAL' && this.searchlightOn && this.phase === 'playing') {
      // 360° real-time raycasting from active camera (Chase or Top-Down) onto buildings & terrain/ground plane
      this.camera.updateMatrixWorld();
      this.raycaster.setFromCamera(this.mouseNdc, this.camera);

      let bestDist = Infinity;
      let hasHit = false;

      // 1. Check low-poly buildings, rooftops, dam, and airbase structures
      const buildingHits = this.raycaster.intersectObjects(this.world.raycastTargets, false);
      if (buildingHits.length > 0) {
        bestDist = buildingHits[0].distance;
        _vecRayHit.copy(buildingHits[0].point);
        hasHit = true;
      }

      // 2. Intersect horizontal ground plane (y = 0) and iteratively refine to island terrain heightfield
      const rayO = this.raycaster.ray.origin;
      const rayD = this.raycaster.ray.direction;
      const planeHit = this.raycaster.ray.intersectPlane(_groundPlane, _vecPlaneHit);
      if (planeHit && rayD.y < -0.02) {
        let t = -rayO.y / rayD.y;
        for (let iter = 0; iter < 3; iter++) {
          const px = rayO.x + rayD.x * t;
          const pz = rayO.z + rayD.z * t;
          const groundY = getSurfaceHeightAt(px, pz);
          const nextT = (groundY - rayO.y) / rayD.y;
          if (nextT > 1) {
            t = THREE.MathUtils.lerp(t, nextT, 0.78);
          }
        }
        if (t > 1 && t < bestDist) {
          const gx = rayO.x + rayD.x * t;
          const gz = rayO.z + rayD.z * t;
          const gy = getSurfaceHeightAt(gx, gz);
          _vecRayHit.set(gx, gy, gz);
          bestDist = t;
          hasHit = true;
        }
      }

      const maxReach = 148;
      if (!hasHit) {
        // Cursor pointed above horizon: sweep smoothly along cursor horizontal azimuth at max reach
        const horizLen = Math.hypot(rayD.x, rayD.z);
        const dirX = horizLen > 0.001 ? rayD.x / horizLen : -Math.sin(this.yaw);
        const dirZ = horizLen > 0.001 ? rayD.z / horizLen : -Math.cos(this.yaw);
        const fx = _vecBeamOriginWorld.x + dirX * maxReach;
        const fz = _vecBeamOriginWorld.z + dirZ * maxReach;
        _vecRayHit.set(fx, getSurfaceHeightAt(fx, fz), fz);
      }

      let dx = _vecRayHit.x - _vecBeamOriginWorld.x;
      let dz = _vecRayHit.z - _vecBeamOriginWorld.z;
      let targetY = _vecRayHit.y;
      const hDist = Math.hypot(dx, dz);
      if (hDist > maxReach) {
        const clampScale = maxReach / hDist;
        dx *= clampScale;
        dz *= clampScale;
        targetY = getSurfaceHeightAt(_vecBeamOriginWorld.x + dx, _vecBeamOriginWorld.z + dz);
      }

      // Prevent beam from aiming upward through the cabin/rotors
      const clampedY = Math.min(_vecBeamOriginWorld.y - 1.4, targetY);
      _vecGimbalDesiredRel.set(dx, clampedY - _vecBeamOriginWorld.y, dz);
    } else {
      // FRONTAL mode (default): forward (-Z) and downward ahead of the cockpit
      const sinY = Math.sin(this.yaw);
      const cosY = Math.cos(this.yaw);
      const aheadDist = THREE.MathUtils.clamp(24 + agl * 0.72 - this.pitch * 22, 16, 78);
      const tx = _vecBeamOriginWorld.x - sinY * aheadDist;
      const tz = _vecBeamOriginWorld.z - cosY * aheadDist;
      const surfAhead = this.sampleSupportSurface(tx, tz, this.pos.y + 40).height;
      const ty = Math.min(_vecBeamOriginWorld.y - 2.4, surfAhead);
      _vecGimbalDesiredRel.set(
        tx - _vecBeamOriginWorld.x,
        ty - _vecBeamOriginWorld.y,
        tz - _vecBeamOriginWorld.z
      );
    }

    // Smooth mechanical gimbal slew (damping relative offset prevents flight-speed lag)
    if (dt <= 0) {
      this.gimbalRelOffset.copy(_vecGimbalDesiredRel);
    } else {
      const gimbalLambda = this.searchlightMode === 'MANUAL' ? 10.5 : 13.0;
      this.gimbalRelOffset.x = THREE.MathUtils.damp(
        this.gimbalRelOffset.x,
        _vecGimbalDesiredRel.x,
        gimbalLambda,
        dt
      );
      this.gimbalRelOffset.y = THREE.MathUtils.damp(
        this.gimbalRelOffset.y,
        _vecGimbalDesiredRel.y,
        gimbalLambda,
        dt
      );
      this.gimbalRelOffset.z = THREE.MathUtils.damp(
        this.gimbalRelOffset.z,
        _vecGimbalDesiredRel.z,
        gimbalLambda,
        dt
      );
    }

    _vecBeamTargetWorld.copy(_vecBeamOriginWorld).add(this.gimbalRelOffset);

    // 1. Sync SpotLight.target in world space
    this.heli.searchlightTarget.position.copy(_vecBeamTargetWorld);
    this.heli.searchlightTarget.updateMatrixWorld();

    // 2. Rotate physical nose gimbal housing toward world target (safe up vector when aiming straight down)
    const horizBeamDist = Math.hypot(this.gimbalRelOffset.x, this.gimbalRelOffset.z);
    if (horizBeamDist < 0.14) {
      this.heli.searchlightGimbal.up.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    } else {
      this.heli.searchlightGimbal.up.copy(_vecUp);
    }
    this.heli.searchlightGimbal.lookAt(_vecBeamTargetWorld);
    this.heli.searchlightGimbal.updateMatrixWorld(true);

    // 3. Drive real SpotLight intensity & volumetric cone geometry (lookAt + dynamic length to ground)
    const isOn = this.searchlightOn;
    this.heli.searchlight.intensity = isOn ? 190 + nightFactor * 430 : 0;
    this.heli.searchlightBulbMat.emissiveIntensity = isOn ? 4.6 : 0;
    this.heli.searchlightCone.visible = isOn;

    if (isOn) {
      this.heli.searchlight.getWorldPosition(_vecBeamLensWorld);
      this.heli.searchlightCone.position.copy(_vecBeamLensWorld);
      if (horizBeamDist < 0.14) {
        this.heli.searchlightCone.up.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      } else {
        this.heli.searchlightCone.up.copy(_vecUp);
      }
      this.heli.searchlightCone.lookAt(_vecBeamTargetWorld);

      const beamDist = Math.max(2.2, _vecBeamLensWorld.distanceTo(_vecBeamTargetWorld));
      const coneLen = Math.min(beamDist, 185);
      const coneRadius = THREE.MathUtils.clamp(
        coneLen * Math.tan(SEARCHLIGHT_SPOT_ANGLE) * 0.96,
        0.55,
        32
      );
      this.heli.searchlightCone.scale.set(coneRadius, coneRadius, coneLen);

      const coneMat = this.heli.searchlightCone.material as THREE.MeshBasicMaterial;
      const topDownDamp =
        this.cameraMode === 'topdown'
          ? this.searchlightMode === 'VERTICAL'
            ? 0.55
            : 0.72
          : 1.0;
      coneMat.opacity =
        (this.weather === 'FOG' || this.weather === 'BLIZZARD'
          ? 0.088 + nightFactor * 0.035
          : 0.065 + nightFactor * 0.045) * topDownDamp;
    }
  }

  private emitTelemetry(): void {
    const surf = this.sampleSupportSurface(this.pos.x, this.pos.z, this.pos.y);
    const aglMeters = Math.max(0, this.pos.y - surf.height);
    const horizSpeedMs = Math.hypot(this.vel.x, this.vel.z);

    const speedKnots = Math.round(horizSpeedMs * 1.94384);
    const altitudeFeet = Math.max(0, Math.round(this.pos.y * 3.28084));
    const aglFeet = Math.round(aglMeters * 3.28084);
    const verticalSpeedFpm = Math.round(this.vel.y * 196.85);

    const rawDeg = ((-this.yaw * 180) / Math.PI) % 360;
    const headingDeg = Math.round((rawDeg + 360) % 360);

    const totalMins = Math.floor(this.gameMinutes) % (24 * 60);
    const hh = String(Math.floor(totalMins / 60)).padStart(2, '0');
    const mm = String(totalMins % 60).padStart(2, '0');

    let dispatchSnapshot: DispatchAssignment | null = null;
    if (this.activeDispatch) {
      const pad = this.helipads.find((p) => p.id === this.activeDispatch!.targetPadId);
      if (pad) {
        dispatchSnapshot = {
          ...this.activeDispatch,
          distanceMeters: Math.round(Math.hypot(pad.x - this.pos.x, pad.z - this.pos.z)),
        };
      }
    }

    const activeFire = this.fireSystem.getTelemetrySnapshot(this.pos.x, this.pos.z);
    const activePursuit = this.specialMissions.getPursuitTelemetry(this.pos.x, this.pos.z);
    const activeWinchRescue = this.specialMissions.getWinchTelemetry(this.pos.x, this.pos.z);
    const activeSlingCargo = this.slingLoad.getTelemetry(this.pos.x, this.pos.z);
    const padErr = surf.helipad
      ? Math.hypot(this.pos.x - surf.helipad.x, this.pos.z - surf.helipad.z)
      : -1;

    this.callbacks.onTelemetry({
      speedKnots,
      altitudeFeet,
      aglFeet,
      verticalSpeedFpm,
      headingDeg,
      fuelPercent: Math.round(this.fuel),
      hullPercent: Math.round(this.hull),
      rotorRpmPercent: Math.round(Math.min(100, this.rotorRpm * 100)),
      isLanded: this.isLanded,
      landedPadId: this.landedPad?.id ?? null,
      landedPadName: this.landedPad?.name ?? (surf.helipad ? surf.helipad.name : null),
      padAlignmentError: padErr,
      bucketDeployed: this.bucketDeployed,
      bucketWaterPercent: Math.round(this.bucketWater),
      isScoopingWater: this.isScoopingWater,
      isDumpingWater: this.isDumpingWater,
      timeOfDay: this.getTimeOfDayPeriod(),
      weather: this.weather,
      searchlightOn: this.searchlightOn,
      searchlightMode: this.searchlightMode,
      radioStation: this.radioStation,
      x: this.pos.x,
      y: this.pos.y,
      z: this.pos.z,
      yawRad: this.yaw,
      pitchRad: this.pitch,
      rollRad: this.roll,
      companyName: this.companyName,
      activeHelicopterId: this.activeHelicopterId,
      activeHelicopterName: this.activeSpec.name,
      hasIntegratedTank: this.activeSpec.physics.hasIntegratedTank,
      unlockedHelicopters: [...this.unlockedHelicopters],
      upgrades: { ...this.upgrades },
      liveryId: this.liveryId,
      money: this.money,
      xp: this.xp,
      xpToNextLevel: this.level * 120,
      level: this.level,
      rankTitle: RANK_TITLES[Math.min(this.level - 1, RANK_TITLES.length - 1)],
      gameTimeFormatted: `${hh}:${mm}`,
      dutyStatus: this.dutyStatus,
      cameraMode: this.cameraMode,
      muted: this.audio.isMuted(),
      activeDispatch: dispatchSnapshot,
      activeFire,
      activePursuit,
      activeWinchRescue,
      activeSlingCargo,
      winchStatus: this.specialMissions.getWinchStatus(),
      aiHelicopters: this.aiHelicopters.getTelemetrySnapshots(),
      careerStats: { ...this.careerStats },
      unlockedAchievements: [...this.unlockedAchievements],
      hasSavedCareer: this.hasSavedCareer,
      masterVolume: this.audio.getMasterVolume(),
      radioVolume: this.audio.getRadioVolume(),
      graphicsQuality: this.graphicsQuality,
      fps: this.currentFps,
      drawCalls: this.currentDrawCalls,
    });
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (gl && typeof gl.fenceSync === 'function') {
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (this.disposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          this.frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          this.frameId = window.setTimeout(cb, 80);
        }
      };
      this.frameId = window.setTimeout(poll, 5);
    } else {
      this.frameId = window.setTimeout(cb, 80);
    }
  }

  private scheduleNextFrame(): void {
    if (this.disposed) return;
    if (this.isSoftwareGl) {
      this.afterDraw(() => this.tick());
    } else {
      this.frameId = requestAnimationFrame(() => this.tick());
    }
  }

  private tick(): void {
    if (this.disposed) return;

    const now = performance.now();
    const rawDt = (now - this.lastTimeMs) / 1000;
    this.lastTimeMs = now;
    const dt = Math.min(Math.max(rawDt, 0.001), 0.05);

    if (this.phase !== 'paused' && this.phase !== 'hangar') {
      this.elapsedSec += dt;

      if (this.phase === 'playing') {
        // Continuous Day/Night clock: 1 game minute per 1 real second
        this.gameMinutes = (this.gameMinutes + dt * 1.0) % (24 * 60);
      }

      const { night: nightFactor, dusk: duskFactor } = this.updateAtmosphereAndWeather(dt);

      if (this.impactCooldown > 0) this.impactCooldown -= dt;
      if (this.refuelToastCooldown > 0) this.refuelToastCooldown -= dt;

      if (
        this.pendingNextMissionTimer > 0 &&
        this.phase === 'playing' &&
        this.dutyStatus === 'ON_DUTY'
      ) {
        this.pendingNextMissionTimer -= dt;
        if (this.pendingNextMissionTimer <= 0) {
          this.dispatchNextOnDutyMission();
        }
      }

      if (this.hitstopTimer > 0) {
        this.hitstopTimer -= dt;
      } else if (this.phase === 'playing') {
        this.stepFlightPhysics(dt);
      } else {
        this.rotorRpm = THREE.MathUtils.damp(
          this.rotorRpm,
          this.phase === 'title' ? 0.55 : 0.12,
          2.5,
          dt
        );
        this.audio.updateFlightSound(this.rotorRpm, 0, false);
        this.audio.updateWaterSound('none');
      }

      this.syncHelicopterTransform(dt, nightFactor, duskFactor);
      // Advance lightweight offshore ship coordinates before camera update so Fly-By ship vantages stay exact
      this.livingWorld.stepShipKinematics(dt);
      this.updateParticles(dt);
      this.updateSnowDownwash(dt, nightFactor, duskFactor);
      this.updateWaterRipples(dt);
      this.updateWaterDrops(dt);
      this.updateCamera(dt);
      this.skyDome.position.copy(this.camera.position);

      // Compute exact current-frame Camera Frustum ("O CONE") & Forward Axis with zero 1-frame lag
      this.camera.updateMatrixWorld();
      _projScreenMatrix.multiplyMatrices(
        this.camera.projectionMatrix,
        this.camera.matrixWorldInverse
      );
      this.cameraFrustum.setFromProjectionMatrix(_projScreenMatrix);
      this.camera.getWorldDirection(_vecCamForward);

      const rainCenterX =
        this.phase === 'title'
          ? this.camera.position.x
          : THREE.MathUtils.lerp(this.pos.x, this.camera.position.x, 0.45);
      const rainCenterY =
        this.phase === 'title'
          ? this.camera.position.y
          : THREE.MathUtils.lerp(this.pos.y, this.camera.position.y, 0.45);
      const rainCenterZ =
        this.phase === 'title'
          ? this.camera.position.z
          : THREE.MathUtils.lerp(this.pos.z, this.camera.position.z, 0.45);

      this.world.updateDynamicProps(
        this.elapsedSec,
        dt,
        nightFactor,
        duskFactor,
        this.weather,
        rainCenterX,
        rainCenterY,
        rainCenterZ,
        this.lightningFlash,
        _vecSunDir,
        this.camera.position,
        this.cameraFrustum,
        _vecCamForward
      );
      this.fireSystem.update(this.elapsedSec, dt, this.cameraFrustum, this.pos);
      this.livingWorld.update(
        this.elapsedSec,
        dt,
        nightFactor,
        duskFactor,
        this.weather,
        this.camera.position,
        this.cameraFrustum
      );
      this.aiHelicopters.update(
        this.elapsedSec,
        dt,
        nightFactor,
        duskFactor,
        this.pos,
        this.landedPad?.id ?? null,
        this.weather,
        this.camera.position,
        this.cameraFrustum
      );

      // Sync translucent AdditiveBlending Sun Glow / rays sprite along uSunDirection (blooms naturally when facing the sun)
      if (this.sunGlowBaseVis > 0.01) {
        this.sunGlowSprite.visible = true;
        this.sunGlowSprite.position
          .copy(this.camera.position)
          .addScaledVector(_vecSunDir, 8400);
        const lookSunDot = THREE.MathUtils.clamp(_vecCamForward.dot(_vecSunDir), 0, 1);
        const glareBoost = Math.pow(lookSunDot, 3.0);
        this.sunGlowMat.opacity = THREE.MathUtils.clamp(
          (0.34 + glareBoost * 0.56) * this.sunGlowBaseVis,
          0,
          0.92
        );
        const glowScale = 1950 + glareBoost * 1050;
        this.sunGlowSprite.scale.set(glowScale, glowScale, 1);
        this.sunGlowMat.rotation = this.elapsedSec * 0.045;
      } else {
        this.sunGlowSprite.visible = false;
      }

      this.updateSearchlightGimbal(dt, nightFactor);

      // Phase 6: Update Police Pursuit & Winch Rescue missions with freshly synced spotlight beam & hoist pod anchor
      _vecHeliAccel.subVectors(this.vel, this.prevVel).divideScalar(Math.max(dt, 0.008));
      let winchAnchorWorld: THREE.Vector3 | undefined;
      if (this.heli.winchAnchor) {
        this.heli.winchAnchor.getWorldPosition(_vecWinchAnchorWorld);
        winchAnchorWorld = _vecWinchAnchorWorld;
      }
      const specialEvents = this.specialMissions.update({
        dt,
        elapsedSec: this.elapsedSec,
        nightFactor,
        heliPos: this.pos,
        heliVel: this.vel,
        heliAccel: _vecHeliAccel,
        isLanded: this.isLanded,
        searchlightOn: this.searchlightOn,
        beamOriginWorld: _vecBeamOriginWorld,
        beamTargetWorld: _vecBeamTargetWorld,
        winchAnchorWorld,
        rescueRewardMult: this.activeSpec.physics.rescueRewardMult,
      });

      this.audio.updateWinchSound(
        this.phase === 'playing' ? specialEvents.winchAudioMode : 'none'
      );

      if (specialEvents.pursuitCompleted) {
        const ev = specialEvents.pursuitCompleted;
        this.careerStats.policePursuits += 1;
        if (this.getTimeOfDayPeriod() === 'NIGHT' || nightFactor >= 0.45) {
          this.careerStats.nightPolicePursuits += 1;
        }
        this.awardCareer(ev.reward, ev.xpReward);
        this.audio.playPoliceRadioComplete();
        this.pushNotification(
          'Suspeito Interceptado!',
          `${ev.districtLabel} · Viatura no local · +$${ev.reward} · +${ev.xpReward} XP!`,
          'success'
        );
        if (this.dutyStatus === 'ON_DUTY') {
          this.pendingNextMissionTimer = 4.5;
        }
        this.emitTelemetry();
      }

      if (specialEvents.winchPatientHoisted) {
        const ev = specialEvents.winchPatientHoisted;
        const hospitalPad =
          this.helipads.find((p) => p.id === 'pad_b_metro_hospital') ?? this.helipads[0];
        const dist = Math.round(
          Math.hypot(hospitalPad.x - this.pos.x, hospitalPad.z - this.pos.z)
        );
        this.activeDispatch = {
          targetPadId: hospitalPad.id,
          targetPadName: hospitalPad.name,
          missionLabel: 'Evacuação Médica (Guincho)',
          missionKind: 'winch_delivery',
          nightBonusAmount: 0,
          reward: ev.reward,
          xpReward: ev.xpReward,
          distanceMeters: dist,
        };
        this.world.setDispatchTarget(hospitalPad);
        this.audio.playChime('bonus');
        this.pushNotification(
          'Vítima Içada — Paciente a Bordo!',
          `Pouse em ${hospitalPad.name} (${hospitalPad.shortCode}, ${dist}m) para concluir (+$${ev.reward})`,
          'success'
        );
        this.emitTelemetry();
      }

      // Phase 9: Update Heavy Cargo Sling Load pendulum, cable, delivery & drop integrity
      const slingEvents = this.slingLoad.update({
        dt,
        elapsedSec: this.elapsedSec,
        heliPos: this.pos,
        heliVel: this.vel,
        heliAccel: _vecHeliAccel,
        isLanded: this.isLanded,
        sampleSurfaceY: (x, z, refY) => this.sampleSupportSurface(x, z, refY).height,
      });

      if (slingEvents.delivered) {
        this.handleSlingCargoDelivered(slingEvents.delivered);
      } else if (slingEvents.cargoDamaged) {
        this.audio.playImpact(0.55);
        this.cameraShake = Math.max(this.cameraShake, 0.32);
        this.pushNotification(
          slingEvents.cargoDamaged.reason,
          `Integridade da carga reduzida para ${slingEvents.cargoDamaged.integrityPercent}%.`,
          'warning'
        );
        this.emitTelemetry();
      }

      this.telemetryAccum += dt;
      if (this.telemetryAccum >= 0.05) {
        this.telemetryAccum = 0;
        this.emitTelemetry();
      }
    } else {
      this.audio.updateWinchSound('none');
    }

    this.renderer.render(this.scene, this.camera);
    this.currentDrawCalls = this.renderer.info.render.calls;
    this.fpsFrameCount++;
    if (this.fpsSampleStartMs === 0) {
      this.fpsSampleStartMs = now;
    } else {
      const fpsElapsed = now - this.fpsSampleStartMs;
      if (fpsElapsed >= 350) {
        this.currentFps = Math.round((this.fpsFrameCount * 1000) / Math.max(1, fpsElapsed));
        this.fpsFrameCount = 0;
        this.fpsSampleStartMs = now;
      }
    }
    this.scheduleNextFrame();
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);

    window.removeEventListener('keydown', this.onKeyDownBound);
    window.removeEventListener('keyup', this.onKeyUpBound);
    this.renderer.domElement.removeEventListener('mousedown', this.onMouseDownBound);
    this.renderer.domElement.removeEventListener('wheel', this.onWheelBound);
    this.renderer.domElement.removeEventListener('contextmenu', this.onContextMenuBound);
    window.removeEventListener('mouseup', this.onMouseUpBound);
    window.removeEventListener('mousemove', this.onMouseMoveBound);
    window.removeEventListener('blur', this.onBlurBound);
    window.removeEventListener('resize', this.onResizeBound);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLostBound);

    this.heli.dispose();
    this.world.dispose();
    this.skyDomeGeo.dispose();
    this.skyDomeMat.dispose();
    this.sunGlowTex.dispose();
    this.sunGlowMat.dispose();
    this.fireSystem.dispose();
    this.specialMissions.dispose();
    this.slingLoad.dispose();
    this.livingWorld.dispose();
    this.aiHelicopters.dispose();
    this.stormLightning.dispose();
    this.particleGeo.dispose();
    this.particleMatDust.dispose();
    this.particleMatSnow.dispose();
    this.particleMatSpark.dispose();
    this.particleMatSpray.dispose();
    this.waterRippleGeo.dispose();
    for (let i = 0; i < this.waterRipples.length; i++) {
      this.waterRipples[i].mat.dispose();
    }
    this.snowDownwashTex.dispose();
    for (let i = 0; i < this.snowDownwashPuffs.length; i++) {
      this.snowDownwashPuffs[i].mat.dispose();
    }
    this.waterDropGeo.dispose();
    this.waterDropMat.dispose();
    this.audio.dispose();

    if (this.scene.environment) {
      this.scene.environment.dispose();
    }
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}

export { RADIO_LABELS, WEATHER_LABELS };
