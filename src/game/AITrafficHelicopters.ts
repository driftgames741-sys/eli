import * as THREE from 'three';
import {
  createAIHelicopterRig,
  type AIHelicopterRig,
  type AIHelicopterVariant,
} from './HelicopterModel';
import { getSurfaceHeightAt } from './WorldData';
import type { AIHelicopterTelemetry, AIHeliFlightState, HelipadData, WeatherMode } from './types';

const _aiCullSphere = new THREE.Sphere();

function normalizeAngle(rad: number): number {
  let a = rad;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

interface AIAgent {
  id: string;
  callsign: string;
  accentColor: string;
  rig: AIHelicopterRig;
  state: AIHeliFlightState;

  pos: THREE.Vector3;
  vel: THREE.Vector3;
  yaw: number;
  yawRate: number;
  pitch: number;
  roll: number;
  rotorRpm: number;

  currentPadId: string | null;
  targetPadId: string | null;
  cruiseAlt: number;
  cruiseSpeed: number;
  speedMin: number;
  speedMax: number;
  parkTimer: number;
  strobePhaseOffset: number;
}

/**
 * Manages 2 autonomous low-poly AI helicopters operating independently across all island
 * helipads (urban towers, hospital, reservoir dam, Snow Mountain, and Offshore Oil Rig).
 * Features a 4-state flight machine (TAKING_OFF -> CRUISING -> LANDING -> PARKED),
 * mutual helipad reservation, player-approach auto-clearance, and real-time radar telemetry.
 */
export class AITrafficHelicopters {
  public readonly root = new THREE.Group();

  private agents: AIAgent[] = [];
  private padPool: HelipadData[];
  private padMap = new Map<string, HelipadData>();
  private telemetryCache: AIHelicopterTelemetry[] = [];

  constructor(helipads: HelipadData[], maxAnisotropy: number) {
    // Keep player's home Airbase HQ free; AI helicopters use all 8 other pads across all biomes
    this.padPool = helipads.filter((p) => !p.isBase);
    if (this.padPool.length < 2) {
      this.padPool = [...helipads];
    }
    for (const p of helipads) {
      this.padMap.set(p.id, p);
    }

    const specs: Array<{
      id: string;
      callsign: string;
      variant: AIHelicopterVariant;
      accentColor: string;
      speedMin: number;
      speedMax: number;
      strobeOffset: number;
    }> = [
      {
        id: 'ai_exec_01',
        callsign: 'EXEC-01',
        variant: 'executive_blue',
        accentColor: '#38bdf8',
        speedMin: 46,
        speedMax: 68,
        strobeOffset: 0.0,
      },
      {
        id: 'ai_press_02',
        callsign: 'NEWS-02',
        variant: 'press_yellow',
        accentColor: '#fde047',
        speedMin: 40,
        speedMax: 58,
        strobeOffset: 0.58,
      },
    ];

    // Spawn EXEC-01 already cruising mid-air so the sky feels alive immediately
    const startPad1 = this.padMap.get('pad_b_central_tower') ?? this.padPool[0];
    const destPad1 =
      this.padMap.get('pad_forest_base') ??
      this.padMap.get('pad_pine_peak') ??
      this.padPool.find((p) => p.id !== startPad1.id) ??
      startPad1;

    // Spawn NEWS-02 parked on a downtown skyscraper pad with a short initial dwell time
    const startPad2 =
      this.padMap.get('pad_b_park_plaza') ??
      this.padPool.find((p) => p.id !== startPad1.id && p.id !== destPad1.id) ??
      this.padPool[this.padPool.length - 1];

    specs.forEach((spec, idx) => {
      const rig = createAIHelicopterRig(maxAnisotropy, spec.variant);
      this.root.add(rig.root);

      const isFirst = idx === 0;
      const initCruiseAlt = this.rollCruiseAltitude(startPad1, destPad1);
      const initCruiseSpeed = spec.speedMin + Math.random() * (spec.speedMax - spec.speedMin);

      const pos = new THREE.Vector3();
      let yaw = 0;
      let state: AIHeliFlightState = 'PARKED';
      let currentPadId: string | null = null;
      let targetPadId: string | null = null;
      let parkTimer = 6 + Math.random() * 5;
      let rotorRpm = 0.36;

      if (isFirst) {
        // Place halfway between downtown and Pine Peak at safe cruising altitude
        const mx = THREE.MathUtils.lerp(startPad1.x, destPad1.x, 0.38);
        const mz = THREE.MathUtils.lerp(startPad1.z, destPad1.z, 0.38);
        pos.set(mx, initCruiseAlt, mz);
        yaw = Math.atan2(-(destPad1.x - mx), -(destPad1.z - mz));
        state = 'CRUISING';
        currentPadId = null;
        targetPadId = destPad1.id;
        parkTimer = 0;
        rotorRpm = 1.0;
      } else {
        pos.set(startPad2.x, startPad2.y, startPad2.z);
        yaw = 0.65;
        state = 'PARKED';
        currentPadId = startPad2.id;
        targetPadId = null;
      }

      const agent: AIAgent = {
        id: spec.id,
        callsign: spec.callsign,
        accentColor: spec.accentColor,
        rig,
        state,
        pos,
        vel: new THREE.Vector3(),
        yaw,
        yawRate: 0,
        pitch: 0,
        roll: 0,
        rotorRpm,
        currentPadId,
        targetPadId,
        cruiseAlt: initCruiseAlt,
        cruiseSpeed: initCruiseSpeed,
        speedMin: spec.speedMin,
        speedMax: spec.speedMax,
        parkTimer,
        strobePhaseOffset: spec.strobeOffset,
      };

      rig.root.position.copy(pos);
      rig.root.rotation.set(0, yaw, 0, 'YXZ');
      this.agents.push(agent);

      this.telemetryCache.push({
        id: agent.id,
        callsign: agent.callsign,
        x: agent.pos.x,
        y: agent.pos.y,
        z: agent.pos.z,
        yawRad: agent.yaw,
        state: agent.state,
        accentColor: agent.accentColor,
      });
    });
  }

  private rollCruiseAltitude(originPad: HelipadData | null, destPad: HelipadData): number {
    // Always safely above 198m pointed spire skyscrapers, 138m Pine Peak, and Summit Radar Station
    const baseClearance = Math.max(210, originPad ? originPad.y + 24 : 0, destPad.y + 24);
    return baseClearance + 14 + Math.random() * 44;
  }

  private pickNextDestination(
    agent: AIAgent,
    playerPos: THREE.Vector3,
    playerLandedPadId: string | null
  ): HelipadData {
    const blockedIds = new Set<string>();
    if (agent.currentPadId) blockedIds.add(agent.currentPadId);
    if (agent.targetPadId) blockedIds.add(agent.targetPadId);
    if (playerLandedPadId) blockedIds.add(playerLandedPadId);

    // Reserve pads currently occupied or targeted by the other AI helicopter
    for (const other of this.agents) {
      if (other.id === agent.id) continue;
      if (other.currentPadId) blockedIds.add(other.currentPadId);
      if (other.targetPadId) blockedIds.add(other.targetPadId);
    }

    // Prefer helipads far enough from the player's immediate landing zone
    let candidates = this.padPool.filter((p) => {
      if (blockedIds.has(p.id)) return false;
      const distPlayer = Math.hypot(p.x - playerPos.x, p.z - playerPos.z);
      return distPlayer > 44;
    });

    if (candidates.length === 0) {
      candidates = this.padPool.filter((p) => !blockedIds.has(p.id));
    }
    if (candidates.length === 0) {
      candidates = this.padPool;
    }

    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  private beginTakeoff(
    agent: AIAgent,
    playerPos: THREE.Vector3,
    playerLandedPadId: string | null
  ): void {
    const originPad = agent.currentPadId ? (this.padMap.get(agent.currentPadId) ?? null) : null;
    const nextPad = this.pickNextDestination(agent, playerPos, playerLandedPadId);
    agent.targetPadId = nextPad.id;
    agent.cruiseAlt = this.rollCruiseAltitude(originPad, nextPad);
    agent.cruiseSpeed = agent.speedMin + Math.random() * (agent.speedMax - agent.speedMin);
    agent.state = 'TAKING_OFF';
    agent.parkTimer = 0;
  }

  public update(
    elapsedSec: number,
    dt: number,
    nightFactor: number,
    duskFactor: number,
    playerPos: THREE.Vector3,
    playerLandedPadId: string | null,
    weather: WeatherMode = 'CLEAR',
    cameraPos?: THREE.Vector3,
    cameraFrustum?: THREE.Frustum
  ): void {
    const stormBoost = weather === 'STORM' ? 0.92 : weather === 'BLIZZARD' ? 0.74 : 0;
    for (let i = 0; i < this.agents.length; i++) {
      const a = this.agents[i];
      const other = this.agents[1 - i];

      if (a.state === 'PARKED') {
        this.stepParked(a, dt, playerPos, playerLandedPadId);
      } else if (a.state === 'TAKING_OFF') {
        this.stepTakingOff(a, dt);
      } else if (a.state === 'CRUISING') {
        this.stepCruising(a, other, dt);
      } else if (a.state === 'LANDING') {
        this.stepLanding(a, dt, playerPos, playerLandedPadId);
      }

      // O CONE: Always keep flight simulation & radar telemetry running, but pause visual rotor/strobe updates outside camera cone
      let inView = true;
      if (cameraFrustum) {
        _aiCullSphere.center.copy(a.pos);
        _aiCullSphere.radius = 18;
        inView =
          cameraFrustum.intersectsSphere(_aiCullSphere) ||
          (cameraPos !== undefined && cameraPos.distanceToSquared(a.pos) < 180 * 180);
      }
      a.rig.root.visible = inView;
      if (inView) {
        this.syncVisuals(a, elapsedSec, dt, nightFactor, duskFactor, stormBoost);
      } else {
        a.rig.root.position.copy(a.pos);
      }

      // Update pre-allocated telemetry snapshot entry
      const snap = this.telemetryCache[i];
      snap.x = a.pos.x;
      snap.y = a.pos.y;
      snap.z = a.pos.z;
      snap.yawRad = a.yaw;
      snap.state = a.state;
    }
  }

  private stepParked(
    a: AIAgent,
    dt: number,
    playerPos: THREE.Vector3,
    playerLandedPadId: string | null
  ): void {
    a.vel.set(0, 0, 0);
    a.yawRate = THREE.MathUtils.damp(a.yawRate, 0, 6, dt);
    a.pitch = THREE.MathUtils.damp(a.pitch, 0, 6, dt);
    a.roll = THREE.MathUtils.damp(a.roll, 0, 6, dt);
    a.rotorRpm = THREE.MathUtils.damp(a.rotorRpm, 0.34, 2.4, dt);

    a.parkTimer -= dt;

    // Player courtesy: if player approaches this helipad to land, depart early to free the pad!
    const pad = a.currentPadId ? this.padMap.get(a.currentPadId) : null;
    if (pad) {
      const horizDist = Math.hypot(playerPos.x - pad.x, playerPos.z - pad.z);
      const vertGap = playerPos.y - pad.y;
      if (horizDist < 52 && vertGap < 44 && vertGap > -10) {
        a.parkTimer = 0;
      }
    }

    if (a.parkTimer <= 0) {
      this.beginTakeoff(a, playerPos, playerLandedPadId);
    }
  }

  private stepTakingOff(a: AIAgent, dt: number): void {
    const targetPad = a.targetPadId ? this.padMap.get(a.targetPadId) : null;
    if (!targetPad) {
      a.state = 'PARKED';
      a.parkTimer = 10;
      return;
    }

    // Spool rotor quickly to flight RPM
    a.rotorRpm = THREE.MathUtils.damp(a.rotorRpm, 1.0, 2.6, dt);

    // Wait briefly until rotor builds enough lift (> 0.68 RPM) before lifting off skids
    const liftFactor = THREE.MathUtils.smoothstep(a.rotorRpm, 0.62, 0.94);
    const climbRate = 8.4 * liftFactor;

    const altRemaining = a.cruiseAlt - a.pos.y;
    const targetVy = THREE.MathUtils.clamp(altRemaining * 0.65, 2.2 * liftFactor, climbRate);
    a.vel.y = THREE.MathUtils.damp(a.vel.y, targetVy, 3.6, dt);
    a.pos.y += a.vel.y * dt;

    // Release origin pad reservation once safely clear above it (> 10m)
    if (a.currentPadId) {
      const originPad = this.padMap.get(a.currentPadId);
      if (!originPad || a.pos.y > originPad.y + 10) {
        a.currentPadId = null;
      }
    }

    // Smoothly rotate nose toward destination helipad while climbing
    const dx = targetPad.x - a.pos.x;
    const dz = targetPad.z - a.pos.z;
    const desiredYaw = Math.atan2(-dx, -dz);
    const yawErr = normalizeAngle(desiredYaw - a.yaw);
    const desiredYawRate = THREE.MathUtils.clamp(yawErr * 1.6, -1.25, 1.25) * liftFactor;
    a.yawRate = THREE.MathUtils.damp(a.yawRate, desiredYawRate, 4.5, dt);
    a.yaw = normalizeAngle(a.yaw + a.yawRate * dt);

    // Begin gentle forward drift once climbing high enough
    if (altRemaining < 12) {
      const creep = THREE.MathUtils.clamp((12 - altRemaining) / 12, 0, 1) * 7.5;
      const fx = -Math.sin(a.yaw);
      const fz = -Math.cos(a.yaw);
      a.vel.x = THREE.MathUtils.damp(a.vel.x, fx * creep, 2.4, dt);
      a.vel.z = THREE.MathUtils.damp(a.vel.z, fz * creep, 2.4, dt);
      a.pos.x += a.vel.x * dt;
      a.pos.z += a.vel.z * dt;
    } else {
      a.vel.x = THREE.MathUtils.damp(a.vel.x, 0, 4, dt);
      a.vel.z = THREE.MathUtils.damp(a.vel.z, 0, 4, dt);
    }

    const horizSpeed = Math.hypot(a.vel.x, a.vel.z);
    a.pitch = THREE.MathUtils.damp(a.pitch, -horizSpeed * 0.0085, 4.5, dt);
    a.roll = THREE.MathUtils.damp(a.roll, a.yawRate * 0.16, 4.5, dt);

    if (altRemaining <= 2.4 && Math.abs(yawErr) < 0.38) {
      a.state = 'CRUISING';
    }
  }

  private stepCruising(a: AIAgent, other: AIAgent | undefined, dt: number): void {
    const targetPad = a.targetPadId ? this.padMap.get(a.targetPadId) : null;
    if (!targetPad) {
      a.state = 'PARKED';
      a.parkTimer = 12;
      return;
    }

    a.rotorRpm = THREE.MathUtils.damp(a.rotorRpm, 1.0, 3.0, dt);

    const dx = targetPad.x - a.pos.x;
    const dz = targetPad.z - a.pos.z;
    const horizDist = Math.hypot(dx, dz);

    // Smooth steering toward target helipad
    const desiredYaw = Math.atan2(-dx, -dz);
    const yawErr = normalizeAngle(desiredYaw - a.yaw);
    const desiredYawRate = THREE.MathUtils.clamp(yawErr * 1.8, -1.2, 1.2);
    a.yawRate = THREE.MathUtils.damp(a.yawRate, desiredYawRate, 4.2, dt);
    a.yaw = normalizeAngle(a.yaw + a.yawRate * dt);

    // Taper speed gracefully when approaching the landing zone
    const approachFactor = THREE.MathUtils.clamp((horizDist - 12) / 56, 0.35, 1.0);
    const turnSlowdown = THREE.MathUtils.clamp(1 - Math.abs(yawErr) * 0.35, 0.55, 1.0);
    const targetSpeed = a.cruiseSpeed * approachFactor * turnSlowdown;

    const fx = -Math.sin(a.yaw);
    const fz = -Math.cos(a.yaw);
    a.vel.x = THREE.MathUtils.damp(a.vel.x, fx * targetSpeed, 2.2, dt);
    a.vel.z = THREE.MathUtils.damp(a.vel.z, fz * targetSpeed, 2.2, dt);

    // Terrain & skyscraper clearance + subtle vertical separation if AI helis cross paths
    const lookAheadX = a.pos.x + fx * 28;
    const lookAheadZ = a.pos.z + fz * 28;
    const terrainFloor = Math.max(
      getSurfaceHeightAt(a.pos.x, a.pos.z),
      getSurfaceHeightAt(lookAheadX, lookAheadZ)
    );
    let desiredY = Math.max(a.cruiseAlt, terrainFloor + 24);

    if (other && other.state !== 'PARKED') {
      const sepHoriz = Math.hypot(a.pos.x - other.pos.x, a.pos.z - other.pos.z);
      if (sepHoriz < 46 && Math.abs(a.pos.y - other.pos.y) < 16) {
        desiredY += a.id === 'ai_exec_01' ? 12 : -6;
      }
    }

    const targetVy = THREE.MathUtils.clamp((desiredY - a.pos.y) * 0.55, -5.5, 6.5);
    a.vel.y = THREE.MathUtils.damp(a.vel.y, targetVy, 2.8, dt);

    a.pos.x += a.vel.x * dt;
    a.pos.y += a.vel.y * dt;
    a.pos.z += a.vel.z * dt;

    // Natural forward pitch proportional to airspeed & realistic bank into turns
    const forwardSpeed = Math.max(0, a.vel.x * fx + a.vel.z * fz);
    const targetPitch = -THREE.MathUtils.clamp(forwardSpeed * 0.0082, 0.03, 0.24);
    const targetRoll = THREE.MathUtils.clamp(
      a.yawRate * (0.22 + forwardSpeed * 0.008),
      -0.36,
      0.36
    );
    a.pitch = THREE.MathUtils.damp(a.pitch, targetPitch, 4.0, dt);
    a.roll = THREE.MathUtils.damp(a.roll, targetRoll, 4.2, dt);

    // Transition to precision final approach & landing
    if (horizDist < 36) {
      a.state = 'LANDING';
    }
  }

  private stepLanding(
    a: AIAgent,
    dt: number,
    playerPos: THREE.Vector3,
    playerLandedPadId: string | null
  ): void {
    const targetPad = a.targetPadId ? this.padMap.get(a.targetPadId) : null;
    if (!targetPad) {
      a.state = 'PARKED';
      a.parkTimer = 12;
      return;
    }

    // If the player suddenly occupies or lands on our target helipad, execute a clean go-around!
    const playerDistToPad = Math.hypot(playerPos.x - targetPad.x, playerPos.z - targetPad.z);
    if (
      playerLandedPadId === targetPad.id ||
      (playerDistToPad < 30 && playerPos.y < targetPad.y + 34)
    ) {
      this.beginTakeoff(a, playerPos, playerLandedPadId);
      return;
    }

    a.rotorRpm = THREE.MathUtils.damp(a.rotorRpm, 0.94, 2.4, dt);

    const dx = targetPad.x - a.pos.x;
    const dz = targetPad.z - a.pos.z;
    const horizDist = Math.hypot(dx, dz);

    // Guide smoothly directly over the "H" center
    const maxApproachSpeed = THREE.MathUtils.clamp(horizDist * 0.62, 0, 14);
    const targetVx = horizDist > 0.15 ? (dx / horizDist) * maxApproachSpeed : 0;
    const targetVz = horizDist > 0.15 ? (dz / horizDist) * maxApproachSpeed : 0;

    a.vel.x = THREE.MathUtils.damp(a.vel.x, targetVx, 3.8, dt);
    a.vel.z = THREE.MathUtils.damp(a.vel.z, targetVz, 3.8, dt);

    // Keep nose smoothly aligned with approach vector while still far, then hold steady heading
    if (horizDist > 5.5) {
      const desiredYaw = Math.atan2(-dx, -dz);
      const yawErr = normalizeAngle(desiredYaw - a.yaw);
      const desiredYawRate = THREE.MathUtils.clamp(yawErr * 1.4, -0.9, 0.9);
      a.yawRate = THREE.MathUtils.damp(a.yawRate, desiredYawRate, 4.5, dt);
      a.yaw = normalizeAngle(a.yaw + a.yawRate * dt);
    } else {
      a.yawRate = THREE.MathUtils.damp(a.yawRate, 0, 5.0, dt);
      a.yaw = normalizeAngle(a.yaw + a.yawRate * dt);
    }

    // Begin vertical descent once aligned closely over the helipad, flaring smoothly near touchdown
    const altAbovePad = a.pos.y - targetPad.y;
    const desiredHoverAlt =
      horizDist > 12 ? targetPad.y + Math.max(16, altAbovePad * 0.88) : targetPad.y;
    const descentSpeed =
      horizDist > 10
        ? THREE.MathUtils.clamp((desiredHoverAlt - a.pos.y) * 0.5, -4.5, 2.0)
        : -THREE.MathUtils.clamp(1.25 + altAbovePad * 0.24, 1.25, 6.2);

    a.vel.y = THREE.MathUtils.damp(a.vel.y, descentSpeed, 3.8, dt);

    a.pos.x += a.vel.x * dt;
    a.pos.y += a.vel.y * dt;
    a.pos.z += a.vel.z * dt;

    // Gentle flare pitch-up when braking, leveling to 0 before skids touch down
    const fx = -Math.sin(a.yaw);
    const fz = -Math.cos(a.yaw);
    const fwdSpeed = a.vel.x * fx + a.vel.z * fz;
    const flarePitch =
      horizDist > 1.8 && altAbovePad > 4 ? THREE.MathUtils.clamp(-fwdSpeed * 0.005 + 0.05, -0.06, 0.1) : 0;
    a.pitch = THREE.MathUtils.damp(a.pitch, flarePitch, 4.5, dt);
    a.roll = THREE.MathUtils.damp(a.roll, a.yawRate * 0.12, 4.5, dt);

    // Clean touchdown on the "H"
    if (a.pos.y <= targetPad.y + 0.08 && horizDist < 2.4) {
      a.pos.set(targetPad.x, targetPad.y, targetPad.z);
      a.vel.set(0, 0, 0);
      a.pitch = 0;
      a.roll = 0;
      a.yawRate = 0;
      a.currentPadId = targetPad.id;
      a.targetPadId = null;
      a.state = 'PARKED';
      // Park for a random 10 to 25 seconds before choosing the next flight
      a.parkTimer = 10 + Math.random() * 15;
    }
  }

  private syncVisuals(
    a: AIAgent,
    elapsedSec: number,
    dt: number,
    nightFactor: number,
    duskFactor: number,
    stormBoost: number
  ): void {
    const rig = a.rig;
    rig.root.position.copy(a.pos);
    rig.root.rotation.set(0, a.yaw, 0, 'YXZ');
    rig.bodyGroup.rotation.set(a.pitch, 0, a.roll, 'YXZ');

    // Main & tail rotor spin speed scales smoothly between idle (PARKED) and flight
    const mainSpeed = 4.2 + a.rotorRpm * 24.0;
    const tailSpeed = 6.5 + a.rotorRpm * 34.0;
    rig.mainRotorGroup.rotation.y += dt * mainSpeed;
    rig.tailRotorGroup.rotation.x += dt * tailSpeed;

    const mainBlurMat = rig.mainRotorBlur.material as THREE.MeshBasicMaterial;
    const tailBlurMat = rig.tailRotorBlur.material as THREE.MeshBasicMaterial;
    const blurOpacity = THREE.MathUtils.clamp((a.rotorRpm - 0.5) * 1.35, 0, 0.65);
    mainBlurMat.opacity = blurOpacity;
    tailBlurMat.opacity = blurOpacity * 0.72;

    // High-visibility aviation navigation lights + double-flash white strobe (vivid at Dusk, Night & Storm)
    const darkOrStorm = Math.max(nightFactor, duskFactor * 0.85, stormBoost);
    const lightBoost = 1 + duskFactor * 1.1 + Math.max(nightFactor, stormBoost) * 2.2;
    rig.navRedMat.emissiveIntensity = 1.6 * lightBoost;
    rig.navGreenMat.emissiveIntensity = 1.6 * lightBoost;
    rig.navTailWhiteMat.emissiveIntensity = 1.3 * lightBoost;

    const glowOpacity = THREE.MathUtils.clamp(0.24 + darkOrStorm * 0.72, 0.2, 0.96);
    const glowScale = 2.6 + darkOrStorm * 3.4;
    for (let s = 0; s < rig.navGlowSprites.length; s++) {
      const sp = rig.navGlowSprites[s];
      (sp.material as THREE.SpriteMaterial).opacity = glowOpacity;
      const mult = s === 2 ? 0.78 : 1.0;
      sp.scale.set(glowScale * mult, glowScale * mult, 1);
    }

    // Crisp aviation double-strobe blink on tail fin
    const cycle = (elapsedSec + a.strobePhaseOffset) % 1.35;
    const strobeOn = cycle < 0.08 || (cycle > 0.16 && cycle < 0.24);
    rig.strobeMat.emissiveIntensity = strobeOn ? 4.5 * lightBoost : 0.12;
    rig.strobeSprite.visible = strobeOn;
    if (strobeOn) {
      const sScale = 4.4 + darkOrStorm * 5.2;
      rig.strobeSprite.scale.set(sScale, sScale, 1);
      (rig.strobeSprite.material as THREE.SpriteMaterial).opacity = 0.65 + darkOrStorm * 0.35;
    }
  }

  public getTelemetrySnapshots(): AIHelicopterTelemetry[] {
    return this.telemetryCache.map((t) => ({ ...t }));
  }

  public dispose(): void {
    for (const a of this.agents) {
      a.rig.dispose();
    }
    this.agents = [];
    this.root.clear();
  }
}
