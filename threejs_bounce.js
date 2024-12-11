import * as THREE from 'three';

let scene, camera, renderer;
let ball, ballVelocity;
let container, containerWidth, containerHeight;
const ballRadius = 0.5;

let rippleScene, rippleCamera;
let quadScene, quadCamera;

let rippleRenderTarget, accumRenderTarget, tempRenderTarget;

let rippleUniforms;
let rippleMaterial;
let accumMaterial;

let globalTime = 0;
let dragging = false;

// Target management
const targets = []; // { pos: THREE.Vector3, hue: number }
const tolerance = 0.2; // Distance tolerance to consider the target "reached"

// Added for debug click ripple
let debugRipple = false;
let debugRipplePos = new THREE.Vector2(0.5, 0.5);
let debugRippleStartTime = 0.0;
const debugRippleDuration = 1.0;
let clickHue = 0.0;

export function start() {
    init();
    animate();
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
    ballVelocity = new THREE.Vector3(0.0, 0.01, 0);

    // Add interaction
    renderer.domElement.addEventListener('click', onClick, false);
    renderer.domElement.addEventListener('mousemove', onMove, false);
    renderer.domElement.addEventListener('mousedown', onDown, false);
    renderer.domElement.addEventListener('mouseup', onUp, false);
    renderer.domElement.addEventListener('mouseout', onOut, false);

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
}

function getRectUnproject(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  const x = (event.clientX - rect.left) / containerWidth * 2 - 1;
  const y = -(event.clientY - rect.top) / containerHeight * 2 + 1;
  const mousePos = new THREE.Vector3(x, y, 0);
  mousePos.unproject(camera);
  return mousePos;
}


function makeRipple(event, amount) {
    // Determine click position relative to the ball
    const mousePos = getRectUnproject(event);
    const dir = mousePos.sub(camera.position).normalize();
    const distance = -camera.position.z / dir.z;
    const pos = camera.position.clone().add(dir.multiplyScalar(distance));

    ballVelocity = pos.clone().sub(ball.position).normalize().multiplyScalar(amount || 0.1);

    // Debug ripple behavior
    // Map click position to normalized UV coordinates (0 to 1)
    const rect = renderer.domElement.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;

    debugRipplePos.set(x, 1.0 - y);
    debugRippleStartTime = globalTime;
    debugRipple = true;
    return pos;
}

function onClick(event, amount) {
  clickHue = Math.random();
  const pos = makeRipple(event,amount);
  // Add the target to the queue
  targets.push({
    pos: pos.clone(),
    hue: Math.random() // Assign a random hue for the ripple
  });
}

function onMove(event) {
  if (!dragging) return;
  makeRipple(event, 0.01);
}

function onDown(event) {
  dragging = true;
}
function onUp(event) {
  dragging = false;
}
function onOut(event) {
  dragging = false;
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
    globalTime += 0.01;
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
      // ballVelocity.set(0, 0, 0);
    }
    // Move the ball
    ball.position.add(ballVelocity);

    const frustumHeight = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
    const frustumWidth = frustumHeight * camera.aspect;
    const radius = ballRadius;

    // Bounce off walls
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
}

function onWindowResize() {
    containerWidth = container.clientWidth;
    containerHeight = container.clientHeight;

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
