import { useEffect } from 'react';
import {
  Anchor,
  Award,
  CheckCircle2,
  Clock,
  Compass,
  DollarSign,
  Feather,
  Flame,
  Flashlight,
  Layers,
  Lock,
  MapPin,
  Moon,
  Package,
  Shield,
  Siren,
  Trophy,
  X,
} from 'lucide-react';
import {
  ACHIEVEMENT_CATALOG,
  formatFlightDuration,
  getTotalMissionsCompleted,
  type AchievementIconKey,
} from '../game/CareerStats';
import type { TelemetryState } from '../game/types';

interface StatsAchievementsModalProps {
  telemetry: TelemetryState;
  onClose: () => void;
}

function renderAchievementIcon(icon: AchievementIconKey, unlocked: boolean) {
  const cls = `w-4 h-4 ${unlocked ? 'text-amber-300' : 'text-slate-500'}`;
  switch (icon) {
    case 'award':
      return <Award className={cls} />;
    case 'flame':
      return <Flame className={cls} />;
    case 'flashlight':
      return <Flashlight className={cls} />;
    case 'anchor':
      return <Anchor className={cls} />;
    case 'moon':
      return <Moon className={cls} />;
    case 'feather':
      return <Feather className={cls} />;
    case 'layers':
      return <Layers className={cls} />;
    case 'compass':
      return <Compass className={cls} />;
  }
}

export function StatsAchievementsModal({ telemetry, onClose }: StatsAchievementsModalProps) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onClose]);

  const { careerStats, unlockedAchievements, unlockedHelicopters } = telemetry;
  const unlockedSet = new Set(unlockedAchievements);
  const totalMissions = getTotalMissionsCompleted(careerStats);
  const distanceKm = (careerStats.distanceMeters / 1000).toFixed(2);
  const unlockedCount = unlockedAchievements.length;
  const totalAchievements = ACHIEVEMENT_CATALOG.length;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-3 sm:p-5 select-none"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Diário de Estatísticas e Conquistas da Empresa"
    >
      <div
        className="bg-[#091220]/95 backdrop-blur-md border border-slate-700/80 rounded-xl shadow-2xl w-full max-w-[820px] max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-800/90 bg-slate-950/75 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-400/40 flex items-center justify-center shrink-0">
              <Trophy className="w-4 h-4 text-amber-300" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display font-bold text-base sm:text-lg tracking-wide text-slate-50 truncate">
                DIÁRIO DA EMPRESA &amp; CONQUISTAS
              </h2>
              <p className="text-[11px] font-mono-tech text-slate-400 truncate">
                {telemetry.companyName} · Nv.{telemetry.level} ({telemetry.rankTitle}) ·{' '}
                {unlockedCount}/{totalAchievements} Medalhas
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800/90 hover:bg-slate-700 border border-slate-700 text-xs font-mono-tech text-slate-200 hover:text-white transition-colors cursor-pointer shrink-0"
          >
            <span>[I] Fechar</span>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-4 overflow-y-auto space-y-5">
          {/* SECTION 1: COMPANY LOGBOOK STATISTICS */}
          <section>
            <div className="flex items-center justify-between mb-2.5">
              <h3 className="font-display font-bold text-xs tracking-wider text-slate-300 uppercase">
                Diário de Operações
              </h3>
              <span className="text-[11px] font-mono-tech text-slate-400">
                Salvo automaticamente
              </span>
            </div>

            {/* Primary 4 KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3">
                <div className="flex items-center gap-1.5 text-[10px] font-mono-tech text-slate-400 uppercase">
                  <Clock className="w-3.5 h-3.5 text-sky-400" />
                  Tempo de Voo
                </div>
                <div className="mt-1 font-mono-tech text-lg font-bold text-slate-50">
                  {formatFlightDuration(careerStats.flightSeconds)}
                </div>
              </div>

              <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3">
                <div className="flex items-center gap-1.5 text-[10px] font-mono-tech text-slate-400 uppercase">
                  <MapPin className="w-3.5 h-3.5 text-cyan-400" />
                  Distância Voada
                </div>
                <div className="mt-1 font-mono-tech text-lg font-bold text-slate-50">
                  {distanceKm} <span className="text-xs font-normal text-slate-400">km</span>
                </div>
              </div>

              <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3">
                <div className="flex items-center gap-1.5 text-[10px] font-mono-tech text-slate-400 uppercase">
                  <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                  Ganhos Totais
                </div>
                <div className="mt-1 font-mono-tech text-lg font-bold text-emerald-400">
                  ${careerStats.totalMoneyEarned.toLocaleString('pt-BR')}
                </div>
              </div>

              <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3">
                <div className="flex items-center gap-1.5 text-[10px] font-mono-tech text-slate-400 uppercase">
                  <Shield className="w-3.5 h-3.5 text-amber-300" />
                  Pousos Perfeitos
                </div>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="font-mono-tech text-lg font-bold text-slate-50">
                    {careerStats.perfectLandings}
                  </span>
                  <span className="text-[10px] font-mono-tech text-amber-300/90">
                    (seq. máx {careerStats.bestPerfectStreak})
                  </span>
                </div>
              </div>
            </div>

            {/* Mission Breakdown Strip */}
            <div className="mt-2.5 bg-slate-900/65 border border-slate-800/90 rounded-lg p-3">
              <div className="flex items-center justify-between text-[11px] font-mono-tech text-slate-300 mb-2">
                <span>MISSÕES CONCLUÍDAS NA CARREIRA</span>
                <span className="text-amber-300 font-bold">{totalMissions} TOTAL</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 text-xs">
                <div className="flex items-center justify-between bg-slate-950/60 border border-slate-800/80 rounded px-2.5 py-1.5">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <Compass className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    Transp./Oil Rig
                  </span>
                  <span className="font-mono-tech font-bold text-slate-100">
                    {careerStats.transportMissions}
                  </span>
                </div>
                <div className="flex items-center justify-between bg-slate-950/60 border border-slate-800/80 rounded px-2.5 py-1.5">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <Flame className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                    Incêndios
                  </span>
                  <span className="font-mono-tech font-bold text-slate-100">
                    {careerStats.firesExtinguished}
                  </span>
                </div>
                <div className="flex items-center justify-between bg-slate-950/60 border border-slate-800/80 rounded px-2.5 py-1.5">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <Siren className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    Patrulha
                  </span>
                  <span className="font-mono-tech font-bold text-slate-100">
                    {careerStats.policePursuits}
                  </span>
                </div>
                <div className="flex items-center justify-between bg-slate-950/60 border border-slate-800/80 rounded px-2.5 py-1.5">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <Anchor className="w-3.5 h-3.5 text-red-400 shrink-0" />
                    Guincho
                  </span>
                  <span className="font-mono-tech font-bold text-slate-100">
                    {careerStats.winchRescues}
                  </span>
                </div>
                <div className="flex items-center justify-between bg-slate-950/60 border border-slate-800/80 rounded px-2.5 py-1.5">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <Package className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    Cargas Pesadas
                  </span>
                  <span className="font-mono-tech font-bold text-slate-100">
                    {careerStats.heavyCargosDelivered}
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* SECTION 2: 8 UNLOCKABLE ACHIEVEMENTS */}
          <section>
            <div className="flex items-center justify-between mb-2.5">
              <h3 className="font-display font-bold text-xs tracking-wider text-slate-300 uppercase">
                Conquistas &amp; Medalhas
              </h3>
              <span className="text-[11px] font-mono-tech text-amber-300 font-bold">
                {unlockedCount} / {totalAchievements} DESBLOQUEADAS
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {ACHIEVEMENT_CATALOG.map((ach) => {
                const rawCurrent = ach.getCurrent(careerStats, unlockedHelicopters.length);
                const unlocked = unlockedSet.has(ach.id) || rawCurrent >= ach.target;
                const clampedCurrent = Math.min(ach.target, rawCurrent);
                const pct = Math.min(100, Math.round((clampedCurrent / ach.target) * 100));

                return (
                  <div
                    key={ach.id}
                    className={`rounded-lg border p-3 transition-colors ${
                      unlocked
                        ? 'bg-amber-500/10 border-amber-400/45'
                        : 'bg-slate-900/75 border-slate-800/90'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${
                            unlocked
                              ? 'bg-amber-500/20 border-amber-400/50'
                              : 'bg-slate-800/80 border-slate-700/70'
                          }`}
                        >
                          {renderAchievementIcon(ach.icon, unlocked)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <h4
                              className={`font-display font-bold text-sm tracking-wide truncate ${
                                unlocked ? 'text-amber-200' : 'text-slate-200'
                              }`}
                            >
                              {ach.title}
                            </h4>
                          </div>
                          <p className="text-[11px] text-slate-400 leading-snug mt-0.5">
                            {ach.description}
                          </p>
                        </div>
                      </div>

                      {unlocked ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      ) : (
                        <Lock className="w-3.5 h-3.5 text-slate-600 shrink-0 mt-1" />
                      )}
                    </div>

                    {/* Progress bar */}
                    <div className="mt-2.5">
                      <div className="flex items-center justify-between text-[10px] font-mono-tech mb-1">
                        <span className={unlocked ? 'text-emerald-300 font-bold' : 'text-slate-400'}>
                          {unlocked ? 'CONCLUÍDA' : 'EM PROGRESSO'}
                        </span>
                        <span className={unlocked ? 'text-amber-200 font-bold' : 'text-slate-300'}>
                          {clampedCurrent} / {ach.target} {ach.unitLabel}
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-800 rounded-sm overflow-hidden">
                        <div
                          className={`h-full transition-transform duration-300 origin-left ${
                            unlocked ? 'bg-amber-400' : 'bg-sky-400/80'
                          }`}
                          style={{ transform: `scaleX(${Math.max(unlocked ? 1 : 0.02, pct / 100)})` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
