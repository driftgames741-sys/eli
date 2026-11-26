import * as THREE from 'three';
import type { GraphicsQuality, WeatherMode } from './types';

export interface FoliageChunk {
  sphere: THREE.Sphere;
  group: THREE.Group;
  isVisible: boolean;
}

export interface SpatialDetailLayer {
  object: THREE.Object3D;
  sphere: THREE.Sphere;
  maxDistHigh: number;
  maxDistLow: number;
  requireLightsOn?: boolean;
  isVisible: boolean;
}

/**
 * Creates a crisp 64x64 additive radial glow dot for distant night traffic headlights/taillights (> 220m).
 */
export function createTrafficLightDotTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);

  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 30);
  grad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
  grad.addColorStop(0.28, 'rgba(255, 255, 255, 0.92)');
  grad.addColorStop(0.58, 'rgba(255, 255, 255, 0.36)');
  grad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Spatial Frustum Culling & Micro-Detail Streaming Manager:
 * - Vegetation chunks (trees, giant redwoods, snow pines, palms, cacti) use PURE Frustum Culling ("O CONE")
 *   with ZERO distance cutoff so biomes stay lush and rich all the way to the fog horizon with zero pop-in.
 * - Micro-detail layers (streetlamps, tiny rooftop antennas/HVAC, individual beach umbrellas) cull beyond
 *   450m–600m and outside the camera frustum to keep city & beach frame rates locked high.
 */
export class SpatialLODManager {
  private foliageChunks: FoliageChunk[] = [];
  private detailLayers: SpatialDetailLayer[] = [];

  public addFoliageChunk(sphere: THREE.Sphere, group: THREE.Group): void {
    group.frustumCulled = true;
    this.foliageChunks.push({
      sphere,
      group,
      isVisible: group.visible,
    });
  }

  public addDetailLayer(
    object: THREE.Object3D,
    sphere: THREE.Sphere,
    maxDistHigh: number,
    maxDistLow: number,
    requireLightsOn = false
  ): void {
    object.frustumCulled = true;
    this.detailLayers.push({
      object,
      sphere,
      maxDistHigh,
      maxDistLow,
      requireLightsOn,
      isVisible: object.visible,
    });
  }

  public update(
    cameraPos: THREE.Vector3,
    frustum: THREE.Frustum,
    quality: GraphicsQuality,
    weather: WeatherMode,
    lightsOnFactor: number
  ): void {
    // 1. O CONE (Pure Frustum Culling for Foliage):
    //    NEVER hide trees, giant redwoods, snow pines, palms, or cacti by distance — keep InstancedMesh
    //    always visible throughout the entire camera & fog range while skipping chunks behind the camera.
    for (let i = 0; i < this.foliageChunks.length; i++) {
      const ch = this.foliageChunks[i];
      const inView = frustum.intersectsSphere(ch.sphere);
      if (inView !== ch.isVisible) {
        ch.group.visible = inView;
        ch.isVisible = inView;
      }
    }

    // 2. Micro-Details Only (450m–600m distance culling + frustum culling):
    //    Streetlamps, tiny rooftop antennas/HVAC, and individual beach umbrellas.
    const weatherDistMult =
      weather === 'FOG' ? 0.72 : weather === 'BLIZZARD' ? 0.84 : weather === 'STORM' ? 0.92 : 1.0;

    const qualityMult =
      quality === 'ultra' ? 1.12 : quality === 'high' ? 1.0 : quality === 'medium' ? 0.9 : 0.84;

    const lightsActive = lightsOnFactor > 0.04;
    for (let i = 0; i < this.detailLayers.length; i++) {
      const layer = this.detailLayers[i];
      let show = true;

      if (layer.requireLightsOn && !lightsActive) {
        show = false;
      } else if (!frustum.intersectsSphere(layer.sphere)) {
        show = false;
      } else {
        const baseDist =
          quality === 'low' ? layer.maxDistLow : layer.maxDistHigh * qualityMult;
        const maxDist = Math.max(450, baseDist * weatherDistMult);
        const edgeDist = Math.max(
          0,
          cameraPos.distanceTo(layer.sphere.center) - layer.sphere.radius * 0.65
        );
        if (edgeDist > maxDist) {
          show = false;
        }
      }

      if (show !== layer.isVisible) {
        layer.object.visible = show;
        layer.isVisible = show;
      }
    }
  }
}
