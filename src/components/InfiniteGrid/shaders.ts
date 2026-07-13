// Vertex shader for grid tiles with 3D parabolic displacement
export const tileVertex = /* glsl */`
  attribute vec3 position;
  attribute vec2 uv;
  uniform mat4 modelViewMatrix;
  uniform mat4 projectionMatrix;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    
    // Parabolic dome distortion: 
    // pushes vertices away along the Z axis the further they are from screen center.
    // This perfectly replicates the phantom.land curved screen effect without 2D fish-eye artifacts.
    float distSq = (mvPosition.x * mvPosition.x) + (mvPosition.y * mvPosition.y) * 0.5;
    mvPosition.z -= distSq * 0.08; 

    gl_Position = projectionMatrix * mvPosition;
  }
`

// Foreground tile: transparent bg, image + text sit on top
export const tileFrag = /* glsl */`
  precision highp float;
  uniform sampler2D map;
  varying vec2 vUv;

  void main() {
    vec4 px = texture2D(map, vUv);
    gl_FragColor = px;
  }
`

// Background tile: blurred image, fades in on hover
export const backgroundFrag = /* glsl */`
  precision highp float;
  uniform sampler2D map;
  uniform float uOpacity;
  varying vec2 vUv;

  void main() {
    vec4 color = texture2D(map, vUv);
    gl_FragColor = vec4(color.rgb, uOpacity);
  }
`

// Post-processing vertex (full-screen triangle)
export const postVertex = /* glsl */`
  attribute vec3 position;
  attribute vec2 uv;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`

// Post-processing: barrel distortion + vignette
export const postFrag = /* glsl */`
  precision highp float;
  uniform sampler2D tMap;
  uniform float uDistortion;
  uniform float uVignetteOffset;
  uniform float uVignetteDarkness;
  uniform vec2 uResolution;
  varying vec2 vUv;

  vec2 barrelDistort(vec2 uv, float k) {
    vec2 p = uv * 2.0 - 1.0;
    float r2 = dot(p, p);
    p *= 1.0 + k * r2 + k * k * r2 * r2 * 0.4;
    return (p + 1.0) * 0.5;
  }

  void main() {
    vec2 uv = barrelDistort(vUv, uDistortion);
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
      gl_FragColor = vec4(0.031, 0.031, 0.031, 1.0);
      return;
    }
    vec4 color = texture2D(tMap, uv);

    // Vignette
    vec2 pos = vUv - 0.5;
    float d = dot(pos, pos) * 4.0;
    float vig = smoothstep(0.75, uVignetteOffset + 0.1, d);
    color.rgb *= 1.0 - (1.0 - vig) * uVignetteDarkness;

    gl_FragColor = color;
  }
`
