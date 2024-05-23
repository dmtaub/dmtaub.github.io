import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.164.0/build/three.module.js';

let scene, camera, renderer;
let ball, ballVelocity;
let windowWidth, windowHeight;

function init() {
    // Set up scene
    scene = new THREE.Scene();
    
    // Set up camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 5;
    
    // Set up renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);
    
    // Handle window resize
    window.addEventListener('resize', onWindowResize, false);
    windowWidth = window.innerWidth;
    windowHeight = window.innerHeight;
    
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
    
    // Check for collisions with the viewport edges
    if (ball.position.x + 0.5 > windowWidth / window.innerWidth * 2 - 1 || ball.position.x - 0.5 < -windowWidth / window.innerWidth * 2) {
        ballVelocity.x = -ballVelocity.x;
    }
    if (ball.position.y + 0.5 > windowHeight / window.innerHeight * 2 - 1 || ball.position.y - 0.5 < -windowHeight / window.innerHeight * 2) {
        ballVelocity.y = -ballVelocity.y;
    }
    
    renderer.render(scene, camera);
}

function onWindowResize() {
    windowWidth = window.innerWidth;
    windowHeight = window.innerHeight;
    
    camera.aspect = windowWidth / windowHeight;
    camera.updateProjectionMatrix();
    
    renderer.setSize(windowWidth, windowHeight);
}

document.addEventListener('DOMContentLoaded', () => {
    init();
    animate();
});
