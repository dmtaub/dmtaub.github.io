import * as THREE from 'three';
// import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
let scene, camera, renderer;
let ball, ballVelocity;
let container, containerWidth, containerHeight;
const ballRadius = 0.5;

export function start(){
    init();
    animate();
}

function init() {

    // Set up renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });

    // Set up scene
    scene = new THREE.Scene();


    // Set up camera
    container = document.querySelector('.interactive');
    containerWidth = container.clientWidth;
    containerHeight = container.clientHeight;
    // This camera has some skew issues:
    camera = new THREE.PerspectiveCamera(75, containerWidth / containerHeight, 0.1, 1000);
    camera.position.z = 5;
    // better would be:
    // camera = new THREE.OrthographicCamera(containerWidth / -2, containerWidth / 2, containerHeight / 2, containerHeight / -2, 1, 1000);
    // camera.position.z = 5;
    // might not be correct, so lets add controls that output the camera position
    // const controls = new OrbitControls(camera, renderer.domElement);
    // controls.addEventListener('change', () => {
    //     console.log(controls.zoom0);
    // });




    renderer.setSize(containerWidth, containerHeight);
    container.appendChild(renderer.domElement);

    // Handle window resize
    window.addEventListener('resize', onWindowResize, false);

    // Create a ball
    const geometry = new THREE.SphereGeometry(ballRadius, 32, 32);
    const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    ball = new THREE.Mesh(geometry, material);
    scene.add(ball);

    // Set initial velocity
    ballVelocity = new THREE.Vector3(0.05, 0.05, 0);
}

function animate() {
    requestAnimationFrame(animate);

    // Update ball position
    ball.position.add(ballVelocity);

    // Calculate the boundaries for collision detection
    const frustumHeight = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
    const frustumWidth = frustumHeight * camera.aspect;
    const ballRadius = 0.5;
    
    // Check for collisions with the container edges
    if (ball.position.x + ballRadius > frustumWidth / 2 || ball.position.x - ballRadius < -frustumWidth / 2) {
        ballVelocity.x = -ballVelocity.x;
    }
    if (ball.position.y + ballRadius > frustumHeight / 2 || ball.position.y - ballRadius < -frustumHeight / 2) {
        ballVelocity.y = -ballVelocity.y;
    }
    

    renderer.render(scene, camera);
}

function onWindowResize() {
    containerWidth = container.clientWidth;
    containerHeight = container.clientHeight;

    camera.aspect = containerWidth / containerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize(containerWidth, containerHeight);
}
