// Updated code that creates a floating secondary canvas with a title bar, white border,
// and an "x" to hide it. The 4th button can show it again. Also includes reflection usage
// from the secondary camera's render target as before.

import * as THREE from 'three';

let started = false;
let scene, camera, renderer;
let ball, ballVelocity;
let container, containerWidth, containerHeight;
const ballRadius = 0.5;
const effectRadius = 2.0; // New effect radius
const placementRipple = true;

let rippleScene, rippleCamera;
let rippleRenderTarget;

let rippleUniforms;
let rippleMaterial;

let globalTime = 0;
let currentFrame = null;
let dragging = false;
let startMousePos = null;
const moveTolerance = 0.01;
const attractionStrength = 0.0005;

let timer = undefined;
let slowFactor = 0.99999;

// Target management
const targets = []; // { pos: THREE.Vector3, hue: number }
const tolerance = 0.5; // Distance tolerance to consider the target "reached"

// Debug ripple
let debugRipple = false;
let debugRipplePos = new THREE.Vector2(0.5, 0.5);
let debugRippleStartTime = 0.0;
const debugRippleDuration = 1.0;
let clickHue = 0.0;

window.objects = [];
let proximalToObject = 0;
let lastProximalToObject = 0;

const max_attractors = 1;
let attractorCount = 0;

// Create the dodecahedron base
const ddGeom = new THREE.DodecahedronGeometry(0.3, 0);
ddGeom.computeBoundingSphere();
const ddMat = new THREE.MeshStandardMaterial({
    color: 0xd0d000,
    emissive: 0xff0fff,
    emissiveIntensity: 0.2
});

/* -----------------------------
 * Secondary camera & reflection
 * -----------------------------
 */

let secondaryCamera;
let secondaryCameraEnabled = false;

// We'll wrap the secondaryCanvas in a floating container with a title bar
let secondaryContainer;
let secondaryCanvas;
let secondaryRenderer;
let secondaryCameraRenderTarget;

// Reflection material
const reflectionMaterial = new THREE.MeshPhongMaterial({
  color: 0xffffff,
  envMap: null, // will be set to secondaryCameraRenderTarget if enabled
  reflectivity: 1.0,
  shininess: 100
});

/**
 * Create and configure the secondary camera and its renderer/canvas.
 * This camera will be positioned at the ball's location in animate().
 */
function createSecondaryCamera() {
  // Create the camera
  secondaryCamera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);

  // Render target for reflection
  secondaryCameraRenderTarget = new THREE.WebGLRenderTarget(512, 512);
  secondaryCameraRenderTarget.texture.minFilter = THREE.LinearFilter;
  secondaryCameraRenderTarget.texture.magFilter = THREE.LinearFilter;

  // Create container div that floats over the main canvas
  secondaryContainer = document.createElement('div');
  secondaryContainer.style.position = 'absolute';
  secondaryContainer.style.top = '10px';
  secondaryContainer.style.left = '10px';
  secondaryContainer.style.width = 'auto';
  secondaryContainer.style.border = '2px solid white';
  secondaryContainer.style.backgroundColor = '#222'; // a darker background behind the canvas
  secondaryContainer.style.zIndex = '1000';
  secondaryContainer.style.display = 'none'; // hidden until toggled

  // Title bar
  const titleBar = document.createElement('div');
  titleBar.style.display = 'flex';
  titleBar.style.justifyContent = 'space-between';
  titleBar.style.alignItems = 'center';
  titleBar.style.backgroundColor = '#444';
  titleBar.style.color = '#fff';
  titleBar.style.fontFamily = 'sans-serif';
  titleBar.style.padding = '5px';

  const titleSpan = document.createElement('span');
  titleSpan.innerText = 'Secondary Camera';
  titleBar.appendChild(titleSpan);

  // "X" button to hide
  const closeButton = document.createElement('span');
  closeButton.innerText = 'x';
  closeButton.style.cursor = 'pointer';
  closeButton.addEventListener('click', () => {
    secondaryContainer.style.display = 'none';
  });
  titleBar.appendChild(closeButton);

  secondaryContainer.appendChild(titleBar);

  // The actual canvas used by the secondary renderer
  secondaryCanvas = document.createElement('canvas');
  // We can set an explicit size or let the renderer handle it
  secondaryCanvas.style.display = 'block';
  secondaryCanvas.style.backgroundColor = '#000';

  // Append to the container
  secondaryContainer.appendChild(secondaryCanvas);
  // Append to body
  document.body.appendChild(secondaryContainer);

  // Create a separate renderer for the secondary camera
  secondaryRenderer = new THREE.WebGLRenderer({ canvas: secondaryCanvas, antialias: true });
  secondaryRenderer.setPixelRatio(window.devicePixelRatio);

  // For layout, let's pick some default size
  secondaryRenderer.setSize(300, 200);
}

/**
 * Toggles reflection usage on/off. The reflection material's envMap depends on this.
 */
function toggleCamera() {
  secondaryCameraEnabled = !secondaryCameraEnabled;
  if (!secondaryCamera) return;

  // If reflection material is in use, set or unset envMap
  if (secondaryCameraEnabled) {
    reflectionMaterial.envMap = secondaryCameraRenderTarget.texture;
  } else {
    reflectionMaterial.envMap = null;
  }

  // If turning off reflection while ball is using reflectionMaterial, skip to next
  if (!secondaryCameraEnabled && ball.material === reflectionMaterial) {
    switchMaterial();
  }
}

/**
 * Show the floating secondary camera container (the user can "x" it out to hide).
 */
function showSecondaryPreview() {
  if (secondaryContainer) {
    secondaryContainer.style.display = 'block';
  }
}

/* -----------------------------
 * Materials and switching
 * -----------------------------
 */

let currentMaterialIndex = 0;
const materials = [
  new THREE.MeshStandardMaterial({ color: 'hsl(200, 100%, 50%)', metalness: 0.9, roughness: 0.2 }),
  new THREE.MeshStandardMaterial({ color: 'hsl(100, 100%, 50%)', metalness: 0.5, roughness: 0.8 }),
  new THREE.MeshPhongMaterial({ color: 'hsl(300, 100%, 50%)', shininess: 30 }),
  reflectionMaterial // reflection mat
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

export function start() {
    started = true;
    const container = init();
    animate();
    setupCSS();

    const rowDiv = document.createElement('div');
    rowDiv.classList.add('ui-row');
    container.appendChild(rowDiv);
    addUI(rowDiv);
}

/**
 * Adds UI including 4th button to show the secondary camera preview again.
 */
function addUI(container) {
  const buttons = [
    ['Switch Material', switchMaterial],
    ['Add Attractor', () => addAttractor()],
    ['Toggle Reflection', toggleCamera],
    ['Show Preview', showSecondaryPreview]  // 4th button to show
  ];

  const setupButtons = () => {
    for (const [text, callback] of buttons) {
      const button = document.createElement('div');
      button.classList.add('ui-button');
      button.innerText = text;
      button.addEventListener('click', callback);
      addListeners(button);
      container.appendChild(button);
    }
  };

  const addListeners = (button) => {
    button.addEventListener('mouseover', () => {
      button.style.borderColor = '#888';
    });
    button.addEventListener('mouseout', () => {
      button.style.borderColor = '#ccc';
    });
  };

  setupButtons();
}

function setupCSS() {
    const buttonStyle = document.createElement('style');
    buttonStyle.textContent = `
      .ui-row {
        display: flex;
        justify-content: left;
        margin-top: 10px;
        gap: 10px;
      }
      .ui-button {
        width: 175px;
        height: 45px;
        background-color: rgba(255, 255, 255, 0.8);
        display: flex;
        justify-content: center;
        align-items: center;
        cursor: pointer;
        border: 2px solid #ccc;
        line-height: 1;
        border-radius: 5px;
        user-select: none;
      }
    `;
    document.head.appendChild(buttonStyle);
}

/* -----------------------------
 * Initial scene setup
 * -----------------------------
 */
function init() {
    renderer = new THREE.WebGLRenderer({ antialias: true });
    scene = new THREE.Scene();

    container = document.querySelector('.interactive');
    containerWidth = container.clientWidth;
    containerHeight = container.clientHeight;

    camera = new THREE.PerspectiveCamera(20, containerWidth / containerHeight, 0.1, 100);
    camera.position.z = 20;

    renderer.setSize(containerWidth, containerHeight);
    container.appendChild(renderer.domElement);

    window.addEventListener('resize', onWindowResize, false);

    // Ball
    const geometry = new THREE.SphereGeometry(ballRadius, 32, 32);
    const ballMaterial = materials[0]; // start with the first in the list
    ball = new THREE.Mesh(geometry, ballMaterial);
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

    createRippleScene();

    rippleRenderTarget = new THREE.WebGLRenderTarget(containerWidth, containerHeight);
    rippleRenderTarget.texture.minFilter = THREE.LinearFilter;
    rippleRenderTarget.texture.magFilter = THREE.LinearFilter;

    // Secondary camera + container
    createSecondaryCamera();

    return container;
}

/**
 * NDC to world-space helper.
 */
function getRectUnproject(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  const x = (event.clientX - rect.left) / containerWidth * 2 - 1;
  const y = -(event.clientY - rect.top) / containerHeight * 2 + 1;
  const mousePos = new THREE.Vector3(x, y, 0);
  mousePos.unproject(camera);
  return [mousePos, mousePos.clone().sub(camera.position).normalize()];
}

/**
 * Intersect click with z=0 plane.
 */
function getClickPosition(event) {
  const [unprojected, dir] = getRectUnproject(event);
  const distance = -camera.position.z / dir.z;
  const intersectionPoint = camera.position.clone().add(dir.multiplyScalar(distance));
  return [intersectionPoint, unprojected];
}

function makeRipple(mousePos) {
    const frustumHeight = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
    const frustumWidth = frustumHeight * camera.aspect;

    const x = (mousePos.x + frustumWidth / 2) / frustumWidth;
    const y = (mousePos.y + frustumHeight / 2) / frustumHeight;

    debugRipplePos.set(x, y);
    debugRippleStartTime = globalTime;
    debugRipple = true;
}

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

function onMove(event) {
  if (event.button == 2 || !startMousePos) {
    return;
  }
  const [mousePos, unprojected] = getClickPosition(event);
  if (startMousePos && unprojected.sub(startMousePos).length() > moveTolerance) {
    dragging = true;
  }
  if (!dragging) return;

  ballVelocity = mousePos.clone().sub(ball.position).normalize().multiplyScalar(0.01);
}

function onDown(event) {
  startMousePos = getClickPosition(event)[1];
}

function onUp(event) {
  startMousePos = null;
  dragging = false;
  if (event.button === 2) return;
  onClick(event);
}

function onOut() {
  dragging = false;
}

function onRightClick(event) {
  event.stopPropagation();
  event.preventDefault();
  const [mousePos] = getClickPosition(event);
  addAttractor(mousePos);
}

function addAttractor(pos) {
  if (!pos) pos = getRandomPosition();
  if (placementRipple) makeRipple(pos);

  if (attractorCount++ < max_attractors) {
    const newShape = new THREE.Mesh(ddGeom, ddMat.clone());
    newShape.name = "attractor";
    newShape.position.copy(pos);
    scene.add(newShape);
    objects.push(newShape);
  } else {
    objects[attractorCount % max_attractors].position.copy(pos);
  }
}

function getRandomPosition() {
  const frustumHeight = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
  const frustumWidth = frustumHeight * camera.aspect;
  const x = THREE.MathUtils.randFloatSpread(frustumWidth - 1);
  const y = THREE.MathUtils.randFloatSpread(frustumHeight - 1);
  return new THREE.Vector3(x, y, 0);
}

/* -----------------------------
 * Ripple scene for background
 * -----------------------------
 */
function createRippleScene() {
    rippleScene = new THREE.Scene();
    rippleCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const frustumHeight = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
    const frustumWidth = frustumHeight * camera.aspect;

    rippleUniforms = {
        u_time: { value: 0.0 },
        u_ballPosition: { value: new THREE.Vector2(0.0, 0.0) },
        u_ballVelocityDir: { value: new THREE.Vector2(1.0, 0.0) },
        u_resolution: { value: new THREE.Vector2(containerWidth, containerHeight) },
        u_frustumWidth: { value: frustumWidth },
        u_frustumHeight: { value: frustumHeight },
        u_debugRipple: { value: false },
        u_debugRipplePos: { value: new THREE.Vector2(0.5, 0.5) },
        u_debugRippleStartTime: { value: 0.0 },
        u_clickHue: { value: 0.0 }
    };

    rippleMaterial = new THREE.ShaderMaterial({
        uniforms: rippleUniforms,
        vertexShader: /* glsl */`
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = vec4(position,1.0);
            }
        `,
        fragmentShader: /* glsl */`
            precision highp float;
            varying vec2 vUv;

            uniform float u_time;
            uniform vec2 u_ballPosition;
            uniform vec2 u_ballVelocityDir;
            uniform float u_frustumWidth;
            uniform float u_frustumHeight;

            uniform bool u_debugRipple;
            uniform vec2 u_debugRipplePos;
            uniform float u_debugRippleStartTime;
            uniform float u_clickHue;

            vec3 hsl2rgb(vec3 hsl) {
                float h = hsl.x, s = hsl.y, l = hsl.z;
                float c = (1.0 - abs(2.0*l - 1.0)) * s;
                float x = c * (1.0 - abs(mod(h*6.0,2.0)-1.0));
                float m = l - c*0.5;
                vec3 rgb;
                if      (h < 1.0/6.0) rgb = vec3(c,x,0);
                else if (h < 2.0/6.0) rgb = vec3(x,c,0);
                else if (h < 3.0/6.0) rgb = vec3(0,c,x);
                else if (h < 4.0/6.0) rgb = vec3(0,x,c);
                else if (h < 5.0/6.0) rgb = vec3(x,0,c);
                else                  rgb = vec3(c,0,x);
                return rgb + m;
            }

            void main() {
                vec2 sceneCoords = vec2(
                    (vUv.x - 0.5) * u_frustumWidth,
                    (vUv.y - 0.5) * u_frustumHeight
                );

                vec2 relPos = sceneCoords - u_ballPosition;
                vec2 dir = normalize(u_ballVelocityDir);
                vec2 perp = vec2(-dir.y, dir.x);

                float dLong = dot(relPos, dir);
                float dPerp = dot(relPos, perp);
                float dist = length(relPos);

                float radFreq = 10.0;
                float radSpeed = 2.0;
                float radialWave = sin(dist * radFreq - u_time * radSpeed);

                float dirFreq = 10.0;
                float dirSpeed = 2.0;
                float dirWave = sin((-dLong * dirFreq) - u_time * dirSpeed);

                float behindFade = dLong < 0.0 ? 1.0 : 0.3;
                float distanceFade = exp(-dist * 0.2);
                float perpFade = exp(-abs(dPerp) * 0.5);
                float combinedFade = behindFade * distanceFade * perpFade;
                float combinedWave = ((radialWave + 1.0)*0.5) * ((dirWave + 1.0)*0.5) * combinedFade;

                float hue = mod(0.6 + 0.1 * u_time + 0.02 * dist, 1.0);
                float saturation = 0.8;
                float lightness = 0.5;
                vec3 rippleColor = hsl2rgb(vec3(hue, saturation, lightness));
                float intensity = combinedWave;
                vec3 baseColor = vec3(0.0, 0.0, 0.05);
                vec3 finalColor = baseColor + rippleColor * intensity;

                // Debug click ripple
                if (u_debugRipple) {
                    float dt = u_time - u_debugRippleStartTime;
                    if (dt < 1.0) {
                        vec2 diff = vUv - u_debugRipplePos;
                        float d = length(diff);
                        float rippleWave = cos(d * 20.0 - dt * 5.0);
                        if (rippleWave > 0.0) {
                            float rippleFadeDist = exp(-d * 5.0);
                            float rippleTimeFade = exp(-dt * 3.0);
                            vec3 rippleColor2 = hsl2rgb(vec3(u_clickHue, 1.0, 0.5));
                            finalColor += rippleColor2 * rippleWave * rippleFadeDist * rippleTimeFade * 0.5;
                        }
                    }
                }

                gl_FragColor = vec4(finalColor, 1.0);
            }
        `
    });

    const plane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), rippleMaterial);
    rippleScene.add(plane);
}

/**
 * Apply gravity / slow factor from attractors
 */
function applyGravity() {
  ballVelocity.multiplyScalar(slowFactor);
  objects.forEach(attractor => {
    const distance = ball.position.distanceTo(attractor.position);
    const force = attractor.position.clone()
      .sub(ball.position)
      .normalize()
      .multiplyScalar(attractionStrength / distance);
    ballVelocity.add(force);
  });
}

/**
 * Check proximity of ball to objects
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
}

/* -----------------------------
 * Main animation loop
 * -----------------------------
 */
function animate() {
  currentFrame = requestAnimationFrame(animate);
  globalTime += 0.01;

  checkProximity();
  if (proximalToObject !== lastProximalToObject) {
    console.log("Proximity changed to", proximalToObject);
  }
  lastProximalToObject = proximalToObject;

  // Handle targets
  if (targets.length > 0) {
    const currentTarget = targets[0];
    const dist = ball.position.distanceTo(currentTarget.pos);
    if (dist <= tolerance) {
      targets.shift();
    } else {
      ballVelocity = currentTarget.pos.clone().sub(ball.position).normalize().multiplyScalar(0.05);
    }
  } else {
    if (timer === null) {
      timer = setTimeout(() => {
        if (proximalToObject === 0) {
          console.log("Ball stopped");
          slowFactor = 0.95;
        }
        timer = undefined;
      }, 500);
    }
    if (ballVelocity.lengthSq() < 0.00000001) {
      ballVelocity.set(0, 0, 0);
    }
  }

  applyGravity();

  // Bouncing
  const frustumHeight = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
  const frustumWidth = frustumHeight * camera.aspect;
  const radius = ballRadius;

  if (ball.position.x + radius > frustumWidth / 2 || ball.position.x - radius < -frustumWidth / 2) {
      ballVelocity.x = -ballVelocity.x;
  }
  if (ball.position.y + radius > frustumHeight / 2 || ball.position.y - radius < -frustumHeight / 2) {
      ballVelocity.y = -ballVelocity.y;
  }

  ball.position.x = Math.max(-frustumWidth/2 + radius, Math.min(ball.position.x, frustumWidth/2 - radius));
  ball.position.y = Math.max(-frustumHeight/2 + radius, Math.min(ball.position.y, frustumHeight/2 - radius));

  // Update ripple uniforms
  rippleUniforms.u_time.value = globalTime;
  rippleUniforms.u_ballPosition.value.set(ball.position.x, ball.position.y);
  rippleUniforms.u_frustumWidth.value = frustumWidth;
  rippleUniforms.u_frustumHeight.value = frustumHeight;

  let velDir = ballVelocity.clone().normalize();
  rippleUniforms.u_ballVelocityDir.value.set(velDir.x, velDir.y);

  // Ball color
  let hueShift = (0.2 * globalTime) % 1.0;
  let ballColor = new THREE.Color();
  ballColor.setHSL(hueShift, 1.0, 0.5);
  ball.material.color = ballColor;

  rippleUniforms.u_debugRipple.value = debugRipple;
  rippleUniforms.u_debugRipplePos.value.copy(debugRipplePos);
  rippleUniforms.u_debugRippleStartTime.value = debugRippleStartTime;
  rippleUniforms.u_clickHue.value = clickHue;

  // 1) Render the ripple pattern to rippleRenderTarget
  renderer.setRenderTarget(rippleRenderTarget);
  renderer.clearColor();
  renderer.render(rippleScene, rippleCamera);

  // 2) Render the main scene with the ripple background
  renderer.setRenderTarget(null);
  renderer.clearColor();
  let backgroundMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(frustumWidth, frustumHeight),
    new THREE.MeshBasicMaterial({ map: rippleRenderTarget.texture })
  );
  backgroundMesh.position.z = -0.1;
  scene.add(backgroundMesh);
  renderer.render(scene, camera);
  scene.remove(backgroundMesh);

  // Debug ripple time check
  if (debugRipple && (globalTime - debugRippleStartTime > debugRippleDuration)) {
    debugRipple = false;
  }

  // Move the ball
  ball.position.add(ballVelocity);

  // Rotate attractors
  for (const object of objects) {
    object.rotation.y += 0.01;
  }

  // 3) If secondary camera is enabled, render from the ball's POV to reflection
  if (secondaryCameraEnabled && secondaryCamera) {
    // Position camera at the ball
    secondaryCamera.position.copy(ball.position);

    // Look in direction of movement (or at scene center if no movement)
    if (ballVelocity.lengthSq() > 0.000001) {
      const lookPos = ball.position.clone().add(ballVelocity.clone().normalize().multiplyScalar(5));
      secondaryCamera.lookAt(lookPos);
    } else {
      secondaryCamera.lookAt(new THREE.Vector3(0,0,0));
    }

    // Render reflection env map
    secondaryRenderer.setRenderTarget(secondaryCameraRenderTarget);
    secondaryRenderer.clear();
    let backgroundMesh2 = new THREE.Mesh(
      new THREE.PlaneGeometry(frustumWidth, frustumHeight),
      new THREE.MeshBasicMaterial({ map: rippleRenderTarget.texture })
    );
    backgroundMesh2.position.z = -0.1;
    scene.add(backgroundMesh2);
    secondaryRenderer.render(scene, secondaryCamera);
    scene.remove(backgroundMesh2);

    // Render to the secondary floating canvas
    secondaryRenderer.setRenderTarget(null);
    secondaryRenderer.clear();
    backgroundMesh2 = new THREE.Mesh(
      new THREE.PlaneGeometry(frustumWidth, frustumHeight),
      new THREE.MeshBasicMaterial({ map: rippleRenderTarget.texture })
    );
    backgroundMesh2.position.z = -0.1;
    scene.add(backgroundMesh2);
    secondaryRenderer.render(scene, secondaryCamera);
    scene.remove(backgroundMesh2);
  }
}

/* -----------------------------
 * Resize handling
 * -----------------------------
 */
function onWindowResize() {
  containerWidth = container.clientWidth;
  containerHeight = container.clientHeight;

  targets.length = 0;

  camera.aspect = containerWidth / containerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(containerWidth, containerHeight);

  const frustumHeight = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
  const frustumWidth = frustumHeight * camera.aspect;

  if (rippleUniforms) {
    rippleUniforms.u_resolution.value.set(containerWidth, containerHeight);
    rippleUniforms.u_frustumWidth.value = frustumWidth;
    rippleUniforms.u_frustumHeight.value = frustumHeight;
  }

  rippleRenderTarget.setSize(containerWidth, containerHeight);

  // Secondary camera remains square aspect for reflection usage
  if (secondaryCamera) {
    secondaryCamera.aspect = 1;
    secondaryCamera.updateProjectionMatrix();
  }

  // Adjust the secondary renderer size if desired
  if (secondaryRenderer && secondaryCanvas) {
    secondaryRenderer.setSize(300, 200);
  }
}
