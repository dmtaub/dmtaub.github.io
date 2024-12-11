import * as THREE from 'three';

let scene, camera, renderer;
let ball, ballVelocity;
let container, containerWidth, containerHeight;
const ballRadius = 0.5;

let ripplePlane, rippleUniforms;

export function start() {
    init();
    animate();
}

function init() {
    // Set up renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    scene = new THREE.Scene();

    // Set up container, camera, and sizing
    container = document.querySelector('.interactive');
    containerWidth = container.clientWidth;
    containerHeight = container.clientHeight;

    camera = new THREE.PerspectiveCamera(
        20,
        containerWidth / containerHeight,
        0.1,
        100
    );
    camera.position.z = 20;

    renderer.setSize(containerWidth, containerHeight);
    container.appendChild(renderer.domElement);

    window.addEventListener('resize', onWindowResize, false);

    // Create the ball
    const geometry = new THREE.SphereGeometry(ballRadius, 32, 32);
    const material = new THREE.MeshPhongMaterial({ color: 0x00ff00 });
    ball = new THREE.Mesh(geometry, material);
    scene.add(ball);

    // Add a light
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(0, 0, 10);
    scene.add(light);

    // Set initial velocity
    ballVelocity = new THREE.Vector3(0.05, 0.05, 0);

    // Add the ripple background
    addRippleBackground();
}

function addRippleBackground() {
    // Compute the visible width and height at the camera's current position
    const frustumHeight = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
    const frustumWidth = frustumHeight * camera.aspect;

    // Define uniforms for the ripple shader
    rippleUniforms = {
        u_time: { value: 0.0 },
        u_ballPosition: { value: new THREE.Vector2(0.0, 0.0) },
        u_resolution: { value: new THREE.Vector2(containerWidth, containerHeight) },
        u_frustumWidth: { value: frustumWidth },
        u_frustumHeight: { value: frustumHeight }
    };

    const rippleMaterial = new THREE.ShaderMaterial({
        uniforms: rippleUniforms,
        vertexShader: /* glsl */`
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
            }
        `,
        fragmentShader: /* glsl */`
            varying vec2 vUv;
            uniform float u_time;
            uniform vec2 u_ballPosition;
            uniform vec2 u_resolution;
            uniform float u_frustumWidth;
            uniform float u_frustumHeight;

            void main() {
                // Convert vUv (0 to 1) into scene coordinates (-frustum/2 to frustum/2)
                vec2 sceneCoords = vec2(
                    (vUv.x - 0.5) * u_frustumWidth,
                    (vUv.y - 0.5) * u_frustumHeight
                );

                // Distance from the current fragment to the ball position
                float dist = distance(sceneCoords, u_ballPosition);

                // Create a ripple pattern using a sine wave
                float wave = sin(dist * 20.0 - u_time * 5.0);

                // Use a smoothstep to create sharper bands
                float intensity = smoothstep(-0.1, 0.1, wave);

                // Colorful pattern that shifts over time
                // We can shift hue by using sin/cos patterns with different offsets
                vec3 color = vec3(
                    0.5 + 0.5 * sin(u_time + dist * 10.0),
                    0.5 + 0.5 * sin(u_time + dist * 10.0 + 2.0),
                    0.5 + 0.5 * sin(u_time + dist * 10.0 + 4.0)
                );

                color *= intensity;
                gl_FragColor = vec4(color, 1.0);
            }
        `
    });

    const planeGeometry = new THREE.PlaneGeometry(
        rippleUniforms.u_frustumWidth.value,
        rippleUniforms.u_frustumHeight.value
    );
    ripplePlane = new THREE.Mesh(planeGeometry, rippleMaterial);

    // Ensure the plane is behind the ball along the z-axis
    ripplePlane.position.z = -0.1;
    scene.add(ripplePlane);
}

function animate() {
    requestAnimationFrame(animate);

    // Update ball position
    ball.position.add(ballVelocity);

    // Calculate the visible boundary again for collision
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
    ball.position.x = Math.max(-frustumWidth / 2 + radius, Math.min(ball.position.x, frustumWidth / 2 - radius));
    ball.position.y = Math.max(-frustumHeight / 2 + radius, Math.min(ball.position.y, frustumHeight / 2 - radius));

    // Update shader uniforms
    rippleUniforms.u_time.value += 0.01;
    // The ballPosition uniform should match scene coordinates of the ball
    rippleUniforms.u_ballPosition.value.set(ball.position.x, ball.position.y);

    // Render the scene
    renderer.render(scene, camera);
}

function onWindowResize() {
    containerWidth = container.clientWidth;
    containerHeight = container.clientHeight;

    camera.aspect = containerWidth / containerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(containerWidth, containerHeight);

    // Update resolution uniform if needed
    if (rippleUniforms) {
        rippleUniforms.u_resolution.value.set(containerWidth, containerHeight);
        const frustumHeight = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
        const frustumWidth = frustumHeight * camera.aspect;
        rippleUniforms.u_frustumWidth.value = frustumWidth;
        rippleUniforms.u_frustumHeight.value = frustumHeight;
    }
}
