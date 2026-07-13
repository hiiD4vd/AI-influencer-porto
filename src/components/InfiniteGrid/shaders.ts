// Vertex shader for grid tiles
export const tileVertex = /* glsl */`
  attribute vec3 position;
  attribute vec2 uv;
  uniform mat4 modelViewMatrix;
  uniform mat4 projectionMatrix;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

/**
 * Foreground tile shader.
 * On hover, the dark card background lerps toward uHoverColor (the
 * per-image dominant color), exactly replicating the phantom.land effect.
 * map.a = 1 means a painted pixel (image/text), 0 means empty card background.
 */
export const tileFrag = /* glsl */`
  precision highp float;
  uniform sampler2D map;
  uniform vec3 uHoverColor;
  uniform float uHoverProgress; // 0 = idle, 1 = fully hovered
  varying vec2 vUv;

  void main() {
    vec4 px = texture2D(map, vUv);

    // Base card dark background
    vec3 baseBg = vec3(0.063); // #101010

    // Lerp background toward the card's dominant image color on hover
    vec3 hoveredBg = mix(baseBg, uHoverColor, uHoverProgress);

    // Painted pixels (image / text / UI) sit on top of the background
    vec3 finalColor = mix(hoveredBg, px.rgb, px.a);

    gl_FragColor = vec4(finalColor, 1.0);
  }
`

// Legacy — kept for compatibility, no longer used
export const backgroundFrag = /* glsl */`
  precision highp float;
  uniform sampler2D map;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    vec4 color = texture2D(map, vUv);
    gl_FragColor = vec4(color.rgb, color.a * uOpacity);
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

// Post-processing fragment: barrel distortion + vignette
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
    p *= 1.0 + k * r2 + k * k * r2 * r2 * 0.3;
    return (p + 1.0) * 0.5;
  }

  void main() {
    vec2 uv = barrelDistort(vUv, uDistortion);
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
      gl_FragColor = vec4(0.04, 0.04, 0.04, 1.0);
      return;
    }
    vec4 color = texture2D(tMap, uv);

    // Smooth vignette
    vec2 pos = vUv - 0.5;
    float d = dot(pos, pos) * 4.0;
    float vig = smoothstep(0.8, uVignetteOffset + 0.1, d);
    color.rgb *= 1.0 - (1.0 - vig) * uVignetteDarkness;

    gl_FragColor = color;
  }
`
