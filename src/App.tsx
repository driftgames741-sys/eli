/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Home, Radio, RotateCcw, Trophy, Volume2, VolumeX, Wrench } from 'lucide-react';
import { HangarModal } from './components/HangarModal';
import { HUD } from './components/HUD';
import { StatsAchievementsModal } from './components/StatsAchievementsModal';
import { TacticalMapModal } from './components/TacticalMapModal';
import { TitleScreen } from './components/TitleScreen';
import { createEmptyCareerStats } from './game/CareerStats';
import { createDefaultUpgrades, DEFAULT_COMPANY_NAME } from './game/FleetData';
import { HelicopterEngine } from './game/HelicopterEngine';
import type {
  GamePhase,
  GraphicsQuality,
  HelicopterId,
  HudNotification,
  LiveryId,
  MinimapStaticData,
  TelemetryState,
  UpgradeId,
} from './game/types';

const INITIAL_TELEMETRY: TelemetryState = {
  speedKnots: 0,
  altitudeFeet: 10,
  aglFeet: 0,
  verticalSpeedFpm: 0,
  headingDeg: 50,
  fuelPercent: 100,
  hullPercent: 100,
  rotorRpmPercent: 42,
  isLanded: true,
  landedPadId: 'pad_airbase',
  landedPadName: 'Base Aérea Rotor Ops',
  padAlignmentError: 0,
  bucketDeployed: false,
  bucketWaterPercent: 0,
  isScoopingWater: false,
  isDumpingWater: false,
  timeOfDay: 'DAY',
  weather: 'CLEAR',
  searchlightOn: false,
  searchlightMode: 'FRONTAL',
  radioStation: 'OFF',
  x: -165,
  y: 3,
  z: 145,
  yawRad: -0.88,
  pitchRad: 0,
  rollRad: 0,
  companyName: DEFAULT_COMPANY_NAME,
  activeHelicopterId: 'wren',
  activeHelicopterName: 'AS365 N3 Dauphin',
  hasIntegratedTank: false,
  unlockedHelicopters: ['mayfly', 'wren'],
  upgrades: createDefaultUpgrades(),
  liveryId: 'default',
  money: 0,
  xp: 0,
  xpToNextLevel: 120,
  level: 1,
  rankTitle: 'Cadete',
  gameTimeFormatted: '08:00',
  dutyStatus: 'OFF_DUTY',
  cameraMode: 'chase',
  muted: false,
  activeDispatch: null,
  activeFire: null,
  activePursuit: null,
  activeWinchRescue: null,
  activeSlingCargo: null,
  winchStatus: 'STOWED',
  aiHelicopters: [],
  careerStats: createEmptyCareerStats(),
  unlockedAchievements: [],
  hasSavedCareer: false,
  masterVolume: 0.85,
  radioVolume: 0.72,
  graphicsQuality: 'high',
  fps: 60,
  drawCalls: 0,
};

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<HelicopterEngine | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const [phase, setPhase] = useState<GamePhase>('title');
  const [telemetry, setTelemetry] = useState<TelemetryState>(INITIAL_TELEMETRY);
  const [minimapData, setMinimapData] = useState<MinimapStaticData | null>(null);
  const [showControls, setShowControls] = useState<boolean>(false);
  const [showTacticalMap, setShowTacticalMap] = useState<boolean>(false);
  const [showStatsModal, setShowStatsModal] = useState<boolean>(false);
  const [notification, setNotification] = useState<HudNotification | null>(null);

  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    const engine = new HelicopterEngine(mount, {
      onTelemetry: (next) => {
        setTelemetry(next);
      },
      onPhaseChange: (nextPhase) => {
        setPhase(nextPhase);
        if (nextPhase !== 'playing') {
          setShowTacticalMap(false);
        }
        if (nextPhase === 'hangar' || nextPhase === 'damaged') {
          setShowStatsModal(false);
        }
      },
      onNotification: (note) => {
        setNotification(note);
        if (toastTimerRef.current !== null) {
          window.clearTimeout(toastTimerRef.current);
        }
        toastTimerRef.current = window.setTimeout(() => {
          setNotification((curr) => (curr && curr.id === note.id ? null : curr));
        }, 4200);
      },
      onToggleHelp: () => {
        setShowControls((prev) => !prev);
      },
      onToggleMap: () => {
        setShowTacticalMap((prev) => !prev);
      },
      onToggleStats: () => {
        setShowStatsModal((prev) => !prev);
      },
    });

    engineRef.current = engine;
    setMinimapData(engine.minimapData);

    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  const handleStart = useCallback(() => {
    setShowStatsModal(false);
    engineRef.current?.startFlight();
  }, []);

  const handleReturnToTitle = useCallback(() => {
    setShowStatsModal(false);
    setShowTacticalMap(false);
    engineRef.current?.returnToTitleMenu();
  }, []);

  const handleResetCareer = useCallback(() => {
    engineRef.current?.resetCareer();
  }, []);

  const handleOpenHangar = useCallback(() => {
    setShowStatsModal(false);
    engineRef.current?.openHangar();
  }, []);

  const handleCloseHangar = useCallback(() => {
    engineRef.current?.closeHangar();
  }, []);

  const handleUpdateCompanyName = useCallback((name: string) => {
    engineRef.current?.setCompanyName(name);
  }, []);

  const handlePurchaseHelicopter = useCallback((id: HelicopterId) => {
    engineRef.current?.purchaseHelicopter(id);
  }, []);

  const handleEquipHelicopter = useCallback((id: HelicopterId) => {
    engineRef.current?.equipHelicopter(id, true);
  }, []);

  const handlePurchaseUpgrade = useCallback((id: UpgradeId) => {
    engineRef.current?.purchaseUpgrade(id);
  }, []);

  const handleSelectLivery = useCallback((id: LiveryId) => {
    engineRef.current?.setLivery(id);
  }, []);

  const handleToggleDuty = useCallback(() => {
    engineRef.current?.toggleDutyStatus();
  }, []);

  const handleToggleBucket = useCallback(() => {
    engineRef.current?.toggleBucket();
  }, []);

  const handleToggleWinch = useCallback(() => {
    engineRef.current?.toggleWinch();
  }, []);

  const handleToggleCamera = useCallback(() => {
    engineRef.current?.toggleCameraMode();
  }, []);

  const handleToggleSearchlight = useCallback(() => {
    engineRef.current?.toggleSearchlight();
  }, []);

  const handleCycleSearchlightMode = useCallback(() => {
    engineRef.current?.cycleSearchlightMode();
  }, []);

  const handleCycleTimeOfDay = useCallback(() => {
    engineRef.current?.cycleTimeOfDay();
  }, []);

  const handleCycleWeather = useCallback(() => {
    engineRef.current?.cycleWeather();
  }, []);

  const handleCycleRadio = useCallback(() => {
    engineRef.current?.cycleRadioStation();
  }, []);

  const handleToggleMute = useCallback(() => {
    engineRef.current?.toggleMute();
  }, []);

  const handleMasterVolumeChange = useCallback((vol: number) => {
    engineRef.current?.setMasterVolume(vol);
  }, []);

  const handleRadioVolumeChange = useCallback((vol: number) => {
    engineRef.current?.setRadioVolume(vol);
  }, []);

  const handleGraphicsQualityChange = useCallback((quality: GraphicsQuality) => {
    engineRef.current?.setGraphicsQuality(quality);
  }, []);

  const handleToggleControls = useCallback(() => {
    setShowControls((prev) => !prev);
  }, []);

  const handleOpenFullMap = useCallback(() => {
    setShowTacticalMap(true);
  }, []);

  const handleCloseFullMap = useCallback(() => {
    setShowTacticalMap(false);
  }, []);

  const handleOpenStats = useCallback(() => {
    setShowStatsModal(true);
  }, []);

  const handleCloseStats = useCallback(() => {
    setShowStatsModal(false);
  }, []);

  const handleTogglePause = useCallback(() => {
    engineRef.current?.togglePause();
  }, []);

  const handleResume = useCallback(() => {
    setShowStatsModal(false);
    engineRef.current?.resumeFlight();
  }, []);

  const handleResetToBase = useCallback(() => {
    setShowStatsModal(false);
    engineRef.current?.resetToBase(true);
  }, []);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#091428]">
      {/* Isolated WebGL Canvas Container — never re-rendered by HUD state */}
      <div ref={canvasMountRef} className="absolute inset-0 w-full h-full" />

      {/* Cinematic Orbital Title Screen */}
      {phase === 'title' && (
        <TitleScreen
          telemetry={telemetry}
          onStart={handleStart}
          onOpenStats={handleOpenStats}
          onUpdateCompanyName={handleUpdateCompanyName}
          onResetCareer={handleResetCareer}
        />
      )}

      {/* Active Gameplay HUD */}
      {phase !== 'title' && (
        <HUD
          telemetry={telemetry}
          minimapData={minimapData}
          showControls={showControls}
          notification={notification}
          onOpenHangar={handleOpenHangar}
          onUpdateCompanyName={handleUpdateCompanyName}
          onToggleDuty={handleToggleDuty}
          onToggleBucket={handleToggleBucket}
          onToggleWinch={handleToggleWinch}
          onToggleCamera={handleToggleCamera}
          onToggleSearchlight={handleToggleSearchlight}
          onCycleSearchlightMode={handleCycleSearchlightMode}
          onCycleTimeOfDay={handleCycleTimeOfDay}
          onCycleWeather={handleCycleWeather}
          onCycleRadio={handleCycleRadio}
          onToggleMute={handleToggleMute}
          onToggleControls={handleToggleControls}
          onOpenFullMap={handleOpenFullMap}
          onTogglePause={handleTogglePause}
          onResetToBase={handleResetToBase}
        />
      )}

      {/* Full Tactical Island Map Overlay (Key Tab or Minimap Click) */}
      {phase === 'playing' && showTacticalMap && (
        <TacticalMapModal
          staticData={minimapData}
          telemetry={telemetry}
          onClose={handleCloseFullMap}
        />
      )}

      {/* Hangar, Fleet Tree & Workshop/Paint Modal */}
      {phase === 'hangar' && (
        <HangarModal
          telemetry={telemetry}
          onClose={handleCloseHangar}
          onUpdateCompanyName={handleUpdateCompanyName}
          onPurchaseHelicopter={handlePurchaseHelicopter}
          onEquipHelicopter={handleEquipHelicopter}
          onPurchaseUpgrade={handlePurchaseUpgrade}
          onSelectLivery={handleSelectLivery}
        />
      )}

      {/* Pause Modal (Esc) with Audio/Radio Sliders, Stats, Hangar & Return to Menu */}
      {phase === 'paused' && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#070d17]/72 backdrop-blur-[2px] p-4 select-none">
          <div className="bg-[#0B121E]/95 border border-slate-700/80 rounded-xl p-5 sm:p-6 w-full max-w-sm shadow-2xl">
            <h2 className="font-display font-bold text-2xl text-white tracking-wide">
              SIMULAÇÃO PAUSADA
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Operações aéreas de {telemetry.companyName} suspensas temporariamente.
            </p>

            {/* Audio & FM Radio Volume Controls */}
            <div className="mt-4 p-3 rounded-lg bg-slate-900/85 border border-slate-800 space-y-2.5">
              <div>
                <div className="flex items-center justify-between text-[11px] font-mono-tech text-slate-300 mb-1">
                  <span className="flex items-center gap-1.5">
                    {telemetry.muted ? (
                      <VolumeX className="w-3.5 h-3.5 text-red-400" />
                    ) : (
                      <Volume2 className="w-3.5 h-3.5 text-sky-400" />
                    )}
                    Volume Geral
                  </span>
                  <span className="text-slate-200 font-bold">
                    {telemetry.muted ? 'MUDO' : `${Math.round(telemetry.masterVolume * 100)}%`}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={telemetry.muted ? 0 : Math.round(telemetry.masterVolume * 100)}
                  onChange={(e) => handleMasterVolumeChange(Number(e.target.value) / 100)}
                  aria-label="Volume geral do áudio"
                  className="w-full accent-sky-400 cursor-pointer h-1.5"
                />
              </div>

              <div>
                <div className="flex items-center justify-between text-[11px] font-mono-tech text-slate-300 mb-1">
                  <span className="flex items-center gap-1.5">
                    <Radio className="w-3.5 h-3.5 text-emerald-400" />
                    Volume Rádio FM
                  </span>
                  <span className="text-slate-200 font-bold">
                    {Math.round(telemetry.radioVolume * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(telemetry.radioVolume * 100)}
                  onChange={(e) => handleRadioVolumeChange(Number(e.target.value) / 100)}
                  aria-label="Volume da rádio FM"
                  className="w-full accent-emerald-400 cursor-pointer h-1.5"
                />
              </div>

              <div className="pt-2 border-t border-slate-800/90 space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-mono-tech">
                  <span className="text-slate-300">Gráficos / LOD</span>
                  <span className="text-[10px] text-slate-400">
                    {telemetry.graphicsQuality === 'ultra'
                      ? 'Sombras 2K · 1.5x · Máx.'
                      : telemetry.graphicsQuality === 'high'
                        ? 'Sombras 2K · 1.5x · PBR'
                        : telemetry.graphicsQuality === 'medium'
                          ? 'Sombras 2K · 1.5x · Eco'
                          : 'Leve · 1.0x · Sombras 1K'}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-1 bg-slate-950/90 p-0.5 rounded-md border border-slate-800">
                  {(
                    [
                      { id: 'ultra', label: 'Ultra', activeCls: 'bg-violet-500/25 text-violet-200 border-violet-400/50' },
                      { id: 'high', label: 'Alto', activeCls: 'bg-sky-500/25 text-sky-200 border-sky-400/50' },
                      { id: 'medium', label: 'Médio', activeCls: 'bg-amber-500/25 text-amber-200 border-amber-400/50' },
                      { id: 'low', label: 'Leve', activeCls: 'bg-emerald-500/25 text-emerald-200 border-emerald-400/50' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => handleGraphicsQualityChange(opt.id)}
                      className={`px-1.5 py-1 rounded text-[11px] font-mono-tech font-bold transition-colors cursor-pointer border ${
                        telemetry.graphicsQuality === opt.id
                          ? opt.activeCls
                          : 'text-slate-400 hover:text-slate-200 border-transparent'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={handleResume}
                className="w-full py-2.5 px-4 bg-red-600 hover:bg-red-500 text-white font-display font-bold text-sm tracking-wider rounded-lg transition-colors cursor-pointer"
              >
                RETOMAR VOO
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleOpenHangar}
                  className="flex items-center justify-center gap-1.5 py-2 px-3 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/45 text-amber-200 font-display font-bold text-xs tracking-wider rounded-lg transition-colors cursor-pointer"
                >
                  <Wrench className="w-3.5 h-3.5" />
                  <span>HANGAR [P]</span>
                </button>
                <button
                  type="button"
                  onClick={handleOpenStats}
                  className="flex items-center justify-center gap-1.5 py-2 px-3 bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/45 text-sky-200 font-display font-bold text-xs tracking-wider rounded-lg transition-colors cursor-pointer"
                >
                  <Trophy className="w-3.5 h-3.5" />
                  <span>ESTATÍSTICAS [I]</span>
                </button>
              </div>

              <button
                type="button"
                onClick={handleResetToBase}
                className="w-full flex items-center justify-center gap-1.5 py-2 px-4 bg-slate-800 hover:bg-slate-700 text-slate-100 font-medium text-xs rounded-lg transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reposicionar na Base Aérea</span>
              </button>

              <button
                type="button"
                onClick={handleReturnToTitle}
                className="w-full flex items-center justify-center gap-1.5 py-2 px-4 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white font-medium text-xs rounded-lg transition-colors cursor-pointer"
              >
                <Home className="w-3.5 h-3.5" />
                <span>Voltar ao Menu Inicial</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Company Logbook Statistics & Achievements Modal (Title, Pause, or Key I) */}
      {showStatsModal && (
        <StatsAchievementsModal telemetry={telemetry} onClose={handleCloseStats} />
      )}

      {/* Aircraft Damaged Recovery Modal */}
      {phase === 'damaged' && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#070d17]/78 p-4">
          <div className="bg-[#0B121E] border border-red-500/70 rounded-xl p-6 w-full max-w-sm shadow-2xl">
            <h2 className="font-display font-bold text-2xl text-red-400 tracking-wide">
              DANOS CRÍTICOS
            </h2>
            <p className="text-sm text-slate-300 mt-1.5">
              A integridade do casco chegou a 0%. A equipe de solo de {telemetry.companyName} pode
              rebocar e reparar a aeronave na Base Aérea.
            </p>

            <div className="mt-5 p-3 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between text-xs font-mono-tech">
              <span className="text-slate-400">CAIXA DA EMPRESA</span>
              <span className="text-emerald-400 font-bold">
                ${telemetry.money.toLocaleString('pt-BR')}
              </span>
            </div>

            <button
              type="button"
              onClick={handleResetToBase}
              className="mt-5 w-full py-2.5 px-4 bg-red-600 hover:bg-red-500 text-white font-display font-bold text-sm tracking-wider rounded-lg transition-colors cursor-pointer"
            >
              REPARAR NA BASE AÉREA
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
