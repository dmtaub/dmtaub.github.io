// bounce_particles.js
// A CPU-driven particle field that mirrors the ripple shader's wave math in 3D world space,
// giving the secondary camera something real to see.

import * as THREE from 'three';

const GRID_W = 100;
const GRID_H = 60;
const PARTICLE_COUNT = GRID_W * GRID_H;

// Store base XY grid positions separately so Z updates don't clobber them
const baseX = new Float32Array(PARTICLE_COUNT);
const baseY = new Float32Array(PARTICLE_COUNT);

let particleSystem = null;

function hsl2rgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h * 6) % 2) - 1));
  const m = l - c * 0.5;
  let r, g, b;
  if      (h < 1/6) { r = c; g = x; b = 0; }
  else if (h < 2/6) { r = x; g = c; b = 0; }
  else if (h < 3/6) { r = 0; g = c; b = x; }
  else if (h < 4/6) { r = 0; g = x; b = c; }
  else if (h < 5/6) { r = x; g = 0; b = c; }
  else              { r = c; g = 0; b = x; }
  return [r + m, g + m, b + m];
}

/**
 * Creates a grid of Points spanning the frustum and adds it to the scene.
 * @param {THREE.Scene} scene
 * @param {number} frustumWidth
 * @param {number} frustumHeight
 * @returns {THREE.Points}
 */
export function createParticleField(scene, frustumWidth, frustumHeight) {
  const positions = new Float32Array(PARTICLE_COUNT * 3);
  const colors    = new Float32Array(PARTICLE_COUNT * 3);

  for (let gy = 0; gy < GRID_H; gy++) {
    for (let gx = 0; gx < GRID_W; gx++) {
      const i = gy * GRID_W + gx;
      const x = (gx / (GRID_W - 1) - 0.5) * frustumWidth;
      const y = (gy / (GRID_H - 1) - 0.5) * frustumHeight;
      baseX[i] = x;
      baseY[i] = y;
      positions[i * 3]     = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = 0;
      colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = 0.05;
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setAttribute('color',    new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.PointsMaterial({
    size: 0.1,
    vertexColors: true,
    transparent: true,
    opacity: 0.75,
    sizeAttenuation: true,
  });

  particleSystem = new THREE.Points(geom, mat);
  scene.add(particleSystem);
  return particleSystem;
}

/**
 * Updates particle Z positions and colors each frame using the same wave math as the shader.
 * @param {THREE.Vector3} ballPosition
 * @param {THREE.Vector3} ballVelocity
 * @param {number} time  globalTime
 */
export function updateParticleField(ballPosition, ballVelocity, time) {
  if (!particleSystem) return;

  const velLen = ballVelocity.length();
  const vdx = velLen > 0.0001 ? ballVelocity.x / velLen : 1;
  const vdy = velLen > 0.0001 ? ballVelocity.y / velLen : 0;

  const posAttr = particleSystem.geometry.attributes.position;
  const colAttr = particleSystem.geometry.attributes.color;

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const dx = baseX[i] - ballPosition.x;
    const dy = baseY[i] - ballPosition.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    const dLong = dx * vdx + dy * vdy;
    const dPerp = -dx * vdy + dy * vdx;

    const radialWave = Math.sin(dist * 10 - time * 2);
    const dirWave    = Math.sin(-dLong * 10 - time * 2);

    const behindFade   = dLong < 0 ? 1.0 : 0.3;
    const distanceFade = Math.exp(-dist * 0.2);
    const perpFade     = Math.exp(-Math.abs(dPerp) * 0.5);
    const combinedFade = behindFade * distanceFade * perpFade;

    const wave = ((radialWave + 1) * 0.5) * ((dirWave + 1) * 0.5) * combinedFade;

    posAttr.setZ(i, wave * 1.2);

    const hue = ((0.6 + 0.1 * time + 0.02 * dist) % 1 + 1) % 1;
    const [r, g, b] = hsl2rgb(hue, 0.8, 0.08 + wave * 0.45);
    colAttr.setXYZ(i, r, g, b);
  }

  posAttr.needsUpdate = true;
  colAttr.needsUpdate = true;
}
