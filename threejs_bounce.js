import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.164.0/build/three.module.js';

let scene, camera, renderer;
let ball, ballVelocity;
let container, containerWidth, containerHeight;


export function start(){
    init();
    animate();
}

function init() {
    // Set up scene
    scene = new THREE.Scene();
    
    // Set up camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 5;
    
    // Set up renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    container = document.querySelector('.interactive');
    containerWidth = container.clientWidth;
    containerHeight = container.clientHeight;
    renderer.setSize(containerWidth, containerHeight);
    container.appendChild(renderer.domElement);
    
    // Handle window resize
    window.addEventListener('resize', onWindowResize, false);
    
    // Create a ball
    const geometry = new THREE.SphereGeometry(0.5, 32, 32);
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
    
    // Check for collisions with the container edges
    if (ball.position.x + 0.5 > containerWidth / window.innerWidth * 2 - 1 || ball.position.x - 0.5 < -containerWidth / window.innerWidth * 2) {
        ballVelocity.x = -ballVelocity.x;
    }
    if (ball.position.y + 0.5 > containerHeight / window.innerHeight * 2 - 1 || ball.position.y - 0.5 < -containerHeight / window.innerHeight * 2) {
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
