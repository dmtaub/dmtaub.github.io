// threejs_bounce.js
// This file contains the main Three.js setup for the bouncing ball, reflection camera,
// scene creation, and animation loop.

import * as THREE from 'three';
import { setupCSS, addUI, createFloatingContainer } from './bounce_2d.js';
import { createRippleScene } from './bounce_shaders.js';

/* -----------------------------
 * Globals & initial setup
 * -----------------------------
*/
let started = false;
let currentFrame = null;
let scene, camera, renderer;
let container, containerWidth, containerHeight;
let globalTime = 0;

// The ball & motion
let ball, ballVelocity;
const ballRadius = 0.5;
const effectRadius = 2.0; // radius for "proximity" checks
let dragging = false;
let startMousePos = null;

// Attractors / objects
window.objects = []; // Expose globally for debugging
let proximalToObject = 0;
let lastProximalToObject = 0;
const max_attractors = 1;
let attractorCount = 0;
const attractionStrength = 0.0005;

// Target points for ball to move toward
const targets = []; // { pos: THREE.Vector3, hue: number }
const tolerance = 0.5; // distance threshold to consider target reached
let timer = undefined;
let slowFactor = 0.99999;

// Basic debug ripple
let debugRipple = false;
let debugRipplePos = new THREE.Vector2(0.5, 0.5);
let debugRippleStartTime = 0.0;
const debugRippleDuration = 1.0;
let clickHue = 0.0;

// Imported from bounce_shaders.js
let rippleScene, rippleCamera, rippleUniforms;
let rippleRenderTarget, rippleMaterial;

// Reflection / secondary camera
let secondaryCamera;
let secondaryCameraEnabled = false;
let secondaryContainer; // floating container
let secondaryCanvas;
let secondaryRenderer;
let secondaryCameraRenderTarget;

/**
 * A Phong material to demonstrate reflection from the secondary camera.
 */
const reflectionMaterial = new THREE.MeshPhongMaterial({
  color: 0xffffff,
  envMap: null, // assigned if reflection is enabled
  reflectivity: 1.0,
  shininess: 100
});

/* -----------------------------
 * Materials and switching
 * -----------------------------
*/

let currentMaterialIndex = 0;
const materials = [
  new THREE.MeshStandardMaterial({ color: 'hsl(200, 100%, 50%)', metalness: 0.9, roughness: 0.2 }),
  new THREE.MeshStandardMaterial({ color: 'hsl(100, 100%, 50%)', metalness: 0.5, roughness: 0.8 }),
  new THREE.MeshPhongMaterial({ color: 'hsl(300, 100%, 50%)', shininess: 30 }),
  reflectionMaterial
];

/**
 * Switch material on the ball, skipping reflection if camera is off.
 */
function switchMaterial() {
  let nextIndex = (currentMaterialIndex + 1) % materials.length;

  // If reflection is off, skip reflectionMaterial
  if (!secondaryCameraEnabled && materials[nextIndex] === reflectionMaterial) {
    nextIndex = (nextIndex + 1) % materials.length;
  }

  currentMaterialIndex = nextIndex;
  ball.material = materials[currentMaterialIndex];
}

/* -----------------------------
 * Secondary Camera & Container
 * -----------------------------
*/

/**
 * Toggles reflection usage on/off for the secondary camera.
 * If the ball is on reflectionMaterial but reflection is disabled, skip that material.
 */
function toggleReflection() {
  secondaryCameraEnabled = !secondaryCameraEnabled;

  if (secondaryCameraEnabled) {
    reflectionMaterial.envMap = secondaryCameraRenderTarget.texture;
  } else {
    reflectionMaterial.envMap = null;
    if (ball.material === reflectionMaterial) {
      switchMaterial();
    }
  }
}

/**
 * Show the floating container that holds the secondary camera.
 * (We can close it from the "x" button.)
 */
function showSecondaryPreview() {
  if (secondaryContainer) {
    secondaryContainer.style.display = 'block';
  }
}

/* -----------------------------
 * Public Start / Pause / Resume
 * -----------------------------
*/
export function start() {
  started = true;
  init();
  animate();
  setupCSS(); // from bounce_2d.js
}

export function pause() {
  cancelAnimationFrame(currentFrame);
}

export function resume() {
  if (!started) {
    start();
    return;
  }
  currentFrame = requestAnimationFrame(animate);
}

/* -----------------------------
 * Initialization
 * -----------------------------
*/
function init() {
  // Main container & sizes
  container = document.querySelector('.interactive');
  containerWidth = container.clientWidth;
  containerHeight = container.clientHeight;

  // Create a Three.js renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(containerWidth, containerHeight);
  container.appendChild(renderer.domElement);

  // Create main scene & camera
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(20, containerWidth / containerHeight, 0.1, 100);
  camera.position.z = 20;

  // On resize
  window.addEventListener('resize', onWindowResize, false);

  // Ball
  const sphereGeom = new THREE.SphereGeometry(ballRadius, 32, 32);
  ball = new THREE.Mesh(sphereGeom, materials[0]); // start with standard mat
  scene.add(ball);

  // Light
  const light = new THREE.DirectionalLight(0xffffff, 1);
  light.position.set(0, 0, 10);
  scene.add(light);

  // Initial velocity
  ballVelocity = new THREE.Vector3(0.04, 0, 0);

  // Set up pointer events
  renderer.domElement.addEventListener('pointerdown', onDown, false);
  renderer.domElement.addEventListener('pointerup', onUp, false);
  renderer.domElement.addEventListener('pointermove', onMove, false);
  renderer.domElement.addEventListener('pointerout', onOut, false);
  renderer.domElement.addEventListener('contextmenu', onRightClick, false);

  // Set up ripple scene, camera, uniforms, material, render target
  const rippleData = createRippleScene(containerWidth, containerHeight, camera);
  rippleScene      = rippleData.rippleScene;
  rippleCamera     = rippleData.rippleCamera;
  rippleUniforms   = rippleData.rippleUniforms;
  rippleMaterial   = rippleData.rippleMaterial;

  // We'll create a separate render target for the ripple
  rippleRenderTarget = new THREE.WebGLRenderTarget(containerWidth, containerHeight);
  rippleRenderTarget.texture.minFilter = THREE.LinearFilter;
  rippleRenderTarget.texture.magFilter = THREE.LinearFilter;

  // Secondary camera
  createSecondaryCameraContainer();
  createSecondaryRenderer();
}

/**
 * Creates the secondary camera floating container, but not the camera yet.
 * We'll set the camera on each animate to the ball position.
 */
function createSecondaryCameraContainer() {
  // Use the function from bounce_2d.js
  secondaryContainer = createFloatingContainer('Secondary Camera');
  document.body.appendChild(secondaryContainer);
}

/**
 * Creates the secondary camera, secondaryCanvas and its renderer for reflection usage.
 */
function createSecondaryRenderer() {
  // Actually create the camera
  secondaryCamera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  
  // Reflection environment map
  secondaryCameraRenderTarget = new THREE.WebGLRenderTarget(512, 512);
  secondaryCameraRenderTarget.texture.minFilter = THREE.LinearFilter;
  secondaryCameraRenderTarget.texture.magFilter = THREE.LinearFilter;

  // Create a canvas inside secondaryContainer
  secondaryCanvas = document.createElement('canvas');
  secondaryCanvas.style.display = 'block';
  secondaryCanvas.style.backgroundColor = '#000';
  secondaryContainer.appendChild(secondaryCanvas);

  // Create the renderer
  secondaryRenderer = new THREE.WebGLRenderer({ canvas: secondaryCanvas, antialias: true });
  secondaryRenderer.setPixelRatio(window.devicePixelRatio);
  secondaryRenderer.setSize(300, 200);
}

/**
 * Creates the UI row with 4 buttons:
 * - Switch Material
 * - Add Attractor
 * - Toggle Reflection
 * - Show Preview
 */
export function addBounceUI() {
  // We'll define the 4 button definitions
  const buttons = [
    ['Switch Material', switchMaterial],
    ['Add Attractor', () => addAttractor()],
    ['Toggle Reflection', () => toggleReflection()],
    ['Show Preview', () => showSecondaryPreview()]
  ];
  // Then use addUI from bounce_2d
  addUI(container, buttons);
}

/* -----------------------------
 * Event Handlers
 * -----------------------------
*/

/**
 * For pointer events, we unproject the mouse to the z=0 plane.
 */
function onDown(event) {
  startMousePos = getClickPosition(event)[1];
}

function onUp(event) {
  startMousePos = null;
  dragging = false;
  if (event.button === 2) return;
  onClick(event);
}

function onMove(event) {
  if (event.button == 2 || !startMousePos) {
    return;
  }
  const [mousePos, unprojected] = getClickPosition(event);
  if (startMousePos && unprojected.sub(startMousePos).length() > 0.01) {
    dragging = true;
  }
  if (!dragging) return;

  ballVelocity = mousePos.clone().sub(ball.position).normalize().multiplyScalar(0.01);
}

function onOut() {
  dragging = false;
}

function onRightClick(event) {
  event.stopPropagation();
  event.preventDefault();
  const [pos] = getClickPosition(event);
  addAttractor(pos);
}

/* -----------------------------
 * Utility Functions
 * -----------------------------
*/

/**
 * Get the 3D intersection of click with z=0 plane
 */
function getClickPosition(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  const x = (event.clientX - rect.left) / containerWidth * 2 - 1;
  const y = -(event.clientY - rect.top) / containerHeight * 2 + 1;
  const mousePos = new THREE.Vector3(x, y, 0);
  mousePos.unproject(camera);
  const dir = mousePos.clone().sub(camera.position).normalize();
  const dist = -camera.position.z / dir.z;
  const intersection = camera.position.clone().add(dir.multiplyScalar(dist));
  return [intersection, mousePos];
}

/**
 * Called on left click (up event). We create a target for the ball to move toward,
 * plus a ripple effect.
 */
function onClick(event) {
  if (timer === undefined) {
    slowFactor = 0.99;
    timer = null;
  }
  clickHue = Math.random();
  const [pos] = getClickPosition(event);
  makeRipple(pos);

  // Add a movement target
  if (event.button !== 2) {
    targets.push({ pos: pos.clone(), hue: Math.random() });
  }
}

/**
 * Creates a ripple effect at the given position (z=0).
 */
function makeRipple(mousePos) {
  const frustumHeight = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
  const frustumWidth = frustumHeight * camera.aspect;
  const x = (mousePos.x + frustumWidth / 2) / frustumWidth;
  const y = (mousePos.y + frustumHeight / 2) / frustumHeight;
  debugRipplePos.set(x, y);
  debugRippleStartTime = globalTime;
  debugRipple = true;
}

/**
 * Adds a dodecahedron attractor at the given position or a random position.
 */
function addAttractor(pos) {
  if (!pos) pos = getRandomPosition();
  makeRipple(pos);

  const ddGeom = new THREE.DodecahedronGeometry(0.3, 0);
  ddGeom.computeBoundingSphere();
  const ddMat = new THREE.MeshStandardMaterial({
    color: 0xd0d000,
    emissive: 0xff0fff,
    emissiveIntensity: 0.2
  });

  if (attractorCount++ < max_attractors) {
    const newShape = new THREE.Mesh(ddGeom, ddMat.clone());
    newShape.position.copy(pos);
    scene.add(newShape);
    objects.push(newShape);
  } else {
    // reuse the first
    objects[attractorCount % max_attractors].position.copy(pos);
  }
}

/**
 * Returns a random position near the center of the scene.
 */
function getRandomPosition() {
  const frustumHeight = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
  const frustumWidth = frustumHeight * camera.aspect;
  const x = THREE.MathUtils.randFloatSpread(frustumWidth - 1);
  const y = THREE.MathUtils.randFloatSpread(frustumHeight - 1);
  return new THREE.Vector3(x, y, 0);
}

/* -----------------------------
 * Animation & Updates
 * -----------------------------
*/
function animate() {
  currentFrame = requestAnimationFrame(animate);
  globalTime += 0.01;

  checkProximity();
  handleTargets();
  applyGravity();
  handleWallBounce();

  // Update ripple
  updateRippleUniforms();

  // 1) Render ripple texture
  renderer.setRenderTarget(rippleRenderTarget);
  renderer.clearColor();
  renderer.render(rippleScene, rippleCamera);

  // 2) Render main scene with ripple as background
  renderer.setRenderTarget(null);
  renderer.clearColor();
  const backgroundMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(getFrustumWidth(), getFrustumHeight()),
    new THREE.MeshBasicMaterial({ map: rippleRenderTarget.texture })
  );
  backgroundMesh.position.z = -0.1;
  scene.add(backgroundMesh);
  renderer.render(scene, camera);
  scene.remove(backgroundMesh);

  // Toggle debug ripple off if time is up
  if (debugRipple && (globalTime - debugRippleStartTime > debugRippleDuration)) {
    debugRipple = false;
  }

  // Move ball
  ball.position.add(ballVelocity);

  // Slight rotation to attractors
  for (const object of objects) {
    object.rotation.y += 0.01;
  }

  // 3) Render from secondary camera if reflection is on
  if (secondaryCameraEnabled && secondaryCamera) {
    secondaryCamera.position.copy(ball.position);
    if (ballVelocity.lengthSq() > 0.000001) {
      const lookPos = ball.position.clone().add(ballVelocity.clone().normalize().multiplyScalar(5));
      secondaryCamera.lookAt(lookPos);
    } else {
      secondaryCamera.lookAt(new THREE.Vector3(0,0,0));
    }

    // Render reflection envMap
    secondaryRenderer.setRenderTarget(secondaryCameraRenderTarget);
    secondaryRenderer.clear();
    const background2 = new THREE.Mesh(
      new THREE.PlaneGeometry(getFrustumWidth(), getFrustumHeight()),
      new THREE.MeshBasicMaterial({ map: rippleRenderTarget.texture })
    );
    background2.position.z = -0.1;
    scene.add(background2);
    secondaryRenderer.render(scene, secondaryCamera);
    scene.remove(background2);

    // Render same scene to the floating preview
    secondaryRenderer.setRenderTarget(null);
    secondaryRenderer.clear();
    const background3 = new THREE.Mesh(
      new THREE.PlaneGeometry(getFrustumWidth(), getFrustumHeight()),
      new THREE.MeshBasicMaterial({ map: rippleRenderTarget.texture })
    );
    background3.position.z = -0.1;
    scene.add(background3);
    secondaryRenderer.render(scene, secondaryCamera);
    scene.remove(background3);
  }
}

/* -----------------------------
 * Helper functions
 * -----------------------------
*/
function onWindowResize() {
  containerWidth = container.clientWidth;
  containerHeight = container.clientHeight;

  // Clear targets so ball doesn't chase a stale location
  targets.length = 0;

  camera.aspect = containerWidth / containerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(containerWidth, containerHeight);

  if (rippleRenderTarget) {
    rippleRenderTarget.setSize(containerWidth, containerHeight);
  }

  if (rippleUniforms) {
    rippleUniforms.u_resolution.value.set(containerWidth, containerHeight);
    rippleUniforms.u_frustumWidth.value = getFrustumWidth();
    rippleUniforms.u_frustumHeight.value = getFrustumHeight();
  }

  // Keep secondary camera at 1:1 aspect for reflection usage
  if (secondaryCamera) {
    secondaryCamera.aspect = 1;
    secondaryCamera.updateProjectionMatrix();
  }

  // Secondary renderer size can be reset if desired
  if (secondaryRenderer && secondaryCanvas) {
    secondaryRenderer.setSize(300, 200);
  }
}

function getFrustumHeight() {
  return 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
}

function getFrustumWidth() {
  return getFrustumHeight() * camera.aspect;
}

/**
 * Check if the ball is near an attractor
 */
function checkProximity() {
  proximalToObject = 0;
  for (const object of objects) {
    const dist = ball.position.distanceTo(object.position);
    const combinedRadius = object.geometry.boundingSphere.radius + ballRadius;
    if (dist < combinedRadius) {
      proximalToObject = 1;
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

/**
 * If we have any queued targets, move the ball toward them. Otherwise, we eventually slow down.
 */
function handleTargets() {
  if (targets.length > 0) {
    const currentTarget = targets[0];
    const dist = ball.position.distanceTo(currentTarget.pos);
    if (dist <= tolerance) {
      targets.shift();
    } else {
      ballVelocity = currentTarget.pos.clone().sub(ball.position).normalize().multiplyScalar(0.05);
    }
  } else {
    // If there's no target, we slow down after some time
    if (timer === null) {
      timer = setTimeout(() => {
        if (proximalToObject === 0) {
          console.log("Ball stopped");
          slowFactor = 0.95;
        }
        timer = undefined;
      }, 500);
    }
    if (ballVelocity.lengthSq() < 1e-8) {
      ballVelocity.set(0, 0, 0);
    }
  }
}

/**
 * Apply "gravity" from attractors and a slow factor to the ball's velocity.
 */
function applyGravity() {
  ballVelocity.multiplyScalar(slowFactor);
  objects.forEach(obj => {
    const distance = ball.position.distanceTo(obj.position);
    const force = obj.position.clone()
      .sub(ball.position)
      .normalize()
      .multiplyScalar(attractionStrength / distance);
    ballVelocity.add(force);
  });
}

/**
 * Handle collision with the imaginary walls of the view frustum.
 */
function handleWallBounce() {
  const w = getFrustumWidth() / 2;
  const h = getFrustumHeight() / 2;

  if (ball.position.x + ballRadius > w || ball.position.x - ballRadius < -w) {
    ballVelocity.x = -ballVelocity.x;
  }
  if (ball.position.y + ballRadius > h || ball.position.y - ballRadius < -h) {
    ballVelocity.y = -ballVelocity.y;
  }

  ball.position.x = Math.max(-w + ballRadius, Math.min(ball.position.x, w - ballRadius));
  ball.position.y = Math.max(-h + ballRadius, Math.min(ball.position.y, h - ballRadius));
}

/**
 * Update the ripple uniforms to reflect ball position, velocity, and debug ripple state.
 */
function updateRippleUniforms() {
  rippleUniforms.u_time.value = globalTime;
  rippleUniforms.u_ballPosition.value.set(ball.position.x, ball.position.y);
  rippleUniforms.u_frustumWidth.value = getFrustumWidth();
  rippleUniforms.u_frustumHeight.value = getFrustumHeight();

  let velDir = ballVelocity.clone().normalize();
  rippleUniforms.u_ballVelocityDir.value.set(velDir.x, velDir.y);

  // Update ball color (just a simple hue shift for demonstration)
  let hueShift = (0.2 * globalTime) % 1.0;
  let ballColor = new THREE.Color().setHSL(hueShift, 1.0, 0.5);
  ball.material.color = ballColor;

  rippleUniforms.u_debugRipple.value = debugRipple;
  rippleUniforms.u_debugRipplePos.value.copy(debugRipplePos);
  rippleUniforms.u_debugRippleStartTime.value = debugRippleStartTime;
  rippleUniforms.u_clickHue.value = clickHue;
}
