import { useState, type FormEvent } from 'react';
import {
  Anchor,
  Camera,
  Check,
  CloudFog,
  CloudLightning,
  Crosshair,
  Droplets,
  Flame,
  Flashlight,
  Moon,
  Package,
  Pause,
  Pencil,
  Radio,
  RotateCcw,
  Siren,
  Snowflake,
  Sun,
  Sunset,
  Volume2,
  VolumeX,
  Wrench,
  X,
} from 'lucide-react';
import type {
  HudNotification,
  MinimapStaticData,
  RadioStation,
  SearchlightMode,
  TelemetryState,
  TimeOfDayPeriod,
  WeatherMode,
  WinchStatus,
} from '../game/types';
import { Minimap } from './Minimap';

interface HUDProps {
  telemetry: TelemetryState;
  minimapData: MinimapStaticData | null;
  showControls: boolean;
  notification: HudNotification | null;
  onOpenHangar: () => void;
  onUpdateCompanyName: (name: string) => void;
  onToggleDuty: () => void;
  onToggleBucket: () => void;
  onToggleWinch: () => void;
  onToggleCamera: () => void;
  onToggleSearchlight: () => void;
  onCycleSearchlightMode: () => void;
  onCycleTimeOfDay: () => void;
  onCycleWeather: () => void;
  onCycleRadio: () => void;
  onToggleMute: () => void;
  onToggleControls: () => void;
  onOpenFullMap: () => void;
  onTogglePause: () => void;
  onResetToBase: () => void;
}

const RADIO_STATION_NAMES: Record<RadioStation, string> = {
  OFF: 'OFF',
  CHILLWAVE: 'CHILLWAVE FM',
  SYNTH_80S: 'SYNTH 80s',
  LOFI_NIGHTS: 'LO-FI NIGHTS',
};

const WEATHER_SHORT: Record<WeatherMode, string> = {
  CLEAR: 'Limpo',
  STORM: 'Tempestade',
  FOG: 'Neblina',
  BLIZZARD: 'Nevasca',
};

const TIME_SHORT: Record<TimeOfDayPeriod, string> = {
  DAY: 'Dia',
  DUSK: 'Pôr do Sol',
  NIGHT: 'Noite',
};

const SEARCHLIGHT_MODE_DISPLAY: Record<SearchlightMode, string> = {
  FRONTAL: 'FRONTAL',
  VERTICAL: 'VERTICAL',
  MANUAL: '360° MOUSE',
};

const WINCH_STATUS_LABELS: Record<WinchStatus, string> = {
  STOWED: 'RECOLHIDO',
  LOWERING: 'DESCENDO',
  HOISTING: 'IÇANDO',
  PATIENT_ONBOARD: 'PACIENTE A BORDO',
};

export function HUD({
  telemetry,
  minimapData,
  showControls,
  notification,
  onOpenHangar,
  onUpdateCompanyName,
  onToggleDuty,
  onToggleBucket,
  onToggleWinch,
  onToggleCamera,
  onToggleSearchlight,
  onCycleSearchlightMode,
  onCycleTimeOfDay,
  onCycleWeather,
  onCycleRadio,
  onToggleMute,
  onToggleControls,
  onOpenFullMap,
  onTogglePause,
  onResetToBase,
}: HUDProps) {
  const [editingCompany, setEditingCompany] = useState(false);
  const [companyDraft, setCompanyDraft] = useState(telemetry.companyName);

  const startEditCompany = () => {
    setCompanyDraft(telemetry.companyName);
    setEditingCompany(true);
  };

  const commitCompanyEdit = (e: FormEvent) => {
    e.preventDefault();
    onUpdateCompanyName(companyDraft);
    setEditingCompany(false);
  };

  const cancelCompanyEdit = () => {
    setCompanyDraft(telemetry.companyName);
    setEditingCompany(false);
  };

  const xpPercent = Math.min(
    100,
    Math.round((telemetry.xp / Math.max(1, telemetry.xpToNextLevel)) * 100)
  );
  const isOnDuty = telemetry.dutyStatus === 'ON_DUTY';
  const vsSign = telemetry.verticalSpeedFpm > 15 ? '+' : telemetry.verticalSpeedFpm < -15 ? '' : ' ';
  const lowFuel = telemetry.fuelPercent <= 20;
  const lowHull = telemetry.hullPercent <= 35;

  const isPadAligned =
    telemetry.padAlignmentError >= 0 && telemetry.padAlignmentError < 3.6;

  const bucketStatusLabel = telemetry.hasIntegratedTank
    ? telemetry.isScoopingWater
      ? 'CAPTANDO'
      : telemetry.isDumpingWater
        ? 'DESPEJANDO'
        : 'INTEGRADO'
    : !telemetry.bucketDeployed
      ? 'RECOLHIDO'
      : telemetry.isScoopingWater
        ? 'ENCHENDO'
        : telemetry.isDumpingWater
          ? 'DESPEJANDO'
          : 'EQUIPADO';

  const WeatherIcon =
    telemetry.weather === 'STORM'
      ? CloudLightning
      : telemetry.weather === 'BLIZZARD'
        ? Snowflake
        : telemetry.weather === 'FOG'
          ? CloudFog
          : telemetry.timeOfDay === 'NIGHT'
            ? Moon
            : telemetry.timeOfDay === 'DUSK'
              ? Sunset
              : Sun;

  return (
    <div className="fixed inset-0 z-10 pointer-events-none select-none p-2 sm:p-2.5 flex flex-col justify-between">
      {/* === TOP-DOWN PRECISION LANDING / WATER DROP RETICLE === */}
      {telemetry.cameraMode === 'topdown' && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-none">
          <div className="relative flex flex-col items-center">
            <svg
              width="116"
              height="116"
              viewBox="0 0 136 136"
              fill="none"
              className="drop-shadow"
            >
              <circle
                cx="68"
                cy="68"
                r="52"
                stroke={isPadAligned ? '#34d399' : telemetry.bucketDeployed ? '#38bdf8' : '#facc15'}
                strokeWidth="1.5"
                strokeDasharray="8 6"
                opacity="0.85"
              />
              <circle
                cx="68"
                cy="68"
                r="14"
                stroke={isPadAligned ? '#34d399' : '#f8fafc'}
                strokeWidth="1.5"
                opacity="0.9"
              />
              <line x1="68" y1="6" x2="68" y2="26" stroke="#f8fafc" strokeWidth="1.5" />
              <line x1="68" y1="110" x2="68" y2="130" stroke="#f8fafc" strokeWidth="1.5" />
              <line x1="6" y1="68" x2="26" y2="68" stroke="#f8fafc" strokeWidth="1.5" />
              <line x1="110" y1="68" x2="130" y2="68" stroke="#f8fafc" strokeWidth="1.5" />
            </svg>
            <div className="mt-1.5 bg-slate-950/65 backdrop-blur-sm border border-slate-700/60 rounded px-2 py-0.5 text-[10px] font-mono-tech text-slate-200">
              {telemetry.padAlignmentError >= 0 ? (
                <span className={isPadAligned ? 'text-emerald-400 font-bold' : 'text-amber-300'}>
                  {isPadAligned
                    ? 'ALINHADO NO HELIPONTO'
                    : `DESVIO ${telemetry.padAlignmentError.toFixed(1)}m`}{' '}
                  · AGL {telemetry.aglFeet} FT
                </span>
              ) : (
                <span>
                  {telemetry.bucketDeployed ? 'MIRA DE DESPEJO' : 'MODO POUSO'} · AGL {telemetry.aglFeet} FT
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* === COCKPIT 1ST-PERSON ARTIFICIAL HORIZON (PITCH / ROLL) === */}
      {telemetry.cameraMode === 'cockpit' && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-none">
          {(() => {
            const pitchDeg = (telemetry.pitchRad * 180) / Math.PI;
            const rollDeg = (-telemetry.rollRad * 180) / Math.PI;
            const pitchOffsetPx = Math.max(-44, Math.min(44, pitchDeg * 2.1));
            return (
              <div className="relative flex flex-col items-center opacity-85">
                <svg width="210" height="210" viewBox="0 0 210 210" fill="none">
                  <defs>
                    <clipPath id="hud-horizon-clip">
                      <circle cx="105" cy="105" r="76" />
                    </clipPath>
                  </defs>

                  {/* Outer discreet bank angle arc */}
                  <path
                    d="M 42 62 A 78 78 0 0 1 168 62"
                    stroke="rgba(56, 189, 248, 0.45)"
                    strokeWidth="1.2"
                    strokeDasharray="4 4"
                  />
                  {/* Top center zero-bank reference caret */}
                  <polygon points="105,24 101,31 109,31" fill="rgba(52, 211, 153, 0.85)" />

                  {/* Rotating & shifting pitch/roll artificial horizon ladder */}
                  <g clipPath="url(#hud-horizon-clip)">
                    <g transform={`rotate(${rollDeg.toFixed(2)} 105 105)`}>
                      {/* Bank pointer triangle along top arc */}
                      <polygon points="105,34 102,40 108,40" fill="rgba(56, 189, 248, 0.9)" />
                      <g transform={`translate(0 ${pitchOffsetPx.toFixed(2)})`}>
                        {/* Main horizon line */}
                        <line
                          x1="28"
                          y1="105"
                          x2="82"
                          y2="105"
                          stroke="rgba(52, 211, 153, 0.82)"
                          strokeWidth="1.6"
                        />
                        <line
                          x1="128"
                          y1="105"
                          x2="182"
                          y2="105"
                          stroke="rgba(52, 211, 153, 0.82)"
                          strokeWidth="1.6"
                        />
                        {/* +10 / +20 deg climb bars (solid) */}
                        <line
                          x1="74"
                          y1="84"
                          x2="92"
                          y2="84"
                          stroke="rgba(56, 189, 248, 0.65)"
                          strokeWidth="1.2"
                        />
                        <line
                          x1="118"
                          y1="84"
                          x2="136"
                          y2="84"
                          stroke="rgba(56, 189, 248, 0.65)"
                          strokeWidth="1.2"
                        />
                        <line
                          x1="84"
                          y1="63"
                          x2="126"
                          y2="63"
                          stroke="rgba(56, 189, 248, 0.45)"
                          strokeWidth="1.1"
                        />
                        {/* -10 / -20 deg dive bars (dashed) */}
                        <line
                          x1="74"
                          y1="126"
                          x2="92"
                          y2="126"
                          stroke="rgba(250, 204, 21, 0.65)"
                          strokeWidth="1.2"
                          strokeDasharray="4 3"
                        />
                        <line
                          x1="118"
                          y1="126"
                          x2="136"
                          y2="126"
                          stroke="rgba(250, 204, 21, 0.65)"
                          strokeWidth="1.2"
                          strokeDasharray="4 3"
                        />
                        <line
                          x1="84"
                          y1="147"
                          x2="126"
                          y2="147"
                          stroke="rgba(250, 204, 21, 0.45)"
                          strokeWidth="1.1"
                          strokeDasharray="4 3"
                        />
                      </g>
                    </g>
                  </g>

                  {/* Fixed center aircraft boresight wings & dot */}
                  <path
                    d="M 80 105 H 96 L 99 109 M 130 105 H 114 L 111 109"
                    stroke="rgba(250, 204, 21, 0.92)"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  <circle cx="105" cy="105" r="2.2" fill="#facc15" />
                </svg>

                <div className="-mt-2 flex items-center gap-3 text-[10px] font-mono-tech text-emerald-300/85 bg-slate-950/45 px-2 py-0.5 rounded border border-emerald-500/25">
                  <span>HDG {String(telemetry.headingDeg).padStart(3, '0')}°</span>
                  <span>AGL {telemetry.aglFeet} FT</span>
                  <span>{telemetry.speedKnots} KTS</span>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* === TOP ROW: COMPANY + WEATHER + FM RADIO (LEFT) | FIRE/TOAST (CENTER) | RADAR (RIGHT) === */}
      <div className="flex items-start justify-between gap-2">
        {/* TOP-LEFT: Compact Company, Money, Hangar, Clock/Weather/FM, XP, Duty */}
        <div className="pointer-events-auto bg-slate-950/65 backdrop-blur-sm border border-slate-700/60 rounded-lg p-2 sm:p-2.5 shadow-md w-[228px] sm:w-[258px] max-w-[46vw]">
          <div className="flex items-center justify-between gap-1.5">
            {editingCompany ? (
              <form
                onSubmit={commitCompanyEdit}
                className="flex items-center gap-1 flex-1 min-w-0"
              >
                <input
                  type="text"
                  maxLength={22}
                  autoFocus
                  value={companyDraft}
                  onChange={(e) => setCompanyDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.stopPropagation();
                      cancelCompanyEdit();
                    }
                  }}
                  aria-label="Editar nome da empresa"
                  className="bg-slate-900/90 border border-amber-400/70 rounded px-1.5 py-0.5 text-[11px] font-display font-bold tracking-wider text-slate-50 uppercase outline-none w-full min-w-0"
                />
                <button
                  type="submit"
                  className="p-0.5 rounded bg-emerald-600/80 hover:bg-emerald-500 text-white cursor-pointer shrink-0"
                  title="Salvar nome da empresa"
                  aria-label="Salvar nome da empresa"
                >
                  <Check className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={cancelCompanyEdit}
                  className="p-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer shrink-0"
                  title="Cancelar"
                  aria-label="Cancelar edição"
                >
                  <X className="w-3 h-3" />
                </button>
              </form>
            ) : (
              <div className="flex items-center gap-1.5 min-w-0">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                  className="shrink-0"
                >
                  <circle cx="12" cy="12" r="2.6" fill="#ef4444" />
                  <path
                    d="M12 2.5V8.5M12 15.5V21.5M2.5 12H8.5M15.5 12H21.5"
                    stroke="#f8fafc"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                  />
                </svg>
                <button
                  type="button"
                  onClick={startEditCompany}
                  className="group flex items-center gap-1 min-w-0 text-left cursor-pointer"
                  title="Clique para editar o nome da empresa"
                >
                  <span className="font-display font-bold text-xs tracking-wide text-slate-50 truncate">
                    {telemetry.companyName}
                  </span>
                  <Pencil className="w-2.5 h-2.5 text-slate-500 group-hover:text-amber-300 transition-colors shrink-0" />
                </button>
              </div>
            )}

            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-xs font-mono-tech text-emerald-400 font-bold whitespace-nowrap">
                ${telemetry.money.toLocaleString('pt-BR')}
              </span>
              <button
                type="button"
                onClick={onOpenHangar}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-800/85 hover:bg-slate-700 border border-amber-500/45 text-[10px] font-mono-tech font-bold text-amber-300 hover:text-amber-200 transition-colors cursor-pointer whitespace-nowrap"
                title="Abrir Hangar e Árvore de Frota (Tecla P)"
              >
                <Wrench className="w-2.5 h-2.5 shrink-0" />
                <span className="hidden sm:inline">HANGAR</span>
                <span>[P]</span>
              </button>
            </div>
          </div>

          {/* Clock + Time of Day + Weather Row */}
          <div className="mt-1 flex items-center justify-between gap-1.5 text-[10px] font-mono-tech text-slate-300">
            <button
              type="button"
              onClick={onCycleTimeOfDay}
              className="flex items-center gap-1 hover:text-white transition-colors cursor-pointer whitespace-nowrap"
              title="Alternar Dia / Pôr do Sol / Noite (Tecla N)"
            >
              <span className="text-slate-100 font-bold">{telemetry.gameTimeFormatted}</span>
              <span className="text-slate-500">·</span>
              <span className="text-amber-300">{TIME_SHORT[telemetry.timeOfDay]}</span>
            </button>

            <button
              type="button"
              onClick={onCycleWeather}
              className="flex items-center gap-1 hover:text-white transition-colors cursor-pointer whitespace-nowrap"
              title="Alternar Clima: Limpo / Tempestade / Neblina / Nevasca (Tecla K)"
            >
              <WeatherIcon
                className={`w-3 h-3 ${
                  telemetry.weather === 'STORM'
                    ? 'text-sky-300'
                    : telemetry.weather === 'BLIZZARD'
                      ? 'text-cyan-200'
                      : telemetry.weather === 'FOG'
                        ? 'text-slate-300'
                        : 'text-amber-300'
                }`}
              />
              <span>{WEATHER_SHORT[telemetry.weather]}</span>
            </button>
          </div>

          {/* FM Radio Station Strip */}
          <div className="mt-1 flex items-center justify-between gap-1.5 text-[10px] font-mono-tech">
            <button
              type="button"
              onClick={onCycleRadio}
              className="flex items-center gap-1 text-slate-300 hover:text-white transition-colors cursor-pointer truncate"
              title="Trocar estação de Rádio FM (Tecla T)"
            >
              <Radio
                className={`w-3 h-3 shrink-0 ${
                  telemetry.radioStation === 'OFF' ? 'text-slate-500' : 'text-emerald-400'
                }`}
              />
              <span className="truncate">
                FM:{' '}
                <strong
                  className={
                    telemetry.radioStation === 'OFF' ? 'text-slate-400' : 'text-sky-300'
                  }
                >
                  {RADIO_STATION_NAMES[telemetry.radioStation]}
                </strong>
              </span>
            </button>
            <span className="text-slate-500 shrink-0">[T]</span>
          </div>

          {/* XP / Rank & Active Aircraft Progress */}
          <div className="mt-1.5 pt-1.5 border-t border-slate-800/80">
            <div className="flex items-center justify-between text-[10px] text-slate-300 mb-1 gap-1.5">
              <span className="truncate">
                <strong className="text-sky-300">{telemetry.activeHelicopterName}</strong>
                <span className="text-slate-600 mx-1">·</span>
                Nv.<strong className="text-slate-100 font-mono-tech">{telemetry.level}</strong>
                <span className="hidden sm:inline text-slate-600 mx-1">·</span>
                <span className="hidden sm:inline">{telemetry.rankTitle}</span>
              </span>
              <span className="font-mono-tech text-slate-400 shrink-0">
                {telemetry.xp}/{telemetry.xpToNextLevel}
              </span>
            </div>
            <div className="h-1 w-full bg-slate-800/90 rounded-sm overflow-hidden">
              <div
                className="h-full bg-amber-400 transition-transform duration-200 origin-left"
                style={{ transform: `scaleX(${Math.max(0.02, xpPercent / 100)})` }}
              />
            </div>
          </div>

          {/* Duty Toggle (Key J) */}
          <div className="mt-1.5 pt-1.5 border-t border-slate-800/80 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onToggleDuty}
              className={`px-2 py-0.5 rounded text-[10px] font-mono-tech font-bold tracking-wide transition-colors cursor-pointer whitespace-nowrap ${
                isOnDuty
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 hover:bg-emerald-500/30'
                  : 'bg-slate-800/90 text-slate-300 border border-slate-700 hover:bg-slate-700'
              }`}
              title="Alternar status de serviço (Tecla J)"
            >
              {isOnDuty ? 'ON DUTY' : 'OFF DUTY'}
            </button>

            <span className="text-[10px] text-slate-400 font-mono-tech whitespace-nowrap">
              [J] Serviço
            </span>
          </div>

          {/* Active Dispatch Destination when ON DUTY */}
          {telemetry.activeDispatch && (
            <div className="mt-1.5 pt-1.5 border-t border-slate-800/80 text-[10px]">
              <div className="flex items-center justify-between gap-1.5 font-medium">
                <span
                  className={`truncate ${
                    telemetry.activeDispatch.missionKind === 'oil_rig'
                      ? 'text-orange-300'
                      : telemetry.activeDispatch.missionKind === 'heli_ski'
                        ? 'text-sky-300'
                        : 'text-emerald-300'
                  }`}
                >
                  Alvo: {telemetry.activeDispatch.targetPadName}
                </span>
                <span className="font-mono-tech text-amber-300 shrink-0">
                  {telemetry.activeDispatch.distanceMeters}m
                </span>
              </div>
              <div className="text-[10px] text-slate-400 font-mono-tech mt-0.5 flex items-center justify-between gap-1.5">
                <span className="truncate">
                  {telemetry.activeDispatch.missionLabel} +${telemetry.activeDispatch.reward} · +
                  {telemetry.activeDispatch.xpReward} XP
                </span>
                {telemetry.activeDispatch.nightBonusAmount > 0 && (
                  <span className="text-amber-300 shrink-0">
                    +${telemetry.activeDispatch.nightBonusAmount}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* TOP-CENTER: Compact Fire Emergency Tracker + Transient Radio Toast */}
        <div className="flex-1 min-w-0 flex flex-col items-center gap-1.5 pt-0.5">
          {telemetry.activeFire && (
            <div className="bg-slate-950/70 backdrop-blur-sm border border-orange-500/65 rounded-lg px-2.5 py-1.5 shadow-md w-full max-w-[270px]">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Flame className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                  <span className="font-display font-bold text-[11px] tracking-wide text-orange-300 truncate">
                    {telemetry.activeFire.title} · {telemetry.activeFire.locationLabel}
                  </span>
                </div>
                <span className="font-mono-tech text-[11px] font-bold text-amber-300 whitespace-nowrap">
                  {telemetry.activeFire.distanceMeters}m
                </span>
              </div>

              <div className="mt-1">
                <div className="flex items-center justify-between text-[10px] mb-0.5">
                  <span className="text-slate-300">
                    Extinção:{' '}
                    <strong className="font-mono-tech text-sky-300">
                      {telemetry.activeFire.extinguishedPercent}%
                    </strong>
                  </span>
                  <span className="font-mono-tech text-slate-400">
                    Fogo {telemetry.activeFire.intensityPercent}% · +${telemetry.activeFire.reward}
                  </span>
                </div>
                <div className="h-1 w-full bg-slate-800/90 rounded-sm overflow-hidden">
                  <div
                    className="h-full bg-sky-400 transition-transform duration-150 origin-left"
                    style={{
                      transform: `scaleX(${Math.max(0.01, telemetry.activeFire.extinguishedPercent / 100)})`,
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {telemetry.activePursuit && (
            <div className="bg-slate-950/70 backdrop-blur-sm border border-blue-500/70 rounded-lg px-2.5 py-1.5 shadow-md w-full max-w-[285px]">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Siren className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  <span className="font-display font-bold text-[11px] tracking-wide text-blue-300 truncate">
                    {telemetry.activePursuit.title} · {telemetry.activePursuit.districtLabel}
                  </span>
                </div>
                <span className="font-mono-tech text-[11px] font-bold text-amber-300 whitespace-nowrap">
                  {telemetry.activePursuit.distanceMeters}m
                </span>
              </div>

              <div className="mt-1">
                <div className="flex items-center justify-between text-[10px] mb-0.5 gap-2">
                  <span className="text-slate-300">
                    Rastreamento:{' '}
                    <strong
                      className={`font-mono-tech ${
                        telemetry.activePursuit.intercepted
                          ? 'text-emerald-400'
                          : telemetry.activePursuit.inSpotlight
                            ? 'text-sky-300'
                            : 'text-amber-300'
                      }`}
                    >
                      {telemetry.activePursuit.trackingPercent}%
                    </strong>
                  </span>
                  <span className="font-mono-tech truncate text-slate-300">
                    {telemetry.activePursuit.intercepted
                      ? 'INTERCEPTADO'
                      : telemetry.activePursuit.inSpotlight
                        ? 'ALVO NO FOCO'
                        : 'USE HOLOFOTE [L]'}
                  </span>
                </div>
                <div className="h-1.5 w-full bg-slate-800/90 rounded-sm overflow-hidden">
                  <div
                    className={`h-full transition-transform duration-100 origin-left ${
                      telemetry.activePursuit.intercepted
                        ? 'bg-emerald-400'
                        : telemetry.activePursuit.inSpotlight
                          ? 'bg-sky-400'
                          : 'bg-blue-500/70'
                    }`}
                    style={{
                      transform: `scaleX(${Math.max(0.01, telemetry.activePursuit.trackingPercent / 100)})`,
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {telemetry.activeWinchRescue && !telemetry.activeWinchRescue.patientOnboard && (
            <div
              className={`bg-slate-950/70 backdrop-blur-sm border rounded-lg px-2.5 py-1.5 shadow-md w-full max-w-[285px] ${
                telemetry.activeWinchRescue.inHoverZone
                  ? 'border-emerald-500/75'
                  : telemetry.activeWinchRescue.kind === 'sea'
                    ? 'border-red-500/65'
                    : 'border-orange-500/65'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Anchor
                    className={`w-3.5 h-3.5 shrink-0 ${
                      telemetry.activeWinchRescue.inHoverZone
                        ? 'text-emerald-400'
                        : telemetry.activeWinchRescue.kind === 'sea'
                          ? 'text-red-400'
                          : 'text-orange-400'
                    }`}
                  />
                  <span className="font-display font-bold text-[11px] tracking-wide text-slate-100 truncate">
                    {telemetry.activeWinchRescue.title}
                  </span>
                </div>
                <span className="font-mono-tech text-[11px] font-bold text-amber-300 whitespace-nowrap">
                  {telemetry.activeWinchRescue.distanceMeters}m
                </span>
              </div>

              <div className="mt-1">
                <div className="flex items-center justify-between text-[10px] mb-0.5 gap-2">
                  <span className="text-slate-300">
                    Içamento:{' '}
                    <strong className="font-mono-tech text-emerald-300">
                      {telemetry.activeWinchRescue.hoistPercent}%
                    </strong>
                  </span>
                  <span
                    className={`font-mono-tech truncate ${
                      telemetry.activeWinchRescue.inHoverZone
                        ? 'text-emerald-300 font-semibold'
                        : 'text-amber-300'
                    }`}
                  >
                    {telemetry.activeWinchRescue.hoverHint}
                  </span>
                </div>
                <div className="h-1.5 w-full bg-slate-800/90 rounded-sm overflow-hidden">
                  <div
                    className={`h-full transition-transform duration-100 origin-left ${
                      telemetry.activeWinchRescue.inHoverZone
                        ? 'bg-emerald-400'
                        : 'bg-amber-400'
                    }`}
                    style={{
                      transform: `scaleX(${Math.max(0.01, telemetry.activeWinchRescue.hoistPercent / 100)})`,
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {telemetry.activeSlingCargo && (
            <div
              className={`bg-slate-950/72 backdrop-blur-sm border rounded-lg px-2.5 py-1.5 shadow-md w-full max-w-[295px] ${
                telemetry.activeSlingCargo.inDropZone || telemetry.activeSlingCargo.inHookZone
                  ? 'border-emerald-400/80'
                  : 'border-amber-400/70'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Package
                    className={`w-3.5 h-3.5 shrink-0 ${
                      telemetry.activeSlingCargo.phase === 'CARRYING'
                        ? 'text-emerald-400'
                        : 'text-amber-400'
                    }`}
                  />
                  <span className="font-display font-bold text-[11px] tracking-wide text-amber-200 truncate">
                    {telemetry.activeSlingCargo.cargoLabel} → {telemetry.activeSlingCargo.dropLabel}
                  </span>
                </div>
                <span className="font-mono-tech text-[11px] font-bold text-amber-300 whitespace-nowrap">
                  {telemetry.activeSlingCargo.distanceMeters}m
                </span>
              </div>

              <div className="mt-1">
                <div className="flex items-center justify-between text-[10px] mb-0.5 gap-2">
                  <span className="text-slate-300 shrink-0">
                    Carga:{' '}
                    <strong
                      className={`font-mono-tech ${
                        telemetry.activeSlingCargo.integrityPercent >= 85
                          ? 'text-emerald-300'
                          : telemetry.activeSlingCargo.integrityPercent >= 55
                            ? 'text-amber-300'
                            : 'text-red-400'
                      }`}
                    >
                      {telemetry.activeSlingCargo.integrityPercent}%
                    </strong>
                  </span>
                  <span
                    className={`font-mono-tech truncate ${
                      telemetry.activeSlingCargo.inDropZone || telemetry.activeSlingCargo.inHookZone
                        ? 'text-emerald-300 font-bold'
                        : 'text-amber-200'
                    }`}
                  >
                    {telemetry.activeSlingCargo.hintText}
                  </span>
                </div>
                <div className="h-1.5 w-full bg-slate-800/90 rounded-sm overflow-hidden">
                  <div
                    className={`h-full transition-transform duration-150 origin-left ${
                      telemetry.activeSlingCargo.integrityPercent >= 85
                        ? 'bg-emerald-400'
                        : telemetry.activeSlingCargo.integrityPercent >= 55
                          ? 'bg-amber-400'
                          : 'bg-red-500'
                    }`}
                    style={{
                      transform: `scaleX(${Math.max(0.05, telemetry.activeSlingCargo.integrityPercent / 100)})`,
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {notification && (
            <div
              key={notification.id}
              className={`bg-slate-950/70 backdrop-blur-sm border rounded-lg px-3 py-1.5 shadow-md max-w-[300px] text-center ${
                notification.tone === 'success'
                  ? 'border-emerald-500/60'
                  : notification.tone === 'warning'
                    ? 'border-red-500/70'
                    : 'border-slate-600/70'
              }`}
            >
              <div
                className={`font-display font-bold text-[11px] tracking-wide ${
                  notification.tone === 'success'
                    ? 'text-emerald-300'
                    : notification.tone === 'warning'
                      ? 'text-red-400'
                      : 'text-amber-300'
                }`}
              >
                {notification.title}
              </div>
              <div className="text-[10px] text-slate-200 mt-0.5 leading-snug">
                {notification.detail}
              </div>
            </div>
          )}
        </div>

        {/* TOP-RIGHT: Compact Circular Radar Minimap */}
        <div className="pointer-events-auto shrink-0">
          <Minimap
            staticData={minimapData}
            telemetry={telemetry}
            onOpenFullMap={onOpenFullMap}
          />
        </div>
      </div>

      {/* === BOTTOM ROW: TELEMETRY + BAMBI BUCKET + SEARCHLIGHT (LEFT) & CONTROLS (RIGHT) === */}
      <div className="flex items-end justify-between gap-2">
        {/* BOTTOM-LEFT: Compact Aviation Telemetry */}
        <div className="pointer-events-auto bg-slate-950/65 backdrop-blur-sm border border-slate-700/60 rounded-lg p-2 sm:p-2.5 shadow-md w-[228px] sm:w-[258px] max-w-[52vw]">
          <div className="grid grid-cols-3 gap-1.5 pb-1.5 border-b border-slate-800/80">
            <div>
              <div className="text-[9px] text-slate-400 tracking-wider leading-none">VELOCIDADE</div>
              <div className="font-mono-tech text-sm sm:text-base font-bold text-slate-50 leading-tight mt-0.5">
                {telemetry.speedKnots}
                <span className="text-[9px] font-medium text-slate-400 ml-0.5">KTS</span>
              </div>
            </div>

            <div>
              <div className="text-[9px] text-slate-400 tracking-wider leading-none">ALTITUDE</div>
              <div className="font-mono-tech text-sm sm:text-base font-bold text-slate-50 leading-tight mt-0.5">
                {telemetry.altitudeFeet}
                <span className="text-[9px] font-medium text-slate-400 ml-0.5">FT</span>
              </div>
            </div>

            <div>
              <div className="text-[9px] text-slate-400 tracking-wider leading-none">V/S</div>
              <div
                className={`font-mono-tech text-sm sm:text-base font-bold leading-tight mt-0.5 ${
                  telemetry.verticalSpeedFpm > 120
                    ? 'text-emerald-400'
                    : telemetry.verticalSpeedFpm < -260
                      ? 'text-amber-400'
                      : 'text-slate-100'
                }`}
              >
                {vsSign}
                {telemetry.verticalSpeedFpm}
              </div>
            </div>
          </div>

          {/* Fuel, Hull & Bambi Bucket Bars */}
          <div className="mt-1.5 space-y-1">
            <div>
              <div className="flex items-center justify-between text-[10px] mb-0.5">
                <span className="text-slate-400">Combustível</span>
                <span className={`font-mono-tech font-bold ${lowFuel ? 'text-red-400' : 'text-slate-200'}`}>
                  {telemetry.fuelPercent}%
                </span>
              </div>
              <div className="h-1 w-full bg-slate-800/90 rounded-sm overflow-hidden">
                <div
                  className={`h-full transition-transform duration-150 origin-left ${
                    lowFuel ? 'bg-red-500' : 'bg-amber-400'
                  }`}
                  style={{ transform: `scaleX(${telemetry.fuelPercent / 100})` }}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-[10px] mb-0.5">
                <span className="text-slate-400">Casco</span>
                <span className={`font-mono-tech font-bold ${lowHull ? 'text-red-400' : 'text-slate-200'}`}>
                  {telemetry.hullPercent}%
                </span>
              </div>
              <div className="h-1 w-full bg-slate-800/90 rounded-sm overflow-hidden">
                <div
                  className={`h-full transition-transform duration-150 origin-left ${
                    lowHull ? 'bg-red-500' : 'bg-emerald-400'
                  }`}
                  style={{ transform: `scaleX(${telemetry.hullPercent / 100})` }}
                />
              </div>
            </div>

            {/* Bambi Bucket / Integrated Ventral Tank Status & Blue Water Bar */}
            <div className="pt-1 border-t border-slate-800/70">
              <div className="flex items-center justify-between text-[10px] mb-0.5 gap-1">
                <button
                  type="button"
                  onClick={onToggleBucket}
                  className="flex items-center gap-1 text-slate-300 hover:text-white transition-colors cursor-pointer min-w-0 truncate"
                  title={
                    telemetry.hasIntegratedTank
                      ? 'Tanque ventral integrado sempre pronto (Firekite)'
                      : 'Equipar ou recolher Bambi Bucket (Tecla B)'
                  }
                >
                  <Droplets
                    className={`w-3 h-3 shrink-0 ${
                      telemetry.hasIntegratedTank || telemetry.bucketDeployed
                        ? 'text-sky-400'
                        : 'text-slate-500'
                    }`}
                  />
                  <span className="truncate">
                    {telemetry.hasIntegratedTank ? 'Tanque' : 'Bambi Bucket'}
                  </span>
                  <span
                    className={`font-mono-tech text-[9px] font-bold shrink-0 ${
                      telemetry.isScoopingWater || telemetry.isDumpingWater
                        ? 'text-sky-300'
                        : telemetry.hasIntegratedTank || telemetry.bucketDeployed
                          ? 'text-orange-300'
                          : 'text-slate-500'
                    }`}
                  >
                    · {bucketStatusLabel}
                  </span>
                </button>
                <span className="font-mono-tech font-bold text-sky-300 shrink-0">
                  {telemetry.bucketWaterPercent}%
                </span>
              </div>
              <div className="h-1.5 w-full bg-slate-800/90 rounded-sm overflow-hidden">
                <div
                  className={`h-full transition-transform duration-100 origin-left ${
                    telemetry.hasIntegratedTank || telemetry.bucketDeployed
                      ? 'bg-sky-400'
                      : 'bg-sky-700/60'
                  }`}
                  style={{ transform: `scaleX(${telemetry.bucketWaterPercent / 100})` }}
                />
              </div>
            </div>

            {/* Phase 6: Rescue Winch Status Strip (visible during Winch Rescue missions) */}
            {telemetry.activeWinchRescue && (
              <div className="pt-1 border-t border-slate-800/70">
                <div className="flex items-center justify-between text-[10px] gap-1">
                  <button
                    type="button"
                    onClick={onToggleWinch}
                    className="flex items-center gap-1 text-slate-300 hover:text-white transition-colors cursor-pointer min-w-0 truncate"
                    title="Acionar ou recolher Guincho de Resgate (Tecla R)"
                  >
                    <Anchor
                      className={`w-3 h-3 shrink-0 ${
                        telemetry.winchStatus === 'PATIENT_ONBOARD'
                          ? 'text-emerald-400'
                          : telemetry.winchStatus === 'HOISTING' ||
                              telemetry.winchStatus === 'LOWERING'
                            ? 'text-amber-300'
                            : 'text-slate-400'
                      }`}
                    />
                    <span className="truncate">Guincho [R]</span>
                  </button>
                  <span
                    className={`font-mono-tech text-[9px] font-bold shrink-0 ${
                      telemetry.winchStatus === 'PATIENT_ONBOARD'
                        ? 'text-emerald-400'
                        : telemetry.winchStatus === 'HOISTING'
                          ? 'text-emerald-300'
                          : telemetry.winchStatus === 'LOWERING'
                            ? 'text-amber-300'
                            : 'text-slate-400'
                    }`}
                  >
                    {WINCH_STATUS_LABELS[telemetry.winchStatus]}
                  </span>
                </div>
              </div>
            )}

            {/* Phase 9: Heavy Cargo Sling Load Status Strip */}
            {telemetry.activeSlingCargo && (
              <div className="pt-1 border-t border-slate-800/70">
                <div className="flex items-center justify-between text-[10px] gap-1">
                  <button
                    type="button"
                    onClick={onToggleWinch}
                    className="flex items-center gap-1 text-slate-300 hover:text-white transition-colors cursor-pointer min-w-0 truncate"
                    title="Engatar ou soltar Carga Pesada (Tecla R)"
                  >
                    <Package
                      className={`w-3 h-3 shrink-0 ${
                        telemetry.activeSlingCargo.phase === 'CARRYING'
                          ? 'text-emerald-400'
                          : 'text-amber-400'
                      }`}
                    />
                    <span className="truncate">Gancho Carga [R]</span>
                  </button>
                  <span
                    className={`font-mono-tech text-[9px] font-bold shrink-0 ${
                      telemetry.activeSlingCargo.phase === 'CARRYING'
                        ? 'text-emerald-400'
                        : telemetry.activeSlingCargo.inHookZone
                          ? 'text-emerald-300'
                          : 'text-amber-300'
                    }`}
                  >
                    {telemetry.activeSlingCargo.phase === 'CARRYING'
                      ? 'ENGATADA'
                      : telemetry.activeSlingCargo.inHookZone
                        ? 'ENGATAR [R]'
                        : 'COLETA'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Searchlight Status & 360° Gimbal Mode Strip */}
          <div className="mt-1.5 pt-1.5 border-t border-slate-800/80 flex items-center justify-between gap-1 text-[10px]">
            <button
              type="button"
              onClick={onToggleSearchlight}
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded border transition-colors cursor-pointer min-w-0 truncate ${
                telemetry.searchlightOn
                  ? 'bg-amber-500/20 border-amber-400/60 text-amber-200 hover:bg-amber-500/30'
                  : 'bg-slate-800/75 border-slate-700/60 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
              }`}
              title="Ligar/Desligar Holofote de Busca (Tecla L)"
            >
              <Flashlight
                className={`w-3 h-3 shrink-0 ${
                  telemetry.searchlightOn ? 'text-amber-300' : 'text-slate-500'
                }`}
              />
              <span className="font-mono-tech font-semibold truncate">
                LUZ:{telemetry.searchlightOn ? 'ON' : 'OFF'}{' '}
                <span className={telemetry.searchlightOn ? 'text-amber-300' : 'text-slate-500'}>
                  [{SEARCHLIGHT_MODE_DISPLAY[telemetry.searchlightMode]}]
                </span>
              </span>
            </button>

            <button
              type="button"
              onClick={onCycleSearchlightMode}
              className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-slate-800/85 hover:bg-slate-700 border border-slate-700/60 text-slate-200 hover:text-amber-200 transition-colors cursor-pointer shrink-0"
              title="Alternar modo do gimbal do holofote: FRONTAL / VERTICAL / 360° MOUSE (Tecla G)"
            >
              <Crosshair className="w-2.5 h-2.5 text-amber-300" />
              <span className="font-mono-tech">[G]</span>
            </button>
          </div>

          {/* Quick Utility Buttons */}
          <div className="mt-1.5 pt-1.5 border-t border-slate-800/80 flex items-center justify-between gap-1.5 text-[10px]">
            <button
              type="button"
              onClick={onToggleCamera}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-800/85 hover:bg-slate-700 text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
              title="Alternar câmera (Tecla C)"
            >
              <Camera className="w-3 h-3 text-amber-300" />
              <span className="font-mono-tech">
                {telemetry.cameraMode === 'chase'
                  ? '3ª Pessoa'
                  : telemetry.cameraMode === 'topdown'
                    ? 'Top-Down'
                    : telemetry.cameraMode === 'cockpit'
                      ? 'Cockpit'
                      : telemetry.cameraMode === 'orbit'
                        ? 'Orbital 360°'
                        : 'Fly-By'}
              </span>
            </button>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onToggleMute}
                className="p-1 rounded bg-slate-800/85 hover:bg-slate-700 text-slate-200 transition-colors cursor-pointer"
                title="Ligar/Desligar Áudio (Tecla M)"
                aria-label="Alternar áudio"
              >
                {telemetry.muted ? (
                  <VolumeX className="w-3 h-3 text-red-400" />
                ) : (
                  <Volume2 className="w-3 h-3 text-slate-200" />
                )}
              </button>

              <button
                type="button"
                onClick={onResetToBase}
                className="p-1 rounded bg-slate-800/85 hover:bg-slate-700 text-slate-200 transition-colors cursor-pointer"
                title="Retornar à Base Aérea (Shift+R)"
                aria-label="Retornar à Base Aérea"
              >
                <RotateCcw className="w-3 h-3" />
              </button>

              <button
                type="button"
                onClick={onTogglePause}
                className="p-1 rounded bg-slate-800/85 hover:bg-slate-700 text-slate-200 transition-colors cursor-pointer"
                title="Pausar (Esc)"
                aria-label="Pausar simulação"
              >
                <Pause className="w-3 h-3" />
              </button>
            </div>
          </div>

          {telemetry.cameraMode === 'orbit' && (
            <div className="mt-1 pt-1 border-t border-slate-800/70 text-[9px] font-mono-tech text-sky-300/90 text-center tracking-tight">
              Arrastar: Girar | Scroll: Zoom
            </div>
          )}
          {telemetry.cameraMode === 'flyby' && (
            <div className="mt-1 pt-1 border-t border-slate-800/70 text-[9px] font-mono-tech text-amber-300/85 text-center tracking-tight">
              Fly-By · Câmera Fixa Dinâmica
            </div>
          )}
        </div>

        {/* BOTTOM-RIGHT: Discreet FPS / Draw Calls Meter + Collapsible Controls Reference Card */}
        <div className="pointer-events-auto shrink-0 flex flex-col items-end gap-1.5">
          <div className="pointer-events-none bg-slate-950/60 backdrop-blur-sm border border-slate-700/50 rounded px-2 py-0.5 text-[10px] font-mono-tech tabular-nums shadow">
            <span
              className={
                telemetry.fps >= 50
                  ? 'text-emerald-300 font-semibold'
                  : telemetry.fps >= 30
                    ? 'text-amber-300 font-semibold'
                    : 'text-red-400 font-semibold'
              }
            >
              {telemetry.fps} FPS
            </span>
            <span className="text-slate-500 mx-1.5">|</span>
            <span className="text-sky-300 font-semibold">{telemetry.drawCalls} calls</span>
          </div>
          {showControls ? (
            <div className="bg-slate-950/65 backdrop-blur-sm border border-slate-700/60 rounded-lg p-2 sm:p-2.5 shadow-md w-[206px] sm:w-[224px] max-w-[44vw]">
              <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-800/80">
                <span className="font-display font-bold text-[10px] tracking-wider text-slate-200">
                  COMANDOS DE VOO
                </span>
                <button
                  type="button"
                  onClick={onToggleControls}
                  className="text-[10px] font-mono-tech text-slate-400 hover:text-slate-100 cursor-pointer"
                >
                  [H] Ocultar
                </button>
              </div>

              <div className="space-y-0.5 text-[10px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-400">Acelerar / Frear</span>
                  <span className="font-mono-tech text-slate-100 font-semibold">W / S</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-400">Girar / Lateral</span>
                  <span className="font-mono-tech text-slate-100 font-semibold">A/D · Q/E</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-400">Subir / Descer</span>
                  <span className="font-mono-tech text-slate-100 font-semibold">Espaço / Shift</span>
                </div>

                <div className="pt-1 mt-1 border-t border-slate-800/70 flex items-center justify-between gap-2">
                  <span className="text-slate-400">Balde de Água</span>
                  <span className="font-mono-tech text-orange-300 font-semibold">B</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-400">Soltar Água</span>
                  <span className="font-mono-tech text-sky-300 font-semibold">F / Clique</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-400">Guincho / Carga</span>
                  <span className="font-mono-tech text-emerald-300 font-semibold">R</span>
                </div>

                <div className="pt-1 mt-1 border-t border-slate-800/70 flex items-center justify-between gap-2">
                  <span className="text-slate-400">Câmera / Serviço</span>
                  <span className="font-mono-tech text-emerald-300 font-semibold">C · J</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-400">Horário / Clima</span>
                  <span className="font-mono-tech text-amber-300 font-semibold">N · K</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-400">Holofote / Modo</span>
                  <span className="font-mono-tech text-amber-200 font-semibold">L · G</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-400">Rádio FM / Mudo</span>
                  <span className="font-mono-tech text-sky-300 font-semibold">T · M</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-400">Hangar / Frota</span>
                  <span className="font-mono-tech text-amber-300 font-semibold">P</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-400">Mapa Completo</span>
                  <span className="font-mono-tech text-sky-300 font-semibold">Tab</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-400">Estatísticas</span>
                  <span className="font-mono-tech text-amber-300 font-semibold">I</span>
                </div>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={onToggleControls}
              className="bg-slate-950/65 backdrop-blur-sm border border-slate-700/60 hover:border-slate-500 rounded-lg px-2.5 py-1 text-[10px] sm:text-[11px] font-mono-tech text-slate-300 hover:text-white shadow-md transition-colors cursor-pointer"
            >
              [H] Comandos
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
