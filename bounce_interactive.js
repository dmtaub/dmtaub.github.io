// bounce_interactive.js
// This module contains most of the interactive logic for the ball, attractors,
// gravity, bouncing, proximity checks, and targets. It exports references and
// functions that can be used by the main threejs_bounce.js file.

import * as THREE from 'three';

// A global list of attractor objects, exposed for debugging
export const objects = [];

// The ball's velocity is tracked here, though the ball mesh resides in threejs_bounce.js
export let ballVelocity = new THREE.Vector3(0.04, 0, 0);

// Constants
export const ballRadius = 0.5;
export const effectRadius = 2.0;

// Attractor management
let attractorCount = 0;
const max_attractors = 1;
const attractionStrength = 0.0005;

// A convenience function for creating a new attractor
export function addAttractor(pos, scene) {
  if (!pos) pos = getRandomPosition(scene);
  makeRippleAt(pos); // Provide a default ripple effect if needed

  const ddGeom = new THREE.DodecahedronGeometry(0.3, 0);
  ddGeom.computeBoundingSphere();
  const ddMat = new THREE.MeshStandardMaterial({
    color: 0xd0d000,
    emissive: 0xff0fff,
    emissiveIntensity: 0.2
  });

  // If we haven't reached max, create a new one
  if (attractorCount++ < max_attractors) {
    const newShape = new THREE.Mesh(ddGeom, ddMat.clone());
    newShape.position.copy(pos);
    scene.add(newShape);
    objects.push(newShape);
  } else {
    // Otherwise, reuse the first
    objects[attractorCount % max_attractors].position.copy(pos);
  }
}

/**
 * Example function that can be replaced to generate a ripple or perform any
 * additional effect when an attractor is placed.
 */
export function makeRippleAt(_pos) {
  // This is a placeholder. 
  // The actual "ripple" logic is handled in threejs_bounce if desired.
  // Left here to illustrate potential hook points.
}

/**
 * Returns a random position near the center of the scene's visible frustum.
 * We pass in the scene or relevant camera data to compute the range.
 * For now, we just pick approximate bounds.
 */
export function getRandomPosition(scene) {
  // In a real scenario, you might pass in the camera to compute exact bounds.
  // Here, we just pick something approximate or dummy.
  const x = THREE.MathUtils.randFloatSpread(20);
  const y = THREE.MathUtils.randFloatSpread(10);
  return new THREE.Vector3(x, y, 0);
}

// Proximity checks
let lastProximalToObject = 0;
export let proximalToObject = 0;

/**
 * Checks how close the given ball position is to any attractor object.
 * Updates the exported 'proximalToObject' accordingly.
 */
export function checkProximity(ballPosition) {
  proximalToObject = 0;

  for (const object of objects) {
    const dist = ballPosition.distanceTo(object.position);
    const combinedRadius = object.geometry.boundingSphere.radius + ballRadius;
    if (dist < combinedRadius) {
      proximalToObject = 1; // Overlapping
      return;
    } else if (dist < combinedRadius + ballRadius) {
      proximalToObject = Math.max(proximalToObject, 2);
    } else if (dist < combinedRadius + effectRadius) {
      proximalToObject = Math.max(proximalToObject, 3);
    }
  }
  if (proximalToObject !== lastProximalToObject) {
    console.log("Proximity changed to", proximalToObject);
  }
  lastProximalToObject = proximalToObject;
}

// Targeting system
export const targets = []; // { pos: THREE.Vector3, hue: number }
export let slowFactor = 0.99999;
export let movementTimer = undefined;
const tolerance = 0.5; // distance threshold

/**
 * Updates the ball velocity if there's a target in the queue,
 * or slows the ball after some time if no targets remain.
 */
export function handleTargets(ballPosition, setBallVelocityCallback) {
  // If there's a pending target, move toward it
  if (targets.length > 0) {
    const currentTarget = targets[0];
    const dist = ballPosition.distanceTo(currentTarget.pos);
    if (dist <= tolerance) {
      targets.shift();
    } else {
      const desiredVel = currentTarget.pos.clone().sub(ballPosition).normalize().multiplyScalar(0.05);
      setBallVelocityCallback(desiredVel);
    }
  } else {
    // If there's no target, we eventually slow
    if (movementTimer === null) {
      movementTimer = setTimeout(() => {
        if (proximalToObject === 0) {
          console.log("Ball stopped");
          slowFactor = 0.95;
        }
        movementTimer = undefined;
      }, 500);
    }
    // If velocity is extremely small, zero it out
    if (ballVelocity.lengthSq() < 1e-8) {
      setBallVelocityCallback(new THREE.Vector3(0, 0, 0));
    }
  }
}

/**
 * Applies a "gravity-like" force from attractors, and the slowFactor to dampen velocity.
 */
export function applyGravity(ballPosition) {
  ballVelocity.multiplyScalar(slowFactor);

  objects.forEach(obj => {
    const distance = ballPosition.distanceTo(obj.position);
    const force = obj.position.clone()
      .sub(ballPosition)
      .normalize()
      .multiplyScalar(attractionStrength / distance);
    ballVelocity.add(force);
  });
}

/**
 * Prevents the ball from escaping the "walls" of the frustum. Reverses velocity if necessary.
 * @param {THREE.Vector3} ballPosition The current ball position (mutable).
 * @param {Function} setBallVelocityCallback For updating the ball's velocity vector.
 * @param {number} w Half the frustum width.
 * @param {number} h Half the frustum height.
 */
export function handleWallBounce(ballPosition, setBallVelocityCallback, w, h) {
  // Reflect velocity if hitting horizontal boundaries
  if (ballPosition.x + ballRadius > w || ballPosition.x - ballRadius < -w) {
    ballVelocity.x = -ballVelocity.x;
  }
  // Reflect velocity if hitting vertical boundaries
  if (ballPosition.y + ballRadius > h || ballPosition.y - ballRadius < -h) {
    ballVelocity.y = -ballVelocity.y;
  }

  // Clamp position so we don't drift outside the boundaries
  ballPosition.x = Math.max(-w + ballRadius, Math.min(ballPosition.x, w - ballRadius));
  ballPosition.y = Math.max(-h + ballRadius, Math.min(ballPosition.y, h - ballRadius));

  // Provide the updated velocity back to the main code
  setBallVelocityCallback(ballVelocity);
}
