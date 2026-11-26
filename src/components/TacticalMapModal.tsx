import { useEffect, useRef, useState } from 'react';
import { Compass, Navigation, X } from 'lucide-react';
import { DAM_ROTATION_Y, DAM_X, DAM_Z, SKI_BASE_POS, SNOW_PEAK_POS } from '../game/WorldData';
import type { HelipadData, MinimapStaticData, TelemetryState } from '../game/types';

interface TacticalMapModalProps {
  staticData: MinimapStaticData | null;
  telemetry: TelemetryState;
  onClose: () => void;
}

// World bounds framing the entire 2x 5-biome Mega Island, all 3 far offshore Oil Rigs, and open-sea perimeter
const WORLD_MIN_X = -3350;
const WORLD_MAX_X = 3450;
const WORLD_MIN_Z = -2850;
const WORLD_MAX_Z = 2700;

function formatDistance(meters: number): string {
  const m = Math.max(0, Math.round(meters));
  if (m >= 1000) {
    return `${(m / 1000).toFixed(2)} km`;
  }
  return `${m}m`;
}

function getShortPadLabel(pad: HelipadData): string {
  if (pad.isBase) return 'Base Aérea HQ';
  return pad.name
    .replace('Hospital Metropolitano', 'Hospital')
    .replace('Plataforma Oceânica Alpha', 'Oil Rig Alpha')
    .replace('Plataforma Oceânica Bravo', 'Oil Rig Bravo')
    .replace('Plataforma Oceânica Charlie', 'Oil Rig Charlie')
    .replace('Pine Peak (Cume Nevado)', 'Pine Peak')
    .replace('Torre Apex Financeira', 'Apex')
    .replace('Torre Central', 'Central')
    .replace('Torre do Porto', 'Porto')
    .replace('Plaza do Parque', 'Parque')
    .replace('Centro Executivo Sul', 'Sul')
    .replace('Torre Zenith', 'Zenith')
    .replace('Torre Atlântico', 'Atlântico')
    .replace('Torre Metrópole', 'Metrópole')
    .replace('Mirante da Represa', 'Represa')
    .replace('Fazenda Vale Verde', 'Fazenda')
    .replace('Estação Solar Deserto', 'Usina Solar');
}

function getPadLabelOffset(pad: HelipadData): { dx: number; dy: number; align: CanvasTextAlign } {
  switch (pad.id) {
    case 'pad_airbase':
      return { dx: -11, dy: 12, align: 'right' };
    case 'pad_b_metro_hospital':
      return { dx: -11, dy: 0, align: 'right' };
    case 'pad_b_central_tower':
      return { dx: 10, dy: -8, align: 'left' };
    case 'pad_b_harbor_tower':
      return { dx: -11, dy: -8, align: 'right' };
    case 'pad_b_park_plaza':
      return { dx: 0, dy: -13, align: 'center' };
    case 'pad_b_apex_tower':
      return { dx: 10, dy: 4, align: 'left' };
    case 'pad_b_south_hub':
      return { dx: 0, dy: 14, align: 'center' };
    case 'pad_b_zenith_tower':
      return { dx: 10, dy: -12, align: 'left' };
    case 'pad_b_atlantic_tower':
      return { dx: -10, dy: 11, align: 'right' };
    case 'pad_b_metropole_tower':
      return { dx: 10, dy: 12, align: 'left' };
    case 'pad_dam':
      return { dx: 0, dy: 14, align: 'center' };
    case 'pad_forest_base':
      return { dx: 10, dy: 2, align: 'left' };
    case 'pad_farm_verde':
      return { dx: 0, dy: 14, align: 'center' };
    case 'pad_pine_peak':
      return { dx: 10, dy: -8, align: 'left' };
    case 'pad_ski_base':
      return { dx: -10, dy: 4, align: 'right' };
    case 'pad_desert_canyon':
      return { dx: -10, dy: 10, align: 'right' };
    case 'pad_desert_solar':
      return { dx: 10, dy: 12, align: 'left' };
    case 'pad_beach_sol':
      return { dx: 0, dy: -14, align: 'center' };
    case 'pad_oilrig':
    case 'pad_oilrig_bravo':
    case 'pad_oilrig_charlie':
      return { dx: 0, dy: 17, align: 'center' };
    default:
      return { dx: 0, dy: -13, align: 'center' };
  }
}

export function TacticalMapModal({ staticData, telemetry, onClose }: TacticalMapModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [canvasSize, setCanvasSize] = useState<{ w: number; h: number }>({ w: 760, h: 460 });
  const [pulsePhase, setPulsePhase] = useState(true);

  useEffect(() => {
    const id = window.setInterval(() => {
      setPulsePhase((p) => !p);
    }, 340);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 100 && rect.height > 100) {
        setCanvasSize({ w: Math.round(rect.width), h: Math.round(rect.height) });
      }
    };

    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Determine primary active objective for route line & header summary
  const activeObjective = (() => {
    if (telemetry.activeFire) {
      return {
        kind: 'fire' as const,
        label: `${telemetry.activeFire.title} · ${telemetry.activeFire.locationLabel}`,
        x: telemetry.activeFire.x,
        z: telemetry.activeFire.z,
        distance: telemetry.activeFire.distanceMeters,
        color: '#f97316',
        badgeText: 'INCÊNDIO',
      };
    }
    if (telemetry.activePursuit) {
      return {
        kind: 'pursuit' as const,
        label: `${telemetry.activePursuit.title} · ${telemetry.activePursuit.districtLabel}`,
        x: telemetry.activePursuit.x,
        z: telemetry.activePursuit.z,
        distance: telemetry.activePursuit.distanceMeters,
        color: '#3b82f6',
        badgeText: 'PERSEGUIÇÃO',
      };
    }
    if (telemetry.activeSlingCargo) {
      const cargo = telemetry.activeSlingCargo;
      const isCarrying = cargo.phase === 'CARRYING';
      return {
        kind: 'sling' as const,
        label: isCarrying
          ? `Entregar ${cargo.cargoLabel} → ${cargo.dropLabel}`
          : `Coletar ${cargo.cargoLabel} · ${cargo.pickupLabel}`,
        x: isCarrying ? cargo.dropX : cargo.cargoX,
        z: isCarrying ? cargo.dropZ : cargo.cargoZ,
        distance: cargo.distanceMeters,
        color: isCarrying ? '#34d399' : '#facc15',
        badgeText: isCarrying ? 'ENTREGAR CARGA' : 'COLETAR CARGA',
      };
    }
    if (telemetry.activeWinchRescue && !telemetry.activeWinchRescue.patientOnboard) {
      return {
        kind: 'winch' as const,
        label: `${telemetry.activeWinchRescue.title} · ${telemetry.activeWinchRescue.locationLabel}`,
        x: telemetry.activeWinchRescue.x,
        z: telemetry.activeWinchRescue.z,
        distance: telemetry.activeWinchRescue.distanceMeters,
        color: telemetry.activeWinchRescue.kind === 'sea' ? '#ef4444' : '#fb923c',
        badgeText: 'RESGATE GUINCHO',
      };
    }
    if (telemetry.activeDispatch && staticData) {
      const targetPad = staticData.helipads.find((p) => p.id === telemetry.activeDispatch?.targetPadId);
      if (targetPad) {
        return {
          kind: 'dispatch' as const,
          label: `${telemetry.activeDispatch.missionLabel} · ${targetPad.name}`,
          x: targetPad.x,
          z: targetPad.z,
          distance: telemetry.activeDispatch.distanceMeters,
          color: '#34d399',
          badgeText: 'DESTINO',
        };
      }
    }
    return null;
  })();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !staticData) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { w, h } = canvasSize;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }

    ctx.save();
    ctx.scale(dpr, dpr);

    // Uniform world -> screen projection (North-Up)
    const padding = 24;
    const worldW = WORLD_MAX_X - WORLD_MIN_X;
    const worldH = WORLD_MAX_Z - WORLD_MIN_Z;
    const scale = Math.min((w - padding * 2) / worldW, (h - padding * 2) / worldH);
    const worldCenterX = (WORLD_MIN_X + WORLD_MAX_X) * 0.5;
    const worldCenterZ = (WORLD_MIN_Z + WORLD_MAX_Z) * 0.5;

    const toScreenX = (wx: number) => w * 0.5 + (wx - worldCenterX) * scale;
    const toScreenY = (wz: number) => h * 0.5 + (wz - worldCenterZ) * scale;

    // 1. Deep ocean background gradient
    const oceanGrad = ctx.createRadialGradient(
      toScreenX(0),
      toScreenY(0),
      20,
      toScreenX(0),
      toScreenY(0),
      Math.max(w, h) * 0.72
    );
    oceanGrad.addColorStop(0, '#10466e');
    oceanGrad.addColorStop(0.55, '#0b3252');
    oceanGrad.addColorStop(1, '#071f36');
    ctx.fillStyle = oceanGrad;
    ctx.fillRect(0, 0, w, h);

    // 2. Subtle tactical coordinate grid (500m spacing for 2x Mega Map + Oil Rigs)
    ctx.strokeStyle = 'rgba(148, 210, 255, 0.08)';
    ctx.lineWidth = 1;
    for (let gx = -3500; gx <= 3500; gx += 500) {
      const sx = Math.round(toScreenX(gx)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, h);
      ctx.stroke();
    }
    for (let gz = -3000; gz <= 3000; gz += 500) {
      const sy = Math.round(toScreenY(gz)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, sy);
      ctx.lineTo(w, sy);
      ctx.stroke();
    }

    // 3. Island landmass + 5 Distinct Biomes clipped cleanly inside real coastline
    if (staticData.coastPolygon.length > 2) {
      const traceCoast = () => {
        ctx.beginPath();
        staticData.coastPolygon.forEach((pt, idx) => {
          const sx = toScreenX(pt.x);
          const sy = toScreenY(pt.z);
          if (idx === 0) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        });
        ctx.closePath();
      };

      // Shallow water coastal halo
      traceCoast();
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(9, 26 * scale);
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.14)';
      ctx.stroke();

      // Clip interior biome paints to island polygon
      ctx.save();
      traceCoast();
      ctx.fillStyle = '#3b7441';
      ctx.fill();
      ctx.clip();

      // 3A. Dense Eastern Forest (deep emerald green)
      const forest = staticData.forestRegion;
      ctx.beginPath();
      ctx.ellipse(
        toScreenX(forest.x),
        toScreenY(forest.z),
        forest.rx * 1.05 * scale,
        forest.rz * 1.05 * scale,
        0,
        0,
        Math.PI * 2
      );
      ctx.fillStyle = '#1f532c';
      ctx.fill();

      // 3A-2. Fazenda Vale Verde (Pasture + Golden Crop Rows inside South Forest)
      const farm = staticData.farmRegion;
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(
        toScreenX(farm.x),
        toScreenY(farm.z),
        farm.rx * scale,
        farm.rz * scale,
        0,
        0,
        Math.PI * 2
      );
      ctx.fillStyle = '#5e9039';
      ctx.fill();
      ctx.clip();
      ctx.fillStyle = '#d1a345';
      const fLeft = toScreenX(farm.x - farm.rx);
      const fW = farm.rx * 2 * scale;
      for (let row = -farm.rz; row <= farm.rz; row += 34) {
        ctx.fillRect(fLeft, toScreenY(farm.z + row), fW, Math.max(1.5, 13 * scale));
      }
      ctx.restore();

      // 3B. Desert & Canyon (South-West arid ochre + 9 red sandstone mesas + Solar Power Station)
      const desert = staticData.desertRegion;
      ctx.beginPath();
      ctx.ellipse(
        toScreenX(desert.x),
        toScreenY(desert.z),
        desert.rx * 1.05 * scale,
        desert.rz * 1.05 * scale,
        0,
        0,
        Math.PI * 2
      );
      ctx.fillStyle = '#c58344';
      ctx.fill();

      for (const mesa of staticData.desertMesas) {
        ctx.beginPath();
        ctx.ellipse(
          toScreenX(mesa.x),
          toScreenY(mesa.z),
          mesa.rx * scale,
          mesa.rz * scale,
          0,
          0,
          Math.PI * 2
        );
        ctx.fillStyle = '#9c4b2b';
        ctx.fill();
        ctx.lineWidth = 1.1;
        ctx.strokeStyle = '#d98a55';
        ctx.stroke();
      }

      // Solar Power Station (Usina Solar Deserto)
      const solar = staticData.solarStationPos;
      const solW = Math.max(10, 116 * scale);
      const solH = Math.max(7, 84 * scale);
      ctx.fillStyle = '#1e3a8a';
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.1;
      ctx.fillRect(toScreenX(solar.x) - solW * 0.5, toScreenY(solar.z) - solH * 0.5, solW, solH);
      ctx.strokeRect(toScreenX(solar.x) - solW * 0.5, toScreenY(solar.z) - solH * 0.5, solW, solH);

      // Wind Farm (Parque Eólico) turbines in the Desert
      ctx.strokeStyle = '#f8fafc';
      ctx.lineWidth = 1.1;
      for (const wt of staticData.windTurbines) {
        const wx = toScreenX(wt.x);
        const wy = toScreenY(wt.z);
        ctx.beginPath();
        ctx.moveTo(wx - 2.8, wy);
        ctx.lineTo(wx + 2.8, wy);
        ctx.moveTo(wx, wy - 2.8);
        ctx.lineTo(wx, wy + 2.8);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(wx, wy, 1.3, 0, Math.PI * 2);
        ctx.fillStyle = '#fde047';
        ctx.fill();
      }

      // 3C. Costa do Sol Golden Beach (South-East bay ONLY)
      const beach = staticData.beachRegion;
      ctx.beginPath();
      ctx.ellipse(
        toScreenX(beach.x),
        toScreenY(beach.z),
        beach.rx * 1.06 * scale,
        beach.rz * 1.15 * scale,
        -0.35,
        0,
        Math.PI * 2
      );
      ctx.fillStyle = '#dec07d';
      ctx.fill();

      // 4A. Two Sinuous Forest Rivers snaking to the ocean
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const river of staticData.rivers) {
        if (river.points.length < 2) continue;
        ctx.beginPath();
        river.points.forEach((pt, idx) => {
          const sx = toScreenX(pt.x);
          const sy = toScreenY(pt.z);
          if (idx === 0) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        });
        ctx.strokeStyle = '#22a6c4';
        ctx.lineWidth = Math.max(2.6, river.width * 1.25 * scale);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(125, 211, 252, 0.45)';
        ctx.lineWidth = Math.max(1, river.width * 0.4 * scale);
        ctx.stroke();
      }
      ctx.restore();

      // 4B. Interior Reservoir Lake & Concrete Dam inside Dense Forest
      const lake = staticData.lakeCenter;
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(
        toScreenX(lake.x),
        toScreenY(lake.z),
        lake.rx * scale,
        lake.rz * scale,
        0,
        0,
        Math.PI * 2
      );
      ctx.fillStyle = '#178ca6';
      ctx.fill();
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = '#7dd3fc';
      ctx.stroke();

      ctx.translate(toScreenX(DAM_X), toScreenY(DAM_Z));
      ctx.rotate(-DAM_ROTATION_Y);
      ctx.fillStyle = '#94a3b8';
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1;
      const damW = Math.max(10, 62 * scale);
      const damH = Math.max(3, 12 * scale);
      ctx.fillRect(-damW * 0.5, -damH * 0.5, damW, damH);
      ctx.strokeRect(-damW * 0.5, -damH * 0.5, damW, damH);
      ctx.restore();

      // 5. Snow Mountain Range (North alpine massif + 5 Peaks + Ski Lift Line)
      const snow = staticData.snowRegion;
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(
        toScreenX(snow.x),
        toScreenY(snow.z),
        snow.rx * 0.96 * scale,
        snow.rz * 0.94 * scale,
        0,
        0,
        Math.PI * 2
      );
      ctx.fillStyle = '#cce2f6';
      ctx.fill();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = '#93c5fd';
      ctx.stroke();

      for (const pk of staticData.snowPeaks) {
        ctx.beginPath();
        ctx.arc(toScreenX(pk.x), toScreenY(pk.z), pk.r * 0.54 * scale, 0, Math.PI * 2);
        ctx.fillStyle = '#f8fafc';
        ctx.fill();
      }

      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(51, 65, 85, 0.72)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(toScreenX(SKI_BASE_POS.x), toScreenY(SKI_BASE_POS.z));
      ctx.lineTo(toScreenX(SNOW_PEAK_POS.x), toScreenY(SNOW_PEAK_POS.z));
      ctx.stroke();
      ctx.setLineDash([]);

      // Summit Radar & Antenna Station on East Alpine Horn
      const rpk = staticData.radarPeakPos;
      const rx = toScreenX(rpk.x);
      const ry = toScreenY(rpk.z);
      ctx.beginPath();
      ctx.arc(rx, ry, 4.4, 0, Math.PI * 2);
      ctx.fillStyle = '#e0f2fe';
      ctx.fill();
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = '#dc2626';
      ctx.stroke();
      ctx.restore();

      // 6. Expanded Urban District Ground, 6x5 Avenue Grid, Central Park & 48 Building Blocks
      const ub = staticData.urbanBounds;
      ctx.fillStyle = '#3c4957';
      ctx.fillRect(
        toScreenX(ub.minX),
        toScreenY(ub.minZ),
        (ub.maxX - ub.minX) * scale,
        (ub.maxZ - ub.minZ) * scale
      );

      const p = staticData.parkRect;
      ctx.fillStyle = '#3d9946';
      ctx.fillRect(
        toScreenX(p.minX),
        toScreenY(p.minZ),
        (p.maxX - p.minX) * scale,
        (p.maxZ - p.minZ) * scale
      );
      ctx.strokeStyle = 'rgba(134, 239, 172, 0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(
        toScreenX(p.minX),
        toScreenY(p.minZ),
        (p.maxX - p.minX) * scale,
        (p.maxZ - p.minZ) * scale
      );

      // Arena Central Stadium inside Urban Park
      const stad = staticData.stadiumRect;
      ctx.beginPath();
      ctx.ellipse(
        toScreenX(stad.x),
        toScreenY(stad.z),
        Math.max(5.5, stad.rx * scale),
        Math.max(4.5, stad.rz * scale),
        0,
        0,
        Math.PI * 2
      );
      ctx.fillStyle = '#cbd5e1';
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#334155';
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(
        toScreenX(stad.x),
        toScreenY(stad.z),
        Math.max(3.4, stad.rx * 0.64 * scale),
        Math.max(2.6, stad.rz * 0.64 * scale),
        0,
        0,
        Math.PI * 2
      );
      ctx.fillStyle = '#22c55e';
      ctx.fill();

      // 2x West Port Industrial Quay & Moored Container Ships
      const port = staticData.portPos;
      ctx.fillStyle = '#64748b';
      ctx.fillRect(
        toScreenX(port.x - 63),
        toScreenY(port.z - 215),
        Math.max(8, 126 * scale),
        Math.max(22, 430 * scale)
      );

      ctx.lineCap = 'round';
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = Math.max(3.0, 11.5 * scale);
      for (const seg of staticData.roadSegments) {
        ctx.beginPath();
        ctx.moveTo(toScreenX(seg.x1), toScreenY(seg.z1));
        ctx.lineTo(toScreenX(seg.x2), toScreenY(seg.z2));
        ctx.stroke();
      }

      ctx.strokeStyle = 'rgba(250, 204, 21, 0.34)';
      ctx.lineWidth = 0.8;
      ctx.setLineDash([3, 3]);
      for (const seg of staticData.roadSegments) {
        ctx.beginPath();
        ctx.moveTo(toScreenX(seg.x1), toScreenY(seg.z1));
        ctx.lineTo(toScreenX(seg.x2), toScreenY(seg.z2));
        ctx.stroke();
      }
      ctx.setLineDash([]);

      ctx.fillStyle = '#8b9cb0';
      for (const b of staticData.cityBlocks) {
        ctx.fillRect(
          toScreenX(b.x - b.w * 0.5),
          toScreenY(b.z - b.d * 0.5),
          Math.max(1.5, b.w * scale),
          Math.max(1.5, b.d * scale)
        );
      }

      ctx.restore(); // End island clip

      // Varied Coastline Border Strokes (Beach sand ONLY at Costa do Sol; cliffs & concrete seawall elsewhere)
      const coastStrokeByBiome: Record<string, string> = {
        beach: '#e3c682',
        port: '#8b9aa8',
        snow: '#9bb6d1',
        desert: '#b05d38',
        forest: '#455952',
      };
      const pts = staticData.coastPolygon;
      ctx.lineWidth = Math.max(3, 10 * scale);
      ctx.lineCap = 'round';
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        ctx.beginPath();
        ctx.moveTo(toScreenX(a.x), toScreenY(a.z));
        ctx.lineTo(toScreenX(b.x), toScreenY(b.z));
        ctx.strokeStyle = coastStrokeByBiome[a.biome] ?? '#64748b';
        ctx.stroke();
      }
    }

    // 6B. Costa do Sol Wooden Piers (2), Coastal Resort Hotels (2) & Lighthouse
    ctx.strokeStyle = '#c48f56';
    ctx.lineWidth = Math.max(2.4, 10 * scale);
    ctx.lineCap = 'round';
    for (const pier of staticData.beachPiers) {
      ctx.beginPath();
      ctx.moveTo(toScreenX(pier.x1), toScreenY(pier.z1));
      ctx.lineTo(toScreenX(pier.x2), toScreenY(pier.z2));
      ctx.stroke();
    }

    // 2 Resort Hotels + Turquoise Pools
    for (const res of staticData.resortPositions) {
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(toScreenX(res.x) - 4.5, toScreenY(res.z) - 3, 9, 6);
      ctx.fillStyle = '#22d3ee';
      ctx.fillRect(toScreenX(res.x) - 2.5, toScreenY(res.z) + 3.8, 5, 2.8);
    }

    // Classic Red-and-White Striped Lighthouse with subtle seaward light wedge
    const lh = staticData.lighthousePos;
    const lhx = toScreenX(lh.x);
    const lhy = toScreenY(lh.z);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(lhx, lhy);
    ctx.arc(lhx, lhy, 14, 0.3, 1.05);
    ctx.closePath();
    ctx.fillStyle = 'rgba(254, 240, 138, 0.25)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(lhx, lhy, 3.8, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = '#dc2626';
    ctx.stroke();
    ctx.restore();

    // Subtle Biome Watermark Labels
    ctx.save();
    ctx.font = '700 8px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(15, 23, 42, 0.56)';
    ctx.fillText('CORDILHEIRA NEVADA', toScreenX(staticData.snowRegion.x - 10), toScreenY(staticData.snowRegion.z - 220));
    ctx.fillStyle = 'rgba(226, 232, 240, 0.48)';
    ctx.fillText('FLORESTA & RIOS', toScreenX(staticData.forestRegion.x + 220), toScreenY(staticData.forestRegion.z - 25));
    ctx.fillStyle = 'rgba(255, 247, 237, 0.58)';
    ctx.fillText('DESERTO & SOLAR', toScreenX(staticData.desertRegion.x - 40), toScreenY(staticData.desertRegion.z + 215));
    ctx.fillStyle = 'rgba(15, 23, 42, 0.58)';
    ctx.fillText('COSTA DO SOL', toScreenX(staticData.beachRegion.x - 10), toScreenY(staticData.beachRegion.z + 120));
    ctx.restore();

    // 7. All 3 Far Offshore Oil Rig Platforms (Alpha SE, Bravo NE, Charlie W/SW — >1.5 km offshore)
    for (const rig of staticData.oilRigs) {
      ctx.save();
      ctx.translate(toScreenX(rig.x), toScreenY(rig.z));
      const rigW = Math.max(15, 72 * scale);
      const rigH = Math.max(12, 58 * scale);
      ctx.fillStyle = '#334155';
      ctx.strokeStyle = '#fb923c';
      ctx.lineWidth = 1.8;
      ctx.fillRect(-rigW * 0.5, -rigH * 0.5, rigW, rigH);
      ctx.strokeRect(-rigW * 0.5, -rigH * 0.5, rigW, rigH);
      // Glowing Gas Flare beacon
      ctx.beginPath();
      ctx.arc(rigW * 0.36, -rigH * 0.32, 4.2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(251, 146, 60, 0.36)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(rigW * 0.36, -rigH * 0.32, 2.2, 0, Math.PI * 2);
      ctx.fillStyle = '#fde047';
      ctx.fill();
      ctx.font = '700 7.5px "JetBrains Mono", monospace';
      ctx.fillStyle = 'rgba(253, 186, 116, 0.85)';
      ctx.textAlign = 'center';
      ctx.fillText('ALTO-MAR', 0, -rigH * 0.5 - 7);
      ctx.restore();
    }

    // 8. Dashed Route Line from Player Helicopter to Active Objective + Midpoint Distance Pill
    const heliX = toScreenX(telemetry.x);
    const heliY = toScreenY(telemetry.z);

    if (activeObjective) {
      const targetX = toScreenX(activeObjective.x);
      const targetY = toScreenY(activeObjective.z);

      ctx.save();
      ctx.setLineDash([7, 5]);
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = activeObjective.color;
      ctx.beginPath();
      ctx.moveTo(heliX, heliY);
      ctx.lineTo(targetX, targetY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Distance pill near midpoint (offset slightly if short)
      const distScreen = Math.hypot(targetX - heliX, targetY - heliY);
      if (distScreen > 34) {
        const midX = (heliX + targetX) * 0.5;
        const midY = (heliY + targetY) * 0.5;
        const distLabel = formatDistance(activeObjective.distance);
        ctx.font = '700 10px "JetBrains Mono", monospace';
        const textW = ctx.measureText(distLabel).width;
        const boxW = textW + 12;
        const boxH = 17;

        ctx.fillStyle = 'rgba(7, 15, 28, 0.9)';
        ctx.strokeStyle = activeObjective.color;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.roundRect(midX - boxW * 0.5, midY - boxH * 0.5, boxW, boxH, 4);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#f8fafc';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(distLabel, midX, midY + 0.5);
      }
      ctx.restore();
    }

    // 9. All Helipads + Crisp Readable Labels
    const activeTargetPadId = telemetry.activeDispatch?.targetPadId ?? null;
    for (const pad of staticData.helipads) {
      const px = toScreenX(pad.x);
      const py = toScreenY(pad.z);
      const isTarget = pad.id === activeTargetPadId;

      if (isTarget) {
        ctx.beginPath();
        ctx.arc(px, py, pulsePhase ? 15 : 11, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(52, 211, 153, 0.28)';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#34d399';
        ctx.stroke();
      }

      const r = pad.isBase ? 8.5 : 6.8;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fillStyle =
        pad.biome === 'oilrig'
          ? '#1a3531'
          : pad.biome === 'snow'
            ? '#1c3b5e'
            : pad.biome === 'forest'
              ? '#14432a'
              : pad.biome === 'desert'
                ? '#5c2d16'
                : pad.biome === 'beach'
                  ? '#154d59'
                  : pad.biome === 'dam'
                    ? '#16384d'
                    : '#1e293b';
      ctx.fill();
      ctx.lineWidth = 1.7;
      ctx.strokeStyle = isTarget
        ? '#34d399'
        : pad.biome === 'oilrig'
          ? '#fb923c'
          : pad.biome === 'snow'
            ? '#7dd3fc'
            : pad.biome === 'forest'
              ? '#4ade80'
              : pad.biome === 'desert'
                ? '#f59e0b'
                : pad.biome === 'beach'
                  ? '#38bdf8'
                  : pad.biome === 'dam'
                    ? '#38bdf8'
                    : '#facc15';
      ctx.stroke();

      ctx.fillStyle = isTarget ? '#34d399' : pad.biome === 'snow' ? '#e0f2fe' : '#fde047';
      ctx.font = '700 8.5px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('H', px, py + 0.5);

      // Label pill with high contrast (show compact shortCode for dense urban towers unless active target)
      const { dx, dy, align } = getPadLabelOffset(pad);
      const isCompactUrban = pad.biome === 'urban' && !isTarget;
      const labelText = isCompactUrban
        ? pad.shortCode
        : `${pad.shortCode} · ${getShortPadLabel(pad)}`;
      ctx.font = isCompactUrban
        ? '600 8px "JetBrains Mono", monospace'
        : '600 9px "Inter", system-ui, sans-serif';
      const tw = ctx.measureText(labelText).width;
      const lx = px + dx;
      const ly = py + dy;
      const boxW = tw + 6;
      const boxH = isCompactUrban ? 12 : 13.5;
      const boxX = align === 'center' ? lx - boxW * 0.5 : align === 'right' ? lx - boxW : lx;
      const boxY = ly - boxH * 0.5;

      ctx.fillStyle = isTarget ? 'rgba(6, 78, 59, 0.9)' : 'rgba(9, 18, 32, 0.78)';
      ctx.strokeStyle = isTarget ? 'rgba(52, 211, 153, 0.85)' : 'rgba(100, 116, 139, 0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(boxX, boxY, boxW, boxH, 3);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = isTarget ? '#a7f3d0' : '#e2e8f0';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(labelText, boxX + 3, ly + 0.5);
    }

    // 10. Dynamic Active Mission Markers (Fire, Police Pursuit, Winch Rescue)
    if (telemetry.activeFire) {
      const fx = toScreenX(telemetry.activeFire.x);
      const fy = toScreenY(telemetry.activeFire.z);
      ctx.beginPath();
      ctx.arc(fx, fy, pulsePhase ? 16 : 11, 0, Math.PI * 2);
      ctx.fillStyle = pulsePhase ? 'rgba(239, 68, 68, 0.38)' : 'rgba(249, 115, 22, 0.24)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = pulsePhase ? '#ef4444' : '#fb923c';
      ctx.stroke();

      ctx.fillStyle = pulsePhase ? '#ef4444' : '#facc15';
      ctx.beginPath();
      ctx.moveTo(fx, fy - 8);
      ctx.lineTo(fx + 6, fy + 2);
      ctx.lineTo(fx, fy + 7);
      ctx.lineTo(fx - 6, fy + 2);
      ctx.closePath();
      ctx.fill();
    }

    if (telemetry.activePursuit) {
      const sx = toScreenX(telemetry.activePursuit.x);
      const sy = toScreenY(telemetry.activePursuit.z);
      ctx.beginPath();
      ctx.arc(sx, sy, pulsePhase ? 16 : 12, 0, Math.PI * 2);
      ctx.fillStyle = pulsePhase ? 'rgba(59, 130, 246, 0.36)' : 'rgba(239, 68, 68, 0.36)';
      ctx.fill();
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = pulsePhase ? '#3b82f6' : '#ef4444';
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(sx, sy, 5.2, 0, Math.PI * 2);
      ctx.fillStyle = pulsePhase ? '#ef4444' : '#60a5fa';
      ctx.fill();
    }

    if (telemetry.activeWinchRescue && !telemetry.activeWinchRescue.patientOnboard) {
      const rx = toScreenX(telemetry.activeWinchRescue.x);
      const ry = toScreenY(telemetry.activeWinchRescue.z);
      const flareCol = telemetry.activeWinchRescue.kind === 'sea' ? '#ef4444' : '#fb923c';
      ctx.beginPath();
      ctx.arc(rx, ry, pulsePhase ? 16 : 11, 0, Math.PI * 2);
      ctx.fillStyle =
        telemetry.activeWinchRescue.kind === 'sea'
          ? 'rgba(239, 68, 68, 0.34)'
          : 'rgba(251, 146, 60, 0.34)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = flareCol;
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(rx - 5.5, ry - 1.8, 11, 3.6);
      ctx.fillRect(rx - 1.8, ry - 5.5, 3.6, 11);
    }

    if (telemetry.activeSlingCargo) {
      const cargo = telemetry.activeSlingCargo;
      const isCarrying = cargo.phase === 'CARRYING';
      const cxPos = toScreenX(isCarrying ? cargo.dropX : cargo.cargoX);
      const cyPos = toScreenY(isCarrying ? cargo.dropZ : cargo.cargoZ);
      ctx.beginPath();
      ctx.arc(cxPos, cyPos, pulsePhase ? 16 : 11, 0, Math.PI * 2);
      ctx.fillStyle = isCarrying ? 'rgba(52, 211, 153, 0.34)' : 'rgba(250, 204, 21, 0.36)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = isCarrying ? '#34d399' : '#facc15';
      ctx.stroke();

      ctx.fillStyle = isCarrying ? '#34d399' : '#facc15';
      ctx.fillRect(cxPos - 4.5, cyPos - 4.5, 9, 9);
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1.4;
      ctx.strokeRect(cxPos - 4.5, cyPos - 4.5, 9, 9);
    }

    // 10B. Autonomous AI Air Traffic Helicopters (discreet cyan/white directional triangles)
    for (const ai of telemetry.aiHelicopters) {
      const ax = toScreenX(ai.x);
      const ay = toScreenY(ai.z);

      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(-ai.yawRad);

      ctx.fillStyle = ai.state === 'PARKED' ? '#7dd3fc' : '#22d3ee';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(0, -6.8);
      ctx.lineTo(4.8, 5.2);
      ctx.lineTo(0, 2.5);
      ctx.lineTo(-4.8, 5.2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // 11. Player Helicopter Real-Time Position & Heading Chevron
    ctx.save();
    ctx.translate(heliX, heliY);
    // Forward in 3D world is (-sin(yaw), -cos(yaw)); on North-Up canvas (-Z is Up), rotate by -yawRad
    ctx.rotate(-telemetry.yawRad);

    // Subtle forward heading cone
    const coneGrad = ctx.createLinearGradient(0, -4, 0, -34);
    coneGrad.addColorStop(0, 'rgba(250, 204, 21, 0.34)');
    coneGrad.addColorStop(1, 'rgba(250, 204, 21, 0)');
    ctx.fillStyle = coneGrad;
    ctx.beginPath();
    ctx.moveTo(0, -3);
    ctx.lineTo(-12, -34);
    ctx.lineTo(12, -34);
    ctx.closePath();
    ctx.fill();

    // Helicopter chevron icon
    ctx.fillStyle = '#ef4444';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(0, -9.5);
    ctx.lineTo(7, 7);
    ctx.lineTo(0, 3.4);
    ctx.lineTo(-7, 7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // 12. Subtle North-Up Compass Rose (top-left) & Scale Bar (bottom-left)
    ctx.save();
    const compX = 28;
    const compY = 28;
    ctx.beginPath();
    ctx.arc(compX, compY, 16, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(9, 18, 32, 0.72)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#f87171';
    ctx.font = '700 9px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', compX, compY - 9);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 8px "JetBrains Mono", monospace';
    ctx.fillText('S', compX, compY + 9.5);
    ctx.fillText('L', compX + 9.5, compY + 0.5);
    ctx.fillText('O', compX - 9.5, compY + 0.5);
    ctx.restore();

    // Scale bar (1 km reference for 2x Mega World + 3 far Oil Rigs)
    const barPx = Math.max(44, 1000 * scale);
    ctx.save();
    ctx.fillStyle = 'rgba(9, 18, 32, 0.72)';
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(12, h - 30, barPx + 22, 18, 4);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(20, h - 18);
    ctx.lineTo(20, h - 22);
    ctx.moveTo(20, h - 18);
    ctx.lineTo(20 + barPx, h - 18);
    ctx.lineTo(20 + barPx, h - 22);
    ctx.stroke();

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '600 8.5px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('1 km', 20 + barPx * 0.5, h - 22);
    ctx.restore();

    ctx.restore();
  }, [
    staticData,
    canvasSize,
    telemetry.x,
    telemetry.z,
    telemetry.yawRad,
    telemetry.activeDispatch?.targetPadId,
    telemetry.activeDispatch?.distanceMeters,
    telemetry.activeFire?.id,
    telemetry.activeFire?.distanceMeters,
    telemetry.activePursuit?.x,
    telemetry.activePursuit?.z,
    telemetry.activePursuit?.distanceMeters,
    telemetry.activeWinchRescue?.id,
    telemetry.activeWinchRescue?.patientOnboard,
    telemetry.activeWinchRescue?.distanceMeters,
    telemetry.activeSlingCargo?.id,
    telemetry.activeSlingCargo?.phase,
    telemetry.activeSlingCargo?.cargoX,
    telemetry.activeSlingCargo?.cargoZ,
    telemetry.activeSlingCargo?.distanceMeters,
    telemetry.aiHelicopters,
    activeObjective,
    pulsePhase,
  ]);

  const headingStr = String(telemetry.headingDeg).padStart(3, '0');

  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center bg-slate-950/55 backdrop-blur-[2px] p-3 sm:p-5 select-none"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Mapa Tático Completo da Ilha"
    >
      <div
        className="bg-[#08111e]/92 backdrop-blur-md border border-slate-700/80 rounded-xl shadow-2xl w-full max-w-[840px] max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div className="px-3.5 py-2.5 border-b border-slate-800/90 flex flex-wrap items-center justify-between gap-2 bg-slate-950/70">
          <div className="flex items-center gap-2 min-w-0">
            <Compass className="w-4 h-4 text-sky-400 shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="font-display font-bold text-sm sm:text-base tracking-wide text-slate-50 truncate">
                  MAPA TÁTICO COMPLETO
                </h2>
                <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/40 text-[9px] font-mono-tech font-bold text-emerald-300">
                  AO VIVO
                </span>
              </div>
              <div className="text-[10px] font-mono-tech text-slate-400 truncate">
                {telemetry.companyName} · HDG {headingStr}° · ALT {telemetry.altitudeFeet} FT ·{' '}
                {telemetry.speedKnots} KTS · {telemetry.gameTimeFormatted}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/90 hover:bg-slate-700 border border-slate-700 text-xs font-mono-tech text-slate-200 hover:text-white transition-colors cursor-pointer shrink-0"
          >
            <span>[Tab] Fechar Mapa</span>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Interactive High-DPI Tactical Map Canvas */}
        <div
          ref={containerRef}
          className="relative w-full h-[54vh] min-h-[300px] max-h-[540px] bg-[#071f36]"
        >
          <canvas
            ref={canvasRef}
            className="w-full h-full block"
            aria-label="Mapa tático completo da ilha, helipontos e objetivos"
          />

          {/* Active Objective Floating Banner (top-right inside map canvas) */}
          {activeObjective && (
            <div className="absolute top-2.5 right-2.5 bg-slate-950/82 backdrop-blur-sm border border-slate-700/80 rounded-lg px-2.5 py-1.5 max-w-[260px] shadow-md pointer-events-none">
              <div className="flex items-center justify-between gap-2 text-[10px] font-mono-tech">
                <span className="flex items-center gap-1 font-bold" style={{ color: activeObjective.color }}>
                  <Navigation className="w-3 h-3" />
                  {activeObjective.badgeText}
                </span>
                <span className="text-amber-300 font-bold">
                  {formatDistance(activeObjective.distance)}
                </span>
              </div>
              <div className="text-[11px] text-slate-200 font-medium truncate mt-0.5">
                {activeObjective.label}
              </div>
            </div>
          )}
        </div>

        {/* Footer Legend */}
        <div className="px-3.5 py-2 border-t border-slate-800/90 bg-slate-950/75 flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono-tech text-slate-300">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 bg-red-500 border border-white rotate-45" />
              Helicóptero
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block w-0 h-0 border-l-[4.5px] border-l-transparent border-r-[4.5px] border-r-transparent border-b-[8px] border-b-cyan-400"
              />
              Tráfego Aéreo
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-slate-800 border border-yellow-400" />
              Heliponto
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-900 border border-emerald-400" />
              Floresta
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-950 border border-amber-500" />
              Deserto
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-sky-900 border border-sky-300" />
              Neve
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-cyan-950 border border-sky-400" />
              Praia
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-sm bg-slate-700 border border-orange-400" />
              Oil Rig
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-orange-500" />
              Incêndio
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-blue-500" />
              Polícia
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500" />
              Guincho
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-xs bg-yellow-400 border border-slate-900" />
              Carga
            </span>
          </div>

          <span className="text-slate-400 shrink-0">
            {staticData?.helipads.length ?? 21} Helipontos · 5 Biomas · 3 Oil Rigs
          </span>
        </div>
      </div>
    </div>
  );
}
