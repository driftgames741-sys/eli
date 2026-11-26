import type { AchievementId, CareerStats, SavedProgress } from './types';

export type AchievementIconKey =
  | 'award'
  | 'flame'
  | 'flashlight'
  | 'anchor'
  | 'moon'
  | 'feather'
  | 'layers'
  | 'compass';

export interface AchievementDefinition {
  id: AchievementId;
  title: string;
  description: string;
  icon: AchievementIconKey;
  target: number;
  unitLabel: string;
  getCurrent: (stats: CareerStats, unlockedHelicopterCount: number) => number;
}

export const ACHIEVEMENT_CATALOG: AchievementDefinition[] = [
  {
    id: 'first_flight',
    title: 'Primeiro Voo',
    description: 'Conclua sua primeira missão de serviço (ON DUTY).',
    icon: 'award',
    target: 1,
    unitLabel: 'missão',
    getCurrent: (s) =>
      s.transportMissions +
      s.firesExtinguished +
      s.policePursuits +
      s.winchRescues +
      s.heavyCargosDelivered,
  },
  {
    id: 'air_firefighter',
    title: 'Bombeiro Aéreo',
    description: 'Apague 5 incêndios usando o Bambi Bucket ou Fire Bomber.',
    icon: 'flame',
    target: 5,
    unitLabel: 'incêndios',
    getCurrent: (s) => s.firesExtinguished,
  },
  {
    id: 'night_eyes',
    title: 'Olhos na Noite',
    description: 'Intercepte 3 veículos suspeitos usando o Holofote à noite.',
    icon: 'flashlight',
    target: 3,
    unitLabel: 'interceptações',
    getCurrent: (s) => s.nightPolicePursuits,
  },
  {
    id: 'guardian_angel',
    title: 'Anjo da Guarda',
    description: 'Realize 3 resgates completos com o Guincho (mar ou montanha).',
    icon: 'anchor',
    target: 3,
    unitLabel: 'resgates',
    getCurrent: (s) => s.winchRescues,
  },
  {
    id: 'offshore_pilot',
    title: 'Piloto Offshore',
    description: 'Conclua um pouso noturno na Plataforma de Petróleo (Oil Rig).',
    icon: 'moon',
    target: 1,
    unitLabel: 'pouso noturno',
    getCurrent: (s) => s.nightOilRigLandings,
  },
  {
    id: 'silk_hands',
    title: 'Mão de Seda',
    description: 'Faça 5 pousos perfeitos seguidos sem sofrer dano no casco.',
    icon: 'feather',
    target: 5,
    unitLabel: 'seguidos',
    getCurrent: (s) => s.bestPerfectStreak,
  },
  {
    id: 'fleet_commander',
    title: 'Frota de Elite',
    description: 'Desbloqueie 3 aeronaves diferentes no Hangar da empresa.',
    icon: 'layers',
    target: 3,
    unitLabel: 'aeronaves',
    getCurrent: (_s, unlockedCount) => unlockedCount,
  },
  {
    id: 'coastal_ace',
    title: 'Ás da Costa',
    description: 'Percorra 25 km em voo ao longo da sua carreira.',
    icon: 'compass',
    target: 25,
    unitLabel: 'km',
    getCurrent: (s) => Math.floor(s.distanceMeters / 1000),
  },
];

const VALID_ACHIEVEMENT_IDS = new Set<string>(ACHIEVEMENT_CATALOG.map((a) => a.id));

export function createEmptyCareerStats(): CareerStats {
  return {
    flightSeconds: 0,
    distanceMeters: 0,
    transportMissions: 0,
    firesExtinguished: 0,
    policePursuits: 0,
    nightPolicePursuits: 0,
    winchRescues: 0,
    heavyCargosDelivered: 0,
    totalMoneyEarned: 0,
    perfectLandings: 0,
    currentPerfectStreak: 0,
    bestPerfectStreak: 0,
    nightOilRigLandings: 0,
  };
}

function safeNonNeg(val: unknown): number {
  return typeof val === 'number' && Number.isFinite(val) && val >= 0 ? val : 0;
}

export function sanitizeCareerStats(raw: unknown): CareerStats {
  if (!raw || typeof raw !== 'object') {
    return createEmptyCareerStats();
  }
  const obj = raw as Partial<CareerStats>;
  return {
    flightSeconds: safeNonNeg(obj.flightSeconds),
    distanceMeters: safeNonNeg(obj.distanceMeters),
    transportMissions: Math.floor(safeNonNeg(obj.transportMissions)),
    firesExtinguished: Math.floor(safeNonNeg(obj.firesExtinguished)),
    policePursuits: Math.floor(safeNonNeg(obj.policePursuits)),
    nightPolicePursuits: Math.floor(safeNonNeg(obj.nightPolicePursuits)),
    winchRescues: Math.floor(safeNonNeg(obj.winchRescues)),
    heavyCargosDelivered: Math.floor(safeNonNeg(obj.heavyCargosDelivered)),
    totalMoneyEarned: Math.floor(safeNonNeg(obj.totalMoneyEarned)),
    perfectLandings: Math.floor(safeNonNeg(obj.perfectLandings)),
    currentPerfectStreak: Math.floor(safeNonNeg(obj.currentPerfectStreak)),
    bestPerfectStreak: Math.floor(safeNonNeg(obj.bestPerfectStreak)),
    nightOilRigLandings: Math.floor(safeNonNeg(obj.nightOilRigLandings)),
  };
}

export function sanitizeUnlockedAchievements(raw: unknown): AchievementId[] {
  if (!Array.isArray(raw)) return [];
  const dedup = new Set<AchievementId>();
  for (const item of raw) {
    if (typeof item === 'string' && VALID_ACHIEVEMENT_IDS.has(item)) {
      dedup.add(item as AchievementId);
    }
  }
  return Array.from(dedup);
}

export function getTotalMissionsCompleted(stats: CareerStats): number {
  return (
    stats.transportMissions +
    stats.firesExtinguished +
    stats.policePursuits +
    stats.winchRescues +
    stats.heavyCargosDelivered
  );
}

export function evaluateNewAchievements(
  stats: CareerStats,
  unlockedHelicopterCount: number,
  alreadyUnlocked: AchievementId[]
): AchievementDefinition[] {
  const unlockedSet = new Set<AchievementId>(alreadyUnlocked);
  const newlyUnlocked: AchievementDefinition[] = [];

  for (const def of ACHIEVEMENT_CATALOG) {
    if (unlockedSet.has(def.id)) continue;
    if (def.getCurrent(stats, unlockedHelicopterCount) >= def.target) {
      newlyUnlocked.push(def);
    }
  }
  return newlyUnlocked;
}

export function computeHasSavedCareer(saved: SavedProgress): boolean {
  return (
    saved.money > 0 ||
    saved.xp > 0 ||
    saved.level > 1 ||
    saved.unlockedHelicopters.length > 2 ||
    saved.unlockedAchievements.length > 0 ||
    saved.stats.flightSeconds >= 5 ||
    saved.stats.distanceMeters >= 50 ||
    getTotalMissionsCompleted(saved.stats) > 0 ||
    saved.stats.perfectLandings > 0
  );
}

export function formatFlightDuration(totalSeconds: number): string {
  const sec = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(sec / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  const remSec = sec % 60;
  if (hours > 0) {
    return `${hours}h ${String(mins).padStart(2, '0')}m`;
  }
  if (mins > 0) {
    return `${mins}m ${String(remSec).padStart(2, '0')}s`;
  }
  return `${remSec}s`;
}
