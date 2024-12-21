import * as THREE from 'three';

let scene, camera, renderer;
let ball, ballVelocity;
let container, containerWidth, containerHeight;
const ballRadius = 0.5;
const effectRadius = 2.0; // New effect radius
const placementRipple = true;

let rippleScene, rippleCamera;
let quadScene, quadCamera;

let rippleRenderTarget, accumRenderTarget, tempRenderTarget;

let rippleUniforms;
let rippleMaterial;
let accumMaterial;

let globalTime = 0;
let dragging = false;
let startMousePos = null;
const moveTolerance = 0.01;

let timer = undefined;
let slowFactor = 0.99999;
// Target management
const targets = []; // { pos: THREE.Vector3, hue: number }
const tolerance = 0.5; // Distance tolerance to consider the target "reached"

// Added for debug click ripple
let debugRipple = false;
let debugRipplePos = new THREE.Vector2(0.5, 0.5);
let debugRippleStartTime = 0.0;
const debugRippleDuration = 1.0;
let clickHue = 0.0;

window.objects = [];
let proximalToObject = 0; // 0: None, 1: Overlapping, 2: Ball radius, 3: Effect radius
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


/**
 * Generates a random position within the visible frustum.
 *
 * @returns {THREE.Vector3} A random position vector.
 */
function getRandomPosition() {
  const frustumHeight = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
  const frustumWidth = frustumHeight * camera.aspect;

  const x = THREE.MathUtils.randFloatSpread(frustumWidth - 1); // Leave some margin
  const y = THREE.MathUtils.randFloatSpread(frustumHeight - 1);
  const z = 0; // Place attractors on the z=0 plane

  return new THREE.Vector3(x, y, z);
}
/*
function generateRandomTexture(size) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');

    const imageData = context.createImageData(size, size);
    for (let i = 0; i < imageData.data.length; i += 4) {
        const value = Math.random() * 255;
        imageData.data[i] = value;     // Red
        imageData.data[i + 1] = value; // Green
        imageData.data[i + 2] = value; // Blue
        imageData.data[i + 3] = 255;   // Alpha
    }
    context.putImageData(imageData, 0, 0);

    const texture = new THREE.Texture(canvas);
    texture.needsUpdate = true;
    return texture;
}

const ddMat1 = new THREE.PointsMaterial({
    color: 0xff0fff,
    size: 0.01,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.8,
    map: generateRandomTexture(64),
    blending: THREE.AdditiveBlending,
    depthWrite: false
});

// Create a buffer geometry for the particles
const particleGeometry = new THREE.BufferGeometry();
const positionClone = ddGeom.attributes.position.clone();

particleGeometry.setAttribute('position', positionClone);
*/

let currentMaterialIndex = 0;
const materials = [
  new THREE.MeshStandardMaterial({ color: 'hsl(200, 100%, 50%)', metalness: 0.9, roughness: 0.2 }),
  new THREE.MeshStandardMaterial({ color: 'hsl(100, 100%, 50%)', metalness: 0.5, roughness: 0.8 }),
  new THREE.MeshPhongMaterial({ color: 'hsl(300, 100%, 50%)', shininess: 30 }),
];

// Function to change material
function switchMaterial() {
  currentMaterialIndex = (currentMaterialIndex + 1) % materials.length;
  ball.material = materials[currentMaterialIndex];
}

export function start() {
    const container = init();
    animate();
    setupCSS();

    const rowDiv = document.createElement('div');
    rowDiv.classList.add('ui-row');
    container.appendChild(rowDiv);
    addUI(rowDiv);
}

function addUI(container) {
  const button1 = document.createElement('div');
  button1.classList.add('ui-button');
  button1.innerText = 'Switch Material';
  button1.addEventListener('click', switchMaterial);

  const button2 = document.createElement('div');
  button2.classList.add('ui-button');
  button2.innerText = 'Add Attractor';
  button2.addEventListener('click', () => {
    addAttractor()
  });

  [button1, button2].forEach((button) => {
    button.addEventListener('mouseover', (event) => {
      button.style.borderColor = '#888';
    });
    button.addEventListener('mouseout', (event) => {
      button.style.borderColor = '#ccc';
    });
  });

  container.appendChild(button1);
  container.appendChild(button2);
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
        line-height: 1.5;
        border-radius: 5px;
        user-select: none;
      }
    `;
    document.head.appendChild(buttonStyle);
}

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

    // Create the ball
    const geometry = new THREE.SphereGeometry(ballRadius, 32, 32);
    const ballMaterial = new THREE.MeshStandardMaterial({
        color: new THREE.Color('hsl(200, 100%, 50%)'),
        metalness: 0.9,
        roughness: 0.2
    });
    ball = new THREE.Mesh(geometry, ballMaterial);
    scene.add(ball);

    // Add a light
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(0, 0, 10);
    scene.add(light);

    // Initial slow velocity
    ballVelocity = new THREE.Vector3(0.04, 0, 0);

    // Add interaction using pointer events as well
    renderer.domElement.addEventListener('pointerdown', onDown, false);
    renderer.domElement.addEventListener('pointerup', onUp, false);
    renderer.domElement.addEventListener('pointermove', onMove, false);
    renderer.domElement.addEventListener('pointerout', onOut, false);
    // right click adds attractors if we're on a desktop
    renderer.domElement.addEventListener('contextmenu', onRightClick, false);


    createRippleScene();
    createAccumulationScene();

    rippleRenderTarget = new THREE.WebGLRenderTarget(containerWidth, containerHeight);
    rippleRenderTarget.texture.minFilter = THREE.LinearFilter;
    rippleRenderTarget.texture.magFilter = THREE.LinearFilter;

    accumRenderTarget = new THREE.WebGLRenderTarget(containerWidth, containerHeight);
    accumRenderTarget.texture.minFilter = THREE.LinearFilter;
    accumRenderTarget.texture.magFilter = THREE.LinearFilter;

    tempRenderTarget = new THREE.WebGLRenderTarget(containerWidth, containerHeight);
    tempRenderTarget.texture.minFilter = THREE.LinearFilter;
    tempRenderTarget.texture.magFilter = THREE.LinearFilter;

    // Initialize accumulation with black
    renderer.setRenderTarget(accumRenderTarget);
    renderer.clearColor();
    renderer.setRenderTarget(null);
    return container;
}

/**
 * Converts a mouse event's 2D screen coordinates to a 3D world position.
 *
 * @param {MouseEvent} event - The mouse event containing the click coordinates.
 * @returns {THREE.Vector3} The unprojected 3D position in world space.
 */
function getRectUnproject(event) {
  // Get the bounding rectangle of the renderer's DOM element
  const rect = renderer.domElement.getBoundingClientRect();

  // Normalize mouse coordinates to range [-1, 1] based on container size
  const x = (event.clientX - rect.left) / containerWidth * 2 - 1;
  const y = -(event.clientY - rect.top) / containerHeight * 2 + 1;

  // Create a vector with normalized device coordinates (NDC)
  const mousePos = new THREE.Vector3(x, y, 0);

  // Convert NDC to world coordinates using the camera's projection matrix
  mousePos.unproject(camera);

  // Return the unprojected world position
  return mousePos;
}

/**
 * Determines the 3D position in the scene where a click intersects the z=0 plane.
 *
 * @param {MouseEvent} event - The mouse event containing the click coordinates.
 * @returns {[THREE.Vector3, THREE.Vector3]} An array containing:
 *   - The intersection point on the z=0 plane.
 *   - The unprojected direction vector from the camera through the mouse position.
 */
function getClickPosition(event) {
  // Get the unprojected mouse position in world space
  const unprojected = getRectUnproject(event);

  // Calculate the direction vector from the camera to the unprojected point
  const dir = unprojected.sub(camera.position).normalize();

  // Compute the distance to intersect with the z=0 plane
  const distance = -camera.position.z / dir.z;

  // Calculate the exact intersection point on the z=0 plane
  const intersectionPoint = camera.position.clone().add(dir.multiplyScalar(distance));

  // Return the intersection point and the direction vector
  return [intersectionPoint, unprojected];
}


function makeRipple(mousePos) {
    // Convert mousePos to normalized UV coordinates (0 to 1)
    const frustumHeight = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
    const frustumWidth = frustumHeight * camera.aspect;

    const x = (mousePos.x + frustumWidth / 2) / frustumWidth;
    const y = (mousePos.y + frustumHeight / 2) / frustumHeight;

    debugRipplePos.set(x, y);
    debugRippleStartTime = globalTime;
    debugRipple = true;
}

function onClick(event, amount) {
  // first click, init timer params
  if (timer === undefined) {
    slowFactor = 0.99;
    timer = null;
  }
  // random hue for each click
  clickHue = Math.random();
  // Determine click position relative to the ball
  const [pos, unprojected] = getClickPosition(event);
  makeRipple(pos);
  // Add the target to the queue if not right click
  if (event.button !== 2) {
    // addTarget(pos.clone(), hue = Math.random());
    targets.push({
      pos: pos.clone(),
      hue: Math.random() // Assign a random hue for the ripple
    });
  }
}

function onMove(event) {
  if (event.button == 2 || !startMousePos) {
    return
  }
  const [mousePos, unprojected] = getClickPosition(event);
  if (startMousePos && unprojected.sub(startMousePos).length() > moveTolerance) {
    dragging = true;
  }
  // buffer for drag
  if (!dragging)
    return;
  // set ball velocity to the direction of the mouse when dragging with left click
  ballVelocity = mousePos.clone().sub(ball.position).normalize().multiplyScalar(0.01 || 0.1);
  // sparkles here
}

function onDown(event) {
  // set mouse position to unprojected position
  startMousePos = getClickPosition(event)[1];
}
function onUp(event) {
  startMousePos = null;
  dragging = false;
  if (event.button === 2) {
    return;
  }
  onClick(event);
}
function onOut(event) {
  dragging = false;
}


// Create a dodecahedron on right click, up to max_attractors
function onRightClick(event) {
  event.stopPropagation();
  event.preventDefault();
  const [mousePos, unprojected] = getClickPosition(event);
  addAttractor(mousePos);
}

function addAttractor(pos = getRandomPosition()) {
  if (placementRipple)
    makeRipple(pos);
  if (attractorCount++ < max_attractors) {
    const newShape = new THREE.Mesh(ddGeom, ddMat.clone());
    newShape.name = "attractor";
    newShape.position.copy(pos);
    scene.add(newShape);
    objects.push(newShape);
  } else {
    // wrap around the index to move the first shape to the location
    objects[attractorCount % max_attractors].position.copy(pos);
  }
}

// check intersection of ball with objects
// todo make octree or something
function checkProximity() {
  proximalToObject = 0; // Reset
  for (const object of objects) {
      const dist = ball.position.distanceTo(object.position);
      const combinedRadius = object.geometry.boundingSphere.radius + ballRadius;

      if (dist < combinedRadius) {
          proximalToObject = 1; // Overlapping
          return;
      } else if (dist < combinedRadius + ballRadius) {
          proximalToObject = Math.max(proximalToObject, 2); // Within ball radius
      } else if (dist < combinedRadius + effectRadius) {
          proximalToObject = Math.max(proximalToObject, 3); // Within effect radius
      }
  }
}

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
        // Added for debug ripple
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

            // Debug ripple uniforms
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

                // Radial wave
                float radFreq = 10.0;
                float radSpeed = 2.0;
                float radialWave = sin(dist * radFreq - u_time * radSpeed);

                // Directional wave
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

                // Debug click ripple pattern
                if (u_debugRipple) {
                    float dt = u_time - u_debugRippleStartTime;
                    if (dt < 1.0) {
                        // Use vUv directly for debug ripple
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

function createAccumulationScene() {
    quadScene = new THREE.Scene();
    quadCamera = new THREE.OrthographicCamera(-1,1,1,-1,0,1);

    accumMaterial = new THREE.ShaderMaterial({
        uniforms: {
            u_oldAccum: { value: null },
            u_newRipple: { value: null },
            u_oldWeight: { value: 0.90 },
            u_newWeight: { value: 0.10 }
        },
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
            uniform sampler2D u_oldAccum;
            uniform sampler2D u_newRipple;
            uniform float u_oldWeight;
            uniform float u_newWeight;

            void main() {
                vec4 oldColor = texture2D(u_oldAccum, vUv);
                vec4 newColor = texture2D(u_newRipple, vUv);
                vec4 result = oldColor * u_oldWeight + newColor * u_newWeight;
                gl_FragColor = result;
            }
        `
    });

    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), accumMaterial);
    quadScene.add(quad);
}

function animate() {
    requestAnimationFrame(animate);

    // updates:
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

      // If the ball reaches the target, remove it from the queue
      if (dist <= tolerance) {
          targets.shift();
      } else {
          // Move the ball towards the current target
          ballVelocity = currentTarget.pos.clone().sub(ball.position).normalize().multiplyScalar(0.05);
      }
    } else {
      // start timer before ball stops
      if (timer === null) {
        console.log('settimeout')
        timer = setTimeout(() => {
          if (proximalToObject === 0) {
            console.log("Ball stopped");
            slowFactor = 0.95;
          }
          // once it finishes, independent of proximity, reset timer so we no longer create timesouts
          timer = undefined;
        }, 500);
      }
      if (proximalToObject > 2 || proximalToObject === 0) {
        ballVelocity.multiplyScalar(slowFactor); // Slow down the ball
      }
      // check if velocity magnitude is close to zero
      if (ballVelocity.lengthSq() < 0.00000001) {
        ballVelocity.set(0, 0, 0);
      }
    }

    // Bounce the ball off the walls
    const frustumHeight = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
    const frustumWidth = frustumHeight * camera.aspect;
    const radius = ballRadius;

    // Update ball velocity if it hits the wall
    if (ball.position.x + radius > frustumWidth / 2 || ball.position.x - radius < -frustumWidth / 2) {
        ballVelocity.x = -ballVelocity.x;
    }
    if (ball.position.y + radius > frustumHeight / 2 || ball.position.y - radius < -frustumHeight / 2) {
        ballVelocity.y = -ballVelocity.y;
    }

    // Clamp position
    ball.position.x = Math.max(-frustumWidth/2 + radius, Math.min(ball.position.x, frustumWidth/2 - radius));
    ball.position.y = Math.max(-frustumHeight/2 + radius, Math.min(ball.position.y, frustumHeight/2 - radius));

    // Update uniforms
    rippleUniforms.u_time.value = globalTime;
    rippleUniforms.u_ballPosition.value.set(ball.position.x, ball.position.y);
    rippleUniforms.u_frustumWidth.value = frustumWidth;
    rippleUniforms.u_frustumHeight.value = frustumHeight;

    let velDir = ballVelocity.clone().normalize();
    rippleUniforms.u_ballVelocityDir.value.set(velDir.x, velDir.y);

    // Update ball's metallic hue
    let hueShift = (0.2 * globalTime) % 1.0;
    let ballColor = new THREE.Color();
    ballColor.setHSL(hueShift, 1.0, 0.5);
    ball.material.color = ballColor;

    // Update debug ripple uniforms
    rippleUniforms.u_debugRipple.value = debugRipple;
    rippleUniforms.u_debugRipplePos.value.copy(debugRipplePos);
    rippleUniforms.u_debugRippleStartTime.value = debugRippleStartTime;
    rippleUniforms.u_clickHue.value = clickHue;

    // 1. Render current ripple pattern
    renderer.setRenderTarget(rippleRenderTarget);
    renderer.clearColor();
    renderer.render(rippleScene, rippleCamera);

    // 2. Accumulate
    accumMaterial.uniforms.u_oldAccum.value = accumRenderTarget.texture;
    accumMaterial.uniforms.u_newRipple.value = rippleRenderTarget.texture;

    renderer.setRenderTarget(tempRenderTarget);
    renderer.clearColor();
    renderer.render(quadScene, quadCamera);

    let swap = accumRenderTarget;
    accumRenderTarget = tempRenderTarget;
    tempRenderTarget = swap;

    // 3. Render accumulated pattern as background, then ball
    renderer.setRenderTarget(null);
    renderer.clearColor();

    let backgroundMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(frustumWidth, frustumHeight),
        new THREE.MeshBasicMaterial({ map: accumRenderTarget.texture })
    );
    backgroundMesh.position.z = -0.1;
    scene.add(backgroundMesh);

    renderer.render(scene, camera);
    scene.remove(backgroundMesh);

    // Disable debug ripple after its duration
    if (debugRipple && (globalTime - debugRippleStartTime > debugRippleDuration)) {
        debugRipple = false;
    }

    // Move 3d objects
    ball.position.add(ballVelocity);

    // for each object, apply slight rotation
    for (const object of objects) {
        object.rotation.y += 0.01;
    }

}

function onWindowResize() {
    containerWidth = container.clientWidth;
    containerHeight = container.clientHeight;
    // clear targets
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
    accumRenderTarget.setSize(containerWidth, containerHeight);
    tempRenderTarget.setSize(containerWidth, containerHeight);
}
