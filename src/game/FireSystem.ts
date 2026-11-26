import * as THREE from 'three';
import { BUILDING_SPECS, getTerrainHeight } from './WorldData';
import type { ActiveFireState, FireSiteSpec } from './types';

const _fireCullSphere = new THREE.Sphere();

interface SmokePuff {
  mesh: THREE.Mesh;
  age: number;
  maxAge: number;
  driftX: number;
  driftZ: number;
  riseSpeed: number;
  baseScale: number;
}

interface SteamPuff {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  baseScale: number;
}

interface FlamePart {
  mesh: THREE.Mesh;
  baseX: number;
  baseZ: number;
  baseH: number;
  phase: number;
  speed: number;
}

/**
 * Curated island emergency fire locations (residential rooftops/courtyards + forest hills).
 */
export function buildFireSiteCatalog(): FireSiteSpec[] {
  const sites: FireSiteSpec[] = [];

  // 1. Forest Fires (2x Dense Eastern Forest hills, Rivers, Reservoir Ridge, Fazenda Vale Verde edge, Central Park)
  const forestCoords: Array<{
    id: string;
    title: string;
    locationLabel: string;
    x: number;
    z: number;
    reward: number;
  }> = [
    {
      id: 'fire_forest_ridge',
      title: 'Incêndio Florestal',
      locationLabel: 'Floresta Densa · Serra Norte',
      x: 1185,
      z: -330,
      reward: 1080,
    },
    {
      id: 'fire_forest_valley',
      title: 'Incêndio Florestal',
      locationLabel: 'Vale da Base Florestal',
      x: 1050,
      z: 395,
      reward: 1040,
    },
    {
      id: 'fire_forest_dam',
      title: 'Incêndio Florestal',
      locationLabel: 'Encosta da Represa & Rio',
      x: 720,
      z: -240,
      reward: 960,
    },
    {
      id: 'fire_forest_east',
      title: 'Incêndio Florestal',
      locationLabel: 'Mata das Árvores Gigantes',
      x: 1445,
      z: 60,
      reward: 1140,
    },
    {
      id: 'fire_forest_farm_edge',
      title: 'Incêndio Rural',
      locationLabel: 'Borda da Fazenda Vale Verde',
      x: 925,
      z: 625,
      reward: 980,
    },
    {
      id: 'fire_forest_park',
      title: 'Incêndio no Parque',
      locationLabel: 'Parque Central',
      x: -10,
      z: -42,
      reward: 740,
    },
  ];

  for (const f of forestCoords) {
    sites.push({
      id: f.id,
      title: f.title,
      locationLabel: f.locationLabel,
      category: 'forest',
      x: f.x,
      y: getTerrainHeight(f.x, f.z) + 0.1,
      z: f.z,
      radius: 16,
      reward: f.reward,
      xpReward: 120,
    });
  }

  // 2. Residential & Urban Fires (selected cleanly from flat-roof low/mid-rise buildings across expanded 2x city)
  const flatCandidates = BUILDING_SPECS.filter(
    (spec) =>
      !spec.hasHelipad &&
      (!spec.crownStyle || spec.crownStyle === 'flat') &&
      spec.height >= 16 &&
      spec.height <= 46
  );

  const sectorTargets: Array<{ targetX: number; targetZ: number; locationLabel: string; reward: number }> = [
    { targetX: -560, targetZ: 180, locationLabel: 'Bairro Oeste', reward: 720 },
    { targetX: -660, targetZ: -135, locationLabel: 'Distrito do Porto', reward: 740 },
    { targetX: -110, targetZ: 385, locationLabel: 'Avenida Sul', reward: 710 },
    { targetX: 215, targetZ: 385, locationLabel: 'Bairro Residencial Sudeste', reward: 750 },
    { targetX: 325, targetZ: -230, locationLabel: 'Zona Leste', reward: 760 },
    { targetX: -220, targetZ: -330, locationLabel: 'Distrito Norte', reward: 730 },
  ];

  const usedIds = new Set<string>();
  for (const sector of sectorTargets) {
    let best = flatCandidates[0];
    let bestDist = Infinity;
    for (const b of flatCandidates) {
      if (usedIds.has(b.id)) continue;
      const d = Math.hypot(b.x - sector.targetX, b.z - sector.targetZ);
      if (d < bestDist) {
        bestDist = d;
        best = b;
      }
    }
    if (!best) continue;
    usedIds.add(best.id);
    const baseY = getTerrainHeight(best.x, best.z);
    sites.push({
      id: `fire_res_${best.id}`,
      title: 'Incêndio em Residência',
      locationLabel: sector.locationLabel,
      category: 'residential',
      x: best.x,
      y: baseY + best.height + 0.15,
      z: best.z,
      radius: 14,
      reward: sector.reward,
      xpReward: 105,
    });
  }

  return sites;
}

/**
 * Self-contained 3D Fire Emergency System:
 * - Animated low-poly flames visible from afar
 * - Tall rising dark smoke plume (up to ~100m altitude)
 * - Pooled white steam bursts when water hits the fire
 * - Smooth intensity reduction (100% -> 0%)
 */
export class FireSystem {
  public readonly root = new THREE.Group();

  private catalog: FireSiteSpec[];
  private activeSite: FireSiteSpec | null = null;
  private intensity = 0; // 0..100
  private lastSiteId: string | null = null;

  private flamesGroup = new THREE.Group();
  private flames: FlamePart[] = [];
  private scorchRing: THREE.Mesh;
  private emberGlowMesh: THREE.Mesh;
  private emberGlowMat: THREE.MeshBasicMaterial;

  private smokePuffs: SmokePuff[] = [];
  private steamPuffs: SteamPuff[] = [];

  private geometries: THREE.BufferGeometry[] = [];
  private materials: THREE.Material[] = [];

  private steamEmitCooldown = 0;

  constructor() {
    this.catalog = buildFireSiteCatalog();
    this.root.visible = false;

    const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
      this.geometries.push(g);
      return g;
    };
    const trackMat = <T extends THREE.Material>(m: T): T => {
      this.materials.push(m);
      return m;
    };

    // Glowing ember/scorch circle at fire base
    const scorchGeo = trackGeo(new THREE.CircleGeometry(9.5, 20));
    scorchGeo.rotateX(-Math.PI / 2);
    const scorchMat = trackMat(
      new THREE.MeshBasicMaterial({
        color: 0x2b1710,
        transparent: true,
        opacity: 0.78,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      })
    );
    this.scorchRing = new THREE.Mesh(scorchGeo, scorchMat);
    this.scorchRing.position.y = 0.16;
    this.root.add(this.scorchRing);

    // Zero-cost additive warm firelight glow disc (replaces real PointLight for max GPU FPS)
    const emberGlowGeo = trackGeo(new THREE.CircleGeometry(14.5, 20));
    emberGlowGeo.rotateX(-Math.PI / 2);
    this.emberGlowMat = trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xff7b24,
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    this.emberGlowMesh = new THREE.Mesh(emberGlowGeo, this.emberGlowMat);
    this.emberGlowMesh.position.y = 0.24;
    this.root.add(this.emberGlowMesh);

    // Clustered animated low-poly flame cones (outer red-orange, mid orange, bright yellow core)
    const flameGeo = trackGeo(new THREE.ConeGeometry(1.7, 5.2, 5));
    flameGeo.translate(0, 2.6, 0);

    const flameMats = [
      trackMat(
        new THREE.MeshStandardMaterial({
          color: 0xff4500,
          emissive: 0xff3b00,
          emissiveIntensity: 1.5,
          roughness: 0.4,
          flatShading: true,
        })
      ),
      trackMat(
        new THREE.MeshStandardMaterial({
          color: 0xff8c00,
          emissive: 0xff7700,
          emissiveIntensity: 1.65,
          roughness: 0.35,
          flatShading: true,
        })
      ),
      trackMat(
        new THREE.MeshStandardMaterial({
          color: 0xfde047,
          emissive: 0xfacc15,
          emissiveIntensity: 1.8,
          roughness: 0.3,
          flatShading: true,
        })
      ),
    ];

    const flameLayout = [
      { x: 0, z: 0, s: 1.55, h: 1.75, mat: 2 },
      { x: -3.2, z: -2.0, s: 1.25, h: 1.4, mat: 1 },
      { x: 3.4, z: -1.6, s: 1.3, h: 1.5, mat: 0 },
      { x: -2.4, z: 3.1, s: 1.2, h: 1.35, mat: 0 },
      { x: 2.8, z: 2.9, s: 1.15, h: 1.3, mat: 1 },
      { x: 0.6, z: -4.4, s: 1.05, h: 1.2, mat: 1 },
      { x: -5.0, z: 0.8, s: 0.95, h: 1.1, mat: 0 },
      { x: 5.2, z: 0.5, s: 1.0, h: 1.15, mat: 0 },
      { x: -0.9, z: 1.4, s: 1.15, h: 1.55, mat: 2 },
      { x: 1.4, z: -0.9, s: 1.05, h: 1.45, mat: 2 },
    ];

    flameLayout.forEach((f, idx) => {
      const m = new THREE.Mesh(flameGeo, flameMats[f.mat]);
      m.position.set(f.x, 0, f.z);
      m.scale.set(f.s, f.h, f.s);
      this.flamesGroup.add(m);
      this.flames.push({
        mesh: m,
        baseX: f.x,
        baseZ: f.z,
        baseH: f.h,
        phase: idx * 1.17,
        speed: 6.5 + (idx % 4) * 1.6,
      });
    });
    this.root.add(this.flamesGroup);

    // Tall rising dark smoke plume (26 pooled low-poly puffs reaching ~105m altitude)
    const smokeGeo = trackGeo(new THREE.DodecahedronGeometry(1.8, 0));
    for (let i = 0; i < 26; i++) {
      const smokeMat = trackMat(
        new THREE.MeshStandardMaterial({
          color: 0x262b33,
          roughness: 0.96,
          metalness: 0.0,
          transparent: true,
          opacity: 0.65,
          flatShading: true,
          depthWrite: false,
        })
      );
      const mesh = new THREE.Mesh(smokeGeo, smokeMat);
      this.root.add(mesh);
      const maxAge = 5.6 + (i % 5) * 0.45;
      this.smokePuffs.push({
        mesh,
        age: (i / 26) * maxAge,
        maxAge,
        driftX: 1.6 + ((i * 7) % 5) * 0.35,
        driftZ: -0.9 + ((i * 11) % 5) * 0.3,
        riseSpeed: 15.5 + (i % 4) * 1.8,
        baseScale: 1.15 + (i % 3) * 0.3,
      });
    }

    // Pooled white steam particles spawned when water extinguishes fire
    const steamGeo = trackGeo(new THREE.DodecahedronGeometry(1.15, 0));
    for (let i = 0; i < 24; i++) {
      const steamMat = trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xf1f5f9,
          transparent: true,
          opacity: 0.72,
          depthWrite: false,
        })
      );
      const mesh = new THREE.Mesh(steamGeo, steamMat);
      mesh.visible = false;
      this.root.add(mesh);
      this.steamPuffs.push({
        mesh,
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 1.2,
        baseScale: 1,
      });
    }
  }

  public getActiveSite(): FireSiteSpec | null {
    return this.activeSite;
  }

  public getIntensity(): number {
    return this.intensity;
  }

  public spawnRandomFire(): FireSiteSpec {
    const candidates = this.catalog.filter((s) => s.id !== this.lastSiteId);
    const chosen = candidates[Math.floor(Math.random() * candidates.length)] || this.catalog[0];
    this.lastSiteId = chosen.id;
    this.activeSite = chosen;
    this.intensity = 100;

    this.root.position.set(chosen.x, chosen.y, chosen.z);
    this.root.visible = true;

    // Reset smoke plume stagger cleanly
    this.smokePuffs.forEach((p, idx) => {
      p.age = (idx / this.smokePuffs.length) * p.maxAge;
      p.mesh.visible = true;
    });

    this.steamPuffs.forEach((p) => {
      p.life = 0;
      p.mesh.visible = false;
    });

    return chosen;
  }

  public clearFire(): void {
    this.activeSite = null;
    this.intensity = 0;
    this.root.visible = false;
  }

  /**
   * Applies water impact at world coordinate (wx, wz).
   * Returns { hit, extinguished, site } if the water lands within the fire radius.
   */
  public applyWaterAt(
    wx: number,
    wy: number,
    wz: number,
    amount: number
  ): { hit: boolean; extinguished: boolean; site: FireSiteSpec | null } {
    if (!this.activeSite || this.intensity <= 0) {
      return { hit: false, extinguished: false, site: null };
    }

    const distXZ = Math.hypot(wx - this.activeSite.x, wz - this.activeSite.z);
    const hitRadius = this.activeSite.radius + 4.5;
    if (distXZ > hitRadius || wy < this.activeSite.y - 6 || wy > this.activeSite.y + 42) {
      return { hit: false, extinguished: false, site: null };
    }

    // Center drops extinguish slightly faster than outer fringe drops
    const accuracyBoost = 1.25 - Math.min(0.65, (distXZ / hitRadius) * 0.65);
    this.intensity = Math.max(0, this.intensity - amount * accuracyBoost);

    // Emit billowing white steam particles on contact
    if (this.steamEmitCooldown <= 0) {
      this.steamEmitCooldown = 0.06;
      this.spawnSteamPuff(wx - this.activeSite.x, wz - this.activeSite.z);
    }

    if (this.intensity <= 0.01) {
      const completedSite = this.activeSite;
      this.intensity = 0;
      this.spawnSteamBurst();
      this.activeSite = null;
      return { hit: true, extinguished: true, site: completedSite };
    }

    return { hit: true, extinguished: false, site: this.activeSite };
  }

  private spawnSteamPuff(localX: number, localZ: number): void {
    for (let i = 0; i < this.steamPuffs.length; i++) {
      const p = this.steamPuffs[i];
      if (p.life > 0) continue;
      p.life = 1.0 + Math.random() * 0.55;
      p.maxLife = p.life;
      p.baseScale = 1.1 + Math.random() * 0.9;
      p.mesh.position.set(
        localX + (Math.random() - 0.5) * 4.5,
        1.2 + Math.random() * 1.5,
        localZ + (Math.random() - 0.5) * 4.5
      );
      p.vel.set((Math.random() - 0.5) * 3.8, 7.5 + Math.random() * 4.5, (Math.random() - 0.5) * 3.8);
      p.mesh.scale.setScalar(p.baseScale);
      p.mesh.visible = true;
      break;
    }
  }

  private spawnSteamBurst(): void {
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2;
      const r = 1.5 + Math.random() * 4.5;
      this.spawnSteamPuff(Math.cos(ang) * r, Math.sin(ang) * r);
    }
  }

  public getTelemetrySnapshot(heliX: number, heliZ: number): ActiveFireState | null {
    if (!this.activeSite || this.intensity <= 0) return null;
    const dist = Math.round(Math.hypot(this.activeSite.x - heliX, this.activeSite.z - heliZ));
    const intensityPct = Math.round(this.intensity);
    return {
      id: this.activeSite.id,
      title: this.activeSite.title,
      locationLabel: this.activeSite.locationLabel,
      category: this.activeSite.category,
      x: this.activeSite.x,
      y: this.activeSite.y,
      z: this.activeSite.z,
      intensityPercent: intensityPct,
      extinguishedPercent: Math.max(0, Math.min(100, 100 - intensityPct)),
      distanceMeters: dist,
      reward: this.activeSite.reward,
      xpReward: this.activeSite.xpReward,
    };
  }

  public update(
    elapsed: number,
    dt: number,
    cameraFrustum?: THREE.Frustum,
    heliPos?: THREE.Vector3
  ): void {
    if (!this.root.visible) return;
    if (this.steamEmitCooldown > 0) this.steamEmitCooldown -= dt;

    const norm = THREE.MathUtils.clamp(this.intensity / 100, 0, 1);
    const hasFire = this.activeSite !== null && norm > 0.005;

    // O CONE: Pause flame, smoke & steam visual animations when fire column is outside camera frustum and far from player
    if (cameraFrustum && hasFire && this.activeSite) {
      _fireCullSphere.center.set(this.activeSite.x, this.activeSite.y + 42, this.activeSite.z);
      _fireCullSphere.radius = 85;
      const inView = cameraFrustum.intersectsSphere(_fireCullSphere);
      const nearHeli =
        heliPos !== undefined &&
        Math.hypot(this.activeSite.x - heliPos.x, this.activeSite.z - heliPos.z) < 165;
      if (!inView && !nearHeli) {
        return;
      }
    }

    // Animate flickering flames scaled by remaining fire intensity
    this.flamesGroup.visible = hasFire;
    this.scorchRing.visible = hasFire;
    if (hasFire) {
      const sizeScale = 0.35 + norm * 0.85;
      for (let i = 0; i < this.flames.length; i++) {
        const f = this.flames[i];
        const flicker = 0.78 + Math.sin(elapsed * f.speed + f.phase) * 0.28 + Math.cos(elapsed * (f.speed * 1.4) + f.phase) * 0.14;
        f.mesh.scale.set(
          (0.85 + norm * 0.45) * (0.9 + flicker * 0.15),
          f.baseH * sizeScale * flicker,
          (0.85 + norm * 0.45) * (0.9 + flicker * 0.15)
        );
        f.mesh.rotation.y = elapsed * 1.4 + f.phase;
        f.mesh.position.x = f.baseX + Math.sin(elapsed * 4.5 + f.phase) * 0.35;
        f.mesh.position.z = f.baseZ + Math.cos(elapsed * 4.1 + f.phase) * 0.35;
      }
      const pulse = 0.85 + Math.sin(elapsed * 14) * 0.15;
      this.emberGlowMesh.visible = true;
      this.emberGlowMesh.scale.setScalar((0.72 + norm * 0.44) * pulse);
      this.emberGlowMat.opacity = 0.4 * norm * pulse;
    } else {
      this.emberGlowMesh.visible = false;
      this.emberGlowMat.opacity = 0;
    }

    // Animate tall rising dark smoke column (visible from across the island)
    let anyActiveSmoke = false;
    for (let i = 0; i < this.smokePuffs.length; i++) {
      const p = this.smokePuffs[i];
      p.age += dt;
      if (p.age >= p.maxAge) {
        if (hasFire) {
          p.age = p.age % p.maxAge;
          p.mesh.visible = true;
        } else {
          p.mesh.visible = false;
          continue;
        }
      }
      if (!p.mesh.visible) continue;
      anyActiveSmoke = true;

      const t = p.age / p.maxAge; // 0 -> 1
      const y = 3.5 + p.age * p.riseSpeed * (0.65 + norm * 0.45);
      const sway = Math.sin(elapsed * 1.2 + i) * (1.2 + t * 4.5);
      p.mesh.position.set(p.driftX * p.age + sway, y, p.driftZ * p.age + sway * 0.6);
      p.mesh.rotation.set(elapsed * 0.3 + i, elapsed * 0.4 + i, 0);

      const scale = p.baseScale * (0.8 + t * 3.1) * (0.45 + norm * 0.65);
      p.mesh.scale.setScalar(scale);

      const mat = p.mesh.material as THREE.MeshStandardMaterial;
      const fadeIn = THREE.MathUtils.smoothstep(t, 0, 0.12);
      const fadeOut = 1 - THREE.MathUtils.smoothstep(t, 0.58, 1.0);
      mat.opacity = fadeIn * fadeOut * (0.38 + norm * 0.44);
    }

    // Animate billowing white steam puffs
    let anyActiveSteam = false;
    for (let i = 0; i < this.steamPuffs.length; i++) {
      const p = this.steamPuffs[i];
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.mesh.visible = false;
        continue;
      }
      anyActiveSteam = true;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.vel.multiplyScalar(Math.exp(-1.2 * dt));
      const ratio = p.life / p.maxLife;
      p.mesh.scale.setScalar(p.baseScale * (1.8 - ratio * 0.8));
      const mat = p.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = ratio * 0.72;
    }

    // Hide root completely once fire is out and all smoke/steam dissipated
    if (!hasFire && !anyActiveSmoke && !anyActiveSteam) {
      this.root.visible = false;
    }
  }

  public dispose(): void {
    this.geometries.forEach((g) => g.dispose());
    this.materials.forEach((m) => m.dispose());
  }
}
