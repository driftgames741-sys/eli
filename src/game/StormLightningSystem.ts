import * as THREE from 'three';
import { getSurfaceHeightAt, OCEAN_LEVEL } from './WorldData';
import type { BuildingCollider, WeatherMode } from './types';

interface BoltSegment {
  core: THREE.Mesh;
  glow: THREE.Mesh;
}

interface PendingThunder {
  delay: number;
  distanceNorm: number;
}

export interface LightningUpdateResult {
  flashIntensity: number;
  strikePosition: THREE.Vector3;
  thunderEvent: { distanceNorm: number } | null;
}

// Pre-allocated math helpers (zero GC allocations in animation loop)
const _upAxis = new THREE.Vector3(0, 1, 0);
const _segDir = new THREE.Vector3();
const _segMid = new THREE.Vector3();
const _segQuat = new THREE.Quaternion();
const _camFwd = new THREE.Vector3();
const _lightDirFromBolt = new THREE.Vector3();

function createLightningGlowTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const half = size / 2;
  const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
  grad.addColorStop(0.0, 'rgba(245, 252, 255, 1.0)');
  grad.addColorStop(0.22, 'rgba(204, 232, 255, 0.85)');
  grad.addColorStop(0.55, 'rgba(130, 192, 255, 0.28)');
  grad.addColorStop(1.0, 'rgba(90, 165, 255, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * 3D Branching Storm Lightning System (Zero-GC pooled cylinders + real PointLight & DirectionalLight):
 * - Spawns jagged 3D lightning bolts every 6–14s from the storm cloud deck down to skyscrapers,
 *   mountain peaks, terrain, or open sea with 2–3 secondary branches.
 * - Realistic 160–250ms flash envelope with 1–2 rapid flickers.
 * - Real electric blue-white PointLight at bolt altitude + directional flash light aimed from the
 *   strike azimuth toward the helicopter so clouds, city facades, and fuselage illuminate dynamically.
 * - Schedules distance-calibrated thunder trigger (0.3s–1.2s delay) for AudioEngine.
 */
export class StormLightningSystem {
  public readonly root = new THREE.Group();

  private readonly maxSegments = 64;
  private segments: BoltSegment[] = [];
  private activeSegmentCount = 0;

  // Pre-allocated vertex scratch buffers for main trunk & branches
  private trunkPoints: THREE.Vector3[] = [];
  private branchPoints: THREE.Vector3[] = [];

  private coreGeo: THREE.BufferGeometry;
  private glowGeo: THREE.BufferGeometry;
  private coreMat: THREE.MeshBasicMaterial;
  private glowMat: THREE.MeshBasicMaterial;
  private glowSpriteTex: THREE.CanvasTexture;
  private cloudBurstSprite: THREE.Sprite;
  private cloudBurstMat: THREE.SpriteMaterial;
  private groundImpactSprite: THREE.Sprite;
  private groundImpactMat: THREE.SpriteMaterial;

  // Real dynamic 3D lighting from the bolt strike
  private boltPointLight: THREE.PointLight;
  private boltDirLight: THREE.DirectionalLight;

  // Strike timing & flicker envelope state
  private nextStrikeTimer = 3.5;
  private strikeActive = false;
  private strikeAge = 0;
  private strikeDuration = 0.21;
  private hasSecondFlicker = true;
  private firstPeakDur = 0.095;
  private dipDur = 0.042;
  private secondPeakDur = 0.072;
  private flashIntensity = 0;

  private strikePos = new THREE.Vector3(0, 0, 0);
  private cloudOriginPos = new THREE.Vector3(0, 235, 0);
  private pendingThunders: PendingThunder[] = [];

  private colliders: BuildingCollider[];

  constructor(colliders: BuildingCollider[]) {
    this.root.name = 'StormLightningSystem';
    this.colliders = colliders;

    for (let i = 0; i < 24; i++) {
      this.trunkPoints.push(new THREE.Vector3());
    }
    for (let i = 0; i < 12; i++) {
      this.branchPoints.push(new THREE.Vector3());
    }

    // Thin tapered 5-sided cylinder reused across all pooled main & branch bolt segments
    this.coreGeo = new THREE.CylinderGeometry(0.45, 0.52, 1, 5, 1, false);
    this.glowGeo = new THREE.CylinderGeometry(1.55, 1.8, 1, 6, 1, true);

    this.coreMat = new THREE.MeshBasicMaterial({
      color: 0xf0f8ff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    this.glowMat = new THREE.MeshBasicMaterial({
      color: 0x99d0ff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: false,
    });

    for (let i = 0; i < this.maxSegments; i++) {
      const core = new THREE.Mesh(this.coreGeo, this.coreMat);
      core.visible = false;
      core.frustumCulled = false;

      const glow = new THREE.Mesh(this.glowGeo, this.glowMat);
      glow.visible = false;
      glow.frustumCulled = false;

      this.root.add(glow, core);
      this.segments.push({ core, glow });
    }

    this.glowSpriteTex = createLightningGlowTexture();

    // Intense cloud-deck eruption flare where the bolt emerges from storm clouds
    this.cloudBurstMat = new THREE.SpriteMaterial({
      map: this.glowSpriteTex,
      color: 0xcce8ff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    this.cloudBurstSprite = new THREE.Sprite(this.cloudBurstMat);
    this.cloudBurstSprite.visible = false;
    this.cloudBurstSprite.scale.set(145, 85, 1);
    this.root.add(this.cloudBurstSprite);

    // Electric ground/rooftop/water flash at the impact point
    this.groundImpactMat = new THREE.SpriteMaterial({
      map: this.glowSpriteTex,
      color: 0xd6ecff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    this.groundImpactSprite = new THREE.Sprite(this.groundImpactMat);
    this.groundImpactSprite.visible = false;
    this.groundImpactSprite.scale.set(42, 42, 1);
    this.root.add(this.groundImpactSprite);

    // Real 3D electric PointLight positioned mid-bolt to illuminate clouds, buildings & landscape
    this.boltPointLight = new THREE.PointLight(0xd6ecff, 0, 1500, 1.0);
    this.boltPointLight.castShadow = false;
    this.root.add(this.boltPointLight);

    // Directional electric flash light oriented from the bolt azimuth onto the helicopter & skyline
    this.boltDirLight = new THREE.DirectionalLight(0xd6ecff, 0);
    this.boltDirLight.castShadow = false;
    this.root.add(this.boltDirLight);
    this.root.add(this.boltDirLight.target);
  }

  /**
   * Call when switching into STORM mode so the first 3D bolt arrives quickly (~2s) for immediate feedback.
   */
  public primeFirstStrike(): void {
    this.nextStrikeTimer = 1.6 + Math.random() * 1.4;
  }

  public clearImmediate(): void {
    this.strikeActive = false;
    this.flashIntensity = 0;
    this.pendingThunders.length = 0;
    this.hideBoltVisuals();
  }

  private hideBoltVisuals(): void {
    for (let i = 0; i < this.activeSegmentCount; i++) {
      this.segments[i].core.visible = false;
      this.segments[i].glow.visible = false;
    }
    this.activeSegmentCount = 0;
    this.cloudBurstSprite.visible = false;
    this.groundImpactSprite.visible = false;
    this.boltPointLight.intensity = 0;
    this.boltDirLight.intensity = 0;
  }

  private placeSegment(
    segIdx: number,
    p0: THREE.Vector3,
    p1: THREE.Vector3,
    radiusScale: number
  ): void {
    if (segIdx >= this.maxSegments) return;
    const seg = this.segments[segIdx];

    _segDir.subVectors(p1, p0);
    const len = _segDir.length();
    if (len < 0.05) {
      seg.core.visible = false;
      seg.glow.visible = false;
      return;
    }

    _segMid.addVectors(p0, p1).multiplyScalar(0.5);
    _segDir.multiplyScalar(1 / len);
    _segQuat.setFromUnitVectors(_upAxis, _segDir);

    // Slight length overlap (+4%) prevents visible gaps at sharp zigzag elbows
    const segLen = len * 1.04;

    seg.core.position.copy(_segMid);
    seg.core.quaternion.copy(_segQuat);
    seg.core.scale.set(radiusScale, segLen, radiusScale);
    seg.core.visible = true;

    seg.glow.position.copy(_segMid);
    seg.glow.quaternion.copy(_segQuat);
    seg.glow.scale.set(radiusScale * 1.35, segLen, radiusScale * 1.35);
    seg.glow.visible = true;
  }

  private resolveStrikeGroundY(x: number, z: number): number {
    let highestY = Math.max(OCEAN_LEVEL, getSurfaceHeightAt(x, z));
    for (let i = 0; i < this.colliders.length; i++) {
      const b = this.colliders[i];
      if (x >= b.minX - 3 && x <= b.maxX + 3 && z >= b.minZ - 3 && z <= b.maxZ + 3) {
        if (b.topY > highestY) {
          highestY = b.topY;
        }
      }
    }
    return highestY;
  }

  private triggerStrike(heliPos: THREE.Vector3, camera: THREE.Camera): void {
    // Hide any leftover segments from previous strike
    this.hideBoltVisuals();

    // Bias strike azimuth toward camera forward hemisphere (~150° cone) so player sees bolts dramatically
    camera.getWorldDirection(_camFwd);
    const camAzimuth = Math.atan2(_camFwd.z, _camFwd.x);
    const angleSpread =
      Math.random() < 0.82
        ? (Math.random() - 0.5) * 2.1 // forward cinematic arc
        : (Math.random() - 0.5) * Math.PI * 2; // occasional flank/behind strike
    const azimuth = camAzimuth + angleSpread;

    const strikeDist = 145 + Math.random() * 475; // 145m to 620m away
    let tx = heliPos.x + Math.cos(azimuth) * strikeDist;
    let tz = heliPos.z + Math.sin(azimuth) * strikeDist;

    // 30% chance to snap toward a tall skyscraper within the forward sector for dramatic urban strikes
    if (Math.random() < 0.3 && this.colliders.length > 0) {
      let bestBuilding: BuildingCollider | null = null;
      let bestScore = Infinity;
      for (let i = 0; i < this.colliders.length; i++) {
        const b = this.colliders[i];
        if (b.topY < 26) continue;
        const bx = (b.minX + b.maxX) * 0.5;
        const bz = (b.minZ + b.maxZ) * 0.5;
        const d = Math.hypot(bx - tx, bz - tz);
        const distHeli = Math.hypot(bx - heliPos.x, bz - heliPos.z);
        if (distHeli > 110 && distHeli < 660 && d < 180 && d < bestScore) {
          bestScore = d;
          bestBuilding = b;
        }
      }
      if (bestBuilding) {
        tx = THREE.MathUtils.lerp(bestBuilding.minX, bestBuilding.maxX, 0.25 + Math.random() * 0.5);
        tz = THREE.MathUtils.lerp(bestBuilding.minZ, bestBuilding.maxZ, 0.25 + Math.random() * 0.5);
      }
    }

    const groundY = this.resolveStrikeGroundY(tx, tz);
    const cloudY = Math.max(groundY + 140, 215 + Math.random() * 65);
    const cloudOffsetX = (Math.random() - 0.5) * 58;
    const cloudOffsetZ = (Math.random() - 0.5) * 58;

    this.strikePos.set(tx, groundY, tz);
    this.cloudOriginPos.set(tx + cloudOffsetX, cloudY, tz + cloudOffsetZ);

    // 1. Build main jagged zigzag trunk from storm cloud base down to ground/rooftop/sea
    const trunkSteps = 12 + Math.floor(Math.random() * 4); // 12..15 segments
    for (let i = 0; i <= trunkSteps; i++) {
      const t = i / trunkSteps;
      const baseX = THREE.MathUtils.lerp(this.cloudOriginPos.x, this.strikePos.x, t);
      const baseY = THREE.MathUtils.lerp(this.cloudOriginPos.y, this.strikePos.y, t);
      const baseZ = THREE.MathUtils.lerp(this.cloudOriginPos.z, this.strikePos.z, t);

      // Zero jitter at endpoints; bold lightning kinks through the middle span
      const midWeight = Math.sin(t * Math.PI);
      const jitter = midWeight * (18 + Math.random() * 14);
      const jx = (Math.random() - 0.5) * 2 * jitter;
      const jz = (Math.random() - 0.5) * 2 * jitter;
      const jy = i === 0 || i === trunkSteps ? 0 : (Math.random() - 0.5) * 6;

      this.trunkPoints[i].set(baseX + jx, baseY + jy, baseZ + jz);
    }

    let segIdx = 0;
    for (let i = 0; i < trunkSteps; i++) {
      const t = i / trunkSteps;
      // Slightly thicker near cloud origin, crisp tapered electric core toward impact
      const thickness = THREE.MathUtils.lerp(1.55, 0.85, t);
      this.placeSegment(segIdx++, this.trunkPoints[i], this.trunkPoints[i + 1], thickness);
    }

    // 2. Generate 2 to 3 secondary branching forks splitting off upper/mid trunk nodes
    const branchCount = 2 + Math.floor(Math.random() * 2); // 2 or 3 branches
    for (let b = 0; b < branchCount; b++) {
      const startNode = 2 + Math.floor(((b + 0.4 + Math.random() * 0.45) / branchCount) * (trunkSteps - 5));
      const clampedStart = Math.min(trunkSteps - 3, Math.max(1, startNode));
      const origin = this.trunkPoints[clampedStart];

      const branchSteps = 4 + Math.floor(Math.random() * 3); // 4..6 segments
      const branchAzimuth = Math.random() * Math.PI * 2;
      const horizReach = 34 + Math.random() * 48;
      const dropHeight = Math.min(origin.y - groundY - 12, 48 + Math.random() * 68);
      if (dropHeight < 18) continue;

      this.branchPoints[0].copy(origin);
      for (let s = 1; s <= branchSteps; s++) {
        const u = s / branchSteps;
        const bx =
          origin.x +
          Math.cos(branchAzimuth) * horizReach * u +
          (Math.random() - 0.5) * 18 * u;
        const by = origin.y - dropHeight * u + (Math.random() - 0.5) * 5;
        const bz =
          origin.z +
          Math.sin(branchAzimuth) * horizReach * u +
          (Math.random() - 0.5) * 18 * u;
        this.branchPoints[s].set(bx, Math.max(groundY + 4, by), bz);
      }

      for (let s = 0; s < branchSteps; s++) {
        const u = s / branchSteps;
        const radius = THREE.MathUtils.lerp(0.68, 0.24, u);
        this.placeSegment(segIdx++, this.branchPoints[s], this.branchPoints[s + 1], radius);
      }

      // Optional delicate sub-twig off the first branch for authentic fractal silhouette
      if (b === 0 && branchSteps >= 4 && segIdx + 3 < this.maxSegments) {
        const twigStart = this.branchPoints[2];
        const twigAngle = branchAzimuth + (Math.random() > 0.5 ? 0.9 : -0.9);
        let prevX = twigStart.x;
        let prevY = twigStart.y;
        let prevZ = twigStart.z;
        for (let k = 1; k <= 3; k++) {
          const nx = prevX + Math.cos(twigAngle) * (10 + Math.random() * 6) + (Math.random() - 0.5) * 6;
          const ny = Math.max(groundY + 4, prevY - (10 + Math.random() * 8));
          const nz = prevZ + Math.sin(twigAngle) * (10 + Math.random() * 6) + (Math.random() - 0.5) * 6;
          this.branchPoints[8].set(prevX, prevY, prevZ);
          this.branchPoints[9].set(nx, ny, nz);
          this.placeSegment(segIdx++, this.branchPoints[8], this.branchPoints[9], 0.34 - k * 0.06);
          prevX = nx;
          prevY = ny;
          prevZ = nz;
        }
      }
    }

    this.activeSegmentCount = segIdx;

    // Position cloud burst flare & ground impact glow
    this.cloudBurstSprite.position.copy(this.cloudOriginPos);
    this.cloudBurstSprite.visible = true;
    this.groundImpactSprite.position.set(this.strikePos.x, this.strikePos.y + 4.0, this.strikePos.z);
    this.groundImpactSprite.visible = true;

    // Position PointLight mid-upper bolt so it bathes clouds, skyline & terrain dramatically
    this.boltPointLight.position.set(
      THREE.MathUtils.lerp(this.strikePos.x, this.cloudOriginPos.x, 0.55),
      THREE.MathUtils.lerp(this.strikePos.y, this.cloudOriginPos.y, 0.58),
      THREE.MathUtils.lerp(this.strikePos.z, this.cloudOriginPos.z, 0.55)
    );

    // Configure crisp 155ms–250ms flash envelope (1 or 2 flickers)
    this.strikeActive = true;
    this.strikeAge = 0;
    this.hasSecondFlicker = Math.random() < 0.78;
    this.firstPeakDur = 0.075 + Math.random() * 0.035;
    this.dipDur = 0.03 + Math.random() * 0.022;
    this.secondPeakDur = 0.055 + Math.random() * 0.035;
    this.strikeDuration = this.hasSecondFlicker
      ? this.firstPeakDur + this.dipDur + this.secondPeakDur + 0.04
      : this.firstPeakDur + 0.075;

    // Schedule next bolt cleanly every 6 to 14 seconds
    this.nextStrikeTimer = 6.0 + Math.random() * 8.0;

    // Schedule realistic sound-of-thunder delay (0.3s to 1.2s scaled by distance to strike)
    const actualDist = Math.hypot(this.strikePos.x - heliPos.x, this.strikePos.z - heliPos.z);
    const distanceNorm = THREE.MathUtils.clamp((actualDist - 120) / 520, 0, 1);
    const thunderDelay = 0.3 + distanceNorm * 0.9;
    this.pendingThunders.push({ delay: thunderDelay, distanceNorm });
  }

  public update(
    dt: number,
    weather: WeatherMode,
    active: boolean,
    heliPos: THREE.Vector3,
    camera: THREE.Camera
  ): LightningUpdateResult {
    let thunderEvent: { distanceNorm: number } | null = null;

    // Advance pending thunder delays
    for (let i = this.pendingThunders.length - 1; i >= 0; i--) {
      this.pendingThunders[i].delay -= dt;
      if (this.pendingThunders[i].delay <= 0) {
        if (weather === 'STORM' && active) {
          thunderEvent = { distanceNorm: this.pendingThunders[i].distanceNorm };
        }
        this.pendingThunders.splice(i, 1);
      }
    }

    if (weather !== 'STORM' || !active) {
      if (this.strikeActive) {
        this.clearImmediate();
      }
      this.flashIntensity = THREE.MathUtils.damp(this.flashIntensity, 0, 14, dt);
      return {
        flashIntensity: this.flashIntensity,
        strikePosition: this.strikePos,
        thunderEvent: null,
      };
    }

    this.nextStrikeTimer -= dt;
    if (this.nextStrikeTimer <= 0 && !this.strikeActive) {
      this.triggerStrike(heliPos, camera);
    }

    if (this.strikeActive) {
      this.strikeAge += dt;
      let env = 0;

      if (!this.hasSecondFlicker) {
        if (this.strikeAge < this.firstPeakDur) {
          env = 1.0 - (this.strikeAge / this.firstPeakDur) * 0.15;
        } else {
          const tail = (this.strikeAge - this.firstPeakDur) / Math.max(0.01, this.strikeDuration - this.firstPeakDur);
          env = Math.max(0, 1 - tail) * 0.85;
        }
      } else {
        const t1 = this.firstPeakDur;
        const t2 = t1 + this.dipDur;
        const t3 = t2 + this.secondPeakDur;
        if (this.strikeAge < t1) {
          env = 1.0;
        } else if (this.strikeAge < t2) {
          // Rapid dark flicker between primary stroke and return restrike
          env = 0.14;
        } else if (this.strikeAge < t3) {
          // Bright secondary restrike
          env = 0.92;
        } else {
          const tail = (this.strikeAge - t3) / Math.max(0.01, this.strikeDuration - t3);
          env = Math.max(0, 1 - tail) * 0.72;
        }
      }

      this.flashIntensity = env;

      // Update bolt mesh opacity, cloud burst & ground flash
      this.coreMat.opacity = THREE.MathUtils.clamp(env * 1.15, 0, 1);
      this.glowMat.opacity = THREE.MathUtils.clamp(env * 0.56, 0, 0.6);
      this.cloudBurstMat.opacity = THREE.MathUtils.clamp(env * 0.82, 0, 0.85);
      this.groundImpactMat.opacity = THREE.MathUtils.clamp(env * 0.95, 0, 0.95);

      const burstScale = 120 + env * 65;
      this.cloudBurstSprite.scale.set(burstScale * 1.45, burstScale * 0.82, 1);
      const impactScale = 24 + env * 32;
      this.groundImpactSprite.scale.set(impactScale, impactScale, 1);

      // Drive real 3D PointLight (lights clouds/buildings near strike) + DirectionalLight (lights helicopter fuselage & skyline)
      this.boltPointLight.intensity = env * 68000;

      _lightDirFromBolt
        .set(
          this.boltPointLight.position.x - heliPos.x,
          Math.max(85, this.boltPointLight.position.y - heliPos.y),
          this.boltPointLight.position.z - heliPos.z
        )
        .normalize();
      this.boltDirLight.position.set(
        heliPos.x + _lightDirFromBolt.x * 260,
        heliPos.y + _lightDirFromBolt.y * 260,
        heliPos.z + _lightDirFromBolt.z * 260
      );
      this.boltDirLight.target.position.copy(heliPos);
      this.boltDirLight.target.updateMatrixWorld();

      const distToHeli = Math.hypot(this.strikePos.x - heliPos.x, this.strikePos.z - heliPos.z);
      const proximityBoost = THREE.MathUtils.clamp(1.25 - distToHeli / 760, 0.48, 1.2);
      this.boltDirLight.intensity = env * 4.2 * proximityBoost;

      if (this.strikeAge >= this.strikeDuration) {
        this.strikeActive = false;
        this.flashIntensity = 0;
        this.hideBoltVisuals();
      }
    } else {
      this.flashIntensity = 0;
    }

    return {
      flashIntensity: this.flashIntensity,
      strikePosition: this.strikePos,
      thunderEvent,
    };
  }

  public dispose(): void {
    this.coreGeo.dispose();
    this.glowGeo.dispose();
    this.coreMat.dispose();
    this.glowMat.dispose();
    this.glowSpriteTex.dispose();
    this.cloudBurstMat.dispose();
    this.groundImpactMat.dispose();
    this.root.clear();
  }
}
