import * as THREE from 'three';
import { createDauphinAS365Rig, mergeStaticGroupByMaterial } from './DauphinModel';
import { createLandingMarkerTexture, createRotorBlurTexture } from './ProceduralTextures';
import type { HelicopterId } from './types';

export const BAMBI_CABLE_LENGTH = 6.6;
export const SEARCHLIGHT_SPOT_ANGLE = Math.PI / 16;

export interface HelicopterRig {
  helicopterId: HelicopterId;
  hasIntegratedTank: boolean;
  root: THREE.Group;
  bodyGroup: THREE.Group;
  mainRotorGroup: THREE.Group;
  mainRotorBlur: THREE.Mesh;
  tailRotorGroup: THREE.Group;
  tailRotorBlur: THREE.Mesh;
  beaconLightMesh: THREE.Mesh;
  beaconMat: THREE.MeshStandardMaterial;
  beaconGlow: THREE.Sprite;
  navRedMat: THREE.MeshStandardMaterial;
  navGreenMat: THREE.MeshStandardMaterial;
  navRedGlow: THREE.Sprite;
  navGreenGlow: THREE.Sprite;
  searchlightGimbal: THREE.Group;
  searchlight: THREE.SpotLight;
  searchlightTarget: THREE.Object3D;
  searchlightCone: THREE.Mesh;
  searchlightBulbMat: THREE.MeshStandardMaterial;
  landingMarker: THREE.Mesh;
  landingMarkerMat: THREE.MeshBasicMaterial;
  bucketPivot: THREE.Group;
  bucketWaterMesh: THREE.Mesh;
  bucketNozzleAnchor: THREE.Object3D;
  bellyNozzleAnchor: THREE.Object3D;
  winchAnchor?: THREE.Object3D;
  cockpitCamLocalPos: THREE.Vector3;
  updateLandingGear?: (dt: number, deployTarget: number) => void;
  applyLivery: (primaryHex: number | null, secondaryHex: number | null, accentHex: number | null) => void;
  setCockpitView: (active: boolean) => void;
  dispose: () => void;
}

interface LiveryPalette {
  primary: number;
  secondary: number;
  accent: number;
  skid: number;
  glass: number;
  bladeCount: number;
  bladeLen: number;
  bodyWidth: number;
  bodyLength: number;
  tailLen: number;
  hasFenestron: boolean;
  hasSidePods: boolean;
  hasStubWings: boolean;
  hasEmergencyBar: boolean;
  hasIntegratedTank: boolean;
}

const HELI_PALETTES: Record<HelicopterId, LiveryPalette> = {
  mayfly: {
    primary: 0xe63946,
    secondary: 0xf8fafc,
    accent: 0xfacc15,
    skid: 0x94a3b8,
    glass: 0x0f2438,
    bladeCount: 4,
    bladeLen: 5.4,
    bodyWidth: 2.12,
    bodyLength: 3.55,
    tailLen: 5.2,
    hasFenestron: false,
    hasSidePods: false,
    hasStubWings: false,
    hasEmergencyBar: false,
    hasIntegratedTank: false,
  },
  wren: {
    primary: 0xfacc15,
    secondary: 0xdc2626,
    accent: 0xf8fafc,
    skid: 0xcbd5e1,
    glass: 0x10253a,
    bladeCount: 4,
    bladeLen: 5.5,
    bodyWidth: 2.22,
    bodyLength: 3.9,
    tailLen: 5.4,
    hasFenestron: false,
    hasSidePods: true,
    hasStubWings: false,
    hasEmergencyBar: true,
    hasIntegratedTank: false,
  },
  mako: {
    primary: 0x1d4ed8,
    secondary: 0xf8fafc,
    accent: 0x38bdf8,
    skid: 0xdbeafe,
    glass: 0x0b1f33,
    bladeCount: 4,
    bladeLen: 5.65,
    bodyWidth: 2.04,
    bodyLength: 4.25,
    tailLen: 5.8,
    hasFenestron: false,
    hasSidePods: false,
    hasStubWings: true,
    hasEmergencyBar: false,
    hasIntegratedTank: false,
  },
  chipmunk: {
    primary: 0x4d7c0f,
    secondary: 0x334155,
    accent: 0xf59e0b,
    skid: 0x64748b,
    glass: 0x142634,
    bladeCount: 4,
    bladeLen: 6.0,
    bodyWidth: 2.55,
    bodyLength: 4.1,
    tailLen: 5.5,
    hasFenestron: false,
    hasSidePods: true,
    hasStubWings: false,
    hasEmergencyBar: false,
    hasIntegratedTank: false,
  },
  firekite: {
    primary: 0xea580c,
    secondary: 0xf8fafc,
    accent: 0x1e293b,
    skid: 0x475569,
    glass: 0x0f1d2c,
    bladeCount: 5,
    bladeLen: 6.1,
    bodyWidth: 2.5,
    bodyLength: 4.35,
    tailLen: 5.7,
    hasFenestron: false,
    hasSidePods: true,
    hasStubWings: false,
    hasEmergencyBar: true,
    hasIntegratedTank: true,
  },
  resolute: {
    primary: 0x1e293b,
    secondary: 0xef4444,
    accent: 0xfbbf24,
    skid: 0x334155,
    glass: 0x071320,
    bladeCount: 5,
    bladeLen: 6.3,
    bodyWidth: 2.48,
    bodyLength: 4.65,
    tailLen: 6.1,
    hasFenestron: true,
    hasSidePods: false,
    hasStubWings: true,
    hasEmergencyBar: false,
    hasIntegratedTank: false,
  },
};

/**
 * Builds one of 6 distinct composite low-poly helicopters (Mayfly, Wren, Mako, Chipmunk, Firekite, Resolute)
 * with custom geometry silhouettes, liveries, 360° nose gimbal searchlight, aviation nav lights,
 * and either a swinging Bambi Bucket or an integrated Fire Bomber ventral belly water tank.
 */
export function createHelicopterRig(
  maxAnisotropy: number,
  helicopterId: HelicopterId = 'mayfly'
): HelicopterRig {
  if (helicopterId === 'wren') {
    return createDauphinAS365Rig(maxAnisotropy);
  }
  const spec = HELI_PALETTES[helicopterId] ?? HELI_PALETTES.mayfly;
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };

  const primaryMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: spec.primary,
      roughness: helicopterId === 'resolute' ? 0.32 : 0.28,
      metalness: helicopterId === 'resolute' ? 0.22 : 0.15,
    })
  );
  const secondaryMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: spec.secondary,
      roughness: 0.27,
      metalness: 0.15,
    })
  );
  const accentMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: spec.accent,
      roughness: 0.3,
      metalness: 0.15,
    })
  );
  const darkMetalMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x263142, roughness: 0.46, metalness: 0.74 })
  );
  const chromeSkidMat = trackMat(
    new THREE.MeshStandardMaterial({ color: spec.skid, roughness: 0.18, metalness: 0.88 })
  );
  const cockpitGlassMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: spec.glass,
      roughness: 0.04,
      metalness: 0.9,
      transparent: true,
      opacity: 0.78,
    })
  );
  const cabinInteriorMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x0b1320, roughness: 0.9, metalness: 0.1 })
  );
  const exhaustInnerMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x090d14, roughness: 0.95, metalness: 0.2 })
  );
  const bladeMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.58, metalness: 0.32 })
  );
  const orangeBucketMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.42, metalness: 0.08 })
  );
  const bucketWaterMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.14, metalness: 0.2 })
  );

  // Aviation Navigation Lights
  const beaconMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 2.2,
      roughness: 0.15,
    })
  );
  const navGreenMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x22c55e,
      emissive: 0x22c55e,
      emissiveIntensity: 2.0,
      roughness: 0.2,
    })
  );
  const navRedMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0xef4444,
      emissiveIntensity: 2.0,
      roughness: 0.2,
    })
  );
  const searchlightBulbMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xfffbeb,
      emissive: 0xfef3c7,
      emissiveIntensity: 0,
      roughness: 0.15,
    })
  );

  const w = spec.bodyWidth;
  const len = spec.bodyLength;

  // === 1. PRIMARY FUSELAGE ===
  const bellyHeight = spec.hasIntegratedTank ? 0.62 : 0.72;
  const bellyY = spec.hasIntegratedTank ? 1.24 : 1.06;
  const bellyMesh = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(w, bellyHeight, len)),
    helicopterId === 'mako' || helicopterId === 'resolute' ? primaryMat : primaryMat
  );
  bellyMesh.position.set(0, bellyY, -0.05);
  bellyMesh.castShadow = true;
  bellyMesh.receiveShadow = true;
  bodyGroup.add(bellyMesh);

  const upperCabin = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(w * 0.96, 1.08, len * 0.94)),
    helicopterId === 'resolute' ? primaryMat : secondaryMat
  );
  upperCabin.position.set(0, bellyY + 0.82, 0.06);
  upperCabin.castShadow = true;
  upperCabin.receiveShadow = true;
  bodyGroup.add(upperCabin);

  // Nose geometry differs by archetype (pointed executive/stealth vs blunt heavy utility)
  const noseDepth = helicopterId === 'mako' || helicopterId === 'resolute' ? 1.55 : 1.15;
  const noseLower = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(w * 0.86, 0.66, noseDepth)),
    primaryMat
  );
  noseLower.position.set(0, bellyY + 0.06, -len / 2 - noseDepth * 0.36);
  noseLower.rotation.x = 0.16;
  noseLower.castShadow = true;
  bodyGroup.add(noseLower);

  const noseTipWidth = helicopterId === 'mako' || helicopterId === 'resolute' ? w * 0.54 : w * 0.72;
  const noseTip = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(noseTipWidth, 0.46, 0.78)),
    helicopterId === 'firekite' ? accentMat : secondaryMat
  );
  noseTip.position.set(0, bellyY + 0.22, -len / 2 - noseDepth * 0.78);
  noseTip.rotation.x = 0.3;
  noseTip.castShadow = true;
  bodyGroup.add(noseTip);

  // Racing / Livery Accent Stripe along fuselage sides
  const doorStripe = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(w * 1.01, 0.24, len * 0.86)),
    helicopterId === 'resolute' ? secondaryMat : primaryMat
  );
  doorStripe.position.set(0, bellyY + 0.56, 0.25);
  bodyGroup.add(doorStripe);

  if (helicopterId === 'resolute' || helicopterId === 'mako') {
    const goldTrim = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(w * 1.02, 0.1, len * 0.82)),
      accentMat
    );
    goldTrim.position.set(0, bellyY + 0.74, 0.25);
    bodyGroup.add(goldTrim);
  }

  // === 2. REFLECTIVE TRANSLUCENT COCKPIT CANOPY, INTERIOR & STRUCTURAL MULLIONS ===
  const cockpitHideOnFirstPerson: THREE.Object3D[] = [];

  const cockpitInterior = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(w * 0.78, 0.72, 1.32)),
    cabinInteriorMat
  );
  cockpitInterior.position.set(0, bellyY + 0.74, -len / 2 + 0.18);
  bodyGroup.add(cockpitInterior);
  cockpitHideOnFirstPerson.push(cockpitInterior);

  // Pilot seat backs & glare-shield console visible subtly through the translucent glass
  for (const sx of [-w * 0.2, w * 0.2]) {
    const seat = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.36, 0.58, 0.24)),
      darkMetalMat
    );
    seat.position.set(sx, bellyY + 0.78, -len * 0.18);
    bodyGroup.add(seat);
    cockpitHideOnFirstPerson.push(seat);
  }

  const windshieldTilt = helicopterId === 'mako' || helicopterId === 'resolute' ? 0.62 : 0.48;
  const windshield = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(w * 0.88, 0.94, 1.55)),
    cockpitGlassMat
  );
  windshield.position.set(0, bellyY + 0.84, -len / 2 - 0.1);
  windshield.rotation.x = windshieldTilt;
  windshield.castShadow = true;
  bodyGroup.add(windshield);
  cockpitHideOnFirstPerson.push(windshield);

  // Center windshield structural pillar + upper brow frame
  const centerMullion = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.08, 0.96, 1.58)),
    darkMetalMat
  );
  centerMullion.position.set(0, bellyY + 0.85, -len / 2 - 0.11);
  centerMullion.rotation.x = windshieldTilt;
  bodyGroup.add(centerMullion);
  cockpitHideOnFirstPerson.push(centerMullion);

  const browFrame = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(w * 0.92, 0.12, 0.24)),
    darkMetalMat
  );
  browFrame.position.set(0, bellyY + 1.32, -len / 2 + 0.18);
  bodyGroup.add(browFrame);

  // Sleek 1st-person interior glare-shield dash + subtle glowing avionics strips (shown only in Cockpit camera)
  const cockpitDashGroup = new THREE.Group();
  cockpitDashGroup.visible = false;
  const dashMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.78, metalness: 0.22 })
  );
  const avionicsCyanMat = trackMat(
    new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
  );
  const avionicsAmberMat = trackMat(
    new THREE.MeshBasicMaterial({ color: 0x34d399 })
  );

  const glareShield = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(w * 0.84, 0.18, 0.46)),
    dashMat
  );
  glareShield.position.set(0, bellyY + 0.62, -len / 2 - 0.56);
  cockpitDashGroup.add(glareShield);

  const mfdLeft = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.32, 0.08, 0.03)),
    avionicsCyanMat
  );
  mfdLeft.position.set(-0.28, bellyY + 0.65, -len / 2 - 0.34);
  mfdLeft.rotation.x = -0.35;
  cockpitDashGroup.add(mfdLeft);

  const mfdRight = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.32, 0.08, 0.03)),
    avionicsAmberMat
  );
  mfdRight.position.set(0.28, bellyY + 0.65, -len / 2 - 0.34);
  mfdRight.rotation.x = -0.35;
  cockpitDashGroup.add(mfdRight);

  // Left & right slanted cockpit A-pillars framing peripheral vision
  for (const side of [-1, 1]) {
    const aPillar = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.06, 0.82, 0.08)),
      dashMat
    );
    aPillar.position.set(side * (w * 0.42), bellyY + 1.0, -len / 2 - 0.52);
    aPillar.rotation.x = 0.48;
    aPillar.rotation.z = side * 0.1;
    cockpitDashGroup.add(aPillar);
  }
  bodyGroup.add(cockpitDashGroup);

  const cockpitCamLocalPos = new THREE.Vector3(0, bellyY + 1.04, -len / 2 - 0.08);

  const sideWindows = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(w * 0.99, 0.62, len * 0.52)),
    cockpitGlassMat
  );
  sideWindows.position.set(0, bellyY + 0.92, -len * 0.16);
  bodyGroup.add(sideWindows);

  // Crisp side door window frames / pillars
  for (const pz of [-len * 0.4, -len * 0.12, len * 0.1]) {
    const doorPost = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(w * 1.01, 0.68, 0.08)),
      darkMetalMat
    );
    doorPost.position.set(0, bellyY + 0.92, pz);
    bodyGroup.add(doorPost);
  }

  // === 3. ARCHETYPE-SPECIFIC COMPOSITE MODULES ===
  // 3A. Side Utility / Rescue / Turbine Pods (Wren, Chipmunk, Firekite)
  if (spec.hasSidePods) {
    const podLen = helicopterId === 'chipmunk' ? 2.6 : 2.1;
    const podMat = darkMetalMat;
    for (const side of [-1, 1]) {
      const pod = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(0.54, 0.58, podLen)),
        podMat
      );
      pod.position.set(side * (w / 2 + 0.22), bellyY + 0.14, 0.25);
      pod.castShadow = true;
      bodyGroup.add(pod);

      const podCap = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(0.56, 0.14, podLen * 0.85)),
        accentMat
      );
      podCap.position.set(side * (w / 2 + 0.22), bellyY + 0.45, 0.25);
      bodyGroup.add(podCap);
    }
  }

  // 3B. Swept Stub Wings + Twin Jet Nacelles (Mako & Resolute Flagship)
  if (spec.hasStubWings) {
    const wingSpan = helicopterId === 'resolute' ? 4.8 : 3.9;
    const wing = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(wingSpan, 0.18, 1.15)),
      helicopterId === 'resolute' ? primaryMat : secondaryMat
    );
    wing.position.set(0, bellyY + 0.35, 0.35);
    wing.castShadow = true;
    bodyGroup.add(wing);

    const wingTipMat = helicopterId === 'resolute' ? secondaryMat : accentMat;
    for (const side of [-1, 1]) {
      const winglet = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(0.14, 0.52, 0.95)),
        wingTipMat
      );
      winglet.position.set(side * (wingSpan / 2), bellyY + 0.54, 0.42);
      winglet.rotation.z = side * -0.22;
      bodyGroup.add(winglet);

      if (helicopterId === 'resolute') {
        const nacelleGeo = trackGeo(new THREE.CylinderGeometry(0.36, 0.32, 2.35, 10));
        nacelleGeo.rotateX(Math.PI / 2);
        const nacelle = new THREE.Mesh(nacelleGeo, darkMetalMat);
        nacelle.position.set(side * 1.68, bellyY + 0.65, 0.45);
        nacelle.castShadow = true;
        bodyGroup.add(nacelle);

        const trimRing = new THREE.Mesh(
          trackGeo(new THREE.CylinderGeometry(0.38, 0.38, 0.16, 10)),
          accentMat
        );
        trimRing.rotation.x = Math.PI / 2;
        trimRing.position.set(side * 1.68, bellyY + 0.65, -0.58);
        bodyGroup.add(trimRing);
      }
    }
  }

  // 3C. Emergency Roof Lightbar (Wren & Firekite)
  if (spec.hasEmergencyBar) {
    const barBase = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(1.15, 0.12, 0.28)),
      darkMetalMat
    );
    barBase.position.set(0, bellyY + 1.44, -len * 0.28);
    bodyGroup.add(barBase);

    const leftFlash = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.42, 0.16, 0.24)),
      navRedMat
    );
    leftFlash.position.set(-0.34, bellyY + 1.54, -len * 0.28);
    bodyGroup.add(leftFlash);

    const rightFlash = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.42, 0.16, 0.24)),
      beaconMat
    );
    rightFlash.position.set(0.34, bellyY + 1.54, -len * 0.28);
    bodyGroup.add(rightFlash);
  }

  // 3D. Integrated Ventral Fire Bomber Belly Tank (Firekite)
  const bellyNozzleAnchor = new THREE.Object3D();
  bellyNozzleAnchor.position.set(0, 0.42, 0.1);
  bodyGroup.add(bellyNozzleAnchor);

  if (spec.hasIntegratedTank) {
    const tankBody = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(w * 0.76, 0.64, len * 0.82)),
      primaryMat
    );
    tankBody.position.set(0, 0.66, 0.05);
    tankBody.castShadow = true;
    bodyGroup.add(tankBody);

    // Dual ventral bomb-bay drop doors + water level sight strip
    const bayDoors = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(w * 0.56, 0.14, len * 0.66)),
      darkMetalMat
    );
    bayDoors.position.set(0, 0.33, 0.08);
    bodyGroup.add(bayDoors);

    const waterGaugeStripe = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(w * 0.78, 0.14, len * 0.52)),
      bucketWaterMat
    );
    waterGaugeStripe.position.set(0, 0.68, 0.05);
    bodyGroup.add(waterGaugeStripe);

    // Retracted snorkel pump tube under rear belly
    const snorkel = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.11, 0.14, 1.35, 8)),
      darkMetalMat
    );
    snorkel.position.set(0.55, 0.46, 1.45);
    snorkel.rotation.x = 0.65;
    bodyGroup.add(snorkel);
  }

  // === 4. ENGINE COWLING & NAVIGATION LIGHTS ===
  const cowlingW = helicopterId === 'chipmunk' || helicopterId === 'resolute' ? 1.65 : 1.32;
  const cowling = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(cowlingW, 0.66, 2.55)),
    helicopterId === 'resolute' ? primaryMat : secondaryMat
  );
  cowling.position.set(0, bellyY + 1.6, 0.35);
  cowling.castShadow = true;
  bodyGroup.add(cowling);

  const cowlingCap = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(cowlingW + 0.04, 0.16, 2.25)),
    helicopterId === 'resolute' ? secondaryMat : primaryMat
  );
  cowlingCap.position.set(0, bellyY + 1.9, 0.35);
  bodyGroup.add(cowlingCap);

  const intakeGeo = trackGeo(new THREE.CylinderGeometry(0.24, 0.27, 0.78, 8));
  intakeGeo.rotateX(Math.PI / 2);
  const intakeBoreGeo = trackGeo(new THREE.CylinderGeometry(0.18, 0.18, 0.16, 8));
  intakeBoreGeo.rotateX(Math.PI / 2);
  const exhaustGeo = trackGeo(new THREE.CylinderGeometry(0.16, 0.2, 0.92, 8));
  exhaustGeo.rotateX(Math.PI / 2);
  const exhaustBoreGeo = trackGeo(new THREE.CylinderGeometry(0.12, 0.12, 0.14, 8));
  exhaustBoreGeo.rotateX(Math.PI / 2);

  // Dorsal VHF whip antenna on upper cowling rear
  const vhfAntenna = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.025, 0.035, 0.72, 5)),
    darkMetalMat
  );
  vhfAntenna.position.set(0, bellyY + 2.28, 1.25);
  vhfAntenna.rotation.x = -0.25;
  bodyGroup.add(vhfAntenna);

  const playerNavGlowTex = createNavGlowTexture();
  textures.push(playerNavGlowTex);
  let navRedGlow!: THREE.Sprite;
  let navGreenGlow!: THREE.Sprite;

  for (const side of [-1, 1]) {
    const intake = new THREE.Mesh(intakeGeo, darkMetalMat);
    intake.position.set(side * (cowlingW / 2 + 0.08), bellyY + 1.64, -0.48);
    bodyGroup.add(intake);

    const intakeBore = new THREE.Mesh(intakeBoreGeo, exhaustInnerMat);
    intakeBore.position.set(side * (cowlingW / 2 + 0.08), bellyY + 1.64, -0.84);
    bodyGroup.add(intakeBore);

    const exhaust = new THREE.Mesh(exhaustGeo, chromeSkidMat);
    exhaust.position.set(side * (cowlingW * 0.34), bellyY + 1.62, 1.72);
    exhaust.rotation.y = side * 0.18;
    bodyGroup.add(exhaust);

    const exhaustBore = new THREE.Mesh(exhaustBoreGeo, exhaustInnerMat);
    exhaustBore.position.set(side * (cowlingW * 0.34 + 0.08), bellyY + 1.62, 2.16);
    exhaustBore.rotation.y = side * 0.18;
    bodyGroup.add(exhaustBore);

    // Side winglet stub + prominent aviation navigation light (left=-X red, right=+X green)
    const navMount = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.32, 0.12, 0.32)), darkMetalMat);
    navMount.position.set(side * (w / 2 + 0.16), bellyY + 0.18, -0.85);
    bodyGroup.add(navMount);

    const navBulb = new THREE.Mesh(
      trackGeo(new THREE.SphereGeometry(0.16, 8, 8)),
      side < 0 ? navRedMat : navGreenMat
    );
    navBulb.position.set(side * (w / 2 + 0.34), bellyY + 0.18, -0.88);
    bodyGroup.add(navBulb);

    const navGlowMat = trackMat(
      new THREE.SpriteMaterial({
        map: playerNavGlowTex,
        color: side < 0 ? 0xff4444 : 0x22ff66,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    const navGlow = new THREE.Sprite(navGlowMat);
    navGlow.position.copy(navBulb.position);
    navGlow.scale.set(1.8, 1.8, 1);
    bodyGroup.add(navGlow);
    if (side < 0) navRedGlow = navGlow;
    else navGreenGlow = navGlow;
  }

  // === 5. 360° ARTICULATED NOSE SEARCHLIGHT GIMBAL ===
  const gimbalMountPos = new THREE.Vector3(0, 0.72, -len / 2 - 0.62);

  const gimbalBase = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.24, 0.28, 0.2, 10)),
    darkMetalMat
  );
  gimbalBase.position.set(gimbalMountPos.x, gimbalMountPos.y + 0.14, gimbalMountPos.z);
  bodyGroup.add(gimbalBase);

  const searchlightGimbal = new THREE.Group();
  searchlightGimbal.position.copy(gimbalMountPos);
  bodyGroup.add(searchlightGimbal);

  const housingGeo = trackGeo(new THREE.CylinderGeometry(0.18, 0.29, 0.48, 10));
  housingGeo.rotateX(-Math.PI / 2);
  const searchHousing = new THREE.Mesh(housingGeo, darkMetalMat);
  searchHousing.position.set(0, 0, 0.04);
  searchlightGimbal.add(searchHousing);

  const searchBulb = new THREE.Mesh(
    trackGeo(new THREE.SphereGeometry(0.21, 8, 8)),
    searchlightBulbMat
  );
  searchBulb.position.set(0, 0, 0.26);
  searchlightGimbal.add(searchBulb);

  const searchlight = new THREE.SpotLight(0xfff5d6, 0, 310, SEARCHLIGHT_SPOT_ANGLE, 0.28, 0.82);
  searchlight.position.set(0, 0, 0.28);
  searchlightGimbal.add(searchlight);

  const searchlightTarget = new THREE.Object3D();
  searchlightTarget.position.set(0, -18, -32);
  searchlight.target = searchlightTarget;

  const coneGeo = trackGeo(new THREE.ConeGeometry(1, 1, 24, 1, true));
  coneGeo.translate(0, -0.5, 0);
  coneGeo.rotateX(-Math.PI / 2);
  const coneMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xfff3c4,
      transparent: true,
      opacity: 0.09,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    })
  );
  const searchlightCone = new THREE.Mesh(coneGeo, coneMat);
  searchlightCone.visible = false;
  searchlightCone.frustumCulled = false;

  // === 6. LANDING SKIDS WITH CROSS-TUBES, SUPPORT STRUTS & BOARDING STEPS ===
  const skidLength = len + 1.15;
  const skidHalfWidth = w * 0.56 + (helicopterId === 'chipmunk' ? 0.18 : 0);
  const skidGeo = trackGeo(new THREE.CylinderGeometry(0.09, 0.09, skidLength, 8));
  skidGeo.rotateX(Math.PI / 2);
  const skidTipGeo = trackGeo(new THREE.CylinderGeometry(0.08, 0.09, 0.72, 8));
  const strutGeo = trackGeo(new THREE.CylinderGeometry(0.072, 0.072, 1.02, 6));
  const crossTubeGeo = trackGeo(new THREE.CylinderGeometry(0.068, 0.068, skidHalfWidth * 1.88, 6));
  crossTubeGeo.rotateZ(Math.PI / 2);

  // Transverse arched cross-tubes under fuselage
  for (const sz of [-1.25, 1.05]) {
    const crossTube = new THREE.Mesh(crossTubeGeo, darkMetalMat);
    crossTube.position.set(0, 0.72, sz);
    bodyGroup.add(crossTube);
  }

  for (const side of [-1, 1]) {
    const sx = side * skidHalfWidth;
    const skidBar = new THREE.Mesh(skidGeo, chromeSkidMat);
    skidBar.position.set(sx, 0.09, -0.2);
    skidBar.castShadow = true;
    bodyGroup.add(skidBar);

    const skidTip = new THREE.Mesh(skidTipGeo, chromeSkidMat);
    skidTip.position.set(sx, 0.29, -skidLength / 2 - 0.32);
    skidTip.rotation.x = Math.PI / 3;
    bodyGroup.add(skidTip);

    // Boarding step bar & skid rear wear shoe
    const stepBar = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.18, 0.05, 1.25)), darkMetalMat);
    stepBar.position.set(sx + side * 0.11, 0.36, -0.15);
    bodyGroup.add(stepBar);

    for (const sz of [-1.25, 1.05]) {
      const strut = new THREE.Mesh(strutGeo, darkMetalMat);
      strut.position.set(side * (skidHalfWidth - 0.18), 0.44, sz);
      strut.rotation.z = side * 0.44;
      strut.castShadow = true;
      bodyGroup.add(strut);
    }
  }

  // === 7. TAIL BOOM, STABILIZER & WHITE STROBE ===
  const tailStartZ = len / 2 - 0.15;
  const tailCenterZ = tailStartZ + spec.tailLen / 2;
  const tailTipZ = tailStartZ + spec.tailLen;

  const tailBoomGeo = trackGeo(new THREE.CylinderGeometry(0.24, 0.58, spec.tailLen, 6));
  tailBoomGeo.rotateX(Math.PI / 2);
  const tailBoom = new THREE.Mesh(
    tailBoomGeo,
    helicopterId === 'resolute' ? primaryMat : secondaryMat
  );
  tailBoom.position.set(0, bellyY + 0.94, tailCenterZ);
  tailBoom.castShadow = true;
  tailBoom.receiveShadow = true;
  bodyGroup.add(tailBoom);

  const tailStripeGeo = trackGeo(new THREE.CylinderGeometry(0.34, 0.42, 1.25, 6));
  tailStripeGeo.rotateX(Math.PI / 2);
  const tailStripe = new THREE.Mesh(
    tailStripeGeo,
    helicopterId === 'resolute' ? secondaryMat : primaryMat
  );
  tailStripe.position.set(0, bellyY + 0.94, tailCenterZ + 0.55);
  bodyGroup.add(tailStripe);

  const hStab = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(helicopterId === 'resolute' ? 3.2 : 2.6, 0.11, 0.66)),
    helicopterId === 'resolute' ? secondaryMat : primaryMat
  );
  hStab.position.set(0, bellyY + 0.98, tailTipZ - 1.25);
  hStab.castShadow = true;
  bodyGroup.add(hStab);

  for (const side of [-1, 1]) {
    const endplate = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.09, 0.56, 0.62)),
      helicopterId === 'resolute' ? accentMat : secondaryMat
    );
    endplate.position.set(side * (helicopterId === 'resolute' ? 1.58 : 1.28), bellyY + 1.04, tailTipZ - 1.25);
    bodyGroup.add(endplate);
  }

  const vFin = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.24, 1.95, 1.15)),
    helicopterId === 'resolute' ? primaryMat : primaryMat
  );
  vFin.position.set(0, bellyY + 1.5, tailTipZ - 0.12);
  vFin.rotation.x = helicopterId === 'mako' || helicopterId === 'resolute' ? -0.48 : -0.34;
  vFin.castShadow = true;
  bodyGroup.add(vFin);

  const vFinLower = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.16, 0.8, 0.56)),
    secondaryMat
  );
  vFinLower.position.set(0, bellyY + 0.44, tailTipZ - 0.25);
  vFinLower.rotation.x = 0.25;
  bodyGroup.add(vFinLower);

  // Shrouded Fenestron Tail Ring for Resolute Flagship
  if (spec.hasFenestron) {
    const shroud = new THREE.Mesh(
      trackGeo(new THREE.TorusGeometry(0.86, 0.14, 8, 18)),
      secondaryMat
    );
    shroud.rotation.y = Math.PI / 2;
    shroud.position.set(0, bellyY + 1.26, tailTipZ - 0.1);
    shroud.castShadow = true;
    bodyGroup.add(shroud);
  }

  const beaconLightMesh = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.17, 8, 8)), beaconMat);
  beaconLightMesh.position.set(0, bellyY + 2.48, tailTipZ + 0.22);
  bodyGroup.add(beaconLightMesh);

  const beaconGlowMat = trackMat(
    new THREE.SpriteMaterial({
      map: playerNavGlowTex,
      color: 0xffffff,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  const beaconGlow = new THREE.Sprite(beaconGlowMat);
  beaconGlow.position.copy(beaconLightMesh.position);
  beaconGlow.scale.set(2.4, 2.4, 1);
  bodyGroup.add(beaconGlow);

  // === 8. MAIN ROTOR, SWASHPLATE & TAIL ROTOR (WITH MOTION-BLUR DISCS) ===
  const mastY = bellyY + 2.18;
  const mast = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.17, 0.24, 0.76, 8)), darkMetalMat);
  mast.position.set(0, mastY, 0.1);
  mast.castShadow = true;
  bodyGroup.add(mast);

  // Cyclic swashplate assembly collar below rotor head
  const swashplate = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.36, 0.36, 0.12, 10)),
    chromeSkidMat
  );
  swashplate.position.set(0, mastY + 0.08, 0.1);
  bodyGroup.add(swashplate);

  const mainRotorGroup = new THREE.Group();
  mainRotorGroup.position.set(0, mastY + 0.36, 0.1);
  bodyGroup.add(mainRotorGroup);

  const rotorHub = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.42, 0.48, 0.26, 8)), darkMetalMat);
  mainRotorGroup.add(rotorHub);

  const rotorCap = new THREE.Mesh(
    trackGeo(new THREE.ConeGeometry(0.35, 0.24, 8)),
    helicopterId === 'resolute' ? accentMat : primaryMat
  );
  rotorCap.position.y = 0.2;
  mainRotorGroup.add(rotorCap);

  const bladeW = helicopterId === 'chipmunk' || helicopterId === 'firekite' || helicopterId === 'resolute' ? 0.32 : 0.26;
  const bladeGeo = trackGeo(new THREE.BoxGeometry(bladeW, 0.048, spec.bladeLen));
  const tipGeo = trackGeo(new THREE.BoxGeometry(bladeW + 0.01, 0.052, 0.58));

  for (let i = 0; i < spec.bladeCount; i++) {
    const bladePivot = new THREE.Group();
    bladePivot.rotation.y = (i * Math.PI * 2) / spec.bladeCount;

    const blade = new THREE.Mesh(bladeGeo, bladeMat);
    blade.position.set(0, 0, spec.bladeLen / 2 + 0.26);
    blade.castShadow = true;
    bladePivot.add(blade);

    const tip = new THREE.Mesh(tipGeo, accentMat);
    tip.position.set(0, 0, spec.bladeLen + 0.03);
    bladePivot.add(tip);

    mainRotorGroup.add(bladePivot);
  }

  const blurTex = createRotorBlurTexture(maxAnisotropy);
  textures.push(blurTex);
  const blurMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: blurTex,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  const mainRotorBlur = new THREE.Mesh(
    trackGeo(new THREE.CircleGeometry(spec.bladeLen + 0.32, 36)),
    blurMat
  );
  mainRotorBlur.rotation.x = -Math.PI / 2;
  mainRotorBlur.position.y = -0.01;
  mainRotorGroup.add(mainRotorBlur);

  const tailRotorGroup = new THREE.Group();
  tailRotorGroup.position.set(spec.hasFenestron ? 0 : 0.3, bellyY + 1.26, tailTipZ - 0.08);
  bodyGroup.add(tailRotorGroup);

  const tailHub = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.13, 0.13, 0.24, 8)), darkMetalMat);
  tailHub.rotation.z = Math.PI / 2;
  tailRotorGroup.add(tailHub);

  const tailBladeLen = spec.hasFenestron ? 1.42 : 1.78;
  const tailBlade = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.04, tailBladeLen, 0.14)), bladeMat);
  tailBlade.position.x = spec.hasFenestron ? 0 : 0.08;
  tailRotorGroup.add(tailBlade);

  if (spec.hasFenestron) {
    const crossTailBlade = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.04, 0.14, tailBladeLen)), bladeMat);
    tailRotorGroup.add(crossTailBlade);
  } else {
    for (const dir of [-1, 1]) {
      const tailTip = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.045, 0.22, 0.15)), accentMat);
      tailTip.position.set(0.08, dir * 0.78, 0);
      tailRotorGroup.add(tailTip);
    }
  }

  // Translucent spinning tail-rotor motion blur disc
  const tailBlurMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: blurTex,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  const tailRotorBlur = new THREE.Mesh(
    trackGeo(new THREE.CircleGeometry(tailBladeLen * 0.53, 24)),
    tailBlurMat
  );
  tailRotorBlur.rotation.y = Math.PI / 2;
  tailRotorBlur.position.x = spec.hasFenestron ? 0 : 0.09;
  tailRotorGroup.add(tailRotorBlur);

  // === 9. BAMBI BUCKET (larger bucket scale for Chipmunk/Resolute; hidden for Firekite's integrated tank) ===
  const bucketPivot = new THREE.Group();
  bucketPivot.visible = false;
  const bucketScaleXZ = helicopterId === 'chipmunk' || helicopterId === 'resolute' ? 1.32 : 1.0;

  const hookRing = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.14, 0.14, 0.22, 8)), darkMetalMat);
  hookRing.position.y = -0.1;
  bucketPivot.add(hookRing);

  const mainCableLen = BAMBI_CABLE_LENGTH - 1.65;
  const cableMesh = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.04, 0.04, mainCableLen, 6)),
    darkMetalMat
  );
  cableMesh.position.y = -mainCableLen / 2 - 0.1;
  bucketPivot.add(cableMesh);

  const bridleY = -mainCableLen - 0.1;
  const strapGeo = trackGeo(new THREE.CylinderGeometry(0.025, 0.025, 1.35, 5));
  for (let i = 0; i < 4; i++) {
    const ang = (i * Math.PI) / 2 + Math.PI / 4;
    const strap = new THREE.Mesh(strapGeo, accentMat);
    strap.position.set(Math.cos(ang) * 0.48 * bucketScaleXZ, bridleY - 0.56, Math.sin(ang) * 0.48 * bucketScaleXZ);
    strap.rotation.z = Math.cos(ang) * 0.62;
    strap.rotation.x = -Math.sin(ang) * 0.62;
    bucketPivot.add(strap);
  }

  const bucketCenterY = -BAMBI_CABLE_LENGTH;
  const bucketBody = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(1.02 * bucketScaleXZ, 0.58 * bucketScaleXZ, 1.48, 12)),
    orangeBucketMat
  );
  bucketBody.position.y = bucketCenterY;
  bucketBody.castShadow = true;
  bucketPivot.add(bucketBody);

  const bucketRim = new THREE.Mesh(
    trackGeo(new THREE.TorusGeometry(1.02 * bucketScaleXZ, 0.085, 8, 16)),
    accentMat
  );
  bucketRim.rotation.x = Math.PI / 2;
  bucketRim.position.y = bucketCenterY + 0.72;
  bucketPivot.add(bucketRim);

  const bucketBand = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.86 * bucketScaleXZ, 0.76 * bucketScaleXZ, 0.24, 12)),
    accentMat
  );
  bucketBand.position.y = bucketCenterY + 0.05;
  bucketPivot.add(bucketBand);

  const dumpValve = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.32 * bucketScaleXZ, 0.24 * bucketScaleXZ, 0.32, 10)),
    darkMetalMat
  );
  dumpValve.position.y = bucketCenterY - 0.82;
  bucketPivot.add(dumpValve);

  const bucketWaterMesh = new THREE.Mesh(
    trackGeo(new THREE.CircleGeometry(0.94 * bucketScaleXZ, 14)),
    bucketWaterMat
  );
  bucketWaterMesh.rotation.x = -Math.PI / 2;
  bucketWaterMesh.position.y = bucketCenterY + 0.66;
  bucketWaterMesh.visible = false;
  bucketPivot.add(bucketWaterMesh);

  const bucketNozzleAnchor = new THREE.Object3D();
  bucketNozzleAnchor.position.set(0, bucketCenterY - 0.95, 0);
  bucketPivot.add(bucketNozzleAnchor);

  // === 10. GROUND-PROJECTED CONTACT SHADOW & LANDING GUIDE RING ===
  const markerTex = createLandingMarkerTexture(maxAnisotropy);
  textures.push(markerTex);
  const landingMarkerMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: markerTex,
      color: 0xffffff,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    })
  );
  const landingMarker = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(7.6, 7.6)), landingMarkerMat);
  landingMarker.rotation.x = -Math.PI / 2;
  landingMarker.renderOrder = 6;

  // Batch static sub-meshes by material (restricting shadows to merged primary hull & main blades only)
  const cockpitExternalGroup = new THREE.Group();
  bodyGroup.add(cockpitExternalGroup);
  for (let i = 0; i < cockpitHideOnFirstPerson.length; i++) {
    cockpitExternalGroup.add(cockpitHideOnFirstPerson[i]);
  }
  const noShadows = new Set<THREE.Material>();
  mergeStaticGroupByMaterial(cockpitExternalGroup, new Set(), trackGeo, noShadows);
  mergeStaticGroupByMaterial(cockpitDashGroup, new Set(), trackGeo, noShadows);
  mergeStaticGroupByMaterial(
    mainRotorGroup,
    new Set<THREE.Object3D>([mainRotorBlur]),
    trackGeo,
    new Set<THREE.Material>([bladeMat])
  );
  mergeStaticGroupByMaterial(
    tailRotorGroup,
    new Set<THREE.Object3D>([tailRotorBlur]),
    trackGeo,
    noShadows
  );
  mergeStaticGroupByMaterial(
    bucketPivot,
    new Set<THREE.Object3D>([bucketWaterMesh]),
    trackGeo,
    noShadows
  );
  mergeStaticGroupByMaterial(
    bodyGroup,
    new Set<THREE.Object3D>([
      mainRotorGroup,
      tailRotorGroup,
      cockpitDashGroup,
      cockpitExternalGroup,
      searchlightGimbal,
      beaconLightMesh,
    ]),
    trackGeo,
    new Set<THREE.Material>([primaryMat])
  );
  searchlightGimbal.traverse((o) => { if (o instanceof THREE.Mesh) o.castShadow = false; });
  beaconLightMesh.castShadow = false;

  return {
    helicopterId,
    hasIntegratedTank: spec.hasIntegratedTank,
    root,
    bodyGroup,
    mainRotorGroup,
    mainRotorBlur,
    tailRotorGroup,
    tailRotorBlur,
    beaconLightMesh,
    beaconMat,
    beaconGlow,
    navRedMat,
    navGreenMat,
    navRedGlow,
    navGreenGlow,
    searchlightGimbal,
    searchlight,
    searchlightTarget,
    searchlightCone,
    searchlightBulbMat,
    landingMarker,
    landingMarkerMat,
    bucketPivot,
    bucketWaterMesh,
    bucketNozzleAnchor,
    bellyNozzleAnchor,
    cockpitCamLocalPos,
    applyLivery: (primaryHex, secondaryHex, accentHex) => {
      primaryMat.color.setHex(primaryHex ?? spec.primary);
      secondaryMat.color.setHex(secondaryHex ?? spec.secondary);
      accentMat.color.setHex(accentHex ?? spec.accent);
    },
    setCockpitView: (active) => {
      cockpitDashGroup.visible = active;
      cockpitExternalGroup.visible = !active;
    },
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
    },
  };
}

export type AIHelicopterVariant = 'executive_blue' | 'press_yellow';

export interface AIHelicopterRig {
  variant: AIHelicopterVariant;
  root: THREE.Group;
  bodyGroup: THREE.Group;
  mainRotorGroup: THREE.Group;
  mainRotorBlur: THREE.Mesh;
  tailRotorGroup: THREE.Group;
  tailRotorBlur: THREE.Mesh;
  strobeMat: THREE.MeshStandardMaterial;
  strobeSprite: THREE.Sprite;
  navRedMat: THREE.MeshStandardMaterial;
  navGreenMat: THREE.MeshStandardMaterial;
  navTailWhiteMat: THREE.MeshStandardMaterial;
  navGlowSprites: THREE.Sprite[];
  dispose: () => void;
}

function createNavGlowTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 1, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
  grad.addColorStop(0.28, 'rgba(255, 255, 255, 0.72)');
  grad.addColorStop(0.6, 'rgba(255, 255, 255, 0.18)');
  grad.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Lightweight low-poly AI helicopter rig sharing the project's silhouette & rotor-blur fidelity
 * with distinct civilian liveries (Executive Blue/Silver & Press/Utility Yellow/Black) and
 * long-range aviation navigation lights (port red, starboard green, tail white, blinking strobe).
 */
export function createAIHelicopterRig(
  maxAnisotropy: number,
  variant: AIHelicopterVariant
): AIHelicopterRig {
  const isExec = variant === 'executive_blue';
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };

  // Distinct liveries: Executive Cobalt Blue / Brushed Silver vs Press Taxi Yellow / Satin Black
  const primaryMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: isExec ? 0x1d4ed8 : 0xfacc15,
      roughness: isExec ? 0.27 : 0.3,
      metalness: 0.15,
    })
  );
  const secondaryMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: isExec ? 0xe2e8f0 : 0x18212f,
      roughness: isExec ? 0.26 : 0.34,
      metalness: isExec ? 0.24 : 0.15,
    })
  );
  const accentMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: isExec ? 0x38bdf8 : 0xf8fafc,
      roughness: 0.28,
      metalness: 0.15,
    })
  );
  const darkMetalMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x263142, roughness: 0.48, metalness: 0.7 })
  );
  const skidMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: isExec ? 0xcbd5e1 : 0x475569,
      roughness: 0.26,
      metalness: 0.8,
    })
  );
  const glassMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x0b1f33,
      roughness: 0.08,
      metalness: 0.85,
      transparent: true,
      opacity: 0.82,
    })
  );
  const bladeMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.58, metalness: 0.32 })
  );

  // Bright aviation navigation lights (visible from afar at night)
  const navRedMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xff3b3b,
      emissive: 0xef4444,
      emissiveIntensity: 2.8,
      roughness: 0.15,
    })
  );
  const navGreenMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x22ff66,
      emissive: 0x22c55e,
      emissiveIntensity: 2.8,
      roughness: 0.15,
    })
  );
  const navTailWhiteMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      emissive: 0xe2e8f0,
      emissiveIntensity: 2.4,
      roughness: 0.15,
    })
  );
  const strobeMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 3.5,
      roughness: 0.1,
    })
  );

  const w = isExec ? 2.04 : 2.18;
  const len = isExec ? 4.15 : 3.7;
  const tailLen = isExec ? 5.65 : 5.25;
  const bladeLen = isExec ? 5.55 : 5.35;
  const bellyY = 1.06;

  // 1. Fuselage & Nose
  const belly = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(w, 0.72, len)), primaryMat);
  belly.position.set(0, bellyY, -0.05);
  belly.castShadow = true;
  belly.receiveShadow = true;
  bodyGroup.add(belly);

  const upperCabin = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(w * 0.96, 1.06, len * 0.94)),
    secondaryMat
  );
  upperCabin.position.set(0, bellyY + 0.82, 0.06);
  upperCabin.castShadow = true;
  upperCabin.receiveShadow = true;
  bodyGroup.add(upperCabin);

  const noseDepth = isExec ? 1.48 : 1.15;
  const noseLower = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(w * 0.86, 0.64, noseDepth)),
    primaryMat
  );
  noseLower.position.set(0, bellyY + 0.06, -len / 2 - noseDepth * 0.36);
  noseLower.rotation.x = 0.16;
  noseLower.castShadow = true;
  bodyGroup.add(noseLower);

  const noseTip = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(isExec ? w * 0.56 : w * 0.72, 0.44, 0.76)),
    isExec ? secondaryMat : primaryMat
  );
  noseTip.position.set(0, bellyY + 0.22, -len / 2 - noseDepth * 0.78);
  noseTip.rotation.x = 0.3;
  bodyGroup.add(noseTip);

  // Livery side stripe
  const stripe = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(w * 1.01, 0.24, len * 0.88)),
    accentMat
  );
  stripe.position.set(0, bellyY + 0.54, 0.2);
  bodyGroup.add(stripe);

  // 2. Cockpit Glass & Side Windows
  const windshield = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(w * 0.88, 0.92, 1.5)),
    glassMat
  );
  windshield.position.set(0, bellyY + 0.84, -len / 2 - 0.08);
  windshield.rotation.x = isExec ? 0.6 : 0.48;
  bodyGroup.add(windshield);

  const sideWindows = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(w * 0.99, 0.6, len * 0.52)),
    glassMat
  );
  sideWindows.position.set(0, bellyY + 0.92, -len * 0.16);
  bodyGroup.add(sideWindows);

  // 3. Variant silhouette accents (Executive swept stub wings vs Press nose camera & side pods)
  if (isExec) {
    const wing = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.85, 0.16, 1.08)), secondaryMat);
    wing.position.set(0, bellyY + 0.34, 0.35);
    wing.castShadow = true;
    bodyGroup.add(wing);

    for (const side of [-1, 1]) {
      const winglet = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.14, 0.48, 0.88)), accentMat);
      winglet.position.set(side * 1.92, bellyY + 0.52, 0.4);
      winglet.rotation.z = side * -0.22;
      bodyGroup.add(winglet);
    }
  } else {
    // Press / Utility nose broadcast camera turret & side gear pods
    const camTurret = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.32, 10, 8)), secondaryMat);
    camTurret.position.set(0, 0.66, -len / 2 - 0.66);
    bodyGroup.add(camTurret);

    const camLens = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.12, 0.12, 0.18, 8)), glassMat);
    camLens.rotation.x = Math.PI / 2;
    camLens.position.set(0, 0.66, -len / 2 - 0.95);
    bodyGroup.add(camLens);

    for (const side of [-1, 1]) {
      const pod = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.46, 0.5, 2.0)), secondaryMat);
      pod.position.set(side * (w / 2 + 0.2), bellyY + 0.14, 0.25);
      pod.castShadow = true;
      bodyGroup.add(pod);

      const podStripe = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.48, 0.14, 1.75)), primaryMat);
      podStripe.position.set(side * (w / 2 + 0.2), bellyY + 0.36, 0.25);
      bodyGroup.add(podStripe);
    }
  }

  // 4. Engine Cowling & Exhausts
  const cowling = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.32, 0.64, 2.5)), secondaryMat);
  cowling.position.set(0, bellyY + 1.58, 0.35);
  cowling.castShadow = true;
  bodyGroup.add(cowling);

  const cowlingCap = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.36, 0.16, 2.2)), primaryMat);
  cowlingCap.position.set(0, bellyY + 1.88, 0.35);
  bodyGroup.add(cowlingCap);

  // 5. Skids
  const skidLength = len + 1.05;
  const skidHalfWidth = w * 0.56;
  const skidGeo = trackGeo(new THREE.CylinderGeometry(0.085, 0.085, skidLength, 7));
  skidGeo.rotateX(Math.PI / 2);
  const strutGeo = trackGeo(new THREE.CylinderGeometry(0.065, 0.065, 1.0, 6));

  for (const side of [-1, 1]) {
    const skidBar = new THREE.Mesh(skidGeo, skidMat);
    skidBar.position.set(side * skidHalfWidth, 0.09, -0.2);
    skidBar.castShadow = true;
    bodyGroup.add(skidBar);

    for (const sz of [-1.2, 1.0]) {
      const strut = new THREE.Mesh(strutGeo, darkMetalMat);
      strut.position.set(side * (skidHalfWidth - 0.18), 0.44, sz);
      strut.rotation.z = side * 0.44;
      bodyGroup.add(strut);
    }
  }

  // 6. Tail Boom, Stabilizer & Fin
  const tailStartZ = len / 2 - 0.15;
  const tailCenterZ = tailStartZ + tailLen / 2;
  const tailTipZ = tailStartZ + tailLen;

  const tailBoomGeo = trackGeo(new THREE.CylinderGeometry(0.24, 0.56, tailLen, 6));
  tailBoomGeo.rotateX(Math.PI / 2);
  const tailBoom = new THREE.Mesh(tailBoomGeo, isExec ? secondaryMat : primaryMat);
  tailBoom.position.set(0, bellyY + 0.94, tailCenterZ);
  tailBoom.castShadow = true;
  bodyGroup.add(tailBoom);

  const tailStripeGeo = trackGeo(new THREE.CylinderGeometry(0.34, 0.42, 1.2, 6));
  tailStripeGeo.rotateX(Math.PI / 2);
  const tailStripe = new THREE.Mesh(tailStripeGeo, isExec ? primaryMat : secondaryMat);
  tailStripe.position.set(0, bellyY + 0.94, tailCenterZ + 0.5);
  bodyGroup.add(tailStripe);

  const hStab = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.5, 0.1, 0.62)), primaryMat);
  hStab.position.set(0, bellyY + 0.98, tailTipZ - 1.2);
  bodyGroup.add(hStab);

  const vFin = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.22, 1.88, 1.1)),
    isExec ? primaryMat : secondaryMat
  );
  vFin.position.set(0, bellyY + 1.48, tailTipZ - 0.12);
  vFin.rotation.x = isExec ? -0.44 : -0.34;
  vFin.castShadow = true;
  bodyGroup.add(vFin);

  // 7. Full Aviation Navigation Lights + Long-Range Additive Night Glow Sprites
  const glowTex = createNavGlowTexture();
  textures.push(glowTex);
  const navGlowSprites: THREE.Sprite[] = [];

  const addNavLight = (
    x: number,
    y: number,
    z: number,
    bulbMat: THREE.MeshStandardMaterial,
    spriteColor: number,
    spriteScale: number
  ): THREE.Sprite => {
    const bulb = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.18, 8, 8)), bulbMat);
    bulb.position.set(x, y, z);
    bodyGroup.add(bulb);

    const spriteMat = trackMat(
      new THREE.SpriteMaterial({
        map: glowTex,
        color: spriteColor,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    const sprite = new THREE.Sprite(spriteMat);
    sprite.position.set(x, y, z);
    sprite.scale.set(spriteScale, spriteScale, 1);
    bodyGroup.add(sprite);
    return sprite;
  };

  // Port (left -X) RED and Starboard (right +X) GREEN wingtip/nav lights
  const navX = isExec ? 1.98 : w / 2 + 0.38;
  const navY = isExec ? bellyY + 0.56 : bellyY + 0.24;
  const navZ = isExec ? 0.35 : -0.82;
  navGlowSprites.push(addNavLight(-navX, navY, navZ, navRedMat, 0xff3b3b, 3.8));
  navGlowSprites.push(addNavLight(navX, navY, navZ, navGreenMat, 0x22ff66, 3.8));

  // Rear tail steady WHITE position light
  navGlowSprites.push(
    addNavLight(0, bellyY + 1.0, tailTipZ + 0.36, navTailWhiteMat, 0xe2f2ff, 3.0)
  );

  // Top tail fin high-visibility blinking WHITE strobe
  const strobeSprite = addNavLight(0, bellyY + 2.48, tailTipZ + 0.18, strobeMat, 0xffffff, 5.8);

  // 8. Main & Tail Rotors with Motion-Blur Discs
  const mastY = bellyY + 2.16;
  const mast = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.16, 0.22, 0.72, 7)), darkMetalMat);
  mast.position.set(0, mastY, 0.1);
  bodyGroup.add(mast);

  const mainRotorGroup = new THREE.Group();
  mainRotorGroup.position.set(0, mastY + 0.34, 0.1);
  bodyGroup.add(mainRotorGroup);

  const rotorHub = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.38, 0.44, 0.24, 8)), darkMetalMat);
  mainRotorGroup.add(rotorHub);

  const bladeGeo = trackGeo(new THREE.BoxGeometry(0.26, 0.045, bladeLen));
  const tipGeo = trackGeo(new THREE.BoxGeometry(0.27, 0.05, 0.54));

  for (let i = 0; i < 4; i++) {
    const pivot = new THREE.Group();
    pivot.rotation.y = (i * Math.PI) / 2;

    const blade = new THREE.Mesh(bladeGeo, bladeMat);
    blade.position.set(0, 0, bladeLen / 2 + 0.24);
    pivot.add(blade);

    const tip = new THREE.Mesh(tipGeo, accentMat);
    tip.position.set(0, 0, bladeLen + 0.02);
    pivot.add(tip);

    mainRotorGroup.add(pivot);
  }

  const blurTex = createRotorBlurTexture(maxAnisotropy);
  textures.push(blurTex);
  const mainBlurMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: blurTex,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  const mainRotorBlur = new THREE.Mesh(
    trackGeo(new THREE.CircleGeometry(bladeLen + 0.3, 32)),
    mainBlurMat
  );
  mainRotorBlur.rotation.x = -Math.PI / 2;
  mainRotorBlur.position.y = -0.01;
  mainRotorGroup.add(mainRotorBlur);

  const tailRotorGroup = new THREE.Group();
  tailRotorGroup.position.set(0.28, bellyY + 1.24, tailTipZ - 0.08);
  bodyGroup.add(tailRotorGroup);

  const tailBlade = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.04, 1.72, 0.14)), bladeMat);
  tailBlade.position.x = 0.08;
  tailRotorGroup.add(tailBlade);

  const tailBlurMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: blurTex,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  const tailRotorBlur = new THREE.Mesh(
    trackGeo(new THREE.CircleGeometry(0.92, 20)),
    tailBlurMat
  );
  tailRotorBlur.rotation.y = Math.PI / 2;
  tailRotorBlur.position.x = 0.09;
  tailRotorGroup.add(tailRotorBlur);

  // Batch AI helicopter static meshes & disable ALL shadows (only player helicopter casts shadows)
  const aiNoShadows = new Set<THREE.Material>();
  mergeStaticGroupByMaterial(
    mainRotorGroup,
    new Set<THREE.Object3D>([mainRotorBlur]),
    trackGeo,
    aiNoShadows
  );
  mergeStaticGroupByMaterial(
    bodyGroup,
    new Set<THREE.Object3D>([mainRotorGroup, tailRotorGroup]),
    trackGeo,
    aiNoShadows
  );
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = false;
  });

  return {
    variant,
    root,
    bodyGroup,
    mainRotorGroup,
    mainRotorBlur,
    tailRotorGroup,
    tailRotorBlur,
    strobeMat,
    strobeSprite,
    navRedMat,
    navGreenMat,
    navTailWhiteMat,
    navGlowSprites,
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
    },
  };
}

