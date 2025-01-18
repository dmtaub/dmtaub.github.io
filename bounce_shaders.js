// bounce_shaders.js
// This file contains the ripple effect shader code and utility functions for updating it.

import * as THREE from 'three';

/**
 * Creates the ripple Scene, Orthographic camera, uniforms, and shader material.
 * @param {number} containerWidth Width of the main container.
 * @param {number} containerHeight Height of the main container.
 * @param {THREE.PerspectiveCamera} mainCamera For computing frustum sizes.
 */
export function createRippleScene(containerWidth, containerHeight, mainCamera) {
  const frustumHeight = 2 * Math.tan(THREE.MathUtils.degToRad(mainCamera.fov / 2)) * mainCamera.position.z;
  const frustumWidth = frustumHeight * mainCamera.aspect;

  // Scene and Orthographic camera for the ripple pass
  const rippleScene = new THREE.Scene();
  const rippleCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  // Basic uniform data
  const rippleUniforms = {
    u_time: { value: 0.0 },
    u_ballPosition: { value: new THREE.Vector2(0.0, 0.0) },
    u_ballVelocityDir: { value: new THREE.Vector2(1.0, 0.0) },
    u_resolution: { value: new THREE.Vector2(containerWidth, containerHeight) },
    u_frustumWidth: { value: frustumWidth },
    u_frustumHeight: { value: frustumHeight },
    // Debug ripple flags
    u_debugRipple: { value: false },
    u_debugRipplePos: { value: new THREE.Vector2(0.5, 0.5) },
    u_debugRippleStartTime: { value: 0.0 },
    u_clickHue: { value: 0.0 }
  };

  const rippleMaterial = new THREE.ShaderMaterial({
    uniforms: rippleUniforms,
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position, 1.0);
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

      uniform bool u_debugRipple;
      uniform vec2 u_debugRipplePos;
      uniform float u_debugRippleStartTime;
      uniform float u_clickHue;

      // Convert HSL to RGB
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
        // Convert vUv (0..1) to the same coordinate system as the main camera
        float scaledX = (vUv.x - 0.5) * u_frustumWidth;
        float scaledY = (vUv.y - 0.5) * u_frustumHeight;

        vec2 sceneCoords = vec2(scaledX, scaledY);
        vec2 relPos = sceneCoords - u_ballPosition;

        // Use the ball's velocity direction for wave orientation
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

        // Fade factors
        float behindFade = dLong < 0.0 ? 1.0 : 0.3;
        float distanceFade = exp(-dist * 0.2);
        float perpFade = exp(-abs(dPerp) * 0.5);
        float combinedFade = behindFade * distanceFade * perpFade;

        float combinedWave = ((radialWave + 1.0)*0.5) * ((dirWave + 1.0)*0.5) * combinedFade;

        // Base color shift
        float hue = mod(0.6 + 0.1 * u_time + 0.02 * dist, 1.0);
        vec3 rippleColor = hsl2rgb(vec3(hue, 0.8, 0.5));
        vec3 baseColor = vec3(0.0, 0.0, 0.05);
        vec3 finalColor = baseColor + rippleColor * combinedWave;

        // Debug ripple effect
        if (u_debugRipple) {
          float dt = u_time - u_debugRippleStartTime;
          if (dt < 1.0) {
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

  // Create a plane for the full-screen pass
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), rippleMaterial);
  rippleScene.add(plane);

  return {
    rippleScene,
    rippleCamera,
    rippleUniforms,
    rippleMaterial
  };
}

/**
 * Allows external code to update the ripple shader's uniforms cleanly.
 * Moves more logic here, so the main file can just pass relevant data.
 */
export function updateRippleShaderUniforms(rippleUniforms, {
  time,
  ballPosition,
  ballVelocityDir,
  frustumWidth,
  frustumHeight,
  debugRipple,
  debugRipplePos,
  debugRippleStartTime,
  clickHue
}) {
  if (!rippleUniforms) return;

  rippleUniforms.u_time.value = time;
  rippleUniforms.u_ballPosition.value.set(ballPosition.x, ballPosition.y);
  rippleUniforms.u_ballVelocityDir.value.set(ballVelocityDir.x, ballVelocityDir.y);
  rippleUniforms.u_frustumWidth.value = frustumWidth;
  rippleUniforms.u_frustumHeight.value = frustumHeight;

  rippleUniforms.u_debugRipple.value = debugRipple;
  rippleUniforms.u_debugRipplePos.value.copy(debugRipplePos);
  rippleUniforms.u_debugRippleStartTime.value = debugRippleStartTime;
  rippleUniforms.u_clickHue.value = clickHue;
}
