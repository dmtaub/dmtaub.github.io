// logo.js
// Example that creates an extruded "C" shape logo

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FloatingWindow } from 'floatingWindow';

let scene, camera, renderer, controls;
let logo, reflectiveSurface, backReflectiveSurface;
let container;
let floatingWindow;
let animationFrameId;
let textMesh, textCanvas, textContext, textTexture;
// get text from url hash location
let currentText = window.location.hash.slice(1).split(':')[1] || 'demo';

// Reflection rendering
let reflectionRenderTarget, reflectionCamera;

// For sphere morphing
let sphereGeometry, originalVertices = [];
let morphSpeed = 0.5; // Controls speed of morphing

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
    currentText || 'C Logo',
    div,
    { width: 400, height: 500, top: 100, left: 100 },
    null, // No title change handler
    {
      // Callbacks
      onClose: teardownScene,
      onMinimize: (isMinimized) => {
        // Pause animation when minimized, resume when maximized
        if (isMinimized) {
          cancelAnimationFrame(animationFrameId);
          animationFrameId = null;
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

  // Setup reflection render target
  reflectionRenderTarget = new THREE.WebGLRenderTarget(512, 512, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    encoding: THREE.sRGBEncoding
  });

  // Reflection camera
  reflectionCamera = new THREE.PerspectiveCamera(75, 1, 0.1, 100);
  reflectionCamera.position.set(0, 0, 5);

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

  if (backReflectiveSurface) {
    if (backReflectiveSurface.geometry) backReflectiveSurface.geometry.dispose();
    if (backReflectiveSurface.material) backReflectiveSurface.material.dispose();
    scene.remove(backReflectiveSurface);
  }

  if (textMesh && textMesh.geometry) textMesh.geometry.dispose();
  if (textMesh && textMesh.material) textMesh.material.dispose();
  if (textTexture) textTexture.dispose();

  if (reflectionRenderTarget) reflectionRenderTarget.dispose();

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
  backReflectiveSurface = null;
  textMesh = null;
  textCanvas = null;
  textContext = null;
  textTexture = null;
  reflectionRenderTarget = null;
  reflectionCamera = null;
  originalVertices = [];
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
  scene.position.set(0, 0.5, 0);

  // Create a morphing reflective surface
  createMorphingReflectiveSurface();
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
  textMesh.position.set(2.2, -2.2, 0.1);
  scene.add(textMesh);
}

/**
 * Creates a reflective surface that can morph between a flattened sphere and an oblong shape
 */
function createMorphingReflectiveSurface() {
  // Use a sphere geometry that we can deform
  // Use more segments for smoother morphing
  sphereGeometry = new THREE.SphereGeometry(0.75, 64, 32);

  // Flatten the sphere initially
  const vertices = sphereGeometry.attributes.position.array;
  for (let i = 0; i < vertices.length; i += 3) {
    // Store original vertices for morphing
    originalVertices.push(new THREE.Vector3(vertices[i], vertices[i+1], vertices[i+2]));
    // Flatten initial shape (compress z dimension)
    vertices[i+2] *= 0.1;
  }

  // Mark geometry for update
  sphereGeometry.attributes.position.needsUpdate = true;
  sphereGeometry.computeVertexNormals();

  // Create material that will use our render target as a texture
  const reflectiveMaterial = new THREE.MeshPhongMaterial({
    color: 0x222222,  // Darker base color for more contrast
    specular: 0xffffff,
    shininess: 200,   // Increased shininess
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.9,
    map: reflectionRenderTarget.texture,  // Use the render target texture
    emissive: 0x444444,  // Add slight emissive to enhance brightness
    emissiveMap: reflectionRenderTarget.texture  // Use same texture for emissive
  });

  // Create front reflective surface
  reflectiveSurface = new THREE.Mesh(sphereGeometry, reflectiveMaterial);
  reflectiveSurface.position.set(0, 0, 0);
  scene.add(reflectiveSurface);

  // Create back reflective surface
  backReflectiveSurface = new THREE.Mesh(sphereGeometry.clone(), reflectiveMaterial.clone());
  backReflectiveSurface.position.set(0, 0, -0.01);  // Slight offset to prevent z-fighting
  backReflectiveSurface.rotation.x = Math.PI;  // Flip to show the back side
  scene.add(backReflectiveSurface);
}

/**
 * Updates the morphing reflective surface shape
 */
function updateMorphingSurface(time) {
  if (!sphereGeometry || !reflectiveSurface || !backReflectiveSurface) return;

  const vertices = sphereGeometry.attributes.position.array;

  // Calculate morph factors using sine waves
  const oblongFactor = Math.sin(time * morphSpeed) * 0.5 + 0.5; // 0 to 1
  const flattenFactor = Math.cos(time * morphSpeed * 0.7) * 0.5 + 0.5; // 0 to 1, different phase

  // Update vertices
  for (let i = 0, j = 0; i < vertices.length; i += 3, j++) {
    const originalVertex = originalVertices[j];

    // Apply oblong deformation (stretch in x direction, squeeze in y)
    const stretchX = 1 + oblongFactor * 0.5;  // 1.0 to 1.5
    const squeezeY = 1 - oblongFactor * 0.3;  // 1.0 to 0.7

    // Apply flatten deformation (compress in z direction)
    const flattenZ = 0.1 + (1 - flattenFactor) * 0.9;  // 0.1 to 1.0

    // Apply all deformations to original vertex positions
    vertices[i] = originalVertex.x * stretchX;
    vertices[i+1] = originalVertex.y * squeezeY;
    vertices[i+2] = originalVertex.z * flattenZ;
  }

  // Mark geometry for update
  sphereGeometry.attributes.position.needsUpdate = true;
  sphereGeometry.computeVertexNormals();

  // Update back surface geometry as well
  backReflectiveSurface.geometry.attributes.position.array = sphereGeometry.attributes.position.array.slice();
  backReflectiveSurface.geometry.attributes.position.needsUpdate = true;
  backReflectiveSurface.geometry.computeVertexNormals();
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

  // Clear the canvas with transparent background instead of black
  textContext.clearRect(0, 0, textCanvas.width, textCanvas.height);

  // Optional: For debugging, you can see the canvas area
  // textContext.strokeStyle = 'rgba(255,0,0,0.2)';
  // textContext.strokeRect(0, 0, textCanvas.width, textCanvas.height);

  // Draw the text
  textContext.font = 'bold 36px Arial';
  textContext.fillStyle = 'white';
  textContext.textAlign = 'left';
  textContext.textBaseline = 'middle';
  textContext.fillText(text || 'demo', 20, textCanvas.height / 2);

  // Add a subtle glow effect for better visibility
  textContext.shadowColor = 'rgba(255, 255, 255, 0.7)';
  textContext.shadowBlur = 3;
  textContext.fillStyle = 'rgba(255, 255, 255, 0.9)';
  textContext.fillText(text || 'demo', 20, textCanvas.height / 2);

  // Reset shadow for future drawing
  textContext.shadowBlur = 0;

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

/**
 * Updates the reflection camera to create a realistic reflection effect
 */
function updateReflectionCamera() {
  if (!reflectionCamera || !logo || !reflectiveSurface) return;

  // Time-based oscillation to make the reflection more dynamic
  const time = Date.now() * 0.001;

  // Position the reflection camera to capture the logo from a good angle for reflection
  // Use a more dynamic offset that changes over time
  const offset = new THREE.Vector3(
    Math.sin(time * 0.2) * 0.5,
    Math.cos(time * 0.3) * 0.5,
    3 + Math.sin(time * 0.1) * 0.5
  );

  // Calculate a position that's slightly offset from the reflective surface's position
  // This creates an angle that looks like a realistic reflection
  reflectionCamera.position.copy(reflectiveSurface.position).add(offset);

  // Look at the logo from this position
  reflectionCamera.lookAt(logo.position);

  // Update the reflection camera's rotation based on the logo's rotation
  // This creates the illusion that the reflection is following the logo's movement
  reflectionCamera.rotation.z = -logo.rotation.y * 0.5;

  // Slightly change the field of view for more dynamic reflections
  reflectionCamera.fov = 75 + Math.sin(time * 0.5) * 5;
  reflectionCamera.updateProjectionMatrix();
}

function animate() {
  animationFrameId = requestAnimationFrame(animate);

  // Get current time for animations
  const time = Date.now() * 0.001;

  // Update morphing surface
  updateMorphingSurface(time);

  // Rotate logo with varying speed for more natural movement
  if (logo) {
    logo.rotation.y += 0.005;
    // Add slight wobble to the x rotation for more dynamics
    logo.rotation.x = Math.sin(time) * 0.05;
  }

  // Update reflection camera
  updateReflectionCamera();

  // First render the scene to the reflection render target
  if (renderer && scene && reflectionCamera) {
    // Make sure text isn't in the reflection
    if (textMesh) textMesh.visible = false;

    // Store original background
    const originalBackground = scene.background;

    // Use a gradient background for reflection to increase contrast
    const reflectionBackground = new THREE.Color(0x000000);
    scene.background = reflectionBackground;

    // Render to our reflection target
    renderer.setRenderTarget(reflectionRenderTarget);
    renderer.render(scene, reflectionCamera);

    // Reset for normal rendering
    scene.background = originalBackground;
    if (textMesh) textMesh.visible = true;
    renderer.setRenderTarget(null);
  }

  // Update controls
  controls.update();

  // Render main scene
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

  // Add morph speed slider
  const speedLabel = document.createElement('span');
  speedLabel.textContent = 'Morph:';
  speedLabel.style.color = 'white';
  speedLabel.style.marginRight = '5px';

  const speedSlider = document.createElement('input');
  speedSlider.type = 'range';
  speedSlider.min = '0.1';
  speedSlider.max = '2';
  speedSlider.step = '0.1';
  speedSlider.value = morphSpeed.toString();
  speedSlider.style.width = '80px';

  speedSlider.addEventListener('input', (e) => {
    morphSpeed = parseFloat(e.target.value);
  });

  const sliderContainer = document.createElement('div');
  sliderContainer.style.display = 'flex';
  sliderContainer.style.alignItems = 'center';
  sliderContainer.appendChild(speedLabel);
  sliderContainer.appendChild(speedSlider);

  controlPanel.appendChild(sliderContainer);

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