import { useEffect, useRef, useState } from 'react';
import type { MinimapStaticData, TelemetryState } from '../game/types';

interface MinimapProps {
  staticData: MinimapStaticData | null;
  telemetry: TelemetryState;
  onOpenFullMap?: () => void;
}

export function Minimap({ staticData, telemetry, onOpenFullMap }: MinimapProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [blinkPhase, setBlinkPhase] = useState(true);
  const hasBlinkingTarget =
    telemetry.activeFire !== null ||
    telemetry.activePursuit !== null ||
    telemetry.activeSlingCargo !== null ||
    (telemetry.activeWinchRescue !== null && !telemetry.activeWinchRescue.patientOnboard);

  useEffect(() => {
    if (!hasBlinkingTarget) return;
    const id = window.setInterval(() => {
      setBlinkPhase((prev) => !prev);
    }, 300);
    return () => window.clearInterval(id);
  }, [hasBlinkingTarget]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !staticData) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = 136;
    if (canvas.width !== size * dpr || canvas.height !== size * dpr) {
      canvas.width = size * dpr;
      canvas.height = size * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, size, size);

    const cx = size / 2;
    const cy = size / 2;
    const radius = size / 2 - 4;
    const scale = radius / 1850;

    // 1. Clip to circular radar aperture
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();

    // Ocean background
    ctx.fillStyle = '#0e3a5c';
    ctx.fillRect(0, 0, size, size);

    // Radar range rings
    ctx.strokeStyle = 'rgba(148, 210, 255, 0.14)';
    ctx.lineWidth = 1;
    for (const rFrac of [0.35, 0.68]) {
      ctx.beginPath();
      ctx.arc(cx, cy, radius * rFrac, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Transform world coordinates into Heading-Up radar space
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(telemetry.yawRad);
    ctx.scale(scale, scale);
    ctx.translate(-telemetry.x, -telemetry.z);

    // 2. Island landmass clipped cleanly + all 5 true biome regions
    if (staticData.coastPolygon.length > 2) {
      ctx.save();
      ctx.beginPath();
      staticData.coastPolygon.forEach((pt, idx) => {
        if (idx === 0) ctx.moveTo(pt.x, pt.z);
        else ctx.lineTo(pt.x, pt.z);
      });
      ctx.closePath();
      ctx.fillStyle = '#3d7942';
      ctx.fill();
      ctx.clip();

      // 2A. Dense Eastern Forest (deep green)
      const forest = staticData.forestRegion;
      ctx.beginPath();
      ctx.ellipse(forest.x, forest.z, forest.rx * 1.05, forest.rz * 1.05, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#20552e';
      ctx.fill();

      // 2A-2. Fazenda Vale Verde (Green/Gold agricultural crop zone inside South Forest)
      const farm = staticData.farmRegion;
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(farm.x, farm.z, farm.rx, farm.rz, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#62943b';
      ctx.fill();
      ctx.clip();
      ctx.fillStyle = '#cfa042';
      for (let row = -farm.rz; row <= farm.rz; row += 34) {
        ctx.fillRect(farm.x - farm.rx, farm.z + row, farm.rx * 2, 13);
      }
      ctx.restore();

      // 2B. Desert & Canyon (South-West arid ochre + red sandstone mesas)
      const desert = staticData.desertRegion;
      ctx.beginPath();
      ctx.ellipse(desert.x, desert.z, desert.rx * 1.04, desert.rz * 1.04, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#c88749';
      ctx.fill();
      ctx.fillStyle = '#9c4c2d';
      for (const m of staticData.desertMesas) {
        ctx.beginPath();
        ctx.ellipse(m.x, m.z, m.rx, m.rz, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // Desert Solar Power Station footprint
      const solar = staticData.solarStationPos;
      ctx.fillStyle = '#1e3a8a';
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 8;
      ctx.fillRect(solar.x - 58, solar.z - 42, 116, 84);
      ctx.strokeRect(solar.x - 58, solar.z - 42, 116, 84);

      // 2C. Costa do Sol Golden Beach (South-East coastal bay ONLY)
      const beach = staticData.beachRegion;
      ctx.beginPath();
      ctx.ellipse(beach.x, beach.z, beach.rx * 1.05, beach.rz * 1.15, -0.35, 0, Math.PI * 2);
      ctx.fillStyle = '#dec07d';
      ctx.fill();

      // 2D. Snow Mountain Range (North alpine massif + 12 peaks)
      const snow = staticData.snowRegion;
      ctx.beginPath();
      ctx.ellipse(snow.x, snow.z, snow.rx * 0.96, snow.rz * 0.94, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#cde2f5';
      ctx.fill();
      ctx.fillStyle = '#f8fafc';
      for (const pk of staticData.snowPeaks) {
        ctx.beginPath();
        ctx.arc(pk.x, pk.z, pk.r * 0.56, 0, Math.PI * 2);
        ctx.fill();
      }

      // 3A. Two Sinuous Forest Rivers snaking to the ocean
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const river of staticData.rivers) {
        if (river.points.length < 2) continue;
        ctx.beginPath();
        river.points.forEach((pt, idx) => {
          if (idx === 0) ctx.moveTo(pt.x, pt.z);
          else ctx.lineTo(pt.x, pt.z);
        });
        ctx.strokeStyle = '#22a6c4';
        ctx.lineWidth = Math.max(26, river.width * 1.35);
        ctx.stroke();
      }

      // 3B. Interior reservoir lake inside Dense Forest
      const lake = staticData.lakeCenter;
      ctx.beginPath();
      ctx.ellipse(lake.x, lake.z, lake.rx, lake.rz, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#1995ad';
      ctx.fill();
      ctx.lineWidth = 8;
      ctx.strokeStyle = '#7dd3fc';
      ctx.stroke();

      // 4. Expanded 2x Urban district footprint & Central Park
      const ub = staticData.urbanBounds;
      ctx.fillStyle = '#4e5d6c';
      ctx.fillRect(ub.minX, ub.minZ, ub.maxX - ub.minX, ub.maxZ - ub.minZ);

      const p = staticData.parkRect;
      ctx.fillStyle = '#44a446';
      ctx.fillRect(p.minX, p.minZ, p.maxX - p.minX, p.maxZ - p.minZ);

      // Arena Central Stadium inside Urban Park
      const stad = staticData.stadiumRect;
      ctx.beginPath();
      ctx.ellipse(stad.x, stad.z, stad.rx, stad.rz, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#cbd5e1';
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(stad.x, stad.z, stad.rx * 0.66, stad.rz * 0.66, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#22c55e';
      ctx.fill();

      // 2x West Port Industrial Quay
      const port = staticData.portPos;
      ctx.fillStyle = '#64748b';
      ctx.fillRect(port.x - 63, port.z - 215, 126, 430);

      // Desert Wind Farm turbines
      ctx.fillStyle = '#f8fafc';
      for (const wt of staticData.windTurbines) {
        ctx.beginPath();
        ctx.arc(wt.x, wt.z, 15, 0, Math.PI * 2);
        ctx.fill();
      }

      // Summit Radar Peak marker
      const rad = staticData.radarPeakPos;
      ctx.beginPath();
      ctx.arc(rad.x, rad.z, 24, 0, Math.PI * 2);
      ctx.fillStyle = '#e0f2fe';
      ctx.fill();
      ctx.lineWidth = 8;
      ctx.strokeStyle = '#ef4444';
      ctx.stroke();

      ctx.fillStyle = '#94a3b8';
      for (const b of staticData.cityBlocks) {
        ctx.fillRect(b.x - b.w / 2, b.z - b.d / 2, b.w, b.d);
      }
      ctx.restore();

      // Varied Coastline Edge Strokes (sand ONLY at Costa do Sol; gray seawall / rocky cliffs elsewhere)
      const coastStrokeByBiome: Record<string, string> = {
        beach: '#e3c682',
        port: '#8a99a8',
        snow: '#9db8d4',
        desert: '#b05d38',
        forest: '#455952',
      };
      const pts = staticData.coastPolygon;
      ctx.lineWidth = 22;
      ctx.lineCap = 'round';
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        ctx.beginPath();
        ctx.moveTo(a.x, a.z);
        ctx.lineTo(b.x, b.z);
        ctx.strokeStyle = coastStrokeByBiome[a.biome] ?? '#64748b';
        ctx.stroke();
      }
    }

    // 4A. Costa do Sol Wooden Piers (2) & Coastal Lighthouse
    ctx.strokeStyle = '#b8824e';
    ctx.lineWidth = 20;
    ctx.lineCap = 'round';
    for (const pier of staticData.beachPiers) {
      ctx.beginPath();
      ctx.moveTo(pier.x1, pier.z1);
      ctx.lineTo(pier.x2, pier.z2);
      ctx.stroke();
    }

    const lh = staticData.lighthousePos;
    ctx.beginPath();
    ctx.arc(lh.x, lh.z, 26, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 9;
    ctx.strokeStyle = '#dc2626';
    ctx.stroke();

    // 4B. All 3 Far Offshore Oil Rig Platforms (Alpha, Bravo, Charlie)
    for (const rig of staticData.oilRigs) {
      ctx.save();
      ctx.translate(rig.x, rig.z);
      ctx.fillStyle = '#334155';
      ctx.strokeStyle = '#fb923c';
      ctx.lineWidth = 12;
      ctx.fillRect(-58, -46, 116, 92);
      ctx.strokeRect(-58, -46, 116, 92);
      ctx.beginPath();
      ctx.arc(24, -14, 18, 0, Math.PI * 2);
      ctx.fillStyle = '#f97316';
      ctx.fill();
      ctx.restore();
    }

    // 5. All 21 Helipads (color-coded by biome, scaled clearly for 2x radar range)
    const activeTargetId = telemetry.activeDispatch?.targetPadId ?? null;

    for (const pad of staticData.helipads) {
      const isTarget = pad.id === activeTargetId;

      if (isTarget) {
        ctx.beginPath();
        ctx.arc(pad.x, pad.z, 76, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(52, 211, 153, 0.34)';
        ctx.fill();
        ctx.lineWidth = 13;
        ctx.strokeStyle = '#34d399';
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.arc(pad.x, pad.z, pad.isBase ? 44 : 35, 0, Math.PI * 2);
      ctx.fillStyle =
        pad.biome === 'oilrig'
          ? '#163b36'
          : pad.biome === 'snow'
            ? '#1e3a5f'
            : pad.biome === 'forest'
              ? '#14432a'
              : pad.biome === 'desert'
                ? '#5c2d16'
                : pad.biome === 'beach'
                  ? '#154d59'
                  : pad.isBase
                    ? '#1e293b'
                    : '#273242';
      ctx.fill();
      ctx.lineWidth = 10;
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
                  : '#facc15';
      ctx.stroke();

      ctx.save();
      ctx.translate(pad.x, pad.z);
      ctx.rotate(-telemetry.yawRad);
      ctx.fillStyle = isTarget ? '#34d399' : pad.biome === 'snow' ? '#e0f2fe' : '#fde047';
      ctx.font = 'bold 40px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('H', 0, 3);
      ctx.restore();
    }

    // 6. Active 3D Emergency Fire marker (blinking red/amber radar icon)
    const activeFire = telemetry.activeFire;
    if (activeFire) {
      const blink = blinkPhase;
      ctx.beginPath();
      ctx.arc(activeFire.x, activeFire.z, blink ? 52 : 34, 0, Math.PI * 2);
      ctx.fillStyle = blink ? 'rgba(239, 68, 68, 0.45)' : 'rgba(249, 115, 22, 0.25)';
      ctx.fill();
      ctx.lineWidth = 9;
      ctx.strokeStyle = blink ? '#ef4444' : '#fb923c';
      ctx.stroke();

      // Inner flame diamond
      ctx.save();
      ctx.translate(activeFire.x, activeFire.z);
      ctx.rotate(-telemetry.yawRad);
      ctx.fillStyle = blink ? '#ef4444' : '#facc15';
      ctx.beginPath();
      ctx.moveTo(0, -24);
      ctx.lineTo(17, 7);
      ctx.lineTo(0, 20);
      ctx.lineTo(-17, 7);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // 6B. Active Police Pursuit Suspect Car marker (blinking blue/red radar icon)
    const activePursuit = telemetry.activePursuit;
    if (activePursuit) {
      const blueOn = blinkPhase;
      ctx.beginPath();
      ctx.arc(activePursuit.x, activePursuit.z, blueOn ? 48 : 38, 0, Math.PI * 2);
      ctx.fillStyle = blueOn ? 'rgba(59, 130, 246, 0.42)' : 'rgba(239, 68, 68, 0.42)';
      ctx.fill();
      ctx.lineWidth = 9;
      ctx.strokeStyle = blueOn ? '#3b82f6' : '#ef4444';
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(activePursuit.x, activePursuit.z, 18, 0, Math.PI * 2);
      ctx.fillStyle = blueOn ? '#ef4444' : '#60a5fa';
      ctx.fill();
    }

    // 6C. Active Winch Rescue Distress Flare marker (Sea Red / Mountain Orange)
    const activeWinch = telemetry.activeWinchRescue;
    if (activeWinch && !activeWinch.patientOnboard) {
      const flareColor = activeWinch.kind === 'sea' ? '#ef4444' : '#fb923c';
      const flareFill =
        activeWinch.kind === 'sea'
          ? blinkPhase
            ? 'rgba(239, 68, 68, 0.45)'
            : 'rgba(239, 68, 68, 0.2)'
          : blinkPhase
            ? 'rgba(251, 146, 60, 0.45)'
            : 'rgba(251, 146, 60, 0.2)';
      ctx.beginPath();
      ctx.arc(activeWinch.x, activeWinch.z, blinkPhase ? 50 : 34, 0, Math.PI * 2);
      ctx.fillStyle = flareFill;
      ctx.fill();
      ctx.lineWidth = 9;
      ctx.strokeStyle = flareColor;
      ctx.stroke();

      ctx.save();
      ctx.translate(activeWinch.x, activeWinch.z);
      ctx.rotate(-telemetry.yawRad);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-17, -6, 34, 12);
      ctx.fillRect(-6, -17, 12, 34);
      ctx.restore();
    }

    // 6C-2. Active Heavy Cargo Sling Load marker (amber pickup crate / emerald-yellow drop target)
    const activeCargo = telemetry.activeSlingCargo;
    if (activeCargo) {
      const isCarrying = activeCargo.phase === 'CARRYING';
      const tx = isCarrying ? activeCargo.dropX : activeCargo.cargoX;
      const tz = isCarrying ? activeCargo.dropZ : activeCargo.cargoZ;
      ctx.beginPath();
      ctx.arc(tx, tz, blinkPhase ? 50 : 34, 0, Math.PI * 2);
      ctx.fillStyle = isCarrying
        ? blinkPhase
          ? 'rgba(52, 211, 153, 0.42)'
          : 'rgba(250, 204, 21, 0.24)'
        : blinkPhase
          ? 'rgba(250, 204, 21, 0.45)'
          : 'rgba(245, 158, 11, 0.22)';
      ctx.fill();
      ctx.lineWidth = 9;
      ctx.strokeStyle = isCarrying ? '#34d399' : '#facc15';
      ctx.stroke();

      ctx.save();
      ctx.translate(tx, tz);
      ctx.rotate(-telemetry.yawRad);
      ctx.fillStyle = isCarrying ? '#34d399' : '#facc15';
      ctx.fillRect(-15, -15, 30, 30);
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 5;
      ctx.strokeRect(-15, -15, 30, 30);
      ctx.restore();
    }

    // 6D. Autonomous AI Air Traffic Helicopters (discreet cyan/white directional triangles)
    for (const ai of telemetry.aiHelicopters) {
      ctx.save();
      ctx.translate(ai.x, ai.z);
      ctx.rotate(-ai.yawRad);
      ctx.fillStyle = ai.state === 'PARKED' ? '#94e2f8' : '#22d3ee';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 5.5;
      ctx.beginPath();
      ctx.moveTo(0, -28);
      ctx.lineTo(19, 19);
      ctx.lineTo(0, 9.5);
      ctx.lineTo(-19, 19);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore(); // End world-space transform

    // 7. Edge pointer arrow for off-radar active destination (fire, pursuit, winch, or helipad)
    const drawEdgeArrow = (targetX: number, targetZ: number, color: string) => {
      const dx = targetX - telemetry.x;
      const dz = targetZ - telemetry.z;
      const cosY = Math.cos(telemetry.yawRad);
      const sinY = Math.sin(telemetry.yawRad);
      const rx = dx * cosY - dz * sinY;
      const rz = dx * sinY + dz * cosY;
      const screenDist = Math.hypot(rx, rz) * scale;

      if (screenDist > radius - 14) {
        const ang = Math.atan2(rz, rx);
        const edgeX = cx + Math.cos(ang) * (radius - 10);
        const edgeY = cy + Math.sin(ang) * (radius - 10);

        ctx.save();
        ctx.translate(edgeX, edgeY);
        ctx.rotate(ang);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(7, 0);
        ctx.lineTo(-5, -5);
        ctx.lineTo(-5, 5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    };

    if (activeFire) {
      drawEdgeArrow(activeFire.x, activeFire.z, blinkPhase ? '#ef4444' : '#fb923c');
    } else if (activePursuit) {
      drawEdgeArrow(activePursuit.x, activePursuit.z, blinkPhase ? '#3b82f6' : '#ef4444');
    } else if (activeCargo) {
      const isCarrying = activeCargo.phase === 'CARRYING';
      drawEdgeArrow(
        isCarrying ? activeCargo.dropX : activeCargo.cargoX,
        isCarrying ? activeCargo.dropZ : activeCargo.cargoZ,
        isCarrying ? '#34d399' : '#facc15'
      );
    } else if (activeWinch && !activeWinch.patientOnboard) {
      drawEdgeArrow(
        activeWinch.x,
        activeWinch.z,
        activeWinch.kind === 'sea' ? '#ef4444' : '#fb923c'
      );
    } else if (activeTargetId) {
      const targetPad = staticData.helipads.find((h) => h.id === activeTargetId);
      if (targetPad) {
        drawEdgeArrow(targetPad.x, targetPad.z, '#34d399');
      }
    }

    // 7A. Discreet orange perimeter pips indicating bearing toward off-radar Oil Rigs (Alpha, Bravo, Charlie)
    for (const rig of staticData.oilRigs) {
      const dx = rig.x - telemetry.x;
      const dz = rig.z - telemetry.z;
      const cosY = Math.cos(telemetry.yawRad);
      const sinY = Math.sin(telemetry.yawRad);
      const rx = dx * cosY - dz * sinY;
      const rz = dx * sinY + dz * cosY;
      const screenDist = Math.hypot(rx, rz) * scale;
      if (screenDist > radius - 8) {
        const ang = Math.atan2(rz, rx);
        const edgeX = cx + Math.cos(ang) * (radius - 5);
        const edgeY = cy + Math.sin(ang) * (radius - 5);
        ctx.save();
        ctx.translate(edgeX, edgeY);
        ctx.rotate(ang);
        ctx.fillStyle = 'rgba(251, 146, 60, 0.85)';
        ctx.beginPath();
        ctx.moveTo(4, 0);
        ctx.lineTo(-3, -3);
        ctx.lineTo(-3, 3);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }

    // 8. Subtle radar crosshair ticks
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, cy - radius);
    ctx.lineTo(cx, cy - 10);
    ctx.moveTo(cx, cy + 10);
    ctx.lineTo(cx, cy + radius);
    ctx.moveTo(cx - radius, cy);
    ctx.lineTo(cx - 10, cy);
    ctx.moveTo(cx + 10, cy);
    ctx.lineTo(cx + radius, cy);
    ctx.stroke();

    // 9. Player helicopter chevron
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = '#ef4444';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(0, -7.5);
    ctx.lineTo(5.5, 5.8);
    ctx.lineTo(0, 2.8);
    ctx.lineTo(-5.5, 5.8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.restore(); // End circular clip

    // 10. Thin outer radar bezel & rotating N/L/S/O labels
    ctx.strokeStyle = 'rgba(100, 116, 139, 0.75)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 1, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(250, 204, 21, 0.6)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(cx, 1.5);
    ctx.lineTo(cx, 8);
    ctx.stroke();

    const cardinals = [
      { label: 'N', worldAngle: -Math.PI / 2, color: '#f87171' },
      { label: 'L', worldAngle: 0, color: '#cbd5e1' },
      { label: 'S', worldAngle: Math.PI / 2, color: '#cbd5e1' },
      { label: 'O', worldAngle: Math.PI, color: '#cbd5e1' },
    ];
    ctx.font = '700 9px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const c of cardinals) {
      const ang = c.worldAngle + telemetry.yawRad;
      const lx = cx + Math.cos(ang) * (radius - 9);
      const ly = cy + Math.sin(ang) * (radius - 9);
      ctx.fillStyle = c.color;
      ctx.fillText(c.label, lx, ly);
    }

    ctx.restore();
  }, [
    staticData,
    telemetry.x,
    telemetry.z,
    telemetry.yawRad,
    telemetry.activeDispatch?.targetPadId,
    telemetry.activeFire?.id,
    telemetry.activeFire?.intensityPercent,
    telemetry.activePursuit?.x,
    telemetry.activePursuit?.z,
    telemetry.activeWinchRescue?.id,
    telemetry.activeWinchRescue?.patientOnboard,
    telemetry.activeSlingCargo?.id,
    telemetry.activeSlingCargo?.phase,
    telemetry.activeSlingCargo?.cargoX,
    telemetry.activeSlingCargo?.cargoZ,
    telemetry.aiHelicopters,
    blinkPhase,
  ]);

  const headingStr = String(telemetry.headingDeg).padStart(3, '0');
  const radarBadge = telemetry.activeFire
    ? { label: 'FOGO', cls: 'text-red-400 font-bold' }
    : telemetry.activePursuit
      ? { label: 'POLÍCIA', cls: 'text-sky-400 font-bold' }
      : telemetry.activeSlingCargo
        ? {
            label: telemetry.activeSlingCargo.phase === 'CARRYING' ? 'ENTREGA' : 'CARGA',
            cls:
              telemetry.activeSlingCargo.phase === 'CARRYING'
                ? 'text-emerald-400 font-bold'
                : 'text-amber-300 font-bold',
          }
        : telemetry.activeWinchRescue
          ? telemetry.activeWinchRescue.patientOnboard
            ? { label: 'HOSPITAL', cls: 'text-emerald-400 font-bold' }
            : { label: 'GUINCHO', cls: 'text-orange-400 font-bold' }
          : { label: `${staticData?.helipads.length ?? 21} PADS`, cls: 'text-slate-400' };

  return (
    <button
      type="button"
      onClick={onOpenFullMap}
      tabIndex={-1}
      title="Abrir Mapa Tático Completo (Tecla Tab)"
      className="group flex flex-col items-center bg-slate-950/65 backdrop-blur-sm border border-slate-700/60 hover:border-sky-400/70 rounded-lg p-1.5 shadow-md transition-colors cursor-pointer text-left"
    >
      <div className="relative w-[116px] h-[116px] sm:w-[136px] sm:h-[136px]">
        <canvas
          ref={canvasRef}
          className="w-full h-full block"
          aria-label="Minimapa radar da ilha costeira"
        />
      </div>
      <div className="mt-1 w-full flex items-center justify-between px-1 text-[10px] font-mono-tech text-slate-300 leading-none">
        <span className="text-slate-400">HDG</span>
        <span className="text-amber-300 font-bold">{headingStr}°</span>
        <span className={radarBadge.cls}>{radarBadge.label}</span>
      </div>
      <div className="mt-1 w-full text-center text-[9px] font-mono-tech text-slate-400 group-hover:text-sky-300 transition-colors leading-none">
        [Tab] Mapa Completo
      </div>
    </button>
  );
}
