// logo.js
// Example that creates an extruded "C" shape logo

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FloatingWindow } from 'floatingWindow';

let scene, camera, renderer, controls;
let logo;
let container;
let floatingWindow;

export function start() {
  // Create a floating window container instead of directly adding to body
  const canvas = document.createElement('canvas');
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  
  // Create a floating window with the canvas
  floatingWindow = new FloatingWindow(
    'C Logo',
    canvas,
    { width: 400, height: 400, top: 100, left: 100 }
  );
  
  container = canvas;
  
  init();
  animate();
  
  // Add color change button
  addColorButton();
}

function init() {
  // Scene setup
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x444444);
  
  // Camera setup
  camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000); // Use 1:1 aspect ratio
  camera.position.set(0, 0, 10);
  
  // Renderer setup
  renderer = new THREE.WebGLRenderer({ 
    canvas: container,
    antialias: true 
  });
  renderer.setSize(container.clientWidth, container.clientHeight);
  
  // Controls
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  
  // Lights
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);
  
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
  directionalLight.position.set(5, 5, 5);
  scene.add(directionalLight);
  
  createLogo();
  
  // Handle window resize
  window.addEventListener('resize', onWindowResize);
  
  // Add observer to handle container resize
  const resizeObserver = new ResizeObserver(() => {
    onContainerResize();
  });
  resizeObserver.observe(container);
}

function createLogo() {
  // Create a shape in the form of letter "C"
  const shape = new THREE.Shape();
  
  // Outer circle
  const outerRadius = 2;
  const startAngle = Math.PI * 0.25;
  const endAngle = Math.PI * 1.75;
  const arcPoints = 32;
  
  // Start at beginning of arc
  const startX = outerRadius * Math.cos(startAngle);
  const startY = outerRadius * Math.sin(startAngle);
  shape.moveTo(startX, startY);
  
  // Draw outer arc
  for (let i = 0; i <= arcPoints; i++) {
    const angle = startAngle + (endAngle - startAngle) * (i / arcPoints);
    const x = outerRadius * Math.cos(angle);
    const y = outerRadius * Math.sin(angle);
    shape.lineTo(x, y);
  }
  
  // Inner circle
  const innerRadius = 1.2;
  
  // Draw line to inner arc
  const endX = innerRadius * Math.cos(endAngle);
  const endY = innerRadius * Math.sin(endAngle);
  shape.lineTo(endX, endY);
  
  // Draw inner arc in reverse
  for (let i = arcPoints; i >= 0; i--) {
    const angle = startAngle + (endAngle - startAngle) * (i / arcPoints);
    const x = innerRadius * Math.cos(angle);
    const y = innerRadius * Math.sin(angle);
    shape.lineTo(x, y);
  }
  
  // Close the shape
  shape.closePath();
  
  // Extrusion settings
  const extrudeSettings = {
    steps: 2,
    depth: 0.5,
    bevelEnabled: true,
    bevelThickness: 0.2,
    bevelSize: 0.1,
    bevelSegments: 3
  };
  
  // Create geometry and material
  const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  const material = new THREE.MeshStandardMaterial({
    color: 0x2194ce,
    metalness: 0.3,
    roughness: 0.4,
  });
  
  // Create mesh
  logo = new THREE.Mesh(geometry, material);
  
  // Center the logo
  geometry.computeBoundingBox();
  const center = new THREE.Vector3();
  geometry.boundingBox.getCenter(center);
  geometry.translate(-center.x, -center.y, 0);
  
  // Add to scene
  scene.add(logo);
}

function onWindowResize() {
  onContainerResize();
}

function onContainerResize() {
  if (!container || !renderer) return;
  
  // Maintain the aspect ratio for the renderer and camera
  const width = container.clientWidth;
  const height = container.clientHeight;
  
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  
  renderer.setSize(width, height);
}

function animate() {
  requestAnimationFrame(animate);
  
  // Rotate logo
  if (logo) {
    logo.rotation.y += 0.005;
  }
  
  // Update controls
  controls.update();
  
  // Render
  renderer.render(scene, camera);
}

// Add UI button to change color
export function addColorButton() {
  const button = document.createElement('button');
  button.textContent = 'Change Color';
  button.style.position = 'absolute';
  button.style.bottom = '10px';
  button.style.right = '10px';
  button.style.padding = '8px 16px';
  button.style.background = '#555';
  button.style.color = 'white';
  button.style.border = 'none';
  button.style.borderRadius = '4px';
  button.style.cursor = 'pointer';
  
  button.addEventListener('click', () => {
    const hue = Math.random() * 360;
    const color = new THREE.Color(`hsl(${hue}, 70%, 50%)`);
    logo.material.color.set(color);
  });
  
  // Add button to the floating window container instead of the canvas
  if (floatingWindow && floatingWindow.container) {
    floatingWindow.container.appendChild(button);
  }
}

// Don't start automatically anymore
// Let the user call start() explicitly
// start();
// addColorButton(); 