import { useState, type FormEvent } from 'react';
import { Check, Pencil, Play, RotateCcw, Trophy, X } from 'lucide-react';
import { ACHIEVEMENT_CATALOG } from '../game/CareerStats';
import type { TelemetryState } from '../game/types';

interface TitleScreenProps {
  telemetry: TelemetryState;
  onStart: () => void;
  onOpenStats: () => void;
  onUpdateCompanyName: (name: string) => void;
  onResetCareer: () => void;
}

export function TitleScreen({
  telemetry,
  onStart,
  onOpenStats,
  onUpdateCompanyName,
  onResetCareer,
}: TitleScreenProps) {
  const [editingCompany, setEditingCompany] = useState(false);
  const [companyDraft, setCompanyDraft] = useState(telemetry.companyName);
  const [confirmReset, setConfirmReset] = useState(false);

  const startEdit = () => {
    setCompanyDraft(telemetry.companyName);
    setEditingCompany(true);
  };

  const commitEdit = (e: FormEvent) => {
    e.preventDefault();
    onUpdateCompanyName(companyDraft);
    setEditingCompany(false);
  };

  const cancelEdit = () => {
    setCompanyDraft(telemetry.companyName);
    setEditingCompany(false);
  };

  const handleConfirmReset = () => {
    onResetCareer();
    setConfirmReset(false);
  };

  const hasCareer = telemetry.hasSavedCareer;

  return (
    <div className="fixed inset-0 z-20 flex flex-col justify-end p-5 sm:p-10 md:p-14 pointer-events-none select-none">
      {/* Subtle lower-left cinematic vignette keeping the live 3D island, traffic & AI helicopters unobstructed */}
      <div className="fixed inset-0 bg-gradient-to-tr from-[#060c17]/82 via-[#060c17]/22 to-transparent pointer-events-none" />

      <div className="relative z-10 max-w-lg pointer-events-auto">
        <div className="bg-slate-950/60 backdrop-blur-md border border-white/12 rounded-2xl p-5 sm:p-6 shadow-2xl">
          {/* Bespoke SVG Title Lockup */}
          <div className="flex items-center gap-3.5">
            <svg
              width="48"
              height="48"
              viewBox="0 0 56 56"
              fill="none"
              aria-hidden="true"
              className="shrink-0"
            >
              <rect width="56" height="56" rx="12" fill="#0B121E" stroke="#334155" strokeWidth="2" />
              <circle cx="28" cy="28" r="19" stroke="#facc15" strokeWidth="2.5" strokeDasharray="7 5" />
              <path d="M12 28H44M28 12V44" stroke="#f8fafc" strokeWidth="3" strokeLinecap="round" />
              <circle cx="28" cy="28" r="5" fill="#ef4444" stroke="#f8fafc" strokeWidth="2" />
            </svg>

            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-mono-tech tracking-[0.22em] text-amber-300 uppercase">
                SIMULAÇÃO AÉREA COSTEIRA 3D
              </div>

              {editingCompany ? (
                <form onSubmit={commitEdit} className="mt-1 flex items-center gap-1.5">
                  <input
                    type="text"
                    maxLength={22}
                    autoFocus
                    value={companyDraft}
                    onChange={(e) => setCompanyDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        e.stopPropagation();
                        cancelEdit();
                      }
                    }}
                    aria-label="Editar nome da empresa"
                    className="bg-slate-900/95 border border-amber-400/75 rounded-md px-2 py-1 font-display font-bold text-xl tracking-wider text-white uppercase outline-none w-full min-w-0"
                  />
                  <button
                    type="submit"
                    className="p-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer shrink-0"
                    title="Salvar nome da empresa"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="p-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer shrink-0"
                    title="Cancelar"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={startEdit}
                  className="group mt-0.5 flex items-center gap-2 text-left max-w-full cursor-pointer"
                  title="Clique para personalizar o nome da sua empresa"
                >
                  <h1 className="font-display font-bold text-3xl sm:text-4xl tracking-wider text-white leading-none truncate">
                    {telemetry.companyName}
                  </h1>
                  <Pencil className="w-3.5 h-3.5 text-slate-400 group-hover:text-amber-300 transition-colors shrink-0" />
                </button>
              )}
            </div>
          </div>

          {/* Live Career Summary Strip (shown when career save exists) */}
          {hasCareer ? (
            <div className="mt-4 px-3 py-2 rounded-lg bg-slate-900/70 border border-slate-700/60 flex flex-wrap items-center justify-between gap-2 text-xs font-mono-tech">
              <span className="text-slate-200">
                Nv.<strong className="text-white">{telemetry.level}</strong> · {telemetry.rankTitle}
              </span>
              <span className="text-sky-300 font-semibold">{telemetry.activeHelicopterName}</span>
              <span className="text-emerald-400 font-bold">
                ${telemetry.money.toLocaleString('pt-BR')}
              </span>
              <span className="text-amber-300">
                {telemetry.unlockedAchievements.length}/{ACHIEVEMENT_CATALOG.length} Medalhas
              </span>
            </div>
          ) : (
            <p className="mt-3.5 text-slate-300 text-xs sm:text-sm leading-relaxed">
              Opere transporte VIP, combate a incêndios, patrulha policial com holofote e resgates
              com guincho sobre a cidade, a montanha nevada e a plataforma petrolífera.
            </p>
          )}

          {/* Primary Launch Button */}
          <div className="mt-5 flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={onStart}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-500 active:bg-red-700 text-white font-display font-bold text-sm sm:text-base tracking-wider rounded-lg shadow-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>{hasCareer ? 'CONTINUAR CARREIRA' : 'DECOLAR'}</span>
            </button>

            <button
              type="button"
              onClick={onOpenStats}
              className="flex items-center justify-center gap-1.5 px-3.5 py-3 bg-slate-900/80 hover:bg-slate-800 border border-slate-700/80 text-slate-200 hover:text-amber-200 font-display font-bold text-xs tracking-wider rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              <Trophy className="w-3.5 h-3.5 text-amber-300" />
              <span>ESTATÍSTICAS &amp; CONQUISTAS</span>
            </button>
          </div>

          {/* Discreet Reset Career Row with Two-Step Confirmation */}
          <div className="mt-3.5 pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono-tech">
            <span className="text-slate-400">
              WASD Voar · Espaço/Shift Altitude · J Serviço · Tab Mapa
            </span>

            {hasCareer &&
              (confirmReset ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-red-300">Zerar tudo?</span>
                  <button
                    type="button"
                    onClick={handleConfirmReset}
                    className="px-2 py-0.5 rounded bg-red-600 hover:bg-red-500 text-white font-bold cursor-pointer"
                  >
                    Confirmar
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmReset(false)}
                    className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmReset(true)}
                  className="flex items-center gap-1 text-slate-400 hover:text-red-400 transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Resetar Carreira</span>
                </button>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
