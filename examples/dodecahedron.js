// spinning dodecahedron in shift+draggable container
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';


// Create a movable div
const container = document.createElement('div');
container.style.position = 'absolute';
container.style.top = '50px';
container.style.left = '50px';
container.style.width = '400px';
container.style.height = '400px';
container.style.border = '1px solid black';
container.style.resize = 'both';
container.style.overflow = 'hidden';
container.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
document.body.appendChild(container);

// Setup the THREE.js scene
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(container.clientWidth, container.clientHeight);
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
camera.position.set(3, 3, 3);

const light = new THREE.PointLight(0xffffff, 1);
light.position.set(5, 5, 5);
scene.add(light);

// Add a debug material to the Dodecahedron
const geometry = new THREE.DodecahedronGeometry(1, 0);
const debugMaterial = new THREE.MeshNormalMaterial();
const dodecahedron = new THREE.Mesh(geometry, debugMaterial);
scene.add(dodecahedron);

// Add OrbitControls for camera interaction
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; // Smooth rotation
controls.dampingFactor = 0.05;

// Add draggable functionality when holding Shift
let isDragging = false, startX, startY, startLeft, startTop;
container.addEventListener('mousedown', (e) => {
    if (!e.shiftKey) return; // Only drag when Shift is held
    controls.enabled = false; // Disable OrbitControls
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    startLeft = parseInt(container.style.left, 10);
    startTop = parseInt(container.style.top, 10);
    e.stopPropagation(); // Prevent interaction with the canvas
});
document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    container.style.left = `${startLeft + e.clientX - startX}px`;
    container.style.top = `${startTop + e.clientY - startY}px`;
});
document.addEventListener('mouseup', () => {
    isDragging = false;
    controls.enabled = true; // Re-enable OrbitControls
});


// Handle window resizing
window.addEventListener('resize', () => {
    renderer.setSize(container.clientWidth, container.clientHeight);
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
});

// Animation loop
function animate() {
    requestAnimationFrame(animate);

    // Rotate the Dodecahedron
    dodecahedron.rotation.y += 0.01;

    // Update controls and render the scene
    controls.update();
    renderer.render(scene, camera);
}
animate();
