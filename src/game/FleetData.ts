import {
  createEmptyCareerStats,
  sanitizeCareerStats,
  sanitizeUnlockedAchievements,
} from './CareerStats';
import type {
  FleetUpgrades,
  HelicopterId,
  HelicopterSpec,
  LiveryId,
  SavedProgress,
  UpgradeId,
} from './types';

export const SAVE_STORAGE_KEY = 'rotor_ops_career_save_v1';
export const DEFAULT_COMPANY_NAME = 'ROTOR OPS';

export interface UpgradeDefinition {
  id: UpgradeId;
  name: string;
  subtitle: string;
  description: string;
  costs: [number, number, number]; // Nv.1, Nv.2, Nv.3
  levelSummaries: [string, string, string];
}

export const UPGRADE_CATALOG: UpgradeDefinition[] = [
  {
    id: 'turbine',
    name: 'Turbina (Potência)',
    subtitle: 'Velocidade & Tração de Carga',
    description:
      'Aumenta a velocidade máxima, aceleração e força de subida — essencial para transportar cargas pesadas.',
    costs: [750, 1650, 3000],
    levelSummaries: ['+9% Velocidade e Subida', '+18% Velocidade e Subida', '+28% Potência Máxima'],
  },
  {
    id: 'aux_tank',
    name: 'Tanque Auxiliar',
    subtitle: 'Combustível & Capacidade de Água',
    description:
      'Reduz o consumo de combustível e amplia a reserva de água do Bambi Bucket / Fire Bomber.',
    costs: [650, 1450, 2700],
    levelSummaries: ['+18% Autonomia e Água', '+36% Autonomia e Água', '+55% Autonomia e Água'],
  },
  {
    id: 'reinforced_hull',
    name: 'Estrutura Reforçada',
    subtitle: 'Casco & Estabilidade em Tempestade',
    description:
      'Aumenta a resistência a pousos bruscos e reduz drasticamente a turbulência em tempestades.',
    costs: [700, 1550, 2850],
    levelSummaries: ['-18% Dano · -25% Vento', '-34% Dano · -50% Vento', '-48% Dano · -75% Vento'],
  },
];

export interface LiveryScheme {
  id: LiveryId;
  name: string;
  description: string;
  primaryHex: number | null;
  secondaryHex: number | null;
  accentHex: number | null;
  swatch: [string, string, string];
}

export const LIVERY_CATALOG: LiveryScheme[] = [
  {
    id: 'default',
    name: 'Padrão da Aeronave',
    description: 'Esquema original de fábrica exclusivo de cada modelo da frota.',
    primaryHex: null,
    secondaryHex: null,
    accentHex: null,
    swatch: ['#e63946', '#f8fafc', '#facc15'],
  },
  {
    id: 'tactical_black_orange',
    name: 'Tático Preto/Laranja',
    description: 'Fuselagem grafite fosca com faixas de alta visibilidade laranja industrial.',
    primaryHex: 0x18212f,
    secondaryHex: 0xf97316,
    accentHex: 0xfacc15,
    swatch: ['#18212f', '#f97316', '#facc15'],
  },
  {
    id: 'rescue_red_white',
    name: 'Resgate Vermelho/Branco',
    description: 'Pintura clássica de resgate aéreo e combate a emergências.',
    primaryHex: 0xdc2626,
    secondaryHex: 0xf8fafc,
    accentHex: 0xfde047,
    swatch: ['#dc2626', '#f8fafc', '#fde047'],
  },
  {
    id: 'coast_guard',
    name: 'Guarda Costeira',
    description: 'Laranja internacional marítimo com branco polar e faixas azuis.',
    primaryHex: 0xf97316,
    secondaryHex: 0xf8fafc,
    accentHex: 0x0284c7,
    swatch: ['#f97316', '#f8fafc', '#0284c7'],
  },
  {
    id: 'executive_blue_silver',
    name: 'Executivo Azul/Prata',
    description: 'Azul cobalto metálico com cabine prata escovada e friso ciano.',
    primaryHex: 0x1d4ed8,
    secondaryHex: 0xe2e8f0,
    accentHex: 0x38bdf8,
    swatch: ['#1d4ed8', '#e2e8f0', '#38bdf8'],
  },
];

const VALID_LIVERY_IDS = new Set<string>(LIVERY_CATALOG.map((l) => l.id));

export function createDefaultUpgrades(): FleetUpgrades {
  return {
    turbine: 0,
    aux_tank: 0,
    reinforced_hull: 0,
  };
}

export function getLiveryScheme(id: LiveryId): LiveryScheme {
  return LIVERY_CATALOG.find((l) => l.id === id) ?? LIVERY_CATALOG[0];
}

function clampUpgradeLevel(val: unknown): number {
  if (typeof val !== 'number' || !Number.isFinite(val)) return 0;
  return Math.max(0, Math.min(3, Math.floor(val)));
}

export const FLEET_CATALOG: HelicopterSpec[] = [
  {
    id: 'mayfly',
    name: 'Mayfly',
    category: 'Treinamento Leve',
    branch: 'starter',
    price: 0,
    tagline: 'Ágil e equilibrado. Ideal para aprender pousos de precisão e primeiros resgates.',
    perkSummary: 'Bambi Bucket padrão · Manobrabilidade ágil',
    liveryPrimary: '#e63946',
    liverySecondary: '#f8fafc',
    liveryAccent: '#facc15',
    stats: {
      speed: 52,
      fuel: 50,
      water: 42,
      durability: 50,
    },
    physics: {
      maxSpeed: 44,
      forwardAccel: 98,
      strafeAccel: 28,
      climbSpeed: 14.8,
      yawRate: 1.65,
      fuelBurnMult: 1.0,
      hardLandingThreshold: 11.2,
      damageTakenMult: 1.0,
      waterCapacityMult: 1.0,
      waterExtinguishMult: 1.0,
      hasIntegratedTank: false,
      transportRewardMult: 1.0,
      rescueRewardMult: 1.0,
      fireRewardMult: 1.0,
    },
  },
  {
    id: 'wren',
    name: 'AS365 N3 Dauphin',
    category: 'Resgate Bimotor · FDMA',
    branch: 'emergency',
    price: 0,
    tagline:
      'Helicóptero aerodinâmico de resgate com rotor Fenestron embutido, guincho lateral e trem retrátil.',
    perkSummary: 'Desbloqueado · +20% Resgate · Fenestron & Trem Retrátil',
    liveryPrimary: '#c81018',
    liverySecondary: '#f8fafc',
    liveryAccent: '#facc15',
    stats: {
      speed: 74,
      fuel: 66,
      water: 52,
      durability: 80,
    },
    physics: {
      maxSpeed: 54,
      forwardAccel: 116,
      strafeAccel: 34,
      climbSpeed: 16.8,
      yawRate: 1.84,
      fuelBurnMult: 0.88,
      hardLandingThreshold: 15.4,
      damageTakenMult: 0.65,
      waterCapacityMult: 1.15,
      waterExtinguishMult: 1.15,
      hasIntegratedTank: false,
      transportRewardMult: 1.05,
      rescueRewardMult: 1.2,
      fireRewardMult: 1.1,
    },
  },
  {
    id: 'mako',
    name: 'Mako',
    category: 'Transporte Executivo',
    branch: 'transport',
    price: 2500,
    tagline: 'Bimotora executiva de alta velocidade projetada para rotas longas até a Oil Rig.',
    perkSummary: '+35% em Transporte & Oil Rig · Autonomia estendida',
    liveryPrimary: '#1d4ed8',
    liverySecondary: '#f8fafc',
    liveryAccent: '#38bdf8',
    stats: {
      speed: 84,
      fuel: 86,
      water: 44,
      durability: 64,
    },
    physics: {
      maxSpeed: 58,
      forwardAccel: 124,
      strafeAccel: 32,
      climbSpeed: 16.2,
      yawRate: 1.72,
      fuelBurnMult: 0.68,
      hardLandingThreshold: 12.6,
      damageTakenMult: 0.85,
      waterCapacityMult: 1.0,
      waterExtinguishMult: 1.0,
      hasIntegratedTank: false,
      transportRewardMult: 1.35,
      rescueRewardMult: 1.1,
      fireRewardMult: 1.0,
    },
  },
  {
    id: 'chipmunk',
    name: 'Chipmunk',
    category: 'Utilitário de Carga',
    branch: 'utility',
    price: 3500,
    tagline: 'Helicóptero de carga robusto equipado com Bambi Bucket de capacidade dobrada.',
    perkSummary: 'Tanque de água 2x maior · Apaga incêndios muito mais rápido',
    liveryPrimary: '#4d7c0f',
    liverySecondary: '#334155',
    liveryAccent: '#f59e0b',
    stats: {
      speed: 60,
      fuel: 74,
      water: 82,
      durability: 80,
    },
    physics: {
      maxSpeed: 48,
      forwardAccel: 104,
      strafeAccel: 28,
      climbSpeed: 15.8,
      yawRate: 1.56,
      fuelBurnMult: 0.82,
      hardLandingThreshold: 14.2,
      damageTakenMult: 0.72,
      waterCapacityMult: 2.0,
      waterExtinguishMult: 1.7,
      hasIntegratedTank: false,
      transportRewardMult: 1.1,
      rescueRewardMult: 1.05,
      fireRewardMult: 1.25,
    },
  },
  {
    id: 'firekite',
    name: 'Firekite',
    category: 'Bombeiro Pesado',
    branch: 'utility',
    price: 6000,
    tagline: 'Fire Bomber com tanque ventral integrado: jato largo e intenso sem cabo longo.',
    perkSummary: 'Tanque ventral integrado (sem cabo) · Jato largo 2.4x',
    liveryPrimary: '#ea580c',
    liverySecondary: '#f8fafc',
    liveryAccent: '#1e293b',
    stats: {
      speed: 74,
      fuel: 80,
      water: 96,
      durability: 86,
    },
    physics: {
      maxSpeed: 54,
      forwardAccel: 116,
      strafeAccel: 31,
      climbSpeed: 17.2,
      yawRate: 1.62,
      fuelBurnMult: 0.76,
      hardLandingThreshold: 14.8,
      damageTakenMult: 0.65,
      waterCapacityMult: 2.6,
      waterExtinguishMult: 2.4,
      hasIntegratedTank: true,
      transportRewardMult: 1.1,
      rescueRewardMult: 1.15,
      fireRewardMult: 1.4,
    },
  },
  {
    id: 'resolute',
    name: 'Resolute',
    category: 'Flagship Bimotor',
    branch: 'flagship',
    price: 10000,
    tagline: 'Aeronave bimotor pesada de última geração com casco blindado e rotor Fenestron.',
    perkSummary: '+45% em TODAS as missões · Máxima velocidade, casco e tanque',
    liveryPrimary: '#1e293b',
    liverySecondary: '#ef4444',
    liveryAccent: '#fbbf24',
    stats: {
      speed: 100,
      fuel: 100,
      water: 100,
      durability: 100,
    },
    physics: {
      maxSpeed: 66,
      forwardAccel: 140,
      strafeAccel: 38,
      climbSpeed: 19.2,
      yawRate: 1.85,
      fuelBurnMult: 0.56,
      hardLandingThreshold: 16.8,
      damageTakenMult: 0.55,
      waterCapacityMult: 2.8,
      waterExtinguishMult: 2.35,
      hasIntegratedTank: false,
      transportRewardMult: 1.45,
      rescueRewardMult: 1.45,
      fireRewardMult: 1.45,
    },
  },
];

const VALID_HELI_IDS = new Set<string>(FLEET_CATALOG.map((h) => h.id));

export function getHelicopterSpec(id: HelicopterId): HelicopterSpec {
  return FLEET_CATALOG.find((h) => h.id === id) ?? FLEET_CATALOG[0];
}

export function sanitizeCompanyName(raw: string): string {
  const cleaned = raw.replace(/\s+/g, ' ').trim().slice(0, 22);
  return cleaned.length > 0 ? cleaned.toUpperCase() : DEFAULT_COMPANY_NAME;
}

export function loadSavedProgress(): SavedProgress {
  const fallback: SavedProgress = {
    companyName: DEFAULT_COMPANY_NAME,
    money: 0,
    xp: 0,
    level: 1,
    unlockedHelicopters: ['mayfly', 'wren'],
    activeHelicopterId: 'wren',
    stats: createEmptyCareerStats(),
    unlockedAchievements: [],
    upgrades: createDefaultUpgrades(),
    liveryId: 'default',
  };

  try {
    const raw = window.localStorage.getItem(SAVE_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<SavedProgress>;

    const unlocked = Array.isArray(parsed.unlockedHelicopters)
      ? parsed.unlockedHelicopters.filter(
          (id): id is HelicopterId => typeof id === 'string' && VALID_HELI_IDS.has(id)
        )
      : [];
    if (!unlocked.includes('mayfly')) {
      unlocked.unshift('mayfly');
    }
    if (!unlocked.includes('wren')) {
      unlocked.push('wren');
    }

    let activeId: HelicopterId =
      typeof parsed.activeHelicopterId === 'string' &&
      unlocked.includes(parsed.activeHelicopterId as HelicopterId)
        ? (parsed.activeHelicopterId as HelicopterId)
        : 'wren';

    // One-time auto-equip of the new AS365 N3 Dauphin so returning players can fly it immediately
    const dauphinIntroKey = 'rotor_ops_dauphin_intro_v1';
    if (!window.localStorage.getItem(dauphinIntroKey)) {
      window.localStorage.setItem(dauphinIntroKey, '1');
      activeId = 'wren';
    }

    const money =
      typeof parsed.money === 'number' && Number.isFinite(parsed.money) && parsed.money >= 0
        ? Math.floor(parsed.money)
        : 0;
    const stats = sanitizeCareerStats(parsed.stats);
    // Backfill totalMoneyEarned cleanly for saves migrated from earlier phases
    if (stats.totalMoneyEarned < money) {
      stats.totalMoneyEarned = money;
    }

    const rawUpgrades = parsed.upgrades as Partial<FleetUpgrades> | undefined;
    const upgrades: FleetUpgrades = {
      turbine: clampUpgradeLevel(rawUpgrades?.turbine),
      aux_tank: clampUpgradeLevel(rawUpgrades?.aux_tank),
      reinforced_hull: clampUpgradeLevel(rawUpgrades?.reinforced_hull),
    };

    const liveryId: LiveryId =
      typeof parsed.liveryId === 'string' && VALID_LIVERY_IDS.has(parsed.liveryId)
        ? (parsed.liveryId as LiveryId)
        : 'default';

    return {
      companyName:
        typeof parsed.companyName === 'string'
          ? sanitizeCompanyName(parsed.companyName)
          : DEFAULT_COMPANY_NAME,
      money,
      xp:
        typeof parsed.xp === 'number' && Number.isFinite(parsed.xp) && parsed.xp >= 0
          ? Math.floor(parsed.xp)
          : 0,
      level:
        typeof parsed.level === 'number' && Number.isFinite(parsed.level) && parsed.level >= 1
          ? Math.floor(parsed.level)
          : 1,
      unlockedHelicopters: unlocked,
      activeHelicopterId: activeId,
      stats,
      unlockedAchievements: sanitizeUnlockedAchievements(parsed.unlockedAchievements),
      upgrades,
      liveryId,
    };
  } catch {
    return fallback;
  }
}

export function saveProgress(progress: SavedProgress): void {
  try {
    window.localStorage.setItem(SAVE_STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Ignore storage quota / privacy mode failures gracefully
  }
}

export function clearSavedProgress(): void {
  try {
    window.localStorage.removeItem(SAVE_STORAGE_KEY);
  } catch {
    // Ignore storage errors gracefully
  }
}
