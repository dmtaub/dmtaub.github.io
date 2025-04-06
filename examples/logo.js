// logo.js
// Example that creates an extruded "C" shape logo

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FloatingWindow } from 'floatingWindow';

let scene, camera, renderer, controls;
let logo, reflectiveSurface;
let container;
let floatingWindow;
let animationFrameId;
let textMesh, textCanvas, textContext, textTexture;
// get text from url hash location
let currentText = window.location.hash.slice(1) || 'demo';

export function start() {
  // Create a floating window container instead of directly adding to body
  const canvas = document.createElement('canvas');
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  const div = document.createElement('div');
  div.style.width = '100%';
  div.style.height = '100%';
  div.appendChild(canvas);

  // Create a floating window with the canvas
  floatingWindow = new FloatingWindow(
    'C Logo',
    div,
    { width: 400, height: 400, top: 100, left: 100 },
    null, // No title change handler
    {
      // Callbacks
      onClose: teardownScene,
      onMinimize: (isMinimized) => {
        // Pause animation when minimized, resume when maximized
        if (isMinimized) {
          cancelAnimationFrame(animationFrameId);
        } else {
          animate();
        }
      }
    }
  );

  container = canvas;

  init();
  animate();

  // Add UI controls
  addControls(div);
}

function init() {
  // Scene setup
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000); // Black background

  // Camera setup
  camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000); // Use 1:1 aspect ratio
  camera.position.set(0, 0, 5);

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
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(5, 5, 5);
  scene.add(directionalLight);

  // Add point light for reflections
  const pointLight = new THREE.PointLight(0xffffff, 1);
  pointLight.position.set(0, 0, 3);
  scene.add(pointLight);

  createLogo();

  // Handle window resize
  window.addEventListener('resize', onWindowResize);

  // Add observer to handle container resize
  const resizeObserver = new ResizeObserver(() => {
    onContainerResize();
  });
  resizeObserver.observe(container);
}

/**
 * Clean up Three.js resources and remove event listeners
 */
function teardownScene() {
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

  if (reflectiveSurface) {
    if (reflectiveSurface.geometry) reflectiveSurface.geometry.dispose();
    if (reflectiveSurface.material) reflectiveSurface.material.dispose();
    scene.remove(reflectiveSurface);
  }

  if (textMesh && textMesh.geometry) textMesh.geometry.dispose();
  if (textMesh && textMesh.material) textMesh.material.dispose();
  if (textTexture) textTexture.dispose();

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
  reflectiveSurface = null;
  textMesh = null;
  textCanvas = null;
  textContext = null;
  textTexture = null;
}

function createLogo() {
  // Create a shape in the form of letter "C"
  const shape = new THREE.Shape();

  // Outer circle
  const outerRadius = 2;
  const startAngle = Math.PI * 0.25;
  const endAngle = Math.PI * 1.75;
  const arcPoints = 64; // More points for smoother wireframe

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

  // Extrusion settings - thinner for wireframe look
  const extrudeSettings = {
    steps: 1,
    depth: 0.2,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.05,
    bevelSegments: 2
  };

  // Create geometry and wireframe material
  const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  const wireframeMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    wireframe: true,
    transparent: true,
    opacity: 0.8
  });

  // Create mesh
  logo = new THREE.Mesh(geometry, wireframeMaterial);

  // Center the logo
  geometry.computeBoundingBox();
  const center = new THREE.Vector3();
  geometry.boundingBox.getCenter(center);
  geometry.translate(-center.x, -center.y, 0);

  // Add to scene
  scene.add(logo);

  // Create a reflective surface in the middle of the "C"
  const circleGeometry = new THREE.CircleGeometry(0.5, 32);
  const reflectiveMaterial = new THREE.MeshPhongMaterial({
    color: 0xffffff,
    specular: 0xffffff,
    shininess: 100,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.9
  });

  reflectiveSurface = new THREE.Mesh(circleGeometry, reflectiveMaterial);
  reflectiveSurface.position.set(0, 0, 0);
  scene.add(reflectiveSurface);

  // Add a white center dot
  const dotGeometry = new THREE.CircleGeometry(0.1, 16);
  const dotMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const dot = new THREE.Mesh(dotGeometry, dotMaterial);
  dot.position.set(0, 0, 0.05);
  scene.add(dot);

  // Create text canvas
  createTextCanvas();

  // Create text texture
  textTexture = new THREE.CanvasTexture(textCanvas);
  const textMaterial = new THREE.MeshBasicMaterial({
    map: textTexture,
    transparent: true,
    side: THREE.DoubleSide
  });

  const textGeometry = new THREE.PlaneGeometry(2, 0.5);
  textMesh = new THREE.Mesh(textGeometry, textMaterial);
  textMesh.position.set(0.8, 0, 0.1);
  scene.add(textMesh);
}

// Create and initialize the text canvas
function createTextCanvas() {
  textCanvas = document.createElement('canvas');
  textContext = textCanvas.getContext('2d');
  textCanvas.width = 256;
  textCanvas.height = 64;

  updateTextCanvas(currentText);
}

// Update the text canvas with new text
function updateTextCanvas(text) {
  if (!textContext) return;

  // Clear the canvas
  textContext.fillStyle = 'black';
  textContext.fillRect(0, 0, textCanvas.width, textCanvas.height);

  // Draw the text
  textContext.font = 'bold 36px Arial';
  textContext.fillStyle = 'white';
  textContext.textAlign = 'left';
  textContext.textBaseline = 'middle';
  textContext.fillText(text || 'demo', 20, textCanvas.height / 2);

  // Update the texture if it exists
  if (textTexture) {
    textTexture.needsUpdate = true;
  }
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
  animationFrameId = requestAnimationFrame(animate);

  // Rotate logo
  if (logo) {
    logo.rotation.y += 0.005;

    // Rotate reflective surface in opposite direction
    if (reflectiveSurface) {
      reflectiveSurface.rotation.y -= 0.002;
    }
  }

  // Update controls
  controls.update();

  // Render
  if (renderer && scene && camera) {
    renderer.render(scene, camera);
  }
}

// Add UI controls (color button and text input)
export function addControls(div) {
  // Create control panel container
  const controlPanel = document.createElement('div');
  controlPanel.style.position = 'absolute';
  controlPanel.style.bottom = '10px';
  controlPanel.style.right = '10px';
  controlPanel.style.display = 'flex';
  controlPanel.style.gap = '10px';
  controlPanel.style.alignItems = 'center';
  div.appendChild(controlPanel);

  // Text input
  const textInput = document.createElement('input');
  textInput.type = 'text';
  textInput.value = currentText;
  textInput.placeholder = 'Logo text';
  textInput.style.padding = '8px';
  textInput.style.borderRadius = '4px';
  textInput.style.border = 'none';
  textInput.style.background = '#333';
  textInput.style.color = 'white';
  textInput.style.width = '150px';

  // Update text when input changes
  textInput.addEventListener('input', (e) => {
    currentText = e.target.value;
    updateTextCanvas(currentText);
  });

  controlPanel.appendChild(textInput);

  // Color change button
  const button = document.createElement('button');
  button.textContent = 'Change Color';
  button.style.padding = '8px 16px';
  button.style.background = '#555';
  button.style.color = 'white';
  button.style.border = 'none';
  button.style.borderRadius = '4px';
  button.style.cursor = 'pointer';

  button.addEventListener('click', () => {
    if (logo && logo.material) {
      const hue = Math.random() * 360;
      const color = new THREE.Color(`hsl(${hue}, 100%, 70%)`);
      logo.material.color.set(color);
    }
  });

  controlPanel.appendChild(button);
}

// Start automatically
start();