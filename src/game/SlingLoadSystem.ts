import * as THREE from 'three';
import { AIRBASE_CENTER, getSurfaceHeightAt, PORT_QUAY_POS } from './WorldData';
import type { ActiveSlingCargoState, HelipadData, SlingCargoPhase } from './types';

export const SLING_CABLE_LENGTH = 9.0;

const _hookWorld = new THREE.Vector3();
const _cargoTopWorld = new THREE.Vector3();
const _cableMid = new THREE.Vector3();
const _cableDir = new THREE.Vector3();
const _upVec = new THREE.Vector3(0, 1, 0);

interface CargoJobTemplate {
  id: string;
  cargoLabel: string;
  pickupLabel: string;
  pickupX: number;
  pickupZ: number;
  targetPadId: string;
  baseReward: number;
  xpReward: number;
}

const AIRBASE_APRON_X = AIRBASE_CENTER.x + 28;
const AIRBASE_APRON_Z = AIRBASE_CENTER.z + 18;
const PORT_APRON_X = PORT_QUAY_POS.x + 36;
const PORT_APRON_Z = PORT_QUAY_POS.z - 15;

// Validated flat pickup staging spots (2x Airbase apron & West Port Terminal) -> all 5 biomes & all 3 Oil Rigs
const CARGO_JOB_TEMPLATES: CargoJobTemplate[] = [
  {
    id: 'cargo_oilrig_alpha_gen',
    cargoLabel: 'Gerador Offshore Alpha',
    pickupLabel: 'Pátio da Base Aérea',
    pickupX: AIRBASE_APRON_X,
    pickupZ: AIRBASE_APRON_Z,
    targetPadId: 'pad_oilrig',
    baseReward: 2450,
    xpReward: 310,
  },
  {
    id: 'cargo_oilrig_bravo_drill',
    cargoLabel: 'Broca Petrolífera Bravo',
    pickupLabel: 'Terminal Portuário Oeste',
    pickupX: PORT_APRON_X,
    pickupZ: PORT_APRON_Z,
    targetPadId: 'pad_oilrig_bravo',
    baseReward: 2550,
    xpReward: 325,
  },
  {
    id: 'cargo_oilrig_charlie_valve',
    cargoLabel: 'Módulo Submarino Charlie',
    pickupLabel: 'Terminal Portuário Oeste',
    pickupX: PORT_APRON_X,
    pickupZ: PORT_APRON_Z,
    targetPadId: 'pad_oilrig_charlie',
    baseReward: 2350,
    xpReward: 295,
  },
  {
    id: 'cargo_pine_lift',
    cargoLabel: 'Motor do Teleférico',
    pickupLabel: 'Terminal Portuário Oeste',
    pickupX: PORT_APRON_X,
    pickupZ: PORT_APRON_Z,
    targetPadId: 'pad_pine_peak',
    baseReward: 1580,
    xpReward: 205,
  },
  {
    id: 'cargo_forest_supplies',
    cargoLabel: 'Módulo de Combate Florestal',
    pickupLabel: 'Pátio da Base Aérea',
    pickupX: AIRBASE_APRON_X,
    pickupZ: AIRBASE_APRON_Z,
    targetPadId: 'pad_forest_base',
    baseReward: 1460,
    xpReward: 190,
  },
  {
    id: 'cargo_farm_harvest',
    cargoLabel: 'Equipamento Agrícola Pesado',
    pickupLabel: 'Pátio da Base Aérea',
    pickupX: AIRBASE_APRON_X,
    pickupZ: AIRBASE_APRON_Z,
    targetPadId: 'pad_farm_verde',
    baseReward: 1320,
    xpReward: 175,
  },
  {
    id: 'cargo_desert_solar',
    cargoLabel: 'Inversor da Usina Solar',
    pickupLabel: 'Pátio da Base Aérea',
    pickupX: AIRBASE_APRON_X,
    pickupZ: AIRBASE_APRON_Z,
    targetPadId: 'pad_desert_solar',
    baseReward: 1260,
    xpReward: 165,
  },
  {
    id: 'cargo_desert_canyon',
    cargoLabel: 'Peças da Turbina Eólica',
    pickupLabel: 'Pátio da Base Aérea',
    pickupX: AIRBASE_APRON_X,
    pickupZ: AIRBASE_APRON_Z,
    targetPadId: 'pad_desert_canyon',
    baseReward: 1240,
    xpReward: 165,
  },
  {
    id: 'cargo_beach_radar',
    cargoLabel: 'Container de Salvamento Costeiro',
    pickupLabel: 'Terminal Portuário Oeste',
    pickupX: PORT_APRON_X,
    pickupZ: PORT_APRON_Z,
    targetPadId: 'pad_beach_sol',
    baseReward: 1480,
    xpReward: 190,
  },
  {
    id: 'cargo_tower_hvac',
    cargoLabel: 'Container Técnico HVAC',
    pickupLabel: 'Terminal Portuário Oeste',
    pickupX: PORT_APRON_X,
    pickupZ: PORT_APRON_Z,
    targetPadId: 'pad_b_zenith_tower',
    baseReward: 1080,
    xpReward: 145,
  },
  {
    id: 'cargo_dam_turbine',
    cargoLabel: 'Turbina Hidrelétrica',
    pickupLabel: 'Pátio da Base Aérea',
    pickupX: AIRBASE_APRON_X,
    pickupZ: AIRBASE_APRON_Z,
    targetPadId: 'pad_dam',
    baseReward: 1280,
    xpReward: 165,
  },
  {
    id: 'cargo_ski_supplies',
    cargoLabel: 'Suprimentos da Vila Alpina',
    pickupLabel: 'Terminal Portuário Oeste',
    pickupX: PORT_APRON_X,
    pickupZ: PORT_APRON_Z,
    targetPadId: 'pad_ski_base',
    baseReward: 1340,
    xpReward: 175,
  },
];

export interface SlingUpdateParams {
  dt: number;
  elapsedSec: number;
  heliPos: THREE.Vector3;
  heliVel: THREE.Vector3;
  heliAccel: THREE.Vector3;
  isLanded: boolean;
  sampleSurfaceY: (x: number, z: number, refY: number) => number;
}

export interface SlingUpdateEvents {
  delivered?: {
    cargoLabel: string;
    dropLabel: string;
    integrityPercent: number;
    finalReward: number;
    xpReward: number;
  };
  cargoDamaged?: {
    integrityPercent: number;
    reason: string;
  };
}

/**
 * Manages Heavy Cargo Sling Load missions:
 * - Stylized 3D yellow/black hazard industrial container + top lifting shackles
 * - Glowing pickup beacon ring & pulsing emerald/yellow destination drop zone
 * - Real-time steel cable & damped 2D pendulum physics reacting to helicopter inertia
 * - Hook / release via Key R (plus smooth gentle auto-release on target zone touchdown)
 * - Drop/impact integrity damage & intact delivery cash/XP bonus
 */
export class SlingLoadSystem {
  public readonly root = new THREE.Group();

  private geometries: THREE.BufferGeometry[] = [];
  private materials: THREE.Material[] = [];

  private cargoGroup = new THREE.Group();
  private pickupRingGroup = new THREE.Group();
  private pickupRingMat!: THREE.MeshBasicMaterial;
  private dropZoneGroup = new THREE.Group();
  private dropZoneMat!: THREE.MeshBasicMaterial;
  private cableMesh!: THREE.Mesh;

  private activeJob: {
    id: string;
    title: string;
    cargoLabel: string;
    pickupLabel: string;
    dropLabel: string;
    phase: SlingCargoPhase;
    cargoPos: THREE.Vector3;
    cargoVelY: number;
    dropPos: THREE.Vector3;
    dropRadius: number;
    integrity: number;
    reward: number;
    xpReward: number;
    swingX: number;
    swingZ: number;
    swingVelX: number;
    swingVelZ: number;
    inHookZone: boolean;
    inDropZone: boolean;
    hintText: string;
    damageCooldown: number;
  } | null = null;

  private lastJobIdx = -1;

  constructor() {
    this.buildVisuals();
  }

  private trackGeo<T extends THREE.BufferGeometry>(g: T): T {
    this.geometries.push(g);
    return g;
  }

  private trackMat<T extends THREE.Material>(m: T): T {
    this.materials.push(m);
    return m;
  }

  private buildVisuals(): void {
    // 1. Stylized Industrial Cargo Container / Generator Crate (2.8 x 2.1 x 2.8m)
    const crateMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.52, metalness: 0.45 })
    );
    const hazardYellowMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.36, metalness: 0.18 })
    );
    const steelMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.35, metalness: 0.78 })
    );
    const darkMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.65, metalness: 0.3 })
    );
    const beaconGlowMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xfde047,
        emissive: 0xf59e0b,
        emissiveIntensity: 2.4,
        roughness: 0.2,
      })
    );

    const body = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(2.8, 2.0, 2.8)), crateMat);
    body.position.y = 1.05;
    body.castShadow = true;
    body.receiveShadow = true;
    this.cargoGroup.add(body);

    // High-visibility yellow hazard bands & corner bumpers
    const bandTop = new THREE.Mesh(
      this.trackGeo(new THREE.BoxGeometry(2.88, 0.24, 2.88)),
      hazardYellowMat
    );
    bandTop.position.y = 1.88;
    this.cargoGroup.add(bandTop);

    const bandBot = new THREE.Mesh(
      this.trackGeo(new THREE.BoxGeometry(2.92, 0.26, 2.92)),
      hazardYellowMat
    );
    bandBot.position.y = 0.16;
    this.cargoGroup.add(bandBot);

    for (const sx of [-1.36, 1.36]) {
      for (const sz of [-1.36, 1.36]) {
        const post = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(0.24, 2.1, 0.24)), darkMat);
        post.position.set(sx, 1.05, sz);
        this.cargoGroup.add(post);
      }
    }

    // Side generator louvers & inspection panel
    for (const side of [-1, 1]) {
      const vent = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(0.1, 0.95, 1.65)), darkMat);
      vent.position.set(side * 1.41, 1.05, 0);
      this.cargoGroup.add(vent);
    }

    // Top 4-point steel sling bridle & hook ring
    const shackleGeo = this.trackGeo(new THREE.CylinderGeometry(0.045, 0.045, 1.65, 6));
    for (let i = 0; i < 4; i++) {
      const ang = (i * Math.PI) / 2 + Math.PI / 4;
      const strap = new THREE.Mesh(shackleGeo, steelMat);
      strap.position.set(Math.cos(ang) * 0.55, 2.55, Math.sin(ang) * 0.55);
      strap.rotation.z = Math.cos(ang) * 0.54;
      strap.rotation.x = -Math.sin(ang) * 0.54;
      this.cargoGroup.add(strap);
    }

    const topRing = new THREE.Mesh(
      this.trackGeo(new THREE.TorusGeometry(0.26, 0.06, 8, 14)),
      hazardYellowMat
    );
    topRing.position.y = 3.18;
    this.cargoGroup.add(topRing);

    // Top cargo beacon strobe dome so pickup is easy to spot day & night
    const beacon = new THREE.Mesh(this.trackGeo(new THREE.SphereGeometry(0.2, 8, 8)), beaconGlowMat);
    beacon.position.set(0, 2.18, 0);
    this.cargoGroup.add(beacon);

    this.cargoGroup.visible = false;
    this.root.add(this.cargoGroup);

    // 2. Pickup Beacon Ring around cargo on the ground
    this.pickupRingMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xfacc15,
        transparent: true,
        opacity: 0.72,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    const pRing = new THREE.Mesh(
      this.trackGeo(new THREE.RingGeometry(3.4, 4.4, 32)),
      this.pickupRingMat
    );
    pRing.rotation.x = -Math.PI / 2;
    pRing.position.y = 0.25;
    this.pickupRingGroup.add(pRing);

    const pBeamMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xfacc15,
        transparent: true,
        opacity: 0.14,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    const pBeam = new THREE.Mesh(
      this.trackGeo(new THREE.CylinderGeometry(3.6, 4.2, 16, 20, 1, true)),
      pBeamMat
    );
    pBeam.position.y = 8;
    this.pickupRingGroup.add(pBeam);

    this.pickupRingGroup.visible = false;
    this.root.add(this.pickupRingGroup);

    // 3. Destination Drop Zone Marker (glowing emerald/yellow pad halo)
    this.dropZoneMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: 0x34d399,
        transparent: true,
        opacity: 0.78,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    const dRingOuter = new THREE.Mesh(
      this.trackGeo(new THREE.RingGeometry(5.6, 7.0, 36)),
      this.dropZoneMat
    );
    dRingOuter.rotation.x = -Math.PI / 2;
    dRingOuter.position.y = 0.26;
    this.dropZoneGroup.add(dRingOuter);

    const dRingInner = new THREE.Mesh(
      this.trackGeo(new THREE.RingGeometry(2.4, 3.0, 28)),
      this.pickupRingMat
    );
    dRingInner.rotation.x = -Math.PI / 2;
    dRingInner.position.y = 0.28;
    this.dropZoneGroup.add(dRingInner);

    const dBeamMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: 0x34d399,
        transparent: true,
        opacity: 0.14,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    const dBeam = new THREE.Mesh(
      this.trackGeo(new THREE.CylinderGeometry(5.8, 6.8, 22, 24, 1, true)),
      dBeamMat
    );
    dBeam.position.y = 11;
    this.dropZoneGroup.add(dBeam);

    this.dropZoneGroup.visible = false;
    this.root.add(this.dropZoneGroup);

    // 4. Steel Sling Cable connecting helicopter belly hook to cargo top ring
    const cableGeo = this.trackGeo(new THREE.CylinderGeometry(0.055, 0.055, 1, 6));
    const cableMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.3, metalness: 0.82 })
    );
    this.cableMesh = new THREE.Mesh(cableGeo, cableMat);
    this.cableMesh.visible = false;
    this.root.add(this.cableMesh);
  }

  public spawnHeavyCargoMission(
    helipads: HelipadData[],
    rewardMult: number
  ): ActiveSlingCargoState {
    let idx = Math.floor(Math.random() * CARGO_JOB_TEMPLATES.length);
    if (idx === this.lastJobIdx) {
      idx = (idx + 1) % CARGO_JOB_TEMPLATES.length;
    }
    this.lastJobIdx = idx;
    const tpl = CARGO_JOB_TEMPLATES[idx];

    const targetPad =
      helipads.find((p) => p.id === tpl.targetPadId) ??
      helipads.find((p) => !p.isBase) ??
      helipads[0];

    const pickupY = getSurfaceHeightAt(tpl.pickupX, tpl.pickupZ);
    const reward = Math.round(tpl.baseReward * rewardMult);

    this.activeJob = {
      id: tpl.id,
      title: 'Transporte de Carga Pesada',
      cargoLabel: tpl.cargoLabel,
      pickupLabel: tpl.pickupLabel,
      dropLabel: targetPad.name,
      phase: 'AWAITING_PICKUP',
      cargoPos: new THREE.Vector3(tpl.pickupX, pickupY, tpl.pickupZ),
      cargoVelY: 0,
      dropPos: new THREE.Vector3(targetPad.x, targetPad.y, targetPad.z),
      dropRadius: Math.max(8.5, targetPad.radius * 0.9),
      integrity: 100,
      reward,
      xpReward: tpl.xpReward,
      swingX: 0,
      swingZ: 0,
      swingVelX: 0,
      swingVelZ: 0,
      inHookZone: false,
      inDropZone: false,
      hintText: 'Voe até a carga e paire baixo',
      damageCooldown: 0,
    };

    this.cargoGroup.position.copy(this.activeJob.cargoPos);
    this.cargoGroup.rotation.set(0, 0, 0);
    this.cargoGroup.visible = true;

    this.pickupRingGroup.position.copy(this.activeJob.cargoPos);
    this.pickupRingGroup.visible = true;

    this.dropZoneGroup.position.copy(this.activeJob.dropPos);
    this.dropZoneGroup.visible = true;

    this.cableMesh.visible = false;

    return this.getTelemetry(tpl.pickupX, tpl.pickupZ)!;
  }

  public hasActiveMission(): boolean {
    return this.activeJob !== null;
  }

  public isCarryingHeavyLoad(): boolean {
    return this.activeJob !== null && this.activeJob.phase === 'CARRYING';
  }

  public clear(): void {
    this.activeJob = null;
    this.cargoGroup.visible = false;
    this.pickupRingGroup.visible = false;
    this.dropZoneGroup.visible = false;
    this.cableMesh.visible = false;
  }

  /**
   * Handles Key R interaction when a Sling Load mission is active (hook or release cargo).
   */
  public toggleHook(
    heliPos: THREE.Vector3,
    heliVel: THREE.Vector3,
    isLanded: boolean,
    sampleSurfaceY: (x: number, z: number, refY: number) => number
  ): {
    handled: boolean;
    hooked: boolean;
    released: boolean;
    title: string;
    detail: string;
    tone: 'info' | 'success' | 'warning';
    delivered?: SlingUpdateEvents['delivered'];
  } {
    const job = this.activeJob;
    if (!job) {
      return {
        handled: false,
        hooked: false,
        released: false,
        title: '',
        detail: '',
        tone: 'info',
      };
    }

    if (job.phase === 'AWAITING_PICKUP' || job.phase === 'DROPPED_RECOVERY') {
      if (isLanded) {
        return {
          handled: true,
          hooked: false,
          released: false,
          title: 'Gancho de Carga',
          detail: 'Decole e paire baixo (6m–18m) sobre a carga para engatar o cabo.',
          tone: 'info',
        };
      }

      const horizDist = Math.hypot(heliPos.x - job.cargoPos.x, heliPos.z - job.cargoPos.z);
      const vertGap = heliPos.y - job.cargoPos.y;
      const horizSpeed = Math.hypot(heliVel.x, heliVel.z);

      if (horizDist > 12.5) {
        return {
          handled: true,
          hooked: false,
          released: false,
          title: 'Aproxime-se da Carga',
          detail: `Faltam ${Math.round(horizDist)}m na horizontal para engatar o cabo [R].`,
          tone: 'warning',
        };
      }
      if (vertGap < 4.5 || vertGap > 21) {
        return {
          handled: true,
          hooked: false,
          released: false,
          title: 'Ajuste a Altitude',
          detail: `Paire entre 5m e 20m acima da carga (atual: ${Math.round(vertGap)}m).`,
          tone: 'warning',
        };
      }
      if (horizSpeed > 13.5) {
        return {
          handled: true,
          hooked: false,
          released: false,
          title: 'Reduza a Velocidade',
          detail: 'Estabilize o pairado sobre a carga antes de engatar o cabo.',
          tone: 'warning',
        };
      }

      job.phase = 'CARRYING';
      job.cargoVelY = 0;
      job.swingX = 0;
      job.swingZ = 0;
      job.swingVelX = 0;
      job.swingVelZ = 0;
      this.pickupRingGroup.visible = false;
      this.cableMesh.visible = true;

      return {
        handled: true,
        hooked: true,
        released: false,
        title: `Carga Engatada: ${job.cargoLabel}`,
        detail: `Leve com suavidade até ${job.dropLabel} e pouse a carga no alvo.`,
        tone: 'success',
      };
    }

    // Currently CARRYING -> Release the sling hook
    const groundY = sampleSurfaceY(job.cargoPos.x, job.cargoPos.z, job.cargoPos.y + 3);
    const heightAboveGround = Math.max(0, job.cargoPos.y - groundY);
    const distToDrop = Math.hypot(job.cargoPos.x - job.dropPos.x, job.cargoPos.z - job.dropPos.z);
    const dropVertDiff = Math.abs(job.cargoPos.y - job.dropPos.y);

    // Clean immediate delivery if released gently right over the target drop zone
    if (distToDrop <= job.dropRadius + 2.5 && heightAboveGround <= 3.6 && dropVertDiff <= 4.5) {
      const delivery = this.completeDelivery();
      return {
        handled: true,
        hooked: false,
        released: true,
        title: 'Carga Entregue!',
        detail: `${delivery.cargoLabel} em ${delivery.dropLabel} (${delivery.integrityPercent}% intacta) · +$${delivery.finalReward}`,
        tone: 'success',
        delivered: delivery,
      };
    }

    // Otherwise release into gravity fall (DROPPED_RECOVERY)
    job.phase = 'DROPPED_RECOVERY';
    job.cargoVelY = Math.min(0, heliVel.y);
    this.cableMesh.visible = false;
    this.pickupRingGroup.visible = true;

    return {
      handled: true,
      hooked: false,
      released: true,
      title: 'Cabo Solto',
      detail:
        heightAboveGround > 3.6
          ? 'Cuidado! A carga foi solta muito alta e pode sofrer dano no impacto.'
          : 'Carga depositada no solo. Pressione [R] sobre ela para engatar novamente.',
      tone: heightAboveGround > 3.6 ? 'warning' : 'info',
    };
  }

  private completeDelivery(): NonNullable<SlingUpdateEvents['delivered']> {
    const job = this.activeJob!;
    const integrityPercent = Math.max(25, Math.round(job.integrity));
    const bonusMult = integrityPercent >= 95 ? 1.25 : integrityPercent / 100;
    const finalReward = Math.round(job.reward * bonusMult);
    const result = {
      cargoLabel: job.cargoLabel,
      dropLabel: job.dropLabel,
      integrityPercent,
      finalReward,
      xpReward: job.xpReward,
    };
    this.clear();
    return result;
  }

  public update(params: SlingUpdateParams): SlingUpdateEvents {
    const events: SlingUpdateEvents = {};
    const job = this.activeJob;
    if (!job) return events;

    const { dt, elapsedSec, heliPos, heliVel, heliAccel, isLanded, sampleSurfaceY } = params;
    if (job.damageCooldown > 0) job.damageCooldown -= dt;

    // Pulse visual markers
    const pulse = 0.92 + Math.sin(elapsedSec * 4.5) * 0.08;
    if (this.pickupRingGroup.visible) {
      this.pickupRingGroup.position.set(job.cargoPos.x, job.cargoPos.y, job.cargoPos.z);
      this.pickupRingGroup.scale.set(pulse, 1, pulse);
    }
    if (this.dropZoneGroup.visible) {
      this.dropZoneGroup.position.copy(job.dropPos);
      this.dropZoneGroup.scale.set(pulse, 1, pulse);
    }

    if (job.phase === 'AWAITING_PICKUP' || job.phase === 'DROPPED_RECOVERY') {
      // Gravity settle if dropped in mid-air
      const surfY = sampleSurfaceY(job.cargoPos.x, job.cargoPos.z, job.cargoPos.y + 3);
      if (job.cargoPos.y > surfY + 0.04 || job.cargoVelY < 0) {
        job.cargoVelY -= 16.5 * dt;
        job.cargoPos.y += job.cargoVelY * dt;
        if (job.cargoPos.y <= surfY) {
          const impactSpeed = Math.abs(job.cargoVelY);
          job.cargoPos.y = surfY;
          job.cargoVelY = 0;

          if (impactSpeed > 7.5) {
            const dmg = Math.min(45, Math.round((impactSpeed - 6.5) * 3.8));
            job.integrity = Math.max(25, job.integrity - dmg);
            events.cargoDamaged = {
              integrityPercent: Math.round(job.integrity),
              reason: 'Queda Brusca da Carga',
            };
          }

          // If dropped directly inside the destination zone, finalize delivery even after short fall
          const distDrop = Math.hypot(
            job.cargoPos.x - job.dropPos.x,
            job.cargoPos.z - job.dropPos.z
          );
          if (distDrop <= job.dropRadius + 2.0 && Math.abs(job.cargoPos.y - job.dropPos.y) <= 4.0) {
            events.delivered = this.completeDelivery();
            return events;
          }
        }
      }

      this.cargoGroup.position.copy(job.cargoPos);
      this.cargoGroup.rotation.set(0, 0, 0);

      const horizDist = Math.hypot(heliPos.x - job.cargoPos.x, heliPos.z - job.cargoPos.z);
      const vertGap = heliPos.y - job.cargoPos.y;
      const horizSpeed = Math.hypot(heliVel.x, heliVel.z);

      job.inHookZone =
        !isLanded && horizDist <= 12.0 && vertGap >= 4.8 && vertGap <= 20.5 && horizSpeed <= 13.0;
      job.inDropZone = false;

      if (job.inHookZone) {
        job.hintText = 'PRONTO · APERTE [R] P/ ENGATAR';
        this.pickupRingMat.color.setHex(0x34d399);
      } else if (horizDist > 12.0) {
        job.hintText = `APROXIME-SE (${Math.round(horizDist)}m)`;
        this.pickupRingMat.color.setHex(0xfacc15);
      } else if (vertGap > 20.5) {
        job.hintText = 'DESÇA MAIS SOBRE A CARGA';
        this.pickupRingMat.color.setHex(0xfacc15);
      } else {
        job.hintText = 'ESTABILIZE E APERTE [R]';
        this.pickupRingMat.color.setHex(0xfacc15);
      }
      return events;
    }

    // === CARRYING PHASE: Damped 2D Pendulum + Steel Cable ===
    const gravityOverL = 9.81 / SLING_CABLE_LENGTH;
    const damping = 2.15;

    const torqueX =
      -heliAccel.x * 0.042 -
      heliVel.x * 0.012 -
      gravityOverL * job.swingX -
      damping * job.swingVelX;
    const torqueZ =
      -heliAccel.z * 0.042 -
      heliVel.z * 0.012 -
      gravityOverL * job.swingZ -
      damping * job.swingVelZ;

    job.swingVelX += torqueX * dt;
    job.swingVelZ += torqueZ * dt;
    job.swingX = THREE.MathUtils.clamp(job.swingX + job.swingVelX * dt, -0.46, 0.46);
    job.swingZ = THREE.MathUtils.clamp(job.swingZ + job.swingVelZ * dt, -0.46, 0.46);

    _hookWorld.set(heliPos.x, heliPos.y + 0.5, heliPos.z);

    const swayX = Math.sin(job.swingX) * SLING_CABLE_LENGTH;
    const swayZ = Math.sin(job.swingZ) * SLING_CABLE_LENGTH;
    const hangDrop = Math.sqrt(
      Math.max(4, SLING_CABLE_LENGTH * SLING_CABLE_LENGTH - swayX * swayX - swayZ * swayZ)
    );

    const desiredCargoX = _hookWorld.x + swayX;
    const desiredCargoZ = _hookWorld.z + swayZ;
    // Subtract 3.1m because cargo origin is at bottom of container while shackle ring is at y + 3.1m
    const desiredCargoY = _hookWorld.y - hangDrop - 3.1;

    const surfY = sampleSurfaceY(desiredCargoX, desiredCargoZ, desiredCargoY + 4);
    let clampedCargoY = desiredCargoY;
    const touchingGround = desiredCargoY <= surfY + 0.12;

    if (touchingGround) {
      clampedCargoY = surfY;
      // Dampen horizontal drag when skimming/setting down
      job.swingVelX *= Math.max(0, 1 - dt * 5);
      job.swingVelZ *= Math.max(0, 1 - dt * 5);

      const horizSpeed = Math.hypot(heliVel.x, heliVel.z);
      const vertSpeed = Math.abs(heliVel.y);
      const distToDrop = Math.hypot(desiredCargoX - job.dropPos.x, desiredCargoZ - job.dropPos.z);

      // Gentle auto-release when touching down cleanly inside destination drop zone!
      if (
        distToDrop <= job.dropRadius + 1.8 &&
        Math.abs(surfY - job.dropPos.y) <= 3.5 &&
        horizSpeed < 7.8 &&
        vertSpeed < 4.8
      ) {
        events.delivered = this.completeDelivery();
        return events;
      }

      // Slamming the hanging cargo into terrain/rooftops at high speed damages cargo integrity
      if ((horizSpeed > 14 || vertSpeed > 7.5) && job.damageCooldown <= 0) {
        job.damageCooldown = 1.2;
        job.integrity = Math.max(25, job.integrity - 12);
        events.cargoDamaged = {
          integrityPercent: Math.round(job.integrity),
          reason: 'Impacto na Carga Suspensa',
        };
      }
    }

    job.cargoPos.set(desiredCargoX, clampedCargoY, desiredCargoZ);
    this.cargoGroup.position.copy(job.cargoPos);
    this.cargoGroup.rotation.set(job.swingZ * 0.72, 0, -job.swingX * 0.72);

    // Orient steel cable mesh between belly hook and cargo shackle top
    _cargoTopWorld.set(job.cargoPos.x, job.cargoPos.y + 3.1, job.cargoPos.z);
    _cableDir.subVectors(_hookWorld, _cargoTopWorld);
    const cableLen = Math.max(0.5, _cableDir.length());
    _cableMid.addVectors(_hookWorld, _cargoTopWorld).multiplyScalar(0.5);
    this.cableMesh.position.copy(_cableMid);
    this.cableMesh.scale.set(1, cableLen, 1);
    _cableDir.normalize();
    this.cableMesh.quaternion.setFromUnitVectors(_upVec, _cableDir);
    this.cableMesh.visible = true;

    const distToDrop = Math.hypot(job.cargoPos.x - job.dropPos.x, job.cargoPos.z - job.dropPos.z);
    const heightAboveDrop = Math.max(0, job.cargoPos.y - job.dropPos.y);
    job.inHookZone = false;
    job.inDropZone = distToDrop <= job.dropRadius + 1.5;

    if (job.inDropZone) {
      this.dropZoneMat.color.setHex(0x4ade80);
      if (heightAboveDrop <= 3.4) {
        job.hintText = 'SOLTAR [R] OU POUSAR SUAVE';
      } else {
        job.hintText = `SOBRE O ALVO · DESÇA ${Math.round(heightAboveDrop)}m`;
      }
    } else {
      this.dropZoneMat.color.setHex(0x34d399);
      job.hintText = `LEVE ATÉ ${job.dropLabel.toUpperCase()} (${Math.round(distToDrop)}m)`;
    }

    return events;
  }

  public getTelemetry(heliX: number, heliZ: number): ActiveSlingCargoState | null {
    const job = this.activeJob;
    if (!job) return null;

    const targetX = job.phase === 'CARRYING' ? job.dropPos.x : job.cargoPos.x;
    const targetZ = job.phase === 'CARRYING' ? job.dropPos.z : job.cargoPos.z;
    const dist = Math.round(Math.hypot(targetX - heliX, targetZ - heliZ));

    return {
      id: job.id,
      title: job.title,
      cargoLabel: job.cargoLabel,
      pickupLabel: job.pickupLabel,
      dropLabel: job.dropLabel,
      phase: job.phase,
      cargoX: job.cargoPos.x,
      cargoY: job.cargoPos.y,
      cargoZ: job.cargoPos.z,
      dropX: job.dropPos.x,
      dropY: job.dropPos.y,
      dropZ: job.dropPos.z,
      integrityPercent: Math.round(job.integrity),
      inHookZone: job.inHookZone,
      inDropZone: job.inDropZone,
      hintText: job.hintText,
      distanceMeters: dist,
      reward: job.reward,
      xpReward: job.xpReward,
    };
  }

  public dispose(): void {
    this.geometries.forEach((g) => g.dispose());
    this.materials.forEach((m) => m.dispose());
    this.geometries = [];
    this.materials = [];
    this.root.clear();
  }
}
