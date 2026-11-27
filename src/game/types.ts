export type GamePhase = 'title' | 'playing' | 'paused' | 'hangar' | 'damaged';

export type CameraMode = 'chase' | 'topdown' | 'cockpit' | 'orbit' | 'flyby';

export type DutyStatus = 'OFF_DUTY' | 'ON_DUTY';

export type FireCategory = 'residential' | 'forest';

export type TimeOfDayPeriod = 'DAY' | 'DUSK' | 'NIGHT';

export type WeatherMode = 'CLEAR' | 'STORM' | 'FOG' | 'BLIZZARD';

export type RadioStation = 'OFF' | 'CHILLWAVE' | 'SYNTH_80S' | 'LOFI_NIGHTS';

export type SearchlightMode = 'FRONTAL' | 'VERTICAL' | 'MANUAL';

export type GraphicsQuality = 'ultra' | 'high' | 'medium' | 'low';

export type HelicopterId = 'mayfly' | 'wren' | 'mako' | 'chipmunk' | 'firekite' | 'resolute';

export type FleetBranch = 'starter' | 'emergency' | 'transport' | 'utility' | 'flagship';

export type HelipadBiome =
  | 'base'
  | 'urban'
  | 'dam'
  | 'forest'
  | 'snow'
  | 'desert'
  | 'beach'
  | 'oilrig';

export type DispatchMissionKind = 'transport' | 'heli_ski' | 'oil_rig' | 'winch_delivery';

export type WinchStatus = 'STOWED' | 'LOWERING' | 'HOISTING' | 'PATIENT_ONBOARD';

export type WinchRescueKind = 'sea' | 'mountain';

export type AIHeliFlightState = 'TAKING_OFF' | 'CRUISING' | 'LANDING' | 'PARKED';

export interface AIHelicopterTelemetry {
  id: string;
  callsign: string;
  x: number;
  y: number;
  z: number;
  yawRad: number;
  state: AIHeliFlightState;
  accentColor: string;
}

export type AchievementId =
  | 'first_flight'
  | 'air_firefighter'
  | 'night_eyes'
  | 'guardian_angel'
  | 'offshore_pilot'
  | 'silk_hands'
  | 'fleet_commander'
  | 'coastal_ace';

export type UpgradeId = 'turbine' | 'aux_tank' | 'reinforced_hull';

export interface FleetUpgrades {
  turbine: number; // 0..3
  aux_tank: number; // 0..3
  reinforced_hull: number; // 0..3
}

export type LiveryId =
  | 'default'
  | 'tactical_black_orange'
  | 'rescue_red_white'
  | 'coast_guard'
  | 'executive_blue_silver';

export type SlingCargoPhase = 'AWAITING_PICKUP' | 'CARRYING' | 'DROPPED_RECOVERY';

export interface ActiveSlingCargoState {
  id: string;
  title: string;
  cargoLabel: string;
  pickupLabel: string;
  dropLabel: string;
  phase: SlingCargoPhase;
  cargoX: number;
  cargoY: number;
  cargoZ: number;
  dropX: number;
  dropY: number;
  dropZ: number;
  integrityPercent: number;
  inHookZone: boolean;
  inDropZone: boolean;
  hintText: string;
  distanceMeters: number;
  reward: number;
  xpReward: number;
}

export interface CareerStats {
  flightSeconds: number;
  distanceMeters: number;
  transportMissions: number;
  firesExtinguished: number;
  policePursuits: number;
  nightPolicePursuits: number;
  winchRescues: number;
  heavyCargosDelivered: number;
  totalMoneyEarned: number;
  perfectLandings: number;
  currentPerfectStreak: number;
  bestPerfectStreak: number;
  nightOilRigLandings: number;
}

export interface HelicopterPhysicsConfig {
  maxSpeed: number;
  forwardAccel: number;
  strafeAccel: number;
  climbSpeed: number;
  yawRate: number;
  fuelBurnMult: number;
  hardLandingThreshold: number;
  damageTakenMult: number;
  waterCapacityMult: number;
  waterExtinguishMult: number;
  hasIntegratedTank: boolean;
  transportRewardMult: number;
  rescueRewardMult: number;
  fireRewardMult: number;
}

export interface HelicopterSpec {
  id: HelicopterId;
  name: string;
  category: string;
  branch: FleetBranch;
  price: number;
  tagline: string;
  perkSummary: string;
  liveryPrimary: string;
  liverySecondary: string;
  liveryAccent: string;
  stats: {
    speed: number;
    fuel: number;
    water: number;
    durability: number;
  };
  physics: HelicopterPhysicsConfig;
}

export interface SavedProgress {
  companyName: string;
  money: number;
  xp: number;
  level: number;
  unlockedHelicopters: HelicopterId[];
  activeHelicopterId: HelicopterId;
  stats: CareerStats;
  unlockedAchievements: AchievementId[];
  upgrades: FleetUpgrades;
  liveryId: LiveryId;
}

export interface HelipadData {
  id: string;
  name: string;
  shortCode: string;
  x: number;
  y: number; // exact top surface Y
  z: number;
  radius: number;
  isBase: boolean;
  district: string;
  biome: HelipadBiome;
}

export interface BuildingCollider {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  topY: number;
  baseY: number;
  hasHelipad?: boolean;
  helipadId?: string;
}

export interface BuildingSpec {
  id: string;
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  color: number;
  accentColor: number;
  style: 'office' | 'residential' | 'hospital' | 'civic' | 'tower';
  crownStyle?: 'flat' | 'pyramid' | 'stepped_spire' | 'needle';
  spireHeight?: number;
  hasHelipad?: boolean;
  helipadName?: string;
  helipadCode?: string;
  district?: string;
}

export interface DispatchAssignment {
  targetPadId: string;
  targetPadName: string;
  missionLabel: string;
  missionKind: DispatchMissionKind;
  nightBonusAmount: number;
  reward: number;
  xpReward: number;
  distanceMeters: number;
}

export interface FireSiteSpec {
  id: string;
  title: string;
  locationLabel: string;
  category: FireCategory;
  x: number;
  y: number;
  z: number;
  radius: number;
  reward: number;
  xpReward: number;
}

export interface ActiveFireState {
  id: string;
  title: string;
  locationLabel: string;
  category: FireCategory;
  x: number;
  y: number;
  z: number;
  intensityPercent: number; // 100 -> 0
  extinguishedPercent: number; // 0 -> 100
  distanceMeters: number;
  reward: number;
  xpReward: number;
}

export interface ActivePolicePursuitState {
  id: string;
  title: string;
  districtLabel: string;
  x: number;
  y: number;
  z: number;
  trackingPercent: number; // 0 -> 100
  inSpotlight: boolean;
  intercepted: boolean;
  distanceMeters: number;
  reward: number;
  xpReward: number;
}

export interface ActiveWinchRescueState {
  id: string;
  kind: WinchRescueKind;
  title: string;
  locationLabel: string;
  x: number;
  y: number;
  z: number;
  hoistPercent: number; // 0 -> 100
  winchStatus: WinchStatus;
  inHoverZone: boolean;
  hoverHint: string;
  distanceMeters: number;
  reward: number;
  xpReward: number;
  patientOnboard: boolean;
  deliveryPadName: string;
}

export interface HudNotification {
  id: number;
  title: string;
  detail: string;
  tone: 'info' | 'success' | 'warning';
}

export interface TelemetryState {
  // Flight instruments
  speedKnots: number;
  altitudeFeet: number;
  aglFeet: number;
  verticalSpeedFpm: number;
  headingDeg: number;
  fuelPercent: number;
  hullPercent: number;
  rotorRpmPercent: number;
  isLanded: boolean;
  landedPadId: string | null;
  landedPadName: string | null;
  padAlignmentError: number;

  // Bambi Bucket firefighting gear
  bucketDeployed: boolean;
  bucketWaterPercent: number;
  isScoopingWater: boolean;
  isDumpingWater: boolean;

  // Phase 3: Atmosphere, Night Ops & Audio/FM Radio
  timeOfDay: TimeOfDayPeriod;
  weather: WeatherMode;
  searchlightOn: boolean;
  searchlightMode: SearchlightMode;
  radioStation: RadioStation;

  // Position & attitude for minimap & cockpit artificial horizon
  x: number;
  y: number;
  z: number;
  yawRad: number;
  pitchRad: number;
  rollRad: number;

  // Company, fleet & career progression
  companyName: string;
  activeHelicopterId: HelicopterId;
  activeHelicopterName: string;
  hasIntegratedTank: boolean;
  unlockedHelicopters: HelicopterId[];
  upgrades: FleetUpgrades;
  liveryId: LiveryId;
  money: number;
  xp: number;
  xpToNextLevel: number;
  level: number;
  rankTitle: string;
  gameTimeFormatted: string;
  dutyStatus: DutyStatus;
  cameraMode: CameraMode;
  muted: boolean;

  // Active ON DUTY mission
  activeDispatch: DispatchAssignment | null;
  activeFire: ActiveFireState | null;
  activePursuit: ActivePolicePursuitState | null;
  activeWinchRescue: ActiveWinchRescueState | null;
  activeSlingCargo: ActiveSlingCargoState | null;
  winchStatus: WinchStatus;

  // Phase 8: Autonomous AI air traffic telemetry for radar & tactical map
  aiHelicopters: AIHelicopterTelemetry[];

  // Phase 8: Career logbook, achievements, save state & volume settings
  careerStats: CareerStats;
  unlockedAchievements: AchievementId[];
  hasSavedCareer: boolean;
  masterVolume: number;
  radioVolume: number;
  graphicsQuality: GraphicsQuality;
  fps: number;
  drawCalls: number;
}

export interface MinimapStaticData {
  worldRadius: number;
  coastPolygon: Array<{ x: number; z: number; biome: 'port' | 'snow' | 'forest' | 'beach' | 'desert' }>;
  lakeCenter: { x: number; z: number; rx: number; rz: number };
  rivers: Array<{ id: string; width: number; points: Array<{ x: number; z: number }> }>;
  farmRegion: { x: number; z: number; rx: number; rz: number };
  snowRegion: { x: number; z: number; rx: number; rz: number };
  snowPeaks: Array<{ x: number; z: number; r: number }>;
  radarPeakPos: { x: number; z: number };
  forestRegion: { x: number; z: number; rx: number; rz: number };
  desertRegion: { x: number; z: number; rx: number; rz: number };
  desertMesas: Array<{ x: number; z: number; rx: number; rz: number }>;
  windTurbines: Array<{ x: number; z: number }>;
  solarStationPos: { x: number; z: number };
  beachRegion: { x: number; z: number; rx: number; rz: number; angleStart: number; angleEnd: number };
  beachPier: { x1: number; z1: number; x2: number; z2: number };
  beachPiers: Array<{ x1: number; z1: number; x2: number; z2: number }>;
  lighthousePos: { x: number; z: number };
  resortPos: { x: number; z: number };
  resortPositions: Array<{ x: number; z: number }>;
  portPos: { x: number; z: number };
  urbanBounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  roadSegments: Array<{ x1: number; z1: number; x2: number; z2: number }>;
  oilRigPos: { x: number; z: number };
  oilRigs: Array<{ id: string; name: string; shortCode: string; x: number; z: number }>;
  parkRect: { minX: number; maxX: number; minZ: number; maxZ: number };
  stadiumRect: { x: number; z: number; rx: number; rz: number };
  cityBlocks: Array<{ x: number; z: number; w: number; d: number }>;
  helipads: HelipadData[];
}
