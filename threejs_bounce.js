// threejs_bounce.js
// Main Three.js setup for the bouncing ball, scene creation, reflection camera, and animation loop.

import * as THREE from 'three';
import { setupCSS, addUI, createFloatingContainer } from './bounce_2d.js';
import {
  createRippleScene,
  updateRippleShaderUniforms
} from './bounce_shaders.js';

/* -----------------------------
 * Globals & initial setup
 * -----------------------------
*/
let started = false;
let currentFrame = null;

let scene, camera, renderer;
let container, containerWidth, containerHeight;

// Time tracking
let globalTime = 0;

// The ball & motion
let ball, ballVelocity;
const ballRadius = 0.5;
const effectRadius = 2.0; // radius for "proximity" checks
let dragging = false;
let startMousePos = null;

// Attractors / objects
window.objects = [];
let proximalToObject = 0;
let lastProximalToObject = 0;
const max_attractors = 1;
let attractorCount = 0;
const attractionStrength = 0.0005;

// Targets for the ball to move toward
const targets = [];
const tolerance = 0.5;
let timer = undefined;
let slowFactor = 0.99999;

// Debug ripple
let debugRipple = false;
let debugRipplePos = new THREE.Vector2(0.5, 0.5);
let debugRippleStartTime = 0.0;
const debugRippleDuration = 1.0;
let clickHue = 0.0;

// Ripple scene
let rippleScene, rippleCamera, rippleUniforms, rippleMaterial;
let rippleRenderTarget;

// Reflection / secondary camera
let secondaryCamera;
let secondaryCameraEnabled = false;
let secondaryContainer; // floating container
let secondaryCanvas;
let secondaryRenderer;
let secondaryCameraRenderTarget;

/**
 * A Phong material that will use the secondary camera's render target for reflection.
 */
const reflectionMaterial = new THREE.MeshPhongMaterial({
  color: 0xffffff,
  envMap: null,
  reflectivity: 1.0,
  shininess: 100
});

/* -----------------------------
 * Materials
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
  if (!secondaryCameraEnabled && materials[nextIndex] === reflectionMaterial) {
    nextIndex = (nextIndex + 1) % materials.length;
  }
  currentMaterialIndex = nextIndex;
  ball.material = materials[currentMaterialIndex];
}

/**
 * Toggles reflection usage on/off for the secondary camera.
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
 * Show the floating container that holds the secondary camera's preview.
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

  // Ensure UI and CSS are set up
  setupCSS();
  addBounceUI(); // Provide the user with the buttons
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

/**
 * Creates the UI with 4 buttons: Switch Material, Add Attractor, Toggle Reflection, Show Preview.
 */
function addBounceUI() {
  const buttonDefs = [
    ['Switch Material', switchMaterial],
    ['Add Attractor', () => addAttractor()],
    ['Toggle Reflection', () => toggleReflection()],
    ['Show Preview', () => showSecondaryPreview()]
  ];
  // Attach these buttons to our main container
  addUI(container, buttonDefs);
}

/* -----------------------------
 * Initialization
 * -----------------------------
*/

function init() {
  container = document.querySelector('.interactive');
  if (!container) {
    console.warn("No .interactive container found in the document!");
    return;
  }

  containerWidth = container.clientWidth;
  containerHeight = container.clientHeight;

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(containerWidth, containerHeight);
  container.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(20, containerWidth / containerHeight, 0.1, 100);
  camera.position.z = 20;

  window.addEventListener('resize', onWindowResize, false);

  // Ball
  const sphereGeom = new THREE.SphereGeometry(ballRadius, 32, 32);
  ball = new THREE.Mesh(sphereGeom, materials[0]);
  scene.add(ball);

  // Light
  const light = new THREE.DirectionalLight(0xffffff, 1);
  light.position.set(0, 0, 10);
  scene.add(light);

  // Initial velocity
  ballVelocity = new THREE.Vector3(0.04, 0, 0);

  // Pointer events
  renderer.domElement.addEventListener('pointerdown', onDown, false);
  renderer.domElement.addEventListener('pointerup', onUp, false);
  renderer.domElement.addEventListener('pointermove', onMove, false);
  renderer.domElement.addEventListener('pointerout', onOut, false);
  renderer.domElement.addEventListener('contextmenu', onRightClick, false);

  // Ripple scene & uniforms
  const rippleData = createRippleScene(containerWidth, containerHeight, camera);
  rippleScene = rippleData.rippleScene;
  rippleCamera = rippleData.rippleCamera;
  rippleUniforms = rippleData.rippleUniforms;
  rippleMaterial = rippleData.rippleMaterial;

  rippleRenderTarget = new THREE.WebGLRenderTarget(containerWidth, containerHeight);
  rippleRenderTarget.texture.minFilter = THREE.LinearFilter;
  rippleRenderTarget.texture.magFilter = THREE.LinearFilter;

  // Secondary camera setup
  createSecondaryCameraContainer();
  createSecondaryRenderer();
}

/**
 * Prepares the floating container for the secondary camera preview.
 */
function createSecondaryCameraContainer() {
  secondaryContainer = createFloatingContainer('Secondary Camera');
  document.body.appendChild(secondaryContainer);
}

/**
 * Creates the secondary camera, canvas, and renderer for reflection usage.
 */
function createSecondaryRenderer() {
  secondaryCamera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);

  secondaryCameraRenderTarget = new THREE.WebGLRenderTarget(512, 512);
  secondaryCameraRenderTarget.texture.minFilter = THREE.LinearFilter;
  secondaryCameraRenderTarget.texture.magFilter = THREE.LinearFilter;

  // Canvas inside the floating container
  secondaryCanvas = document.createElement('canvas');
  secondaryCanvas.style.display = 'block';
  secondaryCanvas.style.backgroundColor = '#000';
  secondaryContainer.appendChild(secondaryCanvas);

  // Renderer for the secondary camera
  secondaryRenderer = new THREE.WebGLRenderer({ canvas: secondaryCanvas, antialias: true });
  secondaryRenderer.setPixelRatio(window.devicePixelRatio);
  secondaryRenderer.setSize(300, 200);
}

/* -----------------------------
 * Main Animation
 * -----------------------------
*/

function animate() {
  currentFrame = requestAnimationFrame(animate);
  globalTime += 0.01;

  checkProximity();
  handleTargets();
  applyGravity();
  handleWallBounce();

  // Update the ripple shader's uniforms from bounce_shaders
  updateRippleShaderUniforms(rippleUniforms, {
    time: globalTime,
    ballPosition: ball.position,
    ballVelocityDir: ballVelocity.clone().normalize(),
    frustumWidth: getFrustumWidth(),
    frustumHeight: getFrustumHeight(),
    debugRipple: debugRipple,
    debugRipplePos: debugRipplePos,
    debugRippleStartTime: debugRippleStartTime,
    clickHue: clickHue
  });

  // 1) Render the ripple to a texture
  renderer.setRenderTarget(rippleRenderTarget);
  renderer.clearColor();
  renderer.render(rippleScene, rippleCamera);

  // 2) Render main scene with the ripple as background
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

  // Disable debug ripple if time is up
  if (debugRipple && (globalTime - debugRippleStartTime > debugRippleDuration)) {
    debugRipple = false;
  }

  // Move the ball
  ball.position.add(ballVelocity);

  // Rotate attractors
  for (const object of objects) {
    object.rotation.y += 0.01;
  }

  // Reflection camera if enabled
  if (secondaryCameraEnabled && secondaryCamera) {
    secondaryCamera.position.copy(ball.position);

    if (ballVelocity.lengthSq() > 0.000001) {
      const lookPos = ball.position.clone().add(ballVelocity.clone().normalize().multiplyScalar(5));
      secondaryCamera.lookAt(lookPos);
    } else {
      secondaryCamera.lookAt(new THREE.Vector3(0, 0, 0));
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

    // Render preview
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
 * Event Handling
 * -----------------------------
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
 * Click & Ripple
 * -----------------------------
*/
function onClick(event) {
  if (timer === undefined) {
    slowFactor = 0.99;
    timer = null;
  }
  clickHue = Math.random();

  const [pos] = getClickPosition(event);
  makeRipple(pos);

  if (event.button !== 2) {
    targets.push({ pos: pos.clone(), hue: Math.random() });
  }
}

/**
 * Creates a ripple effect at a particular position (z=0).
 */
function makeRipple(mousePos) {
  const frustumHeight = getFrustumHeight();
  const frustumWidth = getFrustumWidth();

  const x = (mousePos.x + frustumWidth / 2) / frustumWidth;
  const y = (mousePos.y + frustumHeight / 2) / frustumHeight;

  debugRipplePos.set(x, y);
  debugRippleStartTime = globalTime;
  debugRipple = true;
}

/* -----------------------------
 * Attractor
 * -----------------------------
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
    objects[attractorCount % max_attractors].position.copy(pos);
  }
}

/* -----------------------------
 * Utility
 * -----------------------------
*/
function getRandomPosition() {
  const w = getFrustumWidth();
  const h = getFrustumHeight();
  const x = THREE.MathUtils.randFloatSpread(w - 1);
  const y = THREE.MathUtils.randFloatSpread(h - 1);
  return new THREE.Vector3(x, y, 0);
}

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
 * Check how close the ball is to any attractor.
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
 * If we have a target, move ball toward it; otherwise let ball eventually slow.
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
    // No target: after some time, we slow down
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
 * Apply a "gravity" style force from attractors and slow factor to ball velocity.
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
 * Handle collision with top/bottom/left/right frustum boundaries.
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
 * Returns the frustum width based on camera fov and position.
 */
function getFrustumWidth() {
  return getFrustumHeight() * camera.aspect;
}

/**
 * Returns the frustum height based on camera fov and position.
 */
function getFrustumHeight() {
  return 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
}

/**
 * Handles window resizing, adjusting the camera, renderer, and ripple uniforms.
 */
function onWindowResize() {
  containerWidth = container.clientWidth;
  containerHeight = container.clientHeight;

  // Clear targets so the ball won't chase a stale location
  targets.length = 0;

  camera.aspect = containerWidth / containerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(containerWidth, containerHeight);

  // Resize ripple
  if (rippleRenderTarget) {
    rippleRenderTarget.setSize(containerWidth, containerHeight);
  }

  if (rippleUniforms) {
    rippleUniforms.u_resolution.value.set(containerWidth, containerHeight);
    rippleUniforms.u_frustumWidth.value = getFrustumWidth();
    rippleUniforms.u_frustumHeight.value = getFrustumHeight();
  }

  // Keep the secondary camera at 1:1 aspect
  if (secondaryCamera) {
    secondaryCamera.aspect = 1;
    secondaryCamera.updateProjectionMatrix();
  }

  // Reset secondary renderer size if desired
  if (secondaryRenderer && secondaryCanvas) {
    secondaryRenderer.setSize(300, 200);
  }
}
