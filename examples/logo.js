// logo.js
// Example that creates an extruded "C" shape logo

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FloatingWindow } from 'floatingWindow';

let scene, camera, renderer, controls;
let logo;
let container;
let floatingWindow;
let animationFrameId;

export function start() {
  // Create container
  container = document.createElement('div');
  container.className = 'interactive';
  container.style.width = '100%';
  container.style.height = '400px';
  container.style.position = 'relative';

  // Create the floating window with the container
  floatingWindow = new FloatingWindow(
    'C Logo',
    container,
    { width: 500, height: 500, top: 100, left: 100 },
    null, // No title change handler
    {
      // Callbacks
      onClose: teardownScene,
      onMinimize: (isMinimized) => {
        // Pause animation when minimized, resume when maximized
        if (isMinimized) {
          console.log('Window minimized');
          cancelAnimationFrame(animationFrameId);
        } else {
          console.log('Window opened');
          animate();
        }
      },
      onBeforeClose: () => {
        // You can return false here to prevent closing if needed
        console.log('Window is about to close');
        return true; // Allow closing
      },
      onOpen: (container) => {
        console.log('Window opened');
      }
    }
  );

  // Make sure the window is visible
  if (floatingWindow.container) {
    floatingWindow.container.style.display = 'block';
  }

  init();
  animate();
  addColorButton();
}

function init() {
  // Scene setup
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x444444);

  // Camera setup
  camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 1000);
  camera.position.set(0, 0, 10);

  // Renderer setup
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

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
}

/**
 * Clean up Three.js resources and remove event listeners
 */
function teardownScene() {
  console.log('Tearing down Three.js scene');

  // Stop animation loop
  cancelAnimationFrame(animationFrameId);

  // Remove event listeners
  window.removeEventListener('resize', onWindowResize);

  // Dispose of Three.js resources
  if (logo) {
    if (logo.geometry) logo.geometry.dispose();
    if (logo.material) {
      if (Array.isArray(logo.material)) {
        logo.material.forEach(material => material.dispose());
      } else {
        logo.material.dispose();
      }
    }
    scene.remove(logo);
  }

  // Dispose of renderer
  if (renderer) {
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
    renderer = null;
  }

  // Clear references
  scene = null;
  camera = null;
  controls = null;
  logo = null;

  console.log('Three.js resources cleaned up');
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
  if (!container || !renderer) return;

  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
}

function animate() {
  // Store the ID so we can cancel it later
  animationFrameId = requestAnimationFrame(animate);

  // Rotate logo
  if (logo) {
    logo.rotation.y += 0.005;
  }

  // Update controls
  controls.update();

  // Render
  if (renderer && scene && camera) {
    renderer.render(scene, camera);
  }
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
    if (logo && logo.material) {
      const hue = Math.random() * 360;
      const color = new THREE.Color(`hsl(${hue}, 70%, 50%)`);
      logo.material.color.set(color);
    }
  });

  // Add button to the container
  container.appendChild(button);
}

// Add a new button to manually close the window
export function addCloseButton() {
  if (!floatingWindow) return;

  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'Close Window';
  closeBtn.style.position = 'absolute';
  closeBtn.style.bottom = '10px';
  closeBtn.style.left = '10px';
  closeBtn.style.padding = '8px 16px';
  closeBtn.style.background = '#d55';
  closeBtn.style.color = 'white';
  closeBtn.style.border = 'none';
  closeBtn.style.borderRadius = '4px';
  closeBtn.style.cursor = 'pointer';

  closeBtn.addEventListener('click', () => {
    floatingWindow.close();
  });

  container.appendChild(closeBtn);
}

// Start automatically
start();