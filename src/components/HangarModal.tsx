import { useEffect, useState, type FormEvent } from 'react';
import {
  Building2,
  Check,
  Droplets,
  Flame,
  Fuel,
  Gauge,
  Lock,
  Paintbrush,
  Shield,
  Sparkles,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import {
  FLEET_CATALOG,
  getHelicopterSpec,
  LIVERY_CATALOG,
  UPGRADE_CATALOG,
} from '../game/FleetData';
import type {
  HelicopterId,
  HelicopterSpec,
  LiveryId,
  TelemetryState,
  UpgradeId,
} from '../game/types';

interface HangarModalProps {
  telemetry: TelemetryState;
  onClose: () => void;
  onUpdateCompanyName: (name: string) => void;
  onPurchaseHelicopter: (id: HelicopterId) => void;
  onEquipHelicopter: (id: HelicopterId) => void;
  onPurchaseUpgrade: (id: UpgradeId) => void;
  onSelectLivery: (id: LiveryId) => void;
}

interface StatBarProps {
  label: string;
  value: number;
  barClass: string;
  icon: 'speed' | 'fuel' | 'water' | 'durability';
}

function StatBar({ label, value, barClass, icon }: StatBarProps) {
  const Icon =
    icon === 'speed'
      ? Gauge
      : icon === 'fuel'
        ? Fuel
        : icon === 'water'
          ? Droplets
          : Shield;

  return (
    <div>
      <div className="flex items-center justify-between text-[11px] mb-1">
        <span className="flex items-center gap-1.5 text-slate-400">
          <Icon className="w-3 h-3 text-slate-500 shrink-0" />
          <span>{label}</span>
        </span>
        <span className="font-mono-tech text-slate-200 font-semibold">{value}</span>
      </div>
      <div className="h-1.5 w-full bg-slate-800/95 rounded-sm overflow-hidden">
        <div
          className={`h-full ${barClass} origin-left transition-transform duration-200`}
          style={{ transform: `scaleX(${Math.max(0.05, Math.min(1, value / 100))})` }}
        />
      </div>
    </div>
  );
}

interface HeliCardProps {
  spec: HelicopterSpec;
  isUnlocked: boolean;
  isActive: boolean;
  canAfford: boolean;
  money: number;
  featured?: boolean;
  onPurchase: (id: HelicopterId) => void;
  onEquip: (id: HelicopterId) => void;
}

function HelicopterCard({
  spec,
  isUnlocked,
  isActive,
  canAfford,
  money,
  featured = false,
  onPurchase,
  onEquip,
}: HeliCardProps) {
  const missingMoney = Math.max(0, spec.price - money);

  return (
    <div
      className={`rounded-xl border p-4 flex flex-col justify-between transition-colors ${
        isActive
          ? 'bg-[#101c2e] border-emerald-500/75'
          : isUnlocked
            ? 'bg-[#0e1726] border-slate-700/90 hover:border-slate-500'
            : 'bg-[#0c1421] border-slate-800/90'
      }`}
    >
      <div>
        {/* Livery stripe + Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className="inline-flex h-3 w-7 rounded-sm overflow-hidden border border-slate-700 shrink-0"
                aria-hidden="true"
              >
                <span className="w-1/2 h-full" style={{ backgroundColor: spec.liveryPrimary }} />
                <span className="w-1/4 h-full" style={{ backgroundColor: spec.liverySecondary }} />
                <span className="w-1/4 h-full" style={{ backgroundColor: spec.liveryAccent }} />
              </span>
              <h3 className="font-display font-bold text-base tracking-wide text-slate-50 truncate">
                {spec.name}
              </h3>
              {spec.physics.hasIntegratedTank && (
                <Flame
                  className="w-3.5 h-3.5 text-orange-400 shrink-0"
                  aria-label="Tanque ventral integrado"
                />
              )}
              {spec.branch === 'flagship' && (
                <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" aria-label="Flagship" />
              )}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">{spec.category}</div>
          </div>

          {/* Clean status readout (no static pill spam) */}
          <div className="text-right shrink-0 font-mono-tech text-xs font-bold">
            {isActive ? (
              <span className="text-emerald-400">ATIVO</span>
            ) : isUnlocked ? (
              <span className="text-sky-300">ADQUIRIDO</span>
            ) : (
              <span className={canAfford ? 'text-amber-300' : 'text-slate-400'}>
                ${spec.price.toLocaleString('pt-BR')}
              </span>
            )}
          </div>
        </div>

        {/* Description & Perk */}
        <p className="text-xs text-slate-300 mt-2.5 leading-relaxed">{spec.tagline}</p>
        <div className="text-[11px] font-mono-tech text-amber-300/95 mt-1.5">
          {spec.perkSummary}
        </div>

        {/* 4 Attribute Bars */}
        <div
          className={`mt-3.5 pt-3 border-t border-slate-800/90 grid gap-2 ${
            featured ? 'grid-cols-2 sm:grid-cols-4 gap-x-5' : 'grid-cols-2 gap-x-4'
          }`}
        >
          <StatBar label="Velocidade" value={spec.stats.speed} barClass="bg-sky-400" icon="speed" />
          <StatBar
            label="Combustível"
            value={spec.stats.fuel}
            barClass="bg-amber-400"
            icon="fuel"
          />
          <StatBar
            label="Água"
            value={spec.stats.water}
            barClass="bg-cyan-400"
            icon="water"
          />
          <StatBar
            label="Resistência"
            value={spec.stats.durability}
            barClass="bg-emerald-400"
            icon="durability"
          />
        </div>
      </div>

      {/* Action Footer */}
      <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
        {isActive ? (
          <button
            type="button"
            disabled
            className="w-full py-2 px-3 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 font-display font-bold text-xs tracking-wider flex items-center justify-center gap-1.5 cursor-default"
          >
            <Check className="w-3.5 h-3.5" />
            EQUIPADO NA BASE
          </button>
        ) : isUnlocked ? (
          <button
            type="button"
            onClick={() => onEquip(spec.id)}
            className="w-full py-2 px-3 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-display font-bold text-xs tracking-wider transition-colors cursor-pointer"
          >
            EQUIPAR AERONAVE
          </button>
        ) : (
          <button
            type="button"
            disabled={!canAfford}
            onClick={() => onPurchase(spec.id)}
            className={`w-full py-2 px-3 rounded-lg font-display font-bold text-xs tracking-wider flex items-center justify-center gap-1.5 transition-colors ${
              canAfford
                ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 cursor-pointer'
                : 'bg-slate-800/90 border border-slate-700/80 text-slate-500 cursor-not-allowed'
            }`}
            title={
              canAfford
                ? `Comprar ${spec.name} por $${spec.price.toLocaleString('pt-BR')}`
                : `Faltam $${missingMoney.toLocaleString('pt-BR')}`
            }
          >
            {!canAfford && <Lock className="w-3.5 h-3.5" />}
            {canAfford
              ? `COMPRAR · $${spec.price.toLocaleString('pt-BR')}`
              : `FALTAM $${missingMoney.toLocaleString('pt-BR')}`}
          </button>
        )}
      </div>
    </div>
  );
}

export function HangarModal({
  telemetry,
  onClose,
  onUpdateCompanyName,
  onPurchaseHelicopter,
  onEquipHelicopter,
  onPurchaseUpgrade,
  onSelectLivery,
}: HangarModalProps) {
  const [activeTab, setActiveTab] = useState<'fleet' | 'workshop'>('fleet');
  const [companyDraft, setCompanyDraft] = useState(telemetry.companyName);
  const [savedFeedback, setSavedFeedback] = useState(false);

  useEffect(() => {
    setCompanyDraft(telemetry.companyName);
  }, [telemetry.companyName]);

  const handleSaveCompany = (e: FormEvent) => {
    e.preventDefault();
    onUpdateCompanyName(companyDraft);
    setSavedFeedback(true);
    window.setTimeout(() => setSavedFeedback(false), 1800);
  };

  const starter = getHelicopterSpec('mayfly');
  const wren = getHelicopterSpec('wren');
  const mako = getHelicopterSpec('mako');
  const chipmunk = getHelicopterSpec('chipmunk');
  const firekite = getHelicopterSpec('firekite');
  const resolute = getHelicopterSpec('resolute');

  const unlockedSet = new Set(telemetry.unlockedHelicopters);
  const ownedCount = telemetry.unlockedHelicopters.length;

  const renderCard = (spec: HelicopterSpec, featured = false) => (
    <HelicopterCard
      key={spec.id}
      spec={spec}
      isUnlocked={unlockedSet.has(spec.id)}
      isActive={telemetry.activeHelicopterId === spec.id}
      canAfford={telemetry.money >= spec.price}
      money={telemetry.money}
      featured={featured}
      onPurchase={onPurchaseHelicopter}
      onEquip={onEquipHelicopter}
    />
  );

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-[#060b14]/84 p-3 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-label="Hangar e Árvore de Frota"
    >
      <div className="bg-[#0B121E] border border-slate-700/90 rounded-2xl w-full max-w-6xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* === MODAL HEADER === */}
        <div className="px-5 py-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4 bg-[#09101b]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-slate-800/90 border border-slate-700 flex items-center justify-center text-amber-400 shrink-0">
              <Wrench className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-display font-bold text-xl tracking-wide text-slate-50">
                HANGAR &amp; ÁRVORE DE FROTA
              </h2>
              <div className="text-xs text-slate-400 font-mono-tech mt-0.5">
                Frota {ownedCount}/{FLEET_CATALOG.length} · Ativo:{' '}
                <strong className="text-emerald-300">{telemetry.activeHelicopterName}</strong> ·
                Nv.{telemetry.level} ({telemetry.rankTitle})
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            {/* Company Name Customization Form */}
            <form onSubmit={handleSaveCompany} className="flex items-center gap-2">
              <label className="sr-only" htmlFor="hangar-company-name">
                Nome da Empresa
              </label>
              <div className="flex items-center bg-[#0f1929] border border-slate-700 rounded-lg px-2.5 py-1.5 focus-within:border-amber-400">
                <Building2 className="w-3.5 h-3.5 text-slate-400 mr-2 shrink-0" />
                <input
                  id="hangar-company-name"
                  type="text"
                  maxLength={22}
                  value={companyDraft}
                  onChange={(e) => setCompanyDraft(e.target.value)}
                  placeholder="NOME DA EMPRESA"
                  className="bg-transparent text-xs font-display font-bold tracking-wider text-slate-100 uppercase outline-none w-36 sm:w-44 placeholder:text-slate-600"
                />
              </div>
              <button
                type="submit"
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-mono-tech text-slate-100 transition-colors cursor-pointer whitespace-nowrap"
              >
                {savedFeedback ? 'Salvo!' : 'Salvar Nome'}
              </button>
            </form>

            {/* Treasury */}
            <div className="pl-3 border-l border-slate-800 text-right">
              <div className="text-[10px] font-mono-tech text-slate-400 tracking-wider">CAIXA</div>
              <div className="font-mono-tech text-lg font-bold text-emerald-400 leading-tight">
                ${telemetry.money.toLocaleString('pt-BR')}
              </div>
            </div>

            {/* Close */}
            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-display font-bold text-xs tracking-wider transition-colors cursor-pointer whitespace-nowrap"
            >
              <X className="w-4 h-4" />
              VOLTAR [P]
            </button>
          </div>
        </div>

        {/* === SECTION TABS: FROTA vs OFICINA & PINTURA === */}
        <div className="px-5 pt-2.5 border-b border-slate-800 bg-[#0a1220] flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('fleet')}
            className={`px-4 py-2 rounded-t-lg text-xs font-display font-bold tracking-wider border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'fleet'
                ? 'border-amber-400 text-amber-300 bg-[#0B121E]'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            FROTA ({ownedCount}/{FLEET_CATALOG.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('workshop')}
            className={`px-4 py-2 rounded-t-lg text-xs font-display font-bold tracking-wider border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'workshop'
                ? 'border-sky-400 text-sky-300 bg-[#0B121E]'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Paintbrush className="w-3.5 h-3.5" />
            OFICINA &amp; PINTURA
          </button>
        </div>

        {/* === SCROLLABLE TAB BODY === */}
        {activeTab === 'fleet' ? (
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {/* TIER 1: STARTER */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-mono-tech tracking-widest text-slate-400 uppercase">
                  Nível Inicial · Aeronave de Entrada
                </span>
                <span className="text-[11px] text-slate-500">
                  Equipar troca o modelo 3D e os atributos imediatamente
                </span>
              </div>
              <div className="max-w-xl mx-auto">{renderCard(starter)}</div>
            </div>

            {/* Visual Branch Connector */}
            <div className="hidden md:flex flex-col items-center -my-2" aria-hidden="true">
              <div className="w-px h-4 bg-slate-700" />
              <div className="w-2/3 h-px bg-slate-700" />
              <div className="w-2/3 flex justify-between">
                <div className="w-px h-4 bg-slate-700" />
                <div className="w-px h-4 bg-slate-700" />
                <div className="w-px h-4 bg-slate-700" />
              </div>
            </div>

            {/* TIER 2: 3 SPECIALIZATION BRANCHES */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
              {/* Branch 1: Emergency */}
              <div className="space-y-2.5">
                <div className="border-b border-amber-500/40 pb-1.5 flex items-center justify-between">
                  <span className="font-display font-bold text-xs tracking-wider text-amber-300 uppercase">
                    Ramo Emergência
                  </span>
                  <span className="text-[10px] font-mono-tech text-slate-500">RESGATE / NEVE</span>
                </div>
                {renderCard(wren)}
              </div>

              {/* Branch 2: Transport */}
              <div className="space-y-2.5">
                <div className="border-b border-sky-500/40 pb-1.5 flex items-center justify-between">
                  <span className="font-display font-bold text-xs tracking-wider text-sky-300 uppercase">
                    Ramo Transporte
                  </span>
                  <span className="text-[10px] font-mono-tech text-slate-500">VIP / OIL RIG</span>
                </div>
                {renderCard(mako)}
              </div>

              {/* Branch 3: Utility & Heavy Firefighting */}
              <div className="space-y-2.5">
                <div className="border-b border-orange-500/40 pb-1.5 flex items-center justify-between">
                  <span className="font-display font-bold text-xs tracking-wider text-orange-300 uppercase">
                    Ramo Utilitário &amp; Bombeiro
                  </span>
                  <span className="text-[10px] font-mono-tech text-slate-500">CARGA / FOGO</span>
                </div>
                {renderCard(chipmunk)}
                <div className="flex justify-center" aria-hidden="true">
                  <div className="w-px h-4 bg-orange-500/45" />
                </div>
                {renderCard(firekite)}
              </div>
            </div>

            {/* Visual Connector to Flagship */}
            <div className="hidden md:flex flex-col items-center -my-2" aria-hidden="true">
              <div className="w-2/3 flex justify-between">
                <div className="w-px h-3 bg-slate-700" />
                <div className="w-px h-3 bg-slate-700" />
                <div className="w-px h-3 bg-slate-700" />
              </div>
              <div className="w-2/3 h-px bg-slate-700" />
              <div className="w-px h-4 bg-amber-500/60" />
            </div>

            {/* TIER 3: FLAGSHIP */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-mono-tech tracking-widest text-amber-300 uppercase">
                  Ápice da Frota · Flagship Multimissão
                </span>
                <span className="text-[11px] font-mono-tech text-slate-500">
                  Progresso salvo automaticamente neste navegador
                </span>
              </div>
              {renderCard(resolute, true)}
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            {/* WORKSHOP SECTION 1: FLEET-WIDE UPGRADES (Nv.1 -> Nv.3) */}
            <section>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div>
                  <h3 className="font-display font-bold text-sm tracking-wider text-slate-100 uppercase">
                    Melhorias de Engenharia da Frota
                  </h3>
                  <p className="text-xs text-slate-400">
                    Upgrades aplicados permanentemente a todos os helicópteros da {telemetry.companyName}.
                  </p>
                </div>
                <span className="text-[11px] font-mono-tech text-sky-300">
                  Nível Máximo: 3 por sistema
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {UPGRADE_CATALOG.map((upg) => {
                  const currentLv = telemetry.upgrades[upg.id] ?? 0;
                  const isMax = currentLv >= 3;
                  const nextCost = isMax ? 0 : upg.costs[currentLv];
                  const canAfford = !isMax && telemetry.money >= nextCost;
                  const missing = Math.max(0, nextCost - telemetry.money);
                  const UpgradeIcon =
                    upg.id === 'turbine' ? Zap : upg.id === 'aux_tank' ? Fuel : Shield;
                  const iconColor =
                    upg.id === 'turbine'
                      ? 'text-amber-300'
                      : upg.id === 'aux_tank'
                        ? 'text-sky-300'
                        : 'text-emerald-300';

                  return (
                    <div
                      key={upg.id}
                      className={`rounded-xl border p-4 flex flex-col justify-between ${
                        isMax
                          ? 'bg-[#101e2b] border-emerald-500/60'
                          : 'bg-[#0e1726] border-slate-700/85'
                      }`}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-lg bg-slate-800/90 border border-slate-700 flex items-center justify-center shrink-0">
                              <UpgradeIcon className={`w-4 h-4 ${iconColor}`} />
                            </div>
                            <div>
                              <h4 className="font-display font-bold text-sm text-slate-50">
                                {upg.name}
                              </h4>
                              <div className="text-[11px] text-slate-400">{upg.subtitle}</div>
                            </div>
                          </div>
                          <span
                            className={`font-mono-tech text-xs font-bold shrink-0 ${
                              isMax ? 'text-emerald-400' : 'text-amber-300'
                            }`}
                          >
                            Nv.{currentLv}/3
                          </span>
                        </div>

                        <p className="text-xs text-slate-300 mt-3 leading-relaxed">
                          {upg.description}
                        </p>

                        {/* 3-Step Level Progress Segments */}
                        <div className="mt-3.5 grid grid-cols-3 gap-1.5">
                          {[0, 1, 2].map((step) => (
                            <div
                              key={step}
                              className={`h-2 rounded-sm ${
                                step < currentLv ? 'bg-emerald-400' : 'bg-slate-800'
                              }`}
                            />
                          ))}
                        </div>

                        <div className="mt-2 space-y-1 text-[11px] font-mono-tech">
                          {upg.levelSummaries.map((summary, idx) => (
                            <div
                              key={summary}
                              className={`flex items-center justify-between ${
                                idx < currentLv
                                  ? 'text-emerald-300'
                                  : idx === currentLv
                                    ? 'text-slate-100 font-semibold'
                                    : 'text-slate-500'
                              }`}
                            >
                              <span>
                                Nv.{idx + 1}: {summary}
                              </span>
                              {idx < currentLv && <Check className="w-3 h-3 shrink-0" />}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="mt-4 pt-3 border-t border-slate-800/80">
                        {isMax ? (
                          <button
                            type="button"
                            disabled
                            className="w-full py-2 px-3 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 font-display font-bold text-xs tracking-wider flex items-center justify-center gap-1.5 cursor-default"
                          >
                            <Check className="w-3.5 h-3.5" />
                            NÍVEL MÁXIMO
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={!canAfford}
                            onClick={() => onPurchaseUpgrade(upg.id)}
                            className={`w-full py-2 px-3 rounded-lg font-display font-bold text-xs tracking-wider flex items-center justify-center gap-1.5 transition-colors ${
                              canAfford
                                ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 cursor-pointer'
                                : 'bg-slate-800/90 border border-slate-700/80 text-slate-500 cursor-not-allowed'
                            }`}
                          >
                            {!canAfford && <Lock className="w-3.5 h-3.5" />}
                            {canAfford
                              ? `MELHORAR NV.${currentLv + 1} · $${nextCost.toLocaleString('pt-BR')}`
                              : `FALTAM $${missing.toLocaleString('pt-BR')}`}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* WORKSHOP SECTION 2: PAINT LIVERY STUDIO */}
            <section className="pt-4 border-t border-slate-800/90">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div>
                  <h3 className="font-display font-bold text-sm tracking-wider text-slate-100 uppercase">
                    Cabine de Pintura Personalizada
                  </h3>
                  <p className="text-xs text-slate-400">
                    Escolha o esquema de pintura da fuselagem (atualiza o helicóptero 3D em tempo real).
                  </p>
                </div>
                <span className="text-[11px] font-mono-tech text-emerald-400">
                  Troca gratuita e instantânea
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                {LIVERY_CATALOG.map((scheme) => {
                  const isSelected = telemetry.liveryId === scheme.id;
                  const activeHeliSpec = getHelicopterSpec(telemetry.activeHelicopterId);
                  const swatch =
                    scheme.id === 'default'
                      ? [
                          activeHeliSpec.liveryPrimary,
                          activeHeliSpec.liverySecondary,
                          activeHeliSpec.liveryAccent,
                        ]
                      : scheme.swatch;

                  return (
                    <button
                      key={scheme.id}
                      type="button"
                      onClick={() => onSelectLivery(scheme.id)}
                      className={`text-left rounded-xl border p-3.5 transition-colors cursor-pointer flex flex-col justify-between ${
                        isSelected
                          ? 'bg-[#101f33] border-sky-400/80 ring-1 ring-sky-400/30'
                          : 'bg-[#0e1726] border-slate-700/80 hover:border-slate-500'
                      }`}
                    >
                      <div>
                        {/* 3-Color Livery Preview Bar */}
                        <div className="h-7 w-full rounded-md overflow-hidden border border-slate-700/80 flex mb-3">
                          <span className="w-1/2 h-full" style={{ backgroundColor: swatch[0] }} />
                          <span className="w-1/3 h-full" style={{ backgroundColor: swatch[1] }} />
                          <span className="w-1/6 h-full" style={{ backgroundColor: swatch[2] }} />
                        </div>

                        <div className="flex items-center justify-between gap-1.5">
                          <span className="font-display font-bold text-xs tracking-wide text-slate-50">
                            {scheme.name}
                          </span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-sky-400 shrink-0" />}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                          {scheme.description}
                        </p>
                      </div>

                      <div
                        className={`mt-3 text-[10px] font-mono-tech font-bold uppercase ${
                          isSelected ? 'text-sky-300' : 'text-slate-500'
                        }`}
                      >
                        {isSelected ? 'APLICADA NA AERONAVE' : 'CLIQUE PARA APLICAR'}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
